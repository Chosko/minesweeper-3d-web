# Classic 2D — cell motion player

## OVERVIEW

How a cell moves. The area overview is [classic2d.md](classic2d.md); how a
tile looks is [classic2d-tile-skin.md](classic2d-tile-skin.md).

- `js/cell-motion.js` — the cell motion player both renderers use: the
  running cell animations a theme's motion descriptions play
  ([app-shell-board-module.md](app-shell-board-module.md), the board module's `motion`), and
  each animating cell's values per frame. It imports nothing and touches no
  DOM, game state, timer, replay, setting or media query.

## PUBLIC API

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

- **Cell motion.** Each track interpolates its keyframes with the
  description's easing applied per keyframe segment, as a CSS animation's
  timing function is, holding its end values outside them. The tracks are
  the board module's vocabulary: offset, scale, rotation, depth, brightness
  and opacity, each answered per frame. A flip (rotation with `flip: true`)
  shows `before` until halfway between its first and last keyframe — at
  the keyframe itself for a flip of one, so one at the duration shows
  `before` until the animation ends — and `after` from then on; without a
  flip a cell shows `after` throughout, and a property no track animates
  rests (depth `null`, the face's own). An animation past its duration leaves the
  player, so the cell shows `after`. A second `start` on an animating cell
  restarts it; a `null` description, or a new cell past the cap, starts
  nothing and drops the cell's running animation, so it shows its new
  state at once. `MOTION_CAP` is measured by `dev/measure-cell-motion.mjs`,
  a flood reveal on a 100 × 100 board, and the module's head comment holds
  the measurement and the rule that picks it.
- **Depth.** A `depth` value is drawn by the 2D motion layer from the tile
  cache's nearest depth step ([classic2d-tile-skin.md](classic2d-tile-skin.md)),
  never a draw per frame.
- **Every flat grid.** The player knows no grid: a theme's one Classic 2D
  motion plays on square, hexagon and triangle boards alike, the 2D motion
  layer drawing each cell about its geometry's centre
  ([classic2d-board-motion.md](classic2d-board-motion.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the cell motion player, the motion description and its vocabulary.
- [../domain/features/hex-tri-board-art.md](../domain/features/hex-tri-board-art.md)
  — the Classic 2D motion, unchanged, on hexagon and triangle tiles.

## CROSS-REFERENCES

- [classic2d-board-motion.md](classic2d-board-motion.md) — the 2D motion
  layer that drives the player.
- [rendering-effects.md](rendering-effects.md) — the 3D motion mesh that
  drives it too.
- [app-shell-board-module.md](app-shell-board-module.md) — the board
  module's `motion` descriptions and their checks.
- [testing.md](testing.md) — `tests/cell-motion.test.mjs` the cell motion
  player.

## WHEN TO READ THE SOURCE

- Changing how motion is interpolated or capped (`js/cell-motion.js`);
  re-run `node dev/measure-cell-motion.mjs` before changing `MOTION_CAP`.
