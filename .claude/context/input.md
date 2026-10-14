# Input

## OVERVIEW

Everything between the player's devices and a 3D game action or camera
pose: the free-fly camera, keyboard / mouse / pointer-lock DOM handling, the
release-based mouse action state machine (shared by the controller
triggers), and crosshair picking. The view-mode layer, controller polling
and the shell navigation layer are in
[input-controller.md](input-controller.md).

| File | Implements | Context file |
| --- | --- | --- |
| `js/input.js` | `FlyCamera`, `spawnPose`, `offscreenArrow`, `MouseActions`, `DragLook`, `TapToggle`, `Input` (DOM listeners), `escResumes`, camera / spacing constants | this file |
| `js/picking.js` | `pickCell` (3D-DDA ray walk) and `pickCellBrute` (reference) | this file |
| `js/controls.js` | `Controls`: union of keyboard and controller view modes + controller move axes | [input-controller.md](input-controller.md) |
| `js/gamepad.js` | Gamepad API reader, stick curve, trigger hysteresis, auto-repeat, pad glyphs, spatial menu focus search | [input-controller.md](input-controller.md) |
| `js/shell/navigation.js` | Topmost layer, default-focus fallback, Back inputs, arrow-key focus moves, held-button suppression | [input-controller.md](input-controller.md) |

The wiring (which pad button maps to what, menu navigation, the frame loop
that calls these) lives in `js/main.js`, and the screen router that Back
resolves through in `js/shell/router.js` — see [app-shell.md](app-shell.md) and [app-shell-navigation.md](app-shell-navigation.md).

## PUBLIC API

**js/input.js**
- Constants: `MOVE_SPEED` (50 u/s), `LOOK_DEG_PER_PX` (0.2), `PAD_LOOK_DEG_PER_S` (180),
  `SPACING_MIN` / `SPACING_MAX` / `SPACING_START` (1 / 10 / 1.1), `SPACING_STEP` (0.1),
  `SPACING_STEP_MAX` (0.5), `SPACING_ACCEL` (0.5), `SPACING_RUN_GAP_MS` (200), `SPACING_TOGGLE` (2),
  `SPAWN_PITCH_DEG` (15), `SPAWN_YAW_DEG` (20), `SPAWN_MARGIN` (0.1), `SPAWN_FACE_CLEARANCE` (0.1).
- `FlyCamera` — state `x, y, z, pitch` (+ = looking down), `yaw` (PI = facing +Z); settings
  `sensitivity` (1 = original) and `invertY`. `reset(x, y, z)`, `place(pose)`, `look(dxPx, dyPx)`
  (pitch clamped ±PI/2), `move(dt, {w,a,s,d,q,e})`, `moveAxes(dt, f, r, u)`, `lookAxes(dt, x, y)`,
  `rescale(ratio)` (position scaled about the board centre: a spacing change),
  `apply(cam)` (writes a `THREE.PerspectiveCamera`, order `'YXZ'`).
- `spacingStep(state, notches, now?)` → `{spacing, run, dir, at}` — pure: the spacing after `notches`
  (fractional on a trackpad) arriving at `now` ms, `state` the previous result or `{spacing}`. Each
  notch steps `SPACING_STEP` plus `SPACING_ACCEL` of it per whole notch already turned in the run, up
  to `SPACING_STEP_MAX`; a run continues while notches come the same way within `SPACING_RUN_GAP_MS`.
  Without `now` (the D-pad's presses and repeats) nothing accelerates: one `SPACING_STEP` per notch.
  Clamped to [1, 10]. Shared by the
  wheel, the D-pad and the debug hook's `wheel`.
- `spacingToggle(spacing)` → `SPACING_TOGGLE`, or `SPACING_START` when already 2.0 to one decimal (`X`).
- `spawnPose({X, Y, Z}, spacing, fovDeg, aspect)` → `{x, y, z, yaw, pitch}` — pure: the framed
  three-quarter view, `SPAWN_PITCH_DEG` down and `SPAWN_YAW_DEG` off +Z (the -X face shows),
  centred on the near face's centre cube, from the closest distance that keeps the box's eight
  corners within `SPAWN_MARGIN` of the view's edges and clears the top and side face planes by
  `SPAWN_FACE_CLEARANCE` (what binds at wide fields of view).
- `offscreenArrow(pose, {X, Y, Z}, spacing, fovDeg, aspect)` → null while any part of the box is in
  the frustum, else the screen angle toward the box centre (0 = right, PI/2 = up; for a centre
  behind the camera, the shortest turn's way).
- `MouseActions(onAction, hasSelection)` — `down(button)`, `up(button)` (0 = left, 2 = right;
  others ignored), `reset()` (forget held state without firing); calls
  `onAction('left' | 'right' | 'chord')`, the caller acting on its own selection.
- `DragLook({mouse, onLook, threshold = DRAG_LOOK_THRESHOLD_PX})` (6 px) — `down`, `move(dx, dy)`,
  `up`, `reset()`: drag-to-look over a `MouseActions`. Once the held buttons move `threshold` px
  the mouse actions are reset without firing and all movement goes to `onLook` until every button
  is up; under the threshold the release acts as a locked one does.
- `TapToggle(tapMs = SPACE_TAP_MS)` (250 ms) — `down(now, active)`, `up(now)`, `on`, `reset()`: a
  tap turns `on` until the next press's release; a longer hold leaves nothing on; a press while
  not `active` is ignored.
- `Input(opts)` — installs window/document listeners in the constructor (no teardown). opts:
  `canvas`, `mouse`, `isActive()`, `onLook(dx, dy)`, `onWheel(notches)`, optional
  `onKey(code, event)`, `onLockChange(locked)`, `onLockError()`, `isDragLook()`. Reads: `has(code)`,
  `shift`, `ctrl`, `space` (held, or tapped on through `spaceToggle`), `move`, `locked`,
  `unlockedAt`, `lastKey` (`{code, repeat, locked}`, recorded before `onKey`), `lockSupported`,
  `dragLook` (drag-to-look on and the pointer unlocked; then canvas presses go through `drag`, its
  `DragLook`). `requestLock()`, `exitLock()`, `releaseAll()` (keys, Space toggle, mouse, drag).
- `escResumes({repeat, locked})` — whether an Esc press resumes from the pause card: not the press
  that released the lock, not an auto-repeat ([app-shell-pause.md](app-shell-pause.md)).

**js/picking.js**
- `FLY_THROUGH_DIST` — 1.5 pitches at the start spacing (`1.5 * 4 * SPACING_START`, 6.6 units), fixed in
  world units whatever the spacing.
- `pickCell(game, spacing, o, d, spaceHeld)` → cell index or -1 — `o` origin, `d` normalized
  direction; `game` is the 3D state view (`js/engine/state-view-3d.js`, [engine-3d.md](engine-3d.md)),
  read for `X/Y/Z`, `unlinked`, `pressed`.
- `pickCellBrute(...)` — same signature and result; O(n), used only by the debug hook.

## INTERNAL PATTERNS

- **Actions fire on release.** Releasing one button while the other is held fires `'chord'`;
  the next release of the other button only clears the toggle. A release without a matching
  `down` is ignored; every fire is gated on `hasSelection()`. The controller triggers drive the
  same `MouseActions` (RT = button 0, LT = button 2), so chord semantics stay identical across
  devices — do not build a second state machine.
- **Game rules are not here.** `onAction` in `js/main.js` hands `'left'` / `'right'` / `'chord'`
  to the 3D game session as `reveal` / `toggleFlag` / `chord`; what a gesture does before the board
  exists is the session's ([mode3d-session.md](mode3d-session.md)).
- **Camera conventions.** `pitch` + = down, `yaw` PI = +Z; `apply()` negates both into a `'YXZ'`
  Euler. `move()` and `moveAxes()` share one pair of vectors (`_axes`): W along the true view
  direction (cos(pitch) on XZ), A/D horizontal strafes; Q/E and the `u` axis are world-vertical.
  `lookAxes` converts deg/s to pixel-equivalents so `sensitivity` and `invertY` apply once, in
  `look()`.
- **Held state must be dropped, never fired**, on blur, tab hide, pointer-lock loss
  (`Input.releaseAll`), and on pause / disconnect / leaving play (`Controls.releasePad`,
  `input.spaceToggle.reset()` and `input.drag.reset()` in `js/main.js`'s `stopPlayInput`).
- **Space is a tap-toggle as well as a hold** — the keyboard's Space only; every other view-mode
  key and the controller's RB stay hold-only. The 3D camera sampler reads `Controls.space` like
  any view mode.
- **DOM gating.** Mouse move / buttons are processed only when `locked && isActive()` (or through
  `DragLook` when `dragLook`); the wheel and `preventDefault` on game keys only when `isActive()`.
  `GAME_KEYS` (WASDQE, Space, Shift, Ctrl) are always tracked; Ctrl+other keys and `RETURN_KEYS`
  (`Home`, `KeyR`: back to the start view, ahead of `F2` and the results screen's `R`,
  [app-shell-3d.md](app-shell-3d.md)) are swallowed while active. `onKey` skips auto-repeat except for
  `ARROW_KEYS`, whose repeats are the shell's held focus moves. Mouse deltas > 400 px are
  discarded (post-lock spikes).
- **Wheel notches.** Normalized by `deltaMode`, wheel up = positive, Shift+wheel reads `deltaX`;
  the caller turns them into a spacing with `spacingStep`, timed on the event's arrival.
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
- **Mouse actions fire on button release** — left / right / chord-toggle sequence (`MouseActions`).
- **Picking** — ray from screen centre, nearest cube, exclusion of unlinked cells and of pressed
  cells while Space is held (`pickCell`); the web port's fly-through exclusion (`FLY_THROUGH_DIST`).
- **Grid & geometry** — cube edge 4, spacing range [1, 10], start 1.1, wheel up = larger
  (`SPACING_*`, `Input` wheel handler); the web port's 0.1 step with acceleration, `X` toggle and
  camera scaling (`spacingStep`, `spacingToggle`, `rescale`).
- **Left Shift / Space / Left Ctrl held** view modes — `Controls` exposes them; their visual effect
  is in [rendering.md](rendering.md). Space's tap-toggle is a web-port addition beside the hold.

Controller support, sensitivity / invert-Y settings and the pause-on-unlock flow are web-port
additions the spec permits; they must not alter any rule above.

## CROSS-REFERENCES

- [engine-3d.md](engine-3d.md) — the 3D state view `pickCell` reads.
- [mode3d-session.md](mode3d-session.md) — the session `MouseActions`' actions reach through main.
- [rendering.md](rendering.md) — `FlyCamera.apply` drives the renderer's camera; `Controls.shift/space/ctrl` feed the renderer toggles; the picked cell becomes the renderer's selection.
- [app-shell.md](app-shell.md) — `js/main.js` constructs every object here, maps pad buttons (`handlePad`), runs menu focus navigation and owns the pointer-lock flow; the router and pause controller decide where Back and pause lead.
- [audio.md](audio.md) — no direct calls; action results in main trigger sound effects.
- [input-controller.md](input-controller.md) — the controller reader whose triggers drive `MouseActions` and whose sticks feed `moveAxes` / `lookAxes`; the `Controls` view-mode layer over `Input`'s held keys.
- [testing.md](testing.md) — `tests/gamepad.test.mjs` covers `FlyCamera.moveAxes/lookAxes` and `MouseActions` trigger sequences; `tests/camera-flight.test.mjs` the forward vector, the spacing step, toggle and camera scaling, and the fly-through pick rule.

## WHEN TO READ THE SOURCE

- Changing the chord / release behaviour or adding a new action type (`MouseActions.up`).
- Debugging camera direction, movement axes or a mirrored / tilted view (`FlyCamera.move`, `moveAxes`, `apply`).
- Changing the spawn framing or the off-screen arrow's in-view test (`spawnPose`, `offscreenArrow`).
- Fixing wheel step size on a specific browser or trackpad (`Input` wheel handler, `spacingStep`).
- Changing which keys are captured, swallowed or exempt from `preventDefault` (`GAME_KEYS`, keydown handler).
- Changing the Space tap length or the drag-to-look threshold (`TapToggle`, `SPACE_TAP_MS`, `DragLook`, `DRAG_LOOK_THRESHOLD_PX`).
- Fixing a pointer-lock failure or re-lock timing issue (`requestLock`, `pointerlockchange`, `unlockedAt`).
- Fixing a wrong or missed pick, especially at grid edges or axis-aligned rays (`pickCell` DDA setup and step loop).
- Changing cube size or grid centring — picking geometry must change together with the renderer's cube placement.
