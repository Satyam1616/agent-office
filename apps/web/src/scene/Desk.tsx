import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";
import { ACTIVITY_META, type Activity, type SessionState } from "../agents";

const WOOD = "#6b4f3a";
const DARK = "#1c1f26";
const LINES = 5;
const SCREEN_W = 0.9;

interface Props {
  position: [number, number, number];
  activity?: Activity;
  status?: SessionState["status"];
  /** Robots work standing up. */
  chair?: boolean;
}

/** A desk with a monitor whose glow and scrolling "code" follow the activity. */
export function Desk({ position, activity, status, chair = true }: Props) {
  const occupied = activity !== undefined;
  const busy = occupied && status !== "idle";
  const screen = occupied ? ACTIVITY_META[activity].screen : "#0b0d12";
  const lines = useRef<(Mesh | null)[]>([]);
  const globe = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const lens = useRef<Group>(null);

  // Text-ish bars on the screen: fast for terminal/typing, slow otherwise.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const speed = activity === "shell" ? 9 : activity === "write" ? 6 : 1.5;
    lines.current.forEach((m, i) => {
      if (!m) return;
      const w = busy ? 0.25 + 0.7 * Math.abs(Math.sin(Math.floor(t * speed + i * 1.7) * 12.9898)) : 0;
      m.scale.x = w;
      m.position.x = -SCREEN_W / 2 + 0.05 + (w * (SCREEN_W - 0.1)) / 2;
      m.visible = w > 0;
    });
    if (globe.current) globe.current.rotation.y = t * 2;
    if (ring.current) ring.current.rotation.z = t * 3;
    if (lens.current) lens.current.position.x = 0.55 + Math.sin(t * 2.5) * 0.25;
  });

  return (
    <group position={position}>
      {/* table */}
      <mesh castShadow receiveShadow position={[0, 0.7, 0]}>
        <boxGeometry args={[1.9, 0.08, 0.95]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      {[-0.85, 0.85].flatMap((x) =>
        [-0.4, 0.4].map((z) => (
          <mesh key={`${x}${z}`} castShadow position={[x, 0.33, z]}>
            <boxGeometry args={[0.07, 0.66, 0.07]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
        )),
      )}

      {/* monitor */}
      <mesh castShadow position={[0, 0.85, -0.3]}>
        <boxGeometry args={[0.08, 0.22, 0.08]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <group position={[0, 1.18, -0.3]}>
        <mesh castShadow>
          <boxGeometry args={[1.0, 0.62, 0.05]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <mesh position={[0, 0, 0.03]}>
          <planeGeometry args={[SCREEN_W, 0.52]} />
          <meshStandardMaterial
            color="#000"
            emissive={screen}
            emissiveIntensity={busy ? 0.55 : occupied ? 0.12 : 0}
            toneMapped={false}
          />
        </mesh>
        {Array.from({ length: LINES }, (_, i) => (
          <mesh key={i} ref={(m) => void (lines.current[i] = m)} position={[0, 0.19 - i * 0.09, 0.035]}>
            <planeGeometry args={[SCREEN_W - 0.1, 0.035]} />
            <meshStandardMaterial color="#000" emissive={screen} emissiveIntensity={2.5} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* keyboard */}
      <mesh position={[0, 0.76, 0.18]}>
        <boxGeometry args={[0.7, 0.03, 0.22]} />
        <meshStandardMaterial color="#3a3f4b" />
      </mesh>

      {/* chair */}
      <group position={[0, 0, 0.95]} visible={chair}>
        <mesh castShadow position={[0, 0.42, 0]}>
          <boxGeometry args={[0.6, 0.08, 0.55]} />
          <meshStandardMaterial color="#2b303b" />
        </mesh>
        <mesh castShadow position={[0, 0.75, 0.27]}>
          <boxGeometry args={[0.6, 0.6, 0.07]} />
          <meshStandardMaterial color="#2b303b" />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.4]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
      </group>

      {/* activity props */}
      {activity === "read" && (
        <group position={[-0.55, 0.78, 0.15]} rotation-y={0.3}>
          <mesh position={[-0.13, 0, 0]} rotation-z={0.15}>
            <boxGeometry args={[0.26, 0.02, 0.34]} />
            <meshStandardMaterial color="#f4ecd8" />
          </mesh>
          <mesh position={[0.13, 0, 0]} rotation-z={-0.15}>
            <boxGeometry args={[0.26, 0.02, 0.34]} />
            <meshStandardMaterial color="#f4ecd8" />
          </mesh>
        </group>
      )}
      {activity === "search" && (
        <group ref={lens} position={[0.55, 0.95, 0.1]} rotation-x={-0.6}>
          <mesh>
            <torusGeometry args={[0.12, 0.025, 8, 24]} />
            <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={1.5} toneMapped={false} />
          </mesh>
          <mesh position={[0.12, -0.12, 0]} rotation-z={0.8}>
            <boxGeometry args={[0.04, 0.18, 0.04]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
        </group>
      )}
      {activity === "web" && (
        <group ref={globe} position={[0.62, 1.05, -0.1]}>
          <mesh>
            <sphereGeometry args={[0.16, 12, 8]} />
            <meshStandardMaterial
              color="#b388ff"
              emissive="#b388ff"
              emissiveIntensity={2}
              wireframe
              toneMapped={false}
            />
          </mesh>
        </group>
      )}
      {activity === "plan" && (
        <group position={[0.55, 0.76, 0.15]} rotation-y={-0.3}>
          <mesh>
            <boxGeometry args={[0.3, 0.02, 0.4]} />
            <meshStandardMaterial color="#c9a26b" />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 0.015, -0.12 + i * 0.1]}>
              <boxGeometry args={[0.2, 0.01, 0.025]} />
              <meshStandardMaterial color="#ffb74d" emissive="#ffb74d" emissiveIntensity={1.5} toneMapped={false} />
            </mesh>
          ))}
        </group>
      )}
      {activity === "delegate" && (
        <group ref={ring} position={[1.25, 0.9, 0.6]} rotation-y={-0.6}>
          <mesh>
            <torusGeometry args={[0.45, 0.05, 8, 32]} />
            <meshStandardMaterial color="#ff5ca8" emissive="#ff5ca8" emissiveIntensity={2.5} toneMapped={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}
