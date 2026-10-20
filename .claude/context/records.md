# Records — board identity, summary record, the records layer's map

## OVERVIEW

The records every records consumer shares: which board a game was played
on, the one summary record of a played game and the stats derived from it.
This file is the map of `js/records/`; the personal records (model and
store) are in [records-store.md](records-store.md), the Records screen in
[records-screen.md](records-screen.md) and the two files it names.
DOM-free throughout, apart from the screen's view binders and the history
chart, which draws on the canvas it is handed.

| File | Responsibility | Detail in |
| ---- | -------------- | --------- |
| `js/records/board.js` | Board identity (2D and 3D forms), key, parser, label, standard boards, cube 3D presets. Imports nothing. | here |
| `js/records/board-code.js` | Board codes (encode, parse, check), the daily seed and the two daily boards. | [records-board-code.md](records-board-code.md) |
| `js/records/summary.js` | Summary builder, derived stats, best eligibility. | here |
| `js/records/model.js` | Records model: bests, per-mode counters, history, comparison, the records format step. No storage. | [records-store.md](records-store.md) |
| `js/records/store.js` | Records store: the only writer of the personal records and the game-in-progress marker; storage handed in. | [records-store.md](records-store.md) |
| `js/records/screen.js` | Records screen content, controller and `#records` binder. | [records-screen.md](records-screen.md) |
| `js/records/replay-list.js` | Library view: the board's kept replays, pin, Watch, Download, Open replay file. | [records-library-view.md](records-library-view.md) |
| `js/records/history-chart.js` | History charts on a canvas and the lists' paging. | [records-history.md](records-history.md) |

Wiring: `js/main.js` builds the one store (`RECORDS`) over the platform
`storage`, awaits its `load()` before the first screen, attaches it to the
pause controller, exposes it as `__ms.records`, and builds the Records screen
(`RECORDS_PAGE`) on the shell's `records` route ([app-shell.md](app-shell.md)).
Classic 2D's session ([classic2d.md](classic2d.md)) and the 3D adapter
`js/shell/mode-3d.js` ([mode3d.md](mode3d.md)) call the builder; the results
flow records finished games.

## PUBLIC API

Board identity (`js/records/board.js`; its header documents the key format)
- `createBoardIdentity(fields)` → frozen identity of exactly its form's six
  fields, plus `daily: true` on a Daily board only, else a `RangeError`. 2D
  `{ mode, grid, width, height, mines, noGuess }`; 3D `{ mode: MODE_3D,
  width, height, depth, mines, noGuess }` (no `grid`; sides `1 .. 100`).
  `MODE_3D` — `'3d'`.
- `boardKey(identity)` → `classic-2d:square:30x16:99:no-guess` /
  `3d:10x10x10:100:no-guess` (a 3D key never equals a 2D key), a Daily board
  `daily:<board key>`; `parseBoardKey(key)` its inverse; `BOARD_KEY_FORMAT`
  — `2`.
- `boardLabel(identity)` → `"Expert · no-guess"`, `"20 × 12 · 50 mines"`,
  `"Cube Expert"`, `"10 × 10 × 10 · 80 mines"`, `"Daily · Expert ·
  no-guess"`, `"Daily · 8 × 8 × 8 · 40 mines · no-guess"` (a Daily 3D board
  by its dimensions).
- `standardBoard(identity)` / `STANDARD_BOARDS` (Beginner, Intermediate,
  Expert); `preset3D(identity)` / `PRESETS_3D` (Cube Intro, Beginner,
  Intermediate, Expert — equal to the 3D board choice's `PRESETS`,
  [mode3d.md](mode3d.md)). Null for a custom board, a former preset's
  size included.
- Every function validates through `createBoardIdentity`, so any object with
  a form's fields works and an impossible one throws.

Summary (`js/records/summary.js`)
- `buildSummary({ engine, outcome?, elapsedMs, pauses?, board, seed,
  generatorVersion, endedAt?, id? })` → record or null. `engine` is the
  engine's `summary()` (won/lost) or `counts()` (abandoned)
  ([engine.md](engine.md)); `counts()` with `bbbv` null — left before the
  first click — returns null. `id` defaults to `crypto.randomUUID()`.
- `buildSummary` also takes `startCell`, `daily` (a Daily board's date,
  required with the daily flag) and `challenge` (`true`).
- The record: `{ id, board, outcome, elapsedMs, pauses, pausedMs, bbbv,
  bbbvSolved, clicks, bbbvPerSecond, efficiency, seed, generatorVersion,
  endedAt, startCell?, daily?, challenge? }` — plain serialisable data; `elapsedMs` includes paused time,
  `board` a plain copy of the identity (not the key).
- `countedClicks`, `bbbvPerSecond(summary)`, `efficiency(summary)` —
  unrounded, null on a zero divisor.
- `isBestEligible(summary, stat)`, `BEST_STATS = ['time', 'bbbvPerSecond',
  'efficiency']`, `OUTCOMES = ['won', 'lost', 'abandoned']`.

## INTERNAL PATTERNS

- **Identity, not names.** Every exact combination of the six fields is its
  own board, so a board and its no-guess twin, and a 2D and a 3D board, keep
  separate records. Standard and preset names are recognised from size and
  mine count (standard names on the `square` grid only) and never stored, so
  a custom board matching one is that board. A board whose preset was
  dropped keeps its key and records and reads as custom: the former double
  layer boards (8×8×2, 14×14×2, 25×16×2) and 12×12×8/130.
- **Key format is stored data.** Records and history are indexed by
  `boardKey` and rebuilt with `parseBoardKey`, so the format changes only
  with a records format version (bump `BOARD_KEY_FORMAT`); a test pins the
  `board.js` header's description of it.
- **Validation throws.** `buildSummary` throws a `RangeError` on anything
  that would poison the records (bad time, seed, generator version, a board
  disagreeing with the engine's `mineCount` / `dimensions`, impossible 3BV
  or clicks, a malformed pause span); the full list is its checks.
- **Derived stats are pure.** The builder fills `bbbvPerSecond` and
  `efficiency` with the same exported functions any consumer calls, so a
  recomputation always agrees. Click counting is the engine's; this module
  only sums.
- **Best eligibility.** Only a won game counts for a best, only on a stat
  that is available (`time` always is), and never a challenge.

## DOMAIN DEPENDENCIES

- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — board identity, summary record, derivations, best eligibility, the
  abandoned-game rule.
- [../domain/features/3d-game-records.md](../domain/features/3d-game-records.md)
  — the 3D board identity, key and labels, 3D summaries.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — what 3BV, 3BV solved and a counted click are.

## CROSS-REFERENCES

- [records-board-code.md](records-board-code.md) — board codes, the daily
  seed and the daily boards.
- [records-store.md](records-store.md) — model, store, documents, marker.
- [records-screen.md](records-screen.md), [records-history.md](records-history.md),
  [records-library-view.md](records-library-view.md) — the Records screen.
- [engine.md](engine.md) — `summary()` and `counts()`, `CLICK_KINDS`.
- [generation.md](generation.md) — the seed and `GENERATOR_VERSION`.
- [replay.md](replay.md) — replays sealed with the summary and keyed by
  `boardKey`.
- [classic2d.md](classic2d.md), [mode3d.md](mode3d.md) — the callers of the
  builder, one summary id per game.
- [testing.md](testing.md) — `tests/records-board*.test.mjs`,
  `tests/records-summary*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the key format or the identity's fields: read `board.js` whole,
  and bump `BOARD_KEY_FORMAT` with a records format version.
- Changing a 3D preset: `PRESETS_3D` in `board.js` changes together with
  `PRESETS` in `js/mode3d/board-choice.js`.
- Adding a summary field or a derived stat: `buildSummary` and `STAT_VALUE`
  in `summary.js`; a new best stat joins `BEST_STATS` and `model.js`'s
  `STAT_VALUE` and `BETTER` tables.
- A builder `RangeError` you do not expect: `buildSummary`'s checks and
  `checkEngineBoard` in `summary.js`.
