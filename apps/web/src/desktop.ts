// Bridges to the Tauri shell. The page is served by the collector, so all of this
// must also work (as no-ops or web fallbacks) in a plain browser.

const isTauri = "__TAURI_INTERNALS__" in window;
/** The Android app: a viewer pointed at a hub, without the desktop shell's tray/autostart. */
export const isMobileApp = isTauri && /Android|iPhone|iPad/i.test(navigator.userAgent);
export const isDesktop = isTauri && !isMobileApp;
/** The Android app's own connect screen (Tauri serves its bundled files from this origin). */
export const CONNECT_PAGE = "http://tauri.localhost/?change=1";

export async function notify(title: string, body: string) {
  if (isTauri) {
    const n = await import("@tauri-apps/plugin-notification");
    if (!(await n.isPermissionGranted()) && (await n.requestPermission()) !== "granted") return;
    n.sendNotification({ title, body });
    return;
  }
  if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "/icon.png" });
}

/** Browsers only let a click ask for notification permission. */
export function askNotifyPermission() {
  if (!isTauri && "Notification" in window && Notification.permission === "default") void Notification.requestPermission();
}

export async function getAutostart(): Promise<boolean> {
  if (!isDesktop) return false;
  return (await import("@tauri-apps/plugin-autostart")).isEnabled();
}

export async function setAutostart(on: boolean) {
  const a = await import("@tauri-apps/plugin-autostart");
  await (on ? a.enable() : a.disable());
}

export async function setCloseToTray(on: boolean) {
  if (!isDesktop) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_close_to_tray", { enabled: on });
}
