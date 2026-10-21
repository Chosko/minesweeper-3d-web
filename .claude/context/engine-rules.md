# Engine — game rules and metrics

## OVERVIEW

The game every mode plays on the shared cell graph ([engine.md](engine.md)):
game state and phases, the first-click hand-off, the actions and their
`changed` lists, queries, counts, the summary, snapshot and restore, and the
3BV and click-count metrics. DOM-free, no timer; it never places mines
itself. Each module's head comment states its full contract.

| File | Responsibility |
| --- | --- |
| `js/engine/rules.js` | game state, phases, first-click hand-off, actions, queries, counts, summary, snapshot, action stream |
| `js/engine/metrics.js` | 3BV, 3BV solved, the effective/wasted click tally |

## PUBLIC API

Game (`rules.js`)
- `createGame({ graph, profile, version?, mineCount, dimensions? })` —
  awaiting the first click, no mines; `createGameWithMines({ graph, profile,
  version?, mines, dimensions? })` — playing at once.
- `PHASE` (`AWAITING_FIRST_CLICK`, `PLAYING`, `WON`, `LOST`); `CELL` (the six
  visual states the tile skin paints).
- Getters: `profile`, `rulesVersion`, `graph`, `phase`, `mineCount`,
  `flagCount`, `minesLeft` (may go negative), `explodedCell`, `state`
  (`{ mine, number, revealed, flagged, hidden }` `Uint8Array`s, read-only;
  `hidden` only under `autoHide`).
- Actions `reveal(c)`, `toggleFlag(c)`, `chord(c)`, `supplyBoard(c, mines)` →
  `{ changed, ended, boardNeeded }`. `changed` is a view of one shared
  buffer: copy it before the next action. Per-profile semantics are in
  `rules.js`'s head comment and the domain documents below.
- Queries `cellState(c)`, `cellNumber(c)`; `counts()` → `{ bbbv, bbbvSolved,
  clicks }` at any time (the source for an abandoned game); `summary()` at a
  win or loss, null before; `actions()` the applied action stream;
  `snapshot()` / `restore(snapshot)`, which the replay simulator seeks
  backwards with ([replay-playback.md](replay-playback.md)).

Metrics (`metrics.js`)
- `bbbvPartition(graph, mine, number)` (the 3BV regions per cell), `createBoardMetrics(graph, mine,
  number)`, `createClickCounts()`, `CLICK_KINDS`; the counters carry `save()` / `restore()`.

## INTERNAL PATTERNS

- **First-click hand-off.** The engine never chooses mine positions: the
  first reveal returns `boardNeeded: c` and changes nothing; the caller gets
  a board from board generation and hands it back with `supplyBoard`. A
  rejected board leaves the game untouched. Any other action outside
  playing changes, records and counts nothing — a flag before the first
  click included.
- **No recursion.** Flood fill is an iterative queue walk over a
  preallocated `Int32Array(n)`, each cell enqueued once (a 1000 × 1000 zero
  board opens in one reveal), in the provider's neighbour order.
- **No per-cell allocation.** Hot loops fill a neighbour buffer once
  (`fillNeighbours` through `forEachNeighbour`); `rules.js` keeps two
  buffers, and a loop over one may call code that fills the other, never its
  own. `changed` deduplicates with a per-action stamp array (`mark`) into one
  reused buffer.
- **One mutation path.** A new mutation goes through `touch`, `record` and
  `clicks.add`, and a flag change through `setFlag`, which keeps `flagNb`,
  the hidden neighbours and the batch membership (`owner`: 1 + the owning
  number's slot among the flagged cell's neighbours, 0 for a hand flag) in
  step — so `changed`, the action stream, click counts and 3BV solved stay
  in sync.
- **Win and loss.** Win is `safeLeft` reaching 0 (flags not required); a
  loss records the exploded cell and touches every cell whose look changes
  in the loss view.
- **Click counting.** Every recorded action is one click, effective or
  wasted by the profile's `clickCounting`; a flag on a revealed cell is no
  click under the reference profile and one flag click under the 3D
  profile, however many cells it changes.
- **3BV.** Each opening (connected safe zeros) once plus each safe number
  with no zero neighbour once, from `bbbvPartition` when the mines are placed
  (Show 3BV paints it); an opening is solved when every zero in it is open.
- **Determinism.** The same board and action stream give the same game.

## DOMAIN DEPENDENCIES

- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — first-click hand-off, 3BV and click-count definitions, the summary.
- [../domain/features/board-generation.md](../domain/features/board-generation.md),
  [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — supplies the board; consumes the summary and counts.
- The profiles' fidelity sources: [engine.md](engine.md) § Domain dependencies.

## CROSS-REFERENCES

- [engine.md](engine.md) — the cell graph, the grid providers and the rule
  profiles the game plays on.
- [engine-3d.md](engine-3d.md) — flag batches and auto-hide under the 3D
  profile, the 3D state view over the game.
- [records.md](records.md) — the summary record built from `summary()` and
  `counts()`.
- [replay-playback.md](replay-playback.md) — seeking with `snapshot()` /
  `restore()`.
- [testing.md](testing.md) — `tests/engine-*.test.mjs`.

## WHEN TO READ THE SOURCE

- An action's exact effect under a profile: `rules.js`'s head comment.
- Adding an action or mutation path (see One mutation path).
- Changing how 3BV, 3BV solved or wasted clicks are computed (`metrics.js`).
- Changing the summary, `counts()` or the snapshot's contents.
