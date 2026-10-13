import type { SessionState } from "./agents";
import { CREATES_FILE, roleFor } from "./roles";
import { useOffice } from "./store";

// Machine loops are real CC0 recordings (public/sounds/README.md); everything else is
// synthesized with Web Audio. If a recording fails to load, its synth stand-in plays instead.

type Machine = "cnc" | "laser" | "stepper";
const SAMPLES: Record<Machine, string> = {
  cnc: "/sounds/cnc.mp3",
  laser: "/sounds/laser.mp3",
  stepper: "/sounds/stepper.mp3",
};

const PREF_KEY = "agent-office-sound";
const MIN_GAP_MS = 150; // per one-shot kind, so a replay seek doesn't fire 40 chimes

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private hum!: GainNode; // CNC spindles
  private buzz!: GainNode; // laser cutters
  private rumble!: GainNode; // conveyors
  private servo!: GainNode; // QC gantry moving the probe
  private samples: Partial<Record<Machine, GainNode>> = {};
  private typingRate = 0; // keystrokes per second (office)
  private probing = 0; // QC stations measuring right now
  private lastShot = new Map<string, number>();
  private prev = new Map<string, SessionState>();
  enabled = false;
  private listeners = new Set<() => void>();

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Must run from a user gesture (browser autoplay rules). */
  async enable() {
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this.enabled = true;
    localStorage.setItem(PREF_KEY, "on");
    this.listeners.forEach((fn) => fn());
    this.update(useOffice.getState().sessions);
  }

  disable() {
    this.enabled = false;
    localStorage.setItem(PREF_KEY, "off");
    this.listeners.forEach((fn) => fn());
    void this.ctx?.suspend();
  }

  wantsOn() {
    return localStorage.getItem(PREF_KEY) === "on";
  }

  private build() {
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.hum = this.loop("sawtooth", 98, { type: "lowpass", freq: 500 }, 9, 6);
    this.buzz = this.loop("square", 233, { type: "bandpass", freq: 1900 }, 31, 30);
    this.rumble = this.noiseLoop(140);
    this.servo = this.loop("triangle", 380, { type: "lowpass", freq: 900 }, 0.9, 60);
    this.scheduleTyping();
    this.scheduleProbe();
    for (const m of Object.keys(SAMPLES) as Machine[]) void this.loadSample(m);
  }

  /** Streams a recording in a seamless loop at zero volume until its machine runs. */
  private async loadSample(machine: Machine) {
    const ctx = this.ctx!;
    try {
      const res = await fetch(SAMPLES[machine]);
      if (!res.ok) throw new Error(`${res.status}`);
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(this.master);
      // Random start so several sessions' loops don't sound phase-locked on reload.
      src.start(0, Math.random() * buffer.duration);
      this.samples[machine] = g;
      this.update(useOffice.getState().sessions);
    } catch (err) {
      console.warn(`[sound] ${machine} recording unavailable, using synth`, err);
    }
  }

  /** A droning oscillator with wobble, faded in/out via its returned gain. */
  private loop(type: OscillatorType, freq: number, filter: { type: BiquadFilterType; freq: number }, lfoHz: number, lfoDepth: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = lfoDepth;
    lfo.connect(lfoGain).connect(osc.frequency);
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    osc.connect(f).connect(g).connect(this.master);
    osc.start();
    lfo.start();
    return g;
  }

  private noiseLoop(lowpass: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  /** Office keyboard: short filtered noise clicks at a rate set by how many are typing. */
  private scheduleTyping() {
    const next = () => {
      if (this.enabled && this.typingRate > 0) this.click();
      const rate = Math.max(this.typingRate, 0.5);
      setTimeout(next, (1000 / rate) * (0.5 + Math.random()));
    };
    next();
  }

  private click() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 2500 + Math.random() * 2000;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.04);
  }

  /** QC probe: a tick and a short confirmation beep each time it touches the part. */
  private scheduleProbe() {
    const next = () => {
      if (this.enabled && this.probing > 0) {
        this.tick();
        this.tone(2637, 0.02, 0.07, "sine", 0.06);
      }
      // About as often as the animated probe dips (every ~1.4s), faster with more stations.
      setTimeout(next, (1400 / Math.min(3, Math.max(1, this.probing))) * (0.8 + Math.random() * 0.4));
    };
    next();
  }

  private tick() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 4200;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.02);
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.2) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private shot(kind: string, play: () => void) {
    const now = performance.now();
    if (now - (this.lastShot.get(kind) ?? 0) < MIN_GAP_MS) return;
    this.lastShot.set(kind, now);
    play();
  }

  private ding = () => {
    this.tone(1046, 0, 0.35, "sine", 0.18);
    this.tone(1568, 0.09, 0.5, "sine", 0.15);
  };
  private fail = () => {
    this.tone(150, 0, 0.28, "square", 0.12);
    this.tone(110, 0.14, 0.3, "square", 0.12);
  };
  private alarm = () => [0, 0.18, 0.36].forEach((t) => this.tone(988, t, 0.12, "triangle", 0.14));
  private arrive = () => {
    this.tone(659, 0, 0.18, "triangle", 0.12);
    this.tone(880, 0.12, 0.25, "triangle", 0.12);
  };
  /** QC verdict "pass": two quick rising beeps (a failure already sounds the buzzer). */
  private pass = () => {
    this.tone(1760, 0, 0.08, "square", 0.05);
    this.tone(2349, 0.1, 0.14, "square", 0.05);
  };
  private prompt = () => this.tone(523, 0, 0.12, "sine", 0.1);

  /** Diff the office against the last frame: drones follow activity, one-shots follow transitions. */
  update(sessions: Record<string, SessionState>) {
    if (!this.ctx) return;
    const factory = useOffice.getState().theme === "factory";
    const list = Object.values(sessions);
    const busy = list.filter((s) => s.status !== "idle");
    const roles = busy.map((s) => roleFor(s));
    const count = (r: string) => roles.filter((x) => x === r).length;
    // The coder station mills edits and 3D-prints brand-new files.
    const printing = busy.filter((s) => roleFor(s) === "coder" && CREATES_FILE.test(s.tool ?? "")).length;
    const milling = count("coder") - printing;

    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(this.enabled ? v : 0, t, 0.3);
    // One machine at full level, a little louder for each extra one running (max 3).
    const level = (n: number) => (n ? 0.55 + 0.2 * (Math.min(3, n) - 1) : 0);
    const machine = (m: Machine, n: number, synth: GainNode | null, synthPer: number) => {
      const real = this.samples[m];
      if (real) set(real, factory ? level(n) : 0);
      if (synth) set(synth, factory && !real ? synthPer * Math.min(3, n) : 0);
    };
    machine("cnc", milling + (this.samples.stepper ? 0 : printing), this.hum, 0.05);
    machine("stepper", printing, null, 0);
    machine("laser", count("bash"), this.buzz, 0.025);
    set(this.rumble, factory && busy.length ? 0.06 : 0);
    set(this.servo, factory ? 0.012 * Math.min(3, count("reviewer")) : 0);
    this.probing = factory ? count("reviewer") : 0;
    this.typingRate = factory ? 0 : 6 * Math.min(4, count("coder") + count("bash"));

    if (this.enabled) {
      for (const s of list) {
        const p = this.prev.get(s.key);
        if (!p) this.shot("arrive", this.arrive);
        else {
          if (s.turns > p.turns) this.shot("ding", this.ding);
          if (s.failCount > p.failCount) this.shot("fail", this.fail);
          if (s.status === "waiting" && p.status !== "waiting") this.shot("alarm", this.alarm);
          if (p.status === "idle" && s.status === "working") this.shot("prompt", this.prompt);
          // A check finished cleanly: the QC station moved on (next tool, other role or turn end).
          const checked = p.status !== "idle" && roleFor(p) === "reviewer";
          const movedOn = s.toolCount > p.toolCount || roleFor(s) !== "reviewer" || s.status === "idle";
          if (factory && checked && movedOn && s.failCount === p.failCount && s.lastOk !== false)
            this.shot("pass", this.pass);
        }
      }
    }
    this.prev = new Map(list.map((s) => [s.key, s]));
  }
}

export const sound = new SoundEngine();
useOffice.subscribe((s, prev) => {
  if (s.sessions !== prev.sessions || s.theme !== prev.theme) sound.update(s.sessions);
});

// Remembered "on" still needs a gesture before audio may start.
if (sound.wantsOn()) window.addEventListener("pointerdown", () => void sound.enable(), { once: true });
