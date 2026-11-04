# Input — the 3D touch controls

## OVERVIEW

The 3D touch controls (`js/touch-3d.js`): the gesture machine that turns
touches into look, stick movement, spacing and the same `MouseActions`
presses the mouse makes, and its mount on the canvas. The DOM input it
feeds — `MouseActions` and its release rule — is [input.md](input.md); the
mount's wiring and zones in play are
[app-shell-3d-play.md](app-shell-3d-play.md).

| File | Implements | Context file |
| --- | --- | --- |
| `js/touch-3d.js` | 3D touch controls: `createTouch3D` (the gesture machine), `touchZone`, `stickAxes`, `applyTouchStick`, `mountTouch3D` | this file |

## PUBLIC API

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

- The touch gestures (a look finger = button 0, a long-press or second
  finger = button 2) drive the same `MouseActions` as the mouse, so chord
  semantics stay identical across devices ([input.md](input.md) § Actions
  fire on release).

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule:
[../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md). Touch play is a
web-port addition the spec permits; the touch gestures inherit the mouse's
release rule ([input.md](input.md) § DOMAIN DEPENDENCIES).

## CROSS-REFERENCES

- [input.md](input.md) — `MouseActions`, which the gestures press.
- [input-camera.md](input-camera.md) — the camera `onLook` turns and the
  orbit the stick dollies.
- [app-shell-3d-play.md](app-shell-3d-play.md) — `canAct`, the touch mount and zones.
- [testing-files.md](testing-files.md) — `tests/input-touch-3d.test.mjs` (the gesture machine).

## WHEN TO READ THE SOURCE

- Changing a touch gesture's thresholds or zones (`createTouch3D`, `touchZone`, `STICK_RADIUS_PX`, `PINCH_STEP_PX`).
