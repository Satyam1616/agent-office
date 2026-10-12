import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect } from "react";
import { Office } from "./scene/Office";
import { QUALITY, useSettings } from "./settings";
import { Hud } from "./ui/Hud";
import { useOffice } from "./store";

const ZOOM = Number(new URLSearchParams(location.search).get("zoom")) || 17;
// Below this zoom, idle teammates' role tags are hidden (the `[.far_&]:hidden` variant on <Tag>).
const TAG_ZOOM = 30;
const markFar = (zoom: number) => document.body.classList.toggle("far", zoom < TAG_ZOOM);
markFar(ZOOM);

/** How long after the last drag/scroll the view keeps full frame rate (controls are damped). */
const INTERACT_MS = 1500;

/**
 * Drives the `demand` frame loop: full rate while an agent works or you move the
 * camera, a trickle when everything is idle, nothing while the window is hidden.
 */
function FrameDriver({ fps, idleFps }: { fps: number; idleFps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const el = useThree((s) => s.gl.domElement);
  const busy = useOffice((s) => Object.values(s.sessions).some((x) => x.status !== "idle"));

  useEffect(() => {
    let lastInput = 0;
    const poke = () => {
      lastInput = performance.now();
      invalidate();
    };
    const events = ["pointerdown", "pointermove", "wheel"] as const;
    events.forEach((e) => el.addEventListener(e, poke, { passive: true }));
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const rate = busy || performance.now() - lastInput < INTERACT_MS ? fps : idleFps;
      if (!document.hidden) invalidate();
      timer = setTimeout(tick, 1000 / rate);
    };
    tick();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => el.removeEventListener(e, poke));
    };
  }, [el, invalidate, busy, fps, idleFps]);
  return null;
}

export function App() {
  const select = useOffice((s) => s.select);
  const quality = useSettings((s) => s.quality);
  const q = QUALITY[quality];
  return (
    <>
      {/* Remount on preset change: shadow maps and antialiasing are fixed at creation. */}
      <Canvas
        key={quality}
        shadows={q.shadows > 0}
        dpr={q.dpr}
        gl={{ antialias: quality !== "saver", powerPreference: quality === "saver" ? "low-power" : "high-performance" }}
        frameloop={q.fps === q.idleFps ? "always" : "demand"}
        onPointerMissed={() => select(null)}
      >
        {q.fps !== q.idleFps && <FrameDriver fps={q.fps} idleFps={q.idleFps} />}
        <color attach="background" args={["#0e1117"]} />
        <OrthographicCamera makeDefault position={[26, 34, 40]} zoom={ZOOM} near={-200} far={400} />
        <OrbitControls
          makeDefault
          enableDamping
          minZoom={5}
          maxZoom={80}
          maxPolarAngle={1.25}
          screenSpacePanning={false}
          onChange={(e) => e && markFar((e.target as unknown as { object: { zoom: number } }).object.zoom)}
        />
        <hemisphereLight args={["#cfe3ff", "#20242c", 0.9]} />
        <directionalLight
          castShadow={q.shadows > 0}
          position={[20, 30, 15]}
          intensity={1.6}
          shadow-mapSize={[q.shadows || 512, q.shadows || 512]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <Office />
        {q.effects && (
          <EffectComposer>
            <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} />
            <Vignette darkness={0.45} />
          </EffectComposer>
        )}
      </Canvas>
      <Hud />
    </>
  );
}
