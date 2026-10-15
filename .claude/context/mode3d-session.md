# 3D mode — game session and mode adapter

## OVERVIEW

The session owns one 3D game from a closed box to a win or loss, placing a
standard board or asking the generation worker for a no-guess one at the
first reveal; the adapter puts the session behind the game shell's mode
contract. Board choice and the file table are in [mode3d.md](mode3d.md).
Both files are DOM-free; `js/shell/mode-3d.js` imports `buildSummary`,
`MODE_3D`, `pregenerate` and `startCell`.

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

`js/shell/mode-3d.js`
- `create3DMode(flow, report)` — the contract over `flow` (`openBoardChoice`,
  `start(choice, pregenerated)` → session, `pause(note)`, `resume(source)`,
  `restart(source, pregenerated, forced?)` → session, `leave`, `contextLost`,
  `client`, optional `randomSeed`, optional `sampler(session)` → `{tick(),
  destroy?()}` (without it no movement is recorded), optional `release()`
  (releases pointer lock before the results screen), optional `clock`
  `{setTimeout, clearTimeout}`); `failureScreen: 'ctxlost'`; plus
  `contextLost()`, `replay(summary)`, `tick()` (drives the sampler, every
  frame), `ending`, `finishNow()`, `cancelGeneration()` and `forced`. A
  daily or a challenge starts with `start({ ...board, forced, pregenerated?
  })`, Learn 3D with `learnChoice()` (`forced.learn`, whose forced start
  every restart keeps; `learn` is true while it is the game): the board pre-generated after a game is discarded, a restart keeps
  `forced` until the game started, and the summaries carry the Daily board
  and `daily`, or `challenge`, and `startCell`.
- `endDelayMs({X, Y, Z})` — how long the end effect plays before the game
  is reported finished, win and loss alike: grows with the board's diagonal
  so the loss wave from any cube reaches the farthest cell and its reveal
  (`WAVE_CELL_S`) completes, between `END_DELAY_MS` (1000) and
  `END_DELAY_MAX_MS` (2500); `waveStepS({X, Y, Z})` — the wave's seconds
  per cell of distance the renderer paces it with, derived from it.
  `WAVE_STEP_MAX_S`, `END_MARGIN_S`.

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
- **The adapter** listens only to the session it holds. At `started` it
  reports `started` and `canPause(true)`. At `finished` — after the
  listeners `js/main.js` added have started the end effect — it builds the
  summary (`buildSummary` over the elapsed time and pause spans), reports
  `canPause(false)` and runs the end delay (`ending`): a `pause()` is
  ignored, and after `endDelayMs(session.board)` on `flow.clock` — frames drawn or not —
  it calls `flow.release()` and reports `finished(summary, replay)` once.
  `restart` and `leave` cancel the delay; `js/main.js` offers neither while
  `ending`, and `finishNow()` reports at once, so a game in its end delay
  is never reported abandoned. `summary()` is the started, unfinished
  game's summary (outcome `abandoned`), from which with `replay(summary)`
  the host reports `abandoned`; before the first applied reveal there is
  none. Summaries carry the 3D board identity — mode `3d`, X, Y, Z as
  width, height, depth ([records.md](records.md)) — null throughout on a
  fixed board (the debug hook's, Learn 3D's), which has no seed. A lost graphics context — at `start` or
  through `contextLost()` — reports `failed` and leaves the session; during
  the end delay the game is reported finished first.
- **Pre-generation.** A finished no-guess game with a seed asks
  `flow.client` for the next box (`pregenerate`, its `startCell`, a fresh
  seed); the next `start` with the same board, or `restart`, hands it to
  `flow.start` / `flow.restart`; another board, `leave` and
  `contextLost()` discard it.
- **Recording.** Each closed box opens a recorder (`startRecording`,
  [replay.md](replay.md)), which `restart()` discards and `leave()` stops.
  When the board arrives the early flags are recorded in order, then the
  first reveal, all at time 0; every later action at the timer's elapsed
  time. Otherwise as Classic 2D's recording
  ([classic2d-session.md](classic2d-session.md)), with `recordView` beside
  `recordSample`. A fixed board records but has no summary, so no replay.
- **No old best times.** The mode keeps no best times of its own; the
  rule for the `ms3d.best.*` keys is [app-shell.md](app-shell.md)'s.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the first-click guarantee, the timer, the mode contract's reports, pause
  and failure.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the end delay, input during it and the finished report after it.
- [../domain/features/3d-game-records.md](../domain/features/3d-game-records.md)
  — the 3D summaries and the board identity they carry.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  mode contract.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — what the 3D session records and the camera and view-mode sampling.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the request, the no-guess failure rule and the attempt budget.

## CROSS-REFERENCES

- [engine-3d.md](engine-3d.md), [generation.md](generation.md) — the box graph,
  `PROFILE_3D`, the 3D state view; the client and `box` graph description.
- [classic2d-session.md](classic2d-session.md) — `createTimer`,
  `FAILURE_OFFERS`, `GENERATING_DELAY_MS` and the first-click flow reused.
- [app-shell-3d.md](app-shell-3d.md) — `FLOW_3D`, `startGame`, `sync3D`
  and the `#m3d-status` card in `js/main.js`, [app-shell-3d-play.md](app-shell-3d-play.md) — `onAction`; [app-shell.md](app-shell.md) — the mode host.
- [input.md](input.md) — the mouse and trigger actions that become the
  session's `reveal` / `toggleFlag` / `chord`.
- [replay.md](replay.md) — the recorder and the camera sampler
  `flow.sampler` builds.
- [records.md](records.md) — `buildSummary`, `MODE_3D` and the 3D identity.
- [testing.md](testing.md) — `tests/mode3d-session.test.mjs`,
  `tests/shell-mode-3d.test.mjs`, `tests/mode3d-end.test.mjs`,
  `tests/records-summary-3d.test.mjs`, `tests/replay-3d.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a session state, event or the first-click flow (`createSession`
  and its head comment in `session.js`).
- Changing what the 3D mode reports to the shell or the end delay
  (`create3DMode`, `endDelayMs` and the head comment in
  `js/shell/mode-3d.js`).
