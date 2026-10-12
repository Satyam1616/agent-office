import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type Group, type InstancedMesh, type Mesh, type MeshStandardMaterial } from "three";

// Procedural stations. Each faces +z (the conveyor) and is ~1.4 wide.

export const STEEL = "#9aa1ab";
export const DARK = "#2b3038";
export const PANEL = "#d6d9de";

export interface MachineProps {
  /** This station is doing the current tool call. */
  active: boolean;
  /** The cell is running at all (not idle). */
  on: boolean;
  accent: string;
  agentColor: string;
}

const glow = (color: string, intensity: number) => (
  <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} toneMapped={false} />
);

/** Small lamp on every machine: bright when working, dim on standby, dark when off. */
export function StatusLamp({ active, on, accent, position }: MachineProps & { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.07, 12, 8]} />
      {glow(active ? accent : on ? "#4b5563" : "#1f2329", active ? 3 : 0.3)}
    </mesh>
  );
}

/** Flying debris (metal chips or sparks) emitted from a point while active. */
function Particles({
  active,
  count,
  color,
  origin,
  spread,
  life,
  size,
}: {
  active: boolean;
  count: number;
  color: string;
  origin: [number, number, number];
  spread: number;
  life: number;
  size: number;
}) {
  const mesh = useRef<InstancedMesh>(null!);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        phase: Math.random() * life,
        vx: (Math.random() - 0.5) * spread,
        vy: 0.6 + Math.random() * 1.4,
        vz: (Math.random() - 0.2) * spread,
      })),
    [count, life, spread],
  );
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      const k = (t + s.phase) % life;
      dummy.position.set(origin[0] + s.vx * k, origin[1] + s.vy * k - 4.9 * k * k, origin[2] + s.vz * k);
      dummy.rotation.set(t * 7 + i, t * 5, 0);
      dummy.scale.setScalar(active ? 1 : 0);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
      <boxGeometry args={[size, size, size]} />
      {glow(color, 2.5)}
    </instancedMesh>
  );
}

/** 🦾 Lead: picks the workpiece and hands it to the next station. */
export function RobotArm({ active, on, accent, agentColor }: MachineProps) {
  const turret = useRef<Group>(null!);
  const upper = useRef<Group>(null!);
  const fore = useRef<Group>(null!);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const k = Math.min(1, dt * 4);
    const yaw = active ? Math.sin(t * 1.4) * 1.3 : on ? Math.sin(t * 0.4) * 0.2 : 0;
    const lift = active ? -0.5 + Math.sin(t * 2.8) * 0.35 : on ? -0.3 : -0.1;
    turret.current.rotation.y += (yaw - turret.current.rotation.y) * k;
    upper.current.rotation.x += (lift - upper.current.rotation.x) * k;
    fore.current.rotation.x += ((active ? 1.4 + Math.sin(t * 2.8) * 0.3 : 1.2) - fore.current.rotation.x) * k;
  });
  return (
    <group>
      <mesh castShadow position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.45, 0.5, 0.3, 20]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <group ref={turret} position={[0, 0.3, 0]}>
        <mesh castShadow position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.28, 0.32, 0.3, 16]} />
          <meshStandardMaterial color={agentColor} />
        </mesh>
        <group ref={upper} position={[0, 0.35, 0]}>
          <mesh castShadow position={[0, 0.4, 0]}>
            <boxGeometry args={[0.18, 0.8, 0.18]} />
            <meshStandardMaterial color={PANEL} />
          </mesh>
          <group ref={fore} position={[0, 0.8, 0]}>
            <mesh castShadow position={[0, 0.32, 0]}>
              <boxGeometry args={[0.14, 0.64, 0.14]} />
              <meshStandardMaterial color={PANEL} />
            </mesh>
            {[-0.07, 0.07].map((x) => (
              <mesh key={x} position={[x, 0.7, 0]}>
                <boxGeometry args={[0.04, 0.14, 0.08]} />
                {glow(accent, active ? 2 : 0.2)}
              </mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

/** 🔦 Reader: a gantry with a laser line sweeping over the part. */
export function Scanner({ active, on, accent, agentColor }: MachineProps) {
  const head = useRef<Group>(null!);
  useFrame(({ clock }) => {
    head.current.position.x = active ? Math.sin(clock.elapsedTime * 3) * 0.45 : 0;
  });
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.3, 0.7, 0.9]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>
      <mesh position={[0, 0.71, 0]}>
        <boxGeometry args={[1.1, 0.02, 0.7]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} castShadow position={[x, 1.05, -0.3]}>
          <boxGeometry args={[0.1, 0.7, 0.1]} />
          <meshStandardMaterial color={agentColor} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.42, -0.3]}>
        <boxGeometry args={[1.3, 0.1, 0.12]} />
        <meshStandardMaterial color={agentColor} />
      </mesh>
      <group ref={head} position={[0, 1.3, -0.15]}>
        <mesh>
          <boxGeometry args={[0.18, 0.14, 0.2]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        {active && (
          <mesh position={[0, -0.28, 0.1]} rotation-x={0.35}>
            <planeGeometry args={[0.02, 0.6]} />
            {glow("#ff3355", 4)}
          </mesh>
        )}
      </group>
      {active && (
        <mesh position={[0, 0.725, 0.05]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[1.0, 0.04]} />
          {glow("#ff3355", 3)}
        </mesh>
      )}
      <StatusLamp active={active} on={on} accent={accent} agentColor={agentColor} position={[0.55, 0.75, 0.42]} />
    </group>
  );
}

/** ⚙️ Coder: enclosed mill, spinning spindle and chips flying behind the glass. */
export function CncMill({ active, on, accent, agentColor }: MachineProps) {
  const spindle = useRef<Group>(null!);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    spindle.current.rotation.y += dt * (active ? 40 : 0);
    spindle.current.position.y = active ? 1.05 + Math.sin(t * 3) * 0.08 : 1.15;
    spindle.current.position.x = active ? Math.sin(t * 1.3) * 0.3 : 0;
  });
  return (
    <group>
      {/* cabinet: back, sides, roof, base; the front is glass */}
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.4, 0.6, 1.0]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>
      <mesh castShadow position={[0, 1.0, -0.47]}>
        <boxGeometry args={[1.4, 0.8, 0.06]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>
      {[-0.67, 0.67].map((x) => (
        <mesh key={x} castShadow position={[x, 1.0, 0]}>
          <boxGeometry args={[0.06, 0.8, 1.0]} />
          <meshStandardMaterial color={PANEL} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.43, 0]}>
        <boxGeometry args={[1.4, 0.06, 1.0]} />
        <meshStandardMaterial color={agentColor} />
      </mesh>
      <mesh position={[0, 1.0, 0.48]}>
        <planeGeometry args={[1.28, 0.78]} />
        <meshStandardMaterial color="#a8d8ff" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {/* table + stock */}
      <mesh position={[0, 0.64, 0]}>
        <boxGeometry args={[1.0, 0.08, 0.6]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.75, 0]}>
        <boxGeometry args={[0.5, 0.14, 0.35]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
      <group ref={spindle} position={[0, 1.15, 0]}>
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 0.3, 12]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <mesh position={[0, -0.22, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.16, 8]} />
          {glow(accent, active ? 1.5 : 0.1)}
        </mesh>
      </group>
      <Particles active={active} count={26} color="#ffd27a" origin={[0, 0.85, 0]} spread={1.2} life={0.45} size={0.035} />
      <StatusLamp active={active} on={on} accent={accent} agentColor={agentColor} position={[0.6, 0.62, 0.52]} />
    </group>
  );
}

/** ⚡ Bash: flatbed laser cutter with a moving gantry and sparks. */
export function LaserCutter({ active, on, accent, agentColor }: MachineProps) {
  const bridge = useRef<Group>(null!);
  const head = useRef<Group>(null!);
  const sparksAt = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const z = active ? Math.sin(t * 1.7) * 0.28 : 0;
    const x = active ? Math.sin(t * 4.1) * 0.5 : 0;
    bridge.current.position.z = z;
    head.current.position.x = x;
    sparksAt.current.position.set(x, 0, z);
  });
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.4, 0.7, 0.95]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>
      <mesh position={[0, 0.715, 0]}>
        <boxGeometry args={[1.2, 0.03, 0.75]} />
        <meshStandardMaterial color="#3d434d" />
      </mesh>
      {[-0.68, 0.68].map((x) => (
        <mesh key={x} position={[x, 0.8, 0]}>
          <boxGeometry args={[0.06, 0.12, 0.95]} />
          <meshStandardMaterial color={agentColor} />
        </mesh>
      ))}
      <group ref={bridge}>
        <mesh castShadow position={[0, 1.15, 0]}>
          <boxGeometry args={[1.42, 0.08, 0.1]} />
          <meshStandardMaterial color={agentColor} />
        </mesh>
        <group ref={head} position={[0, 1.08, 0]}>
          <mesh>
            <boxGeometry args={[0.14, 0.12, 0.14]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          {active && (
            <mesh position={[0, -0.18, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.36, 6]} />
              {glow("#39ff88", 6)}
            </mesh>
          )}
        </group>
      </group>
      <group ref={sparksAt}>
        <Particles active={active} count={18} color="#fff3a0" origin={[0, 0.74, 0]} spread={0.9} life={0.3} size={0.025} />
      </group>
      <StatusLamp active={active} on={on} accent={accent} agentColor={agentColor} position={[0.6, 0.6, 0.5]} />
    </group>
  );
}

/** 📡 Research: satellite dish pulling data in, crates on a loading dock. */
export function DishDock({ active, on, accent, agentColor }: MachineProps) {
  const dish = useRef<Group>(null!);
  const ring = useRef<Mesh<any, MeshStandardMaterial>>(null!);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    dish.current.rotation.y += dt * (active ? 1.6 : on ? 0.15 : 0);
    const k = (t * 1.5) % 1;
    ring.current.scale.setScalar(0.3 + k * 1.6);
    ring.current.material.opacity = active ? 1 - k : 0;
  });
  return (
    <group>
      <mesh receiveShadow position={[0, 0.12, 0]}>
        <boxGeometry args={[1.4, 0.24, 1.0]} />
        <meshStandardMaterial color="#5a5f68" />
      </mesh>
      {[
        [-0.4, 0.2],
        [-0.15, -0.2],
        [-0.45, -0.2],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 0.24 + 0.17, z]}>
          <boxGeometry args={[0.3, 0.34, 0.3]} />
          <meshStandardMaterial color={i === 1 ? agentColor : "#a0784f"} />
        </mesh>
      ))}
      <mesh castShadow position={[0.35, 0.75, -0.1]}>
        <cylinderGeometry args={[0.05, 0.07, 1.0, 10]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <group ref={dish} position={[0.35, 1.3, -0.1]}>
        <mesh rotation-x={-0.7} castShadow>
          <sphereGeometry args={[0.45, 20, 8, 0, Math.PI * 2, 0, 0.75]} />
          <meshStandardMaterial color={PANEL} side={2} />
        </mesh>
        <mesh position={[0, 0.1, 0.25]}>
          <sphereGeometry args={[0.05, 8, 8]} />
          {glow(accent, active ? 4 : 0.3)}
        </mesh>
      </group>
      <mesh ref={ring} position={[0.35, 1.5, -0.1]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.4, 0.015, 6, 32]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={3}
          toneMapped={false}
          transparent
          depthWrite={false}
        />
      </mesh>
      <StatusLamp active={active} on={on} accent={accent} agentColor={agentColor} position={[0.6, 0.3, 0.52]} />
    </group>
  );
}

/** 🔬 Reviewer: coordinate measuring machine; the big lamp shows pass/fail. */
export function QcStation({ active, on, accent, agentColor, lastOk }: MachineProps & { lastOk?: boolean }) {
  const probe = useRef<Group>(null!);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    probe.current.position.y = active ? 1.05 + Math.abs(Math.sin(t * 2.2)) * 0.25 : 1.3;
    probe.current.position.x = active ? Math.sin(t * 0.9) * 0.35 : 0;
  });
  const result = lastOk === false ? "#ff3b3b" : "#2bff88";
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
        <boxGeometry args={[1.3, 0.7, 0.9]} />
        <meshStandardMaterial color="#3a3f47" roughness={0.9} />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} castShadow position={[x, 1.1, -0.2]}>
          <boxGeometry args={[0.1, 0.8, 0.1]} />
          <meshStandardMaterial color={PANEL} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.52, -0.2]}>
        <boxGeometry args={[1.3, 0.1, 0.12]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>
      <group ref={probe} position={[0, 1.3, -0.05]}>
        <mesh>
          <cylinderGeometry args={[0.03, 0.03, 0.5, 8]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <mesh position={[0, -0.27, 0]}>
          <sphereGeometry args={[0.04, 10, 8]} />
          {glow("#ff6b6b", active ? 2 : 0.2)}
        </mesh>
      </group>
      <mesh position={[0, 0.75, 0.05]}>
        <boxGeometry args={[0.4, 0.1, 0.3]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* pass/fail beacon, keeps showing the last verdict */}
      <mesh position={[0.5, 1.75, -0.2]}>
        <sphereGeometry args={[0.12, 16, 12]} />
        {glow(result, lastOk === undefined ? 0.15 : active ? 4 : on ? 1.2 : 0.3)}
      </mesh>
      <StatusLamp active={active} on={on} accent={accent} agentColor={agentColor} position={[0.55, 0.75, 0.42]} />
    </group>
  );
}

/** Stack light for the whole cell: green run, yellow waiting on you, red last op failed. */
export function AndonTower({ status, lastOk }: { status: "working" | "waiting" | "idle"; lastOk?: boolean }) {
  const yellow = useRef<Mesh<any, MeshStandardMaterial>>(null!);
  useFrame(({ clock }) => {
    yellow.current.material.emissiveIntensity = status === "waiting" ? (Math.sin(clock.elapsedTime * 8) > 0 ? 4 : 0.2) : 0.05;
  });
  const red = status !== "idle" && lastOk === false;
  const green = status === "working" && !red;
  return (
    <group>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 1.65, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.18, 14]} />
        {glow("#ff2d2d", red ? 4 : 0.05)}
      </mesh>
      <mesh ref={yellow} position={[0, 1.46, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.18, 14]} />
        <meshStandardMaterial color="#ffcc00" emissive="#ffcc00" emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.27, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.18, 14]} />
        {glow("#22ff77", green ? 4 : 0.05)}
      </mesh>
    </group>
  );
}

/** 🖨️ Coder writing a brand-new file: the part grows layer by layer under a moving nozzle. */
export function Printer3D({ active, on, accent, agentColor }: MachineProps) {
  const head = useRef<Group>(null!);
  const part = useRef<Mesh>(null!);
  const spool = useRef<Mesh>(null!);
  const progress = useRef(0);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    if (active) progress.current = (progress.current + dt * 0.12) % 1;
    const h = 0.02 + progress.current * 0.45;
    part.current.scale.y = h / 0.45;
    part.current.position.y = 0.66 + h / 2;
    head.current.position.set(
      active ? Math.sin(t * 6) * 0.18 : 0,
      0.66 + h + 0.08,
      active ? Math.cos(t * 4.3) * 0.15 : 0,
    );
    spool.current.rotation.z += dt * (active ? 3 : 0);
  });
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.3, 0.6, 1.0]} />
        <meshStandardMaterial color={PANEL} />
      </mesh>
      {[
        [-0.6, -0.42],
        [0.6, -0.42],
        [-0.6, 0.42],
        [0.6, 0.42],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x!, 1.05, z!]}>
          <boxGeometry args={[0.06, 0.9, 0.06]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.52, 0]}>
        <boxGeometry args={[1.3, 0.06, 1.0]} />
        <meshStandardMaterial color={agentColor} />
      </mesh>
      {/* heated bed */}
      <mesh position={[0, 0.63, 0]}>
        <boxGeometry args={[0.9, 0.04, 0.7]} />
        {glow("#ff7a3d", active ? 0.6 : 0.05)}
      </mesh>
      <mesh ref={part} position={[0, 0.67, 0]}>
        <boxGeometry args={[0.35, 0.45, 0.35]} />
        <meshStandardMaterial color={accent} roughness={0.6} />
      </mesh>
      <group ref={head} position={[0, 1.2, 0]}>
        <mesh>
          <boxGeometry args={[0.16, 0.12, 0.16]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <mesh position={[0, -0.09, 0]}>
          <coneGeometry args={[0.03, 0.06, 8]} />
          {glow("#ff9a3d", active ? 4 : 0.2)}
        </mesh>
      </group>
      <mesh ref={spool} position={[0.72, 1.25, 0]} rotation-y={Math.PI / 2}>
        <torusGeometry args={[0.16, 0.06, 8, 20]} />
        <meshStandardMaterial color={accent} />
      </mesh>
      <StatusLamp active={active} on={on} accent={accent} agentColor={agentColor} position={[0.55, 0.62, 0.52]} />
    </group>
  );
}
