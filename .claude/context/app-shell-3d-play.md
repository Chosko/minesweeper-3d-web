# App shell — the 3D game's play inputs in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` turns the player's devices into 3D actions and
camera moves while a 3D game plays: action dispatch and its feedback
(sound, rumble, flash), keyboard-only play, touch play on a coarse-only
device and the controller in play. The camera — Fly and Orbit, the camera
aids, spacing and render on demand — is
[app-shell-3d-camera.md](app-shell-3d-camera.md). The 3D game's flow —
adapter, entering play, pointer lock, ready card — is
[app-shell-3d.md](app-shell-3d.md);
its status card, session, Learn 3D and the end sequence are
[app-shell-3d-session.md](app-shell-3d-session.md); the input objects
themselves are [input.md](input.md) and [input-camera.md](input-camera.md).

## PUBLIC API

`js/main.js` exports nothing; the 3D surface of `__ms` (`key`, `wheel`,
`click`, …) is listed in [app-shell.md](app-shell.md) § PUBLIC API. `__ms.key`
presses and releases Enter and ' through `input.actions` as their keys do;
`__ms.wheel` goes through `wheel3D`.

## INTERNAL PATTERNS

- **Actions.** `onAction(type)` is the only dispatcher (`MouseActions`'
  callback): `left` → `S.play.reveal`, `right` → `toggleFlag`, `chord` →
  `chord`. `renderer.snapshotBeforeAction()` precedes left/chord;
  `actionSounds` plays SFX from the result (awaiting a no-guess board's
  first reveal; null does nothing; `sfx.noop` when `version` is unchanged);
  a flag sound carries the changed-cell count and a flag click on a number
  hands `r.changed` to `renderer.flash`.
- **Rumble.** `padRumble(steps)` plays a `js/gamepad.js` pattern on the
  active pad ([input-controller.md](input-controller.md)): `PAD_PRESS` on a
  trigger's press in `padPlaying` (the cue that its action comes on
  release), `PAD_FLAG` when a flag action made with the controller
  (`padActing`) placed or removed a flag, `PAD_BOOM` with the explosion
  (`boom`). Classic 2D's `padCue` answers through the same function.
- **Keyboard-only play.** The arrows look and Enter / ' act through
  `Input`'s `canLook` and `canAct` ([input.md](input.md)): both hold in play
  outside the end delay and a failed board's offer, `canAct` only while
  the pointer is locked or play is lockless (where the mouse buttons and
  triggers act), `canLook` also in the look at a finished board. Each frame
  `keyLook.update(view3D(), dt, x, y)` turns the camera from
  `input.lookKeys`; `stopPlayInput` drops a held Enter / ' with
  `input.actions.reset()`.
- **Coarse-only devices: touch play.** Every lock request goes through
  `requestLock3D()`, which makes none while `COARSE_ONLY` (coarse and no
  fine pointer); the ready card (`onReadyClick`), resume (`resumeGame`),
  restart and Play again (`enterPlay3D`), the failed board's Retry and
  standard offer (`retry3D`) enter lockless play instead, fullscreen keeps
  it, and Look at the board opens lockless. `ui.setTouch3D(COARSE_ONLY)`
  makes the card "Tap to play" with the touch gestures in place of the
  keys, and the help surfaces show the touch rows (`TOUCH_DEVICE`,
  [settings-bindings.md](settings-bindings.md)). `touch3D` (`createTouch3D`,
  [input.md](input.md)) is mounted on the canvas only while `COARSE_ONLY`,
  zones from `touchZone3D` (below the overlay's top row, `ui.overlayBottom3D()`): it drives the page's
  `mouse`, `view3D().look`, `setSpacing` through `spacingStep` (pinch), and
  the frame loop's `applyTouchStick` (Fly: `moveAxes`; Orbit: the dolly);
  `ui.setStick` draws the stick each frame — at rest in the bottom-left
  corner (J-Game3D-p, -ls), under the thumb while it is used. `syncTouch3D` (every router
  change) sets `body.touch-play` in 3D play and the look, which shows
  `#touch-3d` (the stick and the `#touch-modes` toolbar), and resets the
  machine off it; `stopPlayInput` and a failed board's offer drop held
  touches. The toolbar's taps (`onTouchMode`) toggle `controls.touch`, kept
  through pause and cleared by `clearTouchModes` in `startGame` and
  `leaveGame`. In the look a touch on the scene skips `LOOK_END`
  (`lookTouch`) and its tap (`onTap`) ends the look.
- **Controller in play.** `padPlaying`: Start presses the overlay's pause
  button, Back pauses (or cancels a board being generated), X toggles help,
  RT / LT drive `mouse` as buttons 0 / 2, LB / RB / Y hold the view modes,
  the sticks go through `padSticks` (left moves, right looks through
  `view3D().lookAxes`), A / B move up / down in Fly, the D-pad steps the
  spacing. While the status card shows, `padStatus3D` takes over.
- **The camera** — Fly and Orbit (`view3D()`), the camera aids, spacing
  (`setSpacing`, `spacingStep`) and render on demand — is
  [app-shell-3d-camera.md](app-shell-3d-camera.md).

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  keyboard-only and touch play in 3D.

## CROSS-REFERENCES

- [app-shell-3d-camera.md](app-shell-3d-camera.md) — the camera the look
  inputs turn and the spacing they step.
- [app-shell-3d.md](app-shell-3d.md), [app-shell-3d-session.md](app-shell-3d-session.md) — the 3D
  game's flow these inputs run inside (`endDelay`, `board3d`, `stopPlayInput`'s callers).
- [input.md](input.md) — `Input` callbacks, `KeyActions`, the touch machine;
  [input-camera.md](input-camera.md) — `KeyLook`.
- [rendering.md](rendering.md) — `setToggles`, `setSpacing`, `setSelected`,
  `sync`, `snapshotBeforeAction`, `flash`.
- [audio.md](audio.md) — the `sfx` calls.
- [testing.md](testing.md) — `tests/input-keyboard-3d.test.mjs`,
  `tests/shell-mode-3d.test.mjs` (touch play), `tests/replay-3d.test.mjs`
  (samples taken under each input).

## WHEN TO READ THE SOURCE

- Changing controller mapping in play: `padPlaying`, `padSticks`, `padStatus3D`.
- Changing where the keyboard may act or look: the `canAct` / `canLook`
  options of `new Input(...)`.
