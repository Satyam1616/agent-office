import { Html, useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, LoopOnce, LoopRepeat, Vector3, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { SessionStatus } from "../agents";
import { Bubble, LabelStack, Tag } from "../ui/labels";
import type { Pose } from "./Character";
import type { Vec3 } from "./layout";
import { useWalker } from "./useWalker";

// CC0 model by Tomás Laulhé (Quaternius), via the three.js examples; see public/models/robot/README.md.
const MODEL = "/models/robot/RobotExpressive.glb";
const HEIGHT = 1.5;
const FADE = 0.25;

type Clip =
  | "Idle"
  | "Walking"
  | "Sitting"
  | "Punch"
  | "Yes"
  | "No"
  | "Wave"
  | "Jump"
  | "ThumbsUp"
  | "Dance";

/** What the robot loops while doing each activity. */
const CLIP_FOR: Record<Pose, Clip> = {
  write: "Punch",
  shell: "Punch",
  other: "Punch",
  read: "Yes",
  plan: "Yes",
  web: "Yes",
  search: "No",
  talk: "Wave",
  delegate: "Wave",
  think: "Idle",
  standby: "Idle",
  wait: "Jump",
  idle: "Sitting",
};

/** One-off reactions, played over the loop then handed back. */
const ONCE_MS: Partial<Record<Clip, number>> = { ThumbsUp: 1800, No: 1400 };

interface Props {
  color: string;
  accent: string;
  pose: Pose;
  waiting?: boolean;
  tag?: string;
  bubble?: string;
  bubbleStatus?: SessionStatus;
  active?: boolean;
  scale?: number;
  target: Vec3;
  door: Vec3;
  selected: boolean;
  onSelect: () => void;
  /** Bumps trigger a celebration (turn done) or a head shake (tool failed). */
  turns?: number;
  fails?: number;
}

useGLTF.preload(MODEL);

export function RobotCharacter({
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
  turns = 0,
  fails = 0,
}: Props) {
  const { scene, animations } = useGLTF(MODEL);
  const root = useRef<Group>(null!);
  const rig = useRef<Group>(null!);

  // Own skeleton per instance; the body ("Main") painted in the agent's color.
  const { model, fit } = useMemo(() => {
    const model = cloneSkinned(scene) as Group;
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = mesh.material as MeshStandardMaterial;
      if (mat.name === "Main") {
        const tinted = mat.clone();
        tinted.color.set(color);
        mesh.material = tinted;
      }
    });
    model.updateMatrixWorld(true);
    const h = new Box3().setFromObject(model).getSize(new Vector3()).y || 1;
    return { model, fit: HEIGHT / h };
  }, [scene, color]);

  const { actions } = useAnimations(animations, rig);
  const walking = useWalker(root, door, target);
  const playing = useRef<Clip | null>(null);
  const reaction = useRef<{ clip: Clip; until: number } | null>(null);

  const play = (clip: Clip) => {
    if (playing.current === clip) return;
    const next = actions[clip];
    if (!next) return;
    actions[playing.current ?? "Idle"]?.fadeOut(FADE);
    const once = clip === "Sitting" || clip in ONCE_MS;
    next.reset();
    next.setLoop(once ? LoopOnce : LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(FADE).play();
    playing.current = clip;
  };

  const prevTurns = useRef(turns);
  const prevFails = useRef(fails);
  useEffect(() => {
    if (turns > prevTurns.current) reaction.current = { clip: "ThumbsUp", until: performance.now() + ONCE_MS.ThumbsUp! };
    prevTurns.current = turns;
  }, [turns]);
  useEffect(() => {
    if (fails > prevFails.current) reaction.current = { clip: "No", until: performance.now() + ONCE_MS.No! };
    prevFails.current = fails;
  }, [fails]);

  useFrame(() => {
    const r = reaction.current;
    if (r && performance.now() > r.until) reaction.current = null;
    play(walking.current ? "Walking" : (reaction.current?.clip ?? CLIP_FOR[pose]));
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
      <group ref={rig} scale={fit}>
        <primitive object={model} />
      </group>

      {/* role ring at the feet; bright on whoever holds the work */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[0.38, selected ? 0.6 : 0.46, 32]} />
        <meshStandardMaterial
          color={selected ? color : accent}
          emissive={selected ? color : accent}
          emissiveIntensity={selected ? 3 : active ? 2.5 : 0.25}
          toneMapped={false}
        />
      </mesh>

      {waiting && (
        <group position={[0, HEIGHT + 0.45, 0]}>
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
