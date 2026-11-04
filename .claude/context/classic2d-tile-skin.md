# Classic 2D — tile skin

## OVERVIEW

How a Classic 2D tile looks. The tile cache, its depth steps and the board
art hand-off are [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md)'s.
The area overview is
[classic2d.md](classic2d.md); how a cell moves, the cell motion player
`js/cell-motion.js`, is [classic2d-tile-motion.md](classic2d-tile-motion.md).

- `js/classic2d/tile-skin.js` — the stateless tile painter, the tile cache
  that pre-renders every state and number (and the raised states at each
  depth step), the board art hand-off `BOARD_ART`, and the shared minimum
  tile size. Every tile is drawn from the active theme's board module
  (`js/themes/board-module.js`, [app-shell-board-module.md](app-shell-board-module.md)): its
  Classic 2D drawing style, palette and number font, a hexagon or triangle
  tile in its grid's shape (`style2d.grids`). It holds no palette,
  imports no theme and reads no stylesheet. DOM-free at import.

The shared tile recipe `js/tile-art.js` it draws through — the drawing
styles and glyphs — is [tile-art.md](tile-art.md).

## PUBLIC API

`js/classic2d/tile-skin.js`
- `MIN_TILE_SIZE` — the floor a board shrinks to before it scrolls,
  shared by the skin, the view and the board conformance checks.
- `TILE_STATES` — `closed`, `pressed`, `revealed`, `flagged`, `mine`,
  `exploded`, `wrong-flag`, `marked`: the engine's cell states
  ([engine-rules.md](engine-rules.md), `CELL`) plus `pressed` and `marked` (the closed
  start cell a pre-generated board waits for).
- `paintTileWith(board, ctx, x, y, size, state, number, depth = 1, cell = null)`
  — one tile at `x, y` from the board module `board`, `size` CSS pixels the
  geometry's tile (a hexagon's across the flats, a triangle's side);
  `number` (0 to its outline's highest) matters only for `revealed`, `depth`
  only for the raised states; `cell`, `{outline, glyphBox}` from the
  board's grid geometry ([classic2d-board-view.md](classic2d-board-view.md)),
  shapes the tile, `x, y` then being its outline's box corner, and none is
  the square of `size`.
- `OUTLINE_NUMBERS` (`{square, hexagon, triangle}`) — the highest number a
  tile of each outline shape shows: the board module's `GRID_NUMBERS` by
  outline rather than by grid, which a test pins to it.
- `DEPTH_STEPS`, `tileKey`, `createBoardArt`, `BOARD_ART` and
  `createTileSkin` are [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md)'s.

## INTERNAL PATTERNS

- **Painter.** Each state is a face of the module's `style2d` from its
  `palette.faces2d`: closed and flagged the closed face, pressed the sunk
  face, revealed / mine / wrong flag the revealed face, exploded the
  revealed face in its `exploded` colours with `explodedParams`, marked the
  closed face in `palette.faces2d.marked` under the start cell's ring in its
  `ring` colour; numbers are the glyph in `numbers2d[n]` set in the
  module's number font, zero none; the flag, mine and cross take their
  palette entries. The painter passes the recipe one device pixel (from the
  context's scale), so every band is whole device pixels. The board view
  draws the marked tile for its marked cell
  ([classic2d-board-motion.md](classic2d-board-motion.md)).
- **Outline.** A tile is drawn through its cell's outline and glyph box,
  which the board view takes from the geometry. A hexagon or triangle is
  drawn in the recipe's outline of its shape and orientation
  ([tile-art.md](tile-art.md)), with its grid's corner radius from
  `style2d.grids` in place of the style's, and its glyphs set in the
  geometry's glyph box — its sides and corner snapped to whole device
  pixels about its centre, so a glyph's strokes fall on the pixel grid —
  through the
  recipe's `inGlyphBox`. The square outline is the tile itself, painted
  exactly as a tile given no outline, in the style's own radius.
- **Placeholder.** An unknown state, a number outside 0 to its outline's
  highest (`OUTLINE_NUMBERS`), or no board module paints `FALLBACK_COLOR`
  with a black cross, clipped to the outline — visibly wrong on purpose.
- **`MIN_TILE_SIZE`** is the readable floor of decision 10 in
  `docs/UX_REVIEW.md`: the fit rule never goes below it, and a board that
  does not fit at it scrolls. Every state and number of every board module
  is legible at it, and on a hexagon and a triangle board at each grid's
  own floor (the browser test in `tests/tile-skin.test.mjs`, which also
  checks Expert's fit rule in the game window at the test's desktop width).
- **No second palette.** Neither the skin nor the recipe holds a literal
  colour: every colour, parameter and the number font are the board
  module's, which the board conformance checks hold to the contrast and
  legibility contract ([app-shell-board-module.md](app-shell-board-module.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the states, the paint call, the cache and the minimum tile size.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the drawing styles, the board module the skin draws from, the hand-off.
- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — a tile drawn through its cell's outline and glyph box.
- [../domain/features/hex-tri-board-art.md](../domain/features/hex-tri-board-art.md)
  — hexagon and triangle tiles in their grid's shape, the numbers each grid
  shows and the cache by outline.

## CROSS-REFERENCES

- [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md) — the tile
  cache, its depth steps and the board art hand-off `BOARD_ART`.
- [app-shell-board-module.md](app-shell-board-module.md) — owns the board module's shape and
  checks and `js/shell/board-art.js`, which feeds `BOARD_ART`;
  [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the theme applier, `js/tokens.js` (`FALLBACK_COLOR`).
- [rendering.md](rendering.md) — the 3D tile atlas, drawn through the same
  `js/tile-art.js` in the module's 3D style.
- [classic2d-board-canvas.md](classic2d-board-canvas.md) — the view that owns a
  skin; [classic2d-board-motion.md](classic2d-board-motion.md) — the motion
  layer that draws from the cache's depth steps.
- [classic2d-tile-motion.md](classic2d-tile-motion.md) — the cell motion
  player.
- [tile-art.md](tile-art.md) — the recipe the painter draws through.
- [geometry.md](geometry.md) — the outlines and glyph boxes the board view hands in.
- [testing-files.md](testing-files.md) — `tests/tile-skin.test.mjs` the painter on
  every outline, cache, hand-off and `MIN_TILE_SIZE`.

## WHEN TO READ THE SOURCE

- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`); a change to the recipe is [tile-art.md](tile-art.md)'s.
- Changing the cache or the hand-off:
  [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and saved screenshots before changing a board module value or
  glyph geometry.
