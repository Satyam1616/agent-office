import type { Activity, AgentKind } from "../../collector/src/types";

export type { Activity, AgentKind, FeedItem, ServerMessage, SessionState, SessionStatus, Stats } from "../../collector/src/types";
export { AGENTS } from "../../collector/src/types";

export const AGENT_META: Record<AgentKind, { label: string; color: string }> = {
  claude: { label: "Claude Code", color: "#d97757" },
  codex: { label: "Codex", color: "#10a37f" },
  gemini: { label: "Gemini CLI", color: "#4285f4" },
  qwen: { label: "Qwen Code", color: "#615ced" },
  copilot: { label: "Copilot CLI", color: "#c9d1d9" },
  kiro: { label: "Kiro", color: "#b44dff" },
  opencode: { label: "OpenCode", color: "#f5c542" },
};

/** Icon, label and monitor glow per activity. */
export const ACTIVITY_META: Record<Activity, { icon: string; label: string; screen: string }> = {
  read: { icon: "📖", label: "reading", screen: "#e8e8e8" },
  search: { icon: "🔍", label: "searching", screen: "#ffd166" },
  write: { icon: "⌨️", label: "coding", screen: "#4cc9f0" },
  shell: { icon: "🖥️", label: "terminal", screen: "#39ff88" },
  web: { icon: "🌐", label: "browsing", screen: "#b388ff" },
  think: { icon: "💭", label: "thinking", screen: "#7f8fa6" },
  talk: { icon: "💬", label: "talking", screen: "#ffffff" },
  plan: { icon: "📋", label: "planning", screen: "#ffb74d" },
  delegate: { icon: "🧑‍🤝‍🧑", label: "delegating", screen: "#ff5ca8" },
  wait: { icon: "⏳", label: "waiting for you", screen: "#ffcc00" },
  idle: { icon: "💤", label: "idle", screen: "#1b1f27" },
  other: { icon: "🔧", label: "using a tool", screen: "#90a4ae" },
};

export const clipText = (s: string | undefined, max: number) =>
  !s ? "" : s.length > max ? s.slice(0, max - 1) + "…" : s;
