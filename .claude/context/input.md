# Input — DOM input, actions and touch

## OVERVIEW

Everything between the player's devices and a 3D game action: keyboard /
mouse / pointer-lock DOM handling, each key and mouse button read through
the 3D bindings ([settings-bindings.md](settings-bindings.md)), the
release-based mouse action state machine (shared by the keyboard's reveal
and flag keys, the controller's and the touch gestures), drag-to-look, Space's tap-toggle and the 3D touch
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
- `actionButton3D(bindings?, device, input)` → the `MouseActions` button a key or mouse button
  stands for through the 3D bindings (the defaults when none is given): a reveal input 0, a flag
  input 2, else null — with no override Enter and the left button 0, ' and the right button 2.
- `KeyActions(mouse, bindings?)` — `down(code, repeat?)`, `up(code)` (each → whether `code` is an action key),
  `held` (code → the button its press pressed), `reset()`: a reveal key is button 0 and a flag key
  button 2 of the given `MouseActions` (`actionButton3D`), so every release rule is the mouse's; an
  auto-repeat presses nothing more, a held key releases the button it pressed, and a release whose
  press it never took does nothing.
- `DragLook({mouse, onLook, threshold = DRAG_LOOK_THRESHOLD_PX})` — `down`, `move(dx, dy)`,
  `up`, `reset()`: drag-to-look over a `MouseActions`. Once the held buttons move `threshold` px
  the mouse actions are reset without firing and all movement goes to `onLook` until every button
  is up; under the threshold the release acts as a locked one does.
- `TapToggle(tapMs = SPACE_TAP_MS)` — `down(now, active)`, `up(now)`, `on`, `reset()`: a
  tap turns `on` until the next press's release; a longer hold leaves nothing on; a press while
  not `active` is ignored.
- `Input(opts)` — installs window/document listeners in the constructor (no teardown). opts:
  `canvas`, `mouse`, `isActive()`, `onLook(dx, dy)`, `onWheel(notches)`, optional
  `onKey(code, event)`, `onLockChange(locked)`, `onLockError()`, `isDragLook()`, `canAct()` (the
  reveal and flag keys act on the board; default `isActive`), `canLook()` (the arrows look, their
  default prevented; default `isActive`), `bindings` (the resolver; `defaultBindings()`). Reads:
  `has(code)`, `action(code)` (its 3D action or null), `holds(action)`, `shift` (neighbours held),
  `ctrl` (show hidden), `space` (aim-through held, or tapped on through `spaceToggle`), `move`
  (`{w, a, s, d, q, e}`: forward, left, back, right, down, up held), `lookKeys` (`{x, y}` from the arrows held, opposite arrows cancel), `locked`,
  `unlockedAt`, `lastKey` (`{code, repeat, locked}`, recorded before `onKey`), `lockSupported`,
  `dragLook` (drag-to-look on and the pointer unlocked; then canvas presses go through `drag`, its
  `DragLook`), `actions` (its `KeyActions`). `requestLock()`, `exitLock()`, `releaseAll()` (keys,
  Space toggle, action keys, mouse, drag), `drop()` (`releaseAll` on a change of the bindings, the
  keys still held kept from their auto-repeat until released).
- `escResumes({repeat, locked})` — whether an Esc press resumes from the pause card: not the press
  that released the lock, not an auto-repeat ([app-shell-pause.md](app-shell-pause.md)).

**js/touch-3d.js** (DOM-free but `mountTouch3D`; mounted only on a coarse-only device)
- `STICK_RADIUS_PX`, `PINCH_STEP_PX`; `LONG_PRESS_MS`, `TAP_SLOP`, `VIBRATE_MS` re-exported
  from touch Classic 2D.
- `touchZone(x, y, {width, top})` → `'stick'` (left half) | `'look'` (right half) | null above `top`.
- `stickAxes(dx, dy)` → `{f, r}`: the offset over the radius through `stickCurve`, up forward.
- `applyTouchStick({cam, dt, stick, orbit})` — Fly: `cam.moveAxes(dt, f, r, 0)`; Orbit: `orbit.dollyAxis(dt, f)`.
- `createTouch3D({mouse, onLook, onSpacing, onTap, vibrate, clock, canAct, canMove})` — `down(id, x, y,
  zone)`, `move`, `up`, `cancel(id)`, `reset()`, `stick`, `stickView`, `holding`. A look finger presses
  button 0 as it lands: lifted within `TAP_SLOP` before `LONG_PRESS_MS` it releases (tap, then `onTap`);
  moved `TAP_SLOP` it is dropped (`cancel`) and turns `onLook(dx, dy)`; held `LONG_PRESS_MS` it is dropped
  and button 2 pressed and released, with `vibrate`. A second look finger on a pending tap presses
  button 2 (either lift chords); either moving `TAP_SLOP` or the spread changing `TAP_SLOP` makes a pinch, both presses dropped, one
  `onSpacing(±1)` per `PINCH_STEP_PX`. A press made or lifted while `canAct()` is false is dropped; a
  touch begun while `canMove()` is false is ignored.
- `mountTouch3D({canvas, touch, zone})` — touch pointers on the canvas; cancels the browser's touch
  gestures and a touch's emulated mouse events there; blur and tab hide reset.

## INTERNAL PATTERNS

- **Actions fire on release.** Releasing one button while the other is held fires `'chord'`;
  the next release of the other button only clears the toggle. A release without a matching
  `down` is ignored; every fire is gated on `hasSelection()`. The mouse buttons, the controller's
  reveal and flag buttons (RT = button 0, LT = button 2 by default), the keyboard's reveal and flag
  keys — each translated through the bindings to button 0 or 2 — and the touch gestures (a look
  finger = button 0, a long-press or second finger = button 2) drive the same `MouseActions`, so
  chord semantics stay identical across devices — do not build a second state machine. A mouse
  button bound to nothing acts on nothing; in drag-to-look it still drags the look.
- **Game rules are not here.** `onAction` in `js/main.js` hands `'left'` / `'right'` / `'chord'`
  to the 3D game session as `reveal` / `toggleFlag` / `chord`; what a gesture does before the board
  exists is the session's ([mode3d-session.md](mode3d-session.md)).
- **Held state must be dropped, never fired**, on blur, tab hide, pointer-lock loss
  (`Input.releaseAll`), a change of the bindings (`Input.drop`, subscribed to the resolver), and on
  pause / disconnect / leaving play (`Controls.releasePad`,
  `input.actions.reset()`, `input.spaceToggle.reset()` and `input.drag.reset()` in `js/main.js`'s
  `stopPlayInput`). A reveal or flag key released where it may not act is dropped from `held`, never fired.
- **Space is a tap-toggle as well as a hold** — the keyboard's aim-through key (Space by default)
  only; every other view-mode key and the controller's aim-through button stay hold-only. The 3D camera sampler reads `Controls.space` like
  any view mode.
- **DOM gating.** Mouse move / buttons are processed only when `locked && isActive()` (or through
  `DragLook` when `dragLook`); the wheel and `preventDefault` on game keys only when `isActive()`.
  The keys bound to a held 3D action (by default WASDQE, Space, Shift, Ctrl) are always tracked, by
  code, and read through the bindings on each getter; the arrows (`ARROW_KEYS`) are always tracked,
  their default prevented only while `canLook()`; the reveal and flag keys act, their default (button
  activation, quick find) prevented, only while `canAct()`. Ctrl+other keys and `RETURN_KEYS`
  (`Home`, `KeyR`: back to the start view, ahead of `F2` and the results screen's `R`,
  [app-shell-3d-camera.md](app-shell-3d-camera.md)) are swallowed while active. `onKey` skips auto-repeat except for
  `ARROW_KEYS`, whose repeats are the shell's held focus moves. Mouse deltas past a fixed spike bound
  (in `Input`'s `mousemove` listener) are discarded (post-lock spikes).
- **Wheel notches.** Normalized by `deltaMode`, wheel up = positive, Shift+wheel reads `deltaX`;
  the caller turns them into a spacing (`spacingStep`, timed on the event's arrival) in Fly and a
  dolly in Orbit ([app-shell-3d-camera.md](app-shell-3d-camera.md)).

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
- Changing which keys are captured, swallowed or exempt from `preventDefault` (`ARROW_KEYS`, `RETURN_KEYS`, keydown handler).
- Changing how a key or mouse button becomes a 3D action (`actionButton3D`, `KeyActions`, `Input.action` / `holds`); the actions and their default inputs are [settings-bindings.md](settings-bindings.md)'s.
- Changing a touch gesture's thresholds or zones (`createTouch3D`, `touchZone`, `STICK_RADIUS_PX`, `PINCH_STEP_PX`).
- Changing the Space tap length or the drag-to-look threshold (`TapToggle`, `SPACE_TAP_MS`, `DragLook`, `DRAG_LOOK_THRESHOLD_PX`).
- Fixing a pointer-lock failure or re-lock timing issue (`requestLock`, `pointerlockchange`, `unlockedAt`).
