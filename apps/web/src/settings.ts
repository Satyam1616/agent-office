import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Phones get the light preset by default; they also lay the HUD out differently (see Hud). */
const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);

export type Quality = "high" | "balanced" | "saver";
export type NotifyLevel = "off" | "waiting" | "all";

/** Render presets. `fps` while something works (or you're dragging the view), `idleFps` otherwise. */
export const QUALITY: Record<Quality, { label: string; dpr: number | [number, number]; shadows: number; effects: boolean; fps: number; idleFps: number }> = {
  high: { label: "High", dpr: [1, 2], shadows: 2048, effects: true, fps: 60, idleFps: 60 },
  balanced: { label: "Balanced", dpr: [1, 1.5], shadows: 1024, effects: true, fps: 60, idleFps: 20 },
  saver: { label: "Power saver", dpr: 1, shadows: 0, effects: false, fps: 30, idleFps: 8 },
};

interface Settings {
  quality: Quality;
  notify: NotifyLevel;
  /** Desktop app: closing the window keeps it running in the tray. */
  closeToTray: boolean;
  update: (patch: Partial<Omit<Settings, "update">>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      quality: isPhone ? "saver" : "balanced",
      notify: "all",
      closeToTray: true,
      update: (patch) => set(patch),
    }),
    { name: "agent-office-settings" },
  ),
);
