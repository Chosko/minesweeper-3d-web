# Hexagon grid

The hexagonal board as the rules engine, the generator and the flat board
see it. A board of W × H is W columns of H flat-top hexagons, and every odd
column sits half a row lower. A tile's neighbours are the tiles that share a
side: 6 in the interior, fewer at the edge. This feature also sets the
Hexagon mode's standard boards and custom limits, and how a hexagon board is
named in the records and spelled in a board code.

## Purpose

Hexagon is Classic 2D's game on a hexagonal grid
([product-design.md § Hexagon](../product-design.md#hexagon)). The rules
engine was built so that a new grid is a new graph provider with no engine
change (`cell-graph-rules-engine`). This feature is that provider, plus
everything else that has to know what a hexagon board is before a mode can
play one: its generation description, its start cell, its geometry for the
flat board (`flat-grid-geometry`), its standard sizes and limits, and its
records identity.

## Scope and non-goals

In scope (m2c-flat-grids):

- The hexagon graph provider. Cell index is column + width × row, as on the
  square grid. Each neighbour list is in ascending index order, and that
  order feeds flood fill and generation.
- A `hex` graph description for board generation and the generation worker,
  and its marked start cell, at the centre column and row like the square
  grid's.
- The hexagon geometry: flat-top tiles in columns, sized across the flats,
  odd columns half a row step (the tile plus the gap) lower, so every pair
  of facing sides is one gap apart. A press anywhere in the board's
  rectangle goes to the tile whose centre is nearest, a tie to the lower
  index, so hit-testing follows the hexagon outline and a press in a gap
  goes to the nearest tile. The floor is 26 px across
  the flats, the square floor's aim target. Cursor moves: up and down within
  the column; left and right to the adjacent column at the same row index,
  so the cursor zig-zags along a row.
- The standard boards, as drawn on the Hexagon board sheet: Beginner 9 × 9
  with 13 mines, Intermediate 16 × 16 with 50, Expert 30 × 16 with 100.
  Beginner's and Intermediate's densities give the matching Classic 2D
  board's chance that a safe tile is an opening. Expert's is lower, so that
  no-guess generation clears within board generation's attempt
  budget: measured at Expert's mine count, it met the budget on every seed,
  from the marked start cell and from any other first click alike
  (`dev/measure-noguess-hex.mjs`), and the no-guess tests hold Hexagon
  Expert to that. They are fixed once records
  exist: a later change would make earlier games custom-board records.
- Custom boards: 1 to 100 a side, as Classic 2D. Mines run from 1 to
  Classic 2D's cap for the same cell count, at most cells − 1, so the first
  click is always safe. A 1 × 1 board is refused on the mines field.
- The board identity's hexagon form and its board-code token (below).

Non-goals:

- The rules themselves. The reference profile (Minesweeper Online, default
  options) plays unchanged on this graph, with the same reveal, flag, chord,
  safe first click, 3BV and click counting. The fidelity observations hold
  no hexagon play, so the graph's neighbourhoods are pinned by their own
  tests and the rules by the shipped fidelity tests.
- A generator version change. Square and box boards are unchanged; hexagon
  boards are a new description kind.
- The Hexagon mode, its screens and its records wiring — `flat-grid-modes`,
  `flat-grid-records-replays`.
- Hexagon tile art — `hex-tri-board-art`.
- The Hexagon daily board and its Daily row — `flat-grid-menu-entries`.
- Hexagon leaderboards, achievements and the demo's Hexagon locks — deferred
  to `m6-launch`.

## Architecture

Built within the recorded technical direction: one rules engine over a graph
of cells, where the square, hexagonal and triangle boards differ only in the
graph they supply; seeded generation in a Web Worker (see
[technical-direction.md](../technical-direction.md)).

- **Graph provider** — beside the square-grid provider
  ([engine.md](../../context/engine.md)): width and height in, the immutable
  cell graph out, with the same index and column-row helpers.
- **Generation description** — `hex` joins `square` and `box` in the
  generator's descriptions ([generation.md](../../context/generation.md)).
  The placer, the logic-only solver and the no-guess loop run over it
  unchanged, with the same attempt budget.
- **Geometry** — the hexagon implementation of `flat-grid-geometry`: column
  and row steps from the tile size and gap, the hexagon outline, its slot for
  hit-testing, the cursor moves above, the floor and the scale cap.
- **Board setup values** — the standard sizes and the custom limits in
  `js/hexagon/board-setup.js`, which the Hexagon board choice and the
  board-code parser both read. It takes Classic 2D's custom limits and
  validation by re-export; only the standard sizes are its own.
- **Board identity** — the 2D form with mode `hexagon` and grid `hex`. The
  key format already carries mode and grid, so no key format change. The
  standard names are recognised from exact size and mine count on the `hex`
  grid, against the records' own copy of the standard sizes, which a test
  holds equal to the board setup's.

## Data and state

- **Graph and geometry** — derived from width and height, never stored.
- **Board identity** — mode `hexagon`, grid `hex`, width, height, mines,
  no-guess, plus the daily flag on the Hexagon Daily board. It indexes records and replays like any 2D identity.
- **Board-code token** — a hexagon board is spelled with a leading `H`
  before the 2D token: `HB`, `HI`, `HE`, or `H<w>X<h>M<mines>`, then `N`
  when no-guess, so the Hexagon daily code reads
  `HEN-<YYYYMMDD>-<check>`. No current code starts with `H`, so existing
  codes keep their meaning and the grammar only gains a shape.

## Interfaces and contracts

- **Provider** — the cell-graph interface every provider serves. An
  impossible size throws a `RangeError`.
- **Generation** — a request with the `hex` description returns the same
  result shape as any other. The same request, seed and generator version
  give the same board in the worker and in Node.
- **Board setup** — validating a custom choice gives the field and the
  reason for a refusal, as Classic 2D's does. No-guess is never refused up
  front, and a failed no-guess board gets the session's failure offer.
- **Board code** — parsing checks the size against these custom limits. A
  hexagon code pasted into another mode's board choice is refused as another
  mode's code, as a 3D code is.

## Dependencies

- `cell-graph-rules-engine` — the cell-graph interface and the reference
  profile.
- `board-generation` — the placer, solver, no-guess loop, worker and start
  cell this description plugs into.
- `flat-grid-geometry` — the contract the hexagon geometry implements.
- `game-summary` — the board identity and board code this feature extends.
- `classic-2d-square-play` — the custom limits and mine cap reused here.
