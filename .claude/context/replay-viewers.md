# Replay playback — the 2D and 3D board viewers

## OVERVIEW

The board viewers the replay viewer screen ([replay-playback.md](replay-playback.md))
mounts for a replay's graph kind: each draws simulator frames, places the
recorded pointer or camera, shows press rings and Show 3BV's tints. Both are
DOM-free at import.

- `js/replay/viewer-2d.js` — read-only Classic 2D board view with the
  recorded pointer and its trail, the recorded cursor, press rings and Show
  3BV's paint; `mountViewer2D`.
- `js/replay/viewer-3d.js` — the 3D state view with the recorded camera and
  view mode (Follow) or the viewer's own free camera (Free), press rings and
  tints, for a scene `js/main.js` hands in.

## PUBLIC API

`viewer-2d.js`
- `TRAIL_MS` (150), `TRAIL_STEP_MS` (25); `movementTrack(movement,
  interval?)`, `pointerAt(track, t)`, `cursorAt(track, t)`,
  `pointerPixel(layout, scroll, point)`, `trailPoints(track, t, ms?)`.
- `createViewer2D({view, sim, pointer, overlay?})` → `{track, draw(frame,
  {playing}), place(), setScale(scale), press(actions), still(),
  showBbbv(tints), repaint(), destroy()}`; `pointer` is `{place, hide,
  trail?, ring?}` in canvas CSS pixels, `overlay` `{paint(rects), clear()}`.
- `mountViewer2D({container, sim, scale?, win?})` — the board view at the
  board scale (no play input, no frame), the pointer, trail and rings as
  elements (`.replay-pointer`, `.replay-trail`, `.replay-ring--<kind>`,
  coloured from tokens), Show 3BV as a canvas made the first time it shows.

`viewer-3d.js`
- `cameraTrack(movement, cappedAt?, interval?)`, `cameraAt`, `viewModeAt`,
  `viewToggles`, `worldPose`.
- `createViewer3D({sim, scene, spacing})` → `{track, view, draw(frame),
  setFree(on), press(actions), showBbbv(tints), destroy()}`; `scene` is
  `{show(view), camera(pose, toggles), detach?(on), ring?(cell, kind),
  tint?(tints), hide()}`.

## INTERNAL PATTERNS

- **Hold, then interpolate.** Between two samples, the 2D pointer and the 3D
  camera hold the earlier one until one sampling interval before the later,
  then interpolate linearly; after the last sample they hold it. Cursor and
  view mode are events and switch at their times.
- **2D playback.** The board view redraws from `changed`; the cursor ring
  shows only while the recorded cursor is a cell (an older recording's
  opening cell counts as -1); a board that scrolls follows the pointer's
  cell, else the cursor's; a board that fits never scrolls. The board scale
  reaches the view through `setScale`. The pointer trails its last
  `TRAIL_MS` only on frames playback drew; a seek or `still()` clears it.
- **Press rings.** 2D: on the recorded pointer when it was on the acted
  cell, else on the cell's centre (a keyboard or controller click). 3D: on
  the acted cell's projection through the replay camera (`scene.ring`).
- **Show 3BV.** The tints (`regionTints`) are painted per cell and kept
  through seeks, refits and (2D, `repaint`) a theme change; null clears.
- **3D playback.** On Follow the camera is the recorded pose with the
  recorded view mode, from a movement cap on the last sample before it. On
  Free (`setFree(true)`, the `camera` command) the scene's camera is
  detached where it is and the viewer's own to fly; Follow puts it back on
  the recording at the last frame drawn. The recorded view mode applies
  either way. Crossing the end of the game either way marks every cell, so
  the loss view comes and goes whole.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — what the viewers show, Show 3BV, the free camera.

## CROSS-REFERENCES

- [replay-playback.md](replay-playback.md) — the screen that mounts them,
  `regionTints`, the commands that call `setFree` and `showBbbv`.
- [replay.md](replay.md) — the movement streams and samplers these invert.
- [engine-3d.md](engine-3d.md) — the 3D state view.
- [classic2d-board-view.md](classic2d-board-view.md) — the board view the 2D viewer mounts.
- [rendering.md](rendering.md) — the renderer the 3D viewer draws on.
- [app-shell-replay.md](app-shell-replay.md) — `REPLAY_SCENE` and the
  free replay camera in `js/main.js`.
- [testing.md](testing.md) — `tests/replay-viewer.test.mjs`,
  `tests/replay-viewer-3d.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing how a viewer places the pointer or camera: `pointerAt` /
  `cameraAt` and the head comments of `viewer-2d.js` / `viewer-3d.js`, and
  `REPLAY_SCENE` / `mountReplay3D` in `js/main.js`.
- Changing the trail, a press ring's placement or Show 3BV's paint:
  `trailPoints`, `press`, `showBbbv` in the viewer concerned.
