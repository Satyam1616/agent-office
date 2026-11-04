import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Mesh } from "three";
import { AGENT_META, clipText, type SessionState } from "../agents";
import { Ico, IdleIcon, RoleLabel, WorkText } from "../ui/icons";
import { ROLE_META, ROLES, roleFor, type Role } from "../roles";
import { useMultiMachine } from "../store";
import { MachineName, muted, PodSign } from "../ui/labels";
import { Html } from "./Html";
import { Character } from "./Character";
import { RobotCharacter } from "./RobotCharacter";
import { Desk } from "./Desk";
import { chair, podSeat, podSign, type RoomPlan, type Vec3 } from "./layout";

const FLIGHT_S = 0.7;

interface Flight {
  id: number;
  from: Vec3;
  to: Vec3;
}

/** A sheet of paper arcing from one desk to another when work is handed off. */
function Paper({ from, to, onDone }: { from: Vec3; to: Vec3; onDone: () => void }) {
  const mesh = useRef<Mesh>(null!);
  const elapsed = useRef(0);
  useFrame((_, dt) => {
    elapsed.current += dt;
    const k = Math.min(1, elapsed.current / FLIGHT_S);
    const m = mesh.current;
    m.position.set(
      from[0] + (to[0] - from[0]) * k,
      1.3 + Math.sin(k * Math.PI) * 1.2,
      from[2] + (to[2] - from[2]) * k,
    );
    m.rotation.set(k * 6, k * 9, 0);
    if (k >= 1) onDone();
  });
  return (
    <mesh ref={mesh} position={[from[0], 1.3, from[2]]}>
      <planeGeometry args={[0.32, 0.42]} />
      <meshStandardMaterial color="#fff" emissive="#fff" emissiveIntensity={1.2} side={2} toneMapped={false} />
    </mesh>
  );
}

interface Props {
  session: SessionState;
  room: RoomPlan;
  pod: number;
  door: Vec3;
  selected: boolean;
  onSelect: () => void;
  robots?: boolean;
}

/** One session rendered as a six-person team; the teammate matching the current tool works. */
export function TeamPod({ session, room, pod, door, selected, onSelect, robots }: Props) {
  const Person = robots ? RobotCharacter : Character;
  const { color } = AGENT_META[session.agent];
  const multi = useMultiMachine();
  const idle = session.status === "idle";
  const current = roleFor(session);
  const seats = ROLES.map((_, i) => podSeat(room, pod, i));
  const seatOf = (r: Role) => seats[ROLES.indexOf(r)]!;

  // Hand-off animation whenever the active role changes.
  const [flights, setFlights] = useState<Flight[]>([]);
  const prev = useRef<Role>(current);
  useEffect(() => {
    if (prev.current !== current && !idle) {
      const from = seatOf(prev.current);
      const to = seatOf(current);
      setFlights((f) => [...f.slice(-3), { id: Date.now() + Math.random(), from, to }]);
    }
    prev.current = current;
  }, [current, idle]);

  const workBubble = <WorkText session={session} max={36} />;

  return (
    <group>
      {ROLES.map((role, i) => {
        const meta = ROLE_META[role];
        const active = role === current && !idle;
        return (
          <group key={role}>
            <Desk
              position={seats[i]!}
              activity={active ? session.activity : meta.activity}
              status={active ? session.status : "idle"}
              chair={!robots}
            />
            <Person
              turns={session.turns}
              fails={session.failCount}
              color={color}
              accent={meta.accent}
              pose={idle ? "idle" : active ? session.activity : "standby"}
              waiting={active && session.status === "waiting"}
              active={active}
              tag={<RoleLabel role={role} theme="office" />}
              bubble={active ? workBubble : idle && role === "lead" ? <><Ico icon={IdleIcon} /> Zzz</> : undefined}
              bubbleStatus={session.status}
              target={chair(seats[i]!)}
              door={door}
              selected={selected}
              onSelect={onSelect}
            />
          </group>
        );
      })}
      {flights.map((f) => (
        <Paper key={f.id} from={f.from} to={f.to} onDone={() => setFlights((fs) => fs.filter((x) => x.id !== f.id))} />
      ))}
      <Html position={podSign(room, pod)} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <PodSign color={color}>
          <b>{session.project}</b>
          {multi && <MachineName> @{session.machine}</MachineName>}
          {session.title && <span className={muted}> · {clipText(session.title, 28)}</span>}
        </PodSign>
      </Html>
    </group>
  );
}
