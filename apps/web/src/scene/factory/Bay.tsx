import { Html } from "@react-three/drei";
import { useMemo } from "react";
import { Color } from "three";
import { AGENT_META, type AgentKind, type SessionState } from "../../agents";
import { door, ROOM_W, type RoomPlan } from "../layout";
import { Dot, muted, RoomSign } from "../../ui/labels";

const SAFETY = "#f2c230";

/** Factory version of a room: concrete floor, safety lines, an overhead gantry in the agent's color. */
export function Bay({ agent, sessions, room }: { agent: AgentKind; sessions: SessionState[]; room: RoomPlan }) {
  const { label, color } = AGENT_META[agent];
  const floor = useMemo(() => new Color("#4a4f57").lerp(new Color(color), 0.08), [color]);
  const [x, , z] = room.center;
  const D = room.depth;
  const [dx, , dz] = door(room);
  const running = sessions.filter((s) => s.status !== "idle").length;
  const lit = running > 0;
  const parts = sessions.reduce((n, s) => n + s.turns, 0);

  return (
    <group>
      <group position={[x, 0, z]}>
        <mesh receiveShadow position={[0, -0.1, 0]}>
          <boxGeometry args={[ROOM_W, 0.2, D]} />
          <meshStandardMaterial color={floor} roughness={0.95} />
        </mesh>
        {/* yellow walkway lines */}
        {[
          [0, -D / 2 + 0.35, ROOM_W - 0.5, 0.08],
          [0, D / 2 - 0.35, ROOM_W - 0.5, 0.08],
          [-ROOM_W / 2 + 0.25, 0, 0.08, D - 0.6],
          [ROOM_W / 2 - 0.25, 0, 0.08, D - 0.6],
        ].map(([lx, lz, w, d], i) => (
          <mesh key={i} position={[lx!, 0.005, lz!]}>
            <boxGeometry args={[w!, 0.01, d!]} />
            <meshStandardMaterial color={SAFETY} />
          </mesh>
        ))}
        {/* overhead gantry crane across the back */}
        {[-ROOM_W / 2 + 0.3, ROOM_W / 2 - 0.3].map((px) => (
          <mesh key={px} castShadow position={[px, 1.6, -D / 2 + 0.3]}>
            <boxGeometry args={[0.25, 3.2, 0.25]} />
            <meshStandardMaterial color="#3b4048" />
          </mesh>
        ))}
        <mesh castShadow position={[0, 3.25, -D / 2 + 0.3]}>
          <boxGeometry args={[ROOM_W - 0.2, 0.3, 0.35]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={lit ? 0.6 : 0.05} />
        </mesh>
        {/* front strip glows while any line runs */}
        <mesh position={[0, 0.01, D / 2 - 0.05]}>
          <boxGeometry args={[ROOM_W, 0.04, 0.1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={lit ? 2.2 : 0.2} toneMapped={false} />
        </mesh>
        <Html position={[-ROOM_W / 2 + 0.4, 3.9, -D / 2 + 0.3]} zIndexRange={[10, 0]}>
          <RoomSign color={color}>
            <Dot color={color} glow={lit} />
            <b>{label}</b>
            <span className={muted}>
              {sessions.length ? `${running}/${sessions.length} lines running · 📦 ${parts}` : "line idle"}
            </span>
          </RoomSign>
        </Html>
      </group>
      {/* loading door */}
      <mesh position={[dx, 0.006, dz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.4, 0.7]} />
        <meshStandardMaterial color={SAFETY} />
      </mesh>
    </group>
  );
}
