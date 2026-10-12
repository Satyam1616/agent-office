import type { ReactNode } from "react";
import type { SessionStatus } from "../agents";

// Tailwind building blocks shared by the HUD and the in-scene <Html> labels.

export const panel =
  "pointer-events-auto absolute rounded-[10px] border border-[#2a2f3a] bg-[#12151c]/80 px-3 py-2.5 backdrop-blur-md";
export const muted = "text-[#8b93a3]";
export const fail = "text-[#ff8a8a]";
export const mono = "font-mono text-xs";

export function Dot({ color, glow = false }: { color: string; glow?: boolean }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: color, boxShadow: glow ? `0 0 10px ${color}` : "none" }}
    />
  );
}

export function MachineName({ children }: { children: ReactNode }) {
  return <span className="font-normal text-sky-300">{children}</span>;
}

/** Vertical stack above a character/station: speech bubble on top of a name tag. */
export function LabelStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-[3px]">{children}</div>;
}

const BUBBLE_STATUS: Record<SessionStatus, string> = {
  working: "bg-[#0e1117]/90",
  idle: "bg-[#0e1117]/90 opacity-55",
  waiting: "bg-[#3a2f00] text-[#ffdd55] animate-pulse",
};

export function Bubble({ color, status, children }: { color: string; status?: SessionStatus; children: ReactNode }) {
  return (
    <div
      className={`max-w-[260px] select-none overflow-hidden text-ellipsis whitespace-nowrap rounded-[10px] border px-2 py-[3px] font-mono text-[11px] ${BUBBLE_STATUS[status ?? "working"]}`}
      style={{ borderColor: color }}
    >
      {children}
    </div>
  );
}

/** Role/station name tag; idle ones hide when zoomed out (`.far` on <body>, see App). */
export function Tag({ on = false, children }: { on?: boolean; children: ReactNode }) {
  return (
    <div
      className={`select-none whitespace-nowrap rounded-md px-1.5 py-px text-[10px] ${
        on ? "bg-[#0e1117]/90 text-white" : "bg-[#0e1117]/60 text-[#8b93a3] [.far_&]:hidden"
      }`}
    >
      {children}
    </div>
  );
}

export function RoomSign({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div
      className="flex select-none items-center gap-2 whitespace-nowrap rounded-lg border bg-[#0e1117]/85 px-2.5 py-1 text-xs"
      style={{ borderColor: color }}
    >
      {children}
    </div>
  );
}

export function PodSign({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div
      className="select-none whitespace-nowrap rounded-md border-l-[3px] bg-[#0e1117]/75 px-2 py-0.5 text-[11px]"
      style={{ borderColor: color }}
    >
      {children}
    </div>
  );
}
