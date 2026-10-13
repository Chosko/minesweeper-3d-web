# Rendering

## Overview

Draws the board with three.js: every cube comes from two instanced meshes sharing one cube
geometry, with per-cell state in a data texture and all visual effects in GLSL3 shaders. Also
draws the sky gradient with the ground grid below the board, the win confetti and the loss camera
shake.

- `js/render.js` — `BoardRenderer`: cube geometry, cell/sky/confetti shaders, opaque and
  transparent instance lists, back-to-front sort, end-of-game waves, selection glow.
- `js/textures.js` — procedural tile atlas: every tile drawn on a 2D canvas through the shared
  tile recipe (`js/tile-art.js`, [classic2d.md](classic2d.md)) with the atlas's own literal
  palette (`ATLAS`), and packed into one `THREE.DataArrayTexture` (one layer per tile).

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
- `BoardRenderer.sync({ seek } = {})` — once per frame: if `game.version` changed, consumes the dirty
  list, rewrites those cells, starts the win/loss effect on a `playing`→`won`/`lost` transition, drops
  every end-of-game effect at once (`_endEffects`) on a `won`/`lost`→`playing` one (a replay seeking
  back before its end), starts or drops "solved" pulses (below), rebuilds the opaque list. Returns
  `true` when anything changed. With `seek: true` (a 3D replay's seek) it first drops every running
  pulse and starts none for these changes.
- `BoardRenderer.snapshotBeforeAction()` — call right before a reveal action (left click / chord,
  not right click); copies `flagged`/`pressed` so a loss can show wrong flags and animate exactly.
  No-op unless `game.state === 'playing'`.
- `BoardRenderer.setWrongFlags(indices)` — marks extra cells to draw as crossed flags after a loss
  (no caller in the codebase; `_beginLoss` computes them itself).
- `BoardRenderer.setToggles(shift, space, ctrl)` — sets the Shift/Space/Ctrl uniforms; rebuilds the
  opaque list and re-sorts the transparent list when a toggle changed.
- `BoardRenderer.setSpacing(s)` — pitch = `4 * s` world units; marks the sort dirty.
- `BoardRenderer.setSelected(idx)` — aimed cell (`-1` = none); restarts the selection pulse on change.
- `BoardRenderer.setMark(idx)` — the marked start cell a pre-generated board waits for (`-1` = none):
  its closed or flagged cube is tinted green (`uMark`, `uHasMark`); returns whether it changed;
  `setGame` clears it. `mark` is the cell tinted.
- `BoardRenderer.boardRadius()` — bounding-sphere radius of the board at the current spacing (10
  without a game); used for far plane, fog and confetti size.
- `BoardRenderer.flash(cells)` — starts the flash of each cell (a flag click on a revealed number
  changed its flag); ignored unless `game.state === 'playing'`. `setGame`, `_endEffects` and the
  end of the game (in `sync`) drop running flashes.
- `BoardRenderer.isAnimating()` — `true` while the selection pulse, a "solved" pulse, a flash, a
  wave, confetti or shake needs frames; main's render-on-demand loop polls it.
- `BoardRenderer.setScenePalette({horizon, zenith, nadir})` — each stop `[r, g, b]` 0–255: sets the
  sky gradient's uniforms (`uSkyHorizon`, `uSkyZenith`, `uSkyNadir`, shared by the cube shader's fog
  and the sky shader) and the clear colour (the horizon); keeps a copy on `scenePalette`. The sky is
  black until the shell calls it; the caller requests the redraw.
- `BoardRenderer.setPixelRatio(pr)` — sets the drawing buffer's pixel ratio and resizes; returns
  `false` when it already had that ratio (main then skips the redraw).
- `BoardRenderer.resize()` — sizes to `window.innerWidth/innerHeight`, updates the aspect.
- `BoardRenderer.render()` — ticks effects, adjusts far plane and fog, re-sorts transparent cubes
  if needed, applies shake for this frame only, draws.
- Exported kind constants `K_CLOSED, K_FLAG, K_NUMBER, K_MINE, K_HIDDEN` (0..4); `GHOST_ALPHA`
  (0.25); the pulse constants `PULSE_GLOW_S`, `PULSE_FADE_S`, `PULSE_SCALE`, `PULSE_BRIGHT` and
  `pulseEnvelope(t)` → `{ scale, bright, alpha, done }`, a pure function of the seconds since the
  pulse started; the flash constants `FLASH_S`, `FLASH_BRIGHT`, `FLASH_ALPHA`, `FLASH_SCALE` and
  `flashEnvelope(t)`, in the same shape. Node imports the module only with `three` resolved to `vendor/three/` (the
  test's resolve hook).

`js/textures.js`:
- `TILE` (256 px), layer ids `L_CLOSED`, `L_FLAG`, `L_MINE`, `L_MINE_EXPLODED`, `L_NUM0` (number n
  → `L_NUM0 + n`, n = 0..26), `L_WRONG_FLAG`, `LAYERS` (32).
- `createTileTexture()` — builds the mipmapped `DataArrayTexture`; needs `document` (browser only).
- `drawLayer(ctx, layer)` — draws one layer on a `TILE`×`TILE` 2D context.
- `numberColor(n)`, `contrastRatio(a, b)`, `REVEALED_DARK` — number palette and the WCAG contrast
  check it is built against.

## Internal patterns

- **Game read contract.** `game` is the 3D state view (`js/engine/state-view-3d.js`,
  [engine.md](engine.md)). The renderer reads `game.n/X/Y/Z`, `flagged`, `pressed`, `number`,
  `unlinked`, `explodedIdx`, `state`, `version`, `coords(idx)`, `consumeDirty()`. It never mutates
  game state; it owns the only `consumeDirty()` consumer, so nothing else may call it.
- **State texture.** RGBA8, width `STATE_W` = 1024, texel = cell index. R = tile layer, G = kind,
  A = previous layer + 1 for cells whose tile changes during an end-of-game wave (0 = none).
  Selection and toggles touch only uniforms; no per-frame O(n) JS work.
- **Cell index order** is `i + X*(j + Y*k)`; the vertex shader decodes it the same way. Keep in
  step with the box graph provider (`js/engine/box-grid.js`).
- **Two passes, shader decides.** `uPass` 0 (opaque, depth write) keeps instances with alpha 1;
  pass 1 (transparent, no depth write) keeps alpha < 1. Lists may over-include; culled instances
  are moved off-screen. The alpha table in the vertex shader implements the spec's drawing rules,
  with the port's one change: a hidden cell under Ctrl is a ghost at `GHOST_ALPHA`, so it is drawn in
  the transparent pass (Shift's and Space's fades are unchanged).
- **Opaque list** skips hidden cells (unless they shrink in a loss wave without Ctrl), numbers
  under Space, and under Shift holds only mines, those shrinking hidden cells and the aimed cell's
  3×3×3 neighbourhood.
- **Transparent sort** is an O(n) counting sort on quantised L1 lattice distance to the camera
  (`SORT_BUCKETS` = 65536), farthest first — an exact painter's order for equal cubes on a
  lattice. It runs while Shift, Space or Ctrl is held and takes closed, flag and number cubes
  under Shift, numbers under Space and hidden cells under Ctrl. Re-sorts only when `_transDirty` or
  the camera moved.
- **"Solved" pulse.** When `sync` sees a cell go from a visible number (`K_NUMBER`) to hidden while
  the game was in play and not lost, it records the cell and its start in `_pulses` (a Map); a cell
  shown again leaves it, a loss (in `sync`, before `_beginLoss`) and a seek drop them all
  (`_dropPulses`). The pulse is visual only — the engine has already hidden the cell, so picking
  passes through it. A third
  instanced mesh (`meshPulse`, `renderOrder` 2, after the transparent pass, no depth write) draws
  the pulsing cubes with the `PULSE` define: the cell as the number it was under the current view
  modes, its scale, brightness and alpha from `pulseEnvelope` in the `aPulse` attribute.
  `_tickPulses` (each `render()`) visits only the pulsing cells: drops the finished ones, sorts the
  rest farthest first, writes the attributes; the mesh grows by powers of two. Under Ctrl the
  pulse fades out over the cell's ghost, which then remains.
- **Flash.** A flag click on a revealed number (its flag-all or its undo) flashes every cube it
  flagged or unflagged: `js/main.js` hands the cells to `flash`, which records each start in
  `_flashes` (a Map). A fourth instanced mesh (`renderOrder` 3, the `FLASH` define, depth test
  off) draws them as their tile now, under every view mode, brightened, grown and faded in and out
  by `flashEnvelope` over `FLASH_S`, so a cube behind the front face shows through the cubes in front.
  `_tickFlashes` visits only the flashing cells, as `_tickPulses` the pulsing ones; both effect
  meshes are built, grown and drawn farthest first by `_buildFx` / `_drawFx`. A hand flag does not
  flash, and a replay never calls `flash`.
- **Ground grid.** Drawn in the sky's fullscreen pass (`SKY_FRAG`'s `groundGrid`), so it lies behind
  every cube, writes no depth and is never picked: the view ray meets a horizontal plane
  `GROUND_GAP` (12) below the box's bottom at the current spacing; lines every power-of-two count of
  lattice pitches (growing with the box), antialiased with `fwidth` and faded out where they crowd,
  plus a faint fill, all fading toward the sky from 0.55 of the fade distance to it
  (`max(GROUND_FADE_MIN` 400`, 4 × (camera distance + board radius))`), which reads as a horizon. Its
  ink is the palette's horizon stop, darkened on a light sky and lightened on a dark one.
  `_placeGround` sets `uGround` / `uEye` each `render()`; off without a board. The view modes, the
  effects and the shake leave it as it is.
- **Visual-only tiles.** After a win, unflagged mines draw the flag tile; after a loss, flags on
  non-mines draw `L_WRONG_FLAG`. Neither changes game state.
- **Waves.** `uEff` 1 = win pulse, 2 = loss reveal; delay per cell of distance from an origin
  (exploded cell or aimed cell). Cells not yet reached show their A-channel old tile; hidden cells
  shrink away during a loss (`_effHidden` keeps them in the opaque list until the wave ends).
- **Geometry and UVs** are copied from `Cube.cs`; triangles are emitted as (v0, v2, v1) to flip
  XNA winding. Atlas rows are top-first and `flipY = false`, so v = 0 is the image top.
- **Colour space.** Tiles and state use `NoColorSpace`; shaders output raw sRGB.
- **Number colours** are darkened until ≥ 5:1 contrast against `REVEALED_DARK`.
- **Replay-driven camera.** A 3D replay draws through the same renderer: `js/main.js`'s
  `REPLAY_SCENE` hands it the replay's 3D state view with `setGame`, and each frame writes the
  recorded camera (a separate `FlyCamera` at `SPACING_START`) to `camera` and the recorded view mode
  through `setToggles`, and the recorded camera's aimed cell through `setSelected`
  ([app-shell.md](app-shell.md), [replay.md](replay.md)). Playback plays the "solved" pulses as play
  does; a seek reaches the renderer as `sync({ seek: true })` (when the frame loop calls it:
  [app-shell.md](app-shell.md) § Replay viewer), which drops every pulse and starts none, so a
  seek never leaves a pulsing cube. Otherwise the renderer cannot tell a replay from
  play; leaving the replay hands it back the game or demo board it drew before.
- **End of a 3D game.** The win or loss effect plays for the 3D mode's end delay
  (`END_DELAY_MS`, [mode3d.md](mode3d.md)), or until a press of the player's cuts it short, with the
  camera and the view-mode toggles frozen as the
  game ended; the results screen then takes over, and `js/main.js`'s `shouldRender` draws no frame
  while it shows a 3D game, so the scene, and an effect still running, stay paused behind it
  ([app-shell.md](app-shell.md)). The renderer is not told: it simply is not called.
- **Render resolution.** The pixel ratio is the player's 3D resolution setting
  ([settings.md](settings.md), where `pixelRatioFor` states Auto, Sharp and Fast):
  `js/main.js::applyPixelRatio` computes it for the board shown (game or menu demo) — Auto lowers it
  on big boards, which are fill/vertex heavy — and calls `setPixelRatio`, at each new board and
  whenever the setting changes. The renderer itself never reads the setting.
- **Themed sky, theme-independent cubes.** The sky gradient, the fog that fades toward it and the
  clear colour follow the theme: the shell (`js/shell/scene-palette.js`, wired in `js/main.js`)
  reads the `--color-scene-*` tokens and hands them to `setScenePalette` at start-up and on every
  theme change ([app-shell.md](app-shell.md)). The atlas tiles, number colours, selection outline
  and effects are the same under both themes; they live in `js/textures.js` and the shaders,
  separate from the tile and number tokens the Classic 2D tile skin draws with
  ([classic2d.md](classic2d.md)); neither feeds the other. The two share only the drawing:
  `js/tile-art.js` takes every colour as an argument and reads no token, so the atlas stays
  unthemed and pixel-identical to its own palette. The renderer never reads
  `css/tokens.css` and never subscribes to theme changes: `tests/tokens.test.mjs` and
  `tests/theme.test.mjs` check that it reads no token and subscribes to no theme change, and that
  its sky carries no constant colour.

## Domain dependencies

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — gameplay fidelity to the original is
  the overriding rule. This area enforces: *Drawing rules (per cell)* (tile per state, alpha 0.2
  under Shift/Space, Ctrl shows hidden cells — as 25 % ghosts, a "Web port:" note there —, the
  "solved" pulse before a number hides, back-to-front transparency); *Cube face orientation*
  (corners and UVs); *Grid & geometry* (cube edge 4, pitch `4*s`, background RGB(200,225,255) —
  the light theme's sky horizon, handed in by the shell — unlit textured cubes, centred grid).
- [../domain/INDEX.md](../domain/INDEX.md) — product and feature design for visual extras.

## Cross-references

- [engine.md](engine.md) — the 3D state view supplies the board arrays, `version`, dirty list and
  `coords()` this area reads.
- [app-shell.md](app-shell.md) — `js/main.js` owns the renderer: calls `sync`/`render` per frame,
  `snapshotBeforeAction` before reveals, polls `isAnimating`, sets the pixel ratio, exposes `stats`
  via `__ms`, drives it from a replay's recorded camera in the 3D replay viewer, and stops drawing
  while the results screen shows a 3D game.
- [replay.md](replay.md) — the 3D viewer whose state view and recorded camera the renderer draws.
- [settings.md](settings.md) — the render resolution setting and `pixelRatioFor`.
- [input.md](input.md) — camera and modifier state feed `camera`, `setToggles`, `setSpacing`,
  `setSelected`; picking must use the same pitch and Space/hidden visibility rules.
- [audio.md](audio.md) — no direct link; win/loss sounds fire alongside the waves from main.
- [classic2d.md](classic2d.md) — the Classic 2D tile skin, a separate themed palette from tokens,
  and the shared tile recipe `js/tile-art.js` the atlas draws through.
- [testing.md](testing.md) — `tests/render-3d-feedback.test.mjs` pins `GHOST_ALPHA`, the pulse
  envelope and, in a browser, the ghosts in `stats.trans`, the pulse's `isAnimating()` and its
  ends; static checks that the 3D scene stays unthemed; `tests/settings-appliers.test.mjs` pins
  `pixelRatioFor` and, in a browser, a resolution change applying at once;
  `tests/replay-viewer-3d.test.mjs` plays a 3D replay on the renderer in a browser, its pulses
  included, and checks that a seek drops them; `tests/mode3d-end.test.mjs` checks that no frame is drawn under a 3D game's results
  screen; verification is visual via Playwright.

## When to read the source

- Changing what a cell looks like or its alpha under Shift/Space/Ctrl (vertex shader `VERT`,
  `_writeCell`, `_rebuildOpaque`, `_applyShiftOpaque`, `_updateTransparent` must stay in step).
- Tuning or changing the "solved" pulse (`pulseEnvelope` and its constants, `sync`, `_tickPulses`,
  `_dropPulses`, the `PULSE` branch of `VERT`).
- Adding a tile (new layer in `js/textures.js`, bump `LAYERS`, map it in `_writeCell`).
- Changing how an atlas tile is drawn: the geometry is `js/tile-art.js`, shared with the Classic 2D
  tiles, and every atlas layer is pinned pixel for pixel by `tests/tile-skin.test.mjs`; the
  colours are `ATLAS` in `js/textures.js`.
- Tuning win/loss waves, confetti, shake, fog, sky, ground grid or selection glow (`_beginWin`,
  `_beginLoss`, `_waveSetup`, `_tickEffects`, `render`, `_placeGround`, shader constants).
- Debugging transparency artefacts or sort cost (`_updateTransparent`).
- Changing cell indexing, board dimensions limits (state texture height) or spacing math.
- Fixing mirrored or rotated numbers on a face (`createCubeGeometry`).
