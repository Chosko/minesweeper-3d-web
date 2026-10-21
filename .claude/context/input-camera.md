# Input — the 3D camera and picking

## OVERVIEW

The camera side of the 3D input: the free-fly camera, the orbit camera
that drives it for the Camera setting's Orbit, the keyboard's ramped look,
the framed spawn pose, the off-screen arrow's in-view test, the spacing
step and toggle, and crosshair picking. The DOM input, the action state
machines and the 3D touch controls are [input.md](input.md); the view-mode
layer, controller polling and shell navigation are
[input-controller.md](input-controller.md).

| File | Implements | Context file |
| --- | --- | --- |
| `js/input.js` (camera half) | `FlyCamera`, `KeyLook`, `keyLookDeg`, `OrbitCamera`, `orbitRange`, `spawnPose`, `offscreenArrow`, `spacingStep`, `spacingToggle`, camera / spacing / orbit constants | this file |
| `js/input.js` (DOM half) | `MouseActions`, `KeyActions`, `DragLook`, `TapToggle`, `Input`, `escResumes` | [input.md](input.md) |
| `js/picking.js` | `pickCell` (3D-DDA ray walk) and `pickCellBrute` (reference) | this file |

`js/main.js` owns one `FlyCamera` (`cam`) and one `OrbitCamera` over it,
and picks which one the camera inputs turn ([app-shell-3d-camera.md](app-shell-3d-camera.md)).

## PUBLIC API

**js/input.js**
- Constants: `MOVE_SPEED` (50 u/s), `LOOK_DEG_PER_PX` (0.2), `PAD_LOOK_DEG_PER_S` (180),
  `KEY_LOOK_START_DEG_PER_S` / `KEY_LOOK_MAX_DEG_PER_S` / `KEY_LOOK_RAMP_S` (30 / 120 / 0.5 s),
  `SPACING_MIN` / `SPACING_MAX` / `SPACING_START` (1 / 10 / 1.1), `SPACING_STEP` (0.1),
  `SPACING_STEP_MAX` (0.5), `SPACING_ACCEL` (0.5), `SPACING_RUN_GAP_MS` (200), `SPACING_TOGGLE` (2),
  `SPAWN_PITCH_DEG` (15), `SPAWN_YAW_DEG` (20), `SPAWN_MARGIN` (0.1), `SPAWN_FACE_CLEARANCE` (0.1),
  `ORBIT_MIN_PITCHES` (1), `ORBIT_MAX_SPAWNS` (3), `ORBIT_WHEEL_FACTOR` (0.9),
  `ORBIT_DOLLY_SPEED` (= `MOVE_SPEED`).
- `FlyCamera` — state `x, y, z, pitch` (+ = looking down), `yaw` (PI = facing +Z); settings
  `sensitivity` (1 = original) and `invertY`. `reset(x, y, z)`, `place(pose)`, `look(dxPx, dyPx)`
  (pitch clamped ±PI/2), `move(dt, {w,a,s,d,q,e})`, `moveAxes(dt, f, r, u)`, `lookAxes(dt, x, y)`,
  `rescale(ratio)` (position scaled about the board centre: a spacing change),
  `apply(cam)` (writes a `THREE.PerspectiveCamera`, order `'YXZ'`).
- `keyLookDeg(t)` — degrees an arrow held `t` s has turned at sensitivity 1: the rate ramps linearly
  from 30 to 120 °/s over 0.5 s, then holds.
- `KeyLook` — `update(view, dt, x, y)` (x -1 left / +1 right, y -1 up / +1 down) turns `view` through
  its `look()`, so sensitivity, invert Y and the pitch clamp apply as for the mouse; each axis ramps
  from its own press, and a released or reversed axis starts again. `reset()`.
- `orbitRange(box, spacing, fovDeg, aspect)` → `{min, max}`: one lattice pitch (4 × spacing) to three
  times `spawnPose`'s distance to the board centre.
- `OrbitCamera(cam)` — drives a `FlyCamera` so it always looks at the board centre (the origin) from
  `dist`: `setRange({min, max})`, `enter()` (takes the camera's yaw, pitch and distance to the centre,
  clamped, and re-aims it), `look`, `lookAxes` (through the camera's own), `dolly(units)` (+ = in),
  `dollyAxis(dt, v)` (v in -1..1 of `ORBIT_DOLLY_SPEED`), `wheel(notches)` (each notch up multiplies
  `dist` by 0.9), `rescale(ratio, range)` (a spacing change). Every change writes the camera's
  `x, y, z`.
- `spacingStep(state, notches, now?)` → `{spacing, run, dir, at}` — pure: the spacing after `notches`
  (fractional on a trackpad) arriving at `now` ms, `state` the previous result or `{spacing}`. Each
  notch steps `SPACING_STEP` plus `SPACING_ACCEL` of it per whole notch already turned in the run, up
  to `SPACING_STEP_MAX`; a run continues while notches come the same way within `SPACING_RUN_GAP_MS`.
  Without `now` (the D-pad's presses and repeats) nothing accelerates: one `SPACING_STEP` per notch.
  Clamped to [1, 10]. Shared by the wheel, the D-pad, the pinch and the debug hook's `wheel`.
- `spacingToggle(spacing)` → `SPACING_TOGGLE`, or `SPACING_START` when already 2.0 to one decimal (`X`).
- `spawnPose({X, Y, Z}, spacing, fovDeg, aspect)` → `{x, y, z, yaw, pitch}` — pure: the framed
  three-quarter view, `SPAWN_PITCH_DEG` down and `SPAWN_YAW_DEG` off +Z (the -X face shows),
  centred on the near face's centre cube, from the closest distance that keeps the box's eight
  corners within `SPAWN_MARGIN` of the view's edges and clears the top and side face planes by
  `SPAWN_FACE_CLEARANCE` (what binds at wide fields of view).
- `offscreenArrow(pose, {X, Y, Z}, spacing, fovDeg, aspect)` → null while any part of the box is in
  the frustum, else the screen angle toward the box centre (0 = right, PI/2 = up; for a centre
  behind the camera, the shortest turn's way).

**js/picking.js**
- `FLY_THROUGH_DIST` — 1.5 pitches at the start spacing (`1.5 * 4 * SPACING_START`, 6.6 units), fixed in
  world units whatever the spacing.
- `pickCell(game, spacing, o, d, spaceHeld)` → cell index or -1 — `o` origin, `d` normalized
  direction; `game` is the 3D state view (`js/engine/state-view-3d.js`, [engine-3d.md](engine-3d.md)),
  read for `X/Y/Z`, `unlinked`, `pressed`.
- `pickCellBrute(...)` — same signature and result; O(n), used only by the debug hook.

## INTERNAL PATTERNS

- **Camera conventions.** `pitch` + = down, `yaw` PI = +Z; `apply()` negates both into a `'YXZ'`
  Euler. `move()` and `moveAxes()` share one pair of vectors (`_axes`): W along the true view
  direction (cos(pitch) on XZ), A/D horizontal strafes; Q/E and the `u` axis are world-vertical.
  `lookAxes` and `KeyLook` convert deg/s to pixel-equivalents so `sensitivity` and `invertY` apply
  once, in `look()`.
- **One camera, two drivers.** The orbit holds only `dist` and its range; its pose is the
  `FlyCamera`'s own yaw and pitch, written back as a position on the view line through the centre,
  so the renderer, picking, the spawn pose and the replay's camera sampler read one camera whatever
  the mode. Orbit to Fly keeps the pose; Fly to Orbit is `enter()`.
- **Picking geometry.** Grid centred on the origin: cell (i,j,k) centre = `(i - (X-1)/2) * 4s`,
  cube = centre ± 2, lattice pitch `4s` (the spec's `[P-3, P+1]` box up to a translation). Cell
  index = `i + X * (j + Y * k)`. The DDA visits lattice cells in ray order, so the first hit is
  nearest. `pickCell` and `pickCellBrute` must stay in agreement (the debug hook's `pickWith`
  cross-checks them).
- **Pickability.** Excluded: `unlinked` cells, `pressed` cells when `spaceHeld`, and every cell whose
  centre lies within `FLY_THROUGH_DIST` of the ray origin (the glass the renderer fades; the ray goes
  on past it). Everything else (including invisible revealed zeros that are not unlinked) is pickable.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule:
[../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md). This area enforces:
- **Controls (must be preserved)** — 0.2°/px look, pitch clamp ±90°, WASD/QE at 50 u/s
  (`FlyCamera`). The spec's web-port changes: the framed three-quarter `spawnPose`, not the
  original's straight view toward +Z, and W along the true view direction, not the original's
  forward-vector quirk.
- **Picking** — ray from screen centre, nearest cube, exclusion of unlinked cells and of pressed
  cells while Space is held (`pickCell`); the web port's fly-through exclusion (`FLY_THROUGH_DIST`).
- **Grid & geometry** — cube edge 4, spacing range [1, 10], start 1.1, wheel up = larger
  (`SPACING_*`); the web port's 0.1 step with acceleration, `X` toggle and camera scaling
  (`spacingStep`, `spacingToggle`, `rescale`).

The keyboard look, the orbit camera and the controller sticks are web-port additions the spec
permits; they must not alter any rule above.
[../domain/features/settings.md](../domain/features/settings.md) — the Camera setting.

## CROSS-REFERENCES

- [input.md](input.md) — the DOM input whose arrows feed `KeyLook` and whose wheel the caller turns into
  a spacing or a dolly.
- [engine-3d.md](engine-3d.md) — the 3D state view `pickCell` reads.
- [rendering.md](rendering.md) — `FlyCamera.apply` drives the renderer's camera; the picked cell
  becomes the renderer's selection; the renderer fades the glass within `FLY_THROUGH_DIST`.
- [app-shell-3d-camera.md](app-shell-3d-camera.md) — `view3D()`, `setCameraMode`, `setSpacing`, `placeAtSpawn`, the
  orbit's dolly; [app-shell-3d-play.md](app-shell-3d-play.md) — the frame loop that runs `KeyLook`.
- [settings-appliers.md](settings-appliers.md) — `applyLook` (sensitivity, invert Y), `applyCamera` (the mode).
- [input-controller.md](input-controller.md) — the sticks that feed `moveAxes` / `lookAxes`.
- [testing.md](testing.md) — `tests/camera-flight.test.mjs` (forward vector, spacing step, toggle and
  camera scaling, fly-through pick rule), `tests/camera-orbit.test.mjs`, `tests/camera-spawn.test.mjs`,
  `tests/input-keyboard-3d.test.mjs` (the ramp).

## WHEN TO READ THE SOURCE

- Debugging camera direction, movement axes or a mirrored / tilted view (`FlyCamera.move`, `moveAxes`, `apply`).
- Changing the keyboard look's rates or ramp (`keyLookDeg`, `KeyLook`).
- Changing the orbit's range, wheel factor or dolly speed, or how it enters (`orbitRange`, `OrbitCamera`).
- Changing the spawn framing or the off-screen arrow's in-view test (`spawnPose`, `offscreenArrow`).
- Fixing wheel step size on a specific browser or trackpad (`spacingStep`).
- Fixing a wrong or missed pick, especially at grid edges or axis-aligned rays (`pickCell` DDA setup and step loop).
- Changing cube size or grid centring — picking geometry must change together with the renderer's cube placement.
