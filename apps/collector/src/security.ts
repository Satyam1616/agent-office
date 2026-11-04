import type { Tailnet } from "./tailnet";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TAURI_ORIGIN_PREFIXES = ["tauri://", "http://tauri.localhost", "https://tauri.localhost"];

/**
 * Normalizes host strings from headers, URL or config:
 * - strips optional port (e.g. "localhost:4747" -> "localhost", "[::1]:4747" -> "[::1]")
 * - strips surrounding brackets for IPv6
 * - converts to lowercase
 */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const endBracket = trimmed.indexOf("]");
    if (endBracket !== -1) {
      return trimmed.slice(1, endBracket);
    }
  }
  return trimmed.split(":")[0] ?? "";
}

/**
 * Builds the set of permitted hostnames for incoming HTTP / WebSocket requests.
 */
export function getAllowedHosts(
  tailscaleIps: string[] = [],
  tailnet?: Tailnet,
  configuredHost?: string,
): Set<string> {
  const allowed = new Set<string>(LOOPBACK_HOSTS);

  for (const ip of tailscaleIps) {
    const norm = normalizeHost(ip);
    if (norm) allowed.add(norm);
  }

  if (tailnet) {
    const selfDns = tailnet.selfDns();
    if (selfDns) allowed.add(normalizeHost(selfDns));

    for (const ip of tailnet.selfIps()) {
      const norm = normalizeHost(ip);
      if (norm) allowed.add(norm);
    }
  }

  if (configuredHost) {
    const norm = normalizeHost(configuredHost);
    if (norm) allowed.add(norm);
  }

  return allowed;
}

/**
 * Validates the Host header against the allowlist.
 * Mitigates DNS rebinding attacks.
 */
export function isAllowedHost(hostHeader: string | null | undefined, allowedHosts: Set<string>): boolean {
  if (!hostHeader) return false;
  const host = normalizeHost(hostHeader);
  return allowedHosts.has(host) || LOOPBACK_HOSTS.has(host);
}

/**
 * Validates the Origin header against the allowlist and known Tauri schemes.
 * If Origin is absent, this returns true (non-browser clients, e.g. curl, relay, peers).
 * If Origin is present, it MUST come from an allowed host or valid Tauri origin.
 */
export function isAllowedOrigin(originHeader: string | null | undefined, allowedHosts: Set<string>): boolean {
  if (!originHeader || originHeader === "null") {
    // Missing origin is allowed for non-browser clients (relay, peers, curl)
    // Note: literal "null" origin (e.g. opaque sandbox / sandboxed iframe) is rejected
    return originHeader !== "null";
  }

  const trimmed = originHeader.trim();

  for (const prefix of TAURI_ORIGIN_PREFIXES) {
    if (trimmed.startsWith(prefix)) return true;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "tauri:") {
      return false;
    }
    const host = normalizeHost(url.hostname);
    return allowedHosts.has(host) || LOOPBACK_HOSTS.has(host);
  } catch {
    return false;
  }
}
