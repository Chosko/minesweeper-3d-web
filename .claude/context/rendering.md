# Rendering

## Overview

Draws the board with three.js: every cube comes from two instanced meshes sharing one cube
geometry, with per-cell state in a data texture and all visual effects in GLSL3 shaders. Also
draws the sky gradient, the win confetti and the loss camera shake.

- `js/render.js` — `BoardRenderer`: cube geometry, cell/sky/confetti shaders, opaque and
  transparent instance lists, back-to-front sort, end-of-game waves, selection glow.
- `js/textures.js` — procedural tile atlas: every tile drawn on a 2D canvas and packed into one
  `THREE.DataArrayTexture` (one layer per tile).

## Public API

`js/render.js` (only `js/main.js` calls it):
- `js/render.js::BoardRenderer(canvas)` — creates the `WebGLRenderer`, scene, `PerspectiveCamera`
  (fov 45, rotation order `YXZ`), tile atlas, sky and confetti. Public fields read elsewhere:
  `renderer` (the three.js renderer), `camera` (main writes its pose),
  `toggles` `{shift, space, ctrl}`, `stats` `{opaque, trans, sortMs}` (exposed via `__ms`).
- `BoardRenderer.setGame(game)` — disposes the previous board, allocates state texture, instance
  lists and sort scratch for `game.n` cells, writes every cell, calls `game.consumeDirty()`, resets
  effects and selection.
- `BoardRenderer.disposeGame()` — removes and disposes the board meshes and state texture.
- `BoardRenderer.sync()` — once per frame: if `game.version` changed, consumes the dirty list,
  rewrites those cells, starts the win/loss effect on a `playing`→`won`/`lost` transition, rebuilds
  the opaque list. Returns `true` when anything changed.
- `BoardRenderer.snapshotBeforeAction()` — call right before a reveal action (left click / chord,
  not right click); copies `flagged`/`pressed` so a loss can show wrong flags and animate exactly.
  No-op unless `game.state === 'playing'`.
- `BoardRenderer.setWrongFlags(indices)` — marks extra cells to draw as crossed flags after a loss
  (no caller in the codebase; `_beginLoss` computes them itself).
- `BoardRenderer.setToggles(shift, space, ctrl)` — sets the Shift/Space/Ctrl uniforms; rebuilds the
  opaque list when a toggle changed, re-sorts the transparent list when Shift or Space changed.
- `BoardRenderer.setSpacing(s)` — pitch = `4 * s` world units; marks the sort dirty.
- `BoardRenderer.setSelected(idx)` — aimed cell (`-1` = none); restarts the selection pulse on change.
- `BoardRenderer.boardRadius()` — bounding-sphere radius of the board at the current spacing (10
  without a game); used for far plane, fog and confetti size.
- `BoardRenderer.isAnimating()` — `true` while the selection pulse, a wave, confetti or shake needs
  frames; main's render-on-demand loop polls it.
- `BoardRenderer.setPixelRatio(pr)` — sets the drawing buffer's pixel ratio and resizes; returns
  `false` when it already had that ratio (main then skips the redraw).
- `BoardRenderer.resize()` — sizes to `window.innerWidth/innerHeight`, updates the aspect.
- `BoardRenderer.render()` — ticks effects, adjusts far plane and fog, re-sorts transparent cubes
  if needed, applies shake for this frame only, draws.
- Exported kind constants `K_CLOSED, K_FLAG, K_NUMBER, K_MINE, K_HIDDEN` (0..4).

`js/textures.js`:
- `TILE` (256 px), layer ids `L_CLOSED`, `L_FLAG`, `L_MINE`, `L_MINE_EXPLODED`, `L_NUM0` (number n
  → `L_NUM0 + n`, n = 0..26), `L_WRONG_FLAG`, `LAYERS` (32).
- `createTileTexture()` — builds the mipmapped `DataArrayTexture`; needs `document` (browser only).
- `drawLayer(ctx, layer)` — draws one layer on a `TILE`×`TILE` 2D context.
- `numberColor(n)`, `contrastRatio(a, b)`, `REVEALED_DARK` — number palette and the WCAG contrast
  check it is built against.

## Internal patterns

- **Game read contract.** The renderer reads `game.n/X/Y/Z`, `flagged`, `pressed`, `number`,
  `unlinked`, `explodedIdx`, `state`, `version`, `coords(idx)`, `consumeDirty()`. It never mutates
  game state; it owns the only `consumeDirty()` consumer, so nothing else may call it.
- **State texture.** RGBA8, width `STATE_W` = 1024, texel = cell index. R = tile layer, G = kind,
  A = previous layer + 1 for cells whose tile changes during an end-of-game wave (0 = none).
  Selection and toggles touch only uniforms; no per-frame O(n) JS work.
- **Cell index order** is `i + X*(j + Y*k)`; the vertex shader decodes it the same way. Keep in
  step with `js/logic.js`.
- **Two passes, shader decides.** `uPass` 0 (opaque, depth write) keeps instances with alpha 1;
  pass 1 (transparent, no depth write) keeps alpha < 1. Lists may over-include; culled instances
  are moved off-screen. The alpha table in the vertex shader implements the spec's drawing rules.
- **Opaque list** skips hidden cells (unless Ctrl or a loss wave), numbers under Space, and under
  Shift holds only mines, hidden-with-Ctrl and the aimed cell's 3×3×3 neighbourhood.
- **Transparent sort** is an O(n) counting sort on quantised L1 lattice distance to the camera
  (`SORT_BUCKETS` = 65536), farthest first — an exact painter's order for equal cubes on a
  lattice. Re-sorts only when `_transDirty` or the camera moved.
- **Visual-only tiles.** After a win, unflagged mines draw the flag tile; after a loss, flags on
  non-mines draw `L_WRONG_FLAG`. Neither changes game state.
- **Waves.** `uEff` 1 = win pulse, 2 = loss reveal; delay per cell of distance from an origin
  (exploded cell or aimed cell). Cells not yet reached show their A-channel old tile; hidden cells
  shrink away during a loss (`_effHidden` keeps them in the opaque list until the wave ends).
- **Geometry and UVs** are copied from `Cube.cs`; triangles are emitted as (v0, v2, v1) to flip
  XNA winding. Atlas rows are top-first and `flipY = false`, so v = 0 is the image top.
- **Colour space.** Tiles and state use `NoColorSpace`; shaders output raw sRGB.
- **Number colours** are darkened until ≥ 5:1 contrast against `REVEALED_DARK`.
- **Render resolution.** The pixel ratio is the player's 3D resolution setting
  ([settings.md](settings.md), where `pixelRatioFor` states Auto, Sharp and Fast):
  `js/main.js::applyPixelRatio` computes it for the board shown (game or menu demo) — Auto lowers it
  on big boards, which are fill/vertex heavy — and calls `setPixelRatio`, at each new board and
  whenever the setting changes. The renderer itself never reads the setting.
- **Not themed.** The 3D palette — the atlas tiles, number colours, sky and effects — is the same
  under the light and the dark theme. It lives in `js/textures.js` and the shaders, never reads
  `css/tokens.css` and never subscribes to theme changes; it is separate from the tile and number
  tokens the Classic 2D tile skin draws with ([classic2d.md](classic2d.md)); neither feeds the
  other. `tests/tokens.test.mjs` and `tests/theme.test.mjs` check
  that the 3D scene reads no token and subscribes to no theme change.

## Domain dependencies

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — gameplay fidelity to the original is
  the overriding rule. This area enforces: *Drawing rules (per cell)* (tile per state, alpha 0.2
  under Shift/Space, Ctrl shows hidden cells, back-to-front transparency); *Cube face orientation*
  (corners and UVs); *Grid & geometry* (cube edge 4, pitch `4*s`, background RGB(200,225,255),
  unlit textured cubes, centred grid).
- [../domain/INDEX.md](../domain/INDEX.md) — product and feature design for visual extras.

## Cross-references

- [logic.md](logic.md) — supplies the board arrays, `version`, dirty list and `coords()` this area reads.
- [app-shell.md](app-shell.md) — `js/main.js` owns the renderer: calls `sync`/`render` per frame,
  `snapshotBeforeAction` before reveals, polls `isAnimating`, sets the pixel ratio, exposes `stats`
  via `__ms`.
- [settings.md](settings.md) — the render resolution setting and `pixelRatioFor`.
- [input.md](input.md) — camera and modifier state feed `camera`, `setToggles`, `setSpacing`,
  `setSelected`; picking must use the same pitch and Space/hidden visibility rules.
- [audio.md](audio.md) — no direct link; win/loss sounds fire alongside the waves from main.
- [classic2d.md](classic2d.md) — the Classic 2D tile skin, a separate themed palette from tokens.
- [testing.md](testing.md) — no unit tests cover the drawing, only static checks that the 3D scene stays
  unthemed; `tests/settings-appliers.test.mjs` pins `pixelRatioFor` and, in a browser, a resolution
  change applying at once; verification is visual via Playwright.

## When to read the source

- Changing what a cell looks like or its alpha under Shift/Space/Ctrl (vertex shader `VERT`,
  `_writeCell`, `_rebuildOpaque`, `_applyShiftOpaque`, `_updateTransparent` must stay in step).
- Adding a tile (new layer in `js/textures.js`, bump `LAYERS`, map it in `_writeCell`).
- Tuning win/loss waves, confetti, shake, fog, sky or selection glow (`_beginWin`, `_beginLoss`,
  `_waveSetup`, `_tickEffects`, `render`, shader constants).
- Debugging transparency artefacts or sort cost (`_updateTransparent`).
- Changing cell indexing, board dimensions limits (state texture height) or spacing math.
- Fixing mirrored or rotated numbers on a face (`createCubeGeometry`).
