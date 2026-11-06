import { Button, Field, MessageBar, MessageBarBody, Switch, Tooltip } from "@fluentui/react-components";
import { ArrowClockwise20Regular, Copy20Regular, Desktop20Regular, Phone20Regular } from "@fluentui/react-icons";
import { useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import type { DeviceState, DeviceStatus } from "../../../collector/src/peers";
import type { RemoteStatus } from "../../../collector/src/remote";
import { useIsPhone } from "../useIsPhone";
import { Dot, muted } from "./labels";

type Sharing = RemoteStatus & { devices: DeviceStatus[]; problem?: string };

async function call(body?: { enabled?: boolean; rotate?: boolean }): Promise<Sharing | null> {
  const res = await fetch(
    "/api/remote",
    body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined,
  );
  return res.ok ? res.json() : null;
}

const STATE: Record<DeviceState, { color: string; label: (n: number) => string }> = {
  connected: { color: "#39ff88", label: (n) => `connected · ${n} session${n === 1 ? "" : "s"}` },
  connecting: { color: "#ffcc00", label: () => "connecting…" },
  "no-office": { color: "#8b93a3", label: () => "no Agent Office reachable" },
  offline: { color: "#4a5059", label: () => "offline" },
};

const isPhone = (os: string) => /android|ios/i.test(os);
const order = (s: DeviceState) => ["connected", "connecting", "no-office", "offline"].indexOf(s);

/**
 * Sharing over Tailscale: your other devices running Agent Office appear in this office
 * (and you in theirs), plus a QR code for the phone app. Only shown on the machine running
 * the collector; remote viewers get a 404 and see nothing.
 */
export function SharingSettings() {
  const phone = useIsPhone();
  const [st, setSt] = useState<Sharing | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const load = () => void call().then(setSt).catch(() => {});
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const url = st?.urls[0];
  const qr = useMemo(() => (url ? renderSVG(url, { border: 2, pixelSize: 5 }) : ""), [url]);
  if (!st) return null;

  const update = async (body: { enabled?: boolean; rotate?: boolean }) => {
    setBusy(true);
    setSt((await call(body).catch(() => null)) ?? st);
    setBusy(false);
  };
  const computers = st.devices.filter((d) => !isPhone(d.os));
  const online = computers.filter((d) => d.state !== "offline").sort((a, b) => order(a.state) - order(b.state));
  const offline = computers.length - online.length;

  return (
    <>
      <Field
        label="Your devices"
        hint="Computers signed in to your Tailscale account that also run Agent Office appear here, and see this one. No login needed."
      >
        <Switch
          label="Share with my devices (Tailscale)"
          checked={st.enabled}
          disabled={busy || (!st.tailscale && !st.enabled)}
          onChange={(_, d) => void update({ enabled: d.checked })}
        />
        {(st.problem || !st.tailscale) && (
          <MessageBar intent="warning" layout={phone ? "multiline" : "auto"}>
            <MessageBarBody>
              {st.problem ?? "No Tailscale address on this computer"}. Install Tailscale here and sign in to the same
              account as your other devices.
            </MessageBarBody>
          </MessageBar>
        )}
        {st.error && (
          <MessageBar intent="error" layout={phone ? "multiline" : "auto"}>
            <MessageBarBody>{st.error}</MessageBarBody>
          </MessageBar>
        )}
        {st.enabled && computers.length > 0 && (
          <ul className="m-0 mt-2 grid list-none gap-1 p-0">
            {online.map((d) => (
              <li key={d.ip} className="grid grid-cols-[20px_10px_1fr] items-center gap-2" title={d.dns}>
                <Desktop20Regular className="text-[#8b93a3]" />
                <Dot color={STATE[d.state].color} glow={d.state === "connected"} />
                <span className="truncate">
                  {d.name} <span className={muted}>· {STATE[d.state].label(d.sessions)}</span>
                </span>
              </li>
            ))}
            {offline > 0 && (
              <li className={`${muted} pl-7`} title="Devices on your tailnet that are offline right now">
                + {offline} offline
              </li>
            )}
          </ul>
        )}
      </Field>

      {st.enabled && url && (
        <Field label="Phone" hint="Scan with the Agent Office app, or your phone's camera to open it in the browser.">
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
            {/* uqr output is a self-contained SVG built from our own URL. */}
            <div
              className="shrink-0 rounded-md bg-white [&_svg]:block [&_svg]:size-[150px]"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <div className="flex min-w-0 flex-col gap-2">
              <code className="break-all text-[11px] text-[#c3c9d4]">{url}</code>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="small"
                  icon={<Copy20Regular />}
                  onClick={() => {
                    void navigator.clipboard?.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Tooltip content="Disconnects every phone using the current code" relationship="description">
                  <Button
                    size="small"
                    icon={<ArrowClockwise20Regular />}
                    disabled={busy}
                    onClick={() => void update({ rotate: true })}
                  >
                    New code
                  </Button>
                </Tooltip>
              </div>
              <span className={`${muted} text-[11px]`}>
                <Phone20Regular className="mr-1 inline-block align-[-0.3em]" />
                Phones on your Tailscale account can also just open http://{st.urls[0]?.split("/")[2]}
              </span>
            </div>
          </div>
        </Field>
      )}
    </>
  );
}
