import type { AgentEvent, FeedItem, ServerMessage, SessionState } from "./types";

const basename = (p: string) => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() || p;

export const SESSION_TTL_MS = 20 * 60_000;
const STALE_MS = 3 * 60_000;
const FEED_SIZE = 60;
const FEED_KINDS = new Set(["prompt", "tool_start", "waiting", "turn_end"]);
/** Kinds worth keeping for replay (meta rides along on the others via cwd/title/model). */
const RECORD_KINDS = new Set(["prompt", "thinking", "tool_start", "tool_end", "message", "waiting", "turn_end", "session_end", "meta"]);

const keyOf = (machine: string, agent: string, id: string) => `${machine}:${agent}:${id}`;

export interface StoreOptions {
  /** Hostname used for events that don't carry one (this machine's own logs). */
  machine: string;
  broadcast: (msg: ServerMessage) => void;
  /** Injected so replay can run the same reducer on a virtual clock. */
  clock?: () => number;
  /** Called for every live event, e.g. to persist it. */
  onLive?: (e: AgentEvent & { machine: string }, ts: number, project: string) => void;
  /** Sweep idle/leaving sessions on a real timer (off for replay, which sweeps per tick). */
  autoSweep?: boolean;
}

/** Folds normalized events into live per-session state and broadcasts changes. */
export class SessionStore {
  private sessions = new Map<string, SessionState>();
  private pendingMeta = new Map<string, Partial<SessionState>>();
  private feed: FeedItem[] = [];
  private feedId = 0;
  private clock: () => number;

  constructor(private opts: StoreOptions) {
    this.clock = opts.clock ?? Date.now;
    if (opts.autoSweep ?? true) setInterval(() => this.sweep(), 5000);
  }

  has(key: string): boolean {
    return this.sessions.has(key);
  }

  snapshot(): Extract<ServerMessage, { type: "snapshot" }> {
    return { type: "snapshot", sessions: [...this.sessions.values()], feed: this.feed };
  }

  apply(e: AgentEvent, live: boolean) {
    const now = this.clock();
    // Live lines are happening right now, whatever the log says.
    const ts = live ? now : e.ts;
    const machine = e.machine ?? this.opts.machine;
    const key = keyOf(machine, e.agent, e.sessionId);
    let s = this.sessions.get(key);

    const meta: Partial<SessionState> = {};
    if (e.title) meta.title = e.title;
    if (e.model) meta.model = e.model;
    if (e.cwd) Object.assign(meta, { cwd: e.cwd, project: basename(e.cwd) });

    if (live && RECORD_KINDS.has(e.kind))
      this.opts.onLive?.({ ...e, machine }, ts, meta.project ?? s?.project ?? "unknown");

    if (!s) {
      if (e.kind === "meta") {
        this.pendingMeta.set(key, { ...this.pendingMeta.get(key), ...meta });
        return;
      }
      if (e.kind === "session_end" || now - ts > SESSION_TTL_MS) return;
      s = {
        key,
        machine,
        agent: e.agent,
        sessionId: e.sessionId,
        project: "unknown",
        status: "working",
        activity: "think",
        toolCount: 0,
        failCount: 0,
        turns: 0,
        startedAt: ts,
        lastTs: ts,
        parentKey: e.parentId ? keyOf(machine, e.agent, e.parentId) : undefined,
        ...this.pendingMeta.get(key),
      };
      this.pendingMeta.delete(key);
      this.sessions.set(key, s);
    }

    Object.assign(s, meta);
    s.lastTs = Math.max(s.lastTs, ts);

    switch (e.kind) {
      case "prompt":
        Object.assign(s, { status: "working", activity: "think", detail: e.detail, tool: undefined });
        break;
      case "thinking":
        Object.assign(s, { status: "working", activity: "think", tool: undefined });
        break;
      case "tool_start":
        Object.assign(s, {
          status: e.activity === "wait" ? "waiting" : "working",
          activity: e.activity ?? "other",
          tool: e.tool,
          detail: e.detail,
        });
        s.toolCount++;
        break;
      case "tool_end":
        if (s.status === "waiting") s.status = "working";
        if (e.ok !== undefined) s.lastOk = e.ok;
        if (e.ok === false) s.failCount++;
        break;
      case "message":
        Object.assign(s, { status: "working", activity: "talk", detail: e.detail, tool: undefined });
        break;
      case "waiting":
        Object.assign(s, { status: "waiting", activity: "wait", detail: e.detail ?? s.detail });
        break;
      case "turn_end":
        // Some agents log several end markers per turn; count the transition only.
        if (s.status !== "idle") s.turns++;
        Object.assign(s, { status: "idle", activity: "idle", tool: undefined });
        break;
      case "session_end":
        this.sessions.delete(key);
        this.opts.broadcast({ type: "remove", key });
        return;
    }

    this.opts.broadcast({ type: "session", session: s });
    if (live && FEED_KINDS.has(e.kind)) this.pushFeed(s, e, ts);
  }

  private pushFeed(s: SessionState, e: AgentEvent, ts: number) {
    const item: FeedItem = {
      id: ++this.feedId,
      key: s.key,
      machine: s.machine,
      agent: s.agent,
      project: s.project,
      kind: e.kind,
      activity: e.activity,
      tool: e.tool,
      detail: e.detail,
      ts,
    };
    this.feed = [...this.feed.slice(-(FEED_SIZE - 1)), item];
    this.opts.broadcast({ type: "feed", item });
  }

  /** Sessions with no log activity go idle, then leave the office. */
  sweep() {
    const now = this.clock();
    for (const s of this.sessions.values()) {
      const quiet = now - s.lastTs;
      if (quiet > SESSION_TTL_MS) {
        this.sessions.delete(s.key);
        this.opts.broadcast({ type: "remove", key: s.key });
      } else if (quiet > STALE_MS && s.status === "working") {
        Object.assign(s, { status: "idle", activity: "idle", tool: undefined });
        this.opts.broadcast({ type: "session", session: s });
      }
    }
  }
}
