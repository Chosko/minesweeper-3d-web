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

## [x] 13. Implement task 260 — Triangle boards, limits, identity and board-code token

Depends on: 9, 11

Context:
- 2026-10-24 (from step 11): the triangle standard sizes are written out twice for now, in tests/generation-noguess.test.mjs and dev/measure-noguess-tri.mjs — point both at the Triangle board-setup module this task adds. Triangle Expert (41 × 17, 103 mines) met the attempt budget on all 1000 seeds measured.

```prompt
/task-implement 260 --review
```

Done: 2026-10-24, commit `e682ee0` (11 files, +299/-38). Decision: js/records/board-code.js keeps every 2D mode in one table (prefix `''`, `H` or `T`, grid, custom-limit check, standard boards).

## [x] 14. Implement task 261 — Update documentation for feature `triangle-grid`

Depends on: 11, 12, 13

Context:
- 2026-10-24 (from step 11): task 258 left js/generation/solver.js unchanged (it already treats an over-budget frontier group as unconstrained) and closed the triangle-grid open question on Expert timing as settled — every one of 1000 seeds met the attempt budget (dev/measure-noguess-tri.mjs).
- 2026-10-24 (from step 12): the triangle geometry spaces tiles so every pair of facing sides is one gap apart — rows one triangle height plus the gap apart, tiles half a side plus 2·gap/√3 apart along a row — not "a half side apart plus the gap" as the feature document says; a press goes to the tile whose outline is nearest (ties to the lower index); the centre is the centroid and the glyph box is the square around the inscribed circle (side / √3); `minTile` is 44 and `tileCap(scale)` is the square cap × √3, rounded. .claude/context/geometry.md still lists only the square and hexagon kinds — bring both in line.
- 2026-10-24 (from step 13): .claude/context/records.md, records-board-code.md, classic2d.md, testing.md and INDEX.md still describe only the hexagon board-code form — add the triangle form: js/records/board-code.js's one table of 2D modes (prefix `''`/`H`/`T`), js/triangle/board-setup.js, and "Triangle" in js/shell/challenge.js's mode names.

```prompt
/task-implement 261 --review
```

Done: 2026-10-24, commit `d086595` (9 files, +109/-60).

## [x] 15. Implement task 262 — Hexagon and triangle outlines in the tile recipe

Depends on: none

Context: none

```prompt
/task-implement 262 --review
```

Done: 2026-10-24, commit `edd7209` (3 files, +595/-20). Decision: for hexagon and triangle tiles the style's fractions and corner radius are measured against the tile's height; the recipe's triangle glyph box is 0.55 of the side, while js/geometry/tri.js's `glyphBox` is side / √3.

## [x] 16. Implement task 263 — Board module per-grid shape, numbers to 12, checks, and Joyful tiles' values

Depends on: 8, 12, 15

Context: none

```prompt
/task-implement 263 --review
```

Done: 2026-10-24, commit `49e7919` (6 files, +129/-22). Decision: the square grid keeps its gap and radius in `style2d.params`; hexagon and triangle shapes go in a new `style2d.grids: { hex, tri }`; `checkBoardModule` takes `floors: { square, hex, tri }` in place of `minTileSize`.

## [x] 17. Implement task 264 — The tile painter draws hexagon and triangle tiles

Depends on: 3, 15, 16

Context:
- 2026-10-24 (from step 12): the triangle geometry's centre is the triangle's centroid and its glyph box is the square around the inscribed circle (side / √3); it works out each cell's `'up'`/`'down'` orientation itself.
- 2026-10-24 (from step 15): conflict to settle — the tile recipe's triangle glyph box (js/tile-art.js `glyphBox`) is 0.55 of the side, as the task and feature document say, but the triangle geometry's `glyphBox` (js/geometry/tri.js) is side / √3 ≈ 0.577, and the 2D painter takes its box from the geometry; with the geometry's box triangle glyphs come out about 5% larger than the document says. The recipe takes `drawFace(..., { outline })` with `square`, `hexagon`, `triangle-up` or `triangle-down`, and exports `OUTLINES`, `outlineBox`, `outlinePoints`, `glyphBox` and `inGlyphBox(ctx, box, draw)`.
- 2026-10-24 (from step 16): the board module keeps the square grid's gap and corner radius in `style2d.params.gap`/`.radius` and the hexagon and triangle shapes in `style2d.grids: { hex: { gap, radius }, tri: { gap, radius } }` — read the square from `params` and the other two from `grids`; a triangle's fractions are of its tile height, though the triangle geometry measures its tile by its side; `GRID_NUMBERS` = `{ square: 8, hex: 6, tri: 12 }`. Whether numbers and glyphs read at each grid's floor was deferred to this task's browser test, which renders hexagon and triangle boards at each floor (checkBoardModule only checks relief there).

```prompt
/task-implement 264 --review
```

Done: 2026-10-24, commit `add9968` (7 files, +481/-145). Decision: triangle glyphs use the geometry's side / √3 box, so js/tile-art.js's `TRIANGLE_GLYPH` (0.55 of the side) and the feature document now disagree with the painter; the cursor ring and end-effect flash are still drawn around the tile's square box on hexagon and triangle boards; the tile-skin Expert fit-rule browser test is fixed.

## [x] 18. Implement task 265 — The theme skill reads Hexagon and Triangle board sheets

Depends on: 16

Context:
- 2026-10-24 (from step 16): the Joyful tiles canvas names the sheets `J-HexSheet` and `J-TriSheet`; the board module holds their shapes in `style2d.grids: { hex: { gap, radius }, tri: { gap, radius } }` (square stays in `style2d.params`), with triangle fractions of the tile height.

```prompt
/task-implement 265 --review
```

Done: 2026-10-24, commit `5a4b431` (7 files, +50/-24). Decision: a canvas missing a Hexagon or Triangle board sheet, or a Triangle sheet without numbers 9–12, stops the skill rather than asking — no rule derives a grid's gap and radius.

## [x] 19. Implement task 266 — Update documentation for feature `hex-tri-board-art`

Depends on: 15, 16, 17, 18

Context:
- 2026-10-24 (from step 15): the tile recipe (js/tile-art.js) takes an `outline` option on `drawFace` and exports `OUTLINES`, `outlineBox`, `outlinePoints`, `glyphBox` and `inGlyphBox`; a hexagon is sized across its flats, a triangle by its side; style fractions and corner radius are measured against the tile height; an angled bevel edge blends the shades of its two neighbouring sides.
- 2026-10-24 (from step 16): .claude/context/app-shell-board-module.md still describes numbers 1–8 and `minTileSize` — the board module now has `style2d.grids: { hex, tri }`, numbers to 12, `GRID_NUMBERS`, and `checkBoardModule({ floors: { square, hex, tri } })`.
- 2026-10-24 (from step 17): the painter draws triangle glyphs in the geometry's side / √3 box, while the hex-tri-board-art document and js/tile-art.js's `TRIANGLE_GLYPH` still say 0.55 of the side — settle the document on the geometry's box (via `/architect amend`) and flag `TRIANGLE_GLYPH`. classic2d-tile-skin.md and classic2d-board-view.md are stale: the "Square tile skin" title, `tileKey` now keyed by the recipe's outline name (`square`, `hexagon`, `triangle-up`, `triangle-down`), numbers past 8 (`OUTLINE_NUMBERS` in tile-skin.js, pinned to `GRID_NUMBERS`), and the gap read from `params` or `grids`; js/classic2d/motion-layer.js moves hexagon and triangle cells about their geometry centre; js/themes/board-module.js reads `GRID_UNIT` from the board view.
- 2026-10-24 (from step 18): task 265 already updated the number-colours bullet in .claude/domain/features/theme-implement-skill.md (1–12, with 9–12 from the Triangle board sheet); the theme skill stops on a missing Hexagon or Triangle board sheet and on a hexagon or triangle tile that differs from the 2D sheet in anything but gap and radius.

```prompt
/task-implement 266 --review
```

Done: 2026-10-24, commit `0eb1fbe` (12 files, +191/-78). The triangle glyph box was not settled: the hex-tri-board-art document and `TRIANGLE_GLYPH` in js/tile-art.js still say 0.55 of the side, while the painter uses the geometry's box.

## [x] 20. Implement task 267 — Flat mode configuration, with Classic 2D as the square configuration

Depends on: 2, 4, 5

Context: none

```prompt
/task-implement 267 --review
```

Done: 2026-10-24, commit `0d42cff` (8 files, +490/-81). Decision: the flat-mode configuration argument is optional everywhere and defaults to the square values, so existing calls still work; side limits and the size hint stay shared by every flat mode.

## [x] 21. Implement task 268 — Hexagon and Triangle modes with their board choice screens

Depends on: 8, 9, 12, 13, 20

Context:
- 2026-10-23 (amend): task 268 was re-planned for the collapsible board choice panel (no Last played chip, Play-only foot, stored pin shared by every mode) and now waits on task 284, the m2b-themes Classic 2D panel, which this runbook does not run.
- 2026-10-24 (from step 20): js/flat-modes.js builds `CLASSIC_2D` (equal to js/classic2d/board-setup.js's `SQUARE_SETUP`, held by a test); board setup and the board choice screen cannot import js/flat-modes.js (an import cycle, and tests/affected-tests.test.mjs forbids pulling the board view into the 3D tests). Two static tests constrain js/main.js: the Classic 2D registration keeps the literal `'classic-2d'` on one line, and `pin: BOARD_PANEL,` stays the last entry of the board choice call. Side limits and the "Width and height 1–100" hint are shared by every flat mode, not per configuration.

```prompt
/task-implement 268 --review
```

Done: 2026-10-24, commit `f010847` (21 files, +501/-70). Decision: the Hexagon and Triangle menu tiles open their own board choices, so browser tests that reached the Coming soon page through them go through Surface; the routes live in js/main.js's screen table, not js/shell/router.js.

## [x] 22. Implement task 269 — Play in Hexagon and Triangle

Depends on: 17, 21

Context:
- 2026-10-23 (amend): task 269 was re-planned for the new in-game window (Pause in the title bar, mode in the footer, live figures hidden by default, icon-only Restart) and now waits on task 286, the m2b-themes Classic 2D window, which this runbook does not run.
- 2026-10-24 (from step 17): on hexagon and triangle boards the cursor ring and the end effect's flash are still drawn around the tile's square box — no task's acceptance criteria cover them.
- 2026-10-24 (from step 21): Play on the Hexagon and Triangle board choices already starts the mode in the shared Classic 2D game window, but the parts of js/main.js that check for `classic-2d` do not handle these modes yet.

```prompt
/task-implement 269 --review
```

Done: 2026-10-24, commit `f9968f2` (14 files, +390/-46). Decision: Hexagon and Triangle games share Classic 2D's pause-card controls and first-use hints (dismissing the hint strip in one dismisses it in all three); until the Records screen knows these modes, Records from their results screen opens the last Classic 2D or 3D board played.

## [x] 23. Implement task 270 — Board codes and challenge links for Hexagon and Triangle

Depends on: 21

Context:
- 2026-10-24 (from step 9): a hexagon board code already parses (js/records/board.js), so a `#board=` link carrying one tries to start a mode that does not exist until this task routes it.
- 2026-10-24 (from step 13): a triangle board code (`T` prefix) now parses too, so a `#board=` link carrying one also needs this task's routing.
- 2026-10-24 (from step 20): the flat-mode configuration's code token is not read by anything yet — board codes still route through js/records/board-code.js's own table.
- 2026-10-24 (from step 21): the Hexagon and Triangle board choices' code fields already check codes live; starting a coded board is this task's.

```prompt
/task-implement 270 --review
```

Done: 2026-10-24, commit `055bca2` (3 files, +121/-5). Premise wrong: codes already routed to Hexagon and Triangle, so the commit adds only tests and a header comment; the flat-mode configuration's `codeToken` is still unread.

## [x] 24. Implement task 271 — Update documentation for feature `flat-grid-modes`

Depends on: 20, 21, 22, 23

Context:
- 2026-10-24 (from step 20): task 267 left the Classic 2D and shell context files for this task — js/flat-modes.js (`CLASSIC_2D`, the per-mode configuration, optional everywhere and defaulting to square) and `SQUARE_SETUP` in js/classic2d/board-setup.js.
- 2026-10-24 (from step 21): `#hex-choice` and `#tri-choice` in index.html copy `#c2d-choice` (a test holds them equal); every css/style.css and Joyful tiles rule styling Classic 2D's board choice also names its Hexagon and Triangle twins (enforced by a test); the routes are in js/main.js's screen table; task 268 already updated the menu-routing statements in .claude/context/app-shell-menu.md and INDEX.md, the rest of the context update is this task's.
- 2026-10-24 (from step 22): js/main.js now reaches the flat game through `flat2D()` (Classic 2D, Hexagon or Triangle); the pause card and help show Classic 2D's controls for all three; first-use hints are shared (`FIRST_USE_RECORD` in js/shell/first-use.js); the window title and the results board line lead with the mode's name from `MODE_NAMES` in js/shell/challenge.js; tests/flat-modes-play.test.mjs runs on every js/main.js, index.html or css/ change.
- 2026-10-24 (from step 23): board codes route through js/records/board-code.js's own table (`parseBoardCode` takes the mode from the `H`/`T` token) and `#board=` links reach the flat modes through `playChallenge`; the flat-mode configuration's `codeToken` is unread.

```prompt
/task-implement 271 --review
```

Done: 2026-10-24, commit `82bf37a` (17 files, +267/-109).

## [x] 25. Implement task 272 — Records model and summaries for Hexagon and Triangle

Depends on: 9, 13, 22

Context:
- 2026-10-24 (from step 9): js/records/model.js's boards-played-by-mode code pairs `standardBoard` with the square `STANDARD_BOARDS` for every mode that is not 3D — it must use the list for the mode's grid (`STANDARD_BOARDS_HEX` for Hexagon), or Hexagon's standard boards sort as -1.

```prompt
/task-implement 272 --review
```

Done: 2026-10-24, commit `26ce6a5` (10 files, +206/-43). Decision: the mode-to-grid check sits in `createBoardIdentity` (js/records/board.js), tying only Hexagon and Triangle to a grid; `RECORDS_VERSION` is 5 and `MODES` follows the menu order.

## [x] 26. Implement task 273 — Records screen's mode switch over four modes

Depends on: 25

Context:
- 2026-10-24 (from step 21): the Hexagon and Triangle board choices' *All records* link already opens the Records screen with a mode the screen does not list yet.
- 2026-10-24 (from step 22): js/results/flow.js guards Records from a Hexagon or Triangle results screen — it opens the last Classic 2D or 3D board played, since the screen crashed on an unknown mode; once this task adds the modes the board passes through with no further change there.
- 2026-10-24 (from step 25): js/records/board.js's `MODES` is `classic-2d`, `hexagon`, `triangle`, `3d` (menu order), with new `MODE_HEXAGON` and `MODE_TRIANGLE` exports; `EXPORT_MODES` in js/records/export.js and `FIRST_USE_MODES` in js/shell/first-use.js still list only `classic-2d` and `3d` — the step-25 reviewer assigned the exports to this task.

```prompt
/task-implement 273 --review
```

Done: 2026-10-24, commit `2552f3d` (16 files, +250/-91). Decision: an unknown mode opens Classic 2D rather than the last board played, and LT / RT step through the four modes, stopping at either end; premise wrong: `MODES` is defined in js/records/model.js, not board.js.

## [x] 27. Implement task 274 — Replay format version with `hex` and `tri`, and the 2D recorder over them

Depends on: 7, 11, 22

Context:
- 2026-10-24 (from step 20): a hexagon or triangle game records no replay today — the replay recorder accepts only square and 3D boards and fails silently on the others.

```prompt
/task-implement 274 --review
```

Done: 2026-10-24, commit `f16c098` (15 files, +389/-94). Decision: an unknown graph kind reads as "made by a newer version" only in a format-version-3 replay; the recorder refuses a graph kind that is not the board's grid at the start.

## [x] 28. Implement task 275 — Playback of Hexagon and Triangle replays

Depends on: 17, 27

Context:
- 2026-10-24 (from step 25): the replay viewer's title (js/replay/viewer.js, around line 614) still calls every non-3D replay "Classic 2D".
- 2026-10-24 (from step 27): replays are format version 3 with `hex` and `tri` graph kinds; the results screen already offers Watch replay after a Hexagon or Triangle game, but the viewer builds only square and 3D grids, so such a replay opens on the viewer's failure path until this task.

```prompt
/task-implement 275 --review
```

Done: 2026-10-24, commit `7831449` (12 files, +297/-31). Premise wrong: the 2D viewer, verifier and library were already grid-neutral; the replay strip names the mode only through the code chip's `H`/`T` token.

## [x] 29. Implement task 276 — Update documentation for feature `flat-grid-records-replays`

Depends on: 25, 26, 27, 28

Context:
- 2026-10-24 (from step 25): task 272 already updated .claude/context/records.md and records-store.md — `RECORDS_VERSION` 5 (the 4→5 step reuses `upgradeRecords`), the mode-to-grid check in `createBoardIdentity`, `MODES` in menu order, boards played by mode using each grid's own standard list.
- 2026-10-24 (from step 26): task 273 updated the Records context files; the older feature documents describing the original 2D | 3D switch (3d-results-records-screens, shared-screen-layout, leaderboard-screen) were left as they are. `EXPORT_MODES` is now `MODES` from js/records/model.js.
- 2026-10-24 (from step 27): task 274 already updated the passages that said Hexagon and Triangle games record no replay, including the flat-grid-modes feature document and app-shell-results.md; replays are format version 3 (the version 1 and 2 writers refuse a hex or tri graph).
- 2026-10-24 (from step 28): .claude/context/replay-viewer-screen.md and app-shell-replay.md still describe only the square and box viewers — js/main.js registers the 2D viewer for every flat grid kind through `FLAT_REPLAY_VIEWERS`, the simulator builds the `hex` and `tri` grids, and the replay title takes the mode's name from `MODE_NAMES`.

```prompt
/task-implement 276 --review
```

Done: 2026-10-25, commit `5030421` (9 files, +30/-24).

## [x] 30. Implement task 277 — Menu previews for Hexagon and Triangle

Depends on: 17, 21

Context:
- 2026-10-23 (amend): task 277 was re-planned: the Hexagon and Triangle play tiles show their own cropped centre-of-board previews, with no tag and no Last played chip; it now waits on task 283, the m2b-themes main menu, which this runbook does not run.

```prompt
/task-implement 277 --review
```

Done: 2026-10-25, commit `fc2dd5d` (15 files, +159/-79). Decision: a board preview names its grid as `{ kind: 'board', grid: 'square' | 'hex' | 'tri', ground: 'dark' }` and `demoBoard2D(grid)` builds that mode's seeded Intermediate board; no tile uses the badge preview any more.

## [x] 31. Implement task 278 — Menu routes, last mode played and Daily for Hexagon and Triangle

Depends on: 21

Context:
- 2026-10-23 (amend): task 278 was re-planned: no Last played chip — only the menu's opening selection follows the last mode; it now waits on task 283 (m2b-themes main menu), which this runbook does not run.

```prompt
/task-implement 278 --review
```

Done: 2026-10-25, commit `f5bcea6` (8 files, +92/-11). Premise wrong: the routes and the Daily list's *Coming soon* were already in place; decision: the Daily note for a mode with no daily board now reads "<Mode> has no daily board yet."

## [ ] 33. Implement task 280 — Hexagon and Triangle daily boards on the Daily screen

Depends on: 23, 26, 30, 31

Context:
- 2026-10-25 (from step 31): the Daily list shows *Coming soon* for any mode with no daily board, with the note "<Mode> has no daily board yet." (task 278 changed it from "… gets its own daily board when the mode arrives.").

```prompt
/task-implement 280 --review
```

## [ ] 32. Implement task 279 — Update documentation for feature `flat-grid-menu-entries`

Depends on: 30, 31

Context:
- 2026-10-25 (from step 30): task 277 already updated .claude/context/INDEX.md, app-shell-menu-preview.md, app-shell-markup.md, app-shell-kit.md and classic2d-board-view.md and the css/components.css catalogue — a board preview is `{ kind: 'board', grid, ground }`, `demoBoard2D(grid)` builds the seeded Intermediate board, and the badge preview is no longer used by any tile (the kit still accepts it).
- 2026-10-25 (from step 31): `createLastMode`'s `load()` reads a stored mode the host has not registered as none (main.js passes `modes.has`) — already recorded in .claude/context/app-shell-menu.md; the Daily note for a mode with no daily board reads "<Mode> has no daily board yet."

```prompt
/task-implement 279 --review
```

## Do not re-propose

- Hexagon/Triangle leaderboards, achievements, demo locks and colour-blind-safe numbers in m2c-flat-grids — rejected: they stay in m6-launch.
- Treating flat-grid-records-replays as a prerequisite of flat-grid-modes — rejected: flat-grid-records-replays depends on flat-grid-modes, as .claude/PLAN.md orders them; the flat-grid-modes document's Dependencies prose that lists flat-grid-records-replays is stale.
