import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Home directories whose agent logs we follow. On Windows that is the user's
 * own home plus every home inside running WSL distros, since most agents
 * there run under WSL. `AGENT_HOMES` (path-list) overrides discovery.
 */
const sep = process.platform === "win32" ? ";" : ":";
const fixed = process.env.AGENT_HOMES?.split(sep).filter(Boolean);
const own = homedir().replaceAll("\\", "/");

let cached: string[] = fixed ?? [own];
let checkedAt = 0;
const RECHECK_MS = 30_000;

export function homes(): string[] {
  if (fixed || process.platform !== "win32") return cached;
  if (Date.now() - checkedAt > RECHECK_MS) {
    checkedAt = Date.now();
    cached = [own, ...wslHomes()];
  }
  return cached;
}

/** `/home/*` of each running distro, as `//wsl.localhost/<distro>/home/<user>`. */
function wslHomes(): string[] {
  let distros: string[];
  try {
    // Only running ones: touching a stopped distro's files would boot it.
    const r = Bun.spawnSync(["wsl.exe", "--list", "--running", "--quiet"], { windowsHide: true });
    distros = new TextDecoder("utf-16le").decode(r.stdout).split(/\r?\n/).map((s) => s.replace(/\0/g, "").trim());
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const d of distros.filter(Boolean)) {
    const base = `//wsl.localhost/${d}/home`;
    try {
      if (!existsSync(base)) continue;
      for (const user of readdirSync(base)) out.push(`${base}/${user}`);
    } catch {}
  }
  return out;
}
