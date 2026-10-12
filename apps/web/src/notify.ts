import { AGENT_META, clipText } from "./agents";
import { notify } from "./desktop";
import { useSettings } from "./settings";
import { useOffice } from "./store";

const COOLDOWN_MS = 5000;

/** Pings you when a session starts waiting or finishes a turn while the app isn't focused. */
export function watchNotifications() {
  const last = new Map<string, number>();
  useOffice.subscribe((s, prev) => {
    const level = useSettings.getState().notify;
    if (level === "off" || s.mode !== "live" || prev.mode !== "live" || s.sessions === prev.sessions) return;
    if (document.hasFocus()) return;
    for (const [key, cur] of Object.entries(s.sessions)) {
      const old = prev.sessions[key];
      // Only changes to sessions we already knew: a (re)connect snapshot isn't news.
      if (!old || old === cur || cur.parentKey) continue;
      if (Date.now() - (last.get(key) ?? 0) < COOLDOWN_MS) continue;
      const agent = AGENT_META[cur.agent].label;
      if (cur.status === "waiting" && old.status !== "waiting") {
        last.set(key, Date.now());
        void notify(`${agent} is waiting for you`, `${cur.project}${cur.tool ? ` · ${cur.tool}` : ""} ${clipText(cur.detail, 80)}`);
      } else if (level === "all" && cur.turns > old.turns) {
        last.set(key, Date.now());
        void notify(`${agent} finished`, `${cur.project} · ${cur.toolCount} tool calls${cur.failCount ? `, ${cur.failCount} failed` : ""}`);
      }
    }
  });
}
