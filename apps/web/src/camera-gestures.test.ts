import { describe, expect, it } from "bun:test";
import { createRequire } from "node:module";
import { OrthographicCamera, TOUCH } from "three";
import { OrbitControls } from "three-stdlib";

// Both entry points are patched: Vite loads ESM, while other consumers may use CJS.
const cjs = createRequire(import.meta.url)("three-stdlib") as { OrbitControls: typeof OrbitControls };

class Surface extends EventTarget {
  ownerDocument: Surface = this;
  style = { touchAction: "auto" };
  clientWidth = 412;
  clientHeight = 839;
  captures = new Set<number>();
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); }
}

function setup(Controls: typeof OrbitControls) {
  const doc = new Surface();
  const surface = new Surface();
  surface.ownerDocument = doc;
  const camera = new OrthographicCamera(-206, 206, 419.5, -419.5, -200, 400);
  camera.position.set(26, 34, 40);
  camera.zoom = 9;
  camera.updateProjectionMatrix();
  const controls = new Controls(camera, surface as unknown as HTMLElement);
  controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
  controls.screenSpacePanning = false;
  const send = (type: string, id: number, x = 200, y = 140) => {
    const event = Object.assign(new Event(type), { pointerId: id, pointerType: "touch", pageX: x, pageY: y });
    (type === "pointerdown" ? surface : doc).dispatchEvent(event);
  };
  const snapshot = () => ({ target: controls.target.clone(), quaternion: camera.quaternion.clone(), zoom: camera.zoom });
  const pan = (before: ReturnType<typeof snapshot>) => {
    expect(controls.target.distanceTo(before.target)).toBeGreaterThan(0.1);
    expect(camera.quaternion.angleTo(before.quaternion)).toBeLessThan(1e-6);
    expect(camera.zoom).toBe(before.zoom);
  };
  return { camera, controls, surface, send, snapshot, pan };
}

for (const [format, Controls] of [["ESM", OrbitControls], ["CJS", cjs.OrbitControls]] as const) {
  describe(`Camera touch lifecycle (${format})`, () => {
    it("pans with one finger and keeps its pointer captured", () => {
      const h = setup(Controls);
      try {
        const before = h.snapshot();
        h.send("pointerdown", 1);
        expect(h.surface.captures.has(1)).toBe(true);
        h.send("pointermove", 1, 160);
        h.pan(before);
        h.send("pointerup", 1, 160);
        expect(h.surface.captures.size).toBe(0);
      } finally { h.controls.dispose(); }
    });

    for (const lifted of [1, 2]) {
      it(`resumes pan at the remaining finger's current position after lifting finger ${lifted}`, () => {
        const h = setup(Controls);
        try {
          h.send("pointerdown", 1, 140);
          h.send("pointermove", 1, 155);
          h.send("pointerdown", 2, 260);
          h.send("pointermove", 1, 150);
          h.send("pointermove", 2, 275);
          const beforeRelease = h.snapshot();
          h.send("pointerup", lifted, lifted === 1 ? 150 : 275);
          expect(h.controls.target.distanceTo(beforeRelease.target)).toBeLessThan(1e-6);
          expect(h.camera.zoom).toBe(beforeRelease.zoom);
          const before = h.snapshot(), remaining = lifted === 1 ? 2 : 1, x = remaining === 1 ? 150 : 275;
          h.send("pointermove", remaining, x - 10);
          h.pan(before);
          // A stale pointerdown coordinate would produce a much larger first movement.
          expect(h.controls.target.distanceTo(before.target)).toBeCloseTo(10 / h.camera.zoom, 5);
        } finally { h.controls.dispose(); }
      });
    }

    it("ignores movement and release of a finger that started on the HUD", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1);
        const before = h.snapshot();
        h.send("pointermove", 99, 70, 30);
        h.send("pointerup", 99, 70, 30);
        expect(h.controls.target.distanceTo(before.target)).toBe(0);
        expect(h.camera.zoom).toBe(before.zoom);
        h.send("pointermove", 1, 180);
        h.pan(before);
      } finally { h.controls.dispose(); }
    });

    it("keeps a two-finger pinch independent of a third HUD finger", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1, 140);
        h.send("pointerdown", 2, 260);
        const before = h.snapshot();
        h.send("pointermove", 99, 70, 30);
        h.send("pointerup", 99, 70, 30);
        expect(h.camera.zoom).toBe(before.zoom);
        expect(h.camera.quaternion.angleTo(before.quaternion)).toBeLessThan(1e-6);
        h.send("pointermove", 2, 280);
        expect(h.camera.zoom).toBeGreaterThan(before.zoom);
      } finally { h.controls.dispose(); }
    });

    it("ignores three-finger movement then resumes pinch when one lifts", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1, 140);
        h.send("pointerdown", 2, 260);
        h.send("pointerdown", 3, 200, 100);
        const before = h.snapshot();
        h.send("pointermove", 1, 130);
        h.send("pointermove", 2, 270);
        expect(h.camera.zoom).toBe(before.zoom);
        h.send("pointerup", 3, 200, 100);
        h.send("pointermove", 2, 290);
        expect(h.camera.zoom).toBeGreaterThan(before.zoom);
      } finally { h.controls.dispose(); }
    });

    it("continues pan when the other finger is cancelled", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1, 140);
        h.send("pointerdown", 2, 260);
        h.send("pointercancel", 2, 260);
        const before = h.snapshot();
        h.send("pointermove", 1, 120);
        h.pan(before);
      } finally { h.controls.dispose(); }
    });

    it("accepts a fresh drag after the last finger is cancelled", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1);
        h.send("pointermove", 1, 180);
        h.send("pointercancel", 1, 180);
        expect(h.surface.captures.size).toBe(0);
        const before = h.snapshot();
        h.send("pointerdown", 2);
        h.send("pointermove", 2, 160);
        h.pan(before);
      } finally { h.controls.dispose(); }
    });

    it("does not track duplicate pointerdown events twice", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1);
        h.send("pointerdown", 1);
        const before = h.snapshot();
        h.send("pointermove", 1, 160);
        h.pan(before);
      } finally { h.controls.dispose(); }
    });

    it("releases active pointers on disposal and accepts gestures after reconnecting", () => {
      const h = setup(Controls);
      try {
        h.send("pointerdown", 1);
        h.send("pointermove", 1, 180);
        h.controls.dispose();
        expect(h.surface.captures.size).toBe(0);
        const before = h.snapshot();
        h.send("pointermove", 1, 160);
        expect(h.controls.target.distanceTo(before.target)).toBe(0);
        h.controls.connect(h.surface as unknown as HTMLElement);
        h.send("pointerdown", 2);
        h.send("pointermove", 2, 160);
        h.pan(before);
      } finally { h.controls.dispose(); }
    });
  });
}
