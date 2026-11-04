# Agent Office

A 3D virtual office that shows every coding agent on your machine at work, in real time.
Each agent gets its own room and each session becomes a character at a desk. Animations,
monitor screens and speech bubbles follow what the agent is doing: reading files, coding,
running commands, browsing, planning, delegating to subagents, waiting for you, or idling.

**Download:** grab the installer for Windows (`.exe` / `.msi`), Linux (`.deb` / `.rpm` /
`.AppImage`) or Android (`.apk`) from [Releases](https://github.com/bimaadam/agent-office/releases).

## A team per session

Each session shows up as a pod of 6 characters. Every tool call is handled by the character
whose role fits it, and when work moves to another role a sheet of paper flies to that desk:

| Role        | Handles                                                         |
| ----------- | --------------------------------------------------------------- |
| 📋 Lead     | thinking, chatting, planning, delegating, waiting for you       |
| 📖 Reader   | reading files, grep/glob                                        |
| ⌨️ Coder    | edit / write / patch                                            |
| 🖥️ Bash     | terminal commands                                               |
| 🌐 Research | web search / fetch                                              |
| 🔍 Reviewer | verification commands: test, lint, tsc, git diff, audit…        |

Roles are purely visual and derived from tool calls in `apps/web/src/roles.ts`.
Real subagents sit on their own in the front row of the room.

## Three looks: office, robots, or factory

Pick one from the dropdown in the top-left corner (or `?theme=office|robots|factory`); the
browser remembers your choice.

- **👥 Office**: each session is a team of 6 people at desks.
- **🤖 Robots**: same, but with animated 3D robots (body color = agent color).
  Coding/terminal = Punch, reading = Yes, searching = No, chatting = Wave, waiting for you =
  Jump, idle = sitting. A finished turn makes the team give a ThumbsUp; a failed tool makes
  them shake their heads.
- **🏭 Factory**: each session is a production cell. The files being worked on become
  workpieces on a conveyor, moving from machine to machine:

| Role     | Machine         | Animation                                       |
| -------- | --------------- | ----------------------------------------------- |
| Lead     | 🦾 Robot Arm    | arm swings to hand off the workpiece            |
| Reader   | 🔦 3D Scanner   | laser beam sweeps the workpiece                 |
| Coder    | ⚙️ CNC Mill     | spindle spins, metal chips fly (edits)          |
|          | 🖨️ 3D Printer   | part grows layer by layer (new files)           |
| Bash     | ⚡ Laser Cutter | gantry moves, green beam, sparks                |
| Research | 📡 Dish & Dock  | dish rotates, signal waves                      |
| Reviewer | 🔬 QC / CMM     | probe checks; 🟢 pass / 🔴 fail lamp            |
| Subagent | 🛻 AGV          | transport robot shuttling back and forth        |

Andon lamp per cell: 🟢 running, 🟡 blinking = waiting for you, 🔴 last tool failed.
The 📦 bin counts finished turns. The left panel shows parts, ops and fail rate.
Pass/fail comes from each agent's log (`is_error`, exit codes, `status: error`, etc).

## Sound

Use the 🔇/🔊 button next to the dropdown. Factory machines use **real recordings** (CC0 from
Freesound, see `apps/web/public/sounds/README.md`): ⚙️ CNC mill while an agent edits a file,
🖨️ stepper motors while it creates a new file, ⚡ laser cutter while it runs a command. The rest
is synthesized with Web Audio: conveyor rumble, 🔬 the QC probe's servo whir with a tick and beep
on every touch plus a double beep when a check passes, keyboard typing in the office, a "ding" when a
turn finishes, a buzzer when a tool fails, an alarm when an agent is waiting for you, and a chime
when a new session arrives.

## Replay

Hit **⏪ Replay** at the bottom (or `?mode=replay`). The collector stores every live event in
SQLite (`apps/collector/agent-office.db`); replay runs them back through the same reducer on a
virtual clock, just for that viewer (live viewers are unaffected). Choose a range of
15m/1h/6h/24h/All, play/pause, speed 1×–600×, and drag the slider to jump. History only
starts from the first time this collector version runs.

## Running from source

```bash
bun install
bun run dev        # collector :4747 + web :5173 → open http://127.0.0.1:5173
bun run dev:demo   # fake data for every agent, handy for looking around
```

Add `?zoom=40` to the URL to set the initial zoom. Click a character to see its session details.

The collector checks each request's `Host` and browser `Origin` against local, Tailscale, and
configured hostnames, including the port. The Vite origin on `localhost:5173` is allowed only by
the collector's development command. Requests from relays and peer collectors may omit `Origin`.
The collector does not send `Access-Control-Allow-Origin`.

`HOST` controls the address the collector binds to. `HOST=0.0.0.0` listens on every IPv4
interface and requires a `TOKEN` of at least 16 characters, but it does not make arbitrary Host
headers valid. LAN IP addresses are not added automatically; plain LAN sharing is unsupported.
To intentionally serve a known hostname through a reverse proxy, set `ALLOWED_HOSTS` to a
comma-separated list (for example `ALLOWED_HOSTS=office.example.com`) and have the proxy preserve
that Host. When the proxy omits a port, the browser Origin must use its standard port (80 for HTTP
or 443 for HTTPS). Configure the proxy to restrict access and terminate HTTPS; the collector
checks the public hostname and Origin but does not itself provide TLS. Set `TOKEN` for viewers
coming through the proxy and pass it to the collector as `?token=...` (the collector also accepts
`Authorization: Bearer ...`).

On Tailscale, the machine's short hostname is accepted immediately, including while the initial
Tailscale status poll is running. Its full MagicDNS name and Tailscale IPs are added from the
cached local status, even when sharing with other devices is off; the collector refreshes that
status in the background. This lookup is cached by the Tailnet client and does not launch a
Tailscale process per request.

## Desktop app (Windows & Linux)

Installers are on the Releases page: `.exe`/`.msi` for Windows, `.deb`/`.rpm`/`.AppImage` for
Linux. Install, open, done: no Bun required.

- Built with [Tauri](https://tauri.app): it uses the OS's own webview (WebView2 / WebKitGTK)
  instead of shipping Chromium like Electron. The collector is compiled into a single binary
  (`bun build --compile`) that runs in the background using about 30MB of RAM.
- If a collector is already running on port 4747 (e.g. `bun run dev` inside WSL), the app uses
  it instead of starting its own.
- **Windows + WSL:** the Windows app automatically reads agent logs from your Windows home *and*
  from `/home/*` of every running WSL distro (via `\\wsl.localhost`). Stopped distros are left
  alone so they don't get booted. Override with the `AGENT_HOMES` env var (`;`-separated).
- Closing the window keeps it running in the tray (right-click the tray icon to quit). Settings
  (gear icon) has graphics quality, notifications when an agent finishes or waits for you,
  close-to-tray and start at sign-in. Launching it a second time just brings the window back.
- History is stored in the app's data folder (`%APPDATA%\dev.bimaadam.agentoffice` /
  `~/.local/share/dev.bimaadam.agentoffice`).

**Arch / EndeavourOS / Manjaro:** use the PKGBUILD in `packaging/aur/` (installs the `.deb`
with Arch's own WebKitGTK and GStreamer, so sound works and it shows up in the app menu):

```bash
cd packaging/aur && makepkg -si
```

Build it yourself:

```bash
bun run app:build   # needs Rust + (Linux) libwebkit2gtk-4.1-dev; output in apps/desktop/src-tauri/target/release/bundle
```

Or push a `v*` tag (e.g. `git tag v0.1.0 && git push --tags`): GitHub Actions builds the Windows,
Linux and Android installers and attaches them to a draft release.

## All your devices in one office (Tailscale)

Turn on **Settings → Your devices → Share with my devices** on each computer. Every computer
signed in to your Tailscale account that also runs Agent Office then shows up in every other
one's office, labelled `@machine`. No hub, no token, no login: Tailscale already knows which
devices are yours, so a connection is let in only if it comes from a device signed in as the
same Tailscale user. Devices of people you share your tailnet with, and tagged servers, stay out.

- Each device only shares its own sessions, so nothing is counted twice. A WSL collector and the
  Windows app on the same PC report the same sessions, which are merged.
- Settings lists your devices and whether each one is connected.
- Off by default. Plain LAN without Tailscale isn't supported (anyone on that Wi-Fi could read
  your prompts).
- Windows asks once whether Agent Office may accept connections; allow it for private networks.
- Replay and the tool-call counters still cover this computer only.

## Android

The Android app is a viewer: install the `.apk`, turn on sharing on a computer (above), then scan
the QR code shown under **Settings → Phone**, or paste its link. The app reopens the last
computer automatically; **Settings → Change hub** goes back to the connect screen. Phones use
the light "Power saver" graphics and a compact layout where Agents and Live feed open as panels.

You can also skip the app: phones on your Tailscale account can open `http://<computer>:4747`
in the browser (or scan the QR code with the camera).

The phone needs Tailscale too. Notifications only arrive while the app is open.

Build it yourself with the Android SDK + NDK: `cd apps/mobile && bun run apk` (signing reads
`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS`).

## Watching from another machine

Real-time, with about a second of delay. By default the server is only reachable from the
machine itself. To go across machines, use Tailscale so you don't have to open ports to the
internet.

**1. Make this machine the hub** (web + collector on one port, token required):

```bash
export TOKEN=$(openssl rand -hex 16)   # keep it, viewers and relays need it
HOST=$(tailscale ip -4) bun run start  # builds the web app, then serves it on :4747
```

**2. Watch from another device on your tailnet:** open `http://<hub-tailscale-ip>:4747/?token=<TOKEN>`.
The browser remembers the token, so next time the plain URL is enough.

**3. Bring agents from another laptop into the office:** on that laptop, clone this repo and run:

```bash
bun install
TOKEN=<TOKEN> RELAY_TO=http://<hub-tailscale-ip>:4747 bun run relay
```

The relay reads the agent logs on that laptop and sends the events to the hub. Each pod gets an
`@machine-name` label (change it with `MACHINE=name`). If the hub restarts, the relay reconnects
on its own and resends the latest state.

Notes:
- The server refuses to listen on anything other than localhost unless `TOKEN` is set (at least
  16 characters).
- WSL2 in NAT mode isn't reachable from the LAN directly. Running Tailscale inside WSL
  (`tailscale ip -4`) gets around that.
- Traffic is plain HTTP, which is fine over Tailscale (already encrypted with WireGuard).
  Don't expose it to the public internet without HTTPS.

## How it works

```
each agent's session logs ──► apps/collector (Bun) ──WebSocket──► apps/web (React Three Fiber)
                               adapter → common event → per-session state (+ SQLite for stats)
```

The collector only **reads** the logs each agent already writes; no agent config is changed.
The server listens on `127.0.0.1` only, because the logs contain prompts and code.

| Agent       | Source                                              | Adapter                         |
| ----------- | --------------------------------------------------- | ------------------------------- |
| Claude Code | `~/.claude/projects/**/*.jsonl`                     | `adapters/claude.ts`            |
| Codex       | `~/.codex/sessions/**/rollout-*.jsonl`              | `adapters/codex.ts`             |
| Gemini CLI  | `~/.gemini/tmp/*/chats/*.jsonl`                     | `adapters/gemini.ts`            |
| Qwen Code   | `~/.qwen/projects/*/chats/*.jsonl`                  | `adapters/qwen.ts`              |
| Copilot CLI | `~/.copilot/session-state/*/events.jsonl`           | `adapters/copilot.ts`           |
| Kiro CLI    | `~/.kiro/sessions/cli/*.jsonl` (+ `.json` metadata) | `adapters/kiro.ts`              |
| OpenCode    | `~/.local/share/opencode/opencode.db` (SQLite)      | `adapters/opencode.ts`          |

Adding a new agent: write a `JsonlAdapter` that turns one log line into `AgentEvent[]` (see
`types.ts`), register it in `index.ts`, and add a color in `apps/web/src/agents.ts`. The tool
name → animation mapping lives in `classify.ts`.

Sessions quiet for 3 minutes go idle (💤); after 20 minutes they leave the office.

## Credits

Robot model: `RobotExpressive` by Tomás Laulhé (Quaternius), CC0 1.0, via the three.js examples
(`apps/web/public/models/robot/README.md`).

Machine sounds: CC0 recordings from Freesound by soundsofscienceupf, SoundsofTheMachine and
squashy555 (`apps/web/public/sounds/README.md`).

## Limitations

- These log formats are internal and can change with any agent update; adapters may need
  adjusting.
- Gemini only writes chat logs for saved sessions. Kiro IDE (Windows) isn't read from WSL, only
  kiro-cli.
- OpenCode inside WSL shows up late in the Windows app: SQLite can't lock across
  `\\wsl.localhost`, so the database is read without its WAL file and new updates only appear
  after a checkpoint. For real-time updates, run the collector inside WSL (`bun run start`) and
  the Windows app will use it automatically.
- Installers aren't signed yet, so Windows SmartScreen will ask first ("More info → Run anyway").
- The "waiting for permission" state is only detected for agents that log it (Codex, Copilot).
