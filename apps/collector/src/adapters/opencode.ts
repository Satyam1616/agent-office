import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { classifyTool, clip, describeInput } from "../classify";
import { homes } from "../homes";
import type { AgentEvent } from "../types";

const DB_REL = ".local/share/opencode/opencode.db";

interface Row {
  id: string;
  session_id: string;
  time_updated: number;
  data: string;
  directory: string | null;
  parent_id: string | null;
  role: string | null;
}

type Emit = (e: AgentEvent, live: boolean) => void;

/** Follows the OpenCode database of every home, picking up homes that appear later. */
export function startOpenCode(emit: Emit, recentMs: number) {
  const started = new Set<string>();
  const check = () => {
    for (const home of homes()) {
      const path = `${home}/${DB_REL}`;
      if (started.has(path) || !existsSync(path)) continue;
      started.add(path);
      followDb(path, emit, recentMs);
    }
  };
  check();
  setInterval(check, 30_000);
}

const SQL = `
    SELECT p.id, p.session_id, p.time_updated, p.data, s.directory, s.parent_id,
           json_extract(m.data, '$.role') AS role
    FROM part p
    JOIN session s ON s.id = p.session_id
    LEFT JOIN message m ON m.id = p.message_id
    WHERE p.time_updated > ?
    ORDER BY p.time_updated
    LIMIT 2000`;

const SQLITE_OPEN_READONLY = 0x01;
const SQLITE_OPEN_URI = 0x40;

/**
 * Returns a function that runs the query. SQLite can't lock across the
 * \\wsl.localhost share, so there the db is opened `immutable` and reopened
 * on every poll; that skips the WAL, so WSL updates lag until a checkpoint.
 */
function reader(path: string): (since: number) => Row[] {
  if (!path.startsWith("//")) {
    const query = new Database(path, { readonly: true }).query<Row, [number]>(SQL);
    return (since) => query.all(since);
  }
  return (since) => {
    const db = new Database(`file://${path}?immutable=1`, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI);
    try {
      return db.query<Row, [number]>(SQL).all(since);
    } finally {
      db.close();
    }
  };
}

/**
 * OpenCode keeps sessions in SQLite. Parts (tool calls, text, reasoning) are
 * updated in place, so we poll by `time_updated` and remember what was emitted.
 */
function followDb(path: string, emit: Emit, recentMs: number, pollMs = 1500) {
  let read: (since: number) => Row[];
  try {
    read = reader(path);
    read(Date.now());
  } catch (err) {
    console.warn(`[opencode] cannot read ${path}:`, String(err));
    return;
  }

  const emitted = new Map<string, string>(); // part id → last emitted phase
  let cursor = Date.now() - recentMs;
  let live = false;

  const tick = () => {
    let rows: Row[];
    try {
      rows = read(cursor);
    } catch (err) {
      console.warn("[opencode] query failed, stopping:", err);
      clearInterval(timer);
      return;
    }
    for (const r of rows) {
      cursor = Math.max(cursor, r.time_updated);
      let part: any;
      try {
        part = JSON.parse(r.data);
      } catch {
        continue;
      }
      const base = {
        agent: "opencode" as const,
        sessionId: r.session_id,
        cwd: r.directory ?? undefined,
        parentId: r.parent_id ?? undefined,
        ts: r.time_updated,
      };
      const prev = emitted.get(r.id);
      const once = (phase: string, e: AgentEvent) => {
        if (prev === phase || (phase === "start" && prev === "end")) return;
        emitted.set(r.id, phase);
        emit(e, live);
      };

      if (part.type === "tool") {
        const status = part.state?.status;
        const detail = part.state?.title ? clip(part.state.title) : describeInput(part.state?.input);
        const start: AgentEvent = { ...base, kind: "tool_start", tool: part.tool, activity: classifyTool(part.tool), detail };
        if (status === "pending" || status === "running") once("start", start);
        else if (status === "completed" || status === "error") {
          if (!prev) emit(start, live);
          once("end", { ...base, kind: "tool_end", ok: status !== "error" });
        }
      } else if (part.type === "reasoning") {
        once("think", { ...base, kind: "thinking" });
      } else if (part.type === "text" && part.text?.trim() && !part.synthetic) {
        const kind = r.role === "user" ? "prompt" : "message";
        once("text", { ...base, kind, detail: clip(part.text) });
      } else if (part.type === "step-finish" && part.reason === "stop") {
        once("stop", { ...base, kind: "turn_end" });
      }
    }
    live = true;
  };

  tick();
  const timer = setInterval(tick, pollMs);
}
