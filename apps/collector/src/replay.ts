import type { History } from "./history";
import { SessionStore } from "./state";
import type { AgentEvent, ReplayCommand, ServerMessage } from "./types";

const TICK_MS = 100;
const STATUS_EVERY = 3; // ticks between progress updates
const DEFAULT_SPEED = 30;

/**
 * One viewer's private playback of recorded events. Runs the same reducer as
 * the live office on a virtual clock, so the scene can't tell the difference.
 */
export class ReplayPlayer {
  private events: AgentEvent[] = [];
  private idx = 0;
  private vt = 0;
  private from = 0;
  private to = 0;
  private speed = DEFAULT_SPEED;
  private playing = false;
  private quiet = false;
  private ticks = 0;
  private store!: SessionStore;
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private history: History,
    private machine: string,
    private send: (msg: ServerMessage) => void,
  ) {
    const { first, last } = history.extent();
    const end = last ?? Date.now();
    this.load(Math.max(first ?? end, end - 60 * 60_000), end);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
  }

  command(cmd: ReplayCommand) {
    switch (cmd.cmd) {
      case "load":
        this.load(cmd.from, cmd.to);
        break;
      case "play":
        if (this.vt >= this.to) this.seek(this.from);
        this.playing = true;
        break;
      case "pause":
        this.playing = false;
        break;
      case "speed":
        this.speed = Math.max(1, Math.min(3600, cmd.speed));
        break;
      case "seek":
        this.seek(cmd.t);
        break;
    }
    this.status();
  }

  private load(from: number, to: number) {
    this.from = Math.min(from, to);
    this.to = Math.max(from, to);
    this.events = this.history.range(this.from, this.to);
    this.playing = false;
    this.seek(this.from);
  }

  /** Rebuilds state from the start of the range up to `t` without streaming every step. */
  private seek(t: number) {
    this.vt = this.from;
    this.store = new SessionStore({
      machine: this.machine,
      clock: () => this.vt,
      autoSweep: false,
      broadcast: (msg) => {
        if (!this.quiet) this.send(msg);
      },
    });
    this.idx = 0;
    this.quiet = true;
    this.advanceTo(Math.max(this.from, Math.min(this.to, t)));
    this.quiet = false;
    this.send(this.store.snapshot());
    this.status();
  }

  private advanceTo(t: number) {
    while (this.idx < this.events.length && this.events[this.idx]!.ts <= t) {
      const e = this.events[this.idx++]!;
      this.vt = e.ts;
      this.store.apply(e, true);
    }
    this.vt = t;
    this.store.sweep();
  }

  private tick() {
    if (!this.playing) return;
    this.advanceTo(Math.min(this.to, this.vt + TICK_MS * this.speed));
    if (this.vt >= this.to) this.playing = false;
    if (++this.ticks % STATUS_EVERY === 0 || !this.playing) this.status();
  }

  private status() {
    this.send({
      type: "replay",
      vt: this.vt,
      from: this.from,
      to: this.to,
      playing: this.playing,
      speed: this.speed,
      events: this.events.length,
    });
  }
}
