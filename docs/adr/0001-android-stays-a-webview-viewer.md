# 0001 — Android stays a WebView viewer rather than a native Compose app

Accepted, 2026-11-06.

## Context

The Android app is not a port of Agent Office. It is a shell that finds the hub and then
steps out of the way: it scans the QR code the desktop app shows, then hands the WebView
over to the collector with a single redirect in `apps/mobile/src/main.ts`.

```ts
setTimeout(() => location.replace(hub.href), 700);
```

Everything after that redirect is `apps/web`, the same interface the desktop app runs,
served by the collector over Tailscale. The phone is a second screen onto one machine's
office, not a separate client.

The sizes make the asymmetry plain:

| | Lines |
| --- | --- |
| `apps/mobile` TypeScript | 99 |
| `apps/mobile` Rust | 15 |
| `apps/web` TypeScript | 4,185 |
| of which the 3D scene alone | 2,058 |

The question of rewriting the Android side in Jetpack Compose came up twice, prompted by
real friction: a Settings dialog that overflowed the screen (#17), and one-finger drags
that zoomed the page instead of moving the camera (#14). Both felt like platform
limitations.

Neither was. The dialog was a fixed `max-w-[500px]` with no height limit in our own CSS,
in the one panel that had no phone handling while the HUD and Timeline already adapted.
The gestures were fixed by correcting pointer capture in OrbitControls. Diagnosing the
cause before choosing a remedy is what this record exists to preserve.

## Decision

Android keeps the current shape: a thin Tauri shell whose only jobs are pairing and
hosting the WebView. The interface stays `apps/web`, shared with desktop.

## Consequences

**Easier.** Every feature is built once. A change to the office scene reaches desktop and
phone in the same commit, and the two can never drift. Phones already get their own
treatment where it matters — the quality preset defaults to `saver` on phones in
`apps/web/src/settings.ts`, and Tailwind's `md` breakpoint drives the phone layouts.

**Harder.** 3D performance is bounded by three.js in a WebView rather than a native
renderer. Touch handling is at the mercy of the browser's pointer model: the gesture fix
in #16 needed a 180-line patch against `three-stdlib@2.36.1`, which now has to be rebased
on every upgrade of that dependency. Fluent UI ships desktop density, so phone ergonomics
are ours to dress by hand (#18).

**Rejected alternative.** A Compose rewrite would mean reimplementing the 2,058-line scene
against Filament or OpenGL — models, materials, lighting, labels, camera controls — plus
the HUD, Timeline, Settings and the WebSocket client, and then maintaining two interfaces
for one product indefinitely. The real wins would be 3D performance and native gesture
handling. Neither is what prompted the question.

## When to revisit

Any one of these makes this record worth replacing:

- Android stops being a viewer and grows features of its own, so a shared interface starts
  costing more than it saves.
- WebView 3D performance is **measured** on target devices and found to be the blocker —
  frame times and memory written down, not an impression.
- Maintaining the `three-stdlib` patch becomes a recurring tax rather than a one-off,
  for example if it has to be rebased on most upgrades.

A complaint that something feels wrong on the phone is not on this list. Check whether it
is our CSS first; twice now, it was.
