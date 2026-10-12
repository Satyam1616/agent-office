// Compiles the collector into a standalone binary that Tauri ships as a sidecar.
// Usage: bun scripts/build-collector.ts [rust-target-triple]   (defaults to the host)
import { $ } from "bun";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BUN_TARGET: Record<string, string> = {
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
};

const triple =
  process.argv[2] ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? (await $`rustc --print host-tuple`.text()).trim();
const target = BUN_TARGET[triple];
if (!target) throw new Error(`no Bun target for ${triple}`);

const dir = join(import.meta.dir, "../src-tauri/binaries");
mkdirSync(dir, { recursive: true });
const out = join(dir, `agent-office-collector-${triple}${triple.includes("windows") ? ".exe" : ""}`);
const entry = join(import.meta.dir, "../../collector/src/index.ts");

await $`bun build ${entry} --compile --minify --target=${target} --outfile ${out}`;
console.log(`[desktop] collector → ${out}`);
