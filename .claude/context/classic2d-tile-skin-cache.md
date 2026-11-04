# Classic 2D — tile skin's cache and board art hand-off

## OVERVIEW

How a Classic 2D tile reaches the canvas once painted: the tile cache that
pre-renders every state and number (and the raised states at each depth
step), the skin one board view owns, and the board art hand-off `BOARD_ART`.
The painter itself, the outlines and `MIN_TILE_SIZE` are
[classic2d-tile-skin.md](classic2d-tile-skin.md)'s; the area overview is
[classic2d.md](classic2d.md).

- `js/classic2d/tile-skin.js` — `createTileSkin`, its cache (`drawTile`,
  `build`), `tileKey`, the depth steps, `createBoardArt` and `BOARD_ART`.
  DOM-free at import.

## PUBLIC API

`js/classic2d/tile-skin.js`
- `DEPTH_STEPS`, `depthStep(depth)` — the depths the cache holds the
  raised states (closed, pressed, flagged) at, and the step nearest a
  depth (1, the face's own, for none).
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

## DOMAIN DEPENDENCIES

- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the cache.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the board module the skin draws from, the hand-off.
- [../domain/features/hex-tri-board-art.md](../domain/features/hex-tri-board-art.md)
  — the cache by outline.

## CROSS-REFERENCES

- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the painter the cache
  renders through, the outlines and `MIN_TILE_SIZE`.
- [app-shell-board-module.md](app-shell-board-module.md) — `js/shell/board-art.js`,
  which feeds `BOARD_ART`.
- [classic2d-board-canvas.md](classic2d-board-canvas.md) — the view that owns a
  skin; [classic2d-board-motion.md](classic2d-board-motion.md) — the motion
  layer that draws from the cache's depth steps.
- [rendering-board-art.md](rendering-board-art.md) — the 3D scene's hand-off
  reading `BOARD_ART`.
- [testing-files.md](testing-files.md) — `tests/tile-skin.test.mjs` the cache and
  hand-off.

## WHEN TO READ THE SOURCE

- Changing the cache key, the depth steps or what invalidates the cache
  (`drawTile`, `build`, the `art.onChange` subscription).
