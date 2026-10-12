import { Canvas } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { Office } from "./scene/Office";
import { Hud } from "./ui/Hud";
import { useOffice } from "./store";

const ZOOM = Number(new URLSearchParams(location.search).get("zoom")) || 17;
// Below this zoom, idle teammates' role tags are hidden (the `[.far_&]:hidden` variant on <Tag>).
const TAG_ZOOM = 30;
const markFar = (zoom: number) => document.body.classList.toggle("far", zoom < TAG_ZOOM);
markFar(ZOOM);

export function App() {
  const select = useOffice((s) => s.select);
  return (
    <>
      <Canvas shadows dpr={[1, 2]} onPointerMissed={() => select(null)}>
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
          castShadow
          position={[20, 30, 15]}
          intensity={1.6}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-40}
          shadow-camera-right={40}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <Office />
        <EffectComposer>
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} />
          <Vignette darkness={0.45} />
        </EffectComposer>
      </Canvas>
      <Hud />
    </>
  );
}
