import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Radio,
  RadioGroup,
  Switch,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";
import { askNotifyPermission, CONNECT_PAGE, getAutostart, isDesktop, isMobileApp, setAutostart, setCloseToTray } from "../desktop";
import { QUALITY, useSettings, type NotifyLevel, type Quality } from "../settings";
import { sound } from "../sound";
import { SharingSettings } from "./Sharing";

const QUALITY_HINT: Record<Quality, string> = {
  high: "Sharpest on HiDPI screens, full effects, always 60 fps.",
  balanced: "Full effects, drops to 20 fps while every agent is idle.",
  saver: "No shadows or glow, 30 fps, 8 fps when idle. Easiest on battery and RAM.",
};

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { quality, notify, closeToTray, update } = useSettings();
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [autostart, setAuto] = useState(false);
  useEffect(() => sound.onChange(() => setSoundOn(sound.enabled)), []);
  useEffect(() => {
    if (open && isDesktop) void getAutostart().then(setAuto);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className="max-w-[500px]">
        <DialogBody>
          <DialogTitle>Settings</DialogTitle>
          <DialogContent className="flex flex-col gap-4">
            <Field label="Graphics" hint={QUALITY_HINT[quality]}>
              <RadioGroup layout="horizontal" value={quality} onChange={(_, d) => update({ quality: d.value as Quality })}>
                {(Object.keys(QUALITY) as Quality[]).map((q) => (
                  <Radio key={q} value={q} label={QUALITY[q].label} />
                ))}
              </RadioGroup>
            </Field>

            <Field label="Notifications" hint="Only while the window isn't focused.">
              <RadioGroup
                value={notify}
                onChange={(_, d) => {
                  if (d.value !== "off") askNotifyPermission();
                  update({ notify: d.value as NotifyLevel });
                }}
              >
                <Radio value="all" label="When an agent finishes or waits for you" />
                <Radio value="waiting" label="Only when an agent waits for you" />
                <Radio value="off" label="Off" />
              </RadioGroup>
            </Field>

            <Switch
              label="Sound effects"
              checked={soundOn}
              onChange={(_, d) => (d.checked ? void sound.enable() : sound.disable())}
            />

            <SharingSettings />

            {isMobileApp && (
              <Field label="Hub" hint={location.host}>
                <div>
                  <Button onClick={() => location.assign(CONNECT_PAGE)}>Change hub…</Button>
                </div>
              </Field>
            )}

            {isDesktop && (
              <>
                <Switch
                  label="Keep running in the tray when closed"
                  checked={closeToTray}
                  onChange={(_, d) => {
                    update({ closeToTray: d.checked });
                    void setCloseToTray(d.checked);
                  }}
                />
                <Switch
                  label="Start when I sign in"
                  checked={autostart}
                  onChange={(_, d) => {
                    setAuto(d.checked);
                    void setAutostart(d.checked).catch(() => setAuto(!d.checked));
                  }}
                />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>
              Done
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
