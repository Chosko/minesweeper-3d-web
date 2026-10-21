# Flat grid geometry

## OVERVIEW

`js/geometry/` tells a flat board where its cells sit on the page, apart
from the cell graph that says which cells are neighbours
([engine.md](engine.md)): each cell's centre, outline and glyph box, the
board's extent, the cell under a board point, the cursor's next cell and
the tile's floor and cap. One contract, one module per grid kind. Built
from a grid kind, width and height; never stored — the game, a preview, a
replay or a summary rebuilds it from the board. DOM-free. `index.js`'s head
comment states the full contract.

| File | Responsibility |
| ---- | -------------- |
| `js/geometry/index.js` | the contract, the kind lookup `createGeometry`, `GRID_KINDS` |
| `js/geometry/square.js` | the square geometry: Classic 2D's tiles one pitch apart |
| `js/geometry/hex.js` | the hexagon geometry: flat-top tiles in columns, odd columns half a row step lower |

## PUBLIC API

- `GRID_KINDS` — the grid kinds a geometry can be built for (`square`,
  `hex`); `createGeometry(kind, width, height)` → the geometry, a
  `RangeError` for an unknown kind. `createSquareGeometry(width, height)`,
  `createHexGeometry(width, height)` — a size that is not a whole number of
  cells is a `RangeError`.
- A geometry → frozen `{kind, width, height, count, minTile, tileCap(scale),
  extent(tile, gap), centre(c, tile, gap), outline(c, tile, gap),
  glyphBox(c, tile, gap), cellAt(x, y, tile, gap), neighbour(c,
  direction)}`. Positions are CSS pixels from the board's top-left corner
  for a tile size (a square's side, a hexagon across the flats) and a gap
  in whole pixels (the layout's `gap`).
  - `outline` → frozen `{shape, orientation, x, y, width, height, points}`:
    the shape (`square`, `hexagon`), its orientation (`none` for a shape with
    one), its bounding box and corners; `centre`, `outline` and `glyphBox`
    are null for a cell off the board.
  - `cellAt` → the cell whose slot holds the point, -1 off the board.
  - `neighbour(c, direction)` → the cursor's next cell `up`, `down`, `left`
    or `right`, -1 at the edge or off the board; another direction is a
    `RangeError`.
  - `minTile` the floor the board shrinks to, `tileCap(scale)` the tile at a
    board scale (the settings' `boardScale`).

## INTERNAL PATTERNS

- **Cell numbering is the engine's.** Cell c is column `c % width`, row
  `floor(c / width)` on both kinds, the grid providers' index layout
  (`square-grid.js`, `hex-grid.js`); a geometry built for another size than
  the board's grid is refused by the board view.
- **Every point has one slot.** Square: a cell's slot is its tile and the
  gap after it, so a point in a gap goes to the tile before it. Hexagon: the
  slot is every point nearer the cell's centre than any other, a tie to the
  lower index.
- **Hexagon placement.** Neighbours sit one row step (the tile plus the
  gap) apart in all six directions, so the column step is √3 / 2 of it; the
  glyph box is the tile across the flats, centred on the cell. The cursor
  moves up and down within a column, and left and right to the same row
  index of the next column, zig-zagging along a row.
- **Floor and cap are read, never copied.** Both kinds take `minTile` from
  the tile skin's `MIN_TILE_SIZE` and `tileCap` from the board view's
  `tileCap`; the geometry modules import them, and the board view imports
  the geometry, a cycle that holds because each is read only at call time.
- **Who builds which.** The Classic 2D mode, the menu's and Daily
  previews build the square geometry of their grid; the 2D replay viewer
  rebuilds its board's from the replay's board identity (`replayGeometry`);
  the board view, the cursor input and the end effect default to the
  square geometry of their grid when none is handed in.

## DOMAIN DEPENDENCIES

- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — the contract and what moved onto it.
- [../domain/features/hexagon-grid.md](../domain/features/hexagon-grid.md)
  — the hexagon board, its placement and hit-testing.

## CROSS-REFERENCES

- [engine.md](engine.md) — the square and hexagon grid providers whose
  index layout the geometries share.
- [classic2d-board-view.md](classic2d-board-view.md) — the layout and fit
  rule on the geometry; [classic2d-tile-skin.md](classic2d-tile-skin.md) —
  a tile drawn through its outline and glyph box;
  [classic2d-input.md](classic2d-input.md) — the cursor's `neighbour`;
  [classic2d-end-effect.md](classic2d-end-effect.md) — the end effect over the
  geometry's centres and extent.
- [replay-viewers.md](replay-viewers.md) — `replayGeometry` and the 2D
  viewer's hit-testing, rings and tints;
  [app-shell-menu-preview.md](app-shell-menu-preview.md) — the previews' boards.
- [testing.md](testing.md) — `tests/geometry-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a grid kind: a builder in `index.js`'s `BUILDERS` answering the
  whole contract in `index.js`'s head comment.
- Changing where a tile sits, its outline or slot, or the cursor's moves on
  one kind: that kind's module and its head comment.
- Moving `MIN_TILE_SIZE` or `tileCap`: `tests/geometry-*.test.mjs` grep
  that each geometry reads them from where they live.
