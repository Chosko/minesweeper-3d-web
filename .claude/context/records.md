# Records — board identity, summary record, derived stats

## OVERVIEW

The records vocabulary every records consumer shares: which board a game was
played on, the one summary record of a played game, and the stats derived
from it. DOM-free, stateless, no persistence and no drawing.

- `js/records/board.js` — the board identity, its key and its display label.
  Imports nothing.
- `js/records/summary.js` — the summary builder, the derived stats and best
  eligibility. Imports `CLICK_KINDS` from `js/engine/metrics.js` and the
  identity from `board.js`; never `js/logic.js`.

Consumed by `classic-2d-square-play`, which calls the builder at the end of
a game, and by `personal-records`, `results-screen` and `records-screen`,
which read the record.

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

## INTERNAL PATTERNS

- **Identity, not names.** A board is its six fields; every exact
  combination is its own board. The standard names are recognised from size
  and mine count on the `square` grid only and are never stored, so a custom
  board matching a standard one is that standard board.
- **Key format is stored data.** Records are indexed by `boardKey`, so the
  format changes only together with a records format version (bump
  `BOARD_KEY_FORMAT`). The format is documented in the `board.js` header, and
  a test pins that it is.
- **Validation throws.** `buildSummary` throws a `RangeError` on anything
  that would poison the records: negative or non-integer time, a seed outside
  `0 .. 2^32 - 1`, a generator version below 1, a board whose mines or
  dimensions differ from the engine's `mineCount` / `dimensions`, 3BV above
  the safe cells or below 1, 3BV solved above 3BV, a win with 3BV left
  unsolved, malformed click counts, an engine outcome other than won or lost.
- **Derived stats are pure.** The builder fills `bbbvPerSecond` and
  `efficiency` with the same exported functions any consumer calls on the
  record's own fields, so a recomputation always agrees. Click counting is
  the engine's, by the reference profile's rule; this module only sums.
- **Best eligibility.** Lost and abandoned games never count for a best;
  a won game counts only on a stat that is available (`time` always is).

## DOMAIN DEPENDENCIES

- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — the board identity, summary record, derivations, best eligibility and
  the abandoned-game rule.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — what 3BV, 3BV solved and a counted click are.

## CROSS-REFERENCES

- [engine.md](engine.md) — `summary()` and `counts()`, the builder's input;
  `CLICK_KINDS`.
- [generation.md](generation.md) — the seed and `GENERATOR_VERSION` the
  record carries.
- [platform.md](platform.md) — where `personal-records` will persist the
  records.
- [testing.md](testing.md) — `tests/records-board.test.mjs`,
  `tests/records-summary.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the key format or the identity's fields: read `board.js` whole,
  and bump `BOARD_KEY_FORMAT` with a records format version.
- Adding a summary field or a derived stat: read `buildSummary` and the
  `STAT_VALUE` table in `summary.js`; a new best stat joins `BEST_STATS`.
- A builder `RangeError` you do not expect: read `buildSummary`'s checks and
  `checkEngineBoard` in `summary.js`.
- Wiring a mode's end of game to the builder beyond the API above.
