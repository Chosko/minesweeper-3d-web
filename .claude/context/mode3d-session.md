# 3D mode — game session

## OVERVIEW

The session owns one 3D game from a closed box to a win or loss, placing a
standard board or asking the generation worker for a no-guess one at the
first reveal; the adapter that puts the session behind the game shell's mode
contract is [mode3d-adapter.md](mode3d-adapter.md). Board choice and the
file table are in [mode3d.md](mode3d.md). `js/mode3d/session.js` is
DOM-free.

## PUBLIC API

`js/mode3d/session.js`
- `create3DGame({X, Y, Z, mines, minePositions?})` → `{view, mines,
  engineState, reveal(c), toggleFlag(c), chord(c)}`: the box graph
  (`js/engine/box-grid.js`) and `PROFILE_3D` on the shared engine, `view`
  the 3D state view ([engine-3d.md](engine-3d.md)). From `mines` it awaits the
  first click (its first reveal returns `boardNeeded` and changes nothing);
  from `minePositions` it plays that board from the start. Each action
  returns `{changed, ended, exploded, revealed, flagged, unflagged,
  boardNeeded}` — the counts drive the sound effects.
- `createSession({board, client, clock?, randomSeed?, generatingDelayMs?,
  place?, pregenerated?, forced?})` → session (`place`, `pregenerated` and
  `forced` as Classic 2D's `fixed`, [classic2d-session.md](classic2d-session.md);
  a refused reveal returns the no-change result, flags before it kept). `board` is
  `boardOf(choice)`; with `minePositions` (the debug hook's fixed board)
  that board is played and nothing is requested — with `forced`, Learn 3D's
  guided board: its start cell marked and forced, no seed. Session: `view` (one
  object for the whole session), `state`, `board`, `mines`, `seed`,
  `generatorVersion`, `generatingShown`, `paused`, `failure`, `forced`,
  `startCell` (the first reveal's, -1 before it), `markedCell`,
  `progress`, `elapsedMs()`, `seconds()`, `pauses(until?, count?)`,
  `counts()` and `engineSummary()` (null before the board arrives),
  `on(event, fn)` → unsubscribe, `reveal(c)`, `toggleFlag(c)`, `chord(c)`,
  `retry()`, `playStandard()`, `cancel()`, `pause()`, `resume()`,
  `restart()`, `leave()`, `recording`, `recordSample(values)`,
  `recordView(mode)`, `replay(summary)` → `{blob, listing}` or null
  ([replay.md](replay.md)).
- `SESSION_STATE` (`ready`, `generating`, `playing`, `failed`, `won`,
  `lost`, `left`); `SESSION_EVENTS` (`generating` `{shown}`, `started`
  `{changed}`, `failed` `{reason, offers, count}`, `finished` `{state}`,
  `mark` `{cell}`, `refused` `{cell, hint}`); `FAILURE_OFFERS`,
  `GENERATING_DELAY_MS` and `START_HINT`, re-exported
  from `js/classic2d/session.js`.

## INTERNAL PATTERNS

- **Closed box, then a board.** The session opens on a game awaiting its
  first click, showing the closed box. Flags may be placed and removed; a
  left release on a flagged cell, and any chord, does nothing. The first
  reveal of a closed, unflagged cell needs `{graph: {kind: 'box', X, Y, Z},
  mineCount, firstClick, noGuess, seed}` — that cell alone is mine-free.
  Standard placement, the no-guess request, the pre-generated box's marked
  start cell (flags before it do not count), generating, failure, `cancel`
  and the request token follow Classic 2D's session
  ([classic2d-session.md](classic2d-session.md)); `cancel()` keeps the
  box's flags. When the board arrives the session builds a second game
  from the mine set, replays the early flags in the order placed, applies
  the reveal, starts the timer and emits `started`. The session's `view`
  delegates to the closed game, then the played one, carrying `version`
  and the dirty list across, so the renderer, picking and HUD never change
  object.
- **Shell wiring.** `js/main.js` shows the `#m3d-status` card from
  `generating`, releases pointer lock for the failure offer and keeps the
  standard board for a later restart, and pauses the session on every
  screen change away from `playing`, resuming on return (`sync3D`). The
  timer is Classic 2D's `createTimer`, started when the first reveal is
  applied; a pause during generation counts from the board's arrival.
- **Recording.** Each closed box opens a recorder (`startRecording`,
  [replay.md](replay.md)), which `restart()` discards and `leave()` stops.
  When the board arrives the early flags are recorded in order, then the
  first reveal, all at time 0; every later action at the timer's elapsed
  time. Otherwise as Classic 2D's recording
  ([classic2d-session.md](classic2d-session.md)), with `recordView` beside
  `recordSample`. A fixed board records but has no summary, so no replay.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the first-click guarantee, the timer, pause and failure.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — what the 3D session records and the camera and view-mode sampling.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the request, the no-guess failure rule and the attempt budget.

## CROSS-REFERENCES

- [mode3d-adapter.md](mode3d-adapter.md) — the adapter that holds the
  session behind the mode contract.
- [engine-3d.md](engine-3d.md), [generation.md](generation.md) — the box graph,
  `PROFILE_3D`, the 3D state view; the client and `box` graph description.
- [classic2d-session.md](classic2d-session.md) — `createTimer`,
  `FAILURE_OFFERS`, `GENERATING_DELAY_MS` and the first-click flow reused.
- [app-shell-3d.md](app-shell-3d.md) — `FLOW_3D`, `startGame`, `sync3D`
  and the `#m3d-status` card in `js/main.js`, [app-shell-3d-play.md](app-shell-3d-play.md) — `onAction`; [app-shell.md](app-shell.md) — the mode host.
- [input.md](input.md) — the mouse and trigger actions that become the
  session's `reveal` / `toggleFlag` / `chord`.
- [replay.md](replay.md) — the recorder.
- [testing.md](testing.md) — `tests/mode3d-session.test.mjs`,
  `tests/replay-3d.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a session state, event or the first-click flow (`createSession`
  and its head comment in `session.js`).
