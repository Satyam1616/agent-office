import type { AgentEvent, IngestBatch } from "./types";

const FLUSH_MS = 300;
const MAX_QUEUE = 5000;
const RETRY_MS = 3000;

/**
 * Relay mode: this machine has no office of its own, it streams its agents'
 * events to a hub collector over WebSocket. Survives hub restarts by replaying
 * the latest event of every known session on reconnect.
 */
export function startRelay(hub: string, token: string, machine: string) {
  const url = new URL("/ingest", hub.replace(/^http/, "ws"));
  url.searchParams.set("token", token);

  let ws: WebSocket | null = null;
  let open = false;
  let warned = false;
  let queue: IngestBatch["events"] = [];
  const latest = new Map<string, AgentEvent>(); // per session, for replay

  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      open = true;
      warned = false;
      console.log(`[relay] connected to ${hub} as "${machine}"`);
      queue = [...[...latest.values()].map((e) => ({ e, live: false })), ...queue];
    };
    ws.onclose = (ev) => {
      if (open) console.warn(`[relay] disconnected from hub (${ev.code}), retrying…`);
      else if (!warned) console.warn(`[relay] can't connect to ${hub}: hub down/unreachable or wrong TOKEN. Retrying every ${RETRY_MS / 1000}s…`);
      warned = true;
      open = false;
      setTimeout(connect, RETRY_MS);
    };
    ws.onerror = () => {}; // onclose handles retry
  };

  setInterval(() => {
    if (!open || !ws || queue.length === 0) return;
    const batch: IngestBatch = { machine, events: queue };
    queue = [];
    ws.send(JSON.stringify(batch));
  }, FLUSH_MS);

  connect();

  return (e: AgentEvent, live: boolean) => {
    latest.set(`${e.agent}:${e.sessionId}`, e);
    queue.push({ e, live });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  };
}
