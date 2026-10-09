# Classic 2D — square tile skin

## OVERVIEW

The Canvas 2D side of Classic 2D, independent of three.js. Only the tile
skin exists: how a square tile looks in every state and how the numbers 1–8
are coloured, in both themes. The board renderer that lays out the board,
hit-tests and calls the skin per tile is not built yet; when it lands it
owns layout and input, and the skin keeps appearance only.

- `js/classic2d/tile-skin.js` — the stateless tile painter, the tile cache
  that pre-renders every state and number, and the shared minimum tile size.
  It holds no palette: every colour is a tile or number token from
  `css/tokens.css` read through the token reader `js/tokens.js`
  ([app-shell.md](app-shell.md)). DOM-free at import.

## PUBLIC API

`js/classic2d/tile-skin.js` exports
- `MIN_TILE_SIZE` (41) — the smallest tile size the Classic 2D renderer
  allows, shared by the skin and the renderer.
- `TILE_STATES` — `closed`, `pressed`, `revealed`, `flagged`, `mine`,
  `exploded`, `wrong-flag`: the rules engine's cell states
  ([engine.md](engine.md), `CELL`) plus `pressed`, the renderer's feedback
  under a held click or chord.
- `paintTile(ctx, x, y, size, state, number)` — paints one tile at `x, y`,
  `size` CSS pixels on a Canvas 2D context, reading tokens through the
  token reader; `number` (0–8) matters only for `revealed`.
- `paintTileWith(token, ctx, x, y, size, state, number)` — the same with an
  injected `token(name)` function.
- `createTileSkin({token, onThemeChange, currentTheme, createCanvas, redraw})`
  → `{paintTile, drawTile(ctx, x, y, size, state, number, pixelRatio = 1),
  invalidate, cacheKey, dispose}` — one skin per renderer. Every option
  defaults to the browser one (token reader, `globalThis.msTheme.current()`,
  `OffscreenCanvas` or a `<canvas>`); `redraw` is the renderer's callback.

## INTERNAL PATTERNS

- **Painter.** Each state is a flat fill plus at most a simple edge and a
  plain glyph — no gradients, shadows or patterns. Closed and flagged tiles
  carry an edge (`--color-tile-edge`, width `max(2, round(size / 12))`), so
  closed and revealed differ by more than colour. A revealed number is its
  digit in `--color-number-<n>`; zero draws no glyph. Tokens used:
  `--color-tile-{closed,edge,pressed,revealed,flagged,flag,mine,mine-glyph,
  exploded,wrong-flag,wrong-flag-mark}` and `--color-number-1`…`-8`.
- **Placeholder.** An unknown state, or a revealed number outside 0–8,
  paints `FALLBACK_COLOR` with a black cross — visibly wrong on purpose,
  never blank.
- **Tile cache.** `drawTile` keys the cache on `size|pixelRatio|theme`; on a
  key change it rebuilds every image — each state, `revealed-0`…`revealed-8`
  and the placeholder — on offscreen canvases of `round(size × ratio)`
  device pixels, then every draw is one `drawImage` copy.
- **Invalidation.** A tile-size or pixel-ratio change rebuilds on the next
  `drawTile` through the key. A theme change arrives through the token
  reader's `onThemeChange`: the skin records the new theme, drops the cache
  and calls `redraw`. `invalidate()` drops it by hand; `dispose()`
  unsubscribes and drops it.
- **`MIN_TILE_SIZE`** is the tile an Expert board (30 × 16) gets fitted
  below the in-game overlay bar with 16 px (`--space-4`) between the window
  edges, the bar and the board — 41 px in a 1366×768 window and in a
  1280×800 window standing in for the Steam Deck. Every state and number is
  legible at it in both themes (the browser test in
  `tests/tile-skin.test.mjs`). A new board size or bar height that shrinks
  the Expert tile changes it.
- **No second palette.** The module holds no literal colour; a new tile
  colour is a token in `css/tokens.css` with a dark value, held to the
  contrast contract by `tests/tokens.test.mjs`.

## DOMAIN DEPENDENCIES

- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the states, the drawing contract, the cache and its invalidation, the
  contrast contract and the minimum tile size.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the tile and number tokens, the token reader and the theme-change
  notification.

## CROSS-REFERENCES

- [app-shell.md](app-shell.md) — owns `css/tokens.css` (the tile and number
  tokens), `js/tokens.js` (`token`, `onThemeChange`, `FALLBACK_COLOR`) and
  `js/theme.js` (`msTheme.current()`).
- [engine.md](engine.md) — the cell-state vocabulary the tile states mirror.
- [rendering.md](rendering.md) — the 3D tile atlas, a separate palette the
  skin neither reads nor feeds.
- [testing.md](testing.md) — `tests/tile-skin.test.mjs` pins the painter,
  the cache and `MIN_TILE_SIZE`; `tests/tokens.test.mjs` the tile tokens.

## WHEN TO READ THE SOURCE

- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`, which the cache builds from).
- Changing the cache key or what invalidates it (`drawTile`, the
  `onThemeChange` subscription).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and the screenshots it saved before changing a token or the glyph
  geometry.
