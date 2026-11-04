import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { MathUtils, type Group } from "three";
import type { Activity, SessionStatus } from "../agents";
import { Html } from "./Html";
import { Bubble, LabelStack, Tag } from "../ui/labels";
import type { Vec3 } from "./layout";

const SKIN = "#f2d3b3";
const WALK_SPEED = 2.4;
const { damp } = MathUtils;

/** "standby": a teammate at their desk waiting for the next hand-off. */
export type Pose = Activity | "standby";

interface Props {
  color: string;
  /** Cap color: the role in team mode, the agent otherwise. */
  accent: string;
  pose: Pose;
  waiting?: boolean;
  tag?: ReactNode;
  bubble?: ReactNode;
  bubbleStatus?: SessionStatus;
  active?: boolean;
  scale?: number;
  target: Vec3;
  door: Vec3;
  selected: boolean;
  onSelect: () => void;
  /** Used by the robot variant for reactions; the classic character ignores them. */
  turns?: number;
  fails?: number;
}

interface Angles {
  armL: number;
  armR: number;
  lean: number;
  headX: number;
  headY: number;
  bob: number;
}

/** Arm/head angles per pose; negative arm angle swings forward. */
function anglesFor(pose: Pose, t: number): Angles {
  const p: Angles = { armL: 0.1, armR: 0.1, lean: 0, headX: 0, headY: 0, bob: 0 };
  switch (pose) {
    case "write":
      p.armL = -1.3 + Math.sin(t * 22) * 0.14;
      p.armR = -1.3 + Math.sin(t * 22 + Math.PI) * 0.14;
      p.headX = 0.1;
      break;
    case "shell":
      p.armL = -1.3 + Math.sin(t * 14) * 0.1;
      p.armR = -1.3 + Math.sin(t * 14 + Math.PI) * 0.1;
      break;
    case "read":
      p.armL = p.armR = -1.0;
      p.headX = 0.35;
      break;
    case "search":
      p.armL = -1.2;
      p.armR = -0.3;
      p.headY = Math.sin(t * 2.5) * 0.5;
      break;
    case "web":
      p.armL = p.armR = -1.2 + Math.sin(t * 8) * 0.05;
      p.headY = Math.sin(t * 1.3) * 0.25;
      break;
    case "think":
      p.armR = -2.4;
      p.headX = -0.2;
      p.bob = Math.sin(t * 2) * 0.03;
      break;
    case "talk":
      p.armL = -0.6 + Math.sin(t * 6) * 0.4;
      p.armR = -0.6 + Math.sin(t * 6 + 1) * 0.4;
      p.bob = Math.abs(Math.sin(t * 6)) * 0.03;
      break;
    case "plan":
      p.armR = -1.1 + Math.sin(t * 12) * 0.15;
      p.armL = -0.4;
      p.headX = 0.3;
      break;
    case "delegate":
      p.armR = -2.8 + Math.sin(t * 8) * 0.35;
      break;
    case "wait":
      p.bob = Math.abs(Math.sin(t * 4)) * 0.12;
      p.armL = p.armR = 0.25;
      p.headY = Math.sin(t * 1.5) * 0.4;
      break;
    case "idle":
      p.lean = -0.35;
      p.headX = -0.25;
      break;
    case "standby":
      p.armL = p.armR = -0.9;
      p.headY = Math.sin(t * 0.7) * 0.15;
      p.bob = Math.sin(t * 1.6) * 0.01;
      break;
    case "other":
      p.armL = p.armR = -1.1;
      break;
  }
  return p;
}

export function Character({
  color,
  accent,
  pose,
  waiting,
  tag,
  bubble,
  bubbleStatus,
  active,
  scale = 1,
  target,
  door,
  selected,
  onSelect,
}: Props) {
  const root = useRef<Group>(null!);
  const body = useRef<Group>(null!);
  const head = useRef<Group>(null!);
  const armL = useRef<Group>(null!);
  const armR = useRef<Group>(null!);
  const legL = useRef<Group>(null!);
  const legR = useRef<Group>(null!);
  const phase = useMemo(() => Math.random() * 10, []);

  // New arrivals appear at the door and walk to their desk.
  useLayoutEffect(() => {
    root.current.position.set(...door);
  }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime + phase;
    const g = root.current;
    const dx = target[0] - g.position.x;
    const dz = target[2] - g.position.z;
    const dist = Math.hypot(dx, dz);
    const walking = dist > 0.04;

    if (walking) {
      const step = Math.min(dist, dt * WALK_SPEED);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      g.rotation.y = damp(g.rotation.y, Math.atan2(dx, dz), 10, dt);
    } else {
      g.position.set(...target);
      g.rotation.y = damp(g.rotation.y, Math.PI, 8, dt); // face the monitor
    }

    const a = walking
      ? { armL: Math.sin(t * 10) * 0.6, armR: -Math.sin(t * 10) * 0.6, lean: 0.1, headX: 0, headY: 0, bob: Math.abs(Math.sin(t * 10)) * 0.05 }
      : anglesFor(pose, t);
    const leg = walking ? Math.sin(t * 10) * 0.7 : -1.4; // seated legs point forward
    const k = 12;
    armL.current.rotation.x = damp(armL.current.rotation.x, a.armL, k, dt);
    armR.current.rotation.x = damp(armR.current.rotation.x, a.armR, k, dt);
    legL.current.rotation.x = damp(legL.current.rotation.x, leg, k, dt);
    legR.current.rotation.x = damp(legR.current.rotation.x, walking ? -leg : leg, k, dt);
    body.current.rotation.x = damp(body.current.rotation.x, a.lean, 6, dt);
    body.current.position.y = 0.5 + a.bob;
    head.current.rotation.x = damp(head.current.rotation.x, a.headX, 8, dt);
    head.current.rotation.y = damp(head.current.rotation.y, a.headY, 8, dt);
    g.position.y = walking ? 0 : -0.05;
  });

  return (
    <group
      ref={root}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
          <ringGeometry args={[0.5, 0.62, 32]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={3} toneMapped={false} />
        </mesh>
      )}

      {/* legs, pivot at the hip */}
      {[
        [legL, -0.12],
        [legR, 0.12],
      ].map(([ref, x]) => (
        <group key={x as number} ref={ref as React.RefObject<Group>} position={[x as number, 0.45, 0]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <boxGeometry args={[0.15, 0.42, 0.15]} />
            <meshStandardMaterial color="#2f3542" />
          </mesh>
        </group>
      ))}

      {/* upper body leans from the hip */}
      <group ref={body} position={[0, 0.5, 0]}>
        <mesh castShadow position={[0, 0.25, 0]}>
          <capsuleGeometry args={[0.24, 0.3, 4, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {[
          [armL, -0.33],
          [armR, 0.33],
        ].map(([ref, x]) => (
          <group key={x as number} ref={ref as React.RefObject<Group>} position={[x as number, 0.45, 0]}>
            <mesh castShadow position={[0, -0.2, 0]}>
              <boxGeometry args={[0.1, 0.42, 0.1]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[0, -0.43, 0]}>
              <sphereGeometry args={[0.065, 8, 8]} />
              <meshStandardMaterial color={SKIN} />
            </mesh>
          </group>
        ))}
        <group ref={head} position={[0, 0.78, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.25, 20, 16]} />
            <meshStandardMaterial color={SKIN} />
          </mesh>
          {[-0.08, 0.08].map((x) => (
            <mesh key={x} position={[x, 0.03, 0.22]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshStandardMaterial color="#111" />
            </mesh>
          ))}
          {/* cap: tells roles (or agents) apart from behind; glows on the active one */}
          <mesh position={[0, 0.12, 0]} rotation-x={-0.15}>
            <sphereGeometry args={[0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
            <meshStandardMaterial
              color={accent}
              emissive={accent}
              emissiveIntensity={active ? 1.6 : 0.2}
              toneMapped={!active}
            />
          </mesh>
          {waiting && (
            <group position={[0, 0.6, 0]}>
              <mesh position={[0, 0.12, 0]}>
                <boxGeometry args={[0.09, 0.28, 0.09]} />
                <meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={3} toneMapped={false} />
              </mesh>
              <mesh position={[0, -0.1, 0]}>
                <boxGeometry args={[0.09, 0.09, 0.09]} />
                <meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={3} toneMapped={false} />
              </mesh>
            </group>
          )}
        </group>
      </group>

      {(bubble || tag) && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <LabelStack>
            {bubble && (
              <Bubble color={accent} status={bubbleStatus}>
                {bubble}
              </Bubble>
            )}
            {tag && <Tag on={active}>{tag}</Tag>}
          </LabelStack>
        </Html>
      )}
    </group>
  );
}
