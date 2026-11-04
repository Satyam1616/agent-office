import { startDemo } from "../../collector/src/demo";
import { SessionStore } from "../../collector/src/state";
import type { ServerMessage } from "./agents";

export const isDemoMode = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.location !== "undefined" &&
  new URLSearchParams(window.location.search).get("demo") === "1";

/**
 * Runs a standalone in-browser demo using SessionStore (the same reducer used
 * by the collector and replay) with synthetic agent events.
 * No backend collector connection is required.
 */
export function startStaticDemo(
  handle: (msg: ServerMessage) => void,
  onInit?: () => void,
) {
  onInit?.();

  const store = new SessionStore({
    machine: "demo-machine",
    broadcast: (msg) => handle(msg as ServerMessage),
    autoSweep: true,
  });

  startDemo((e, live) => store.apply(e, live));
}
