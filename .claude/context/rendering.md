# Rendering

## Overview

Draws the 3D board with three.js: every cube comes from instanced meshes sharing one cube geometry,
with per-cell state in a data texture and all visual effects in GLSL3 shaders. Also draws the sky
gradient with the ground grid below the board. Everything it draws in colour comes from the active
theme's board module, which the shell hands in. The time-driven extras — cell motion (the "solved"
pulse among its events), flash, end-of-game waves, confetti, shake, ground grid — and the replay and
end-of-game behaviour are in [rendering-effects.md](rendering-effects.md). `js/render.js`'s head
comment lists its passes.

| File | Responsibility |
| --- | --- |
| `js/render.js` | `BoardRenderer`: cube geometry, cell/sky/confetti shaders, opaque and transparent instance lists, back-to-front sort, the board module hand-off (`setBoard`), effects and cell motion, the selection, the target rectangle it draws into |
| `js/textures.js` | procedural tile atlas: every tile drawn on a 2D canvas through the shared tile recipe (`js/tile-art.js`, [classic2d-tile-skin.md](classic2d-tile-skin.md)) in the board module's 3D style from its 3D palette, numbers and number font, packed into one `THREE.DataArrayTexture` (one layer per tile); it holds no colour of its own |
| `js/readability.js` | the 3D readability aids' pure functions: the aimed-cell readout ([app-shell-3d-play.md](app-shell-3d-play.md)) and, read here, Space's depth dimming — `spaceAlpha(d)` (`SPACE_NEAR_ALPHA` 0.7, `SPACE_FLOOR_ALPHA` 0.1, `SPACE_FALLOFF` 3, interpolated into `VERT`) and `boxDepth(cam, box)`, the camera's lattice distance from the box's nearest face |

## Public API

`js/render.js` (only `js/main.js` calls it):
- `BoardRenderer(canvas)` — renderer, scene, `PerspectiveCamera` (order `YXZ`; its `fov` owned by the field
  of view setting's applier, [settings.md](settings.md)), atlas, sky,
  confetti. Fields read elsewhere: `renderer`, `camera` (main writes its pose), `toggles`
  `{shift, space, ctrl}`, `stats` `{opaque, trans, sortMs}` (exposed via `__ms`).
- Board: `setGame(game)` (allocates for `game.n` cells, drains the dirty list, resets effects,
  selection and mark), `disposeGame()`, `sync({ seek } = {})` once per frame (→ `true` when
  anything changed; effects on state transitions: [rendering-effects.md](rendering-effects.md)),
  `render()`.
- View: `setToggles(shift, space, ctrl)`, `setSpacing(s)` (pitch `4 * s`), `setSelected(idx)`,
  `setMark(idx)` (the marked start cell a pre-generated board waits for, or a daily's or a
  challenge's forced start cell, or the cell a Learn 3D prompt points at, revealed number
  included, tinted green; → whether it changed), `pulseMark()` (the tint swells
  `MARK_PULSE_COUNT` times over `MARK_PULSE_S` through `uMarkPulse`, kept animating by
  `isAnimating()`; → whether there is a mark), `boardRadius()` (far plane, fog, confetti size),
  `setPixelRatio(pr)` (→ `false` when unchanged; main then skips the redraw), `resize()`.
- Board art: `setBoard(board)` — a theme's board module: rebuilds the atlas from it, sets the sky,
  fog and clear colour, the selection, the marked-cell tint and the confetti colours, and drops any
  running cell motion; the same module again changes nothing; the caller requests the redraw.
  The `board` field holds it (null until the first) and `scenePalette` its sky as `{horizon, zenith,
  nadir, fog}` 0–255 channels. `selectionUniforms(board)` → `{outline, width, glow, glowWidth,
  tint}` and `confettiColours(board, count)` are the pure derivations it uses.
- Target rectangle: `setTarget(rect | null)` — `{x, y, width, height}` in CSS pixels from the
  window's top left, the rectangle a screen's scene panel gives, or null for the full window
  (→ `false` when unchanged; the caller redraws); `target` reads it back (a copy, or null).
- Effects: `snapshotBeforeAction()` (before a reveal or chord, so a loss can show wrong flags),
  `flash(cells)`, `dropMotion()`, `isAnimating()` (main's render-on-demand loop polls it),
  `wrongFlags()` / `setWrongFlags(indices)` (the loss's crossed flags, kept and given back across the
  replay viewer); cell motion's API is [rendering-effects.md](rendering-effects.md).
- Replay: `setRegionTint(rgba | null)` — Show 3BV's per-cell tint, 4 bytes a cell (colour, then how
  much covers the tile) in a second RGBA8 data texture the fragment shader mixes in (`uRegion`,
  `uRegionOn`); the caller redraws. `cellScreen(idx)` → `{x, y}` the cell centre in canvas CSS
  pixels through the camera as it is, or null behind it (the replay's press rings).
- Constants: kinds `K_CLOSED, K_FLAG, K_NUMBER, K_MINE, K_HIDDEN` (0..4), `GHOST_ALPHA` (0.25),
  `FLY_THROUGH_ALPHA` (0.25), `FLY_THROUGH_BAND` (half a pitch at the start spacing, 2.2) and
  `flyThroughAlpha(dist)` (the shader's `flyAlpha`; the distance is `FLY_THROUGH_DIST`, [input-camera.md](input-camera.md)),
  the flash constants ([rendering-effects.md](rendering-effects.md)).
  Node imports the module only with `three` resolved to `vendor/three/` (the test's resolve hook).

`js/textures.js`:
- `TILE`; layers `L_CLOSED`, `L_FLAG`, `L_MINE`, `L_MINE_EXPLODED`, `L_NUM0` (number n →
  `L_NUM0 + n`, n = 0..26), `L_WRONG_FLAG`, `L_SUNK` (the closed face fully pressed in, which a depth
  motion blends toward, after every other layer), `LAYERS`.
- `createTileTexture(board)` (browser only), `drawLayer(ctx, layer, board)`, `atlasTexture(data?)`
  (the texture over a layer buffer, all transparent when omitted — the atlas until a module
  arrives).

## Internal patterns

- **Game read contract.** `game` is the 3D state view ([engine-3d.md](engine-3d.md)). The renderer
  reads `n/X/Y/Z`, `flagged`, `pressed`, `number`, `unlinked`, `explodedIdx`, `state`, `version`,
  `coords(idx)`, `consumeDirty()`. It never mutates game state and is the only `consumeDirty()`
  consumer.
- **State texture.** RGBA8, width `STATE_W`, texel = cell index. R = tile layer, G = kind,
  B = 255 while the cell animates (the motion pass draws it; every other pass skips it),
  A = previous layer + 1 for cells whose tile changes during an end-of-game wave (0 = none).
  Selection and toggles touch only uniforms; no per-frame O(n) JS work.
- **Cell index order** is `i + X*(j + Y*k)`; the vertex shader decodes it the same way. Keep in
  step with the box graph provider (`js/engine/box-grid.js`).
- **Passes, shader decides.** `uPass` 0 (opaque, depth write) keeps instances with alpha 1; pass 1
  (transparent, no depth write) keeps alpha < 1. Lists may over-include; culled instances move
  off-screen. The vertex shader's alpha table implements the spec's drawing rules with the port's
  changes: a hidden cell under Ctrl is a ghost at `GHOST_ALPHA` (transparent pass), and a number
  under Space takes `spaceAlpha(depth)` instead of 0.2 — 0.7 at the box's nearest face (about 0.61
  on the front layer, whose cube centres sit half a cell in) to a 0.1 floor, `depth` from
  `uBoxDepth`, which `render()` sets from `boxDepth` each frame. Last, every cube takes the lower of
  its alpha and `flyAlpha` (fly through glass): `FLY_THROUGH_ALPHA` within `FLY_THROUGH_DIST` of
  `cameraPosition`, ramping back to 1 over `FLY_THROUGH_BAND` — whatever its kind and view mode; the
  flash pass keeps its own alpha.
- **Back pass under Shift.** With Shift held and a cell aimed (`emphOn`), the faded cubes outside
  the aimed 3×3×3 neighbourhood draw in `uPass` 2 (`meshTransBack`, `renderOrder` -1) before the
  opaque pass, and pass 1 keeps only the neighbourhood's transparent cubes, so the neighbourhood
  always draws over the faded cubes. `matTransBack` is not marked transparent (three.js draws every
  transparent material after every opaque one) and blends by hand with `CustomBlending`, alpha
  factors `One` / `OneMinusSrcAlpha`, so the canvas stays opaque — blending alpha like the colour
  leaves it see-through and the page behind washes the scene out white.
- **Opaque list** skips hidden cells (unless they shrink in a loss wave without Ctrl), numbers
  under Space, and under Shift holds only mines, those shrinking hidden cells and the aimed cell's
  3×3×3 neighbourhood.
- **Transparent sort** is an O(n) counting sort on quantised L1 lattice distance to the camera
  (`SORT_BUCKETS` = 65536), farthest first — an exact painter's order for equal cubes on a lattice.
  It runs while Shift, Space or Ctrl is held (closed, flag and number cubes under Shift, numbers
  under Space, hidden cells under Ctrl, and every drawn cube within the fade band). With none held,
  `_nearCells` builds the list from the lattice cells around the camera only — the cubes within
  `FLY_THROUGH_DIST + FLY_THROUGH_BAND`, sorted by the same L1 distance — so no pass over the board
  is added. Either list re-sorts only when `_transDirty` or the camera moved.
- **Geometry and UVs** are copied from `Cube.cs`; triangles are emitted as (v0, v2, v1) to flip XNA
  winding. Atlas rows are top-first and `flipY = false`, so v = 0 is the image top.
- **Colour.** Tiles and state use `NoColorSpace`; shaders output raw sRGB. Number colours are the
  board module's, which the board conformance checks hold to 4.5:1 against every point of the
  revealed face ([app-shell-board-module.md](app-shell-board-module.md)).
- **Target rectangle.** The drawing buffer always spans the window; `resize()` sets the viewport,
  the scissor and the camera aspect to the target, WebGL's y counted from the bottom, and turns the
  scissor test off with no target. With a target, `render()` first clears the whole canvas to
  transparent, so the page shows outside the panel, and the confetti's point size follows the
  target's height. The shell sets the target from the shown screen's live scene panel and clears it
  everywhere else — a 3D game, the 3D replay viewer — so picking and the HUD keep mapping the full
  window ([app-shell-3d.md](app-shell-3d.md) § Scene panel).
- **Render resolution.** The pixel ratio is the player's 3D resolution setting
  ([settings.md](settings.md) states `pixelRatioFor`): `js/main.js::applyPixelRatio` computes it
  for the board shown and calls `setPixelRatio` at each new board and on every setting change. The
  renderer never reads the setting.
- **Drawn from the board module.** The shell (`js/shell/scene-palette.js`) calls `setBoard` with the
  active theme's board module at start-up and on every theme change, once its number font has
  loaded ([app-shell-board-module.md](app-shell-board-module.md)); until then the atlas is transparent and the sky
  black. From the module come: the atlas, every layer drawn through `js/tile-art.js` in `style3d`
  from `palette.faces3d`, the flag, mine and cross, `numbers` and the number font — the slope
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

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — gameplay fidelity to the original is
  the overriding rule. This area enforces: *Drawing rules (per cell)* (tile per state, alpha 0.2
  under Shift/Space — under Space, by depth, and the Shift neighbourhood drawn over the faded cubes,
  "Web port:" notes there —, Ctrl shows hidden cells — as 25 % ghosts, a "Web port:" note there —, the
  "solved" pulse before a number hides — the board module's solved-pulse motion —, back-to-front
  transparency); *Cube face orientation*
  (corners and UVs); *Grid & geometry* (cube edge 4, pitch `4*s`, background RGB(200,225,255) —
  the web port draws the theme's sky instead, handed in by the shell — unlit textured cubes, centred grid); the
  web port's fly-through glass (a "Web port:" note under *Controls*).
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the atlas, sky, selection and confetti from the board module, and cell motion.
- [../domain/INDEX.md](../domain/INDEX.md) — product and feature design for visual extras.

## Cross-references

- [rendering-effects.md](rendering-effects.md) — cell motion and the solved pulse, flash, waves,
  ground grid, the replay-driven camera and the end of a 3D game.
- [app-shell-board-module.md](app-shell-board-module.md) — the board module's shape and checks, and the scene's
  hand-off `js/shell/scene-palette.js`.
- [engine-3d.md](engine-3d.md) — the 3D state view this area reads.
- [app-shell.md](app-shell.md) — `js/main.js` owns the renderer: `sync`/`render` per frame,
  `snapshotBeforeAction` before reveals, `isAnimating`, the pixel ratio, `stats` via `__ms`.
- [settings.md](settings.md) — the render resolution setting and `pixelRatioFor`.
- [input-camera.md](input-camera.md) — the camera feeds `camera`; picking must use the same pitch and
  Space/hidden visibility rules. [input.md](input.md) — modifier state feeds `setToggles`.
- [app-shell-replay.md](app-shell-replay.md) — the replay scene's tints, rings and wrong flags.
- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the Classic 2D tile skin and the shared tile recipe.
- [testing.md](testing.md) — `tests/render-3d-feedback.test.mjs` (`GHOST_ALPHA`, ghosts in
  `stats.trans`, the target rectangle, the atlas's layers and *Joyful tiles*' sampled atlas,
  selection and confetti, a theme switch in a 3D game), `tests/render-3d-selection.test.mjs` (the
  selection uniforms and confetti colours from the module), `tests/camera-flight.test.mjs` (the
  fly-through constants and the near-camera list), `tests/tile-art.test.mjs` (the drawing styles),
  `tests/settings-appliers.test.mjs` (`pixelRatioFor`); verification is visual via Playwright.

## When to read the source

- Changing what a cell looks like or its alpha under Shift/Space/Ctrl (vertex shader `VERT`,
  `_writeCell`, `_rebuildOpaque`, `_applyShiftOpaque`, `_updateTransparent` must stay in step).
- Adding a tile (new layer in `js/textures.js` before `L_SUNK`'s place at the end, bump `LAYERS`,
  map it in `_writeCell`).
- Changing how an atlas tile is drawn: the geometry is `js/tile-art.js`, shared with the Classic 2D
  tiles and pinned by `tests/tile-art.test.mjs`; the colours and style are the theme's board module
  (`drawLayer`).
- Changing what the renderer takes from a board module (`setBoard`, `selectionUniforms`,
  `confettiColours`, the selection branch of `FRAG`).
- Debugging transparency artefacts or sort cost (`_updateTransparent`).
- Changing cell indexing, board dimension limits (state texture height) or spacing math.
- Drawing into a part of the window (`setTarget`, `resize`, the transparent clear in `render`).
- Fixing mirrored or rotated numbers on a face (`createCubeGeometry`).
