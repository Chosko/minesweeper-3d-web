# Input — DOM input, actions and touch

## OVERVIEW

Everything between the player's devices and a 3D game action: keyboard /
mouse / pointer-lock DOM handling, the release-based mouse action state
machine (shared by the keyboard's Enter and ', the controller triggers and
the touch gestures), drag-to-look, Space's tap-toggle and the 3D touch
controls. The camera, the orbit, the keyboard look's ramp, the spawn pose,
the spacing step and picking are [input-camera.md](input-camera.md); the
view-mode layer, controller polling and the shell navigation layer are
[input-controller.md](input-controller.md).

| File | Implements | Context file |
| --- | --- | --- |
| `js/input.js` (DOM half) | `MouseActions`, `KeyActions`, `DragLook`, `TapToggle`, `Input` (DOM listeners), `escResumes` | this file |
| `js/input.js` (camera half) | `FlyCamera`, `KeyLook`, `OrbitCamera`, `spawnPose`, `offscreenArrow`, spacing | [input-camera.md](input-camera.md) |
| `js/picking.js` | `pickCell`, `pickCellBrute` | [input-camera.md](input-camera.md) |
| `js/touch-3d.js` | 3D touch controls: `createTouch3D` (the gesture machine), `touchZone`, `stickAxes`, `applyTouchStick`, `mountTouch3D` | this file |
| `js/controls.js` | `Controls`: union of keyboard and controller view modes + controller move axes | [input-controller.md](input-controller.md) |
| `js/gamepad.js` | Gamepad API reader, stick curve, trigger hysteresis, auto-repeat, pad glyphs, spatial menu focus search | [input-controller.md](input-controller.md) |
| `js/shell/navigation.js` | Topmost layer, an overlay's inert set and Tab wrap, the focus move (`focusMove`), Back inputs, held-button suppression | [input-controller.md](input-controller.md) |

The wiring (which pad button maps to what, menu navigation, the frame loop
that calls these) lives in `js/main.js`, and the screen router that Back
resolves through in `js/shell/router.js` — see [app-shell.md](app-shell.md) and [app-shell-navigation.md](app-shell-navigation.md).

## PUBLIC API

**js/input.js** (DOM half)
- `MouseActions(onAction, hasSelection)` — `down(button)`, `up(button)` (0 = left, 2 = right;
  others ignored), `reset()` (forget held state without firing), `cancel(button)` (forget one
  held button without firing; the toggle clears with the last held one); calls
  `onAction('left' | 'right' | 'chord')`, the caller acting on its own selection.
- `KeyActions(mouse)` — `down(code, repeat?)`, `up(code)` (each → whether `code` is an action key),
  `held`, `reset()`: Enter (`'Enter'`) is button 0 and ' (`'Quote'`) button 2 of the given
  `MouseActions`, so every release rule is the mouse's; an auto-repeat presses nothing more, and a
  release whose press it never took does nothing.
- `DragLook({mouse, onLook, threshold = DRAG_LOOK_THRESHOLD_PX})` (6 px) — `down`, `move(dx, dy)`,
  `up`, `reset()`: drag-to-look over a `MouseActions`. Once the held buttons move `threshold` px
  the mouse actions are reset without firing and all movement goes to `onLook` until every button
  is up; under the threshold the release acts as a locked one does.
- `TapToggle(tapMs = SPACE_TAP_MS)` (250 ms) — `down(now, active)`, `up(now)`, `on`, `reset()`: a
  tap turns `on` until the next press's release; a longer hold leaves nothing on; a press while
  not `active` is ignored.
- `Input(opts)` — installs window/document listeners in the constructor (no teardown). opts:
  `canvas`, `mouse`, `isActive()`, `onLook(dx, dy)`, `onWheel(notches)`, optional
  `onKey(code, event)`, `onLockChange(locked)`, `onLockError()`, `isDragLook()`, `canAct()` (Enter / '
  act on the board; default `isActive`), `canLook()` (the arrows look, their default prevented;
  default `isActive`). Reads: `has(code)`, `shift`, `ctrl`, `space` (held, or tapped on through
  `spaceToggle`), `move`, `lookKeys` (`{x, y}` from the arrows held, opposite arrows cancel), `locked`,
  `unlockedAt`, `lastKey` (`{code, repeat, locked}`, recorded before `onKey`), `lockSupported`,
  `dragLook` (drag-to-look on and the pointer unlocked; then canvas presses go through `drag`, its
  `DragLook`), `actions` (its `KeyActions`). `requestLock()`, `exitLock()`, `releaseAll()` (keys,
  Space toggle, action keys, mouse, drag).
- `escResumes({repeat, locked})` — whether an Esc press resumes from the pause card: not the press
  that released the lock, not an auto-repeat ([app-shell-pause.md](app-shell-pause.md)).

**js/touch-3d.js** (DOM-free but `mountTouch3D`; mounted only on a coarse-only device)
- `STICK_RADIUS_PX` (60), `PINCH_STEP_PX` (24); `LONG_PRESS_MS`, `TAP_SLOP`, `VIBRATE_MS` re-exported
  from touch Classic 2D (400 ms, 8 px, 20 ms).
- `touchZone(x, y, {width, top})` → `'stick'` (left half) | `'look'` (right half) | null above `top`.
- `stickAxes(dx, dy)` → `{f, r}`: the offset over the radius through `stickCurve`, up forward.
- `applyTouchStick({cam, dt, stick, orbit})` — Fly: `cam.moveAxes(dt, f, r, 0)`; Orbit: `orbit.dollyAxis(dt, f)`.
- `createTouch3D({mouse, onLook, onSpacing, onTap, vibrate, clock, canAct, canMove})` — `down(id, x, y,
  zone)`, `move`, `up`, `cancel(id)`, `reset()`, `stick`, `stickView`, `holding`. A look finger presses
  button 0 as it lands: lifted under 8 px before 400 ms it releases (tap, then `onTap`); moved 8 px it is
  dropped (`cancel`) and turns `onLook(dx, dy)`; held 400 ms it is dropped and button 2 pressed and
  released, with `vibrate`. A second look finger on a pending tap presses button 2 (either lift chords);
  either moving 8 px or the spread changing 8 px makes a pinch, both presses dropped, one
  `onSpacing(±1)` per `PINCH_STEP_PX`. A press made or lifted while `canAct()` is false is dropped; a
  touch begun while `canMove()` is false is ignored.
- `mountTouch3D({canvas, touch, zone})` — touch pointers on the canvas; cancels the browser's touch
  gestures and a touch's emulated mouse events there; blur and tab hide reset.

## INTERNAL PATTERNS

- **Actions fire on release.** Releasing one button while the other is held fires `'chord'`;
  the next release of the other button only clears the toggle. A release without a matching
  `down` is ignored; every fire is gated on `hasSelection()`. The controller triggers (RT = button
  0, LT = button 2), the keyboard's Enter and ' and the touch gestures (a look finger = button 0, a
  long-press or second finger = button 2) drive the same `MouseActions`, so chord semantics stay
  identical across devices — do not build a second state machine.
- **Game rules are not here.** `onAction` in `js/main.js` hands `'left'` / `'right'` / `'chord'`
  to the 3D game session as `reveal` / `toggleFlag` / `chord`; what a gesture does before the board
  exists is the session's ([mode3d-session.md](mode3d-session.md)).
- **Held state must be dropped, never fired**, on blur, tab hide, pointer-lock loss
  (`Input.releaseAll`), and on pause / disconnect / leaving play (`Controls.releasePad`,
  `input.actions.reset()`, `input.spaceToggle.reset()` and `input.drag.reset()` in `js/main.js`'s
  `stopPlayInput`). An Enter or ' released where it may not act is dropped from `held`, never fired.
- **Space is a tap-toggle as well as a hold** — the keyboard's Space only; every other view-mode
  key and the controller's RB stay hold-only. The 3D camera sampler reads `Controls.space` like
  any view mode.
- **DOM gating.** Mouse move / buttons are processed only when `locked && isActive()` (or through
  `DragLook` when `dragLook`); the wheel and `preventDefault` on game keys only when `isActive()`.
  `GAME_KEYS` (WASDQE, Space, Shift, Ctrl) are always tracked; the arrows (`ARROW_KEYS`) are always
  tracked, their default prevented only while `canLook()`; Enter and ' act, their default (button
  activation, quick find) prevented, only while `canAct()`. Ctrl+other keys and `RETURN_KEYS`
  (`Home`, `KeyR`: back to the start view, ahead of `F2` and the results screen's `R`,
  [app-shell-3d-play.md](app-shell-3d-play.md)) are swallowed while active. `onKey` skips auto-repeat except for
  `ARROW_KEYS`, whose repeats are the shell's held focus moves. Mouse deltas > 400 px are
  discarded (post-lock spikes).
- **Wheel notches.** Normalized by `deltaMode`, wheel up = positive, Shift+wheel reads `deltaX`;
  the caller turns them into a spacing (`spacingStep`, timed on the event's arrival) in Fly and a
  dolly in Orbit ([app-shell-3d-play.md](app-shell-3d-play.md)).

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule:
[../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md). This area enforces:
- **Mouse actions fire on button release** — left / right / chord-toggle sequence (`MouseActions`);
  the keyboard's Enter and ', the triggers and the touch gestures inherit it.
- **Wheel up = larger spacing** (`Input` wheel handler) in Fly.
- **Left Shift / Space / Left Ctrl held** view modes — `Controls` exposes them; their visual effect
  is in [rendering.md](rendering.md). Space's tap-toggle is a web-port addition beside the hold.

The camera's rules are in [input-camera.md](input-camera.md). Keyboard-only play, touch play,
controller support and the pause-on-unlock flow are web-port additions the spec permits; they must
not alter any rule above.

## CROSS-REFERENCES

- [input-camera.md](input-camera.md) — the camera `onLook` turns, the `KeyLook` that reads `lookKeys`,
  picking that supplies `hasSelection`.
- [mode3d-session.md](mode3d-session.md) — the session `MouseActions`' actions reach through main.
- [rendering.md](rendering.md) — `Controls.shift/space/ctrl` feed the renderer toggles.
- [app-shell-3d-play.md](app-shell-3d-play.md) — `canAct` / `canLook`, the touch mount and zones, `stopPlayInput`.
- [app-shell.md](app-shell.md) — `js/main.js` constructs every object here, maps pad buttons (`handlePad`), runs menu focus navigation and owns the pointer-lock flow; the router and pause controller decide where Back and pause lead.
- [audio.md](audio.md) — no direct calls; action results in main trigger sound effects.
- [input-controller.md](input-controller.md) — the controller reader whose triggers drive `MouseActions`; the `Controls` view-mode layer over `Input`'s held keys.
- [testing.md](testing.md) — `tests/gamepad.test.mjs` (`MouseActions` trigger sequences), `tests/input-keyboard-3d.test.mjs` (`KeyActions`, `Input`'s action and look keys), `tests/input-touch-3d.test.mjs` (the gesture machine).

## WHEN TO READ THE SOURCE

- Changing the chord / release behaviour or adding a new action type (`MouseActions.up`).
- Fixing wheel notch normalisation on a specific browser or trackpad (`Input` wheel handler).
- Changing which keys are captured, swallowed or exempt from `preventDefault` (`GAME_KEYS`, `ARROW_KEYS`, `ACTION_KEYS`, keydown handler).
- Changing the keyboard's action keys (`ACTION_KEYS`, `KeyActions`).
- Changing a touch gesture's thresholds or zones (`createTouch3D`, `touchZone`, `STICK_RADIUS_PX`, `PINCH_STEP_PX`).
- Changing the Space tap length or the drag-to-look threshold (`TapToggle`, `SPACE_TAP_MS`, `DragLook`, `DRAG_LOOK_THRESHOLD_PX`).
- Fixing a pointer-lock failure or re-lock timing issue (`requestLock`, `pointerlockchange`, `unlockedAt`).
