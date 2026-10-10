# Input

## OVERVIEW

Everything between the player's devices and a game action or camera pose:
the free-fly camera, keyboard / mouse / pointer-lock DOM handling, the
release-based mouse action state machine (shared by the controller triggers),
the view-mode action layer, controller polling and its pure helpers, the
shell navigation layer over the controller reader, and crosshair picking.

| File | Implements |
| --- | --- |
| `js/input.js` | `FlyCamera`, `MouseActions`, `Input` (DOM listeners), camera / spacing constants |
| `js/controls.js` | `Controls`: union of keyboard and controller view modes + controller move axes |
| `js/gamepad.js` | Gamepad API reader, stick curve, trigger hysteresis, auto-repeat, pad glyphs, spatial menu focus search |
| `js/shell/navigation.js` | Shell navigation: topmost layer, default-focus fallback, Back inputs, held-button suppression across screen changes |
| `js/picking.js` | `pickCell` (3D-DDA ray walk) and `pickCellBrute` (reference) |

The wiring (which pad button maps to what, menu navigation, the frame loop
that calls these) lives in `js/main.js`, and the screen router that Back
resolves through in `js/shell/router.js` — see [app-shell.md](app-shell.md).

## PUBLIC API

**js/input.js**
- Constants: `MOVE_SPEED` (50 u/s), `LOOK_DEG_PER_PX` (0.2), `PAD_LOOK_DEG_PER_S` (180),
  `SPACING_MIN` / `SPACING_MAX` / `SPACING_START` (1 / 10 / 1.1). The caller clamps spacing.
- `js/input.js::FlyCamera` — state `x, y, z, pitch` (+ = looking down), `yaw` (PI = facing +Z);
  settings `sensitivity` (multiplier, 1 = original) and `invertY`.
  - `reset(x, y, z)` — position, pitch 0, yaw PI.
  - `look(dxPx, dyPx)` — mouse look; clamps pitch to ±PI/2.
  - `move(dt, keys)` — `keys` = `{w,a,s,d,q,e}` booleans.
  - `moveAxes(dt, f, r, u)` — analog move, each -1..1, speed capped at `MOVE_SPEED`.
  - `lookAxes(dt, x, y)` — analog look as a fraction of `PAD_LOOK_DEG_PER_S`, routed through `look()`.
  - `apply(cam)` — writes position / rotation (order `'YXZ'`) to a `THREE.PerspectiveCamera`, updates its world matrix.
- `js/input.js::MouseActions(onAction, hasSelection)` — `down(button)`, `up(button)`
  (0 = left, 2 = right; other buttons ignored), `reset()` (forget held state without firing).
  Calls `onAction('left' | 'right' | 'chord')`; the caller acts on its own current selection.
- `js/input.js::Input(opts)` — installs window/document listeners in the constructor (no teardown).
  opts: `canvas`, `mouse` (a `MouseActions`), `isActive()`, `onLook(dx, dy)`, `onWheel(notches)`,
  optional `onKey(code, event)`, `onLockChange(locked)`, `onLockError()`.
  - Reads: `has(code)`, getters `shift`, `ctrl`, `space`, `move` (the `{w,a,s,d,q,e}` object),
    `locked`, `unlockedAt` (`performance.now()` of the last lock release), `lockSupported`.
  - `requestLock()`, `exitLock()`, `releaseAll()` (clears keys + `mouse.reset()`).

**js/controls.js**
- `js/controls.js::Controls(keyboard)` — `keyboard` is any object with `shift / space / ctrl` getters.
  Getters `shift`, `space`, `ctrl` = keyboard OR `pad.*`; `hasAxes`. Mutable fields `pad`
  (`{shift, space, ctrl}`) and `axes` (`{f, r, u}`) are written by the caller each frame.
  `releasePad()` zeroes both.

**js/gamepad.js** (no DOM access at import; Node-testable)
- `BTN` (standard-mapping indices A..HOME), `NUM_BUTTONS` (17), `STICK_DEADZONE`,
  `STICK_EXPONENT`, `TRIGGER_ON`, `TRIGGER_OFF`.
- `stickCurve(x, y, dz?, exp?)` → `[x, y]`, radial deadzone, direction kept, magnitude ≤ 1.
- `triggerHeld(wasHeld, value, on?, off?)` → boolean with hysteresis.
- `Repeat(delay = 380, interval = 60)` — `update(held, now)` → fire count this tick; `reset()`.
- `padFamily(id)` → `'playstation' | 'xbox' | 'nintendo' | 'generic'`; `GLYPHS`;
  `padGlyphs(id)` → label set (`name, a, b, x, y, lb, rb, lt, rt, start, back`).
- `pickInDirection(from, cands, dir)` — `from` a rect, `cands` `[{rect, item}]`,
  `dir` `'up'|'down'|'left'|'right'` → item or null.
- `js/gamepad.js::GamepadReader(opts)` — opts: optional `getGamepads()`, `onConnect(pad)`,
  `onDisconnect({index, id, wasActive})`, `onActiveChange(pad | null)`.
  `poll()` → `{pad, held, pressed, released, ls, rs, active}` (button arrays indexed by `BTN`,
  raw stick pairs). Also `activePad()`, `connected`.

**js/shell/navigation.js** (DOM-free; the shell hands in elements, visibility tests and poll results)
- `FOCUSABLE` — the selector of native controls menu navigation collects
  (`button, input, summary, a[href], select`).
- `topLayer(order, isOpen)` → the first id of `order` (topmost first) that `isOpen` reports, or null.
- `resolveFocus(target, items)` → `target` when it is in `items`, else `items[0]`, else null.
- `isBackKey(code)` — Esc is Back on every screen (Pause while playing).
- `backButtons(screen)` → `[BTN.BACK]` on `'playing'`, else `[BTN.B, BTN.BACK]`.
- `createHeldSuppressor()` → `update(held)` (once per poll, before acting), `screenChanged()`,
  `has(b)`, `held(p, b)`, `pressed(p, b)` — the poll's `held` / `pressed` minus suppressed buttons.

**js/picking.js**
- `js/picking.js::pickCell(game, spacing, o, d, spaceHeld)` → cell index or -1. `o` origin,
  `d` normalized direction (`{x,y,z}`), reads `game.X/Y/Z`, `game.unlinked`, `game.pressed` — `game` is the 3D state view
  (`js/engine/state-view-3d.js`, [engine.md](engine.md)).
- `js/picking.js::pickCellBrute(...)` — same signature and result; O(n), used only by the debug hook.

## INTERNAL PATTERNS

- **Actions fire on release.** `MouseActions` keeps `left`, `right`, `toggle`. Releasing one
  button while the other is held sets `toggle` and fires `'chord'`; the next release of the other
  button only clears `toggle`. A release without a matching `down` is ignored. Every fire is gated on
  `hasSelection()`. The controller triggers drive this same instance (RT = button 0, LT = button 2),
  so chord semantics stay identical across devices — do not build a second state machine.
- **Game rules are not here.** `MouseActions` only emits `'left'`, `'right'` and `'chord'`;
  `onAction` in `js/main.js` hands each to the 3D game session (`js/mode3d/session.js`,
  [mode3d.md](mode3d.md)) as `reveal` / `toggleFlag` / `chord`. The session decides what a gesture
  does before the board exists — a flag is kept, a chord or a release on a flag does nothing, the
  first reveal asks for the board — and starts the timer when that board arrives.
- **Camera conventions.** `pitch` + = down, `yaw` PI = +Z; `apply()` negates both into a `'YXZ'`
  Euler. `move()` and `moveAxes()` deliberately share the original forward-vector quirk (no
  cos(pitch) on XZ); W moves along `-forward`. Q/E and the `u` axis are world-vertical.
  `lookAxes` converts deg/s to pixel-equivalents so `sensitivity` and `invertY` apply once, in `look()`.
- **Held state must be dropped, never fired**, on blur, tab hide, pointer-lock loss
  (`Input.releaseAll`), and on pause / disconnect / leaving play (`Controls.releasePad`).
- **DOM gating.** Mouse move / buttons are processed only when `locked && isActive()`; the wheel and
  `preventDefault` on game keys only when `isActive()`. `GAME_KEYS` (WASDQE, Space, Shift, Ctrl) are
  tracked in `keys` always; Ctrl+other keys are swallowed while active. `onKey` skips auto-repeat.
  Mouse deltas > 400 px are discarded (post-lock spikes).
- **Wheel notches.** Normalized by `deltaMode` (pixels / 100, lines / 3, pages / 1), sign flipped
  so wheel up = positive; Shift+wheel reads `deltaX`. The caller multiplies by 0.04.
- **Controls with no pad input equal the keyboard exactly** — keep `pad` / `axes` zeroed when the
  controller is not driving play.
- **GamepadReader.** Follows the most recently active pad (switch on a rising input edge on another
  pad); one shared `held` array across switches, so a switch or disconnect yields `released` edges.
  Disconnects are processed before connects. LT/RT use `triggerHeld`; other buttons
  `pressed || value > 0.5`. All helpers tolerate NaN / missing fields.
- **Shell navigation sits between the reader and every action.** `handlePad` calls
  `nav.update(p.held)` on each poll and reads buttons only through `nav.held` / `nav.pressed`;
  every screen change (the router's `onChange`) and controls-modal toggle calls `screenChanged()`,
  so a button held through the change is ignored until released — on the board as in menus. Back
  is `isBackKey` from the keyboard (`Input`'s `onKey`) and `backButtons(screen)` from the
  controller: B means Back only off the board, where it is the move-down button. Both resolve
  through the router in `js/main.js`.
- **Repeat** fires once on press, then after `delay` every `interval`, at most 4 per tick, and
  resynchronizes after a stall instead of bursting.
- **Picking geometry.** Grid is centred on the origin: cell (i,j,k) centre = `(i - (X-1)/2) * 4s`,
  cube = centre ± 2 (edge 4), lattice pitch `4s`; this is the spec's `[P-3, P+1]` box up to a
  translation. Cell index = `i + X * (j + Y * k)`. The DDA enters the grid AABB, then visits lattice
  cells in ray order; first hit is nearest because each lattice cell holds one cube. Zero direction
  components are replaced by 1e-12. Any change to picking must keep `pickCell` and `pickCellBrute`
  in agreement (the debug hook's `pickWith` cross-checks them).
- **Pickability.** Excluded: `unlinked` cells, and `pressed` cells when `spaceHeld`. Everything else
  (including invisible revealed zeros that are not unlinked) is pickable.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule:
[../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md). This area enforces:
- **Controls (must be preserved)** — 0.2°/px look, pitch clamp ±90°, WASD/QE at 50 u/s, the
  forward-vector quirk, start orientation toward +Z (`FlyCamera`).
- **Mouse actions fire on button release** — left / right / chord-toggle sequence (`MouseActions`).
- **Picking** — ray from screen centre, nearest cube, exclusion of unlinked cells and of pressed
  cells while Space is held (`pickCell`).
- **Grid & geometry** — cube edge 4, spacing range [1, 10], start 1.1, 0.04 per wheel notch,
  wheel up = larger (`SPACING_*`, `Input` wheel handler).
- **Left Shift / Space / Left Ctrl held** view modes — `Controls` exposes them; their visual effect
  is in [rendering.md](rendering.md).

Controller support, sensitivity / invert-Y settings and the pause-on-unlock flow are web-port
additions the spec permits; they must not alter any rule above.

## CROSS-REFERENCES

- [engine.md](engine.md) — `pickCell` reads the 3D state view's dimensions and its `unlinked` / `pressed` arrays; `MouseActions` actions become the 3D game session's `reveal` / `toggleFlag` / `chord` calls in main ([app-shell.md](app-shell.md), [mode3d.md](mode3d.md)).
- [rendering.md](rendering.md) — `FlyCamera.apply` drives the renderer's camera; `Controls.shift/space/ctrl` feed the renderer toggles; the picked cell becomes the renderer's selection.
- [app-shell.md](app-shell.md) — `js/main.js` constructs every object here, maps pad buttons (`handlePad`), runs menu focus navigation with `pickInDirection` / `Repeat` and the shell navigation helpers, and owns the pointer-lock flow; the screen router and the pause controller decide where Back and pause lead.
- [audio.md](audio.md) — no direct calls; action results in main trigger sound effects.
- [classic2d.md](classic2d.md) — the Classic 2D cursor input reuses `BTN`, `Repeat` and `stickCurve` and reads `GamepadReader` polls; B, Start and Back stay the shell's there too.
- [testing.md](testing.md) — `tests/gamepad.test.mjs` covers the gamepad helpers, `GamepadReader`, `FlyCamera.moveAxes/lookAxes`, `Controls` and `MouseActions` trigger sequences; `tests/shell-router.test.mjs` covers the shell navigation helpers.

## WHEN TO READ THE SOURCE

- Changing the chord / release behaviour or adding a new action type (`js/input.js::MouseActions.up`).
- Debugging camera direction, movement axes or a mirrored / tilted view (`FlyCamera.move`, `moveAxes`, `apply`).
- Fixing wheel step size on a specific browser or trackpad (`Input` wheel handler).
- Changing which keys are captured, swallowed or exempt from `preventDefault` (`GAME_KEYS`, keydown handler).
- Fixing a pointer-lock failure or re-lock timing issue (`requestLock`, `pointerlockchange`, `unlockedAt`).
- Supporting a new controller family or mislabelled glyph (`padFamily`, `GLYPHS`).
- Changing which input means Back, or a controller button that fires on the screen after the one it was pressed on (`js/shell/navigation.js`).
- Tuning deadzone, trigger thresholds or repeat timing, or a pad that switches / sticks unexpectedly (`GamepadReader.poll`).
- Fixing a wrong or missed pick, especially at grid edges or axis-aligned rays (`pickCell` DDA setup and step loop).
- Changing cube size or grid centring — picking geometry must change together with the renderer's cube placement.
