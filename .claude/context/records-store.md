# Records store — records model, personal records documents, game-in-progress marker

## OVERVIEW

The player's personal records — bests, per-mode counters and streaks, and
the history — held in memory by the model (`js/records/model.js`, no
storage) and persisted by the store (`js/records/store.js`), the one owner
and only writer of the `records`, `records.history` and
`records.inProgress` documents through platform storage
([platform.md](platform.md)). The board identity and the summary record they
are built from are in [records.md](records.md).

The store records abandoned games and settles the marker itself; a
finished game is recorded only by a caller of `record()` — the results flow
([app-shell-results.md](app-shell-results.md)) — since the `finished` hand-off only clears
the marker.

## PUBLIC API

Model (`js/records/model.js`; its head comment documents the documents)
- `createRecordsModel({ records?, history? })` → model; given a history
  without records, the records are rebuilt from it. Queries return copies; a
  board is named by its identity or its key alike.
  - `record(summary)` → comparison; a `RangeError` on anything not
    recordable; an id already in the history returns its original
    comparison.
  - `boardsPlayed(mode = 'classic-2d')` → `[{ key, board }]`: named boards
    first (standard / preset order, each without no-guess before with it),
    then custom boards, most recently played first.
  - `bests(board)` → `{ time, bbbvPerSecond, efficiency }`, each null or
    `{ id, value, endedAt }`.
  - `counters(board)` → `{ games, wins, currentStreak, longestStreak,
    completed, currentCompletedStreak, longestCompletedStreak }`;
    `winRate`, `completedWinRate` (null for none).
  - `history(board)`; `overall(mode)`, `overallWinRate(mode)`,
    `overallCompletedWinRate(mode)`; `documents()` → `{ records, history }`.
- The comparison: per stat in `BEST_STATS`, `{ best, value, difference,
  newBest }` — the best that stood before this game.
- `compactSummary(summary)` — the history entry; entries without the pause
  fields read as 0 and 0 (`pauseFields`).
- The records document: `{ boards: { [boardKey]: { board, bests, counters }
  }, overall: { [mode]: counters } }`. `MODES` — `['classic-2d', '3d']`;
  `MODE_CLASSIC_2D`.
- `rebuildRecords(history)`, `emptyRecords()`, `upgradeRecords(records)`
  (the format step from version 1: zeroed counters for a mode with none),
  `hasCompletedCounters(records)`.

Store (`js/records/store.js`)
- `createRecordsStore({ storage, onNotSaved? })` → store. Registers
  `RECORDS_DOC` `records` (`RECORDS_VERSION` 3: `upgradeRecords` from 1, an
  unchanging step from 2), `HISTORY_DOC` `records.history` (1),
  `IN_PROGRESS_DOC` `records.inProgress` (1). `onNotSaved({ reason })` at
  most once, at the first failed save.
- `load()` → Promise, shared by repeated calls; `record`, `begin` and
  `checkpoint` before it throw.
- `record(summary)` → the comparison; clears the marker holding the same id.
- `begin(summary)`, `checkpoint(summary)` — save the marker (outcome
  abandoned); ignore an id already recorded.
- `onChange(fn)` → unsubscribe; `fn(comparison, summary)`.
- `available()`, `settled()`.
- `attach(pauser)` → detach: `abandoned` records, `inProgress` calls `begin`
  or `checkpoint`, `finished` clears the marker; a null summary (a fixed 3D
  board's) is ignored.
- The model's queries, delegated.

## INTERNAL PATTERNS

- **History is the source of truth.** The records document is a cache
  derived entry by entry, so `rebuildRecords(history)` equals the records
  maintained game by game. A best is replaced only by a strictly better
  value, so a tie keeps the earlier holder.
- **Counters per mode.** A game counts in its board's counters and its own
  mode's overall only — no figure combines Classic 2D and 3D. A win extends
  the streak; a loss or an abandoned game ends it. Won and lost games are
  completed: a win extends the completed streak, a loss ends it, an
  abandoned game leaves it. Win rates are derived, never stored. Missing
  completed counters are seeded from the reference ones, so wins never
  exceed completed.
- **Comparison against the past.** A repeated id recomputes the original
  comparison from the history before it, so recording is idempotent.
- **Memory first, saves in order.** The store updates the model, notifies,
  then queues the saves, run in request order; `settled()` is the queue's
  tail. A failed save leaves the session's records correct and reports once.
- **Start-up load.** The three documents are read once. A version 1 records
  document is stepped up by `upgradeRecords` and saved back. A missing or
  corrupt records document beside an intact history, or one lacking the
  completed counters (`hasCompletedCounters` false), is rebuilt from the
  history and saved. A document newer than this build (`newer-version`) or
  an unreadable history is refused: the session runs on empty records,
  `available()` is false, nothing is saved.
- **The game-in-progress marker.** `records.inProgress` holds at most one
  summary, saved at game start, every pause and `pagehide`; recording the
  same id or the `finished` hand-off clears it. At `load()` a leftover
  marker is recorded as abandoned (ending the streak) and cleared; one
  already recorded changes nothing, an unreadable one is dropped. This
  relies on every summary of one game carrying the same id.

## DOMAIN DEPENDENCIES

- [../domain/features/personal-records.md](../domain/features/personal-records.md)
  — bests, counters, history, comparison, the three documents, the marker,
  availability and the newer-version refusal.
- [../domain/features/3d-game-records.md](../domain/features/3d-game-records.md)
  — per-mode counters, boards played by mode, the records format step.

## CROSS-REFERENCES

- [records.md](records.md) — board identity, key, the summary record.
- [records-screen.md](records-screen.md) — the screen reading the queries.
- [platform.md](platform.md) — `register`, `load`, `save`, `available` and
  the `newer-version` issue.
- [app-shell.md](app-shell.md) — `RECORDS` and `__ms.records`;
  [app-shell-pause.md](app-shell-pause.md) — the pause controller's
  hand-offs; [app-shell-results.md](app-shell-results.md) — the results flow
  that calls `record()`.
- [replay-library.md](replay-library.md) — the results flow's best pinning
  from the comparison.
- [testing.md](testing.md) — `tests/records-model*.test.mjs`,
  `tests/records-store.test.mjs`.

## WHEN TO READ THE SOURCE

- A model `RangeError`: `compactSummary` in `model.js`.
- Changing a stored document's shape: `model.js` (`apply`, `compactSummary`,
  `upgradeRecords`) and `store.js`'s `doLoad`; bump that document's version
  in `store.js` and register its step from the previous version.
- Changing when the marker is written or settled: `store.js`'s `attach`,
  `keepMarker` and `doLoad`.
- Wiring a mode's end of game to the store beyond the API above.
