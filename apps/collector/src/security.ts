import type { Tailnet } from "./tailnet";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const NO_PROXY_HOSTS = new Set<string>();

/** Normalizes host strings from headers, URLs, or configuration. */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    const endBracket = trimmed.indexOf("]");
    if (endBracket !== -1) return trimmed.slice(1, endBracket);
  }
  return trimmed.split(":")[0] ?? "";
}

function authority(value: string): { host: string; port: string } | null {
  try {
    const url = new URL(`http://${value}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { host: normalizeHost(url.hostname), port: url.port };
  } catch {
    return null;
  }
}

/** Builds the permitted hostname set from local config and cached Tailnet state. */
export function getAllowedHosts(
  tailscaleIps: string[] = [],
  tailnet?: Tailnet,
  configuredHost?: string,
  machineName?: string,
): Set<string> {
  const allowed = new Set<string>(LOOPBACK_HOSTS);
  for (const ip of tailscaleIps) {
    const norm = normalizeHost(ip);
    if (norm) allowed.add(norm);
  }
  if (tailnet) {
    const selfDns = tailnet.selfDns();
    if (selfDns) {
      allowed.add(normalizeHost(selfDns));
      allowed.add(normalizeHost(selfDns.split(".")[0]));
    }
    for (const ip of tailnet.selfIps()) {
      const norm = normalizeHost(ip);
      if (norm) allowed.add(norm);
    }
  }
  for (const host of [configuredHost, machineName]) {
    const norm = normalizeHost(host);
    if (norm && norm !== "0.0.0.0" && norm !== "::") allowed.add(norm);
  }
  return allowed;
}

/** Validates the Host header against the allowlist and expected listener port. */
export function isAllowedHost(
  hostHeader: string | null | undefined,
  allowedHosts: Set<string>,
  serverPort = 4747,
  development = false,
  proxyHostsWithoutPort: Set<string> = NO_PROXY_HOSTS,
): boolean {
  if (!hostHeader) return false;
  const parsed = authority(hostHeader);
  if (!parsed || (!allowedHosts.has(parsed.host) && !LOOPBACK_HOSTS.has(parsed.host))) return false;
  return (
    parsed.port === String(serverPort) ||
    (!!parsed.port && parsed.port !== "5173" && proxyHostsWithoutPort.has(parsed.host)) ||
    (!parsed.port && proxyHostsWithoutPort.has(parsed.host)) ||
    (development && parsed.port === "5173" && LOOPBACK_HOSTS.has(parsed.host))
  );
}

/**
 * Missing Origin is allowed for non-browser clients such as relays and peers.
 * Browser origins must match the request hostname and port, except for the
 * loopback Vite origin on port 5173 while the collector runs in development.
 */
export function isAllowedOrigin(
  originHeader: string | null | undefined,
  allowedHosts: Set<string>,
  hostHeader?: string | null,
  serverPort = 4747,
  development = false,
): boolean {
  if (!originHeader || originHeader === "null") return originHeader !== "null";
  const trimmed = originHeader.trim();
  try {
    const url = new URL(trimmed);
    if (url.protocol === "tauri:") return url.hostname.toLowerCase() === "localhost";
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname.toLowerCase() === "tauri.localhost") return true;
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "tauri:") return false;
    const host = normalizeHost(url.hostname);
    if (!allowedHosts.has(host) && !LOOPBACK_HOSTS.has(host)) return false;

    const originPort = url.port || (url.protocol === "https:" ? "443" : "80");
    const request = hostHeader ? authority(hostHeader) : null;
    if (request) {
      if (request.port === "5173" && (!development || !LOOPBACK_HOSTS.has(request.host))) return false;
      const requestPort = request.port || (url.protocol === "https:" ? "443" : "80");
      return host === request.host && originPort === requestPort;
    }
    return originPort === String(serverPort) || (development && originPort === "5173" && LOOPBACK_HOSTS.has(host));
  } catch {
    return false;
  }
}
