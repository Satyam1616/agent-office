import { Database } from "bun:sqlite";
import type { AgentEvent, Stats } from "./types";

/** Every live event, kept so stats can be computed and sessions replayed later. */
export class History {
  private db: Database;
  private insert;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true });
    this.db.run(`CREATE TABLE IF NOT EXISTS events (
      ts INTEGER, agent TEXT, session TEXT, project TEXT, kind TEXT, tool TEXT, activity TEXT, detail TEXT)`);
    const cols = new Set(this.db.query<{ name: string }, []>("PRAGMA table_info(events)").all().map((c) => c.name));
    if (!cols.has("machine")) this.db.run("ALTER TABLE events ADD COLUMN machine TEXT");
    // Full normalized event; rows written before replay existed have none and are skipped.
    if (!cols.has("event")) this.db.run("ALTER TABLE events ADD COLUMN event TEXT");
    this.db.run("CREATE INDEX IF NOT EXISTS events_ts ON events(ts)");
    this.insert = this.db.prepare(
      "INSERT INTO events (ts, agent, session, project, kind, tool, activity, detail, machine, event) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
  }

  record(e: AgentEvent & { machine: string }, ts: number, project: string) {
    this.insert.run(
      ts,
      e.agent,
      e.sessionId,
      project,
      e.kind,
      e.tool ?? null,
      e.activity ?? null,
      e.detail ?? null,
      e.machine,
      JSON.stringify({ ...e, ts }),
    );
  }

  stats(): Stats {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const rows = this.db
      .query<{ agent: string; n: number }, [number]>(
        "SELECT agent, COUNT(*) AS n FROM events WHERE kind = 'tool_start' AND ts >= ? GROUP BY agent",
      )
      .all(midnight.getTime());
    return { today: Object.fromEntries(rows.map((r) => [r.agent, r.n])) };
  }

  /** Time span that can be replayed. */
  extent(): { first: number | null; last: number | null; count: number } {
    return this.db
      .query<{ first: number | null; last: number | null; count: number }, []>(
        "SELECT MIN(ts) AS first, MAX(ts) AS last, COUNT(*) AS count FROM events WHERE event IS NOT NULL",
      )
      .get()!;
  }

  range(from: number, to: number, limit = 200_000): AgentEvent[] {
    return this.db
      .query<{ event: string }, [number, number, number]>(
        "SELECT event FROM events WHERE event IS NOT NULL AND ts BETWEEN ? AND ? ORDER BY ts, rowid LIMIT ?",
      )
      .all(from, to, limit)
      .map((r) => JSON.parse(r.event) as AgentEvent);
  }
}
