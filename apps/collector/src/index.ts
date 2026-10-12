import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { claude } from "./adapters/claude";
import { codex } from "./adapters/codex";
import { copilot } from "./adapters/copilot";
import { gemini } from "./adapters/gemini";
import { kiro } from "./adapters/kiro";
import { startOpenCode } from "./adapters/opencode";
import { qwen } from "./adapters/qwen";
import { startDemo } from "./demo";
import { History } from "./history";
import { homes } from "./homes";
import { startRelay } from "./relay";
import { Peers, type DeviceStatus } from "./peers";
import { RemoteAccess, type RemoteStatus } from "./remote";
import { ReplayPlayer } from "./replay";
import { SESSION_TTL_MS, SessionStore } from "./state";
import { JsonlTailer } from "./tail";
import { Tailnet } from "./tailnet";
import type { AgentEvent, IngestBatch, ReplayCommand, ServerMessage } from "./types";

const PORT = Number(process.env.PORT ?? 4747);
const HOST = process.env.HOST ?? "127.0.0.1";
const TOKEN = process.env.TOKEN ?? "";
const MACHINE = process.env.MACHINE ?? hostname();
const RELAY_TO = process.env.RELAY_TO; // e.g. http://100.64.0.2:4747 → run as relay
const DEMO = process.argv.includes("--demo");
// The desktop app runs a compiled binary and points these at its own folders.
const WEB_DIST = resolve(process.env.WEB_DIR ?? join(import.meta.dir, "../../web/dist"));
// A compiled binary's import.meta.dir is a virtual path, so it falls back to the home dir.
const COMPILED = /\$bunfs|~BUN/.test(import.meta.dir);
const DB_PATH =
  process.env.DB_PATH ?? (COMPILED ? join(homedir(), ".agent-office.db") : join(import.meta.dir, "..", "agent-office.db"));
/** Phone access on/off and its token, next to the history db. */
const REMOTE_PATH = DB_PATH.replace(/\.db$/, "") + ".remote.json";
const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

function watchLogs(emit: (e: AgentEvent, live: boolean) => void) {
  console.log(`[collector] following agent logs in: ${homes().join(", ")}`);
  new JsonlTailer([claude, codex, gemini, qwen, copilot, kiro], emit, SESSION_TTL_MS).start();
  startOpenCode(emit, SESSION_TTL_MS);
}

// ── Relay mode: stream this machine's agents to a hub, serve nothing. ──
if (RELAY_TO) {
  if (!TOKEN) {
    console.error("[relay] set TOKEN to the hub's token");
    process.exit(1);
  }
  watchLogs(startRelay(RELAY_TO, TOKEN, MACHINE));
  console.log(`[relay] watching agent logs on "${MACHINE}" → ${RELAY_TO}`);
} else {
  startHub();
}

function startHub() {
  const loopback = HOST === "127.0.0.1" || HOST === "localhost" || HOST === "::1";
  // Session logs contain prompts and code: anything beyond localhost needs a token.
  if (!loopback && TOKEN.length < 16) {
    console.error(`[collector] HOST=${HOST} exposes your agent logs; set TOKEN (16+ chars), e.g.\n  TOKEN=$(openssl rand -hex 16)`);
    process.exit(1);
  }

  const matches = (given: string, expected: string) => {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  const givenToken = (req: Request, url: URL) =>
    url.searchParams.get("token") ?? req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";

  /**
   * On a loopback server, only pages from this machine: otherwise any website open in
   * your browser could connect to ws://127.0.0.1 and read your sessions (or use DNS
   * rebinding to look like localhost).
   */
  const fromThisMachine = (req: Request) => {
    const origin = req.headers.get("origin");
    let originHost = "";
    try {
      originHost = origin ? new URL(origin).host : "";
    } catch {
      return false;
    }
    return LOCAL_HOST.test(req.headers.get("host") ?? "") && (!origin || LOCAL_HOST.test(originHost));
  };

  // viewer: this office (incl. other devices); peer: another device of yours, which only gets our own sessions.
  type WsData = { role: "viewer" | "peer" | "relay" | "replay"; player?: ReplayPlayer };

  // `remote` = one of the Tailscale listeners from RemoteAccess, always token-protected.
  const serve = (hostname: string, remote: boolean) =>
    Bun.serve<WsData>({
      hostname,
      port: PORT,
      async fetch(req, server) {
        const url = new URL(req.url);
        const p = url.pathname;

        if (!remote && loopback && !fromThisMachine(req)) return new Response("forbidden", { status: 403 });

        // Phone access switch: only from this machine's own pages, never remotely.
        if (p === "/api/remote") {
          if (remote || !loopback) return new Response("not found", { status: 404 });
          if (req.method === "POST") {
            if (!req.headers.get("content-type")?.includes("application/json"))
              return new Response("expected JSON", { status: 415 });
            const body = (await req.json().catch(() => ({}))) as { enabled?: boolean; rotate?: boolean };
            if (body.rotate) remoteAccess.rotate();
            if (typeof body.enabled === "boolean") {
              remoteAccess.set(body.enabled);
              await syncDevices();
            }
          }
          return Response.json(sharingStatus());
        }

        const api = p === "/ws" || p === "/ingest" || p.startsWith("/api/");
        // Your own devices are let in by Tailscale identity; anything else (the phone link)
        // opens the page with ?token=, which also sets a cookie for the assets.
        const authorized = remote
          ? tailnet.isMine(server.requestIP(req)?.address ?? "") ||
            matches(givenToken(req, url), remoteAccess.token) ||
            hasRemoteCookie(req)
          : TOKEN
            ? matches(givenToken(req, url), TOKEN)
            : loopback;
        if ((api || remote) && !authorized) return new Response("unauthorized", { status: 401 });

        if (api) {
          // Relays push into the office, so they must always present a token.
          if (p === "/ingest" && !TOKEN && !remote) return new Response("hub has no TOKEN set", { status: 403 });
          if (p === "/ws" || p === "/ingest") {
            const q = url.searchParams;
            const data: WsData = { role: p === "/ingest" ? "relay" : q.has("replay") ? "replay" : q.has("peer") ? "peer" : "viewer" };
            return server.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
          }
          if (p === "/api/stats") return Response.json(history.stats());
          if (p === "/api/history") return Response.json(history.extent());
          if (p === "/api/health") return Response.json({ ok: true, demo: DEMO, machine: MACHINE });
          return new Response("not found", { status: 404 });
        }

        // Built web app (`bun run build`), so remote viewers need only this one port.
        if (existsSync(WEB_DIST)) {
          const file = resolve(WEB_DIST, "." + (p === "/" ? "/index.html" : p));
          const res =
            file.startsWith(WEB_DIST) && (await Bun.file(file).exists())
              ? new Response(Bun.file(file))
              : new Response(Bun.file(join(WEB_DIST, "index.html")));
          if (remote && url.searchParams.has("token"))
            res.headers.append("set-cookie", `ao_token=${remoteAccess.token}; Path=/; HttpOnly; SameSite=Strict`);
          return res;
        }
        return new Response("agent-office collector (run `bun run build` to serve the web app here)", { status: 404 });
      },
      websocket: {
        open(ws) {
          if (ws.data.role === "relay") return;
          if (ws.data.role === "replay") {
            ws.data.player = new ReplayPlayer(history, MACHINE, (msg) => ws.send(JSON.stringify(msg)));
            return;
          }
          if (ws.data.role === "peer") {
            ws.subscribe("share");
            ws.send(JSON.stringify(store.snapshot()));
            return;
          }
          ws.subscribe("office");
          ws.send(JSON.stringify(officeSnapshot()));
        },
        close(ws) {
          ws.data.player?.stop();
        },
        message(ws, raw) {
          if (ws.data.role === "replay") {
            try {
              ws.data.player?.command(JSON.parse(String(raw)) as ReplayCommand);
            } catch {}
            return;
          }
          if (ws.data.role !== "relay") return;
          try {
            const batch = JSON.parse(String(raw)) as IngestBatch;
            const machine = String(batch.machine).slice(0, 64);
            for (const { e, live } of batch.events) store.apply({ ...e, machine }, live);
          } catch {
            ws.close(1003, "bad batch");
          }
        },
      },
    });

  const hasRemoteCookie = (req: Request) => {
    const m = /(?:^|;\s*)ao_token=([0-9a-f]+)/.exec(req.headers.get("cookie") ?? "");
    return !!m && matches(m[1]!, remoteAccess.token);
  };

  const server = serve(HOST, false);
  const remoteAccess = new RemoteAccess(DEMO ? null : REMOTE_PATH, PORT, (ip) => serve(ip, true), TOKEN || undefined);

  // Demo events must not pollute the real per-agent stats.
  const dbPath = DEMO ? ":memory:" : DB_PATH;
  const history = new History(dbPath);
  const publish = (topics: string[], msg: ServerMessage) => {
    const json = JSON.stringify(msg);
    for (const t of topics) {
      server.publish(t, json);
      remoteAccess.publish(t, json);
    }
  };
  const store = new SessionStore({
    machine: MACHINE,
    // Our own sessions go to viewers and to your other devices.
    broadcast: (msg: ServerMessage) => publish(["office", "share"], msg),
    onLive: (e, ts, project) => history.record(e, ts, project),
  });

  // ── Your other devices over Tailscale (only while sharing is on) ──
  const tailnet = new Tailnet();
  const peers = new Peers(
    tailnet,
    PORT,
    (key) => store.has(key),
    (msg) => publish(["office"], msg),
    () => publish(["office"], officeSnapshot()),
  );
  const officeSnapshot = (): ServerMessage => {
    const own = store.snapshot();
    return {
      type: "snapshot",
      sessions: [...own.sessions, ...peers.sessions()],
      feed: [...own.feed, ...peers.feed()].sort((a, b) => a.ts - b.ts).slice(-60),
    };
  };
  const syncDevices = async () => {
    const on = remoteAccess.status().enabled;
    if (on) await tailnet.refresh();
    peers.set(on);
  };
  const sharingStatus = (): RemoteStatus & { devices: DeviceStatus[]; problem?: string } => ({
    ...remoteAccess.status(),
    devices: peers.status(),
    problem: tailnet.problem,
  });
  void syncDevices();
  setInterval(() => void syncDevices(), 30_000);
  const emit = (e: AgentEvent, live: boolean) => store.apply(e, live);

  if (DEMO) startDemo(emit);
  else watchLogs(emit);

  const what = DEMO ? "DEMO mode" : `watching agent logs on "${MACHINE}"`;
  console.log(`[collector] ${what} at http://${HOST}:${PORT}${loopback ? "" : " (token required)"}`);
  if (TOKEN) console.log("[collector] relays/viewers: add ?token=<TOKEN>");
}
