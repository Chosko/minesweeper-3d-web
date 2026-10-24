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

## [x] 3. Implement task 250 — Tile painter and cache through the geometry's outline

Depends on: 2

Context:
- 2026-10-21 the previous agent on this step was interrupted mid-task and cannot resume; this step's worktree holds its uncommitted partial work for this same task (the task already [IN PROGRESS] there). The user asked for that work to be finished: at the dirty-tree prompt, keep the partial work and fold it into the task's commit, then continue from it rather than starting over.

```prompt
/task-implement 250 --review
```

Done: 2026-10-21, commit `1fb399d` (9 files, +285/-60). The image cache is now also keyed by outline orientation; the new tests went to `tests/tile-skin.test.mjs`, not the `tests/tile-art.test.mjs` the task's `Files:` names.

## [x] 4. Implement task 251 — Cursor moves and end effect on the grid geometry

Depends on: 2

Context:
- 2026-10-21 the previous agent on this step was interrupted mid-task and cannot resume; this step's worktree holds its uncommitted partial work for this same task (the task already [IN PROGRESS] there). The user asked for that work to be finished: at the dirty-tree prompt, keep the partial work and fold it into the task's commit, then continue from it rather than starting over.

```prompt
/task-implement 251 --review
```

Done: 2026-10-21, commit `9573252` (12 files, +299/-71). The pointer and touch inputs held no column or row arithmetic to remove, contrary to the task body; the board view still calls the confetti with no gap, so on a gapped theme the burst sits slightly off the winning tile's centre.

## [x] 5. Implement task 252 — 2D movement sampler and replay viewer in board units

Depends on: 2

Context: none

```prompt
/task-implement 252 --review
```

Done: 2026-10-21, commit `b86a015` (8 files, +265/-62). `boardPoint` is now `boardPoint(view, x, y, steps?)`; board units are still the layout's pitch, since the geometry contract has no board-unit member; the viewer builds its geometry from the replay header's board (`replayGeometry`), and a pointer resting in the gap past the last column or row now counts as on no cell, as live hit-testing does.

## [x] 6. Implement task 253 — Update documentation for feature `flat-grid-geometry`

Depends on: 1, 2, 3, 4, 5

Context:
- 2026-10-21 (from step 5): .claude/context/replay-samplers.md and .claude/context/replay-viewers.md still say "in pitches" and show the old boardPoint signature — boardPoint is now boardPoint(view, x, y, steps?); update both.

```prompt
/task-implement 253 --review
```

Done: 2026-10-24, commit `68e7eb5` (11 files, +39/-15). Premise wrong: the replay-samplers and replay-viewers context files already carried the new `boardPoint` signature.

## [x] 7. Implement task 254 — Hexagon graph provider and the `hex` generation description

Depends on: none

Context:
- 2026-10-21 the previous agent on this step was interrupted mid-task and cannot resume; this step's worktree holds its uncommitted partial work for this same task (the task already [IN PROGRESS] there). The user asked for that work to be finished: at the dirty-tree prompt, keep the partial work and fold it into the task's commit, then continue from it rather than starting over.

```prompt
/task-implement 254 --review
```

Done: 2026-10-21, commit `8d8f2c3` (14 files, +519/-22). Hexagon Expert (30 × 16, 123 mines) finds a no-guess board within the attempt budget on only about 13–17% of seeds (failures up to about 0.63 s); the budget is unchanged, and the hexagon-grid document's open question records it.

## [x] 8. Implement task 255 — Hexagon geometry

Depends on: 1

Context:
- 2026-10-21 (from step 2): the board view's repaint walks only the cells between the viewport's top-left and bottom-right corners plus one row either side, so it assumes cells are numbered row by row — this geometry must number its cells the same way.
- 2026-10-21 the previous agent on this step was interrupted mid-task and cannot resume; this step's worktree holds its uncommitted partial work for this same task (the task already [IN PROGRESS] there). The user asked for that work to be finished: at the dirty-tree prompt, keep the partial work and fold it into the task's commit, then continue from it rather than starting over.

```prompt
/task-implement 255 --review
```

Done: 2026-10-21, commit `3a5e47d` (4 files, +460/-4). Odd columns sit half a row step, (tile + gap) / 2, lower — not "half a tile" as the feature document says — the only offset that keeps facing sides one gap apart; a press anywhere in the board's rectangle goes to the nearest tile centre.

## [x] 9. Implement task 256 — Hexagon boards, limits, identity and board-code token

Depends on: 7

Context:
- 2026-10-21 (from step 7): no-guess generation on Hexagon Expert (30 × 16, 123 mines) meets the attempt budget on only about 13–17% of seeds (dev/measure-noguess-hex.mjs); Beginner and Intermediate always do. The budget was left unchanged — a board-generation decision is pending.
- 2026-10-21 (amend): settled — Hexagon Expert is 30 × 16 with 100 mines and the attempt budget is unchanged (hexagon-grid § Scope and non-goals, board-generation § Attempt budget and timing); task 256's body carries it, including the Hexagon Expert no-guess tests in tests/generation-noguess.test.mjs and dev/measure-noguess-hex.mjs, which task 254 left at 123.

```prompt
/task-implement 256 --review
```

Done: 2026-10-24, commit `a2979de` (11 files, +307/-51). Hexagon Expert at 100 mines met the attempt budget on all 300 seeds measured; a Hexagon board code now parses, though no Hexagon mode exists yet to start from a `#board=` link.

## [x] 10. Implement task 257 — Update documentation for feature `hexagon-grid`

Depends on: 7, 8, 9

Context:
- 2026-10-21 (from step 8): the hexagon geometry lowers odd columns by half a row step, (tile + gap) / 2, not "half a tile" as the hexagon-grid feature document says; it hit-tests a press anywhere in the board rectangle to the nearest tile centre (ties to the lower index) — bring the document in line.
- 2026-10-21 (from step 7): task 254's commit already edited .claude/context/ (engine, generation, testing, INDEX) and hexagon-grid.md, including an open question on the Hexagon Expert no-guess budget — build on those edits rather than redo them.
- 2026-10-21 (amend): the Hexagon Expert no-guess question is settled and removed from hexagon-grid.md — Expert has 100 mines and the attempt budget is unchanged; record the Expert no-guess timing task 256 re-measures at 100 mines, not task 254's at 123.
- 2026-10-24 (from step 9): .claude/context/records-board-code.md still says "both modes' custom limits" — the board-code module now validates three modes (Classic 2D, Hexagon, 3D); the records and classic2d context files need the hexagon form, `STANDARD_BOARDS_HEX` (an equal copy in js/records/board.js, held equal by a test), the `H` token and js/hexagon/board-setup.js, which re-exports Classic 2D's validation. js/shell/challenge.js gained `hexagon: 'Hexagon'` in its mode names. Task 256 re-measured Hexagon Expert at 100 mines: the budget met on all 300 seeds, both first-click strategies.

```prompt
/task-implement 257 --review
```

Done: 2026-10-24, commit `5a17724` (10 files, +92/-40).

## [x] 11. Implement task 258 — Triangle graph provider and the `tri` generation description

Depends on: none

Context: none

```prompt
/task-implement 258 --review
```

Done: 2026-10-24, commit `fe2b426` (14 files, +590/-21). Decision: the triangle provider names each cell's orientation `orientation(index)`, returning `'up'` or `'down'`; premise wrong: the solver needed no change.

## [x] 12. Implement task 259 — Triangle geometry

Depends on: 1

Context:
- 2026-10-21 (from step 2): the board view's repaint walks only the cells between the viewport's top-left and bottom-right corners plus one row either side, so it assumes cells are numbered row by row — this geometry must number its cells the same way.
- 2026-10-24 (from step 11): the triangle graph provider exposes each cell's orientation as `orientation(index)`, returning `'up'` or `'down'` — build the geometry on that name.

```prompt
/task-implement 259 --review
```

Done: 2026-10-24, commit `285170f` (4 files, +527/-6). Premise wrong: triangles are spaced so every pair of facing sides is one gap apart (half a side plus 2·gap/√3 along a row), not "a half side apart plus the gap"; a press goes to the tile whose outline is nearest, not the nearest centre.

## [ ] 13. Implement task 260 — Triangle boards, limits, identity and board-code token

Depends on: 9, 11

Context:
- 2026-10-24 (from step 11): the triangle standard sizes are written out twice for now, in tests/generation-noguess.test.mjs and dev/measure-noguess-tri.mjs — point both at the Triangle board-setup module this task adds. Triangle Expert (41 × 17, 103 mines) met the attempt budget on all 1000 seeds measured.

```prompt
/task-implement 260 --review
```

## [ ] 14. Implement task 261 — Update documentation for feature `triangle-grid`

Depends on: 11, 12, 13

Context:
- 2026-10-24 (from step 11): task 258 left js/generation/solver.js unchanged (it already treats an over-budget frontier group as unconstrained) and closed the triangle-grid open question on Expert timing as settled — every one of 1000 seeds met the attempt budget (dev/measure-noguess-tri.mjs).
- 2026-10-24 (from step 12): the triangle geometry spaces tiles so every pair of facing sides is one gap apart — rows one triangle height plus the gap apart, tiles half a side plus 2·gap/√3 apart along a row — not "a half side apart plus the gap" as the feature document says; a press goes to the tile whose outline is nearest (ties to the lower index); the centre is the centroid and the glyph box is the square around the inscribed circle (side / √3); `minTile` is 44 and `tileCap(scale)` is the square cap × √3, rounded. .claude/context/geometry.md still lists only the square and hexagon kinds — bring both in line.

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

Context:
- 2026-10-24 (from step 12): the triangle geometry's centre is the triangle's centroid and its glyph box is the square around the inscribed circle (side / √3); it works out each cell's `'up'`/`'down'` orientation itself.

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

Context:
- 2026-10-23 (amend): task 268 was re-planned for the collapsible board choice panel (no Last played chip, Play-only foot, stored pin shared by every mode) and now waits on task 284, the m2b-themes Classic 2D panel, which this runbook does not run.

```prompt
/task-implement 268 --review
```

## [ ] 22. Implement task 269 — Play in Hexagon and Triangle

Depends on: 17, 21

Context:
- 2026-10-23 (amend): task 269 was re-planned for the new in-game window (Pause in the title bar, mode in the footer, live figures hidden by default, icon-only Restart) and now waits on task 286, the m2b-themes Classic 2D window, which this runbook does not run.

```prompt
/task-implement 269 --review
```

## [ ] 23. Implement task 270 — Board codes and challenge links for Hexagon and Triangle

Depends on: 21

Context:
- 2026-10-24 (from step 9): a hexagon board code already parses (js/records/board.js), so a `#board=` link carrying one tries to start a mode that does not exist until this task routes it.

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

Context:
- 2026-10-24 (from step 9): js/records/model.js's boards-played-by-mode code pairs `standardBoard` with the square `STANDARD_BOARDS` for every mode that is not 3D — it must use the list for the mode's grid (`STANDARD_BOARDS_HEX` for Hexagon), or Hexagon's standard boards sort as -1.

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

Context:
- 2026-10-23 (amend): task 277 was re-planned: the Hexagon and Triangle play tiles show their own cropped centre-of-board previews, with no tag and no Last played chip; it now waits on task 283, the m2b-themes main menu, which this runbook does not run.

```prompt
/task-implement 277 --review
```

## [ ] 31. Implement task 278 — Menu routes, last mode played and Daily for Hexagon and Triangle

Depends on: 21

Context:
- 2026-10-23 (amend): task 278 was re-planned: no Last played chip — only the menu's opening selection follows the last mode; it now waits on task 283 (m2b-themes main menu), which this runbook does not run.

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
