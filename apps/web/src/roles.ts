import type { Activity, SessionState } from "./agents";

/** Each session is shown as a team; every tool call is handed to one teammate. */
export type Role = "reader" | "coder" | "bash" | "research" | "reviewer" | "lead";

/** Seat order in the pod: back row left→right, then front row (lead sits by the door). */
export const ROLES: Role[] = ["reader", "coder", "bash", "research", "reviewer", "lead"];

interface RoleMeta {
  label: string;
  icon: string;
  /** Same role as a station in the factory view. */
  machine: string;
  machineIcon: string;
  accent: string;
  activity: Activity;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  reader: { label: "Reader", icon: "📖", machine: "3D Scanner", machineIcon: "🔦", accent: "#e8e8e8", activity: "read" },
  coder: { label: "Coder", icon: "⌨️", machine: "CNC Mill", machineIcon: "⚙️", accent: "#4cc9f0", activity: "write" },
  bash: { label: "Bash", icon: "🖥️", machine: "Laser Cutter", machineIcon: "⚡", accent: "#39ff88", activity: "shell" },
  research: { label: "Research", icon: "🌐", machine: "Dish & Dock", machineIcon: "📡", accent: "#b388ff", activity: "web" },
  reviewer: { label: "Reviewer", icon: "🔍", machine: "QC / CMM", machineIcon: "🔬", accent: "#ff7a7a", activity: "search" },
  lead: { label: "Lead", icon: "📋", machine: "Robot Arm", machineIcon: "🦾", accent: "#ffb74d", activity: "plan" },
};

export const THEMES = ["office", "robots", "factory"] as const;
export type Theme = (typeof THEMES)[number];

/** Tools that create a whole new file; in the factory the coder station prints those instead of milling. */
export const CREATES_FILE = /^(write|write_file|writefile|create|create_file)$/i;

export const roleName = (r: Role, theme: Theme, tool?: string) => {
  if (theme !== "factory") return `${ROLE_META[r].icon} ${ROLE_META[r].label}`;
  if (r === "coder" && tool && CREATES_FILE.test(tool)) return "🖨️ 3D Printer";
  return `${ROLE_META[r].machineIcon} ${ROLE_META[r].machine}`;
};

// Shell commands that verify work rather than do it.
const REVIEW_CMD =
  /\b(test|tests|vitest|jest|pytest|playwright|lint|eslint|biome|prettier --check|tsc|typecheck|check|clippy|vet|diff|review|audit)\b/i;

export function roleFor({ activity, detail }: Pick<SessionState, "activity" | "detail">): Role {
  switch (activity) {
    case "read":
    case "search":
      return "reader";
    case "write":
      return "coder";
    case "web":
      return "research";
    case "shell":
      return REVIEW_CMD.test(detail ?? "") ? "reviewer" : "bash";
    default:
      return "lead";
  }
}
