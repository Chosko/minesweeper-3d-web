# Records — board identity, summary record, personal records, records screen

## OVERVIEW

The records every records consumer shares: which board a game was played
on, the one summary record of a played game, the stats derived from it, and
the player's personal records — bests, counters and history — kept through
platform storage; and the Records screen that shows them (`records-screen`).
DOM-free throughout, apart from the records view's binder and the history
chart, which draws on the canvas it is handed.

- `js/records/board.js` — the board identity, its key, the key's parser and
  the display label. Imports nothing.
- `js/records/summary.js` — the summary builder, the derived stats and best
  eligibility. Imports `CLICK_KINDS` from `js/engine/metrics.js` and the
  identity from `board.js`; never `js/logic.js`.
- `js/records/model.js` — the records model: bests, counters, history and
  the comparison, held in memory as two plain documents. Imports
  `summary.js`, `board.js` and `CLICK_KINDS`; no storage.
- `js/records/store.js` — the records store: the one owner and only writer
  of the personal records, persisting the model's documents and the
  game-in-progress marker through platform storage. Imports only
  `model.js`; storage is handed in.
- `js/records/screen.js` — the Records screen: its content
  (`recordsContent`), the screen controller and the view binder that fills
  `#records`. Imports `board.js`, `summary.js`, `history-chart.js`, the
  results screen's formats (`js/results/view.js`) and the kit's
  `bindSegmented`; the records store is handed in.
- `js/records/history-chart.js` — the history chart (3BV/s and efficiency
  per won game, on a canvas, no chart library) and the recent games list's
  paging. Imports `summary.js`, the results formats and the token reader
  (`js/tokens.js`).

`js/main.js` builds the one store (`RECORDS`) over the platform `storage`,
awaits its `load()` beside the settings store's before the first screen,
attaches it to the pause controller and exposes it as `__ms.records`
([app-shell.md](app-shell.md)). Classic 2D's session calls the builder at
the end of a game ([classic2d.md](classic2d.md)). The store records
abandoned games and the settled marker itself; a finished game is recorded
only by a caller of `record()` — the results flow (`results-screen`) — since
the `finished` hand-off only clears the marker. The Records screen reads the
queries: `js/main.js` builds `RECORDS_PAGE` over the store and the
`#records` view and shows it on the shell's `records` route, from the main
menu's Records entry or the results screen's Records button
([app-shell.md](app-shell.md)).

## PUBLIC API

Board identity (`js/records/board.js`)
- `createBoardIdentity({ mode, grid, width, height, mines, noGuess })` →
  frozen identity carrying exactly those six fields. `mode` and `grid` are
  lowercase tokens (letters, digits, single hyphens — never `:`); `width`,
  `height` integers `>= 1`; `mines` an integer `0 .. width × height - 1`;
  `noGuess` a boolean. Anything else throws a `RangeError`.
- `boardKey(identity)` →
  `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>`, e.g.
  `classic-2d:square:30x16:99:no-guess`. `BOARD_KEY_FORMAT` — `1`.
- `parseBoardKey(key)` → the frozen identity the key names, the inverse of
  `boardKey`; a malformed key or one naming an impossible board throws a
  `RangeError`.
- `boardLabel(identity)` → `"Expert"`, `"Expert · no-guess"`,
  `"20 × 12 · 50 mines"`, `"2 × 1 · 1 mine · no-guess"`.
- `standardBoard(identity)` → the matching `STANDARD_BOARDS` entry or null.
  `STANDARD_BOARDS` — frozen `{ name, width, height, mines }` for Beginner
  9 × 9 / 10, Intermediate 16 × 16 / 40, Expert 30 × 16 / 99.
- `boardKey`, `boardLabel` and `standardBoard` validate through
  `createBoardIdentity`, so any object carrying the six fields works and an
  impossible one throws.

Summary (`js/records/summary.js`)
- `buildSummary({ engine, outcome?, elapsedMs, board, seed,
  generatorVersion, endedAt?, id? })` → record or null. `engine` is the
  engine's `summary()` (outcome won or lost) or `counts()` (outcome
  abandoned) — see [engine.md](engine.md); a stated `outcome` must agree
  with it. `counts()` with `bbbv` null — left before the first click —
  returns null. `endedAt` a `Date`, default now; `id` a non-empty string,
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
  - `boardsPlayed()` → `[{ key, board }]`: standard boards in
    `STANDARD_BOARDS` order, each without no-guess before with it, then
    custom boards, the most recently played first.
  - `bests(board)` → `{ time, bbbvPerSecond, efficiency }`, each null or
    the holding game's `{ id, value, endedAt }`.
  - `counters(board)` → `{ games, wins, currentStreak, longestStreak }`;
    `winRate(board)` → wins ÷ games, null for no games.
  - `history(board)` → the board's compact entries in play order.
  - `overall(mode = 'classic-2d')`, `overallWinRate(mode)` — the mode's
    counters across every board.
  - `documents()` → `{ records, history }`, the two documents to persist.
- The comparison: per stat in `BEST_STATS`, `{ best, value, difference,
  newBest }` — the best that stood before this game (or null), the game's
  value when best-eligible (else null), `value − best.value` (null without
  both), and whether the game sets a new best.
- The history entry — `compactSummary(summary)`: `{ id, boardKey, outcome,
  elapsedMs, bbbv, bbbvSolved, clicks, endedAt }`.
- The records document: `{ boards: { [boardKey]: { board, bests, counters }
  }, overall: { [mode]: counters } }`.
- `rebuildRecords(history)` → the records derived from a history alone;
  `emptyRecords()`.

Store (`js/records/store.js`)
- `createRecordsStore({ storage, onNotSaved? })` → store. Registers three
  documents at version 1: `RECORDS_DOC` `records`, `HISTORY_DOC`
  `records.history`, `IN_PROGRESS_DOC` `records.inProgress`
  (`RECORDS_VERSION`, `HISTORY_VERSION`, `IN_PROGRESS_VERSION`).
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
  A summary that is not a record (the 3D mode's) is ignored.
- The model's queries, delegated: `boardsPlayed`, `bests`, `counters`,
  `winRate`, `history`, `overall`, `overallWinRate`.

Records screen (`js/records/screen.js`; its head comment documents the
content shape)
- `RECORDS_SCREEN` — `'records'`, the router screen; `EMPTY_TEXT`.
- `pickerBoards(records)` → `[{ key, label, board }]`: Beginner,
  Intermediate and Expert, each without no-guess then with it, then every
  custom board played in `boardsPlayed()` order.
- `lastBoardPlayed(records)` → the key of the board whose latest game ended
  last, or null.
- `recordsContent(records, { boardKey?, notSaved?, page? })` → the screen's
  content: the picker's `boards`, the chosen `board`, `empty`, the three
  `bests` with their dates, the board's `counters`, the Classic 2D
  `overall` figures, `notes`, the `chart` (`{ points, text }`) and the
  `games` list page (`{ headers, rows, page, pages, label, hasPrev,
  hasNext }`). Never throws.
- `formatDate(iso)` → `"9 Oct 2026"`; `formatWinRate(rate)` → whole percent;
  a missing value is the results screen's `DASH`.
- `createRecordsScreen({ records, view })` → `show({ boardKey }?)`, `hide()`,
  `select(key)`, `showPage(n)`, `board`, `page`.
- `createRecordsView({ root, onSelect, onBack, onPage, chart? })` →
  `show(content)`, `hide()`; fills `#records` by id; `chart` defaults to a
  `createHistoryChart` over `#records-chart`.

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

- **Identity, not names.** A board is its six fields; every exact
  combination is its own board. The standard names are recognised from size
  and mine count on the `square` grid only and are never stored, so a custom
  board matching a standard one is that standard board.
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
  and its mode's overall counters; a win extends the current streak, a loss
  or an abandoned game ends it. Win rate is derived, never stored.
- **Comparison against the past.** A game is compared with the bests that
  stood before it. A repeated id recomputes the original comparison from the
  history entries before it, so recording is idempotent.
- **Memory first, saves in order.** The store updates the model, notifies,
  then queues the saves; saves run one after another in request order, and
  `settled()` is the queue's tail. A failed save leaves the session's
  records correct and reports once through `onNotSaved`.
- **Start-up load.** The three documents are read once. A missing or corrupt
  records document beside an intact history is rebuilt from the history and
  saved. A records or history document newer than this build (the platform's
  `newer-version` issue), or a history the model cannot read, is refused:
  the session runs on empty records, `available()` is false and nothing is
  saved, so the stored documents stay untouched.
- **The game-in-progress marker.** `records.inProgress` holds at most one
  summary, saved through the shell's `inProgress` hand-off at game started,
  every pause and `pagehide`. Recording the same id — won, lost, or
  abandoned by restart or leave — clears it, and so does the `finished`
  hand-off. At `load()` a leftover marker is settled through `record()`: an
  abandoned game, a loss that ends the streak, cleared afterwards; a marker
  whose id is already recorded changes nothing, and an unreadable one is
  dropped. This relies on every summary of one game carrying the same id,
  which Classic 2D's session gives it.
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

## DOMAIN DEPENDENCIES

- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — the board identity, summary record, derivations, best eligibility and
  the abandoned-game rule.
- [../domain/features/personal-records.md](../domain/features/personal-records.md)
  — the bests, counters, history, comparison, the three documents, the
  game-in-progress marker, availability and the newer-version refusal.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — what 3BV, 3BV solved and a counted click are.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the Records screen's content, board picker, history chart, recent games
  list, live update, empty state and navigation.

## CROSS-REFERENCES

- [engine.md](engine.md) — `summary()` and `counts()`, the builder's input;
  `CLICK_KINDS`.
- [generation.md](generation.md) — the seed and `GENERATOR_VERSION` the
  record carries.
- [platform.md](platform.md) — `register`, `load`, `save`, `available` and
  the `newer-version` issue the store relies on.
- [app-shell.md](app-shell.md) — the pause controller's hand-offs the store
  attaches to; `RECORDS` and `RECORDS_PAGE` in `js/main.js`,
  `__ms.records`; the `records` route, its default focus and Back; the
  results screen's formats and `NOTES` the Records screen reuses; the token
  reader the chart draws through; the `#records` kit markup.
- [classic2d.md](classic2d.md) — the session whose summaries carry one id
  per game.
- [testing.md](testing.md) — `tests/records-board.test.mjs`,
  `tests/records-summary.test.mjs`, `tests/records-model.test.mjs`,
  `tests/records-store.test.mjs`, `tests/records-screen.test.mjs`,
  `tests/records-history.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the key format or the identity's fields: read `board.js` whole,
  and bump `BOARD_KEY_FORMAT` with a records format version.
- Adding a summary field or a derived stat: read `buildSummary` and the
  `STAT_VALUE` table in `summary.js`; a new best stat joins `BEST_STATS`,
  and `model.js`'s `STAT_VALUE` and `BETTER` tables.
- A builder `RangeError` you do not expect: read `buildSummary`'s checks and
  `checkEngineBoard` in `summary.js`; a model one, `compactSummary`.
- Changing a stored document's shape: read `model.js` (`apply`,
  `compactSummary`) and `store.js`'s `doLoad`, and bump that document's
  version in `store.js`.
- Changing when the marker is written or settled: read `store.js`'s
  `attach`, `keepMarker` and `doLoad`.
- Wiring a mode's end of game to the builder or the store beyond the API
  above.
- Changing what the Records screen shows or how it picks its board: the
  head comment and `recordsContent` in `screen.js`; its markup is `#records`
  in `index.html`, catalogued in `css/components.css`.
- Changing the chart's drawing, scale or colours: `drawHistoryChart` and
  `chartScale` in `history-chart.js`.
