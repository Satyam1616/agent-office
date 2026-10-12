import { useEffect, useState } from "react";
import { ACTIVITY_META, AGENT_META, AGENTS, clipText, type SessionState } from "../agents";
import { ROLE_META, roleName, ROLES, roleFor, type Theme } from "../roles";
import { sound } from "../sound";
import { useClock, useMultiMachine, useOffice } from "../store";
import { control, Dot, fail, MachineName, mono, muted, panel } from "./labels";
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

export function Hud() {
  const { connected, sessions, feed, stats, selected, select, theme, setTheme } = useOffice();
  const factory = theme === "factory";
  const now = useClock(useNow());
  const [soundOn, setSoundOn] = useState(sound.enabled);
  useEffect(() => sound.onChange(() => setSoundOn(sound.enabled)), []);
  const multi = useMultiMachine();
  const list = Object.values(sessions);
  const sel = selected ? sessions[selected] : undefined;

  return (
    // Above drei <Html> labels, which use z-index up to 20.
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <header className={`${panel} top-3 left-3 flex items-center gap-2.5`}>
        <h1 className="m-0 text-[15px] font-semibold">Agent Office</h1>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            connected ? "bg-[#10a37f]/20 text-[#39ff88]" : "bg-[#ff5c5c]/20 text-[#ff8a8a]"
          }`}
        >
          {connected ? "live" : "reconnecting…"}
        </span>
        <select className={control} value={theme} onChange={(e) => setTheme(e.target.value as Theme)} title="Visual">
          <option value="office">👥 Office</option>
          <option value="robots">🤖 Robots</option>
          <option value="factory">🏭 Factory</option>
        </select>
        <button
          className={control}
          title={soundOn ? "Mute" : "Sound on"}
          onClick={async () => {
            if (soundOn) sound.disable();
            else await sound.enable();
          }}
        >
          {soundOn ? "🔊" : "🔇"}
        </button>
      </header>

      <aside className={`${panel} top-[60px] left-3 grid w-[230px] gap-1.5`}>
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
                🔧 {stats.today[a] ?? 0}
              </span>
            </div>
          );
        })}
        {factory && <Production list={list} />}
        <div className={divider}>
          {ROLES.map((r) => (
            <span key={r}>
              <span className="mr-1.5 inline-block size-2 rounded-xs" style={{ background: ROLE_META[r].accent }} />
              {roleName(r, theme)}
            </span>
          ))}
        </div>
      </aside>

      <aside className={`${panel} top-3 right-3 bottom-3 flex w-[340px] flex-col gap-2`}>
        <h2 className={heading}>Live feed</h2>
        <ul className="m-0 grid list-none auto-rows-max content-start gap-1 overflow-y-auto p-0">
          {[...feed].reverse().map((f) => (
            <li
              key={f.id}
              onClick={() => select(f.key)}
              className="grid cursor-pointer grid-cols-[10px_28px_auto_1fr] items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md px-1 py-[3px] hover:bg-white/5"
            >
              <Dot color={AGENT_META[f.agent].color} />
              <span className={muted}>{timeAgo(f.ts, now)}</span>
              <span className="max-w-[110px] overflow-hidden text-ellipsis font-medium text-[#c3c9d4]">
                {multi && <MachineName>{f.machine}/</MachineName>}
                {f.project}
              </span>
              <span className="overflow-hidden text-ellipsis">
                {f.kind === "tool_start"
                  ? `${roleName(roleFor({ activity: f.activity ?? "other", detail: f.detail }), theme, f.tool)} · ${f.tool} ${clipText(f.detail, 34)}`
                  : f.kind === "prompt"
                    ? `📝 ${clipText(f.detail, 50)}`
                    : f.kind === "waiting"
                      ? "⏳ waiting for you"
                      : "✅ done"}
              </span>
            </li>
          ))}
          {!feed.length && <li className={muted}>No activity yet. Start any agent…</li>}
        </ul>
      </aside>

      <Timeline />

      {sel && (
        <section
          className={`${panel} bottom-3 left-3 w-[380px] border-l-4`}
          style={{ borderLeftColor: AGENT_META[sel.agent].color }}
        >
          <h2 className={heading}>
            {AGENT_META[sel.agent].label} · {sel.project}
          </h2>
          {sel.title && <p className="mt-1 mb-2 text-[#c3c9d4]">{sel.title}</p>}
          <dl className="mt-2 mb-0 grid grid-cols-[90px_1fr] gap-x-2.5 gap-y-1 [&_dd]:m-0 [&_dd]:break-words [&_dt]:text-[#8b93a3]">
            <dt>{sel.parentKey ? "Role" : "On it"}</dt>
            <dd>
              {sel.parentKey
                ? factory
                  ? "🛻 AGV · subagent"
                  : "🧑‍🔧 Subagent"
                : roleName(roleFor(sel), theme, sel.tool)}
            </dd>
            <dt>Status</dt>
            <dd>
              {ACTIVITY_META[sel.activity].icon} {sel.status} · {ACTIVITY_META[sel.activity].label}
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
      <span title="completed turns">📦 {parts} parts</span>
      <span title="tool calls">⚙️ {ops} ops</span>
      <span title="failed tool calls" className={fails ? fail : ""}>
        ⚠️ {ops ? Math.round((fails / ops) * 100) : 0}% fail
      </span>
      <span title="lines running">🟢 {running}/{list.length} lines</span>
    </div>
  );
}
