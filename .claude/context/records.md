# Records — board identity, summary record, personal records, records screen, library view

## OVERVIEW

The records every records consumer shares: which board a game was played
on, the one summary record of a played game, the stats derived from it, and
the player's personal records — bests, counters and history — kept through
platform storage; and the Records screen that shows them (`records-screen`),
with the chosen board's kept replays (`replay-library`'s library view).
DOM-free throughout, apart from the records and replay-list view binders
and the history chart, which draws on the canvas it is handed.

- `js/records/board.js` — the board identity in its 2D and 3D forms, its
  key, the key's parser, the display label, the standard boards and the 3D
  presets. Imports nothing.
- `js/records/summary.js` — the summary builder, the derived stats and best
  eligibility. Imports `CLICK_KINDS` from `js/engine/metrics.js` and the
  identity from `board.js`.
- `js/records/model.js` — the records model: bests, per-mode counters,
  history and the comparison, held in memory as two plain documents, and the
  records format step. Imports `summary.js`, `board.js` and `CLICK_KINDS`;
  no storage.
- `js/records/store.js` — the records store: the one owner and only writer
  of the personal records, persisting the model's documents and the
  game-in-progress marker through platform storage. Imports only
  `model.js`; storage is handed in.
- `js/records/screen.js` — the Records screen: its content
  (`recordsContent`), the screen controller and the view binder that fills
  `#records`. Imports `board.js`, `summary.js`, `history-chart.js`,
  `replay-list.js`, the results screen's formats (`js/results/view.js`) and
  the kit's `bindSegmented`; the records store, the replay library and the
  router are handed in.
- `js/records/replay-list.js` — the library view: the chosen board's kept
  replays as rows, the pin toggle, the Watch route, and the binder that
  fills `#records-replays`. Imports the results formats and the library's
  `PIN_BEST` ([replay.md](replay.md)); the library is handed in.
- `js/records/history-chart.js` — the history chart (3BV/s and efficiency
  per won game, on a canvas, no chart library) and the recent games list's
  paging. Imports `summary.js`, the results formats and the token reader
  (`js/tokens.js`).

`js/main.js` builds the one store (`RECORDS`) over the platform `storage`,
awaits its `load()` beside the settings store's before the first screen,
attaches it to the pause controller and exposes it as `__ms.records`
([app-shell.md](app-shell.md)). Classic 2D's session
([classic2d.md](classic2d.md)) and the 3D adapter `js/shell/mode-3d.js`
([mode3d.md](mode3d.md)) call the builder. The store records
abandoned games and the settled marker itself; a finished game is recorded
only by a caller of `record()` — the results flow (`results-screen`) — since
the `finished` hand-off only clears the marker. The Records screen reads the
queries: `js/main.js` builds `RECORDS_PAGE` over the store, the replay
library `REPLAYS`, the router and the `#records` view and shows it on the
shell's `records` route, from the main menu's Records entry or the results
screen's Records button ([app-shell.md](app-shell.md)).

## PUBLIC API

Board identity (`js/records/board.js`)
- `createBoardIdentity(fields)` → frozen identity carrying exactly its
  form's six fields; anything else throws a `RangeError`. The form follows
  `mode`:
  - 2D — `{ mode, grid, width, height, mines, noGuess }`: `mode` and `grid`
    lowercase tokens (letters, digits, single hyphens — never `:`);
    `width`, `height` integers `>= 1`; `mines` an integer
    `0 .. width × height - 1`.
  - 3D — `{ mode: MODE_3D, width, height, depth, mines, noGuess }`, no
    `grid` (one given throws): `width`, `height`, `depth` (X, Y, Z) integers
    `1 .. 100`; `mines` an integer `1 .. width × height × depth - 1`.
  `noGuess` is a boolean in both. `MODE_3D` — `'3d'`.
- `boardKey(identity)` → 2D
  `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>`, e.g.
  `classic-2d:square:30x16:99:no-guess`; 3D
  `3d:<width>x<height>x<depth>:<mines>:<guess|no-guess>`, e.g.
  `3d:12x12x8:130:no-guess`. A 3D key has one field fewer, so it never
  equals a 2D key. `BOARD_KEY_FORMAT` — `1`.
- `parseBoardKey(key)` → the frozen identity the key names, either form,
  the inverse of `boardKey`; a malformed key or one naming an impossible
  board throws a `RangeError`.
- `boardLabel(identity)` → `"Expert"`, `"Expert · no-guess"`,
  `"20 × 12 · 50 mines"`, `"2 × 1 · 1 mine · no-guess"`; `"Cube Expert"`,
  `"Double layer Beginner · no-guess"`, `"10 × 10 × 10 · 80 mines"`.
- `standardBoard(identity)` → the matching `STANDARD_BOARDS` entry, or null
  for a custom or 3D board. `STANDARD_BOARDS` — frozen
  `{ name, width, height, mines }` for Beginner 9 × 9 / 10, Intermediate
  16 × 16 / 40, Expert 30 × 16 / 99.
- `preset3D(identity)` → the matching `PRESETS_3D` entry, or null for a
  custom 3D or a 2D board. `PRESETS_3D` — frozen
  `{ family, name, width, height, depth, mines }` in menu order: Double
  layer Beginner 8 × 8 × 2 / 10, Intermediate 14 × 14 × 2 / 60, Expert
  25 × 16 × 2 / 130; Cube Beginner 6 × 6 × 6 / 10, Intermediate 8 × 8 × 8 /
  40, Expert 12 × 12 × 8 / 130 — the 3D board choice's `PRESETS`
  ([mode3d.md](mode3d.md)).
- `boardKey`, `boardLabel`, `standardBoard` and `preset3D` validate through
  `createBoardIdentity`, so any object carrying a form's fields works and an
  impossible one throws.

Summary (`js/records/summary.js`)
- `buildSummary({ engine, outcome?, elapsedMs, board, seed,
  generatorVersion, endedAt?, id? })` → record or null. `engine` is the
  engine's `summary()` (outcome won or lost) or `counts()` (outcome
  abandoned) — see [engine.md](engine.md); a stated `outcome` must agree
  with it. `board` is a 2D or a 3D identity's fields; for a 3D board the
  engine's counts are over the box graph, its `dimensions` must match the
  board's width, height and depth (or its cell count), and the safe cells
  span the depth. `counts()` with `bbbv` null — left before the first click
  — returns null. `endedAt` a `Date`, default now; `id` a non-empty string,
  default `crypto.randomUUID()`.
- The record: `{ id, board, outcome, elapsedMs, bbbv, bbbvSolved, clicks,
  bbbvPerSecond, efficiency, seed, generatorVersion, endedAt }` — `board` a
  plain copy of the identity (not the key), `clicks` `{ reveal, flag, chord }`
  each `{ effective, wasted }`, `endedAt` an ISO 8601 string. Plain,
  serialisable data.
- `countedClicks(clicks)` — every click, wasted ones included.
- `bbbvPerSecond(summary)` — 3BV solved ÷ elapsed seconds;
  `efficiency(summary)` — 100 × 3BV solved ÷ counted clicks. Both unrounded,
  null when the divisor is zero.
- `isBestEligible(summary, stat)` — `stat` one of
  `BEST_STATS = ['time', 'bbbvPerSecond', 'efficiency']` (anything else
  throws); true only for a won game whose stat is not null.
- `OUTCOMES` — `['won', 'lost', 'abandoned']`.

Model (`js/records/model.js`)
- `createRecordsModel({ records?, history? })` → model. Given a history
  without records, the records are rebuilt from it. Every query returns a
  copy; a board is named by its identity or its key alike.
  - `record(summary)` → comparison. Throws a `RangeError` on anything that
    is not a recordable summary; a summary id already in the history
    changes nothing and returns that game's original comparison.
  - `boardsPlayed(mode = 'classic-2d')` → `[{ key, board }]`, the boards
    played in that mode only: its named boards first — Classic 2D's
    standard boards in `STANDARD_BOARDS` order, 3D's presets in
    `PRESETS_3D` order — each without no-guess before with it, then custom
    boards, the most recently played first.
  - `bests(board)` → `{ time, bbbvPerSecond, efficiency }`, each null or
    the holding game's `{ id, value, endedAt }`.
  - `counters(board)` → `{ games, wins, currentStreak, longestStreak }`;
    `winRate(board)` → wins ÷ games, null for no games.
  - `history(board)` → the board's compact entries in play order.
  - `overall(mode = 'classic-2d')`, `overallWinRate(mode)` — the mode's
    counters across its boards.
  - `documents()` → `{ records, history }`, the two documents to persist.
- The comparison: per stat in `BEST_STATS`, `{ best, value, difference,
  newBest }` — the best that stood before this game (or null), the game's
  value when best-eligible (else null), `value − best.value` (null without
  both), and whether the game sets a new best.
- The history entry — `compactSummary(summary)`: `{ id, boardKey, outcome,
  elapsedMs, bbbv, bbbvSolved, clicks, endedAt }`.
- The records document: `{ boards: { [boardKey]: { board, bests, counters }
  }, overall: { [mode]: counters } }`, `overall` holding every mode in
  `MODES`.
- `MODES` — `['classic-2d', '3d']`; `MODE_CLASSIC_2D` — `'classic-2d'`.
- `rebuildRecords(history)` → the records derived from a history alone;
  `emptyRecords()` — no boards and zeroed counters for every mode.
- `upgradeRecords(records)` → the records format step from version 1: a
  copy with every board and every mode's counters carried over unchanged
  and zeroed counters for a mode that has none; anything that is not
  records is returned as it is.

Store (`js/records/store.js`)
- `createRecordsStore({ storage, onNotSaved? })` → store. Registers three
  documents: `RECORDS_DOC` `records` at `RECORDS_VERSION` 2, with
  `upgradeRecords` as its step from version 1; `HISTORY_DOC`
  `records.history` at `HISTORY_VERSION` 1; `IN_PROGRESS_DOC`
  `records.inProgress` at `IN_PROGRESS_VERSION` 1.
  `onNotSaved({ reason })` is called at most once per store, at the first
  failed save.
- `load()` → Promise, awaited before the first screen; repeated calls return
  the first call's Promise. `record`, `begin` and `checkpoint` before it
  throw.
- `record(summary)` → the model's comparison; memory first, then
  listeners, then the records and history saves; clears the marker when it
  holds the same id.
- `begin(summary)`, `checkpoint(summary)` — save the game-in-progress
  marker, the started game's summary so far (outcome abandoned); both
  ignore a summary whose id is already recorded.
- `onChange(fn)` → unsubscribe; `fn(comparison, summary)` after each newly
  recorded game.
- `available()` — false when storage will not persist or the stored
  records were refused.
- `settled()` → Promise resolving once every save queued so far has
  finished.
- `attach(pauser)` → detach. Hooks the pause controller's hand-offs
  ([app-shell.md](app-shell.md)): `abandoned` records the summary;
  `inProgress` calls `begin` for a new game and `checkpoint` for the
  marker's game; `finished` clears that game's marker and records nothing.
  A summary that is not a record (a fixed 3D board's null) is ignored.
- The model's queries, delegated: `boardsPlayed(mode?)`, `bests`,
  `counters`, `winRate`, `history`, `overall`, `overallWinRate`.

Records screen (`js/records/screen.js`; its head comment documents the
content shape)
- `RECORDS_SCREEN` — `'records'`, the router screen; `EMPTY_TEXT`.
- `pickerBoards(records)` → `[{ key, label, board }]`: Beginner,
  Intermediate and Expert, each without no-guess then with it, then every
  custom board played in `boardsPlayed()` order — Classic 2D boards only.
- `lastBoardPlayed(records)` → the key of the Classic 2D board whose latest
  game ended last, or null.
- `recordsContent(records, { boardKey?, notSaved?, page?, replays?,
  pinnedFirst?, canWatch?, replaysNotSaved? })` → the screen's content: the
  picker's `boards`, the chosen `board`, `empty`, the three `bests` with
  their dates and `watch`, the board's `counters`, the Classic 2D `overall`
  figures, `notes`, the `chart` (`{ points, text }`), the `games` list page
  (`{ headers, rows, page, pages, label, hasPrev, hasNext }`, each row with
  its `watch`), the library view `replays` (`replayList`) and `canWatch`. A
  best's or a game's `watch` is its summary id when `canWatch` and the
  library keeps its replay, else null. Never throws.
- `formatDate(iso)` → `"9 Oct 2026"`; `formatWinRate(rate)` → whole percent;
  a missing value is the results screen's `DASH`.
- `createRecordsScreen({ records, view, replays?, router? })` →
  `show({ boardKey }?)`, `hide()`, `select(key)`, `showPage(n)`,
  `togglePin(id)`, `setPinnedFirst(on)`, `watch(id)`, `board`, `page`.
- `createRecordsView({ root, onSelect, onBack, onPage, onWatch?,
  onTogglePin?, onPinnedFirst?, chart? })` → `show(content)`, `hide()`;
  fills `#records` by id, the replays panel through `createReplayListView`;
  `chart` defaults to a `createHistoryChart` over `#records-chart`.

Library view (`js/records/replay-list.js`; its head comment documents the
row shape)
- `REPLAY_SCREEN` — `'replay'`, the replay viewer's router screen
  (`replay-playback`); `REPLAYS_EMPTY_TEXT`; `REPLAYS_NOT_SAVED`;
  `REPLAY_HEADERS`.
- `replayList(library, boardKey, { pinnedFirst, canWatch, formatDate,
  outcomeLabel })` → `{ rows: [{ id, date, outcome, time, rate, efficiency,
  pinned, pin, action, actionLabel, watch }], empty, emptyText,
  pinnedFirst, canWatch }`. Never throws.
- `pinState(pins)` → `'Not pinned'`, `'Pinned'` or `'Pinned · best'`.
- `togglePin(library, row)` → `unpin(id)` for a pinned row, `pin(id)`
  otherwise.
- `watchRoute(replayId, returnTo)` → `{ screen: REPLAY_SCREEN, data: {
  replayId, returnTo } }`.
- `createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst })` →
  `show(list)`.

History chart (`js/records/history-chart.js`)
- `chartPoints(history)` → `[{ id, rate, efficiency }]`, the won games in
  play order.
- `niceCeiling(v)` → the smallest 1, 2, 2.5 or 5 × 10^k at or above `v`
  (1 for nothing).
- `chartScale(points, { width, height })` → `{ plot, rateMax,
  efficiencyMax, rate, efficiency }` in CSS pixels; a missing value is a
  null point.
- `chartText(points)` → the text alternative; `NO_WON_GAMES` without a won
  game.
- `drawHistoryChart(ctx, { width, height, pixelRatio, points, token })`;
  `CHART_TOKENS` — the tokens it draws in (`--color-accent` 3BV/s,
  `--color-success` efficiency, `--color-border` grid, `--color-ink-muted`
  labels, the `xs` sans font).
- `createHistoryChart({ canvas, token?, onThemeChange?, pixelRatio?,
  observeResize? })` → `draw(points)`, `destroy()`.
- `pageOf(items, page, size = PAGE_SIZE)` → `{ items, page, pages, from,
  to, total, hasPrev, hasNext }`; `PAGE_SIZE` — 10.

## INTERNAL PATTERNS

- **Identity, not names.** A board is its form's six fields; every exact
  combination is its own board, so a board and its no-guess twin, and a 2D
  and a 3D board, keep separate records. The standard names are recognised
  from size and mine count on the `square` grid only, the 3D preset names
  from size and mine count, and neither is ever stored, so a custom board
  matching a standard board or a preset is that board.
- **Key format is stored data.** Records and history are indexed by
  `boardKey`, and the records document's board identity is rebuilt with
  `parseBoardKey`, so the format changes only together with a records format
  version (bump `BOARD_KEY_FORMAT`). The format is documented in the
  `board.js` header, and a test pins that it is.
- **Validation throws.** `buildSummary` throws a `RangeError` on anything
  that would poison the records: negative or non-integer time, a seed outside
  `0 .. 2^32 - 1`, a generator version below 1, a board whose mines or
  dimensions differ from the engine's `mineCount` / `dimensions`, 3BV above
  the safe cells or below 1, 3BV solved above 3BV, a win with 3BV left
  unsolved, malformed click counts, an engine outcome other than won or lost.
  `compactSummary` re-checks id, outcome, counts and date before an entry
  enters the history.
- **Derived stats are pure.** The builder fills `bbbvPerSecond` and
  `efficiency` with the same exported functions any consumer calls on the
  record's own fields, so a recomputation always agrees. Click counting is
  the engine's, by the reference profile's rule; this module only sums.
- **Best eligibility.** Lost and abandoned games never count for a best;
  a won game counts only on a stat that is available (`time` always is).
- **History is the source of truth.** The records document is a cache
  derived from the history entry by entry, so `rebuildRecords(history)`
  always equals the records maintained game by game. A best is replaced only
  by a strictly better value — lower time, higher 3BV/s or efficiency — so a
  tie keeps the earlier holder. Every game counts in its board's counters
  and its own mode's overall counters only — no figure combines Classic 2D
  and 3D, so a 3D loss never moves a Classic 2D streak; a win extends the
  current streak, a loss or an abandoned game ends it. Win rate is derived,
  never stored.
- **Comparison against the past.** A game is compared with the bests that
  stood before it. A repeated id recomputes the original comparison from the
  history entries before it, so recording is idempotent.
- **Memory first, saves in order.** The store updates the model, notifies,
  then queues the saves; saves run one after another in request order, and
  `settled()` is the queue's tail. A failed save leaves the session's
  records correct and reports once through `onNotSaved`.
- **Start-up load.** The three documents are read once. A version 1 records
  document — Classic 2D overall counters only — is stepped up by
  `upgradeRecords` through the platform's upgrade and saved back at version
  2, which a version 1 build then refuses as newer and never overwrites. A
  missing or corrupt records document beside an intact history is rebuilt
  from the history and saved. A records or history document newer than this
  build (the platform's `newer-version` issue), or a history the model
  cannot read, is refused: the session runs on empty records, `available()`
  is false and nothing is saved, so the stored documents stay untouched.
- **The game-in-progress marker.** `records.inProgress` holds at most one
  summary, saved through the shell's `inProgress` hand-off at game started,
  every pause and `pagehide`. Recording the same id — won, lost, or
  abandoned by restart or leave — clears it, and so does the `finished`
  hand-off. At `load()` a leftover marker is settled through `record()`: an
  abandoned game, a loss that ends the streak, cleared afterwards; a marker
  whose id is already recorded changes nothing, and an unreadable one is
  dropped. This relies on every summary of one game carrying the same id,
  which Classic 2D's session and the 3D adapter give it.
- **The screen opens on a board.** `show({ boardKey })` opens on the board
  asked for (the results screen passes its game's board), else on the last
  board played, else on Beginner; a board asked for that is not in the
  picker joins it. The picker's options are rebuilt only when the board list
  changes, so focus stays on the chosen option.
- **Live update.** While shown, the controller subscribes to the store's
  `onChange` and redraws the chosen board on the same games page on every
  newly recorded game; `hide` unsubscribes. `show` and `select` start on the
  first games page.
- **Never blocks.** Every store query is wrapped: unreadable records show the
  empty state over the standard boards, and Back always works. A board with
  no games is the empty state, which hides the bests, counters and history.
  When `records.available()` is false, the first show of the session carries
  the results screen's `notSaved` note, for that visit only.
- **Formats are the results screen's.** Times, 3BV/s and efficiency go
  through `formatTime`, `formatRate` and `formatEfficiency` from
  `js/results/view.js`; the screen defines only the date and win-rate
  formats.
- **The chart is a picture; the text carries the numbers.** The canvas is
  `role="img"` with `chartText` as its `aria-label` and fallback content;
  the figures panel and the games list carry the same numbers as text.
  3BV/s reads against the left axis and efficiency against the right (at
  least 100%); the games spread evenly left to right, one game in the
  middle, and a missing value is a gap in its line.
- **Chart colours are tokens.** The chart reads every colour and its font
  through the token reader, holds no literal colour, and redraws its last
  points on every theme change and every resize of its canvas box (a
  `ResizeObserver`), sized at the device pixel ratio; a canvas with no size
  is skipped. The view draws it after the screen shows.
- **Paged games list.** Every game of the board, newest first, `PAGE_SIZE`
  per page, a page past the end clamped to the last; Newer and Older call
  `onPage`, and a pager button that ends while focused hands focus to the
  other.
- **The library view.** The chosen board's kept replays (the library's
  `forBoard`), newest first, or pinned ones first under the Pinned first
  filter, each group newest first, in the results formats; a missing or
  broken library is the empty state. Pin adds the hand pin and Unpin clears
  every reason. While shown, the controller also subscribes to the library's
  `onChange` and redraws on every add, pin, unpin and removal, so a pin
  toggled from the screen redraws through that notification; a rebuilt list
  keeps focus on the button of the replay that had it.
- **Watch waits for the viewer.** Watch shows on the replays, the bests and
  the games list (its Replay column) only when the router registers
  `REPLAY_SCREEN`, and on a best or a game only when its replay is kept;
  `watch(id)` routes there with this screen on its board to return to.
- **Replays not saved, told once.** Once the library has loaded, a library
  that is not saving adds `REPLAYS_NOT_SAVED` to the notes on the first
  visit of the session only; a visit left before the load settles is not
  told.

## DOMAIN DEPENDENCIES

- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — the board identity, summary record, derivations, best eligibility and
  the abandoned-game rule.
- [../domain/features/personal-records.md](../domain/features/personal-records.md)
  — the bests, counters, history, comparison, the three documents, the
  game-in-progress marker, availability and the newer-version refusal.
- [../domain/features/3d-game-records.md](../domain/features/3d-game-records.md)
  — the 3D board identity, key and labels, 3D summaries, per-mode counters,
  the boards played by mode and the records format step.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — what 3BV, 3BV solved and a counted click are.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the Records screen's content, board picker, history chart, recent games
  list, live update, empty state and navigation.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the library view: the board's replays, their fields, pin state and
  filter, Watch and Pin / Unpin, and Watch on the bests and recent games.

## CROSS-REFERENCES

- [engine.md](engine.md) — `summary()` and `counts()`, the builder's input;
  `CLICK_KINDS`.
- [generation.md](generation.md) — the seed and `GENERATOR_VERSION` the
  record carries.
- [platform.md](platform.md) — `register`, `load`, `save`, `available` and
  the `newer-version` issue the store relies on.
- [replay.md](replay.md) — the replay library the library view reads and
  pins through, and the results flow's best pinning from the comparison.
- [app-shell.md](app-shell.md) — the pause controller's hand-offs the store
  attaches to; `RECORDS` and `RECORDS_PAGE` in `js/main.js`,
  `__ms.records`; the `records` route, its default focus and Back; the
  results screen's formats and `NOTES` the Records screen reuses; the token
  reader the chart draws through; the `#records` kit markup.
- [classic2d.md](classic2d.md) — the session whose summaries carry one id
  per game.
- [mode3d.md](mode3d.md) — the 3D adapter building summaries over the 3D
  board identity, one id per game; the 3D board choice's `PRESETS`, which
  `PRESETS_3D` equals.
- [testing.md](testing.md) — `tests/records-board.test.mjs`,
  `tests/records-board-3d.test.mjs`, `tests/records-summary.test.mjs`,
  `tests/records-summary-3d.test.mjs`, `tests/records-model.test.mjs`,
  `tests/records-model-3d.test.mjs`, `tests/records-store.test.mjs`,
  `tests/records-screen.test.mjs`, `tests/records-history.test.mjs`,
  `tests/records-replays.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the key format or the identity's fields: read `board.js` whole,
  and bump `BOARD_KEY_FORMAT` with a records format version.
- Changing a 3D preset: `PRESETS_3D` in `board.js` changes together with
  `PRESETS` in `js/mode3d/board-choice.js`.
- Adding a summary field or a derived stat: read `buildSummary` and the
  `STAT_VALUE` table in `summary.js`; a new best stat joins `BEST_STATS`,
  and `model.js`'s `STAT_VALUE` and `BETTER` tables.
- A builder `RangeError` you do not expect: read `buildSummary`'s checks and
  `checkEngineBoard` in `summary.js`; a model one, `compactSummary`.
- Changing a stored document's shape: read `model.js` (`apply`,
  `compactSummary`, `upgradeRecords`) and `store.js`'s `doLoad`, bump that
  document's version in `store.js` and register its step from the previous
  version.
- Changing when the marker is written or settled: read `store.js`'s
  `attach`, `keepMarker` and `doLoad`.
- Wiring a mode's end of game to the builder or the store beyond the API
  above.
- Changing what the Records screen shows or how it picks its board: the
  head comment and `recordsContent` in `screen.js`; its markup is `#records`
  in `index.html`, catalogued in `css/components.css`.
- Changing the library view's rows, order or buttons: the head comment of
  `replay-list.js`; how the screen composes it, `createRecordsScreen` and
  `createRecordsView` in `screen.js`.
- Changing the chart's drawing, scale or colours: `drawHistoryChart` and
  `chartScale` in `history-chart.js`.
