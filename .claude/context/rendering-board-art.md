# Rendering — board art

## Overview

What the 3D renderer takes from the active theme's board module, which the shell hands in: the
tile atlas, the sky, fog and clear colour, the selection's outline, glow line and face tint, the
marked-cell tint, the confetti colours and the cell motion descriptions. The renderer's core —
instancing, the state texture, the passes and the sort — is [rendering.md](rendering.md); the
time-driven extras are [rendering-effects.md](rendering-effects.md).

| File | Responsibility |
| --- | --- |
| `js/textures.js` | procedural tile atlas: every tile drawn on a 2D canvas through the shared tile recipe (`js/tile-art.js`, [classic2d-tile-skin.md](classic2d-tile-skin.md)) in the board module's 3D style from its 3D palette, numbers and number font, packed into one `THREE.DataArrayTexture` (one layer per tile); it holds no colour of its own |
| `js/render.js` | `BoardRenderer`'s board module hand-off (`setBoard`) and its pure derivations |

## Public API

`js/render.js`:
- Board art: `setBoard(board)` — a theme's board module: rebuilds the atlas from it, sets the sky,
  fog and clear colour, the selection, the marked-cell tint and the confetti colours, and drops any
  running cell motion; the same module again changes nothing; the caller requests the redraw.
  The `board` field holds it (null until the first) and `scenePalette` its sky as `{horizon, zenith,
  nadir, fog}` 0–255 channels. `selectionUniforms(board)` → `{outline, width, glow, glowWidth,
  tint}` and `confettiColours(board, count)` are the pure derivations it uses.

`js/textures.js`:
- `TILE`; layers `L_CLOSED`, `L_FLAG`, `L_MINE`, `L_MINE_EXPLODED`, `L_NUM0` (number n →
  `L_NUM0 + n`, n = 0..26), `L_WRONG_FLAG`, `L_SUNK` (the closed face fully pressed in, which a depth
  motion blends toward, after every other layer), `LAYERS`.
- `createTileTexture(board)` (browser only), `drawLayer(ctx, layer, board)`, `atlasTexture(data?)`
  (the texture over a layer buffer, all transparent when omitted — the atlas until a module
  arrives).

## Internal patterns

- **Colour.** Tiles and state use `NoColorSpace`; shaders output raw sRGB. Number colours are the
  board module's 3D list, which the board conformance checks hold to 4.5:1 against every point of
  the 3D revealed face ([app-shell-board-module.md](app-shell-board-module.md)).
- **Drawn from the board module.** The shell (`js/shell/scene-palette.js`) calls `setBoard` with the
  active theme's board module at start-up and on every theme change, once its number font has
  loaded ([app-shell-board-module.md](app-shell-board-module.md)); until then the atlas is transparent and the sky
  black. From the module come: the atlas, every layer drawn through `js/tile-art.js` in `style3d`
  from `palette.faces3d` (a bevel side a shade or an exact colour), the flag, mine and cross,
  `numbers3d` and the number font — the slope
  painted into the texture, so it reads lit from the same corner on every face, top faces included;
  the sky gradient's horizon, zenith and nadir from `sky`, the fog toward `sky.fog` (the horizon
  when absent) and the clear colour the horizon, the ground grid's ink still derived from the
  horizon ([rendering-effects.md](rendering-effects.md)); the selection — the outline in
  `selection.outline` at the larger of `width.face` of the face and `width.px` screen pixels, a
  `glowWidth`-pixel line of `selection.glow` inside it pulsing with `uSelGlow`, and the selected
  face's colour multiplied by `selection.tint` (`uSelOutline`, `uSelWidth`, `uSelGlowColor`,
  `uSelGlowWidth`, `uSelTint`); the marked start cell's tint `mark.tint` mixed in at `mark.mix`,
  `mark.pulseMix` at its pulse's peak; the confetti colours `palette.confetti`, cycled over the
  pieces; and the cell motion descriptions. A theme change rebuilds all of it with no change to the
  game. The renderer holds no colour of its own for any of these, never reads a token, imports a
  theme or subscribes to theme changes (`tests/theme.test.mjs`, `tests/tokens.test.mjs`,
  `tests/render-3d-selection.test.mjs`). The Classic 2D tile skin draws through the same recipe from
  the same module's 2D half ([classic2d-tile-skin.md](classic2d-tile-skin.md)).

## Domain dependencies

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the atlas, sky, selection and confetti from the board module.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — *Grid & geometry*'s background
  RGB(200,225,255), which the web port replaces with the theme's sky.

## Cross-references

- [rendering.md](rendering.md) — the renderer the atlas and uniforms feed, and the state texture's
  tile layer.
- [rendering-effects.md](rendering-effects.md) — cell motion and confetti, which use the module's
  descriptions and colours.
- [app-shell-board-module.md](app-shell-board-module.md) — the board module's shape and checks, and the scene's
  hand-off `js/shell/scene-palette.js`.
- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the Classic 2D tile skin and the shared tile recipe.
- [testing.md](testing.md) — `tests/render-3d-feedback.test.mjs` (the atlas's layers and *Joyful
  tiles*' sampled atlas, selection and confetti, a theme switch in a 3D game),
  `tests/render-3d-selection.test.mjs` (the selection uniforms and confetti colours from the
  module), `tests/tile-art.test.mjs` (the drawing styles).

## When to read the source

- Adding a tile (new layer in `js/textures.js` before `L_SUNK`'s place at the end, bump `LAYERS`,
  map it in `_writeCell`).
- Changing how an atlas tile is drawn: the geometry is `js/tile-art.js`, shared with the Classic 2D
  tiles and pinned by `tests/tile-art.test.mjs`; the colours and style are the theme's board module
  (`drawLayer`).
- Changing what the renderer takes from a board module (`setBoard`, `selectionUniforms`,
  `confettiColours`, the selection branch of `FRAG`).
