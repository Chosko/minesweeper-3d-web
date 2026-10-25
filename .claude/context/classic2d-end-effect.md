# Classic 2D — end effect

## OVERVIEW

`js/classic2d/end-effect.js` is the Classic 2D end effect the mode plays
during its end delay ([classic2d-mode.md](classic2d-mode.md) § End delay):
the 3D game's win and loss waves and the win confetti at board scale, over
the board's grid geometry, and their Canvas 2D drawing, in the active
theme's board module (`end2d`, `palette.confetti`). DOM-free and token-free;
the board view draws it ([classic2d-board-motion.md](classic2d-board-motion.md)).

## PUBLIC API

`js/classic2d/end-effect.js`
- `WIN`, `LOSS`, `WAVE_STEP_MS`, `WAVE_SHARE`, `WIN_WAVE`
  (`{peakMs, widthMs}`), `LOSS_SNAP_MS`, `CONFETTI_COUNT`.
- `createEndEffect({kind, geometry?, cols?, rows?, origin, duration, random?})`,
  `reachMs`, `preLossState`, `wonState`, `shownState`,
  `waveAt(effect, c, state, t, end2d)` → `{scale, flash}` or null,
  `confettiAt(effect, t, {tile, gap?, width?, height?})`, `done`,
  `drawWave(ctx, x, y, size, wave, board, paint, outline?)` (a hexagon or
  triangle tile's `{points, centre, radius}` sets the scale's centre and
  the light's shape), `drawConfetti`. The
  module head comment is the contract.

## INTERNAL PATTERNS

- **End effect.** Each tile is reached at a delay proportional to its
  distance in tiles from the origin, between cell centres on the board's
  grid geometry, at most `WAVE_STEP_MS` per tile, the
  farthest by `WAVE_SHARE` of the delay. A loss's changed tiles keep their
  pre-loss tile until reached, then snap to their revealed face from the
  board module's `end2d.loss.scale` with an overshoot (the 3D loss wave's
  curve, over `LOSS_SNAP_MS`) under its `end2d.loss.flash` of the light; a
  win's wave bumps each tile to `end2d.win.scale` and mixes it
  `end2d.win.mix` toward `end2d.light` as it passes (the 3D win wave's
  timing, `WIN_WAVE`), its closed mines turn to flags, and its confetti in
  the module's `palette.confetti` bursts from the origin's centre and falls
  over the geometry's extent. The board view draws it; the module reads no token.
- **Origins.** A win's wave starts from the last action's cell, a loss's
  from the exploded tile nearest it; the mode picks them.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the end of a game.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the board module's `end2d` the effect reads.

## CROSS-REFERENCES

- [classic2d-mode.md](classic2d-mode.md) — the end delay that runs it.
- [classic2d-board-motion.md](classic2d-board-motion.md) — the board view
  drawing it.
- [geometry.md](geometry.md) — the cell centres and extent it spreads over.
- [app-shell-board-module.md](app-shell-board-module.md) — `end2d` and the
  confetti palette.
- [rendering-effects.md](rendering-effects.md) — the 3D waves it mirrors.
- [testing.md](testing.md) — `tests/classic2d-end-effect.test.mjs`.

## WHEN TO READ THE SOURCE

- Tuning the end effect (wave speed, wave shape, confetti): `end-effect.js`.
