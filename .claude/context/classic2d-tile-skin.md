# Classic 2D — square tile skin

## OVERVIEW

How a Classic 2D tile looks, and how a cell moves. The area overview is
[classic2d.md](classic2d.md).

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
  faces at any size and depth, and the number, mine and flag glyphs and the
  wrong-flag cross, every colour and parameter an argument. It imports
  nothing and touches no DOM.
- `js/cell-motion.js` — the cell motion player both renderers use: the
  running cell animations a theme's motion descriptions play
  ([app-shell-board-module.md](app-shell-board-module.md), the board module's `motion`), and
  each animating cell's values per frame. It imports nothing and touches no
  DOM, game state, timer, replay, setting or media query.

## PUBLIC API

`js/classic2d/tile-skin.js`
- `MIN_TILE_SIZE` — the floor a board shrinks to before it scrolls,
  shared by the skin, the view and the board conformance checks.
- `TILE_STATES` — `closed`, `pressed`, `revealed`, `flagged`, `mine`,
  `exploded`, `wrong-flag`: the engine's cell states
  ([engine.md](engine.md), `CELL`) plus `pressed`.
- `DEPTH_STEPS`, `depthStep(depth)` — the depths the cache holds the
  raised states (closed, pressed, flagged) at, and the step nearest a
  depth (1, the face's own, for none).
- `paintTileWith(board, ctx, x, y, size, state, number, depth = 1)` — one
  tile at `x, y`, `size` CSS pixels, from the board module `board`;
  `number` (0–8) matters only for `revealed`, `depth` only for the raised
  states.
- `createBoardArt()` → `{current(), set(id, board), onChange(listener)}` —
  a board art hand-off: the module last handed over as `{id, board}` (null
  until the first) and its subscribers. `BOARD_ART` is the page's one, which
  the shell feeds (`js/shell/board-art.js`, [app-shell-board-module.md](app-shell-board-module.md))
  and every skin and the 3D scene's hand-off read.
- `createTileSkin({art, createCanvas, redraw})` → `{paintTile, drawTile(ctx,
  x, y, size, state, number, pixelRatio = 1, depth = null), board(),
  invalidate, cacheKey, dispose}` — one skin per board view; `art` defaults
  to `BOARD_ART`; `redraw` is the view's refit and repaint; `board()` the
  module it draws from, or null.

`js/tile-art.js`
- `STYLES` — the drawing styles, `bevel` first (the one an unknown name
  falls back to) and `flat`, each with its default `params`.
- `drawFace(ctx, size, face, {style, params, palette, depth, px})` — one of
  `FACES` (`closed`, `sunk`, `revealed`) in a style, its parameters filling
  the style's defaults, at a depth from 0 (flat) to 1 (fully raised); `px`
  one device pixel, to snap every band.
- `drawNumberGlyph(ctx, S, n, {color, shadow, font?})`, `drawMineGlyph`,
  `drawFlagGlyph`, `drawCross`; `NUMBER_FONT` (the fallback stack behind a
  theme's number font), `shade`, `mix`, `roundRect`, `tileBands`.

`js/cell-motion.js`
- `createCellMotion({now, cap})` → `{start(cell, event, before, after,
  description), valuesAt(time), dropAll(), animating(time)}` — `now` is the
  clock in ms (`performance.now` by default), `cap` defaults to
  `MOTION_CAP`. `start` answers whether an animation started; `valuesAt`
  maps each animating cell to `{event, face, scale, offset {x, y, z},
  rotation {axis, angle}, depth, brightness, opacity}`, `face` being the
  `before` or `after` the caller passed; `animating` defaults its time to
  `now()`.
- `MOTION_CAP` — how many cells animate at once.
- `easingFunction(easing)`, `cubicBezier(x1, y1, x2, y2)` — a description's
  easing as a function of progress.

## INTERNAL PATTERNS

- **Drawing styles.** `bevel` is a raised face inside a thin edge framed
  by four sloped sides, each side its own shade from the face toward
  `bevelLight` or `bevelDark` (`sides`), the slope's width scaled by the
  depth, so depth 0 is flat; a sunk face turns each shade over, and the
  revealed face is flat inside its edge. `flat` is a face with a light top
  band and a dark bottom edge, the sunk face its dark edge along the top
  and the revealed face flush inside a hairline; depth changes nothing it
  draws. Either style takes a corner radius (a fraction of the size) that
  clips the tile to a rounded square. An unknown style draws the first one
  with its own parameters and is reported once in development.
- **Painter.** Each state is a face of the module's `style2d` from its
  `palette.faces2d`: closed and flagged the closed face, pressed the sunk
  face, revealed / mine / wrong flag the revealed face, exploded the
  revealed face in its `exploded` colours; numbers are the glyph in
  `numbers[n]` set in the module's number font, zero none; the flag, mine
  and cross take their palette entries. The painter passes the recipe one
  device pixel (from the context's scale), so every band is whole device
  pixels. `palette.faces2d.marked` is carried by the module but not drawn:
  the marked start cell is the board view's ring
  ([classic2d-board-view.md](classic2d-board-view.md)).
- **Placeholder.** An unknown state, a number outside 0–8, or no board
  module paints `FALLBACK_COLOR` with a black cross — visibly wrong on
  purpose.
- **Tile cache.** `drawTile` keys the cache on `size|pixelRatio|theme id`;
  on a key change it rebuilds every image (each state, `revealed-0`…`-8`,
  the closed, pressed and flagged faces at every depth step but 1, the
  placeholder) on offscreen canvases of `round(size × ratio)` device
  pixels, then every draw is one `drawImage`. Until a module is handed over
  it draws and caches nothing.
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
- **Cell motion.** Each track interpolates its keyframes with the
  description's easing applied per keyframe segment, as a CSS animation's
  timing function is, holding its end values outside them. A flip
  (rotation with `flip: true`) shows `before` until halfway between its
  first and last keyframe and `after` from then on; without a flip a cell
  shows `after` throughout, and a property no track animates rests (depth
  `null`, the face's own). An animation past its duration leaves the
  player, so the cell shows `after`. A second `start` on an animating cell
  restarts it; a `null` description, or a new cell past the cap, starts
  nothing and drops the cell's running animation, so it shows its new
  state at once. `MOTION_CAP` is measured by `dev/measure-cell-motion.mjs`,
  a flood reveal on a 100 × 100 board, and the module's head comment holds
  the measurement and the rule that picks it.

## DOMAIN DEPENDENCIES

- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the states, the paint call, the cache and the minimum tile size.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the drawing styles, the board module the skin draws from, the hand-off,
  the cell motion player, the motion description and its vocabulary.

## CROSS-REFERENCES

- [app-shell-board-module.md](app-shell-board-module.md) — owns the board module's shape and
  checks and `js/shell/board-art.js`, which feeds `BOARD_ART`;
  [app-shell-themes.md](app-shell-themes.md) — the theme applier, `js/tokens.js` (`FALLBACK_COLOR`).
- [rendering.md](rendering.md) — the 3D tile atlas, drawn through the same
  `js/tile-art.js` in the module's 3D style.
- [classic2d-board-view.md](classic2d-board-view.md) — the view that owns a
  skin.
- [testing.md](testing.md) — `tests/tile-art.test.mjs` the drawing styles;
  `tests/tile-skin.test.mjs` the painter, cache, hand-off and
  `MIN_TILE_SIZE`; `tests/cell-motion.test.mjs` the cell motion player.

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
- Changing how motion is interpolated or capped (`js/cell-motion.js`);
  re-run `node dev/measure-cell-motion.mjs` before changing `MOTION_CAP`.
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and saved screenshots before changing a board module value or
  glyph geometry.
