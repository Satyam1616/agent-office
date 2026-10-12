import {
  Badge,
  Button,
  Menu,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  ToggleButton,
  Tooltip,
} from "@fluentui/react-components";
import {
  Box20Regular,
  BuildingFactory20Regular,
  Bot20Regular,
  CheckmarkCircle20Regular,
  Dismiss20Regular,
  HourglassHalf20Regular,
  Live20Regular,
  People20Regular,
  PersonChat20Regular,
  Settings20Regular,
  PeopleList20Regular,
  TextBulletListLtr20Regular,
  SettingsCogMultiple20Regular,
  Speaker220Regular,
  SpeakerMute20Regular,
  Warning20Regular,
  Wrench20Regular,
  type FluentIcon,
} from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { ACTIVITY_META, AGENT_META, AGENTS, clipText, type SessionState } from "../agents";
import { ROLE_META, ROLES, roleFor, type Theme } from "../roles";
import { sound } from "../sound";
import { useClock, useMultiMachine, useOffice } from "../store";
import { ACTIVITY_ICON, AgvIcon, Ico, RoleLabel, SubagentIcon } from "./icons";
import { Dot, fail, MachineName, mono, muted, panel } from "./labels";
import { SettingsDialog } from "./Settings";
import { Timeline } from "./Timeline";

const timeAgo = (ts: number, now: number) => {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : `${Math.floor(s / 3600)}h`;
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const divider = "mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-[#2a2f3a] pt-2 text-[11px]";
const heading = "m-0 text-[13px] font-semibold";

const THEME_OPTIONS: { value: Theme; label: string; icon: FluentIcon }[] = [
  { value: "office", label: "Office", icon: People20Regular },
  { value: "robots", label: "Robots", icon: Bot20Regular },
  { value: "factory", label: "Factory", icon: BuildingFactory20Regular },
];

export function Hud() {
  const { connected, sessions, feed, stats, selected, select, theme, setTheme } = useOffice();
  const factory = theme === "factory";
  const now = useClock(useNow());
  const [soundOn, setSoundOn] = useState(sound.enabled);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Phones: the side panels don't fit next to the scene, so they open one at a time.
  const [sheet, setSheet] = useState<"agents" | "feed" | null>(null);
  const toggleSheet = (s: "agents" | "feed") => setSheet((cur) => (cur === s ? null : s));
  useEffect(() => sound.onChange(() => setSoundOn(sound.enabled)), []);
  const multi = useMultiMachine();
  const list = Object.values(sessions);
  const sel = selected ? sessions[selected] : undefined;
  const current = THEME_OPTIONS.find((t) => t.value === theme)!;

  return (
    // Above drei <Html> labels, which use z-index up to 20.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <header className={`${panel} top-3 left-3 flex items-center gap-2`}>
        <h1 className="m-0 mr-1 text-[15px] font-semibold max-sm:hidden">Agent Office</h1>
        <Badge appearance="tint" color={connected ? "success" : "danger"} size="small">
          {connected ? "live" : "reconnecting…"}
        </Badge>
        <Menu
          checkedValues={{ theme: [theme] }}
          onCheckedValueChange={(_, d) => setTheme(d.checkedItems[0] as Theme)}
        >
          <MenuTrigger disableButtonEnhancement>
            <Button size="small" icon={<current.icon />} className="max-sm:!min-w-0">
              <span className="max-sm:hidden">{current.label}</span>
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {THEME_OPTIONS.map((t) => (
                <MenuItemRadio key={t.value} name="theme" value={t.value} icon={<t.icon />}>
                  {t.label}
                </MenuItemRadio>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
        <Tooltip content={soundOn ? "Mute" : "Sound on"} relationship="label">
          <ToggleButton
            size="small"
            checked={soundOn}
            icon={soundOn ? <Speaker220Regular /> : <SpeakerMute20Regular />}
            onClick={async () => {
              if (soundOn) sound.disable();
              else await sound.enable();
            }}
          />
        </Tooltip>
        <Tooltip content="Settings" relationship="label">
          <Button size="small" icon={<Settings20Regular />} onClick={() => setSettingsOpen(true)} />
        </Tooltip>
        <div className="flex gap-1 md:hidden">
          <ToggleButton
            size="small"
            checked={sheet === "agents"}
            icon={<PeopleList20Regular />}
            aria-label="Agents"
            onClick={() => toggleSheet("agents")}
          />
          <ToggleButton
            size="small"
            checked={sheet === "feed"}
            icon={<TextBulletListLtr20Regular />}
            aria-label="Live feed"
            onClick={() => toggleSheet("feed")}
          />
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <aside className={`${panel} top-[60px] left-3 ${sheet === "agents" ? "grid" : "hidden"} w-[240px] gap-1.5 md:grid`}>
        {AGENTS.map((a) => {
          const mine = list.filter((s) => s.agent === a);
          const working = mine.filter((s) => s.status !== "idle").length;
          return (
            <div
              key={a}
              className={`grid grid-cols-[12px_1fr_auto_auto] items-center gap-2 ${mine.length ? "" : "opacity-45"}`}
            >
              <Dot color={AGENT_META[a].color} />
              <span>{AGENT_META[a].label}</span>
              <span className={muted}>
                {working}/{mine.length}
              </span>
              <span className="tabular-nums text-[#9aa3b2]" title="tool calls today">
                <Ico icon={Wrench20Regular} /> {stats.today[a] ?? 0}
              </span>
            </div>
          );
        })}
        {factory && <Production list={list} />}
        <div className={divider}>
          {ROLES.map((r) => (
            <span key={r} className="whitespace-nowrap">
              <RoleLabel role={r} theme={theme} accent={ROLE_META[r].accent} />
            </span>
          ))}
        </div>
      </aside>

      <aside
        className={`${panel} ${sheet === "feed" ? "flex" : "hidden"} top-[60px] right-3 bottom-[76px] left-3 flex-col gap-2 md:top-3 md:bottom-3 md:left-auto md:flex md:w-[340px]`}
      >
        <h2 className={heading}>Live feed</h2>
        <ul className="m-0 grid list-none auto-rows-max content-start gap-1 overflow-y-auto p-0">
          {[...feed].reverse().map((f) => (
            <li
              key={f.id}
              onClick={() => {
                select(f.key);
                setSheet(null);
              }}
              className="grid cursor-pointer grid-cols-[10px_28px_auto_1fr] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md px-1 py-[3px] hover:bg-white/5"
            >
              <Dot color={AGENT_META[f.agent].color} />
              <span className={muted}>{timeAgo(f.ts, now)}</span>
              <span className="max-w-[110px] overflow-hidden text-ellipsis font-medium text-[#c3c9d4]">
                {multi && <MachineName>{f.machine}/</MachineName>}
                {f.project}
              </span>
              <span className="overflow-hidden text-ellipsis">
                {f.kind === "tool_start" ? (
                  <>
                    <RoleLabel
                      role={roleFor({ activity: f.activity ?? "other", detail: f.detail })}
                      theme={theme}
                      tool={f.tool}
                    />{" "}
                    · {f.tool} {clipText(f.detail, 34)}
                  </>
                ) : f.kind === "prompt" ? (
                  <>
                    <Ico icon={PersonChat20Regular} /> {clipText(f.detail, 50)}
                  </>
                ) : f.kind === "waiting" ? (
                  <span className="text-[#ffdd55]">
                    <Ico icon={HourglassHalf20Regular} /> waiting for you
                  </span>
                ) : (
                  <span className="text-[#39ff88]">
                    <Ico icon={CheckmarkCircle20Regular} /> done
                  </span>
                )}
              </span>
            </li>
          ))}
          {!feed.length && <li className={muted}>No activity yet. Start any agent…</li>}
        </ul>
      </aside>

      <Timeline />

      {sel && (
        <section
          className={`${panel} right-3 bottom-[76px] left-3 max-h-[50vh] overflow-y-auto border-l-4 md:right-auto md:bottom-3 md:w-[380px]`}
          style={{ borderLeftColor: AGENT_META[sel.agent].color }}
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className={heading}>
              {AGENT_META[sel.agent].label} · {sel.project}
            </h2>
            <Button
              size="small"
              appearance="subtle"
              icon={<Dismiss20Regular />}
              aria-label="Close"
              onClick={() => select(null)}
            />
          </div>
          {sel.title && <p className="mt-1 mb-2 text-[#c3c9d4]">{sel.title}</p>}
          <dl className="mt-2 mb-0 grid grid-cols-[90px_1fr] gap-x-2.5 gap-y-1 [&_dd]:m-0 [&_dd]:break-words [&_dt]:text-[#8b93a3]">
            <dt>{sel.parentKey ? "Role" : "On it"}</dt>
            <dd>
              {sel.parentKey ? (
                factory ? (
                  <>
                    <Ico icon={AgvIcon} /> AGV · subagent
                  </>
                ) : (
                  <>
                    <Ico icon={SubagentIcon} /> Subagent
                  </>
                )
              ) : (
                <RoleLabel role={roleFor(sel)} theme={theme} tool={sel.tool} />
              )}
            </dd>
            <dt>Status</dt>
            <dd>
              <Ico icon={ACTIVITY_ICON[sel.activity]} /> {sel.status} · {ACTIVITY_META[sel.activity].label}
            </dd>
            {sel.tool && (
              <>
                <dt>Tool</dt>
                <dd>{sel.tool}</dd>
              </>
            )}
            {sel.detail && (
              <>
                <dt>Detail</dt>
                <dd className={mono}>{sel.detail}</dd>
              </>
            )}
            {sel.model && (
              <>
                <dt>Model</dt>
                <dd>{sel.model}</dd>
              </>
            )}
            <dt>Tool calls</dt>
            <dd>
              {sel.toolCount}
              {sel.failCount > 0 && <span className={fail}> · {sel.failCount} failed</span>}
            </dd>
            <dt>{factory ? "Parts made" : "Turns done"}</dt>
            <dd>{sel.turns}</dd>
            <dt>Active</dt>
            <dd>
              started {timeAgo(sel.startedAt, now)} ago · last seen {timeAgo(sel.lastTs, now)} ago
            </dd>
            {sel.parentKey && (
              <>
                <dt>Subagent of</dt>
                <dd className={mono}>{sel.parentKey.split(":")[1]?.slice(0, 8)}</dd>
              </>
            )}
            <dt>Machine</dt>
            <dd>{sel.machine}</dd>
            <dt>Directory</dt>
            <dd className={mono}>{sel.cwd ?? "-"}</dd>
          </dl>
        </section>
      )}
    </div>
  );
}

/** Factory dashboard: output, operations and QC failure rate across live sessions. */
function Production({ list }: { list: SessionState[] }) {
  const parts = list.reduce((n, s) => n + s.turns, 0);
  const ops = list.reduce((n, s) => n + s.toolCount, 0);
  const fails = list.reduce((n, s) => n + s.failCount, 0);
  const running = list.filter((s) => s.status !== "idle").length;
  return (
    <div className={divider}>
      <span title="completed turns">
        <Ico icon={Box20Regular} /> {parts} parts
      </span>
      <span title="tool calls">
        <Ico icon={SettingsCogMultiple20Regular} /> {ops} ops
      </span>
      <span title="failed tool calls" className={fails ? fail : ""}>
        <Ico icon={Warning20Regular} /> {ops ? Math.round((fails / ops) * 100) : 0}% fail
      </span>
      <span title="lines running">
        <Ico icon={Live20Regular} /> {running}/{list.length} lines
      </span>
    </div>
  );
}
