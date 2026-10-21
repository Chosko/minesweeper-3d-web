# Classic 2D — square tile skin

## OVERVIEW

How a Classic 2D tile looks. The area overview is
[classic2d.md](classic2d.md); how a cell moves, the cell motion player
`js/cell-motion.js`, is [classic2d-tile-motion.md](classic2d-tile-motion.md).

- `js/classic2d/tile-skin.js` — the stateless tile painter, the tile cache
  that pre-renders every state and number (and the raised states at each
  depth step), the board art hand-off `BOARD_ART`, and the shared minimum
  tile size. Every tile is drawn from the active theme's board module
  (`js/themes/board-module.js`, [app-shell-board-module.md](app-shell-board-module.md)): its
  Classic 2D drawing style, palette and number font. It holds no palette,
  imports no theme and reads no stylesheet. DOM-free at import.
- `js/tile-art.js` — the shared tile recipe both boards draw through (the
  3D atlas, [rendering.md](rendering.md), and every Classic 2D tile): the
  named drawing styles (`STYLES`) that draw the closed, sunk and revealed
  faces at any size and depth, and the number, mine and flag glyphs, the
  wrong-flag cross and the start cell's ring, every colour and parameter an
  argument. It imports
  nothing and touches no DOM.

## PUBLIC API

`js/classic2d/tile-skin.js`
- `MIN_TILE_SIZE` — the floor a board shrinks to before it scrolls,
  shared by the skin, the view and the board conformance checks.
- `TILE_STATES` — `closed`, `pressed`, `revealed`, `flagged`, `mine`,
  `exploded`, `wrong-flag`, `marked`: the engine's cell states
  ([engine.md](engine.md), `CELL`) plus `pressed` and `marked` (the closed
  start cell a pre-generated board waits for).
- `DEPTH_STEPS`, `depthStep(depth)` — the depths the cache holds the
  raised states (closed, pressed, flagged) at, and the step nearest a
  depth (1, the face's own, for none).
- `paintTileWith(board, ctx, x, y, size, state, number, depth = 1, cell = null)`
  — one tile at `x, y`, `size` CSS pixels, from the board module `board`;
  `number` (0–8) matters only for `revealed`, `depth` only for the raised
  states; `cell`, `{outline, glyphBox}` from the board's grid geometry
  ([classic2d-board-view.md](classic2d-board-view.md)), shapes the tile,
  `x, y` then being its outline's box corner, and none is the square of
  `size`.
- `tileKey(orientation, state, number, step = 1)` — the cache's key for one
  image: the outline orientation, the state (a revealed one with its number,
  an unknown one the placeholder) and a raised state's depth step.
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

`js/tile-art.js`
- `STYLES` — the drawing styles, `bevel` first (the one an unknown name
  falls back to) and `flat`, each with its default `params`.
- `drawFace(ctx, size, face, {style, params, palette, depth, px})` — one of
  `FACES` (`closed`, `sunk`, `revealed`) in a style, its parameters filling
  the style's defaults, at a depth from 0 (flat) to 1 (fully raised); `px`
  one device pixel, to snap every band.
- `explodedParams(params)` — a style's parameters for the exploded tile's
  revealed face: its `border` as the hairline, unchanged for a style
  without one.
- `drawNumberGlyph(ctx, S, n, {color, shadow, font?})`, `drawMineGlyph`,
  `drawFlagGlyph`, `drawCross`, `drawMarkRing(ctx, S, {color, width?})`;
  `NUMBER_FONT` (the fallback stack behind a theme's number font), `shade`,
  `mix`, `roundRect`, `tileBands`.

## INTERNAL PATTERNS

- **Drawing styles.** `bevel` is a raised face inside a thin edge framed
  by four sloped sides, each side its own shade from the face toward
  `bevelLight` or `bevelDark` or an exact `#rrggbb` colour (`sides`), the
  slope's width scaled by the depth, so depth 0 is flat; a sunk face turns
  each shade over (a colour mirrored through the face), and the
  revealed face is flat inside its edge. `flat` is a face with a light top
  band and a dark bottom edge (fractions of the size), the sunk face an
  inset shade along its top (`press`, a fraction of the size) and the
  revealed face flush inside a hairline whose width, like the exploded
  tile's `border`, is in drawing units — CSS pixels on a Classic 2D tile, so
  constant at every tile size; depth changes nothing it draws. Either style
  takes a corner radius (a fraction of the size) that clips the tile to a
  rounded square. An unknown style draws the first one with its own
  parameters and is reported once in development.
- **Glyphs.** The mine is a round body with eight spikes ending in round
  knobs, three quarters of the tile from knob to knob, under its highlight;
  the wrong-flag cross two butt-ended strokes in its own colour over a
  wider outline; a number of one or two digits is set at the same height,
  a wide one narrowed to fit; the start cell's ring a dashed circle inside
  the tile. Their proportions are the recipe's, their colours the
  caller's.
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
  which the board view takes from the geometry: every shape but the square
  clips the face to the outline's corners and sets the glyphs in a square
  of the glyph box's smaller side, centred in it. The square outline is the
  tile itself, painted exactly as a tile given no outline.
- **Placeholder.** An unknown state, a number outside 0–8, or no board
  module paints `FALLBACK_COLOR` with a black cross, clipped to the outline
  — visibly wrong on purpose.
- **Tile cache.** `drawTile` keys the cache on `size|pixelRatio|theme id`
  (`cacheKey()`) and each image in it by `tileKey` — outline orientation,
  state and depth step. On a key change it drops every image; the first
  draw of an orientation renders all of that orientation's images (each
  state, `revealed-0`…`-8`, the closed, pressed and flagged faces at every
  depth step but 1, the placeholder) on offscreen canvases of the outline's
  box × ratio in device pixels, so a grid with two orientations caches
  both, and then every draw is one `drawImage`. Until a module is handed
  over it draws and caches nothing.
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
  is legible at it (the browser test in `tests/tile-skin.test.mjs`, which
  also checks Expert's fit rule in the game window at 1024 px wide).
- **No second palette.** Neither the skin nor the recipe holds a literal
  colour: every colour, parameter and the number font are the board
  module's, which the board conformance checks hold to the contrast and
  legibility contract ([app-shell-board-module.md](app-shell-board-module.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the states, the paint call, the cache and the minimum tile size.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the drawing styles, the board module the skin draws from, the hand-off.

## CROSS-REFERENCES

- [app-shell-board-module.md](app-shell-board-module.md) — owns the board module's shape and
  checks and `js/shell/board-art.js`, which feeds `BOARD_ART`;
  [app-shell-themes.md](app-shell-themes.md) — the theme applier, `js/tokens.js` (`FALLBACK_COLOR`).
- [rendering.md](rendering.md) — the 3D tile atlas, drawn through the same
  `js/tile-art.js` in the module's 3D style.
- [classic2d-board-view.md](classic2d-board-view.md) — the view that owns a
  skin; [classic2d-board-motion.md](classic2d-board-motion.md) — the motion
  layer that draws from the cache's depth steps.
- [classic2d-tile-motion.md](classic2d-tile-motion.md) — the cell motion
  player.
- [testing.md](testing.md) — `tests/tile-art.test.mjs` the drawing styles;
  `tests/tile-skin.test.mjs` the painter, cache, hand-off and
  `MIN_TILE_SIZE`.

## WHEN TO READ THE SOURCE

- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`); a change to `js/tile-art.js` changes the 3D atlas
  too, which `tests/tile-art.test.mjs` and `tests/render-3d-feedback.test.mjs`
  pin.
- Adding a drawing style or a parameter (`STYLES`; the board checks read
  each style's parameters and its relief entries in
  `js/themes/board-module.js`).
- Changing the cache key, the depth steps or what invalidates the cache
  (`drawTile`, `build`, the `art.onChange` subscription).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and saved screenshots before changing a board module value or
  glyph geometry.
