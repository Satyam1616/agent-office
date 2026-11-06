import { cancel, checkPermissions, Format, requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";

// Connect screen: find the hub (a computer running Agent Office with phone access on),
// then hand the whole webview over to it. The office UI itself comes from the hub.

const HUB_KEY = "agent-office-hub";
const REACH_TIMEOUT_MS = 6000;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const statusEl = $<HTMLParagraphElement>("status");
const link = $<HTMLInputElement>("link");
const buttons = [...document.querySelectorAll("button")];

function say(text: string, kind: "info" | "error" = "info") {
  statusEl.textContent = text;
  statusEl.className = `m-0 min-h-5 ${kind === "error" ? "text-[#ff8a8a]" : "text-[#8b93a3]"}`;
}

const busy = (on: boolean) => buttons.forEach((b) => (b.disabled = on));

const overlay = $<HTMLDivElement>("overlay");
const scanUi = $<HTMLDivElement>("scan-ui");
const connectUi = $<HTMLDivElement>("connect-ui");

const show = (el: HTMLElement, on: boolean, display = "flex") => (el.style.display = on ? display : "none");

/** Camera mode: hide the page so the preview behind the webview is visible. */
function showScanner(on: boolean) {
  document.documentElement.classList.toggle("scanning", on);
  show(overlay, on, "block");
  show(scanUi, on);
  show(connectUi, false);
}

/**
 * Connection progress, over an opaque background. Without this the phone sits on a blank
 * screen between a successful scan and the office finishing its first paint.
 */
function showConnecting(message: string, host: string, state: "working" | "done" | "failed") {
  document.documentElement.classList.remove("scanning");
  show(overlay, true, "block");
  show(scanUi, false);
  show(connectUi, true);
  show($("connect-spinner"), state === "working", "block");
  show($("connect-tick"), state === "done", "block");
  show($("connect-back"), state === "failed", "block");
  $("connect-msg").textContent = message;
  $("connect-host").textContent = host;
}

const hideOverlay = () => {
  document.documentElement.classList.remove("scanning");
  show(overlay, false);
};

/** True while the camera UI is up. Guards every teardown path against running twice. */
let scanning = false;
/** Bumped on every teardown, so a scan that resolves afterwards is ignored. */
let scanSeq = 0;

/**
 * Takes the scanner down without waiting for `scan()`.
 *
 * `scan()` does not reliably settle: cancelling from the button, or dismissing the camera with
 * the Android back gesture, can leave the promise pending for good. Teardown that waited for it
 * left the page transparent with the form hidden, which is a dead end. So the UI is restored
 * here and now, and whatever `scan()` eventually does is checked against `scanSeq` and dropped.
 */
function endScan(stopCamera: boolean) {
  if (!scanning) return;
  scanning = false;
  scanSeq++;
  showScanner(false);
  // Drop the entry pushed for the back gesture, or the next back press would do nothing
  // visible. When this runs *from* popstate the entry is already gone, so the check is false.
  if (history.state?.scanning) history.back();
  if (stopCamera) void cancel().catch(() => {});
}

$("scan-cancel").addEventListener("click", () => endScan(true));
$("connect-back").addEventListener("click", hideOverlay);

// Best effort for the Android back gesture, which closes the camera without telling the page.
window.addEventListener("popstate", () => endScan(true));

/**
 * Last resort: if the camera is gone but the overlay is somehow still up, tapping the dark area
 * gets out. Without it a missed teardown traps the user on a screen with no controls.
 */
scanUi.addEventListener("click", (e) => {
  if (e.target === scanUi) endScan(true);
});

/** The QR code / link from Settings: http://<tailscale-ip>:<port>/?token=<token>. */
function parseHub(text: string): URL | null {
  try {
    const url = new URL(text.trim());
    return /^https?:$/.test(url.protocol) && url.searchParams.get("token") ? url : null;
  } catch {
    return null;
  }
}

/** Any answer at all means the hub is reachable; the page itself checks the token. */
async function reachable(hub: URL) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REACH_TIMEOUT_MS);
  try {
    await fetch(new URL("/api/health", hub), { mode: "no-cors", signal: abort.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function connect(hub: URL) {
  busy(true);
  say(`Connecting to ${hub.host}…`);
  showConnecting("Connecting…", hub.host, "working");
  if (!(await reachable(hub))) {
    const problem = `Can't reach ${hub.host}. Is Tailscale on (on both devices) and the computer awake?`;
    say(problem, "error");
    showConnecting(problem, hub.host, "failed");
    busy(false);
    return;
  }
  localStorage.setItem(HUB_KEY, hub.href);
  // Hold the confirmation on screen for a beat: the office takes a moment to paint, and
  // replacing the page instantly reads as nothing having happened.
  showConnecting("Connected — opening the office…", hub.host, "done");
  setTimeout(() => location.replace(hub.href), 700);
}

async function scanCode() {
  let perm = await checkPermissions();
  if (perm !== "granted") perm = await requestPermissions();
  if (perm !== "granted") {
    say("Camera permission is needed to scan. You can paste the link instead.", "error");
    return;
  }
  // `windowed: true` keeps the webview on top of the camera preview, which is the only way
  // to draw a frame over it; the default hands the whole screen to the camera.
  scanning = true;
  const seq = scanSeq;
  showScanner(true);
  // An entry of our own, so the back gesture pops it and reaches the popstate handler above.
  history.pushState({ scanning: true }, "");

  let content: string;
  try {
    content = (await scan({ windowed: true, formats: [Format.QRCode] })).content;
  } catch (err) {
    endScan(false);
    if (/cancel/i.test(String(err))) return;
    throw err;
  }
  // Torn down while the camera was still running: the user asked to stop, so honour that.
  if (seq !== scanSeq) return;
  endScan(false);

  const hub = parseHub(content);
  if (!hub) {
    say("That QR code isn't an Agent Office link.", "error");
    return;
  }
  link.value = hub.href;
  await connect(hub);
}

$("scan").addEventListener("click", () => {
  scanCode().catch((err) => {
    // Cancelling rejects the scan too, and that is not a failure worth reporting.
    const text = String(err);
    if (!/cancel/i.test(text)) say(`Scan failed: ${text}`, "error");
  });
});

$("manual").addEventListener("submit", (e) => {
  e.preventDefault();
  const hub = parseHub(link.value);
  if (hub) void connect(hub);
  else say("Paste the whole link, including ?token=…", "error");
});

$("forget").addEventListener("click", () => {
  localStorage.removeItem(HUB_KEY);
  link.value = "";
  $("saved").classList.replace("flex", "hidden");
  say("");
});

// Reopen the last hub straight away, unless we came back here to change it.
const saved = parseHub(localStorage.getItem(HUB_KEY) ?? "");
if (saved) {
  link.value = saved.href;
  $("saved-host").textContent = saved.host;
  $("saved").classList.replace("hidden", "flex");
  if (!new URLSearchParams(location.search).has("change")) void connect(saved);
}
