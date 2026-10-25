# Trace the cursor ring and end flash round hexagon and triangle tiles

## Goal
On a Hexagon or Triangle board the Classic 2D board view still draws the
keyboard and controller cursor ring, and the end effect's flash, round the
tile's square box. Both follow the cell's outline from the grid geometry —
hexagon, triangle up, triangle down — while every square board draws exactly
what it drew before.

## Acceptance criteria
- On a hexagon or triangle board the board module's cursor ring is stroked
  along the cell's outline grown outward: each band's centre line runs the
  same distance outside every edge as on the square (`radius.px` plus the
  band's offset), its corners rounded concentrically from `radius.tile` × the
  outline's height + `radius.px`; no rectangle is stroked.
- Without a board module, a hexagon or triangle board's fallback ring is the
  cell's outline grown by half its width, in `CURSOR_RING`, a twelfth of the
  tile wide.
- On a hexagon or triangle board the end effect scales each tile about the
  geometry's centre of its cell, and its light is filled in the cell's outline
  rounded by the grid's corner radius × the outline's height (the face's own
  clip), never over the box's corners.
- Square boards are unchanged: the ring's and the wave's drawing calls on a
  square board are the ones they were (the existing square ring and wave tests
  pass unmodified).
- `js/tile-art.js` exports the outline path it clips faces with and an outline
  grown outward by a distance, and the board view and end effect draw through
  them rather than copies.
- A browser check shows, on a hexagon and a triangle board, the ring's colour
  outside the cell's slanted edge and none where the square ring would stand,
  and the loss flash lighting the tile inside its outline while the ground
  just outside its slanted edge, inside its box, stays the ground.

## Decisions
- The shaped ring's corner radius is measured on the outline's height, the
  measure the grid's shape fractions use (`GRID_UNIT`).
- The confetti's gapped-theme offset recorded at runbook 10 step 4 is already
  fixed (commit 89b8310 passes the layout's gap to `confettiAt`); nothing to do.

## Hints
- js/classic2d/board-view.js (`drawRing`, `drawCell`'s `drawWave` call, `outline`, `tileBox`)
- js/classic2d/end-effect.js (`drawWave`, head comment)
- js/tile-art.js (`polygonPath`, `inset`)
- js/themes/board-module.js (head comment on `cursor`)
- tests/classic2d-view.test.mjs (`shapedView`, `SHAPED_MODULE`), tests/classic2d-end-effect.test.mjs (`drawWave`), tests/tile-art.test.mjs, tests/classic2d-cursor.test.mjs (browser ring test)

## Drift
- `.claude/context/classic2d-board-motion.md` § Focus ring — diverges: says the band's corners are `radius.tile` × the tile plus `radius.px` and the fallback is a square ring; on a hexagon or triangle board the ring traces the cell's outline, its corners from the outline's height.
- `.claude/context/classic2d-board-motion.md` § End effect drawing — diverges: says each tile is scaled about its centre with its light clipped to the rounded tile; on a hexagon or triangle board the light fills the cell's outline and the scale is about the geometry's centre.
- `.claude/context/classic2d-end-effect.md` § PUBLIC API — diverges: lists `drawWave(ctx, x, y, size, wave, board, paint)`; it takes an optional outline.
- `.claude/context/tile-art.md` § PUBLIC API — settles: the recipe's outline path and grown outline become exports.
- `.claude/domain/features/themed-board-art-and-motion.md` § Classic 2D tiles — settles: "the cursor ring's radius follows the tile's" and "draws outside the tile" leave the shaped outline open; the ring follows the outline.
- `.claude/context/app-shell-board-module.md` § files table — settles: the `cursor` shape is unchanged; only how it is drawn on a shaped tile.
