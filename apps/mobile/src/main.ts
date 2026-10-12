import { checkPermissions, Format, requestPermissions, scan } from "@tauri-apps/plugin-barcode-scanner";

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
  if (!(await reachable(hub))) {
    say(`Can't reach ${hub.host}. Is Tailscale on (on both devices) and the computer awake?`, "error");
    busy(false);
    return;
  }
  localStorage.setItem(HUB_KEY, hub.href);
  location.replace(hub.href);
}

async function scanCode() {
  let perm = await checkPermissions();
  if (perm !== "granted") perm = await requestPermissions();
  if (perm !== "granted") {
    say("Camera permission is needed to scan. You can paste the link instead.", "error");
    return;
  }
  const result = await scan({ windowed: false, formats: [Format.QRCode] });
  const hub = parseHub(result.content);
  if (!hub) {
    say("That QR code isn't an Agent Office link.", "error");
    return;
  }
  link.value = hub.href;
  await connect(hub);
}

$("scan").addEventListener("click", () => {
  scanCode().catch((err) => say(`Scan failed: ${String(err)}`, "error"));
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
