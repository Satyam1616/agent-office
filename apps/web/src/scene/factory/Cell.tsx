import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ComponentType } from "react";
import type { Group, Mesh } from "three";
import { ACTIVITY_META, AGENT_META, clipText, type SessionState } from "../../agents";
import { CREATES_FILE, ROLE_META, ROLES, roleFor, type Role } from "../../roles";
import { useMultiMachine } from "../../store";
import { Bubble, LabelStack, MachineName, muted, PodSign, Tag } from "../../ui/labels";
import { podSeat, podSign, type RoomPlan } from "../layout";
import {
  AndonTower,
  CncMill,
  DARK,
  DishDock,
  LaserCutter,
  Printer3D,
  QcStation,
  RobotArm,
  Scanner,
  STEEL,
  type MachineProps,
} from "./machines";

const MACHINE: Record<Role, ComponentType<MachineProps & { lastOk?: boolean }>> = {
  reader: Scanner,
  coder: CncMill,
  bash: LaserCutter,
  research: DishDock,
  reviewer: QcStation,
  lead: RobotArm,
};

const BELT_L = 9.2;
const BELT_H = 0.55;
const SLATS = 26;
const PIECE_SPEED = 3.5;
/** Desk rows are 3.0 apart; the belt runs between them and machines face it. */
const BELT_DZ = 1.5;
const MACHINE_INSET = 0.4;

interface Props {
  session: SessionState;
  room: RoomPlan;
  pod: number;
  selected: boolean;
  onSelect: () => void;
}

/** One session as a production cell: six stations along a conveyor carrying the workpiece. */
export function ProductionCell({ session, room, pod, selected, onSelect }: Props) {
  const { color } = AGENT_META[session.agent];
  const multi = useMultiMachine();
  const idle = session.status === "idle";
  const current = roleFor(session);
  const seats = ROLES.map((_, i) => podSeat(room, pod, i));
  const cx = room.center[0];
  const beltZ = seats[0]![2] + BELT_DZ;
  const inX = cx - BELT_L / 2 + 0.3;
  const outX = cx + BELT_L / 2 + 0.45;

  // The coder station keeps the look of its last job (mill for edits, printer for new files).
  const printing = useRef(false);
  if (current === "coder" && session.tool) printing.current = CREATES_FILE.test(session.tool);

  const slats = useRef<(Mesh | null)[]>([]);
  const piece = useRef<Group>(null!);
  const wasIdle = useRef(true);
  const targetX = idle ? outX : seats[ROLES.indexOf(current)]![0];

  useFrame(({ clock }, dt) => {
    // belt slats crawl while the cell runs
    const offset = idle ? 0 : (clock.elapsedTime * 0.8) % (BELT_L / SLATS);
    slats.current.forEach((m, i) => {
      if (m) m.position.x = cx - BELT_L / 2 + ((i * BELT_L) / SLATS + offset);
    });

    // a new turn drops fresh stock at the input end; a finished one rides to the bin
    const p = piece.current;
    if (wasIdle.current && !idle) p.position.set(inX, BELT_H + 0.12, beltZ);
    wasIdle.current = idle;
    const dx = targetX - p.position.x;
    p.position.x += Math.sign(dx) * Math.min(Math.abs(dx), dt * PIECE_SPEED);
    const arrived = Math.abs(dx) < 0.02;
    p.scale.setScalar(idle && arrived ? 0 : 1);
    p.rotation.y = Math.sin(clock.elapsedTime * 2) * 0.1;
  });

  const act = ACTIVITY_META[session.activity];
  const workBubble = `${act.icon} ${session.tool ? `${session.tool} · ` : ""}${clipText(session.detail, 34) || act.label}`;
  const parts = Math.min(session.turns, 8);

  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {selected &&
        [
          [0, -2.2, 10.4, 0.08],
          [0, 2.2, 10.4, 0.08],
          [-5.2, 0, 0.08, 4.4],
          [5.2, 0, 0.08, 4.4],
        ].map(([x, z, w, d], i) => (
          <mesh key={i} position={[cx + x!, 0.02, beltZ + z!]}>
            <boxGeometry args={[w!, 0.02, d!]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
          </mesh>
        ))}

      {/* conveyor */}
      <mesh castShadow receiveShadow position={[cx, BELT_H / 2 - 0.05, beltZ]}>
        <boxGeometry args={[BELT_L, BELT_H - 0.1, 0.75]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      {Array.from({ length: SLATS }, (_, i) => (
        <mesh key={i} ref={(m) => void (slats.current[i] = m)} position={[cx, BELT_H - 0.03, beltZ]}>
          <boxGeometry args={[0.08, 0.04, 0.68]} />
          <meshStandardMaterial color="#4a5059" />
        </mesh>
      ))}

      {/* the workpiece = the file being worked on */}
      <group ref={piece} position={[outX, BELT_H + 0.12, beltZ]}>
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.2, 0.32]} />
          <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.105, 0]}>
          <boxGeometry args={[0.2, 0.01, 0.2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} />
        </mesh>
      </group>

      {/* raw stock hopper and finished-parts bin */}
      <mesh castShadow position={[inX - 0.55, 0.45, beltZ]}>
        <cylinderGeometry args={[0.35, 0.18, 0.5, 4]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>
      <group position={[outX + 0.25, 0, beltZ]}>
        <mesh receiveShadow position={[0, 0.03, 0]}>
          <boxGeometry args={[0.8, 0.06, 0.8]} />
          <meshStandardMaterial color="#3f6b4a" />
        </mesh>
        {[
          [0, 0.2, -0.38, 0.8, 0.04],
          [0, 0.2, 0.38, 0.8, 0.04],
          [-0.38, 0.2, 0, 0.04, 0.8],
          [0.38, 0.2, 0, 0.04, 0.8],
        ].map(([x, y, z, w, d], i) => (
          <mesh key={i} position={[x!, y!, z!]}>
            <boxGeometry args={[w!, 0.34, d!]} />
            <meshStandardMaterial color="#3f6b4a" />
          </mesh>
        ))}
        {Array.from({ length: parts }, (_, i) => (
          <mesh key={i} position={[((i % 2) - 0.5) * 0.3, 0.16 + Math.floor(i / 4) * 0.2, ((Math.floor(i / 2) % 2) - 0.5) * 0.3]}>
            <boxGeometry args={[0.26, 0.18, 0.26]} />
            <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        <Html position={[0, 0.9, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <Tag on>📦 {session.turns}</Tag>
        </Html>
      </group>

      <group position={[outX + 0.25, 0, beltZ - 0.9]}>
        <AndonTower status={session.status} lastOk={session.lastOk} />
      </group>

      {ROLES.map((role, i) => {
        const meta = ROLE_META[role];
        const [x, , z] = seats[i]!;
        const back = i < 3;
        const Machine = role === "coder" && printing.current ? Printer3D : MACHINE[role];
        const active = role === current && !idle;
        return (
          <group key={role} position={[x, 0, back ? z + MACHINE_INSET : z - MACHINE_INSET]}>
            <group rotation-y={back ? 0 : Math.PI}>
              <Machine active={active} on={!idle} accent={meta.accent} agentColor={color} lastOk={session.lastOk} />
            </group>
            <Html position={[0, 2.1, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
              <LabelStack>
                {active && (
                  <Bubble color={meta.accent} status={session.status}>
                    {workBubble}
                  </Bubble>
                )}
                {idle && role === "lead" && (
                  <Bubble color={meta.accent} status="idle">
                    💤 line stopped
                  </Bubble>
                )}
                <Tag on={active}>
                  {role === "coder" && printing.current ? "🖨️ 3D Printer" : `${meta.machineIcon} ${meta.machine}`}
                </Tag>
              </LabelStack>
            </Html>
          </group>
        );
      })}

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

/** Empty cell: idle line with no workpiece, so an empty bay still looks like a factory. */
export function IdleCell({ room, agentColor }: { room: RoomPlan; agentColor: string }) {
  const seats = useMemo(() => ROLES.map((_, i) => podSeat(room, 0, i)), [room]);
  const cx = room.center[0];
  const beltZ = seats[0]![2] + BELT_DZ;
  return (
    <group>
      <mesh receiveShadow position={[cx, BELT_H / 2 - 0.05, beltZ]}>
        <boxGeometry args={[BELT_L, BELT_H - 0.1, 0.75]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      {ROLES.map((role, i) => {
        const [x, , z] = seats[i]!;
        const back = i < 3;
        const Machine = MACHINE[role];
        return (
          <group key={role} position={[x, 0, back ? z + MACHINE_INSET : z - MACHINE_INSET]}>
            <group rotation-y={back ? 0 : Math.PI}>
              <Machine active={false} on={false} accent={ROLE_META[role].accent} agentColor={agentColor} />
            </group>
          </group>
        );
      })}
    </group>
  );
}
