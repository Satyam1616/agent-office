import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { MathUtils, type Group } from "three";
import type { Vec3 } from "./layout";

const { damp } = MathUtils;

/**
 * Spawns `root` at the door and walks it to `target`, then turns to face the
 * desk (-z). Returns a ref telling the caller whether it is still walking.
 */
export function useWalker(root: RefObject<Group>, door: Vec3, target: Vec3, speed = 2.4) {
  const walking = useRef(true);

  useLayoutEffect(() => {
    root.current?.position.set(...door);
  }, []);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const dx = target[0] - g.position.x;
    const dz = target[2] - g.position.z;
    const dist = Math.hypot(dx, dz);
    walking.current = dist > 0.04;
    if (walking.current) {
      const step = Math.min(dist, dt * speed);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      g.rotation.y = damp(g.rotation.y, Math.atan2(dx, dz), 10, dt);
    } else {
      g.position.set(...target);
      g.rotation.y = damp(g.rotation.y, Math.PI, 8, dt);
    }
  });

  return walking;
}
