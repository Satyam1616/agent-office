import type { Device, Tailnet } from "./tailnet";
import type { FeedItem, ServerMessage, SessionState } from "./types";

export type DeviceState = "connected" | "connecting" | "no-office" | "offline";

export interface DeviceStatus {
  name: string;
  dns: string;
  ip: string;
  os: string;
  state: DeviceState;
  sessions: number;
}

const FEED_SIZE = 60;
const RETRY_MS = 15_000;
/** A firewall that drops packets never refuses, so give up on a silent connect ourselves. */
const CONNECT_TIMEOUT_MS = 5000;
// Kept apart from the local store's ids (which count up from 1) so the UI can key on them.
let feedId = 1_000_000_000;

/** One device's office, followed over its `/ws?peer=1` stream. */
class Link {
  sessions = new Map<string, SessionState>();
  feed: FeedItem[] = [];
  state: DeviceState = "connecting";
  private ws?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private closed = false;

  constructor(
    readonly device: Device,
    private url: string,
    /** An incremental change to pass on to viewers. */
    private onMessage: (msg: ServerMessage) => void,
    /** This device's whole state was replaced; viewers need a fresh merged snapshot. */
    private onReset: () => void,
  ) {
    this.open();
  }

  private open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    let opened = false;
    const timeout = setTimeout(() => ws.close(), CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      opened = true;
      clearTimeout(timeout);
      this.state = "connected";
    };
    ws.onmessage = (ev) => {
      try {
        this.apply(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {}
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      // Never got in: nothing listening there (or sharing is off on that device).
      this.state = opened ? "connecting" : "no-office";
      this.drop();
      if (!this.closed) this.retry = setTimeout(() => this.open(), RETRY_MS);
    };
  }

  private apply(msg: ServerMessage) {
    switch (msg.type) {
      case "snapshot":
        this.drop();
        for (const s of msg.sessions) this.sessions.set(s.key, s);
        this.feed = msg.feed.map((f) => ({ ...f, id: ++feedId }));
        this.onReset();
        return;
      case "session":
        this.sessions.set(msg.session.key, msg.session);
        break;
      case "remove":
        this.sessions.delete(msg.key);
        break;
      case "feed": {
        const item = { ...msg.item, id: ++feedId };
        this.feed = [...this.feed.slice(-(FEED_SIZE - 1)), item];
        this.onMessage({ type: "feed", item });
        return;
      }
      default:
        return;
    }
    this.onMessage(msg);
  }

  /** Forget everything this device told us (it went away or is resending). */
  private drop() {
    for (const key of this.sessions.keys()) this.onMessage({ type: "remove", key });
    this.sessions.clear();
    this.feed = [];
  }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    this.ws?.close();
    this.drop();
  }
}

/**
 * Shows the agents of all your other devices: one link per online device of yours
 * on the tailnet. Devices only share their own sessions, so nothing loops back.
 */
export class Peers {
  private links = new Map<string, Link>();
  private enabled = false;

  constructor(
    private tailnet: Tailnet,
    private port: number,
    /** Sessions this collector has itself; those win over a device reporting the same one. */
    private isLocal: (key: string) => boolean,
    private broadcast: (msg: ServerMessage) => void,
    private resnapshot: () => void,
  ) {}

  set(enabled: boolean) {
    this.enabled = enabled;
    this.sync();
  }

  /** Follow devices that came online, let go of the ones that left. */
  sync() {
    const want = this.enabled ? this.tailnet.list().filter((d) => d.online) : [];
    const ips = new Set(want.map((d) => d.ip));
    for (const [ip, link] of this.links)
      if (!ips.has(ip)) {
        link.close();
        this.links.delete(ip);
      }
    for (const d of want) {
      if (this.links.has(d.ip)) continue;
      const url = `ws://${d.ip}:${this.port}/ws?peer=1`;
      this.links.set(d.ip, new Link(d, url, (msg) => this.relay(msg), this.resnapshot));
    }
  }

  private relay(msg: ServerMessage) {
    if (msg.type === "session" && this.isLocal(msg.session.key)) return;
    if (msg.type === "remove" && this.isLocal(msg.key)) return;
    if (msg.type === "feed" && this.isLocal(msg.item.key)) return;
    this.broadcast(msg);
  }

  sessions(): SessionState[] {
    return [...this.links.values()].flatMap((l) => [...l.sessions.values()]).filter((s) => !this.isLocal(s.key));
  }

  feed(): FeedItem[] {
    return [...this.links.values()].flatMap((l) => l.feed).filter((f) => !this.isLocal(f.key));
  }

  status(): DeviceStatus[] {
    return this.tailnet.list().map((d) => {
      const link = this.links.get(d.ip);
      return {
        name: d.name,
        dns: d.dns,
        ip: d.ip,
        os: d.os,
        state: !d.online ? "offline" : (link?.state ?? "connecting"),
        sessions: link ? link.sessions.size : 0,
      };
    });
  }
}
