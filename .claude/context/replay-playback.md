# Replay playback — simulator, verifier, clock, viewer screen, 2D and 3D viewers

## OVERVIEW

The replay viewer verifies a replay ([replay.md](replay.md)) and plays it
back on the engine. `js/main.js` builds the one viewer (`REPLAY_VIEWER`) on
the router's `replay` screen, with the 2D viewer for square graphs and its
own scene and camera for box graphs; the results screen's *Watch replay*
and the Records library view's Watch open it ([app-shell-results.md](app-shell-results.md),
[records-screen.md](records-screen.md)).

- `js/replay/simulator.js` — a replay played on the engine to any time, with
  engine-state snapshots for backward seeks; `openReplay`. Head comment is
  the authority for the frame.
- `js/replay/verify.js` — runs the simulator to the end and compares the
  check values.
- `js/replay/clock.js` — replay time at the chosen speed.
- `js/replay/viewer.js` — the screen: opening and verifying, the per-frame
  tick, controls, keys and buttons, overlay and end line; `createReplayView`
  fills `#replay`. Head comment is the authority for the screen.
- `js/replay/viewer-2d.js` — read-only Classic 2D board view with the
  recorded pointer and cursor; `mountViewer2D`.
- `js/replay/viewer-3d.js` — the 3D state view and the recorded camera and
  view mode, for a scene `js/main.js` hands in.

## PUBLIC API

Simulator, verifier, clock
- `SNAPSHOT_MIN_CELLS` (8000), `SNAPSHOT_INTERVAL` (2000 actions),
  `SNAPSHOT_MEMORY` (64 MB); `REFUSAL` (`NEWER`, `UNREADABLE`);
  `ReplayRefusedError`.
- `openReplay(input)` → `{ok: true, replay}` or `{ok: false, reason,
  message}` (`NEWER` for a newer format, profile or rules version).
- `createSimulator(input, opts?)` → `{replay, grid, game, duration, length,
  seek(t), seekIndex(i), indexAt(t), stats()}`; `game` read-only, always the
  same object. A frame is `{time, index, phase, minesLeft, explodedCell,
  bbbv, bbbvSolved, clicks, state, game, changed}`, `changed` an ascending
  `Int32Array`. `simulate(input, upTo)`.
- `verify(input)` → `{ok: true, result: 'reproduces'}`, `{ok: false,
  result: 'differs', field, expected, actual}` or `{ok: false, result:
  'refused', reason, message}`.
- `SPEEDS` (`[0.5, 1, 2, 4]`), `DEFAULT_SPEED`;
  `createPlaybackClock({duration, speed?})`.

Viewer (`js/replay/viewer.js`)
- `FAILURES` (`newer`, `unreproducible`, `unreadable`, `unsupported`,
  `webgl2`), `COMMANDS`, `REPLAY_KEYS`, `REPLAY_PAD`, `SEEK_STEP_MIN_MS`.
- `prepareReplay({replay?, replayId?}, {library})` → Promise of `{ok, sim}`
  or a failure; `replayId` is fetched with `library.bytes`.
- `replayCode(replay)` → the game's board code in its game form, from the
  header's board, seed and generator version and the first reveal action
  (no format change), or null; handed to `view.ready({ …, code })`.
- `clockText`, `overlayFigures(frame, ms)`, `endLine(check)`,
  `seekStep(duration)`, `pauseMarks(pauses, duration)`, `pausesText`.
- `createReplayViewer({library, router, view, viewers?})` → `show({replay?,
  replayId?, returnTo?})`, `hide()`, `tick(ms)`, `command`, `seek`,
  `setSpeed`, `key`, `pad`, `back()`, `defaultFocus()`, `setScale`.
  `viewers` maps a graph kind to `({container, sim}) → {draw(frame),
  place?(), setScale?(scale), destroy()}`; default `{square: mountViewer2D}`.
- `createReplayView({root, win?, onCommand, onSpeed, onSeek, onBack, onCopy?})` → the
  `#replay` binder, its code chip `#rp-code` (Copy and Copy link call
  `onCopy`, hidden while loading or failed); `#replay-board` sits 16 px from the overlay bar and the
  controls, re-measured on their resize (`ResizeObserver`).

2D and 3D viewers
- `viewer-2d.js`: `movementTrack(movement, interval?)`, `pointerAt`,
  `cursorAt`, `pointerPixel`, `createViewer2D`, `mountViewer2D({container,
  sim, scale?, win?})`.
- `viewer-3d.js`: `cameraTrack(movement, cappedAt?, interval?)`, `cameraAt`,
  `viewModeAt`, `viewToggles`, `worldPose`, `createViewer3D({sim, scene,
  spacing})`; `scene` is `{show(view), camera(pose, toggles), hide()}`.

## INTERNAL PATTERNS

- **Refused before played.** Every replay is verified first: newer format,
  profile or rules version; a differing check value (no longer
  reproducible); unreadable (a missing stored replay too); a box replay with
  no 3D viewer (no WebGL 2); any other graph kind with no viewer. Back works
  in every case.
- **Seeking.** Forwards, the simulator applies the actions in between;
  backwards, it restores the nearest engine-state snapshot (`snapshot()` /
  `restore()`, [engine.md](engine.md)) and replays from there. The start is
  always kept; a board of `SNAPSHOT_MIN_CELLS` or more keeps one every
  `SNAPSHOT_INTERVAL` actions, spread further when they would pass
  `SNAPSHOT_MEMORY`. The verifier keeps only the start.
- **The cell look.** The simulator tracks each cell's drawn look, so
  `changed` holds exactly the cells to redraw; after a restore it compares
  every cell.
- **The viewer's frame.** `tick(ms)` runs once per frame: while playing it
  advances the clock, seeks and hands the frame to the mounted viewer; while
  paused it only calls `place()`. A replay opens paused at its start, at 1×.
  Previous / next go to the action before or after; the seek bar steps 1%
  (at least `SEEK_STEP_MIN_MS`) and marks paused spans. At the end the final
  board stays with the end line; play restarts from the beginning.
- **A shell screen, not a mode.** The viewer plays no game, records nothing,
  plays no sound, is never paused; a replay still loading when the screen
  closes is dropped.
- **Hold, then interpolate.** Between two samples, the 2D pointer and the 3D
  camera hold the earlier one until one sampling interval before the later,
  then interpolate linearly; after the last sample they hold it. Cursor and
  view mode are events and switch at their times.
- **2D playback.** The board view redraws from `changed`; the cursor ring
  shows only while the recorded cursor is a cell (an older recording's
  opening cell counts as -1); a board that scrolls follows the pointer's
  cell, else the cursor's; a board that fits never scrolls. The board scale
  reaches the view through `setScale`.
- **3D playback.** The camera is the recorded pose with the recorded view
  mode, from a movement cap on the last sample before it; player input never
  reaches it. Crossing the end of the game either way marks every cell, so
  the loss view comes and goes whole.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — simulator, verifier, viewer, controls, overlay, entry points, failure
  contracts, the measured snapshot interval.

## CROSS-REFERENCES

- [replay.md](replay.md) — the format, decoder and sampling intervals.
- [replay-library.md](replay-library.md) — `bytes(id)` the viewer reads.
- [engine.md](engine.md) — `createGameWithMines`, `snapshot()` / `restore()`;
  [engine-3d.md](engine-3d.md) — the 3D state view.
- [classic2d-board-view.md](classic2d-board-view.md) — the board view the 2D viewer mounts.
- [rendering.md](rendering.md) — the renderer the 3D viewer draws on.
- [app-shell-results.md](app-shell-results.md) — `REPLAY_VIEWER`, the 3D replay scene and
  camera, the frame loop that ticks the viewer.
- [testing.md](testing.md) — `tests/replay-simulator.test.mjs`,
  `tests/replay-viewer.test.mjs`, `tests/replay-viewer-3d.test.mjs`,
  `tests/results-watch.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing seeking, the snapshot constants or what a frame reports: the head
  comment of `simulator.js` and `goTo` / `changedCells`; the constants come
  from feature replay-playback § Snapshot interval.
- Changing a control, a key or button, the overlay or the failure lines: the
  head comment of `viewer.js` and the `replay` wiring in `js/main.js`.
- Changing how a viewer places the pointer or camera: `pointerAt` /
  `cameraAt` and the head comments of `viewer-2d.js` / `viewer-3d.js`, and
  `REPLAY_SCENE` / `mountReplay3D` in `js/main.js`.
