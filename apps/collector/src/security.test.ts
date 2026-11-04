import { describe, expect, it } from "bun:test";
import { getAllowedHosts, isAllowedHost, isAllowedOrigin, normalizeHost } from "./security";

describe("Security - normalizeHost", () => {
  it("normalizes localhost and ports", () => {
    expect(normalizeHost("localhost:4747")).toBe("localhost");
    expect(normalizeHost("127.0.0.1:4747")).toBe("127.0.0.1");
    expect(normalizeHost("[::1]:4747")).toBe("::1");
    expect(normalizeHost("localhost")).toBe("localhost");
  });

  it("handles empty or malformed inputs gracefully", () => {
    expect(normalizeHost("")).toBe("");
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
  });
});

describe("Security - Host Allowlist (DNS Rebinding Prevention)", () => {
  const allowed = getAllowedHosts(["100.64.0.5"], undefined, "127.0.0.1");

  it("allows valid local and tailscale hosts", () => {
    expect(isAllowedHost("localhost:4747", allowed)).toBe(true);
    expect(isAllowedHost("127.0.0.1:4747", allowed)).toBe(true);
    expect(isAllowedHost("[::1]:4747", allowed)).toBe(true);
    expect(isAllowedHost("100.64.0.5:4747", allowed)).toBe(true);
    expect(isAllowedHost("localhost", allowed)).toBe(true);
  });

  it("blocks DNS rebinding and malicious host headers", () => {
    expect(isAllowedHost("evil.com:4747", allowed)).toBe(false);
    expect(isAllowedHost("rebind.attacker.org", allowed)).toBe(false);
    expect(isAllowedHost("127.0.0.1.nip.io:4747", allowed)).toBe(false);
    expect(isAllowedHost("localhost.attacker.com", allowed)).toBe(false);
    expect(isAllowedHost(null, allowed)).toBe(false);
    expect(isAllowedHost("", allowed)).toBe(false);
  });
});

describe("Security - Origin Allowlist (CSWSH & Data Theft Prevention)", () => {
  const allowed = getAllowedHosts(["100.64.0.5"], undefined, "127.0.0.1");

  it("permits non-browser clients without Origin header (curl, relay, peer ws)", () => {
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
    expect(isAllowedOrigin(null, allowed)).toBe(true);
    expect(isAllowedOrigin("", allowed)).toBe(true);
  });

  it("permits legitimate local web and dev origins", () => {
    expect(isAllowedOrigin("http://localhost:5173", allowed)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4747", allowed)).toBe(true);
    expect(isAllowedOrigin("http://[::1]:4747", allowed)).toBe(true);
    expect(isAllowedOrigin("http://100.64.0.5:4747", allowed)).toBe(true);
  });

  it("permits legitimate Tauri app origins", () => {
    expect(isAllowedOrigin("tauri://localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("http://tauri.localhost", allowed)).toBe(true);
    expect(isAllowedOrigin("https://tauri.localhost", allowed)).toBe(true);
  });

  it("blocks malicious origins, CSWSH attempts, and null sandbox origins", () => {
    expect(isAllowedOrigin("https://evil.com", allowed)).toBe(false);
    expect(isAllowedOrigin("http://evil.com:4747", allowed)).toBe(false);
    expect(isAllowedOrigin("http://attacker.local", allowed)).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1.attacker.com", allowed)).toBe(false);
    expect(isAllowedOrigin("null", allowed)).toBe(false); // sandboxed iframe
    expect(isAllowedOrigin("javascript:void(0)", allowed)).toBe(false);
  });
});
