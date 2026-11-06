// In-app updates for the desktop app. The page is served by the collector, so every Tauri
// call here must stay a no-op in a plain browser, in the Android viewer, and in dev.

import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isDesktop } from "./desktop";

/** The update the last check found, kept so install() does not have to look it up again. */
let pending: Update | null = null;

/**
 * Looks for a newer release. Returns null when there is nothing to install, which is also what
 * a browser, the Android viewer and `bun run dev` get: the updater only exists in a packaged
 * desktop build, and an unreachable endpoint must never break the office.
 */
export async function checkForUpdate(): Promise<{ version: string; notes?: string } | null> {
  if (!isDesktop) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    return pending ? { version: pending.version, notes: pending.body } : null;
  } catch (e) {
    throw new Error(explain(e));
  }
}

/**
 * Downloads and installs the update the last check found, reporting bytes as they arrive.
 * Resolves once the app is ready to restart; it does not restart by itself, because the user
 * may be watching a run they would rather not interrupt.
 */
export async function installUpdate(onProgress: (received: number, total?: number) => void): Promise<void> {
  if (!pending) throw new Error("No update to install. Check again first.");
  let received = 0;
  let total: number | undefined;
  try {
    await pending.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === "Started") {
        total = event.data.contentLength;
        onProgress(0, total);
      } else if (event.event === "Progress") {
        received += event.data.chunkLength;
        onProgress(received, total);
      } else if (event.event === "Finished") {
        onProgress(total ?? received, total);
      }
    });
  } catch (e) {
    throw new Error(explain(e));
  }
}

/** Restarts into the version just installed. */
export async function restartApp(): Promise<void> {
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

/** Turns the updater's errors into something that says what to do about them. */
function explain(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  if (/signature|pubkey|public key/i.test(text)) return "This update failed its signature check and was not installed.";
  if (/network|dns|resolve|connect|timed? ?out/i.test(text)) return "Could not reach the update server.";
  return text || "The update check failed.";
}
