import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import type { Server } from "bun";

/** Tailscale hands out addresses in the CGNAT range 100.64.0.0/10. */
export function isTailscale(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return a === 100 && b! >= 64 && b! <= 127;
}

export function tailscaleIPs(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a?.family === "IPv4" && isTailscale(a.address))
    .map((a) => a!.address);
}

export interface RemoteStatus {
  /** Sharing with your devices (and the phone link) is on. */
  enabled: boolean;
  /** Whether this machine has a Tailscale address at all. */
  tailscale: boolean;
  urls: string[];
  error?: string;
}

const RECHECK_MS = 30_000;

/**
 * Optional extra listeners on this machine's Tailscale addresses, so a phone or
 * another laptop can watch. Always token-protected; the token and on/off state
 * survive restarts so a scanned QR code keeps working.
 */
export class RemoteAccess {
  private servers = new Map<string, Server<unknown>>();
  private enabled = false;
  token: string;
  private error?: string;

  constructor(
    private file: string | null,
    private port: number,
    private serve: (hostname: string) => Server<unknown>,
    fixedToken?: string,
  ) {
    let saved: { enabled?: boolean; token?: string } = {};
    try {
      if (file) saved = JSON.parse(readFileSync(file, "utf8"));
    } catch {}
    this.token = fixedToken || saved.token || newToken();
    if (saved.enabled) this.set(true);
    // Tailscale may come up (or change address) after we start.
    setInterval(() => this.enabled && this.bind(), RECHECK_MS);
  }

  status(): RemoteStatus {
    const ips = tailscaleIPs();
    return {
      enabled: this.enabled,
      tailscale: ips.length > 0,
      urls: [...this.servers.keys()].map((ip) => `http://${ip}:${this.port}/?token=${this.token}`),
      error: this.error,
    };
  }

  set(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) this.bind();
    else this.unbind();
    this.save();
  }

  /** New token; everyone connected with the old one is dropped. */
  rotate() {
    this.token = newToken();
    this.unbind();
    if (this.enabled) this.bind();
    this.save();
  }

  publish(topic: string, msg: string) {
    for (const s of this.servers.values()) s.publish(topic, msg);
  }

  private bind() {
    this.error = undefined;
    const ips = tailscaleIPs();
    for (const [ip, s] of this.servers)
      if (!ips.includes(ip)) {
        s.stop(true);
        this.servers.delete(ip);
      }
    for (const ip of ips) {
      if (this.servers.has(ip)) continue;
      try {
        this.servers.set(ip, this.serve(ip));
        console.log(`[collector] remote access on http://${ip}:${this.port} (token required)`);
      } catch (err) {
        this.error = `cannot listen on ${ip}:${this.port}: ${String(err)}`;
      }
    }
  }

  private unbind() {
    for (const s of this.servers.values()) s.stop(true);
    this.servers.clear();
  }

  private save() {
    if (!this.file) return;
    try {
      writeFileSync(this.file, JSON.stringify({ enabled: this.enabled, token: this.token }), { mode: 0o600 });
    } catch (err) {
      console.warn("[collector] cannot save remote settings:", String(err));
    }
  }
}

const newToken = () => randomBytes(16).toString("hex");
