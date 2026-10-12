import { useMemo, useRef } from "react";
import { Ico, IdleIcon, SubagentIcon, WorkText } from "../ui/icons";
import { AGENT_META, AGENTS, clipText, type AgentKind, type SessionState } from "../agents";
import { useOffice } from "../store";
import { Character } from "./Character";
import { RobotCharacter } from "./RobotCharacter";
import { Desk } from "./Desk";
import { chair, door, planOffice, podSeat, subSeat } from "./layout";
import { Room } from "./Room";
import { TeamPod } from "./TeamPod";
import { Agv } from "./factory/Agv";
import { Bay } from "./factory/Bay";
import { IdleCell, ProductionCell } from "./factory/Cell";

/**
 * Keeps each session at the same pod/seat for its whole life; frees it on leave.
 * Root sessions and subagents are numbered separately per agent.
 */
function useSlots(sessions: SessionState[]) {
  const slots = useRef(new Map<string, number>());
  return useMemo(() => {
    const live = new Set(sessions.map((s) => s.key));
    for (const key of slots.current.keys()) if (!live.has(key)) slots.current.delete(key);
    const groups = new Map<string, SessionState[]>();
    for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
      const g = `${s.agent}:${s.parentKey ? "sub" : "root"}`;
      groups.set(g, [...(groups.get(g) ?? []), s]);
    }
    for (const list of groups.values()) {
      const used = new Set(list.map((s) => slots.current.get(s.key)).filter((n) => n !== undefined));
      for (const s of list) {
        if (slots.current.has(s.key)) continue;
        let n = 0;
        while (used.has(n)) n++;
        used.add(n);
        slots.current.set(s.key, n);
      }
    }
    return new Map(slots.current);
  }, [sessions]);
}

export function Office() {
  const sessionMap = useOffice((s) => s.sessions);
  const selected = useOffice((s) => s.selected);
  const select = useOffice((s) => s.select);
  const theme = useOffice((s) => s.theme);
  const factory = theme === "factory";
  const robots = theme === "robots";
  const Person = robots ? RobotCharacter : Character;
  const sessions = useMemo(() => Object.values(sessionMap), [sessionMap]);
  const slots = useSlots(sessions);

  const plan = useMemo(() => {
    const counts = Object.fromEntries(
      AGENTS.map((a) => {
        const mine = sessions.filter((s) => s.agent === a);
        const extent = (list: SessionState[]) => Math.max(0, ...list.map((s) => (slots.get(s.key) ?? 0) + 1));
        return [a, { pods: extent(mine.filter((s) => !s.parentKey)), subs: extent(mine.filter((s) => s.parentKey)) }];
      }),
    ) as Record<AgentKind, { pods: number; subs: number }>;
    return planOffice(counts);
  }, [sessions, slots]);

  return (
    <group>
      {AGENTS.map((agent) => {
        const room = plan[agent];
        const mine = sessions.filter((s) => s.agent === agent);
        const roots = mine.filter((s) => !s.parentKey);
        const subs = mine.filter((s) => s.parentKey);
        const entrance = door(room);
        const { color } = AGENT_META[agent];
        return (
          <group key={agent}>
            {factory ? (
              <Bay agent={agent} sessions={mine} room={room} />
            ) : (
              <Room agent={agent} sessions={mine} room={room} />
            )}

            {/* an empty room still shows one pod of free desks / an idle line */}
            {roots.length === 0 &&
              (factory ? (
                <IdleCell room={room} agentColor={color} />
              ) : (
                Array.from({ length: 6 }, (_, i) => <Desk key={i} position={podSeat(room, 0, i)} />)
              ))}

            {factory &&
              roots.map((s) => (
                <ProductionCell
                  key={s.key}
                  session={s}
                  room={room}
                  pod={slots.get(s.key)!}
                  selected={selected === s.key}
                  onSelect={() => select(s.key)}
                />
              ))}
            {factory &&
              subs.map((s) => (
                <Agv
                  key={s.key}
                  session={s}
                  home={subSeat(room, slots.get(s.key)!)}
                  door={entrance}
                  selected={selected === s.key}
                  onSelect={() => select(s.key)}
                />
              ))}

            {!factory && roots.map((s) => (
              <TeamPod
                key={s.key}
                session={s}
                room={room}
                pod={slots.get(s.key)!}
                door={entrance}
                selected={selected === s.key}
                onSelect={() => select(s.key)}
                robots={robots}
              />
            ))}

            {!factory && subs.map((s) => {
              const seat = subSeat(room, slots.get(s.key)!);
              return (
                <group key={s.key}>
                  <Desk position={seat} activity={s.activity} status={s.status} chair={!robots} />
                  <Person
                    turns={s.turns}
                    fails={s.failCount}
                    color={color}
                    accent={color}
                    pose={s.status === "idle" ? "idle" : s.activity}
                    waiting={s.status === "waiting"}
                    active={s.status !== "idle"}
                    tag={<><Ico icon={SubagentIcon} /> Subagent</>}
                    bubble={
                      s.status === "idle" ? <><Ico icon={IdleIcon} /> Zzz</> : <WorkText session={s} max={30} />
                    }
                    bubbleStatus={s.status}
                    scale={0.8}
                    target={chair(seat)}
                    door={entrance}
                    selected={selected === s.key}
                    onSelect={() => select(s.key)}
                  />
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
