# Engine — cell-graph rules engine

## OVERVIEW

The one rules engine every mode plays through: a board is an immutable graph of
cells and neighbours, and reveal, flood fill, flag, chord, win, loss, 3BV and
click counts are implemented once over that graph. It plays the reference
ruleset (Minesweeper Online, default options) for Classic 2D. DOM-free, no
three.js, no timer; it never places mines itself. Independent of `js/logic.js`,
which still runs the 3D game ([logic.md](logic.md)).

- `js/engine/graph.js` — the immutable cell graph (flat compressed rows).
- `js/engine/square-grid.js` — the square-grid provider: index layout and
  neighbour order of the 8-neighbour board.
- `js/engine/profiles.js` — the rule-profile table, keyed by profile and rules
  version, with each marker's fidelity citation.
- `js/engine/rules.js` — game state, phases, the first-click hand-off, the
  actions, queries, counts, summary and action stream.
- `js/engine/metrics.js` — 3BV, 3BV solved and the effective/wasted click
  tally.

## PUBLIC API

Cell graph (`js/engine/graph.js`)
- `createCellGraph(count, offsets, targets)` — `offsets` has `count + 1`
  entries spanning `targets` from 0; cell i's neighbours are
  `targets[offsets[i] .. offsets[i+1]-1]`, in the provider's order. Throws
  `RangeError` on a bad count, malformed offsets, an out-of-range neighbour, a
  self-loop or a repeated neighbour. Inputs are copied; the result is frozen.
- `cellGraphFromLists(count, lists)` — same graph from one neighbour list per
  cell.
- Graph members: `count`, `edgeCount`, `maxDegree`, `degree(i)`,
  `neighbour(i, k)`, `forEachNeighbour(i, fn)` (hot loops) and `neighbours(i)`
  (allocates a copy; for callers). Every index is range-checked.

Square grid (`js/engine/square-grid.js`)
- `createSquareGrid(width, height)` → frozen `{ width, height, graph,
  index(col, row), colRow(index) }`. Index layout `index = col + width * row`,
  col fastest, row 0 at the top. Neighbour order is reading order over the
  3 × 3 block (NW N NE W E SW S SE), skipping the cell and off-board cells, so
  every list is ascending: 3 neighbours at a corner, 5 on an edge, 8 inside.

Rule profiles (`js/engine/profiles.js`)
- `REFERENCE_PROFILE` = `'minesweeper-online'`; `PROFILES` — deep-frozen
  `{ [id]: { current, versions: { [n]: profile } } }`; the reference ships as
  version 1.
- `getRuleProfile(id, version?)` — the current version when omitted;
  `RangeError` on an unknown profile or a version this build lacks.
- A profile records `id`, `version` and its behaviour markers:
  `chordInputs`, `rightPressOnNumber`, `chordCountsFlagsOnly`,
  `chordOnFlagCountMismatch`, `flagRevealedCell`, `lossView`, `firstClick`,
  `clickCounting`, `customLimits`, plus `fidelity` mapping every marker to
  its heading in `tests/fidelity/minesweeper-online.md`. The engine branches
  on `flagRevealedCell` and applies `clickCounting`; the rest record
  reference behaviour that tests pin and other areas (input, board
  generation, board setup) honour.
- `CUSTOM_LIMITS` — the reference profile's current `customLimits`: side
  `minSide .. maxSide`, a mine in every cell up to `everyCellUpTo` cells,
  then the measured `mineCaps` (`[cells, cap]`) that Classic 2D board setup
  interpolates.

Game (`js/engine/rules.js`)
- `createGame({ graph, profile, version?, mineCount, dimensions? })` — phase
  awaiting first click, no mines yet. `mineCount` must be `0 .. count - 1`
  (the first-click cell is always safe).
- `createGameWithMines({ graph, profile, version?, mines, dimensions? })` —
  playing directly from a full mine set (in range, no repeats, at most
  `count - 1`).
- `dimensions` is an object of positive integers for the summary (e.g.
  `{ width, height }`); default `{ cells: count }`.
- `PHASE` — `AWAITING_FIRST_CLICK`, `PLAYING`, `WON`, `LOST`
  (`'awaiting-first-click' | 'playing' | 'won' | 'lost'`).
- `CELL` — the six visual states the tile skin paints: `closed`, `flagged`,
  `revealed`, `mine`, `exploded`, `wrong-flag`.
- Getters: `profile`, `rulesVersion`, `graph`, `phase`, `mineCount`,
  `flagCount`, `minesLeft` (`mineCount - flagCount`, may go negative),
  `explodedCell` (-1 until a loss), `state` (frozen
  `{ mine, number, revealed, flagged }`, `Uint8Array`s, read-only for callers).
- Actions take a cell index and return `{ changed, ended, boardNeeded }`:
  `changed` is an `Int32Array` view of one shared buffer — copy it before the
  next action; `ended` is true when the action won or lost; `boardNeeded` is
  the requested cell or -1.
  - `reveal(c)` — while awaiting, returns `boardNeeded: c` and changes
    nothing. Playing: a flagged or revealed cell is a wasted reveal; a mine
    loses; otherwise opens and flood-fills through zeros.
  - `supplyBoard(c, mines)` — only while awaiting (else `Error`); a board with
    the wrong mine count or a mine on `c` throws `RangeError` and the game is
    unchanged; otherwise places the mines and applies the reveal of `c`.
  - `toggleFlag(c)` — flags/unflags a closed cell; on a revealed cell (the
    profile forbids it) does nothing and is not recorded or counted.
  - `chord(c)` — on a revealed number whose neighbouring flag count equals
    its number, opens every unflagged closed neighbour; a wrong flag opens
    the mine and loses. Otherwise (closed cell, count mismatch) a wasted
    chord.
  - Any action outside playing (other than the first reveal's request)
    changes, records and counts nothing.
- Queries: `cellState(c)` (a `CELL` value; the loss view shows the exploded
  mine, unflagged mines and wrong flags), `cellNumber(c)` (-1 unless
  revealed).
- `counts()` → frozen `{ bbbv, bbbvSolved, clicks }` at any time (`bbbv` is
  null until the mines are placed) — the source for an abandoned game.
- `summary()` → frozen `{ outcome: 'won' | 'lost', dimensions, mineCount,
  bbbv, bbbvSolved, clicks }` at a win or loss, null before.
- `actions()` → the applied action stream `[{ kind: 'reveal' | 'flag' |
  'chord', cell }]` in order.
- `clicks` is `{ reveal, flag, chord }`, each `{ effective, wasted }`.

Metrics (`js/engine/metrics.js`)
- `createBoardMetrics(graph, mine, number)` → `{ bbbv, solved, opened(c) }`.
- `createClickCounts()` → `{ add(kind, wasted), snapshot() }`;
  `CLICK_KINDS` = `['reveal', 'flag', 'chord']`.

## INTERNAL PATTERNS

- Phases: awaiting first click → playing → won | lost. The engine never
  chooses mine positions: the first reveal returns a "board needed at c"
  request, the caller gets a board from board generation and hands it back
  with `supplyBoard`. A rejected board leaves the game untouched.
- Neighbour order is the provider's and is preserved exactly; flood fill and
  generation follow it. Changing `square-grid.js`'s order changes flood-fill
  order and every seeded board.
- Flood fill is an iterative queue walk over a preallocated `Int32Array(n)`;
  each cell is enqueued once. No recursion anywhere (a 1000 × 1000 zero board
  opens in one reveal).
- Actions allocate nothing per cell: `changed` deduplicates with a per-action
  stamp array (`mark`) and writes into one reused buffer; `stamp` wraps by
  clearing `mark`.
- Win is checked by `safeLeft` reaching 0 after an opening; loss records
  `exploded` and touches every cell whose look changes in the loss view.
- Click counting: every recorded action is exactly one click, classified
  effective or wasted by the profile's `clickCounting` — a reveal or chord that
  opens nothing is wasted, a flag click that removes a flag is wasted, a chord
  that opens a mine through a wrong flag is effective, a flag on a revealed
  cell is no click at all.
- 3BV: each opening (connected region of safe zeros, joined through the
  graph's neighbours) once, plus each safe number with no zero neighbour once;
  computed when the mines are placed. 3BV solved counts an opening when every
  zero in it is open (a flag can hold one closed), an isolated number when it
  opens.
- Determinism: the same board and the same action stream always give the same
  game — the basis for replays.
- A behaviour the engine branches on is a profile marker with a `fidelity`
  citation, never a silent branch. A rule fixed against the fidelity file
  ships as a new rules version of the profile; earlier versions stay
  playable and their tests keep passing.
- A new mutation path must go through `touch`, `record` and `clicks.add`.

## DOMAIN DEPENDENCIES

Fidelity to the reference (Minesweeper Online, default options) is the
overriding rule, and it is checked against a recorded observation, not
asserted.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the graph model, the square-grid provider, rule profiles and versions,
  the first-click hand-off, 3BV and click-count definitions, the summary.
- `tests/fidelity/minesweeper-online.md` — the observed reference behaviour;
  every profile marker cites one of its entries.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — supplies the board at the first click.
- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — consumes the summary and counts.

## CROSS-REFERENCES

- [logic.md](logic.md) — `js/logic.js`, the 3D game's separate engine; the two
  share no code.
- [testing.md](testing.md) — `tests/engine-*.test.mjs` and the fidelity
  observation file.

## WHEN TO READ THE SOURCE

- Changing a rule, adding a profile marker or a rules version, or fixing a
  fidelity failure.
- Adding a graph provider or changing the square grid's index layout or
  neighbour order.
- Adding an action or mutation path (must keep `changed`, the action stream,
  click counts and 3BV solved in sync).
- Changing how 3BV, 3BV solved or wasted clicks are computed.
- Wiring the engine to board generation, the tile skin or the game summary
  beyond the API above.
