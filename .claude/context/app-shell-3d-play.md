# App shell — the 3D game's play inputs and camera in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` turns the player's devices into 3D actions and
camera moves while a 3D game plays: action dispatch and its feedback
(sound, rumble, flash), keyboard-only play, touch play on a coarse-only
device, the controller in play, the Camera setting's Fly and Orbit, the
camera aids, spacing and render on demand. The 3D game's flow — adapter,
entering play, pointer lock, ready card — is [app-shell-3d.md](app-shell-3d.md);
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
  `ui.setStick` draws the stick each frame. `syncTouch3D` (every router
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
- **Camera mode.** `cameraMode` (`'fly'` | `'orbit'`) is written only by
  `setCameraMode`, the Camera setting's applier (`applyCamera`,
  [settings.md](settings.md)), mid-game too: Fly to Orbit sets the dolly
  range (`orbitRangeAt(S.spacing)`, from `orbitRange` at the window's field
  of view and aspect) and calls `orbitCam.enter()`; Orbit to Fly keeps the
  pose; `ui.setCamera` switches the help rows and the ready card's movement
  line. `view3D()` is what every look input turns — `orbitCam` in Orbit,
  else `cam` — so the mouse, arrows, right stick and touch look rotate about
  the board centre in Orbit. In Orbit the frame loop dollies with W / S,
  the left stick's vertical axis and the touch stick, A / D turn as the
  arrows do, and Q / E, A / B and the stick's horizontal axis do nothing;
  the wheel (`wheel3D`) dollies instead of changing the spacing, which
  stays on X and the D-pad. A spacing change rescales the orbit distance
  within the new range, and a resize resets the range. The replay viewer's
  free camera has its own pair (`replayCam`, `replayOrbit`) following the
  same setting ([app-shell-results.md](app-shell-results.md)).
- **Camera aids.** `placeAtSpawn()` puts the camera at `spawnPose`
  ([input-camera.md](input-camera.md)), then in Orbit re-enters the orbit
  from it: every `startGame`, `retry3D`, and the return to start (`Home` /
  `R` while `Input.isActive`, the pause card's "Back to start"
  `onBackToStart`, which then resumes). In play `updateArrow` hands
  `ui.setArrow` the off-screen arrow's angle; `updatePick` keeps
  `S.readout` (`aimReadout`, `js/readability.js`) and `updateReadout` shows
  it only under the `aimReadout` setting in 3D play. Picking is cached by
  `S.pickKey`. Spacing resets per game to `SPACING_START`; the menu demo (`makeDemo`,
  7³/30, decorative) uses 1.25 and an orbiting camera.
- **Spacing.** Every change in play goes through `setSpacing(s)`: clamped
  to [1, 10], the camera rescaled about the board centre by new / old
  (`FlyCamera.rescale`, yaw and pitch kept; the orbit's distance too),
  `ui.setSpacing` for the tools strip's readout. The wheel in Fly
  (`wheelSpacing`, its run held in `wheelRun`) and the debug hook's `wheel`
  step through `spacingStep` timed by `performance.now()`; the D-pad's
  presses and repeats and each pinch step take one untimed step each; `X`
  while `Input.isActive` sets `spacingToggle`.
- **Render on demand.** While `results` shows a 3D game `shouldRender`
  draws only on `needRender`, a sync or a running effect; otherwise it draws when `needRender` is set or
  `renderer.sync()` reported changes, on every frame of a menu screen (the
  orbiting demo, except under the `?still-backdrop` hook,
  [app-shell.md](app-shell.md) § PUBLIC API), `endState` changed,
  `renderer.isAnimating()`, or the signature (camera, spacing, toggles,
  selection, `game.version`, aspect, field of view, mode) changed; the field
  of view applier and `setCameraMode` also set `needRender`. Set
  `needRender = true` after any change the signature does not capture.
- `applyPixelRatio(n)` follows the render resolution setting
  (`pixelRatioFor`, [settings.md](settings.md)) for the board's cell count.
  `F` (3D only) sets the fullscreen setting, whose applier also requests
  Keyboard Lock.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  keyboard-only and touch play in 3D.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  Camera setting.
- ORIGINAL_SPEC "Controls" — the start pose and the return to it.

## CROSS-REFERENCES

- [app-shell-3d.md](app-shell-3d.md), [app-shell-3d-session.md](app-shell-3d-session.md) — the 3D
  game's flow these inputs run inside (`endDelay`, `board3d`, `stopPlayInput`'s callers).
- [input.md](input.md) — `Input` callbacks, `KeyActions`, the touch machine;
  [input-camera.md](input-camera.md) — `FlyCamera`, `OrbitCamera`,
  `KeyLook`, picking, spawn pose.
- [rendering.md](rendering.md) — `setToggles`, `setSpacing`, `setSelected`,
  `sync`, `render`, `snapshotBeforeAction`, `flash`, `isAnimating`.
- [audio.md](audio.md) — the `sfx` calls.
- [testing.md](testing.md) — `tests/input-keyboard-3d.test.mjs`,
  `tests/camera-orbit.test.mjs`, `tests/shell-mode-3d.test.mjs` (touch
  play), `tests/replay-3d.test.mjs` (samples taken under each input).

## WHEN TO READ THE SOURCE

- Debugging frames that do not redraw, or never stop: `shouldRender`.
- Changing controller mapping in play: `padPlaying`, `padSticks`, `padStatus3D`.
- Changing what an input does in Orbit, or the switch between cameras:
  `setCameraMode`, `view3D`, `wheel3D` and the frame loop's camera branch.
- Changing where the keyboard may act or look: the `canAct` / `canLook`
  options of `new Input(...)`.
