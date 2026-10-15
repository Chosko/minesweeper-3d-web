# Rendering — effects, ground grid, replay and end of game

## Overview

The 3D renderer's ([rendering.md](rendering.md)) time-driven extras: the "solved" pulse of a
number that hides, the flash of the cubes a flag click on a number changes, the win and loss
waves with confetti and camera shake, the ground grid below the board; and how the renderer
behaves under a 3D replay and at the end of a 3D game. All live in `js/render.js`; each effect
needs frames, so `isAnimating()` stays true while any runs.

## Public API

`js/render.js`:
- `sync({ seek } = {})` — on a `playing`→`won`/`lost` transition starts the win or loss effect; on
  a `won`/`lost`→`playing` one (a replay seeking back before its end) drops every end-of-game
  effect at once (`_endEffects`); starts or drops "solved" pulses. With `seek: true` it first
  drops every running pulse and starts none for these changes.
- `snapshotBeforeAction()` — copies `flagged`/`pressed` before a reveal action (not a right click)
  so a loss can show wrong flags and animate exactly; no-op unless `game.state === 'playing'`.
- `flash(cells)` — starts each cell's flash; ignored unless playing. `setGame`, `_endEffects` and
  the end of the game (in `sync`) drop running flashes.
- `isAnimating()` — true while the selection pulse, a "solved" pulse, a flash, a wave, confetti or
  shake needs frames.
- `PULSE_GLOW_S`, `PULSE_FADE_S`, `PULSE_SCALE`, `PULSE_BRIGHT`, `pulseEnvelope(t)` → `{ scale,
  bright, alpha, done }`, a pure function of the seconds since the pulse started; `FLASH_S`,
  `FLASH_BRIGHT`, `FLASH_ALPHA`, `FLASH_SCALE`, `flashEnvelope(t)` in the same shape.

## Internal patterns

- **"Solved" pulse.** When `sync` sees a cell go from a visible number (`K_NUMBER`) to hidden while
  the game was in play and not lost, it records the cell and its start in `_pulses` (a Map); a cell
  shown again leaves it, a loss (before `_beginLoss`) and a seek drop them all (`_dropPulses`). It
  is visual only — the engine has already hidden the cell, so picking passes through it. A third
  instanced mesh (`meshPulse`, `renderOrder` 2, after the transparent pass, no depth write, the
  `PULSE` define) draws the cell as the number it was under the current view modes, scale,
  brightness and alpha from `pulseEnvelope` in the `aPulse` attribute. Under Ctrl the pulse fades
  out over the cell's ghost, which then remains.
- **Flash.** A flag click on a revealed number (its flag-all or its undo) flashes every cube it
  flagged or unflagged: `js/main.js` hands the cells to `flash`, which records each start in
  `_flashes`. A fourth instanced mesh (`renderOrder` 3, the `FLASH` define, depth test off) draws
  them as their tile now, under every view mode, brightened, grown and faded by `flashEnvelope`, so
  a cube behind the front face shows through. A hand flag does not flash; a replay never calls
  `flash`.
- **Effect meshes.** `_tickPulses` and `_tickFlashes` (each `render()`) visit only the cells in
  their Map, drop the finished ones and sort the rest farthest first; `_buildFx` / `_drawFx` build,
  grow (by powers of two) and draw both meshes.
- **Waves.** `uEff` 1 = win pulse, 2 = loss reveal; delay per cell of distance from an origin
  (exploded cell or aimed cell). Cells not yet reached show their A-channel old tile; hidden cells
  shrink away during a loss (`_effHidden` keeps them in the opaque list until the wave ends). Win
  adds confetti, loss a camera shake applied for each frame only.
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
  [replay-viewers.md](replay-viewers.md)). Playback plays the "solved" pulses as play does; a seek reaches the
  renderer as `sync({ seek: true })` ([app-shell-replay.md](app-shell-replay.md) § Frame loop), so a seek never
  leaves a pulsing cube. Otherwise the renderer cannot tell a replay from play; leaving the replay
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
- [../domain/INDEX.md](../domain/INDEX.md) — feature design for the visual extras.

## Cross-references

- [rendering.md](rendering.md) — the renderer's API, passes, state texture and sky palette.
- [app-shell-replay.md](app-shell-replay.md) — the replay viewer route and its frame-loop tick;
  [app-shell-3d.md](app-shell-3d.md) — the end sequence; [app-shell-3d-play.md](app-shell-3d-play.md) — render on demand.
- [replay-viewers.md](replay-viewers.md) — the 3D viewer whose state view and recorded camera the renderer draws.
- [audio.md](audio.md) — no direct link; win/loss sounds fire alongside the waves from main.
- [testing.md](testing.md) — `tests/render-3d-feedback.test.mjs` (pulse envelope, the pulse's
  `isAnimating()` and its ends), `tests/replay-viewer-3d.test.mjs` (a 3D replay on the renderer, its
  pulses, a seek dropping them), `tests/mode3d-end.test.mjs` (no frame under a 3D game's results
  screen).

## When to read the source

- Tuning or changing the "solved" pulse (`pulseEnvelope` and its constants, `sync`, `_tickPulses`,
  `_dropPulses`, the `PULSE` branch of `VERT`) or the flash (`flashEnvelope`, `_tickFlashes`).
- Tuning win/loss waves, confetti, shake, fog, sky, ground grid or selection glow (`_beginWin`,
  `_beginLoss`, `_waveSetup`, `_tickEffects`, `render`, `_placeGround`, shader constants).
