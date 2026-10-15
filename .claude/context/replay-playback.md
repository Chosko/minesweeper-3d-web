# Replay playback — simulator, verifier, clock, viewer screen

## OVERVIEW

The replay viewer verifies a replay ([replay.md](replay.md)) and plays it
back on the engine as a tool to study a game. `js/main.js` builds the one
viewer (`REPLAY_VIEWER`) on the router's `replay` screen, with the 2D viewer
for square graphs and the 3D viewer over its own scene and camera for box
graphs ([replay-viewers.md](replay-viewers.md)); the results screen's
*Watch replay*, the Records screen's Watch best and library Watch, and Open
replay file open it ([app-shell-replay.md](app-shell-replay.md),
[records-screen.md](records-screen.md)).

- `js/replay/simulator.js` — a replay played on the engine to any time, with
  engine-state snapshots for backward seeks and each applied action's
  outcome; `openReplay`. Head comment is the authority for the frame.
- `js/replay/verify.js` — runs the simulator to the end, compares checks.
- `js/replay/clock.js` — replay time at the chosen speed; the lead-in.
- `js/replay/viewer.js` — the screen (opening, verifying, timeline,
  commands, overlay, cues, Show 3BV, download); `createReplayView` fills
  `#replay`. Head comment is the authority for the screen.
- `js/replay/viewer-2d.js`, `js/replay/viewer-3d.js` — the board viewers.

## PUBLIC API

Simulator, verifier, clock
- `SNAPSHOT_MIN_CELLS` (8000), `SNAPSHOT_INTERVAL` (2000 actions),
  `SNAPSHOT_MEMORY` (64 MB); `REFUSAL` (`NEWER`, `UNREADABLE`);
  `ReplayRefusedError`.
- `openReplay(input)` → `{ok: true, replay}` or `{ok: false, reason,
  message}` (`NEWER` for a newer format, profile or rules version).
- `createSimulator(input, opts?)` → `{replay, grid, game, duration, length,
  seek(t), seekIndex(i), indexAt(t), outcome(i), stats()}`; `game`
  read-only, always the same object. A frame is `{time, index, phase,
  minesLeft, explodedCell, bbbv, bbbvSolved, clicks, state, game,
  changed}`, `changed` an ascending `Int32Array`. `outcome(i)` →
  `{changed, count, before, after}` once playback applied action `i`
  (null before): cells changed, how many it left flagged or revealed, the
  phase before and after. `simulate(input, upTo)`.
- `verify(input)` → `{ok: true, result: 'reproduces'}`, `{ok: false,
  result: 'differs', field, expected, actual}` or `{ok: false, result:
  'refused', reason, message}`.
- `SPEEDS` (`[0.25, 0.5, 1, 2, 4]`), `DEFAULT_SPEED`, `LEAD_IN_MS` (500);
  `createPlaybackClock({duration, speed?})`.

Viewer (`js/replay/viewer.js`)
- `FAILURES` (`newer`, `unreproducible`, `unreadable`, `unsupported`,
  `webgl2`), `COMMANDS` (`toggle`, `prev`, `next`, `framePrev`,
  `frameNext`, `start`, `end`, `slower`, `faster`, `bbbv`, `camera`,
  `sound`), `REPLAY_KEYS`, `REPLAY_PAD` (Start / Y, LB / RB, LT / RT),
  `REPLAY_KEY_LINE`, `SEEK_STEP_MIN_MS` (100),
  `MAX_REPLAY_FILE_BYTES` (16 MB), `BBBV_TINTS` (6), `LEAD_IN_MS`.
- `prepareReplay({replay?, replayId?, file?}, {library})` → Promise of
  `{ok, sim, bytes}` or a failure; `replayId` is fetched with
  `library.bytes`, a `file` read unless over the cap.
- `replayCode(replay)` → the game's board code in its game form, from the
  header's board, seed and generator version and the first reveal action
  (no format change), or null; handed to `view.ready({ …, code })`.
- `clockText(ms)` (`"13.342"`, seconds to the thousandth, truncated),
  `overlayFigures(frame, ms)`, `endLine(check)`, `seekStep(duration)`,
  `pauseMarks(pauses, duration, leadIn?)`, `pausesText`,
  `seekTicks(actions, duration, leadIn, px)` (one tick per action, merged
  under a pixel within its kind), `actionCue(kind, outcome)` (the game's
  sound cue for an action), `regionTints(partition, graph, cycle?)` (Show
  3BV's paint of `bbbvPartition`, [engine.md](engine.md)).
- `createReplayViewer({library, router, view, viewers?, sound?, files?})` →
  `show({replay?, replayId?, file?, returnTo?})`, `hide()`, `tick(ms)`,
  `command`, `seek`, `setSpeed`, `download()`, `openFile(file)`, `key`,
  `pad`, `back()`, `defaultFocus()`, `setScale`, `state`. `viewers` maps a
  graph kind to a mount; default `{square: mountViewer2D}`; `sound` is the
  sfx sink, `files.save(bytes, name)` the download.
- `createReplayView({root, win?, onCommand, onSpeed, onSeek, onBack,
  onDownload?, onOpen?, onCopy?})` → the `#replay` binder (its ids in the
  head comment): the overlay bar with the code chip `#rp-code` (Copy and
  Copy link call `onCopy`; hidden while loading, failed or with no code),
  `#replay-board` 16 px from the bar and the controls (re-measured through
  a `ResizeObserver`), the controls (`#rp-camera` in 3D only), the key line
  `#rp-keys` (3D only; a 2D board keeps its room) and the end line.

## INTERNAL PATTERNS

- **Refused before played.** Every replay is verified first: newer format,
  profile or rules version; a differing check value (no longer
  reproducible); unreadable (a missing stored replay, a file over the cap
  or unreadable too); a box replay with no 3D viewer (no WebGL 2); any other
  graph kind with no viewer. Back works in every case.
- **Seeking.** Forwards, the simulator applies the actions in between;
  backwards, it restores the nearest engine-state snapshot (`snapshot()` /
  `restore()`, [engine.md](engine.md)) and replays from there. The start is
  always kept; a board of `SNAPSHOT_MIN_CELLS` or more keeps one every
  `SNAPSHOT_INTERVAL` actions, spread further when they would pass
  `SNAPSHOT_MEMORY`. The verifier keeps only the start.
- **The cell look.** The simulator tracks each cell's drawn look, so
  `changed` holds exactly the cells to redraw; after a restore it compares
  every cell.
- **The timeline.** The clock runs over the duration plus `LEAD_IN_MS`;
  game time is the clock's time less the lead-in. A replay opens paused on
  the start position (the closed board, game time -500, clock 00.000) at
  1×, Show 3BV off, the camera on Follow; at game time 0 the time-0 actions
  (the first click, a 3D game's flags before it) play as the first action.
- **The viewer's frame.** `tick(ms)` runs once per frame: while playing it
  advances the clock, seeks and hands the frame to the mounted viewer;
  while paused it only calls `place()`. Previous / next go to the action
  before or after (from the start position, next is the time-0 actions);
  frame back / on move one movement sampling interval; both pause. The
  seek bar steps 1% (at least `SEEK_STEP_MIN_MS`), marks paused spans and
  ticks every action. At the end the final board stays with the end line;
  play restarts from the start position.
- **Press rings and cues.** Each action playback reaches going forward shows
  its press ring; a seek or step shows the rings of the actions where it
  lands, none for those it crosses. With sound on (kept for the session),
  each action reached going forward at 2× or slower plays `actionCue`, as
  does a step or a forward seek onto an action.
- **A shell screen, not a mode.** The viewer plays no game, records nothing,
  keeps nothing in the library, is never paused; a replay still loading when
  the screen closes is dropped.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — simulator, verifier, viewer, controls, overlay, entry points, failure
  contracts, the measured snapshot interval.

## CROSS-REFERENCES

- [replay-viewers.md](replay-viewers.md) — the 2D and 3D viewers a mount
  returns.
- [replay.md](replay.md) — the format, decoder and sampling intervals.
- [replay-library.md](replay-library.md) — `bytes(id)` the viewer reads.
- [engine.md](engine.md) — `createGameWithMines`, `snapshot()` /
  `restore()`, `bbbvPartition`.
- [records.md](records.md) — `codeOf`; [records-library-view.md](records-library-view.md)
  — `replayFileName`, `REPLAY_SCREEN`.
- [app-shell-replay.md](app-shell-replay.md) — `REPLAY_VIEWER`, the 3D
  replay scene and camera, the frame loop that ticks the viewer.
- [audio.md](audio.md) — the sfx calls a cue makes.
- [testing.md](testing.md) — `tests/replay-simulator.test.mjs`,
  `tests/replay-viewer.test.mjs`, `tests/replay-viewer-3d.test.mjs`,
  `tests/results-watch.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing seeking, the snapshot constants or what a frame reports: the head
  comment of `simulator.js` and `goTo` / `changedCells`; the constants come
  from feature replay-playback § Snapshot interval.
- Changing a control, a key or button, the overlay, the timeline or the
  failure lines: the head comment of `viewer.js` and the `replay` wiring in
  `js/main.js`.
- Changing which action plays which sound: `actionCue`, beside the 3D
  game's `actionSounds` and Classic 2D's cue map it mirrors.
