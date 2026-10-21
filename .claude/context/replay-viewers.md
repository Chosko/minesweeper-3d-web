# Replay playback — the 2D and 3D board viewers

## OVERVIEW

The board viewers the replay viewer screen ([replay-viewer-screen.md](replay-viewer-screen.md))
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
- `TRAIL_MS`, `TRAIL_STEP_MS`; `movementTrack(movement,
  interval?)`, `pointerAt(track, t)`, `cursorAt(track, t)`,
  `pointerPixel(layout, scroll, point)` (a sample in board units — the
  layout's pitch — to canvas pixels), `trailPoints(track, t, ms?)`,
  `replayGeometry(board)` (the grid geometry of a replay's 2D board
  identity, [geometry.md](geometry.md); a `RangeError` for an unknown grid
  kind).
- `createViewer2D({view, sim, pointer, overlay?, geometry?})` → `{track, draw(frame,
  {playing}), place(), setScale(scale), press(actions), still(),
  showBbbv(tints), repaint(), destroy()}`; `pointer` is `{place, hide,
  trail?, ring?}` in canvas CSS pixels, `overlay` `{paint(rects), clear()}`
  with each rect a cell's outline (box, shape, corners) and its tint;
  `geometry` the board's, `replayGeometry` of the replay's board when not
  given, so an unknown grid kind is refused at creation, never at draw time.
- `mountViewer2D({container, sim, scale?, win?})` — the board view on the
  replay board's geometry in its board frame, the whole board fitted in the container at any tile up to
  the board scale's cap, so it never scrolls (no play input), the pointer,
  trail and rings as
  elements (`.replay-pointer`, `.replay-trail`, `.replay-ring--<kind>`: the
  theme's ring, the flag's fainter, expanding and fading, coloured from
  tokens), Show 3BV as a canvas made the first time it shows.
- `BBBV_TINT_TOKENS`, `paintBbbv(ctx, rects, colours)` — Show 3BV's paint
  (§ Internal patterns).

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
- **2D playback.** The board view redraws from `changed`, playing the
  cells' events (reveal, flag, unflag) on a frame playback drew; a seek
  drops the running ones and starts none. The cursor ring
  shows only while the recorded cursor is a cell (an older recording's
  opening cell counts as -1); a view that scrolls — one `mountViewer2D`
  never mounts — follows the pointer's cell, else the cursor's; a board
  that fits never scrolls. The board scale
  reaches the view through `setScale`. The pointer trails its last
  `TRAIL_MS` only on frames playback drew; a seek or `still()` clears it.
- **Board units.** The 2D pointer and trail are kept in board units; the
  pointer's cell is the one the geometry hit-tests under it, at the
  layout's tile and gap.
- **Press rings.** 2D: on the recorded pointer when it was on the acted
  cell, else on the geometry's centre of the cell (a keyboard or controller
  click). 3D: on
  the acted cell's projection through the replay camera (`scene.ring`).
- **3D cell motion.** The renderer plays the replayed changes' cell
  events as in play, the solved pulse included, and the shell's frame loop
  syncs a seek with `seek: true`, which drops them
  ([app-shell-replay.md](app-shell-replay.md),
  [rendering-effects.md](rendering-effects.md)).
- **Show 3BV.** The tints (`regionTints`) are painted per cell and kept
  through seeks, refits and (2D, `repaint`) a theme change; null clears.
  An opening takes one of `BBBV_TINT_TOKENS` (confetti tokens) at
  `TINT_ALPHA` — in 2D the cell's outline, a square rounded `TINT_RADIUS`
  and any other shape its polygon (`paintBbbv`), in 3D its cubes' tint —; an isolated number is left
  unpainted.
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

- [replay-viewer-screen.md](replay-viewer-screen.md) — the screen that mounts them,
  `regionTints`, the commands that call `setFree` and `showBbbv`.
- [replay.md](replay.md) — the movement streams these invert; [replay-samplers.md](replay-samplers.md) — the samplers.
- [engine-3d.md](engine-3d.md) — the 3D state view.
- [classic2d-board-canvas.md](classic2d-board-canvas.md), [classic2d-board-view.md](classic2d-board-view.md) — the board view the 2D viewer mounts;
  [geometry.md](geometry.md) — the grid geometry it rebuilds.
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
