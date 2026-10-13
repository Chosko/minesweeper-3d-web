# Engine — cell-graph rules engine

## OVERVIEW

The one rules engine every mode plays through: a board is an immutable graph of
cells and neighbours, and reveal, flood fill, flag, chord, win, loss, 3BV and
click counts are implemented once over that graph. Classic 2D plays the
reference profile (Minesweeper Online, default options) on the square grid;
the 3D mode plays the 3D profile (the original 3D game's rules) on the box
graph, read through the 3D state view ([engine-3d.md](engine-3d.md)).
DOM-free, no three.js, no timer; it never places mines itself. Each module's
head comment states its full contract; this file is the map.

| File | Responsibility |
| --- | --- |
| `js/engine/graph.js` | the immutable cell graph (flat compressed rows) and the cell-graph interface every provider serves |
| `js/engine/square-grid.js` | square-grid provider: index layout and neighbour order of the 8-neighbour board |
| `js/engine/box-grid.js` | box graph provider ([engine-3d.md](engine-3d.md)) |
| `js/engine/profiles.js` | rule-profile table keyed by profile and rules version, each marker's fidelity citation |
| `js/engine/rules.js` | game state, phases, first-click hand-off, actions, queries, counts, summary, snapshot, action stream |
| `js/engine/metrics.js` | 3BV, 3BV solved, the effective/wasted click tally |
| `js/engine/state-view-3d.js` | the 3D state view ([engine-3d.md](engine-3d.md)) |

## PUBLIC API

Cell graph and square grid
- `createCellGraph(count, offsets, targets)` (compressed rows: cell i's
  neighbours are `targets[offsets[i] .. offsets[i+1]-1]`, in the provider's
  order; validated, copied, frozen), `cellGraphFromLists(count, lists)`.
- The cell-graph interface: `count`, `edgeCount`, `maxDegree`, `degree(i)`,
  `neighbour(i, k)`, `forEachNeighbour(i, fn)` (hot loops), `neighbours(i)`
  (allocates). A provider may serve it computed instead of stored; the rules
  engine, the placer and the solver take either.
- `createSquareGrid(width, height)` → `{ width, height, graph, index(col,
  row), colRow(index) }`; `index = col + width * row`; neighbour order is
  reading order over the 3 × 3 block (NW N NE W E SW S SE), so every list is
  ascending.

Rule profiles (`profiles.js`)
- `REFERENCE_PROFILE` (`'minesweeper-online'`, version 1), `PROFILE_3D`
  ([engine-3d.md](engine-3d.md)), `PROFILES`, `getRuleProfile(id, version?)`
  (current when omitted; `RangeError` on an unknown profile or version),
  `CUSTOM_LIMITS` (the reference profile's `customLimits`, which Classic 2D
  board setup interpolates).
- Who reads which marker: the engine branches on `flagRevealedCell` and the
  3D markers and applies `clickCounting`; the Classic 2D pointer input reads
  `chordInputs`, `revealInputs`, `flagToggle`, `pressFeedback` and
  `releaseOffCell` ([classic2d-input.md](classic2d-input.md)); the rest record reference
  behaviour that tests pin and board generation and board setup honour.
- `fidelity` maps every marker to its heading in
  `tests/fidelity/minesweeper-online.md` (reference profile) or to the rule
  or deliberate difference it follows (3D profile).

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
- `createBoardMetrics(graph, mine, number)`, `createClickCounts()`,
  `CLICK_KINDS`; both carry `save()` / `restore()` for the game's snapshots.

## INTERNAL PATTERNS

- **First-click hand-off.** The engine never chooses mine positions: the
  first reveal returns `boardNeeded: c` and changes nothing; the caller gets
  a board from board generation and hands it back with `supplyBoard`. A
  rejected board leaves the game untouched. Any other action outside
  playing changes, records and counts nothing — a flag before the first
  click included.
- **Neighbour order is the provider's** and is preserved exactly; flood fill
  and generation follow it. Changing `square-grid.js`'s order changes
  flood-fill order and every seeded board.
- **No recursion.** Flood fill is an iterative queue walk over a
  preallocated `Int32Array(n)`, each cell enqueued once (a 1000 × 1000 zero
  board opens in one reveal).
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
  with no zero neighbour once, computed when the mines are placed; an
  opening counts as solved when every zero in it is open.
- **Determinism.** The same board and action stream give the same game.
- **Every branch is a marker.** A behaviour the engine branches on is a
  profile marker with a `fidelity` citation. A rule fixed against the
  fidelity file ships as a new rules version; earlier versions stay
  playable and their tests keep passing.

## DOMAIN DEPENDENCIES

Fidelity to the reference (Minesweeper Online, default options) is the
overriding rule, checked against a recorded observation, not asserted.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — graph model, square grid, profiles and versions, first-click hand-off,
  3BV and click-count definitions, the summary.
- `tests/fidelity/minesweeper-online.md` — the observed reference behaviour
  every reference marker cites.
- [../domain/features/board-generation.md](../domain/features/board-generation.md),
  [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — supplies the board; consumes the summary and counts.
- The 3D profile's sources: [engine-3d.md](engine-3d.md) § Domain dependencies.

## CROSS-REFERENCES

- [engine-3d.md](engine-3d.md) — box graph, 3D profile, flag batches,
  auto-hide, the 3D state view.
- [generation.md](generation.md) — placer, solver, generate loop, worker and
  client, which run over the cell graph.
- [testing.md](testing.md) — `tests/engine-*.test.mjs` and the fidelity
  observation file.

## WHEN TO READ THE SOURCE

- Changing a rule, adding a profile marker or a rules version, or fixing a
  fidelity failure (`profiles.js`, then `rules.js`).
- An action's exact effect under a profile: `rules.js`'s head comment.
- Adding a graph provider or changing the square grid's index layout or
  neighbour order.
- Adding an action or mutation path (see One mutation path).
- Changing how 3BV, 3BV solved or wasted clicks are computed (`metrics.js`).
