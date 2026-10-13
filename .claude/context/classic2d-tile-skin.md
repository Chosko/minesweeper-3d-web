# Classic 2D — square tile skin

## OVERVIEW

How a Classic 2D tile looks. The area overview is
[classic2d.md](classic2d.md).

- `js/classic2d/tile-skin.js` — the stateless tile painter, the tile cache
  that pre-renders every state and number, and the shared minimum tile
  size. It holds no palette: every colour is a tile or number token from
  `css/tokens.css` read through `js/tokens.js`
  ([app-shell-kit.md](app-shell-kit.md)). DOM-free at import.
- `js/tile-art.js` — the shared tile recipe, the cube face of the 3D atlas
  ([rendering.md](rendering.md)) at any size: raised, sunken and revealed
  faces, the number, mine and flag glyphs and the wrong-flag cross, every
  colour an argument. It imports nothing and touches no DOM.

## PUBLIC API

`js/classic2d/tile-skin.js`
- `MIN_TILE_SIZE` (26) — the floor a board shrinks to before it scrolls,
  shared by the skin and the view.
- `TILE_STATES` — `closed`, `pressed`, `revealed`, `flagged`, `mine`,
  `exploded`, `wrong-flag`: the engine's cell states
  ([engine.md](engine.md), `CELL`) plus `pressed`.
- `paintTile(ctx, x, y, size, state, number)` — one tile at `x, y`, `size`
  CSS pixels, through the token reader; `number` (0–8) matters only for
  `revealed`. `paintTileWith(token, ...)` — the same with an injected
  `token(name)`.
- `createTileSkin({token, onThemeChange, currentTheme, createCanvas,
  redraw})` → `{paintTile, drawTile(ctx, x, y, size, state, number,
  pixelRatio = 1), invalidate, cacheKey, dispose}` — one skin per board
  view; every option defaults to the browser one; `redraw` is the view's
  full repaint.

## INTERNAL PATTERNS

- **Painter.** Each state is the 3D atlas's cube face drawn through
  `js/tile-art.js` with tokens: closed and flagged the raised face, pressed
  the face sunk in, revealed / mine / wrong flag the revealed face,
  exploded its variant; numbers are the 3D glyph in `--color-number-<n>`,
  zero none. Closed and revealed differ by relief and border, not colour
  alone. The painter passes the recipe one device pixel (from the context's
  scale), so every rim, border and bevel band is whole device pixels.
- **Placeholder.** An unknown state, or a number outside 0–8, paints
  `FALLBACK_COLOR` with a black cross — visibly wrong on purpose.
- **Tile cache.** `drawTile` keys the cache on `size|pixelRatio|theme`; on a
  key change it rebuilds every image (each state, `revealed-0`…`-8`, the
  placeholder) on offscreen canvases of `round(size × ratio)` device
  pixels, then every draw is one `drawImage`.
- **Invalidation.** Size and ratio changes go through the key. A theme
  change arrives through the token reader's `onThemeChange`: the skin
  records it, drops the cache and calls `redraw`. `dispose()` unsubscribes.
- **`MIN_TILE_SIZE`** is 26 px, the readable floor of decision 10 in
  `docs/UX_REVIEW.md`: Expert (30 × 16) fits, in the framed panel with
  16 px window margins, any window 1024 px wide from 520 px tall, and plays
  at 32 px at 1024 × 768. Every state is legible at it in both themes (the
  browser test in `tests/tile-skin.test.mjs`).
- **No second palette.** Neither the skin nor the recipe holds a literal
  colour; a new tile colour is a token in `css/tokens.css` with a dark
  value, held to the contrast contract by `tests/tokens.test.mjs`, its
  light value the 3D atlas's own where the atlas has one. The recipe stays
  token-free, so the 3D atlas draws through it unthemed.

## DOMAIN DEPENDENCIES

- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the states, the drawing contract, the cache and its invalidation, the
  contrast contract and the minimum tile size.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the tile and number tokens, the token reader and theme changes.

## CROSS-REFERENCES

- [app-shell-kit.md](app-shell-kit.md) — owns `css/tokens.css`, `js/tokens.js`
  (`token`, `onThemeChange`, `FALLBACK_COLOR`) and `js/theme.js`
  (`msTheme.current()`).
- [rendering.md](rendering.md) — the 3D tile atlas, drawn through the same
  `js/tile-art.js` with its own palette.
- [classic2d-board-view.md](classic2d-board-view.md) — the view that owns a
  skin.
- [testing.md](testing.md) — `tests/tile-skin.test.mjs` the painter, cache
  and `MIN_TILE_SIZE`; `tests/tokens.test.mjs` the tile tokens.

## WHEN TO READ THE SOURCE

- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`); a change to `js/tile-art.js` changes the 3D atlas
  too, which `tests/tile-skin.test.mjs` pins pixel for pixel.
- Changing the cache key or what invalidates it (`drawTile`, the
  `onThemeChange` subscription).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and saved screenshots before changing a token or glyph geometry.
