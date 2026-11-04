# Records — the summary record and its derived stats

## OVERVIEW

The one summary record of a played game, its builder and the stats derived
from it, which every records consumer shares. Board identity and the map of
`js/records/` are [records.md](records.md)'s. DOM-free.

| File | Responsibility |
| ---- | -------------- |
| `js/records/summary.js` | Summary builder, derived stats, best eligibility. |

Classic 2D's session ([classic2d.md](classic2d.md)) and the 3D adapter
`js/shell/mode-3d.js` ([mode3d.md](mode3d.md)) call the builder; the results
flow records finished games.

## PUBLIC API

Summary (`js/records/summary.js`)
- `buildSummary({ engine, outcome?, elapsedMs, pauses?, board, seed,
  generatorVersion, endedAt?, id? })` → record or null. `engine` is the
  engine's `summary()` (won/lost) or `counts()` (abandoned)
  ([engine-rules.md](engine-rules.md)); `counts()` with `bbbv` null — left before the
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
  — summary record, derivations, best eligibility, the abandoned-game rule.
- [../domain/features/3d-game-records.md](../domain/features/3d-game-records.md)
  — 3D summaries.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — what 3BV, 3BV solved and a counted click are.

## CROSS-REFERENCES

- [records.md](records.md) — the board identity the record carries, the map
  of `js/records/`.
- [records-store.md](records-store.md) — the model that keeps the records.
- [engine-rules.md](engine-rules.md) — `summary()` and `counts()`, `CLICK_KINDS`.
- [generation.md](generation.md) — the seed and `GENERATOR_VERSION`.
- [replay.md](replay.md) — replays sealed with the summary.
- [classic2d.md](classic2d.md), [mode3d.md](mode3d.md) — the callers of the
  builder, one summary id per game.
- [testing-files.md](testing-files.md) — `tests/records-summary*.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a summary field or a derived stat: `buildSummary` and `STAT_VALUE`
  in `summary.js`; a new best stat joins `BEST_STATS` and `model.js`'s
  `STAT_VALUE` and `BETTER` tables.
- A builder `RangeError` you do not expect: `buildSummary`'s checks and
  `checkEngineBoard` in `summary.js`.
