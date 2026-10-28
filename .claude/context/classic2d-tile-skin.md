# Classic 2D — tile skin

## OVERVIEW

How a Classic 2D tile looks. The area overview is
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
- `DEPTH_STEPS`, `depthStep(depth)` — the depths the cache holds the
  raised states (closed, pressed, flagged) at, and the step nearest a
  depth (1, the face's own, for none).
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
- `tileKey(outline, state, number, step = 1)` — the cache's key for one
  image: the recipe's outline it is drawn in (`square`, `hexagon`,
  `triangle-up`, `triangle-down`), the state (a revealed one with its
  number; one past its outline's highest number, or an unknown state, the
  placeholder) and a raised state's depth step.
- `createBoardArt()` → `{current(), set(id, board), onChange(listener)}` —
  a board art hand-off: the module last handed over as `{id, board}` (null
  until the first) and its subscribers. `BOARD_ART` is the page's one, which
  the shell feeds (`js/shell/board-art.js`, [app-shell-board-module.md](app-shell-board-module.md))
  and every skin and the 3D scene's hand-off read.
- `createTileSkin({art, createCanvas, redraw})` → `{paintTile, drawTile(ctx,
  x, y, size, state, number, pixelRatio = 1, depth = null, cell = null),
  board(), invalidate, cacheKey, dispose}` — one skin per board view; `art` defaults
  to `BOARD_ART`; `redraw` is the view's refit and repaint; `board()` the
  module it draws from, or null.

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
- **Tile cache.** `drawTile` keys the cache on `size|pixelRatio|theme id`
  (`cacheKey()`) and each image in it by `tileKey` — the recipe's outline,
  state and depth step. On a key change it drops every image; the first
  draw of an outline renders all of that outline's images (each state,
  `revealed-0` up to its highest number, the closed, pressed and flagged
  faces at every depth step but 1, the placeholder) on offscreen canvases
  of the outline's box × ratio in device pixels, so a hexagon board caches
  one outline and a triangle board both orientations, and then every draw
  is one `drawImage`. A hexagon's or triangle's box sits off the pixel
  grid: its image is copied at its own size from the device pixel nearest
  its corner, never resampled. Until a module is handed over it draws and
  caches nothing.
- **Depth.** A depth draws from the cached step nearest it, so the motion
  layer's depth costs a few cached images and never a draw per frame. On a
  bevel style a pressed tile's slope narrows with the depth as a closed
  one's does; no shipped theme draws its Classic 2D tiles in bevel.
- **Invalidation.** Size and ratio changes go through the key. A theme
  change arrives as a hand-off on `art`: the skin takes the new module,
  drops the cache and calls `redraw`. `dispose()` unsubscribes.
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
- [testing.md](testing.md) — `tests/tile-skin.test.mjs` the painter on
  every outline, cache, hand-off and `MIN_TILE_SIZE`.

## WHEN TO READ THE SOURCE

- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`); a change to the recipe is [tile-art.md](tile-art.md)'s.
- Changing the cache key, the depth steps or what invalidates the cache
  (`drawTile`, `build`, the `art.onChange` subscription).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and saved screenshots before changing a board module value or
  glyph geometry.
