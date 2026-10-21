# Triangle grid

The triangle board as the rules engine, the generator and the flat board see
it. A board of W × H is H rows of W triangles. The top-left tile points up,
tiles alternate along a row, and each row starts opposite to the one above:
the tile at column c, row r points up when c + r is even. A tile's neighbours
are every tile that shares a side or a corner, 12 in the interior. This
feature also sets the Triangle mode's standard boards and custom limits, and
how a triangle board is named in the records and spelled in a board code.

## Purpose

Triangle is Classic 2D's game on a triangle grid
([product-design.md § Triangle](../product-design.md#triangle)). Like
`hexagon-grid`, this is a new graph provider for the one rules engine
(`cell-graph-rules-engine`), plus what has to know a triangle board before a
mode can play one. Two things set it apart from the hexagon grid: numbers run
up to 12, and every tile has one of two orientations, which the geometry and
the tile art both have to carry.

## Scope and non-goals

In scope (m2c-flat-grids):

- The triangle graph provider. Cell index is column + width × row. An
  interior tile's 12 neighbours are 5 tiles on the side of its base, 3 on the
  side of its tip and 2 on each side in its own row. Each neighbour list is
  in ascending index order.
- A `tri` graph description for board generation and the generation worker,
  and its marked start cell at the centre column and row.
- The triangle geometry: alternating triangles sized by their side,
  hit-testing that follows the triangle outline, with a press in a gap going
  to the nearest tile. The floor is 44 px a side, where the circle inside the
  tile is about as large as in the square floor. Cursor moves: left and right
  along the row, up and down to the same column in the row above or below.
- The standard boards, as drawn on the Triangle board sheet: Beginner 13 × 7
  with 8 mines, Intermediate 25 × 13 with 36, Expert 41 × 17 with 103. Their
  densities give the matching Classic 2D board's chance that a safe tile is
  an opening. They are fixed once records exist.
- Custom boards: 1 to 100 a side, as Classic 2D. Mines run from 1 to
  Classic 2D's cap for the same cell count, at most cells − 1. A 1 × 1 board
  is refused on the mines field.
- The board identity's triangle form and its board-code token (below).

Non-goals:

- The rules themselves. The reference profile plays unchanged on this graph,
  numbers 0–12 included. The fidelity observations hold no triangle play, so
  the graph's neighbourhoods are pinned by their own tests.
- A generator version change. Triangle boards are a new description kind.
- The Triangle mode, its screens and its records wiring — `flat-grid-modes`,
  `flat-grid-records-replays`.
- Triangle tile art and the numbers 9–12 — `hex-tri-board-art`.
- A Triangle daily board — not scheduled. The Daily screen keeps Triangle as
  *Coming soon*.
- Triangle leaderboards, achievements and the demo's Triangle locks —
  deferred to `m6-launch`.

## Architecture

Built within the recorded technical direction, as `hexagon-grid` is (see
[technical-direction.md](../technical-direction.md)).

- **Graph provider** — beside the square-grid provider
  ([engine.md](../../context/engine.md)), with the same index and column-row
  helpers and an orientation query (up or down) for a cell.
- **Generation description** — `tri` joins the generator's descriptions
  ([generation.md](../../context/generation.md)). The placer, solver and
  no-guess loop run over it unchanged. The solver's frontier groups are
  larger with 12 neighbours. Its node budget treats an oversized group as
  unconstrained, which can lose deductions but never makes a wrong one.
- **Geometry** — the triangle implementation of `flat-grid-geometry`:
  triangles a half side apart along a row and one triangle height apart
  between rows (plus the gap), each outline pointing the cell's way, the
  glyph box centred on the centroid, the cursor moves above, the floor and
  the scale cap.
- **Board setup values** — standard sizes and custom limits, read by the
  Triangle board choice and the board-code parser.
- **Board identity** — the 2D form with mode `triangle` and grid `tri`,
  standard names recognised on the `tri` grid.

## Data and state

- **Graph and geometry** — derived from width and height, never stored.
- **Board identity** — mode `triangle`, grid `tri`, width, height, mines,
  no-guess.
- **Board-code token** — a triangle board is spelled with a leading `T`
  before the 2D token: `TB`, `TI`, `TE`, or `T<w>X<h>M<mines>`, then `N`
  when no-guess. No current code starts with `T`.

## Interfaces and contracts

- **Provider** — the cell-graph interface, plus each cell's orientation. An
  impossible size throws a `RangeError`.
- **Generation** — deterministic like every description. A request on the
  `tri` description returns the shared result shape.
- **Board setup** — the same refusal shape as Classic 2D's. No-guess is
  never refused up front.
- **Board code** — validated against these limits. A triangle code pasted
  into another mode's board choice is refused as another mode's code.

## Dependencies

- `cell-graph-rules-engine` — the cell-graph interface and the reference
  profile.
- `board-generation` — the placer, solver, no-guess loop, worker and start
  cell.
- `flat-grid-geometry` — the contract the triangle geometry implements.
- `game-summary` — the board identity and board code.
- `classic-2d-square-play` — the custom limits and mine cap reused here.

## Open questions

- No-guess generation time on Expert, where groups are larger, has not been
  measured on this graph. If it misses the attempt budget's timing, the
  budget question goes back to `board-generation`.
