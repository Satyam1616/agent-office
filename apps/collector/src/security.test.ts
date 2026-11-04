import { describe, expect, it } from "bun:test";
import { getAllowedHosts, isAllowedHost, isAllowedOrigin, normalizeHost } from "./security";

describe("collector request allowlist", () => {
  const allowed = getAllowedHosts(["100.64.0.5"], undefined, "0.0.0.0", "laptop");

  it("normalizes hostnames and IPv6 authorities", () => {
    expect(normalizeHost("localhost:4747")).toBe("localhost");
    expect(normalizeHost("[::1]:4747")).toBe("::1");
    expect(isAllowedHost("localhost:4747", allowed)).toBe(true);
    expect(isAllowedHost("[::1]:4747", allowed)).toBe(true);
    expect(isAllowedHost("100.64.0.5:4747", allowed)).toBe(true);
    expect(isAllowedHost("laptop:4747", allowed)).toBe(true);
  });

  it("rejects unknown hosts, wrong ports, and DNS rebinding names", () => {
    for (const host of ["evil.com:4747", "laptop.attacker.com:4747", "127.0.0.1.nip.io:4747", "laptop:5173", "localhost:4748", "0.0.0.0:4747"]) {
      expect(isAllowedHost(host, allowed)).toBe(false);
    }
    expect(isAllowedHost("localhost:5173", allowed, 4747, true)).toBe(true);
    expect(isAllowedHost("laptop:5173", allowed, 4747, true)).toBe(false);
    expect(isAllowedHost("localhost", allowed)).toBe(false);
    const proxyHosts = new Set(["office.example.com"]);
    expect(isAllowedHost("office.example.com", proxyHosts, 4747, false, proxyHosts)).toBe(true);
    expect(isAllowedHost("office.example.com:8443", proxyHosts, 4747, false, proxyHosts)).toBe(true);
    expect(isAllowedHost("office.example.com:5173", proxyHosts, 4747, false, proxyHosts)).toBe(false);
    expect(isAllowedOrigin("https://office.example.com:8443", proxyHosts, "office.example.com:8443", 4747, false)).toBe(true);
  });

  it("allows absent Origin for relays and peer clients", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedOrigin(null, allowed)).toBe(true);
    expect(isAllowedOrigin("", allowed)).toBe(true);
  });

  it("matches Origin host and port and only enables Vite during development", () => {
    expect(isAllowedOrigin("http://laptop:4747", allowed, "laptop:4747")).toBe(true);
    expect(isAllowedOrigin("http://100.64.0.5:4747", allowed, "100.64.0.5:4747")).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", allowed, "localhost:5173", 4747, true)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", allowed, "localhost:5173")).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173", allowed, "localhost:4747", 4747, true)).toBe(false);
    expect(isAllowedOrigin("http://laptop:8080", allowed, "laptop:4747")).toBe(false);
    expect(isAllowedOrigin("https://evil.com:4747", allowed, "evil.com:4747")).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1.attacker.com:4747", allowed)).toBe(false);
    expect(isAllowedOrigin("null", allowed)).toBe(false);
    expect(isAllowedOrigin("javascript:void(0)", allowed)).toBe(false);
  });

  it("allows the tailnet MagicDNS name and its short name from cached state", () => {
    const tailnet = {
      selfDns: () => "laptop.tail1234.ts.net",
      selfIps: () => new Set(["100.64.0.8"]),
    } as never;
    const tailnetHosts = getAllowedHosts([], tailnet);
    expect(isAllowedHost("laptop:4747", tailnetHosts)).toBe(true);
    expect(isAllowedHost("laptop.tail1234.ts.net:4747", tailnetHosts)).toBe(true);
  });

  it("allows trusted Tauri origins", () => {
    expect(isAllowedOrigin("tauri://localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("http://tauri.localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("https://tauri.localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("tauri://evil.example", allowed)).toBe(false);
    expect(isAllowedOrigin("https://tauri.localhost.evil.example", allowed)).toBe(false);
  });
});
