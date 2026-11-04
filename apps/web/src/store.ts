import { create } from "zustand";
import type { FeedItem, ServerMessage, SessionState, Stats } from "./agents";
import type { HistoryExtent, ReplayCommand } from "../../collector/src/types";
import { THEMES, type Theme } from "./roles";
import { isDemoMode, startStaticDemo } from "./demo";

const getParam = (key: string) =>
  typeof location !== "undefined" ? new URLSearchParams(location.search).get(key) : null;
const getStored = (key: string) =>
  typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;

const THEME_KEY = "agent-office-theme";
const requested = getParam("theme") ?? getStored(THEME_KEY);
const initialTheme: Theme = THEMES.includes(requested as Theme) ? (requested as Theme) : "office";

export type Mode = "live" | "replay";

export interface ReplayStatus {
  vt: number;
  from: number;
  to: number;
  playing: boolean;
  speed: number;
  events: number;
}

interface OfficeState {
  connected: boolean;
  sessions: Record<string, SessionState>;
  feed: FeedItem[];
  stats: Stats;
  selected: string | null;
  select: (key: string | null) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  mode: Mode;
  replay: ReplayStatus | null;
  history: HistoryExtent | null;
}

export const useOffice = create<OfficeState>((set) => ({
  connected: false,
  sessions: {},
  feed: [],
  stats: { today: {} },
  selected: null,
  select: (selected) => set({ selected }),
  theme: initialTheme,
  setTheme: (theme) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },
  // `?mode=replay` opens straight into playback (shareable link).
  mode: getParam("mode") === "replay" ? "replay" : "live",
  replay: null,
  history: null,
}));

function handle(msg: ServerMessage) {
  switch (msg.type) {
    case "snapshot":
      useOffice.setState({
        sessions: Object.fromEntries(msg.sessions.map((s) => [s.key, s])),
        feed: msg.feed,
      });
      break;
    case "session":
      useOffice.setState((st) => ({ sessions: { ...st.sessions, [msg.session.key]: msg.session } }));
      break;
    case "remove":
      useOffice.setState((st) => {
        const { [msg.key]: _gone, ...rest } = st.sessions;
        return { sessions: rest, selected: st.selected === msg.key ? null : st.selected };
      });
      break;
    case "feed":
      useOffice.setState((st) => ({ feed: [...st.feed.slice(-59), msg.item] }));
      break;
    case "replay": {
      const { type: _t, ...status } = msg;
      useOffice.setState({ replay: status });
      break;
    }
  }
}

/** Hub token from `?token=` (remembered so the URL can be shared without it afterwards). */
function token(): string {
  if (typeof location === "undefined") return "";
  const fromUrl = new URLSearchParams(location.search).get("token");
  if (fromUrl) {
    if (typeof localStorage !== "undefined") localStorage.setItem("agent-office-token", fromUrl);
    try {
      if (typeof window !== "undefined") {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("token");
        window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      }
    } catch {}
  }
  return fromUrl ?? (typeof localStorage !== "undefined" ? localStorage.getItem("agent-office-token") : "") ?? "";
}

const withToken = (path: string, extra = "") => {
  const t = token();
  const q = [t && `token=${encodeURIComponent(t)}`, extra].filter(Boolean).join("&");
  return q ? `${path}?${q}` : path;
};

/** Machine names are only worth showing once more than one machine reports in. */
export const useMultiMachine = () =>
  useOffice((s) => new Set(Object.values(s.sessions).map((x) => x.machine)).size > 1);

/** "Now" for relative times: wall clock live, the playhead during replay. */
export const useClock = (wall: number) => useOffice((s) => (s.mode === "replay" && s.replay ? s.replay.vt : wall));

let socket: WebSocket | null = null;

/** One socket at a time: the shared live office, or a private replay of recorded history. */
export function connect(mode: Mode = useOffice.getState().mode) {
  if (isDemoMode()) {
    startStaticDemo(handle, () => {
      useOffice.setState({
        connected: true,
        stats: {
          today: {
            claude: 15,
            codex: 10,
            gemini: 18,
            qwen: 7,
            copilot: 12,
            kiro: 6,
            opencode: 9,
          },
        },
      });
    });
    return;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}${withToken("/ws", mode === "replay" ? "replay=1" : "")}`);
  socket = ws;
  ws.onopen = () => useOffice.setState({ connected: true });
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => {
    if (socket !== ws) return; // replaced on purpose by setMode
    useOffice.setState({ connected: false });
    setTimeout(() => socket === ws && connect(), 1500);
  };
}

export function setMode(mode: Mode) {
  if (isDemoMode()) return;
  if (useOffice.getState().mode === mode) return;
  useOffice.setState({ mode, replay: null, sessions: {}, feed: [], selected: null });
  const old = socket;
  connect(mode);
  old?.close();
  if (mode === "replay") loadHistoryExtent();
}

export function replayCommand(cmd: ReplayCommand) {
  if (useOffice.getState().mode === "replay") socket?.send(JSON.stringify(cmd));
}

function loadHistoryExtent() {
  if (isDemoMode()) return;
  fetch(withToken("/api/history"))
    .then((r) => r.json())
    .then((history: HistoryExtent) => useOffice.setState({ history }))
    .catch(() => {});
}

if (!isDemoMode() && useOffice.getState().mode === "replay") queueMicrotask(loadHistoryExtent);

export function pollStats() {
  if (isDemoMode()) return;
  const load = () =>
    fetch(withToken("/api/stats"))
      .then((r) => r.json())
      .then((stats: Stats) => useOffice.setState({ stats }))
      .catch(() => {});
  load();
  setInterval(load, 10_000);
}
