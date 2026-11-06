# Contributing to Agent Office

Thanks for taking a look. Bug reports, adapters for new agents, and fixes are all welcome.

## Getting set up

You need [Bun](https://bun.sh) 1.4.3 or newer. For the desktop app you also need a Rust toolchain
and Tauri's system dependencies.

```bash
bun install
bun run dev        # collector :4747 + web :5173 → http://127.0.0.1:5173
bun run dev:demo   # fake data for every agent, no real agent needed
```

`bun run dev:demo` is the fastest way to see your change: it makes up sessions for every supported
agent, so you do not need Claude Code or Codex actually running.

## Before you open a pull request

```bash
bun run typecheck   # all workspaces
bun test
```

CI runs exactly these two on every pull request, so a green local run means a green CI run. If you
touched `apps/desktop/src-tauri` or `apps/mobile/src-tauri`, also check the Rust side:

```bash
cd apps/desktop/src-tauri && cargo check
```

Please keep pull requests to one concern, and say in the description what you did to verify the
change — "ran it against a real Claude Code session" is worth more than a screenshot of the tests
passing.

## Layout

| Path             | What lives there                                                     |
| ---------------- | -------------------------------------------------------------------- |
| `apps/collector` | Bun server: tails agent logs, serves the web app and the WebSocket   |
| `apps/web`       | React Three Fiber scene, HUD, timeline                               |
| `apps/desktop`   | Tauri app for Windows and Linux, bundles the collector as a sidecar  |
| `apps/mobile`    | Tauri Android app, a thin viewer                                     |
| `packaging/aur`  | Arch package that repackages the released `.deb`                     |
| `docs/adr`       | Why the project is shaped the way it is                              |

If you are about to propose a different shape for part of the project — a native Android
app, a different UI library — read [`docs/adr`](docs/adr/) first. The decision may already
be recorded there, along with what would have to change for it to be worth revisiting.

## Adding an agent

This is the most useful contribution, and the one the code is shaped for:

1. Write a `JsonlAdapter` in `apps/collector/src/adapters/` that turns one log line into
   `AgentEvent[]`. The shapes are in `apps/collector/src/types.ts`, and the existing adapters are
   short — `gemini.ts` is a good starting point.
2. Register it in the adapter list in `apps/collector/src/index.ts`.
3. Give it a color in `apps/web/src/agents.ts`.
4. If it reports tools under unfamiliar names, map them in `apps/collector/src/classify.ts`
   (tool → animation) and `apps/web/src/roles.ts` (tool → which character handles it).
5. Add the log path to the agent table in the README.

Note in your pull request which version of that agent you tested against. These log formats are
internal to each agent and change without notice, so knowing the version a parser was written for
is genuinely useful later.

## Touching the collector's security rules

`apps/collector/src/security.ts` decides which `Host`, `Origin`, and token combinations are
allowed, and the session logs it guards contain your prompts and code. Changes there need a test
in `security.test.ts` or `security.integration.test.ts` covering the case you changed, and a note
in the pull request on what is now reachable that was not before. See
[SECURITY.md](SECURITY.md) for the guarantees these rules are meant to hold up.

## Reporting a bug

Please include your OS, how you installed Agent Office, which agent you were watching, and what
the collector printed. For the desktop app, running the binary from a terminal shows the
collector's output, which is usually where the answer is.

Security issues go through
[private vulnerability reporting](https://github.com/ignitrondev/agent-office/security/advisories/new)
instead of the issue tracker.

## License

Contributions are licensed under [Apache-2.0](LICENSE), the same as the project.
