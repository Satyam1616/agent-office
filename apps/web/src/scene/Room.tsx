import { useMemo } from "react";
import { Color } from "three";
import { AGENT_META, type AgentKind, type SessionState } from "../agents";
import { Html } from "./Html";
import { door, ROOM_W, type RoomPlan } from "./layout";
import { Dot, muted, RoomSign } from "../ui/labels";

const WALL_H = 1.4;
const WALL_T = 0.2;

export function Room({ agent, sessions, room }: { agent: AgentKind; sessions: SessionState[]; room: RoomPlan }) {
  const { label, color } = AGENT_META[agent];
  const floor = useMemo(() => new Color(color).lerp(new Color("#1a1d24"), 0.82), [color]);
  const wall = useMemo(() => new Color(color).lerp(new Color("#2a2f3a"), 0.7), [color]);
  const [x, , z] = room.center;
  const D = room.depth;
  const [dx, , dz] = door(room);
  const working = sessions.filter((s) => s.status !== "idle").length;
  const lit = working > 0;

  return (
    <group>
      <group position={[x, 0, z]}>
        <mesh receiveShadow position={[0, -0.1, 0]}>
          <boxGeometry args={[ROOM_W, 0.2, D]} />
          <meshStandardMaterial color={floor} />
        </mesh>
        {/* agent-colored trim along the front, glows when someone is working */}
        <mesh position={[0, 0.01, D / 2 - 0.05]}>
          <boxGeometry args={[ROOM_W, 0.04, 0.1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={lit ? 2.2 : 0.2} toneMapped={false} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, WALL_H / 2, -D / 2 + WALL_T / 2]}>
          <boxGeometry args={[ROOM_W, WALL_H, WALL_T]} />
          <meshStandardMaterial color={wall} />
        </mesh>
        <mesh castShadow receiveShadow position={[-ROOM_W / 2 + WALL_T / 2, WALL_H / 2, 0]}>
          <boxGeometry args={[WALL_T, WALL_H, D]} />
          <meshStandardMaterial color={wall} />
        </mesh>
        <Html position={[-ROOM_W / 2 + 0.4, WALL_H + 0.5, -D / 2]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <RoomSign color={color}>
            <Dot color={color} glow={lit} />
            <b>{label}</b>
            <span className={muted}>
              {sessions.length ? `${working}/${sessions.length} active` : "empty"}
            </span>
          </RoomSign>
        </Html>
      </group>
      {/* door mat where characters walk in */}
      <mesh position={[dx, 0.02, dz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.2, 0.7]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}
