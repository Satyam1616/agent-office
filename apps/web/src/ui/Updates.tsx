import { Button, Field, Spinner } from "@fluentui/react-components";
import { ArrowDownload20Regular, ArrowClockwise20Regular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { isDesktop } from "../desktop";
import { checkForUpdate, installUpdate, restartApp } from "../update";

type State =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "none" }
  | { phase: "found"; version: string }
  | { phase: "downloading"; version: string; received: number; total?: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string };

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

/**
 * Checks for a new version once when Settings opens, and installs on request. Desktop only:
 * .deb, .rpm and AUR builds update through the package manager, and the Android viewer
 * through however its APK was installed.
 */
export function UpdateSettings({ open }: { open: boolean }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const check = async (manual: boolean) => {
    setState({ phase: "checking" });
    try {
      const found = await checkForUpdate();
      setState(found ? { phase: "found", version: found.version } : { phase: "none" });
    } catch (e) {
      // An automatic check that fails stays quiet; only say so when the user asked.
      setState(manual ? { phase: "error", message: (e as Error).message } : { phase: "idle" });
    }
  };

  useEffect(() => {
    // Deliberately keyed on `open` alone: one check per time the dialog is opened.
    if (open && isDesktop && state.phase === "idle") void check(false);
  }, [open]);

  if (!isDesktop) return null;

  const install = async (version: string) => {
    setState({ phase: "downloading", version, received: 0 });
    try {
      await installUpdate((received, total) => setState({ phase: "downloading", version, received, total }));
      setState({ phase: "ready", version });
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message });
    }
  };

  return (
    <Field label="Updates" hint={hint(state)}>
      {state.phase === "checking" && <Spinner size="tiny" label="Checking…" labelPosition="after" />}

      {(state.phase === "idle" || state.phase === "none" || state.phase === "error") && (
        <div>
          <Button icon={<ArrowClockwise20Regular />} onClick={() => void check(true)}>
            Check for updates
          </Button>
        </div>
      )}

      {state.phase === "found" && (
        <div>
          <Button appearance="primary" icon={<ArrowDownload20Regular />} onClick={() => void install(state.version)}>
            Install {state.version}
          </Button>
        </div>
      )}

      {state.phase === "downloading" && (
        <Spinner
          size="tiny"
          labelPosition="after"
          label={state.total ? `Downloading ${mb(state.received)} of ${mb(state.total)}…` : "Downloading…"}
        />
      )}

      {state.phase === "ready" && (
        <div>
          <Button appearance="primary" onClick={() => void restartApp()}>
            Restart to finish
          </Button>
        </div>
      )}
    </Field>
  );
}

function hint(state: State): string {
  switch (state.phase) {
    case "none":
      return "You are on the latest version.";
    case "found":
      return `Version ${state.version} is available.`;
    case "ready":
      return `Version ${state.version} is installed and starts on the next launch.`;
    case "error":
      return state.message;
    default:
      return "Agent Office installs updates itself. Package manager builds update through apt, dnf or pacman instead.";
  }
}
