import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createConnection } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "integration-test-token";
let port: number;
let tempDir: string;
let child: ReturnType<typeof Bun.spawn>;

function reservePort(): number {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port;
  server.stop(true);
  return port!;
}

async function waitUntilReady(portToCheck = port, token = TOKEN) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${portToCheck}/api/health?token=${token}`, {
        headers: { host: `127.0.0.1:${portToCheck}` },
      });
      if (response.ok) return;
    } catch {}
    await Bun.sleep(50);
  }
  throw new Error("collector failed to start within 10 seconds");
}

async function stopCollector(process: ReturnType<typeof Bun.spawn>, directory: string) {
  process.kill();
  await process.exited;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  rmSync(directory, { recursive: true, force: true });
}

function websocketStatus(options: { host: string; origin?: string; path?: string }): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("WebSocket handshake timed out"));
    }, 3_000);
    socket.on("connect", () => {
      const headers = [
        `GET ${options.path ?? `/ws?token=${TOKEN}`} HTTP/1.1`,
        `Host: ${options.host}`,
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      ];
      if (options.origin !== undefined) headers.push(`Origin: ${options.origin}`);
      socket.write(`${headers.join("\r\n")}\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString();
      const match = /^HTTP\/1\.1 (\d{3})/m.exec(response);
      if (!match) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve(Number(match[1]));
    });
    socket.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

describe("collector live HTTP and WebSocket security", () => {
  beforeAll(async () => {
    port = reservePort();
    tempDir = mkdtempSync(join(tmpdir(), "agent-office-security-"));
    child = Bun.spawn(["bun", "run", "apps/collector/src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        TOKEN,
        ALLOWED_HOSTS: "proxy.example.test",
        DB_PATH: join(tempDir, "collector.db"),
        NODE_ENV: "production",
      },
      stdout: "inherit",
      stderr: "inherit",
    });
    await waitUntilReady();
  }, 15_000);

  afterAll(async () => {
    if (child && tempDir) await stopCollector(child, tempDir);
  });

  it("enforces Host and Origin for HTTP and WebSocket, while allowing clients without Origin", async () => {
    const endpoint = `http://127.0.0.1:${port}/api/health?token=${TOKEN}`;
    const goodHost = `127.0.0.1:${port}`;
    const goodOrigin = `http://${goodHost}`;

    const goodHttp = await fetch(endpoint, { headers: { host: goodHost, origin: goodOrigin } });
    expect(goodHttp.status).toBe(200);
    expect(goodHttp.headers.has("access-control-allow-origin")).toBe(false);

    const noOriginHttp = await fetch(endpoint, { headers: { host: goodHost } });
    expect(noOriginHttp.status).toBe(200);
    expect(noOriginHttp.headers.has("access-control-allow-origin")).toBe(false);

    const badOriginHttp = await fetch(endpoint, { headers: { host: goodHost, origin: `http://evil.example:${port}` } });
    expect(badOriginHttp.status).toBe(403);
    expect(badOriginHttp.headers.has("access-control-allow-origin")).toBe(false);

    const badHostHttp = await fetch(endpoint, { headers: { host: `evil.example:${port}`, origin: goodOrigin } });
    expect(badHostHttp.status).toBe(403);

    expect(await websocketStatus({ host: goodHost, origin: goodOrigin })).toBe(101);
    expect(await websocketStatus({ host: goodHost, origin: `http://evil.example:${port}` })).toBe(403);
    expect(await websocketStatus({ host: `evil.example:${port}`, origin: goodOrigin })).toBe(403);

    // The two backend clients deliberately omit Origin.
    expect(await websocketStatus({ host: goodHost, path: `/ws?peer=1&token=${TOKEN}` })).toBe(101);
    expect(await websocketStatus({ host: goodHost, path: `/ingest?token=${TOKEN}` })).toBe(101);
  });

  it("rejects GET and POST /api/remote via a proxy Host without returning the token", async () => {
    const host = `proxy.example.test:${port}`;
    const origin = `http://${host}`;
    for (const method of ["GET", "POST"] as const) {
      const response = await fetch(`http://127.0.0.1:${port}/api/remote`, {
        method,
        headers: {
          host,
          origin,
          "x-forwarded-for": "203.0.113.20",
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body: JSON.stringify({ enabled: true }) } : {}),
      });
      const body = await response.text();
      expect(response.status).toBe(403);
      expect(body).not.toContain(TOKEN);
    }
  });

  it("does not grant loopback trust when proxy headers are present", async () => {
    const portWithoutToken = reservePort();
    const dir = mkdtempSync(join(tmpdir(), "agent-office-forwarded-"));
    const local = Bun.spawn(["bun", "run", "apps/collector/src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(portWithoutToken),
        TOKEN: "",
        ALLOWED_HOSTS: "",
        DB_PATH: join(dir, "collector.db"),
        NODE_ENV: "production",
      },
      stdout: "ignore",
      stderr: "ignore",
    });
    try {
      await waitUntilReady(portWithoutToken, "");
      for (const [name, value] of [
        ["x-forwarded-for", "127.0.0.1"],
        ["forwarded", "for=127.0.0.1"],
        ["via", "1.1 local-proxy"],
      ]) {
        const response = await fetch(`http://127.0.0.1:${portWithoutToken}/api/health`, {
          headers: {
            host: `127.0.0.1:${portWithoutToken}`,
            origin: `http://127.0.0.1:${portWithoutToken}`,
            [name]: value,
          },
        });
        expect(response.status).toBe(401);
      }
    } finally {
      await stopCollector(local, dir);
    }
  });

  it("refuses to start with ALLOWED_HOSTS and no token", async () => {
    const childWithoutToken = Bun.spawn(["bun", "run", "apps/collector/src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(reservePort()),
        TOKEN: "",
        ALLOWED_HOSTS: "proxy.example.test",
        DB_PATH: join(tmpdir(), `agent-office-proxy-${crypto.randomUUID()}.db`),
      },
      stdout: "ignore",
      stderr: "ignore",
    });
    expect(await childWithoutToken.exited).toBe(1);
  });
});
