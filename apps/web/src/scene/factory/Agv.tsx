import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { AGENT_META, type SessionState } from "../../agents";
import { AgvIcon, Ico, IdleIcon, WorkText } from "../../ui/icons";
import { Bubble, LabelStack, Tag } from "../../ui/labels";
import type { Vec3 } from "../layout";
import { DARK } from "./machines";

const PATROL = 0.95;
const SPEED = 2.2;

interface Props {
  session: SessionState;
  home: Vec3;
  door: Vec3;
  selected: boolean;
  onSelect: () => void;
}

/** A subagent: an AGV that drives in from the door and shuttles back and forth while working. */
export function Agv({ session, home, door, selected, onSelect }: Props) {
  const { color } = AGENT_META[session.agent];
  const root = useRef<Group>(null!);
  const lidar = useRef<Group>(null!);
  const phase = useMemo(() => Math.random() * 10, []);
  const working = session.status !== "idle";

  useLayoutEffect(() => {
    root.current.position.set(...door);
  }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime + phase;
    const g = root.current;
    const tx = home[0] + (working ? Math.sin(t * 0.8) * PATROL : 0);
    const tz = home[2] + 0.6;
    const dx = tx - g.position.x;
    const dz = tz - g.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) {
      const step = Math.min(dist, dt * SPEED);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      g.rotation.y = Math.atan2(dx, dz);
    }
    lidar.current.rotation.y += dt * (working ? 8 : 0);
  });

  const bubble = working ? <WorkText session={session} max={28} /> : <><Ico icon={IdleIcon} /> parked</>;

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.65, 0.75, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
        </mesh>
      )}
      <mesh castShadow position={[0, 0.17, 0]}>
        <boxGeometry args={[0.7, 0.22, 0.95]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.6, 0.08, 0.85]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      {/* cargo */}
      <mesh castShadow position={[0, 0.42, -0.1]}>
        <boxGeometry args={[0.4, 0.28, 0.4]} />
        <meshStandardMaterial color="#a0784f" />
      </mesh>
      <group ref={lidar} position={[0, 0.34, 0.36]}>
        <mesh>
          <cylinderGeometry args={[0.07, 0.07, 0.1, 10]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <mesh position={[0.06, 0, 0]}>
          <boxGeometry args={[0.03, 0.04, 0.04]} />
          <meshStandardMaterial
            color="#ff3b3b"
            emissive="#ff3b3b"
            emissiveIntensity={working ? 4 : 0.2}
            toneMapped={false}
          />
        </mesh>
      </group>
      <Html position={[0, 1.2, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
        <LabelStack>
          <Bubble color={color} status={session.status}>
            {bubble}
          </Bubble>
          <Tag on={working}>
            <Ico icon={AgvIcon} /> AGV · subagent
          </Tag>
        </LabelStack>
      </Html>
    </group>
  );
}
