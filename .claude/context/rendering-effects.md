# Rendering — effects, ground grid, replay and end of game

## Overview

The 3D renderer's ([rendering.md](rendering.md)) time-driven extras: the theme's cell motion on
the cubes — reveal, flag, unflag and the "solved" pulse of a number that hides —, the flash of the
cubes a flag click on a number changes, the win and loss waves with confetti and camera shake, the
ground grid below the board; and how the renderer behaves under a 3D replay and at the end of a 3D
game. All live in `js/render.js`, cell motion on the player `js/cell-motion.js`
([classic2d-tile-skin.md](classic2d-tile-skin.md)); each effect needs frames, so `isAnimating()`
stays true while any runs.

## Public API

`js/render.js`:
- `sync({ seek } = {})` — on a `playing`→`won`/`lost` transition starts the win or loss effect; on
  a `won`/`lost`→`playing` one (a replay seeking back before its end) drops every end-of-game
  effect at once (`_endEffects`); starts each changed cell's motion. With `seek: true` it first
  drops every running motion and starts none for these changes.
- `dropMotion()` — drops every running cell motion, the cubes shown as they are: a seek, a loss, a
  pause hiding the board (`js/main.js`), a theme change (`setBoard`); `setGame` drops it too.
- `cellEvent(was, kind)` → `reveal`, `flag`, `unflag`, `solvedPulse` or null, from a cube's kind
  before and after a change; `motionInstance(v, camera)` → one motion instance from the player's
  values; `meshMotion` (the motion mesh, null without a board); `motion` (the renderer's player)
  and `clock` (its clock in ms, `performance.now` by default; tests hold it still).
- `snapshotBeforeAction()` — copies `flagged`/`pressed` before a reveal action (not a right click)
  so a loss can show wrong flags and animate exactly; no-op unless `game.state === 'playing'`.
- `flash(cells)` — starts each cell's flash; ignored unless playing. `setGame`, `_endEffects` and
  the end of the game (in `sync`) drop running flashes.
- `isAnimating()` — true while the mark pulse, the selection pulse, a cell motion, a flash, a wave,
  confetti or shake needs frames.
- `FLASH_S`, `FLASH_BRIGHT`, `FLASH_ALPHA`, `FLASH_SCALE`, `flashEnvelope(t)` → `{ scale, bright,
  alpha, done }`, a pure function of the seconds since the flash started.

## Internal patterns

- **Cell events.** For each cell a change list touches while the game was in play and not lost,
  `sync` asks `cellEvent` for the event its kind change is: closed to flag is flag, flag to closed
  unflag, closed to anything else reveal — each while the game is still playing, so the winning
  action's reveal plays none and the win wave plays its cubes —, and a visible number (`K_NUMBER`)
  to hidden the solved pulse, played as the number it was. The renderer starts the board module's
  description for that event on its player, from the face before (`{layer, kind}`) to the face
  after; a change that is no event, or an event the theme leaves still, drops the cell's running
  motion. Motion is visual only: the engine has already applied the action, so the game, picking,
  the timer and a replay never wait for it — a hidden number is unpickable from the action on while
  its pulse plays. A loss (before `_beginLoss`), a seek, a pause hiding the board, a theme change
  and a new board drop every motion.
- **Motion mesh.** One more instanced mesh (`renderOrder` 2, after the transparent pass, the
  `MOTION` define, `MOTION_CAP` instances) draws every animating cube. `_tickMotion` (each
  `render()`) takes the player's values for the animating cells only, sets each cell's state-texture
  B channel so its ordinary instance is skipped, sorts the cubes farthest first and writes one
  instance each through `motionInstance`: scale; brightness, above 1 a lift toward white by the
  excess and below 1 a darkening by the factor; opacity; the face shown (its layer and kind, so it
  draws under the view modes as that face); the offset in cube sizes, x along the camera's screen
  right, y down the screen and z toward the camera; the rotation about an axis in the same frame;
  and the depth as a blend of a closed face toward the atlas's sunk layer (`L_SUNK`). A cube that
  stops animating gets its ordinary instance back. Under Ctrl a solved pulse fades out over the
  cell's ghost, which then remains.
- **Flash.** A flag click on a revealed number (its flag-all or its undo) flashes every cube it
  flagged or unflagged: `js/main.js` hands the cells to `flash`, which records each start in
  `_flashes`. A fourth instanced mesh (`renderOrder` 3, the `FLASH` define, depth test off) draws
  them as their tile now, under every view mode, brightened, grown and faded by `flashEnvelope`, so
  a cube behind the front face shows through. A hand flag does not flash; a replay never calls
  `flash`.
- **Flash mesh.** `_tickFlashes` (each `render()`) visits only the cells in `_flashes`, drops the
  finished ones and sorts the rest farthest first; `_buildFx` / `_drawFx` build, grow (by powers of
  two) and draw the mesh.
- **Waves.** `uEff` 1 = win pulse, 2 = loss reveal; delay per cell of distance from an origin
  (exploded cell or aimed cell). Cells not yet reached show their A-channel old tile; hidden cells
  shrink away during a loss (`_effHidden` keeps them in the opaque list until the wave ends). Win
  adds confetti — its pieces cycling the board module's `palette.confetti` colours — and loss a
  camera shake applied for each frame only.
- **Visual-only tiles.** After a win, unflagged mines draw the flag tile; after a loss, flags on
  non-mines draw `L_WRONG_FLAG`. Neither changes game state.
- **Ground grid.** Drawn in the sky's fullscreen pass (`SKY_FRAG`'s `groundGrid`), so it lies behind
  every cube, writes no depth and is never picked: the view ray meets a horizontal plane
  `GROUND_GAP` (12) below the box's bottom at the current spacing; lines every power-of-two count of
  lattice pitches (growing with the box), antialiased with `fwidth` and faded where they crowd, plus
  a faint fill, all fading toward the sky from 0.55 of the fade distance (`max(GROUND_FADE_MIN`
  400`, 4 × (camera distance + board radius))`), which reads as a horizon. Its ink is the palette's
  horizon stop, darkened on a light sky and lightened on a dark one. `_placeGround` sets `uGround` /
  `uEye` each `render()`; off without a board; the view modes, effects and shake leave it alone.
- **Replay-driven camera.** A 3D replay draws through the same renderer: `js/main.js`'s
  `REPLAY_SCENE` hands it the replay's 3D state view with `setGame`, and each frame writes the
  recorded camera (a separate `FlyCamera` at `SPACING_START`) to `camera`, the recorded view mode
  through `setToggles` and the recorded aimed cell through `setSelected` ([app-shell-replay.md](app-shell-replay.md),
  [replay-viewers.md](replay-viewers.md)). Playback plays the cell events, the "solved" pulse
  included, as play does; a seek reaches the renderer as `sync({ seek: true })`
  ([app-shell-replay.md](app-shell-replay.md) § Frame loop), so a seek never leaves a moving cube
  and starts none. Otherwise the renderer cannot tell a replay from play; leaving the replay
  hands it back the game or demo board it drew before.
- **End of a 3D game.** The win or loss effect plays for the 3D mode's end delay (`endDelayMs`,
  [mode3d-adapter.md](mode3d-adapter.md)), or until a press of the player's cuts it short, with the camera and the
  view-mode toggles frozen as the game ended. `_waveSetup` paces both waves at `waveStepS(game)` seconds per
  cell from the same module, and the shader's per-cell loss reveal lasts `WAVE_CELL_S`, so the loss wave
  fits the delay. The results screen then shows over the scene, which `js/main.js`'s `shouldRender` draws
  behind a 3D game's results only on demand (`needRender`, a sync, a running effect); the look at the
  finished board draws as play does ([app-shell-results.md](app-shell-results.md)). `wrongFlags()` hands back a
  loss's crossed flags, which the 3D replay scene gives back through `setWrongFlags` after `setGame`.

## Domain dependencies

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) *Drawing rules (per cell)* — the
  "solved" pulse before a number hides ("Web port:" note there).
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — cell motion, the motion vocabulary, the solved pulse as a cell event, the confetti colours.
- [../domain/INDEX.md](../domain/INDEX.md) — feature design for the visual extras.

## Cross-references

- [rendering.md](rendering.md) — the renderer's API, passes, state texture and sky palette.
- [app-shell-replay.md](app-shell-replay.md) — the replay viewer route and its frame-loop tick;
  [app-shell-3d.md](app-shell-3d.md) — the end sequence; [app-shell-3d-play.md](app-shell-3d-play.md) — render on demand.
- [replay-viewers.md](replay-viewers.md) — the 3D viewer whose state view and recorded camera the renderer draws.
- [audio.md](audio.md) — no direct link; win/loss sounds fire alongside the waves from main.
- [testing.md](testing.md) — `tests/render-3d-motion.test.mjs` (cell events, motion instances, the
  motion mesh with the ordinary instance hidden, the solved pulse from the theme's description, the
  drops), `tests/render-3d-feedback.test.mjs` (the solved pulse's rise and fade, its
  `isAnimating()` and its ends; the confetti's colours in a browser),
  `tests/render-3d-flag-flash.test.mjs` (the flash), `tests/replay-viewer-3d.test.mjs` (a 3D replay
  on the renderer, its pulses, a seek dropping them), `tests/mode3d-end.test.mjs` (no frame under a
  3D game's results screen).

## When to read the source

- Changing which changes play which cell event, or how a motion instance is drawn (`cellEvent`,
  `sync`, `_startMotion`, `_tickMotion`, `motionInstance`, the `MOTION` branch of `VERT`); the
  solved pulse's look is the theme's `motion.solvedPulse`. The flash: `flashEnvelope`,
  `_tickFlashes`.
- Tuning win/loss waves, confetti, shake, fog, sky, ground grid or selection glow (`_beginWin`,
  `_beginLoss`, `_waveSetup`, `_tickEffects`, `render`, `_placeGround`, shader constants).
