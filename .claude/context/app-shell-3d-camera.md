# App shell — the 3D game's camera, spacing and render on demand in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` runs the 3D camera while a 3D game plays: the
Camera setting's Fly and Orbit, the camera aids (spawn pose, off-screen
arrow, aimed-cell readout, crosshair), spacing, render on demand, the
render resolution and fullscreen. The play inputs that turn the camera —
actions, keyboard-only, touch and controller play — are
[app-shell-3d-play.md](app-shell-3d-play.md); the camera objects themselves
are [input-camera.md](input-camera.md).

## PUBLIC API

`js/main.js` exports nothing; `__ms.wheel` goes through `wheel3D`, and the
`?still-backdrop` hook stops the menu demo's orbit ([app-shell.md](app-shell.md)
§ PUBLIC API).

## INTERNAL PATTERNS

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
  same setting ([app-shell-replay.md](app-shell-replay.md)).
- **Camera aids.** `placeAtSpawn()` puts the camera at `spawnPose`
  ([input-camera.md](input-camera.md)), then in Orbit re-enters the orbit
  from it: every `startGame`, `retry3D`, and the return to start (`Home` /
  `R` while `Input.isActive`, the pause card's "Back to start"
  `onBackToStart`, which then resumes). In play `updateArrow` hands
  `ui.setArrow` the off-screen arrow's angle (the arrow beside the
  crosshair, turned about its centre); `updatePick` keeps
  `S.readout` (`aimReadout`, `js/readability.js`) and `updateReadout` shows
  it only under the `aimReadout` setting in 3D play; `ui.setCrosshair`
  draws the crosshair's arms only while a cell is targeted, with no
  ring. Picking is cached by
  `S.pickKey`. Spacing resets per game to `SPACING_START`; the menu demo
  (`demoBoard3D`, decorative, [app-shell-menu-preview.md](app-shell-menu-preview.md)) uses
  `DEMO_SPACING_3D` and an orbiting camera.
- **Spacing.** Every change in play goes through `setSpacing(s)`: clamped
  to `SPACING_MIN`–`SPACING_MAX`, the camera rescaled about the board centre by new / old
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

- [../domain/features/settings.md](../domain/features/settings.md) — the
  Camera setting, the aimed-cell readout, render resolution, fullscreen.
- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the camera in 3D play.
- ORIGINAL_SPEC "Controls" — the start pose and the return to it.

## CROSS-REFERENCES

- [app-shell-3d-play.md](app-shell-3d-play.md) — the inputs that turn
  `view3D()` and step the spacing.
- [input-camera.md](input-camera.md) — `FlyCamera`, `OrbitCamera`,
  `orbitRange`, picking, spawn pose.
- [settings-appliers.md](settings-appliers.md) — `applyCamera`, the field
  of view, `pixelRatioFor`, fullscreen.
- [rendering.md](rendering.md) — `setSpacing`, `sync`, `render`,
  `isAnimating`; `js/readability.js`'s `aimReadout`.
- [app-shell-replay.md](app-shell-replay.md) — the replay viewer's free
  camera on the same setting.
- [testing.md](testing.md) — `tests/camera-orbit.test.mjs`.

## WHEN TO READ THE SOURCE

- Debugging frames that do not redraw, or never stop: `shouldRender`.
- Changing what an input does in Orbit, or the switch between cameras:
  `setCameraMode`, `view3D`, `wheel3D` and the frame loop's camera branch.
