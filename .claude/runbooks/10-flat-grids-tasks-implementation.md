# Runbook: flat-grids-tasks-implementation

Created: 2026-10-21 · Source: /runbook-create interview (runbook flat-grids-planning step 6) · Model: opus
Last step number: 33

## [x] 1. Implement task 248 — Flat grid geometry contract and the square geometry

Depends on: none

Context: none

```prompt
/task-implement 248 --review
```

Done: 2026-10-21, commit `f550202` (5 files, +320/-1). The geometry works in CSS pixels from the board's top-left, taking the tile size and the layout's whole-pixel gap (not the board module's gap fraction); `js/geometry/square.js` imports the tile floor and cap from `js/classic2d/`.

## [x] 2. Implement task 249 — Classic 2D board view on the grid geometry

Depends on: 1

Context:
- 2026-10-21 (from step 1): js/geometry/square.js imports MIN_TILE_SIZE from js/classic2d/tile-skin.js and tileCap from js/classic2d/board-view.js, so making the board view import js/geometry/ creates an import cycle — safe as written (values read at build time, not load time); a deferred review advisory says to move the floor and cap into a small shared module if the cycle bites.

```prompt
/task-implement 249 --review
```

Done: 2026-10-21, commit `e531af6` (13 files, +325/-124). `boardPoint` (touch-zoom anchor, wheel line) stays in pitches until task 252; the cols/rows forms of `fitTileSize`, `boardLayout` and `cellAtLayout` still work through the square geometry; `js/shell/daily.js` needed no change.

## [~] 3. Implement task 250 — Tile painter and cache through the geometry's outline

Depends on: 2

Context: none

```prompt
/task-implement 250 --review
```

## [~] 4. Implement task 251 — Cursor moves and end effect on the grid geometry

Depends on: 2

Context: none

```prompt
/task-implement 251 --review
```

## [x] 5. Implement task 252 — 2D movement sampler and replay viewer in board units

Depends on: 2

Context: none

```prompt
/task-implement 252 --review
```

Done: 2026-10-21, commit `b86a015` (8 files, +265/-62). `boardPoint` is now `boardPoint(view, x, y, steps?)`; board units are still the layout's pitch, since the geometry contract has no board-unit member; the viewer builds its geometry from the replay header's board (`replayGeometry`), and a pointer resting in the gap past the last column or row now counts as on no cell, as live hit-testing does.

## [ ] 6. Implement task 253 — Update documentation for feature `flat-grid-geometry`

Depends on: 1, 2, 3, 4, 5

Context:
- 2026-10-21 (from step 5): .claude/context/replay-samplers.md and .claude/context/replay-viewers.md still say "in pitches" and show the old boardPoint signature — boardPoint is now boardPoint(view, x, y, steps?); update both.

```prompt
/task-implement 253 --review
```

## [~] 7. Implement task 254 — Hexagon graph provider and the `hex` generation description

Depends on: none

Context: none

```prompt
/task-implement 254 --review
```

## [ ] 8. Implement task 255 — Hexagon geometry

Depends on: 1

Context:
- 2026-10-21 (from step 2): the board view's repaint walks only the cells between the viewport's top-left and bottom-right corners plus one row either side, so it assumes cells are numbered row by row — this geometry must number its cells the same way.

```prompt
/task-implement 255 --review
```

## [ ] 9. Implement task 256 — Hexagon boards, limits, identity and board-code token

Depends on: 7

Context: none

```prompt
/task-implement 256 --review
```

## [ ] 10. Implement task 257 — Update documentation for feature `hexagon-grid`

Depends on: 7, 8, 9

Context: none

```prompt
/task-implement 257 --review
```

## [ ] 11. Implement task 258 — Triangle graph provider and the `tri` generation description

Depends on: none

Context: none

```prompt
/task-implement 258 --review
```

## [ ] 12. Implement task 259 — Triangle geometry

Depends on: 1

Context:
- 2026-10-21 (from step 2): the board view's repaint walks only the cells between the viewport's top-left and bottom-right corners plus one row either side, so it assumes cells are numbered row by row — this geometry must number its cells the same way.

```prompt
/task-implement 259 --review
```

## [ ] 13. Implement task 260 — Triangle boards, limits, identity and board-code token

Depends on: 9, 11

Context: none

```prompt
/task-implement 260 --review
```

## [ ] 14. Implement task 261 — Update documentation for feature `triangle-grid`

Depends on: 11, 12, 13

Context: none

```prompt
/task-implement 261 --review
```

## [ ] 15. Implement task 262 — Hexagon and triangle outlines in the tile recipe

Depends on: none

Context: none

```prompt
/task-implement 262 --review
```

## [ ] 16. Implement task 263 — Board module per-grid shape, numbers to 12, checks, and Joyful tiles' values

Depends on: 8, 12, 15

Context: none

```prompt
/task-implement 263 --review
```

## [ ] 17. Implement task 264 — The tile painter draws hexagon and triangle tiles

Depends on: 3, 15, 16

Context: none

```prompt
/task-implement 264 --review
```

## [ ] 18. Implement task 265 — The theme skill reads Hexagon and Triangle board sheets

Depends on: 16

Context: none

```prompt
/task-implement 265 --review
```

## [ ] 19. Implement task 266 — Update documentation for feature `hex-tri-board-art`

Depends on: 15, 16, 17, 18

Context: none

```prompt
/task-implement 266 --review
```

## [ ] 20. Implement task 267 — Flat mode configuration, with Classic 2D as the square configuration

Depends on: 2, 4, 5

Context: none

```prompt
/task-implement 267 --review
```

## [ ] 21. Implement task 268 — Hexagon and Triangle modes with their board choice screens

Depends on: 8, 9, 12, 13, 20

Context: none

```prompt
/task-implement 268 --review
```

## [ ] 22. Implement task 269 — Play in Hexagon and Triangle

Depends on: 17, 21

Context: none

```prompt
/task-implement 269 --review
```

## [ ] 23. Implement task 270 — Board codes and challenge links for Hexagon and Triangle

Depends on: 21

Context: none

```prompt
/task-implement 270 --review
```

## [ ] 24. Implement task 271 — Update documentation for feature `flat-grid-modes`

Depends on: 20, 21, 22, 23

Context: none

```prompt
/task-implement 271 --review
```

## [ ] 25. Implement task 272 — Records model and summaries for Hexagon and Triangle

Depends on: 9, 13, 22

Context: none

```prompt
/task-implement 272 --review
```

## [ ] 26. Implement task 273 — Records screen's mode switch over four modes

Depends on: 25

Context: none

```prompt
/task-implement 273 --review
```

## [ ] 27. Implement task 274 — Replay format version with `hex` and `tri`, and the 2D recorder over them

Depends on: 7, 11, 22

Context: none

```prompt
/task-implement 274 --review
```

## [ ] 28. Implement task 275 — Playback of Hexagon and Triangle replays

Depends on: 17, 27

Context: none

```prompt
/task-implement 275 --review
```

## [ ] 29. Implement task 276 — Update documentation for feature `flat-grid-records-replays`

Depends on: 25, 26, 27, 28

Context: none

```prompt
/task-implement 276 --review
```

## [ ] 30. Implement task 277 — Menu previews for Hexagon and Triangle

Depends on: 17, 21

Context: none

```prompt
/task-implement 277 --review
```

## [ ] 31. Implement task 278 — Menu routes, last mode played and Daily for Hexagon and Triangle

Depends on: 21

Context: none

```prompt
/task-implement 278 --review
```

## [ ] 33. Implement task 280 — Hexagon and Triangle daily boards on the Daily screen

Depends on: 23, 26, 30, 31

Context: none

```prompt
/task-implement 280 --review
```

## [ ] 32. Implement task 279 — Update documentation for feature `flat-grid-menu-entries`

Depends on: 30, 31

Context: none

```prompt
/task-implement 279 --review
```

## Do not re-propose

- Hexagon/Triangle leaderboards, achievements, demo locks and colour-blind-safe numbers in m2c-flat-grids — rejected: they stay in m6-launch.
- Treating flat-grid-records-replays as a prerequisite of flat-grid-modes — rejected: flat-grid-records-replays depends on flat-grid-modes, as .claude/PLAN.md orders them; the flat-grid-modes document's Dependencies prose that lists flat-grid-records-replays is stale.
