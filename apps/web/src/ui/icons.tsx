import {
  BookOpen20Regular,
  Bot20Regular,
  Chat20Regular,
  Code20Regular,
  Flash20Regular,
  Globe20Regular,
  HourglassHalf20Regular,
  Lightbulb20Regular,
  Microscope20Regular,
  PeopleTeam20Regular,
  Print20Regular,
  Rss20Regular,
  ScanObject20Regular,
  Search20Regular,
  SettingsCogMultiple20Regular,
  ShieldCheckmark20Regular,
  TaskListLtr20Regular,
  VehicleTruckProfile20Regular,
  WeatherMoon20Regular,
  WindowConsole20Regular,
  Wrench20Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import { ACTIVITY_META, clipText, type Activity, type SessionState } from "../agents";
import { CREATES_FILE, ROLE_META, type Role, type Theme } from "../roles";

// Fluent (Windows 11) icons for activities, roles and factory machines.

export const ACTIVITY_ICON: Record<Activity, FluentIcon> = {
  read: BookOpen20Regular,
  search: Search20Regular,
  write: Code20Regular,
  shell: WindowConsole20Regular,
  web: Globe20Regular,
  think: Lightbulb20Regular,
  talk: Chat20Regular,
  plan: TaskListLtr20Regular,
  delegate: PeopleTeam20Regular,
  wait: HourglassHalf20Regular,
  idle: WeatherMoon20Regular,
  other: Wrench20Regular,
};

const ROLE_ICON: Record<Role, FluentIcon> = {
  reader: BookOpen20Regular,
  coder: Code20Regular,
  bash: WindowConsole20Regular,
  research: Globe20Regular,
  reviewer: ShieldCheckmark20Regular,
  lead: TaskListLtr20Regular,
};

const MACHINE_ICON: Record<Role, FluentIcon> = {
  reader: ScanObject20Regular,
  coder: SettingsCogMultiple20Regular,
  bash: Flash20Regular,
  research: Rss20Regular,
  reviewer: Microscope20Regular,
  lead: Bot20Regular,
};

export const SubagentIcon = PeopleTeam20Regular;
export const AgvIcon = VehicleTruckProfile20Regular;
export const IdleIcon = WeatherMoon20Regular;

/** An icon that sits inline with text, sized to the surrounding font. */
export function Ico({ icon: I, color }: { icon: FluentIcon; color?: string }) {
  return <I className="inline-block shrink-0 align-[-0.2em] text-[1.25em]" style={{ color }} />;
}

/** "<icon> tool · detail" for a session's current step. */
export function WorkText({ session, max }: { session: SessionState; max: number }) {
  return (
    <>
      <Ico icon={ACTIVITY_ICON[session.activity]} />{" "}
      {session.tool ? `${session.tool} · ` : ""}
      {clipText(session.detail, max) || ACTIVITY_META[session.activity].label}
    </>
  );
}

/** Role name with its icon; in the factory that's the machine, a 3D printer when creating files. */
export function RoleLabel({ role, theme, tool, accent }: { role: Role; theme: Theme; tool?: string; accent?: string }) {
  const meta = ROLE_META[role];
  if (theme !== "factory")
    return (
      <>
        <Ico icon={ROLE_ICON[role]} color={accent} /> {meta.label}
      </>
    );
  const printing = role === "coder" && !!tool && CREATES_FILE.test(tool);
  return (
    <>
      <Ico icon={printing ? Print20Regular : MACHINE_ICON[role]} color={accent} /> {printing ? "3D Printer" : meta.machine}
    </>
  );
}
