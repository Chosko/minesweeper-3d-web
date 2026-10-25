# Replay viewer screen — opening, timeline, controls, figures

## OVERVIEW

The replay viewer screen (`js/replay/viewer.js`) opens a replay, verifies
it through the simulator ([replay-playback.md](replay-playback.md)) and
plays it back. `js/main.js` builds the one viewer (`REPLAY_VIEWER`) on the
router's `replay` screen, with the 2D viewer for every flat graph (square,
hex, tri) and the 3D viewer over its own scene and camera for box graphs
([replay-viewers.md](replay-viewers.md)); the results screen's *Watch
replay*, the Records screen's Watch best and library Watch, and Open
replay file open it ([app-shell-replay.md](app-shell-replay.md),
[records-screen.md](records-screen.md)).

The `#replay` binder (`createReplayView`) is
[replay-viewer-view.md](replay-viewer-view.md).

- `js/replay/viewer.js` — the screen (opening, verifying, timeline,
  commands, overlay, cues, Show 3BV, download). Head comment is the
  authority for the screen.

## PUBLIC API

- `FAILURES` (`newer`, `unreproducible`, `unreadable`, `unsupported`,
  `webgl2`), `COMMANDS` (`toggle`, `prev`, `next`, `framePrev`,
  `frameNext`, `start`, `end`, `slower`, `faster`, `bbbv`, `camera`,
  `sound`), `REPLAY_KEYS`, `REPLAY_PAD` (Start / Y, LB / RB, LT / RT),
  `REPLAY_KEY_LINE`, `SEEK_STEP_MIN_MS`,
  `MAX_REPLAY_FILE_BYTES`, `BBBV_TINTS` (the count of
  `BBBV_TINT_TOKENS`, re-exported from [replay-viewers.md](replay-viewers.md)'s
  `viewer-2d.js`), `LEAD_IN_MS`.
- `prepareReplay({replay?, replayId?, file?}, {library})` → Promise of
  `{ok, sim, bytes}` or a failure — one that does not reproduce still
  carries its `sim` and `bytes`; `replayId` is fetched with
  `library.bytes`, a `file` read unless over the cap.
- `replayCode(replay)` → the game's board code in its game form, from the
  header's board, seed and generator version and the first reveal action
  (no format change), or null; `replayTitle(replay)` → the frame's title,
  "Replay · Hexagon · Beginner" (the mode as `MODE_NAMES` names it,
  [app-shell-daily.md](app-shell-daily.md), Classic 2D for an unknown one; the board as
  the records name it);
  both handed to `view.ready({ …, code, title })`.
- `clockText(ms)` (`"13.342"`, seconds to the thousandth, truncated),
  `overlayFigures(frame, ms)` (the strip's clock, mines, 3BV and 3BV/s),
  `replayFigures(frame, ms, bests)` (the panel's live figures),
  `endLine(check)`, `seekStep(duration)`,
  `pauseMarks(pauses, duration, leadIn?)`, `pausesText`,
  `seekTicks(actions, duration, leadIn, px)` (one tick per action, merged
  under a pixel within its kind), `actionCue(kind, outcome)` (the game's
  sound cue for an action), `regionTints(partition, graph, cycle?)` (Show
  3BV's paint of `bbbvPartition`, [engine-rules.md](engine-rules.md)).
- `createReplayViewer({library, router, view, viewers?, sound?, files?,
  bests?})` →
  `show({replay?, replayId?, file?, returnTo?})`, `hide()`, `tick(ms)`,
  `command`, `seek`, `setSpeed`, `download()`, `openFile(file)`, `key`,
  `pad`, `back()`, `defaultFocus()` (Play once ready, the failure card's
  Back once failed, the frame's Back while opening), `setScale`, `state`.
  `viewers` maps a graph kind to a mount; default `mountViewer2D`
  for `square`, `hex` and `tri`; `sound` is the sfx sink, `files.save(bytes, name)` the
  download, `bests(board)` the board's bests (`RECORDS.bests`);
  `state.live` is `replayFigures` at the playback position.
- `createReplayView` — the `#replay` binder the viewer drives
  ([replay-viewer-view.md](replay-viewer-view.md)).

## INTERNAL PATTERNS

- **Refused before played.** Every replay is verified first: newer format,
  profile or rules version; a differing check value (no longer
  reproducible); unreadable (a missing stored replay, a file over the cap
  or unreadable too); a box replay with no 3D viewer (no WebGL 2); any other
  graph kind with no viewer. Back works in every case.
- **The timeline.** A replay opens paused on the start position (the
  closed board, `LEAD_IN_MS` before game time 0, clock 00.000) at `DEFAULT_SPEED`, Show 3BV off, the
  camera on Follow; at game time 0 the time-0 actions (the first click, a
  3D game's flags before it) play as the first action.
- **The viewer's frame.** `tick(ms)` runs once per frame: while playing it
  advances the clock, seeks and hands the frame to the mounted viewer;
  while paused it only calls `place()`. Previous / next go to the action
  before or after (from the start position, next is the time-0 actions);
  frame back / on move one movement sampling interval; both pause. The
  seek bar steps by `seekStep` (at least `SEEK_STEP_MIN_MS`), marks paused spans and
  ticks every action. At the end the final board stays with the end line;
  play restarts from the start position.
- **Cell motion.** A frame playback drew plays its changed cells' cell
  events in the theme's motion, as play does — reveal, flag and unflag in
  2D (the 2D viewer's `draw(frame, {playing: true})`), those and the
  "solved" pulse in 3D (the renderer's `sync`). A seek, a step, Home or End
  draws its frame without them: the 2D viewer drops the running motion and
  starts none, and the shell syncs the 3D renderer with `seek: true`, which
  does the same ([replay-viewers.md](replay-viewers.md),
  [app-shell-replay.md](app-shell-replay.md)).
- **Press rings and cues.** Each action playback reaches going forward shows
  its press ring; a seek or step shows the rings of the actions where it
  lands, none for those it crosses. With sound on (kept for the session),
  each action reached going forward at the slower speeds (up to a speed
  fixed in the viewer's cue step) plays `actionCue`, as
  does a step or a forward seek onto an action.
- **Live figures.** The panel shows the live figures model of the playback
  position (the frame's counts, flags and mines, the game time), so it
  follows a seek either way, against `bests(header.board)` read each time a
  replay opens — the bests stored now; none, or a throwing `bests`, shows
  no pace and no best.
- **A shell screen, not a mode.** The viewer plays no game, records nothing,
  keeps nothing in the library, is never paused; a replay still loading when
  the screen closes is dropped.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — viewer, controls, overlay, entry points, failure contracts.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the viewer in the frame.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the replayed game's live figures.

## CROSS-REFERENCES

- [replay-viewer-view.md](replay-viewer-view.md) — the `#replay` binder.
- [replay-playback.md](replay-playback.md) — the simulator, verifier and
  clock the screen drives.
- [replay-viewers.md](replay-viewers.md) — the 2D and 3D viewers a mount
  returns.
- [replay-library.md](replay-library.md) — `bytes(id)` the viewer reads.
- [engine-rules.md](engine-rules.md) — `bbbvPartition`.
- [records-board-code.md](records-board-code.md) — `codeOf`; [records-library-view.md](records-library-view.md)
  — `replayFileName`, `REPLAY_SCREEN`.
- [app-shell-replay.md](app-shell-replay.md) — `REPLAY_VIEWER`, the 3D
  replay scene and camera, the frame loop that ticks the viewer.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — `bindFigures`,
  `bindFiguresLive`, the code chip.
- [audio.md](audio.md) — the sfx calls a cue makes.
- [testing.md](testing.md) — `tests/replay-viewer.test.mjs`,
  `tests/replay-viewer-3d.test.mjs`, `tests/results-watch.test.mjs` (fast
  only; Watch replay's browser test is in `tests/results.test.mjs`).

## WHEN TO READ THE SOURCE

- Changing a command, a key or button, the strip's or the panel's figures,
  the timeline or the failure lines: the head comment of `viewer.js` and the
  `replay` wiring in `js/main.js`.
- Changing which action plays which sound: `actionCue`, beside the 3D
  game's `actionSounds` and Classic 2D's cue map it mirrors.
