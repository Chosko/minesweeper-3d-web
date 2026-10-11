# Engine — cell-graph rules engine

## OVERVIEW

The one rules engine every mode plays through: a board is an immutable graph of
cells and neighbours, and reveal, flood fill, flag, chord, win, loss, 3BV and
click counts are implemented once over that graph. Classic 2D plays the
reference profile (Minesweeper Online, default options) on the square grid;
the 3D mode plays the 3D profile (the original 3D game's rules) on the box
graph, read through the 3D state view. DOM-free, no three.js, no timer; it
never places mines itself.

- `js/engine/graph.js` — the immutable cell graph (flat compressed rows), and
  the cell-graph interface every provider serves.
- `js/engine/square-grid.js` — the square-grid provider: index layout and
  neighbour order of the 8-neighbour board.
- `js/engine/box-grid.js` — the box graph provider: the 26-neighbour
  X × Y × Z box, neighbours computed rather than stored.
- `js/engine/state-view-3d.js` — the 3D state view: the read surface the 3D
  renderer, picking and HUD consume.
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
  (allocates a copy; for callers). Every index is range-checked. These members
  are the cell-graph interface: a provider may serve them computed instead of
  stored, and the rules engine, the placer and the solver take either.

Square grid (`js/engine/square-grid.js`)
- `createSquareGrid(width, height)` → frozen `{ width, height, graph,
  index(col, row), colRow(index) }`. Index layout `index = col + width * row`,
  col fastest, row 0 at the top. Neighbour order is reading order over the
  3 × 3 block (NW N NE W E SW S SE), skipping the cell and off-board cells, so
  every list is ascending: 3 neighbours at a corner, 5 on an edge, 8 inside.

Box grid (`js/engine/box-grid.js`)
- `createBoxGrid(X, Y, Z)` → frozen `{ X, Y, Z, graph, index(i, j, k),
  coords(c) }` (`coords` → `[i, j, k]`); each side an integer 1 .. 100, else
  `RangeError`. Index layout `index = i + X * (j + Y * k)`, i fastest — the
  layout the 3D renderer's instancing, picking and camera are written
  against. Neighbour order is the 3D game's enumeration of the 3 × 3 × 3
  block, (di, dj, dk) each over -1 .. 1, di outer and dk inner, skipping the
  cell and off-box cells: 7 neighbours at a corner, 11 on an edge, 17 on a
  face, 26 inside.
- The graph stores no neighbour lists: it enumerates 26 fixed index offsets
  with the edges clipped, so a million-cell box builds in constant memory.

Rule profiles (`js/engine/profiles.js`)
- `REFERENCE_PROFILE` = `'minesweeper-online'`, `PROFILE_3D` =
  `'minesweeper-3d'`; `PROFILES` — deep-frozen
  `{ [id]: { current, versions: { [n]: profile } } }`; each ships as
  version 1.
- `getRuleProfile(id, version?)` — the current version when omitted;
  `RangeError` on an unknown profile or a version this build lacks.
- A profile records `id`, `version` and its behaviour markers:
  `chordInputs`, `rightPressOnNumber`, `revealInputs`, `flagToggle`,
  `pressFeedback`, `releaseOffCell`, `chordCountsFlagsOnly`,
  `chordOnFlagCountMismatch`, `flagRevealedCell`, `lossView`, `firstClick`,
  `clickCounting`, `customLimits`, plus `fidelity` mapping every marker to
  its heading in `tests/fidelity/minesweeper-online.md`. The engine branches
  on `flagRevealedCell` and applies `clickCounting`; the Classic 2D pointer
  input reads `chordInputs`, `revealInputs`, `flagToggle`, `pressFeedback`
  and `releaseOffCell` ([classic2d.md](classic2d.md)); the rest record
  reference behaviour that tests pin and other areas (board generation,
  board setup) honour.
- The 3D profile records `flagRevealedCell: 'neighbours'`,
  `zeroFloodStopsAtFlag`, `revealOnRevealedZero: 'chord'`, `autoHide`,
  `chordCountsFlagsOnly`, `chordOnFlagCountMismatch`, `win`, `lossView`,
  `firstClick` and `clickCounting`; its `fidelity` maps each to the
  `docs/ORIGINAL_SPEC.md` rule it reproduces or to the deliberate difference
  in [../domain/features/3d-board-graph.md](../domain/features/3d-board-graph.md)
  it follows. The engine branches on the first four and applies
  `clickCounting`.
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
  `{ mine, number, revealed, flagged, hidden }`, `Uint8Array`s, read-only for
  callers; `hidden` is set only under `autoHide`).
- Actions take a cell index and return `{ changed, ended, boardNeeded }`:
  `changed` is an `Int32Array` view of one shared buffer — copy it before the
  next action; `ended` is true when the action won or lost; `boardNeeded` is
  the requested cell or -1.
  - `reveal(c)` — while awaiting, returns `boardNeeded: c` and changes
    nothing. Playing: a flagged or revealed cell is a wasted reveal; a mine
    loses; otherwise opens and flood-fills through zeros. Under
    `revealOnRevealedZero: 'chord'` a reveal on a revealed zero opens its
    closed, unflagged neighbours when it has no flagged neighbour (wasted
    when it opens nothing); under `zeroFloodStopsAtFlag` a zero with a
    flagged neighbour does not spread a flood fill.
  - `supplyBoard(c, mines)` — only while awaiting (else `Error`); a board with
    the wrong mine count or a mine on `c` throws `RangeError` and the game is
    unchanged; otherwise places the mines and applies the reveal of `c`.
  - `toggleFlag(c)` — flags/unflags a closed cell. On a revealed cell: under
    `flagRevealedCell: 'neighbours'` one flag click flags every closed,
    unflagged neighbour, or unflags every closed neighbour when all are
    already flagged (wasted when it flags none); otherwise does nothing and is
    not recorded or counted.
  - `chord(c)` — on a revealed number whose neighbouring flag count equals
    its number, opens every unflagged closed neighbour; a wrong flag opens
    the mine and loses. Otherwise (closed cell, count mismatch) a wasted
    chord.
  - Any action outside playing (other than the first reveal's request)
    changes, records and counts nothing — a flag before the first click
    included.
  - Under `autoHide`, every action that does not lose ends with the hide
    pass, and `changed` includes the cells hidden or shown again.
- Queries: `cellState(c)` (a `CELL` value; the loss view shows the exploded
  mine, unflagged mines and wrong flags), `cellNumber(c)` (-1 unless
  revealed).
- `counts()` → frozen `{ bbbv, bbbvSolved, clicks }` at any time (`bbbv` is
  null until the mines are placed) — the source for an abandoned game.
- `summary()` → frozen `{ outcome: 'won' | 'lost', dimensions, mineCount,
  bbbv, bbbvSolved, clicks }` at a win or loss, null before.
- `actions()` → the applied action stream `[{ kind: 'reveal' | 'flag' |
  'chord', cell }]` in order.
- `snapshot()` → a frozen copy of the whole game state — cells, phase,
  counts, 3BV progress and the action stream; `restore(snapshot)` sets the
  same game back to it (a `RangeError` on a snapshot another game took).
  The action stream is shared with the snapshot and copied only when play
  goes on after a restore. The replay simulator seeks backwards with them
  ([replay.md](replay.md)).
- `clicks` is `{ reveal, flag, chord }`, each `{ effective, wasted }`.

3D state view (`js/engine/state-view-3d.js`)
- `createStateView3D(game, box)` → frozen view of a game played on
  `box.graph` (else `RangeError`), serving what the 3D renderer, picking and
  HUD read under the names they read: `X`, `Y`, `Z`, `n`, `idx(i, j, k)`,
  `coords(c)`; `number` (`Int8Array`, -1 on a mine, all 0 until the mines are
  placed); `pressed` (revealed), `flagged`, `unlinked` (hidden) — the engine's
  own arrays while the game is not lost; `state` (`'playing'`, awaiting the
  first click included, | `'won'` | `'lost'`), `phase`, `explodedIdx`,
  `minesLeft`; `version` (moved by every action that changed a cell); `dirty`
  and `consumeDirty()` (the cells changed since the last drain; the renderer
  is the one consumer).
- `apply(result)` — the driver passes every action's result through it
  (`view.apply(game.reveal(c))`) and gets the result back; it is how the view
  learns of changes.
- A loss reads as the 3D front-end presents it: every cell pressed, none
  flagged or unlinked, every cell dirty; the engine's arrays are left as the
  loss left them.

Metrics (`js/engine/metrics.js`)
- `createBoardMetrics(graph, mine, number)` → `{ bbbv, solved, opened(c),
  save(), restore(saved) }`; `save` / `restore` copy the 3BV progress out
  and back for the game's snapshots.
- `createClickCounts()` → `{ add(kind, wasted), snapshot(), save(),
  restore(saved) }`;
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
- Hot loops walk a cell's neighbours once into a buffer (`fillNeighbours`
  through `forEachNeighbour`) instead of one graph call per slot. `rules.js`
  keeps two buffers: a loop over one may call code that fills the other,
  never its own.
- Auto-hide: a revealed, unflagged cell whose flagged-neighbour count equals
  its number hides when it is a zero or every neighbour is revealed or
  flagged; unflagging a cell shows its hidden neighbours again; a loss shows
  every hidden cell. Only a changed cell or its neighbour can newly qualify
  and a hide changes no other cell's condition, so one pass over them per
  action is the fixed point. The flagged-neighbour count (`flagNb`) is kept
  only for the profiles that read it.
- Actions allocate nothing per cell: `changed` deduplicates with a per-action
  stamp array (`mark`) and writes into one reused buffer; `stamp` wraps by
  clearing `mark`.
- Win is checked by `safeLeft` reaching 0 after an opening (flags on mines
  not required); loss records `exploded` and touches every cell whose look
  changes in the loss view.
- Click counting: every recorded action is exactly one click, classified
  effective or wasted by the profile's `clickCounting` — a reveal or chord that
  opens nothing is wasted, a flag click that removes a flag is wasted, a chord
  that opens a mine through a wrong flag is effective, a flag on a revealed
  cell is no click at all under the reference profile and one flag click
  under the 3D profile, however many neighbours it changes.
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
- A new mutation path must go through `touch`, `record` and `clicks.add`, and
  a flag change through `setFlag`, which keeps `flagNb` and the hidden
  neighbours in step.
- Large-board memory: a 100 × 100 × 100 game holds about 37 bytes a cell in
  typed arrays (box graph 0, game 31, state view 6, 2 more after a loss),
  measured by `tests/engine-3d-view.test.mjs`.

## DOMAIN DEPENDENCIES

Fidelity to the reference (Minesweeper Online, default options) is the
overriding rule, and it is checked against a recorded observation, not
asserted.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the graph model, the square-grid provider, rule profiles and versions,
  the first-click hand-off, 3BV and click-count definitions, the summary.
- `tests/fidelity/minesweeper-online.md` — the observed reference behaviour;
  every profile marker cites one of its entries.
- [../domain/features/3d-board-graph.md](../domain/features/3d-board-graph.md)
  — the box graph provider, the 3D rule profile, the 3D state view, the
  deliberate differences from the original 3D game and the large-board
  memory figures.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) § Rules — the
  original 3D game's rules the 3D profile reproduces; its `fidelity` cites
  them.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — supplies the board at the first click.
- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — consumes the summary and counts.

## CROSS-REFERENCES

- [mode3d.md](mode3d.md) — `create3DGame` in `js/mode3d/session.js`
  builds the 3D game (box graph, 3D profile, state view) and the 3D session
  drives its actions.
- [rendering.md](rendering.md), [input.md](input.md) — the 3D renderer and
  picking read the 3D state view.
- [testing.md](testing.md) — `tests/engine-*.test.mjs` and the fidelity
  observation file.
- [generation.md](generation.md) — the board-generation modules that consume
  the engine: placer, solver, generate loop, worker and client.

## WHEN TO READ THE SOURCE

- Changing a rule, adding a profile marker or a rules version, or fixing a
  fidelity failure.
- Adding a graph provider or changing the square grid's or the box's index
  layout or neighbour order (the box's is pinned by the 3D renderer and
  picking).
- Adding a field the 3D front-end reads, or changing the 3D state view's loss
  presentation or change set.
- Adding an action or mutation path (must keep `changed`, the action stream,
  click counts and 3BV solved in sync).
- Changing how 3BV, 3BV solved or wasted clicks are computed.
- Wiring the engine to board generation, the tile skin or the game summary
  beyond the API above.
