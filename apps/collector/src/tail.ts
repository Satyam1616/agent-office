import { existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { homes } from "./homes";
import type { AgentEvent, AgentKind } from "./types";

export interface FileCtx {
  path: string;
  sessionId: string;
  cwd?: string;
  parentId?: string;
  title?: string;
  /** Ids already emitted, for formats that rewrite whole message lists (Gemini). */
  seen: Set<string>;
  extra: Record<string, unknown>;
}

export interface JsonlAdapter {
  agent: AgentKind;
  /** Log dirs relative to each home directory (see homes.ts). */
  roots: { dir: string; pattern: string }[];
  initCtx?(path: string): Partial<FileCtx>;
  parse(obj: any, ctx: FileCtx): AgentEvent[];
}

interface Tracked {
  adapter: JsonlAdapter;
  offset: number;
  size: number;
  mtime: number;
  ctx?: FileCtx;
}

type Emit = (e: AgentEvent, live: boolean) => void;

const HEAD_BYTES = 32 * 1024;
const BACKFILL_BYTES = 256 * 1024;
const MAX_READ = 4 * 1024 * 1024;

function readRange(path: string, start: number, end: number): Buffer {
  const len = Math.min(end - start, MAX_READ);
  const buf = Buffer.alloc(len);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, len, start);
  } finally {
    closeSync(fd);
  }
  return buf;
}

/** Splits at the last newline so a half-written line (or UTF-8 char) is never decoded. */
function completeLines(buf: Buffer): { lines: string[]; consumed: number } {
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < 0) return { lines: [], consumed: 0 };
  return { lines: buf.subarray(0, lastNl).toString("utf8").split("\n"), consumed: lastNl + 1 };
}

/**
 * Follows every JSONL session log of every adapter, like `tail -f` over globs.
 * Files untouched within `recentMs` at startup are only followed from their end.
 */
export class JsonlTailer {
  private files = new Map<string, Tracked>();
  private homesSeen = new Set<string>();

  constructor(
    private adapters: JsonlAdapter[],
    private emit: Emit,
    private recentMs: number,
  ) {}

  start(scanMs = 3000, pollMs = 700) {
    this.scan();
    setInterval(() => this.scan(), scanMs);
    setInterval(() => this.poll(), pollMs);
  }

  private scan() {
    const now = Date.now();
    for (const home of homes()) {
      // A home seen for the first time (e.g. a WSL distro that just started) holds
      // only old sessions, so it gets the startup treatment instead of a full replay.
      const fresh = !this.homesSeen.has(home);
      this.homesSeen.add(home);
      for (const adapter of this.adapters) {
        for (const root of adapter.roots) {
          const dir = `${home}/${root.dir}`;
          if (!existsSync(dir)) continue;
          for (const found of new Bun.Glob(root.pattern).scanSync({ cwd: dir, absolute: true })) {
            // Forward slashes everywhere so adapters can match paths on Windows too.
            const path = found.replaceAll("\\", "/");
            if (this.files.has(path)) continue;
            let st;
            try {
              st = statSync(path);
            } catch {
              continue;
            }
            const t: Tracked = { adapter, offset: st.size, size: st.size, mtime: st.mtimeMs };
            this.files.set(path, t);
            // Files appearing later are new sessions: read them from the top.
            if (!fresh) t.offset = 0;
            else if (now - st.mtimeMs < this.recentMs) this.backfill(path, t);
          }
        }
      }
    }
  }

  private poll() {
    for (const [path, t] of this.files) {
      let st;
      try {
        st = statSync(path);
      } catch {
        this.files.delete(path);
        continue;
      }
      if (st.size === t.offset) continue;
      if (st.size < t.offset) t.offset = 0; // truncated / rewritten
      const ctx = this.ctxFor(path, t);
      const { lines, consumed } = completeLines(readRange(path, t.offset, st.size));
      t.offset += consumed;
      t.mtime = st.mtimeMs;
      this.feed(lines, ctx, t.adapter, true);
    }
  }

  /** Replays the tail of a recently-active file silently so current state is known. */
  private backfill(path: string, t: Tracked) {
    const ctx = this.ctxFor(path, t);
    const start = Math.max(0, t.size - BACKFILL_BYTES);
    const { lines } = completeLines(readRange(path, start, t.size));
    if (start > 0) lines.shift(); // first line is probably cut
    this.feed(lines, ctx, t.adapter, false);
  }

  /** Context is built lazily from the file head, where session metadata lives. */
  private ctxFor(path: string, t: Tracked): FileCtx {
    if (t.ctx) return t.ctx;
    const name = path.split("/").pop()!.replace(/\.jsonl$/, "");
    const ctx: FileCtx = { path, sessionId: name, seen: new Set(), extra: {}, ...t.adapter.initCtx?.(path) };
    t.ctx = ctx;
    if (t.offset > 0) {
      const { lines } = completeLines(readRange(path, 0, Math.min(HEAD_BYTES, t.size)));
      for (const line of lines) parseLine(line, ctx, t.adapter); // metadata only, events dropped
    }
    return ctx;
  }

  private feed(lines: string[], ctx: FileCtx, adapter: JsonlAdapter, live: boolean) {
    for (const line of lines) for (const e of parseLine(line, ctx, adapter)) this.emit(e, live);
  }
}

function parseLine(line: string, ctx: FileCtx, adapter: JsonlAdapter): AgentEvent[] {
  if (!line.trim()) return [];
  try {
    return adapter.parse(JSON.parse(line), ctx);
  } catch {
    return [];
  }
}
