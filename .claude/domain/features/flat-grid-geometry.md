# Flat grid geometry

The one contract that tells a flat board how its cells sit on the page: where
each tile goes, the outline it is drawn and hit-tested in, how the keyboard
and controller cursor moves from tile to tile, and the smallest tile it may
shrink to. Classic 2D's board view, tile painter, cell motion, end effect,
inputs, movement sampler and 2D replay viewer are written against this
contract, and the square grid is its first geometry. The hexagon and triangle
grids are the other two.

## Purpose

Hexagon and Triangle are "Classic 2D's game on a hexagonal grid" and "on a
triangle grid"
([product-design.md § Hexagon](../product-design.md#hexagon),
[§ Triangle](../product-design.md#triangle)): the same board, inputs, timer,
motion and replays, on a different arrangement of cells. The Classic 2D stack
assumes a square grid in a few places: the pitch, the square slot used for
hit-testing, arrow-key moves by column and row, the square tile clip, and
pointer samples in pitches. This feature collects those assumptions behind
one geometry interface. The three flat modes then share one implementation,
and nothing is copied per mode. It serves both new modes equally. Its Source
names § Hexagon only because a feature has one Source.

## Scope and non-goals

In scope (m2c-flat-grids):

- The flat grid geometry contract (below) and the square geometry, which
  reproduces Classic 2D's layout, hit-testing, cursor moves and tile shape
  exactly.
- Moving Classic 2D's board view (fit rule, layout, board frame, extent,
  scrolling and panning, the clipped viewport, the touch zoom, per-cell
  redraw), its motion layer and ring layer, the end effect's waves and
  confetti, the pointer, touch and cursor inputs, the 2D movement sampler and
  the 2D replay viewer (pointer, trail, press rings, Show 3BV tints) onto the
  geometry.
- The tile painter and its cache drawing a tile through the geometry's
  outline. The outline shapes themselves and their theme values are
  `hex-tri-board-art`'s.

Non-goals:

- The hexagonal and triangle geometries — `hexagon-grid` and
  `triangle-grid`.
- Any change to how Classic 2D looks, plays, records or replays. The square
  geometry is a refactor and its boards, replays and tests stay as they are.
- The Surface mode's board — deferred to `m6-launch`; Surface draws its
  tiles in three.js, not through this contract.
- A new input rule. Every input keeps reading the rule profile's markers
  (`cell-graph-rules-engine`).

## Architecture

Built within the recorded technical direction: Canvas 2D for the square,
hexagonal and triangle grids, independent of three.js, DOM-free modules
tested with Node's runner (see
[technical-direction.md](../technical-direction.md)). It changes the shipped
Classic 2D modules in place ([classic2d.md](../../context/classic2d.md) and
its siblings) rather than adding a parallel stack.

- **Geometry.** A grid geometry is a plain, DOM-free description of one
  board's cells on a plane, built from the grid kind, width and height. It is
  separate from the cell graph (`cell-graph-rules-engine`): the graph says
  which cells are neighbours, the geometry says where they are drawn. Each
  grid feature supplies both. The geometries live in `js/geometry/`, one
  module per grid kind behind one lookup by kind.
- **Layout.** The board view's fit rule asks the geometry for the board's
  extent at a tile size and gap, and for each cell's tile rectangle and
  centre. The square geometry answers with today's pitch arithmetic. The fit
  rule, the floor, the scale cap, the board frame, the board's extent the
  game window hugs, scrolling and panning keep their rules. They work in the
  geometry's board units rather than square pitches.
- **Hit-testing.** A point on the board maps to the cell whose slot holds it:
  the tile plus its share of the surrounding gap. Every point inside the
  board's outline belongs to exactly one cell, so a press in a gap goes to
  the nearest tile, as on the square grid.
- **Tile shape.** The painter asks the geometry for a cell's outline (square,
  hexagon, or a triangle pointing up or down) and its glyph box, and draws
  the theme's drawing style clipped to that outline. The cache holds one
  image per state and outline orientation.
- **Cursor moves.** The cursor input asks the geometry for the cell one step
  up, down, left or right of the current one, or none at the board's edge.
  Square: the next column or row. Each grid defines its own moves.
- **Motion and effects.** Cell motion scales and offsets around the tile's
  centre and folds the bottom edge for depth, so it needs only the centre and
  outline. The end effect's waves travel by distance between cell centres,
  and its confetti covers the board's extent.
- **Board units.** Pointer samples, the touch zoom's board point and the
  replay viewer's pointer are in the geometry's board units. On the square
  geometry these are pitches, so recorded Classic 2D replays play back
  unchanged.
- **Minimum tile size and scale cap.** Each geometry carries its own floor
  and its tile size at each board scale. The square geometry's are the
  shipped `MIN_TILE_SIZE` and `TILE_CAP`. The other geometries set theirs so
  that the glyph at the floor and at the cap matches the square's.

## Data and state

- **Geometry** — derived from the grid kind and size; never stored. A replay
  or a summary rebuilds it from the board identity.
- **Layout** — derived per fit as today, with its cell positions computed
  from the geometry.
- Nothing persisted changes. The board scale setting stays one setting for
  every flat mode.

## Interfaces and contracts

- **Geometry** — for a board of a grid kind, width and height:
  - the board's extent at a tile size and gap;
  - each cell's centre, outline (with its orientation) and glyph box;
  - the cell at a board point, or none outside the board;
  - the cursor's neighbour in each of the four directions, or none;
  - the minimum tile size and the tile size at each board scale.
  The tile size is measured the way the grid's sheet measures it (a square's
  side, a hexagon across the flats, a triangle's side).
- **Board view, painter, inputs, sampler, viewer** — take a geometry where
  they took the square grid. Each keeps its shipped public behaviour.
- **Failure** — an unknown grid kind is a programming error (`RangeError`)
  at board setup, never at draw time. The board view refuses a geometry
  built for another size than its grid with a `RangeError` when it is
  created.

## Dependencies

- `classic-2d-square-play` — the board view, inputs, session and mode this
  feature generalises.
- `themed-board-art-and-motion` — the board module, tile recipe and cell
  motion player that draw through the geometry.
- `replay-recording`, `replay-playback` — the 2D sampler's units and the 2D
  viewer.
- `in-game-layout` — the game window whose board area the fit rule works in.
- No external dependency.
