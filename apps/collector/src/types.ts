// Shared between the collector and the web app (imported type-only by the web).

export const AGENTS = ["claude", "codex", "gemini", "qwen", "copilot", "kiro", "opencode"] as const;
export type AgentKind = (typeof AGENTS)[number];

/** What the character is visibly doing. */
export type Activity =
  | "read"
  | "search"
  | "write"
  | "shell"
  | "web"
  | "think"
  | "talk"
  | "plan"
  | "delegate"
  | "wait"
  | "idle"
  | "other";

export type EventKind =
  | "prompt" // user sent a message, a turn starts
  | "thinking"
  | "tool_start"
  | "tool_end"
  | "message" // agent wrote text
  | "waiting" // blocked on the user (permission / question)
  | "turn_end"
  | "session_end"
  | "meta"; // title/model/cwd only, no status change

/** Normalized event every adapter produces. */
export interface AgentEvent {
  /** Hostname of the machine whose logs produced this; set by the collector, not adapters. */
  machine?: string;
  agent: AgentKind;
  sessionId: string;
  kind: EventKind;
  ts: number;
  cwd?: string;
  tool?: string;
  activity?: Activity;
  detail?: string;
  parentId?: string;
  title?: string;
  model?: string;
  /** On tool_end: false when the tool call failed (non-zero exit, error result). */
  ok?: boolean;
}

export type SessionStatus = "working" | "waiting" | "idle";

export interface SessionState {
  key: string;
  machine: string;
  agent: AgentKind;
  sessionId: string;
  project: string;
  cwd?: string;
  status: SessionStatus;
  activity: Activity;
  detail?: string;
  tool?: string;
  title?: string;
  model?: string;
  parentKey?: string;
  toolCount: number;
  /** Failed tool calls, and whether the latest one succeeded. */
  failCount: number;
  lastOk?: boolean;
  /** Completed turns ("parts produced" in the factory view). */
  turns: number;
  startedAt: number;
  lastTs: number;
}

export interface FeedItem {
  id: number;
  key: string;
  machine: string;
  agent: AgentKind;
  project: string;
  kind: EventKind;
  activity?: Activity;
  tool?: string;
  detail?: string;
  ts: number;
}

export type ServerMessage =
  | { type: "snapshot"; sessions: SessionState[]; feed: FeedItem[] }
  | { type: "session"; session: SessionState }
  | { type: "remove"; key: string }
  | { type: "feed"; item: FeedItem }
  | { type: "replay"; vt: number; from: number; to: number; playing: boolean; speed: number; events: number };

/** Viewer → server controls for a replay connection (`/ws?replay=1`). */
export type ReplayCommand =
  | { cmd: "load"; from: number; to: number }
  | { cmd: "play" }
  | { cmd: "pause" }
  | { cmd: "speed"; speed: number }
  | { cmd: "seek"; t: number };

export interface HistoryExtent {
  first: number | null;
  last: number | null;
  count: number;
}

/** What a relay collector on another machine sends to the hub. */
export interface IngestBatch {
  machine: string;
  events: { e: AgentEvent; live: boolean }[];
}

export interface Stats {
  today: Partial<Record<AgentKind, number>>;
}
