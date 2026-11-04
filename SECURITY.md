# Security policy

## Reporting a vulnerability

Please report security issues through GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/bimaadam/agent-office/security/advisories/new)
(Security → Advisories on the repository).

Please do not open a public issue for a vulnerability.

Include what you can: affected version, platform, and the smallest set of steps that shows the
problem. You should get a first reply within a week. If a report turns out to be valid, the fix
and an advisory are published together, and you are credited unless you ask otherwise.

## Supported versions

Fixes go onto `main` and into the next release. Older installers are not patched in place, so
please reproduce against the latest release before reporting.

## What this project exposes

Agent Office reads the session logs that coding agents already write to your home directory.
**Those logs contain your prompts, file contents, and command output.** The collector therefore
treats them as sensitive by default:

- It only ever **reads** agent logs, and changes no agent's configuration.
- It binds to `127.0.0.1` and refuses to listen on any other address unless `TOKEN` is set to at
  least 16 characters.
- Every request's `Host` and browser `Origin` are checked against local, Tailscale, and explicitly
  configured hostnames, **including the port**.
- Requests carrying `X-Forwarded-For`, `Forwarded`, or `Via` are never treated as loopback for
  authorization, so a reverse proxy cannot borrow loopback trust.
- `/api/remote`, which toggles phone and device sharing, requires a direct loopback `Host` and
  `Origin` and is disabled entirely whenever `ALLOWED_HOSTS` is set.
- `ALLOWED_HOSTS` without a 16-character `TOKEN` stops the collector from starting.

These rules live in `apps/collector/src/security.ts` and are covered by
`apps/collector/src/security.test.ts` and `security.integration.test.ts`.

Reports that are especially welcome: anything that reaches an `/api/` route, `/ws`, or `/ingest`
without a valid token from a non-loopback origin; anything that makes the collector bind or serve
beyond its configured host; and any path traversal out of the served web directory.

## Out of scope

- **Unsigned installers.** Windows SmartScreen warns on first run; this is known and noted in the
  README.
- **Deliberately widened configuration.** Setting `HOST=0.0.0.0` or `ALLOWED_HOSTS` with a valid
  `TOKEN` exposes your office on purpose. Terminating TLS and restricting access is the reverse
  proxy's job; the collector does not provide TLS.
- **Anything requiring an attacker who can already read your home directory.** At that point the
  agent logs are readable directly, without this app.
- Upstream agent log format changes that break an adapter. Those are bugs, not vulnerabilities.
