# 3D mode — board choice, game session and mode adapter

## OVERVIEW

The 3D mode's game flow from board choice to result, around the 3D scene,
camera and controls ([rendering.md](rendering.md), [input.md](input.md)),
which it leaves as they are. The board choice turns the player's pick into a
board; the session owns one game from a closed box to a win or loss, asking
the generation worker for the board at the first reveal; the adapter puts
the session behind the game shell's mode contract. `js/main.js` wires the
three to the screens, the renderer and the pointer-lock flow
([app-shell.md](app-shell.md)).

- `js/mode3d/board-choice.js` — the six presets (double layer and cube
  families), the custom board's validation, the Random fill, the no-guess
  switch and its cell-count limit, the last 3D board choice's document name,
  and `bindBoardChoice`, the binder over the `#board-choice` screen. Its
  helpers are DOM-free; the binder touches only the elements it is handed.
- `js/mode3d/session.js` — the 3D game on the shared engine
  (`create3DGame`) and the game session (`createSession`): the closed box,
  flags before the first reveal, the board request through the generation
  client, the slow-answer "generating" state, the failure offer, the timer,
  pause, restart and leave. DOM-free; generation is reached only through the
  client.
- `js/shell/mode-3d.js` — the 3D adapter: the session behind the mode
  contract (`create3DMode`) and the 3D game's summary (`summary3d`).
  DOM-free; imports nothing.

## PUBLIC API

`js/mode3d/board-choice.js`
- `PRESETS` — six frozen `{id, family, name, X, Y, Z, mines}` in menu order:
  double layer Beginner 8 × 8 × 2 / 10, Intermediate 14 × 14 × 2 / 60,
  Expert 25 × 16 × 2 / 130; cube Beginner 6 × 6 × 6 / 10, Intermediate
  8 × 8 × 8 / 40, Expert 12 × 12 × 8 / 130. `FAMILIES` (`double` "Double
  layer", `cube` "Cube"); `BOARD_SIZES` (the preset ids plus `'custom'`).
- A board choice is `{size, custom: {X, Y, Z, mines}, noGuess}`; `custom` is
  kept beside a preset so the custom fields reopen as the player left them.
  `DEFAULT_CHOICE` is double layer Beginner, custom 10 × 10 × 10 / 25,
  no-guess off.
- `DIM_MIN` / `DIM_MAX` (1 / 100); `validateCustom(board)` → `{ok: true}` or
  `{ok: false, field: 'X'|'Y'|'Z'|'mines', reason}` — mines 1 to cells − 1,
  so a one-cell board is refused. `customStatus(board)` → `{ok, field, max,
  text, warn?}`, the info line under the fields (a warning above 250,000
  cells).
- `NOGUESS_CELL_LIMIT` = 8000 (20 × 20 × 20); `noGuessAvailable(choice)` —
  true on every preset and on a custom board of at most that many cells;
  `noGuessReason()` — "No-guess is available up to 8,000 cells".
- `normaliseChoice(choice)` → a valid plain copy or null, with no-guess
  dropped on a custom board above the limit; `readChoice({size, fields,
  noGuess}, fallbackCustom?)`; `boardOf(choice)` → `{X, Y, Z, mines,
  noGuess}` (a `RangeError` on an invalid choice); `randomBoard(random?)` —
  the original Random formula, always a valid board.
- `presetKey(p)` (`'6,6,6,10'`, the items' `data-preset`), `presetByKey`,
  `presetLabel(p)`.
- `LAST_CHOICE_DOC` = `'mode3d.lastChoice'`, `LAST_CHOICE_VERSION` = 1.
- `bindBoardChoice({root, onStart, onBack})` → `show(choice, {played})`,
  `destroy()`. Its head comment lists the `data-*` hooks it reads in `root`.

`js/mode3d/session.js`
- `create3DGame({X, Y, Z, mines, minePositions?})` → `{view, mines,
  reveal(c), toggleFlag(c), chord(c)}`: the box graph
  (`js/engine/box-grid.js`) and `PROFILE_3D` on the shared engine, `view` the
  3D state view ([engine.md](engine.md)). From `mines` it awaits the first
  click (its first reveal returns `boardNeeded` and changes nothing); from
  `minePositions` it plays that board from the start. Each action returns
  `{changed, ended, exploded, revealed, flagged, unflagged, boardNeeded}` —
  the counts of cells newly opened, flagged and unflagged, which drive the
  sound effects.
- `createSession({board, client, clock?, randomSeed?, generatingDelayMs?})`
  → session. `board` is `boardOf(choice)`; with `minePositions` (the debug
  hook's fixed board) that board is played and nothing is requested.
  Session: `view` (one object for the whole session), `state`, `board`,
  `mines`, `seed`, `generatorVersion`, `generatingShown`, `paused`,
  `failure`, `elapsedMs()`, `seconds()`, `on(event, fn)` → unsubscribe,
  `reveal(c)`, `toggleFlag(c)`, `chord(c)`, `retry()`, `playStandard()`,
  `pause()`, `resume()`, `restart()`, `leave()`.
- `SESSION_STATE` (`ready`, `generating`, `playing`, `failed`, `won`,
  `lost`, `left`); `SESSION_EVENTS` (`generating` `{shown}`, `started`
  `{changed}`, `failed` `{reason, offers}`, `finished` `{state}`);
  `FAILURE_OFFERS` and `GENERATING_DELAY_MS`, re-exported from
  `js/classic2d/session.js`.

`js/shell/mode-3d.js`
- `summary3d({board, started, outcome, elapsedMs})` → `{mode: '3d',
  outcome, dimensions: {X, Y, Z}, mines, time}` (time in seconds; outcome
  `abandoned` until finished), or null before the first applied reveal.
- `create3DMode(flow, report)` — the contract over `flow`
  (`openBoardChoice`, `start(choice)` → session, `pause(note)`,
  `resume(source)`, `restart(source)` → session, `leave`, `contextLost`);
  `failureScreen: 'ctxlost'`; plus `contextLost()`, which `js/main.js` calls
  when the WebGL context is lost during a 3D game.

## INTERNAL PATTERNS

- **Two no-guess switches.** The presets' switch (`data-noguess="presets"`)
  is always enabled and applies to whichever preset is clicked. The custom
  board's switch (`data-noguess="custom"`) is disabled above
  `NOGUESS_CELL_LIMIT`, with the reason line shown above it; the player's
  wish is kept while it is disabled and comes back when the board shrinks.
  Both are filled from the last choice's `noGuess`. The limit is read from
  the one exported constant; `dev/measure-noguess-3d.mjs` is the measurement
  behind it.
- **Last board choice.** `js/main.js` keeps it with the shell's
  `createLastBoardChoice` (`js/shell/menu.js`) in the `mode3d.lastChoice`
  platform-storage document, loaded before the first screen. Picking a board
  saves the choice (a failed save never stops the game) and starts
  `MODES.start('3d', boardOf(choice))`; the board choice's `show` marks it
  `data-last`, with "Last played" only once a choice was played or loaded.
- **Closed box, then a board.** The session opens on a game awaiting its
  first click, whose view shows the closed box. Flags may be placed and
  removed; a left release on a flagged cell, and any chord, does nothing.
  The first reveal of a closed, unflagged cell sends
  `{graph: {kind: 'box', X, Y, Z}, mineCount, firstClick, noGuess, seed}`
  to the client — the first-click rule is Classic 2D's: that cell alone is
  mine-free. When the board arrives the session builds a second game from
  the mine set, replays the early flags in the order they were placed,
  applies the reveal, starts the timer and emits `started`. The session's
  `view` delegates to the closed game, then to the played one, and carries
  `version` and the dirty list across the hand-over, so the renderer,
  picking and HUD never change object.
- **Generating.** While the request is out no board action is accepted
  (actions return null). `generating {shown: true}` is emitted only when the
  answer takes longer than `GENERATING_DELAY_MS`, and `{shown: false}` when
  it arrives; `js/main.js` shows the `#m3d-status` card over the box from
  them.
- **Failure.** A no-guess board not found, a rejected request or a failing
  worker emits `failed` and leaves the timer unstarted; `retry()` asks again
  with a new seed, `playStandard()` the same size with no-guess off, both for
  the same first cell — as Classic 2D does. `js/main.js` releases pointer
  lock for the offer and keeps the standard board for a later restart.
- **Timer.** The session's timer (Classic 2D's `createTimer`) starts when
  the first reveal is applied to the generated board and stops at a win or
  loss. `pause()` stops it; during generation the request keeps running and
  the timer stays unstarted. `js/main.js` pauses the session on every screen
  change away from `playing` and resumes it on return (`sync3D`).
- **Restart and leave** cancel a pending request (`client.cancel()`); a late
  answer is dropped by its request token.
- **The adapter** listens only to the session it holds. At the session's
  `started` it reports `started` and `canPause(true)`; at `finished` it
  reports `canPause(false)` and `finished(summary)`, after the listeners
  `js/main.js` added before handing the session over have played the end
  effect. `summary()` is the started, unfinished game's summary, outcome
  `abandoned`, from which the host reports `abandoned` on restart or leave;
  before the first applied reveal there is none and nothing is reported. A
  lost graphics context — at `start` or through `contextLost()` — reports
  `failed` and leaves the session.
- **No old best times.** The mode keeps no best times of its own; the
  rule for the `ms3d.best.*` keys is [app-shell.md](app-shell.md)'s.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the presets, the custom limits, no-guess availability and its limit, the
  first-click guarantee, the timer, the mode contract's reports, pause and
  failure.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  mode contract and the last board choice mechanism.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the request, the no-guess failure rule and the attempt budget.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) "Grid &
  geometry" — the custom limits and the Random formula.

## CROSS-REFERENCES

- [engine.md](engine.md) — the box graph, `PROFILE_3D` and the 3D state view
  `create3DGame` plays on.
- [generation.md](generation.md) — the generation client and the `box`
  graph description the session sends.
- [classic2d.md](classic2d.md) — `createTimer`, `FAILURE_OFFERS` and
  `GENERATING_DELAY_MS`, which the session reuses.
- [app-shell.md](app-shell.md) — `FLOW_3D`, `startGame`, `onAction`,
  `sync3D`, the `#m3d-status` card and the `#board-choice` screen in
  `js/main.js`; the mode host and `createLastBoardChoice`.
- [platform.md](platform.md) — the storage the last 3D choice is a document
  in.
- [testing.md](testing.md) — `tests/mode3d-board-choice.test.mjs`,
  `tests/mode3d-session.test.mjs`, `tests/mode3d-noguess-limit.test.mjs`
  and `tests/shell-mode-3d.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a preset, the custom limits or the stored choice
  (`PRESETS`, `validateCustom`, `normaliseChoice` in `board-choice.js`; the
  `data-preset` markup in `index.html`).
- Changing the no-guess limit: re-run `node dev/measure-noguess-3d.mjs` and
  read its head comment before touching `NOGUESS_CELL_LIMIT`.
- Changing a session state, event or the first-click flow (`createSession`
  and its head comment in `session.js`).
- Changing what the 3D mode reports to the shell (`create3DMode` and its
  head comment in `js/shell/mode-3d.js`).
