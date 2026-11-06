# OrbitControls touch lifecycle

`three-stdlib@2.36.1.patch` fixes the controls used by Drei in the office view:

- Only pointers whose drag starts on the scene may move or end its camera gesture. A second finger on the HUD must not make a held scene drag jump.
- Capture each pointer so a drag continues across overlays.
- Rebuild the gesture from the remaining fingers' latest coordinates when a finger lifts or is cancelled. This restores one-finger pan after a pinch and two-finger controls after a third finger lifts.
- Release captured pointers and clear gesture state when controls are disposed, including graphics-quality remounts.

Bun applies this patch to the ESM and CJS builds during installation. The web workspace declares `three-stdlib` as a development dependency so `camera-gestures.test.ts` can verify both builds directly. Those tests exercise real camera transforms with a minimal DOM event surface; browser touch tests are also needed for capture, hit testing, and native scrolling.

Reassess this patch when updating Drei or three-stdlib. Remove it when the dependency handles these cases, keeping the regression tests.
