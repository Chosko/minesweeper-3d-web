# Runbook: themes-tasks-implementation

Created: 2026-10-13 · Source: /runbook-create interview (runbook themes-planning step 8) · Model: opus
Last step number: 81

## [x] 1. Implement task 157 — Theme registry, kit catalogue and the Joyful tiles theme folder

Depends on: none

Context: none

```prompt
/task-implement 157 --review
```

Done: 2026-10-19, commit `2d774b9` (15 files, +561/-3). The two OFL licence files ship with their URL lines removed (copyright notices and licence text kept), so the theme folder holds no remote URL; buttons and menu entries carry default/selected/pressed/disabled, with hover and focus merged into selected.

## [x] 2. Implement task 158 — Base stylesheet and the Joyful tiles theme stylesheet; retire light and dark

Depends on: 1

Context:
- 2026-10-13 (amend): Task 158 keeps the shipped `@media (prefers-reduced-motion: reduce)` rule in `css/style.css` unchanged — it is exempt from the no-animation-values test, and no theme stylesheet may override it (no `prefers-reduced-motion` rule, no `!important` animation or transition). Cell motion and the 2D/3D game effects ignore the preference; the full reduced-motion feature is `m7-after-launch`'s.

```prompt
/task-implement 158 --review
```

Done: 2026-10-19, commit `ca8a74a` (29 files, +1959/-1527). The four tile tokens shared with the 2D tile skin keep the skin's values; the canvas spacing scale is not used; font sizes come from the canvas. The body's premise that the canvas draws every component in every state was wrong — the theme gives slider, segmented choice, field and link the switch's focus ring.

## [x] 3. Implement task 159 — Registry-driven theme applier with run-time switch and board module hand-off

Depends on: 1, 2

Context:
- 2026-10-19 (from step 2): `setTheme` is a no-op after task 158, and the `classic2d-view` browser check that the board repaints after a theme switch was removed; task 159 should restore it.

```prompt
/task-implement 159 --review
```

Done: 2026-10-19, commit `2b6ba85` (18 files, +810/-123). The importable switcher is a new `js/themes/applier.js` (`themeApplier()`); `globalThis.msTheme` is gone and `js/theme.js` stays the pre-paint classic script.

## [x] 4. Implement task 160 — Settings theme list and light/dark carry-over

Depends on: 3

Context:
- Task 160 adds no reduced-motion setting, settings field, root marker, accessibility section or preference read: the shipped `prefers-reduced-motion` rule in `css/style.css`, which task 158 keeps, is the game's one reduced-motion behaviour until `m7-after-launch`.
- 2026-10-19 (from step 2): the Settings page still offers Light / Dark after task 158, and choosing one changes nothing.
- 2026-10-19 (from step 3): the run-time switcher is `themeApplier()` in `js/themes/applier.js`; `globalThis.msTheme` no longer exists. A saved theme that fails at start-up shows the fallback notice once and is not retried when settings load.

```prompt
/task-implement 160 --review
```

Done: 2026-10-19, commit `fdc5b69` (15 files, +520/-99). The settings document is version 2; the theme setting accepts any id the registry knows (`isRegisteredTheme`). The swatch reads four colours from each theme stylesheet (`themeSwatchColors`), since a preview element scoped by theme id cannot work.

## [x] 5. Implement task 161 — Theme conformance tests and the component gallery per theme

Depends on: 1, 2, 3

Context:
- 2026-10-19 (from step 1): the OFL licence files in `themes/joyful-tiles/` had their URL lines stripped so no theme file references a remote URL; the no-URL check need not exclude `OFL-*.txt` unless that is reverted. `themes/joyful-tiles/board.js` uses a `/* */` header comment so a `//` scan does not trip on it; its export is `BOARD`. Catalogue selectors are each component's own single class, with a shared class in a `base` field.
- 2026-10-19 (from step 2): the canvas draws a focus state only for the switch and no hover/focus for the slider, segmented choice, field or link; the Joyful tiles theme gives those the switch's ring with a halo. Five buttons (swap clicks, Tap: Reveal/Flag, the three 3D touch view-mode buttons) carry `data-no-focus` and are skipped by hover-to-focus.

```prompt
/task-implement 161 --review
```

Done: 2026-10-19, commit `d6c6d81` (16 files, +659/-8). The required token list is `REQUIRED_TOKENS` in `js/ui/kit-catalogue.js`; a decoration slot is an element marked `data-slot="<name>"`. The premise that `tests/tokens.test.mjs` and `tests/components.test.mjs` export contrast helpers was wrong — the conformance file carries its own.

## [x] 6. Implement task 162 — Update documentation for feature `theme-system`

Depends on: 1, 2, 3, 4, 5

Context:
- 2026-10-19 (from step 3): `.claude/context/app-shell-kit.md` and `.claude/context/settings.md` still describe `globalThis.msTheme` and light/dark; the switcher now lives in `js/themes/applier.js` (`themeApplier()`), with a test-only `registerTheme` and a fixture theme under `tests/fixtures/themes/`.
- 2026-10-19 (from step 4): the settings document is version 2 (`js/theme.js` reads 1 and 2); the Settings theme list is a `ui-segmented--list` variant with a per-theme swatch; `--color-accent-fill` joined `REQUIRED_TOKENS`.

```prompt
/task-implement 162 --review
```

Done: 2026-10-19, commit `2fba8f2` (14 files, +287/-164).

## [~] 7. Implement task 163 — Layout kit components: backdrop, screen frame, mode entry, board option, stat tile and the rest

Depends on: 2, 5

Context:
- 2026-10-19 (from step 5): a decoration slot is an element marked `data-slot="<name>"`; the conformance check flags any `[data-slot=…]` a theme styles that the kit catalogue (`js/ui/kit-catalogue.js`) does not list — task 163 picks the slot names. A catalogue part can carry `as`, naming the component whose rules draw it.

```prompt
/task-implement 163 --review
```

## [ ] 8. Implement task 164 — 3D scene drawn into a screen's scene panel

Depends on: 7

Context: none

```prompt
/task-implement 164 --review
```

## [x] 9. Implement task 165 — Main menu in the shared layout

Depends on: 7, 8

Context:
- 2026-10-19 (amend): Task 165 is rebuilt from the J-Menu artboards: nine entries (Hexagon, Triangle and Surface enabled, opening the Coming soon page), no Leaderboards entry, no Play again or session strip, the menu opening on the last mode played.

```prompt
/task-implement 165 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 160, which edits the same files; replaced by step 53.

## [ ] 53. Implement task 165 — Main menu in the shared layout

Depends on: 4, 7, 8

Context: none

```prompt
/task-implement 165 --review
```

## [x] 10. Implement task 166 — Classic 2D board choice screen with its records panel

Depends on: 7

Context:
- 2026-10-19 (amend): Task 166 is retitled "Classic 2D board choice screen with its bests, Insert Board Code and Custom Random" and rebuilt from the J-C2D artboards: no records panel; the board code is a board option played with Play; Custom gains Random.

```prompt
/task-implement 166 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 165, which edits the same files; replaced by step 54.

## [ ] 54. Implement task 166 — Classic 2D board choice screen with its bests, Insert Board Code and Custom Random

Depends on: 7, 53

Context: none

```prompt
/task-implement 166 --review
```

## [x] 38. Implement task 207 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: none

Context: none

```prompt
/task-implement 207 --review
```

Done: struck — task 207 skipped, replaced by task 212 in feature shared-screen-layout (step 52), placed before steps 40, 43 and 47, whose tasks wait on it.

## [x] 39. Implement task 208 — Update documentation for feature `3d-play-flow`

Depends on: 38

Context: none

```prompt
/task-implement 208 --review
```

Done: struck — task 208 skipped; task 173 (step 49) documents task 212.

## [x] 52. Implement task 212 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: none

Context: none

```prompt
/task-implement 212 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 166, which edit the same files; replaced by step 55.

## [ ] 55. Implement task 212 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: 54

Context: none

```prompt
/task-implement 212 --review
```

## [x] 11. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10

Needs: agent+human

Context: none

```prompt
/task-implement 167 --review
```

Done: struck — task 167 now also waits on task 207 (First box presets removed) and needs no human, its artboards being drawn; replaced by step 40.

## [x] 40. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10, 38

Context: none

```prompt
/task-implement 167 --review
```

Done: struck — for a parallel run its Depends on named struck step 38; lacked the edge to task 212, its precondition; replaced by step 56.

## [ ] 56. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 54, 55

Context: none

```prompt
/task-implement 167 --review
```

## [x] 12. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 168 --review
```

Done: struck — task 168 needs no human, its artboards being drawn; replaced by step 41.

## [x] 41. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 168 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 167, 212, which edit the same files; replaced by step 57.

## [ ] 57. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7, 56

Context: none

```prompt
/task-implement 168 --review
```

## [x] 13. Implement task 169 — Results screen in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 169 --review
```

Done: struck — task 169 needs no human, its artboards being drawn; replaced by step 42.

## [x] 42. Implement task 169 — Results screen redesigned in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 169 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 168, which edits the same files; replaced by step 58.

## [ ] 58. Implement task 169 — Results screen redesigned in the shared layout

Depends on: 7, 57

Context: none

```prompt
/task-implement 169 --review
```

## [x] 14. Implement task 170 — Records screen in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 170 --review
```

Done: struck — task 170 now also waits on task 207 and needs no human, its artboards being drawn; replaced by step 43.

## [x] 43. Implement task 170 — Records screen in the shared layout, with its Leaderboards tab

Depends on: 7, 38

Context: none

```prompt
/task-implement 170 --review
```

Done: struck — for a parallel run its Depends on named struck step 38; lacked the edge to task 212, its precondition; lacked the order against task 169, which edits the same files; replaced by step 59.

## [ ] 59. Implement task 170 — Records screen in the shared layout, with its Leaderboards tab

Depends on: 7, 55, 58

Context: none

```prompt
/task-implement 170 --review
```

## [x] 15. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7

Needs: agent+human

Context: none

```prompt
/task-implement 171 --review
```

Done: struck — task 171 needs no human, its artboards being drawn; replaced by step 44.

## [x] 44. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7

Context: none

```prompt
/task-implement 171 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 170, which edit the same files; replaced by step 60.

## [ ] 60. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7, 59

Context: none

```prompt
/task-implement 171 --review
```

## [x] 16. Implement task 172 — Replay viewer in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 172 --review
```

Done: struck — task 172 needs no human, its artboards being drawn; replaced by step 45.

## [x] 45. Implement task 172 — Replay viewer in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 172 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 171, which edits the same files; replaced by step 61.

## [ ] 61. Implement task 172 — Replay viewer in the shared layout

Depends on: 7, 60

Context: none

```prompt
/task-implement 172 --review
```

## [x] 36. Implement task 206 — Daily screen won time in the standard time format

Depends on: none

Context: none

```prompt
/task-implement 206 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 165, which edits the same files; replaced by step 62.

## [ ] 62. Implement task 206 — Daily screen won time in the standard time format

Depends on: 53

Context: none

```prompt
/task-implement 206 --review
```

## [x] 46. Implement task 209 — Daily screen in the board-choice layout, listing every mode

Depends on: 7, 8, 10, 36

Context: none

```prompt
/task-implement 209 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 168, 172, which edit the same files; replaced by step 63.

## [ ] 63. Implement task 209 — Daily screen in the board-choice layout, listing every mode

Depends on: 7, 8, 54, 61, 62

Context: none

```prompt
/task-implement 209 --review
```

## [x] 47. Implement task 210 — 3D ready card, lock states and Learn 3D cards in the shared layout

Depends on: 7, 38

Context: none

```prompt
/task-implement 210 --review
```

Done: struck — for a parallel run its Depends on named struck step 38; lacked the edge to task 212, its precondition; lacked the order against tasks 168, 209, which edit the same files; replaced by step 64.

## [ ] 64. Implement task 210 — 3D ready card, lock states and Learn 3D cards in the shared layout

Depends on: 7, 55, 63

Context: none

```prompt
/task-implement 210 --review
```

## [x] 48. Implement task 211 — Toasts, fatal card, no-JavaScript notice and 404 page in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 211 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 210, which edit the same files; replaced by step 65.

## [ ] 65. Implement task 211 — Toasts, fatal card, no-JavaScript notice and 404 page in the shared layout

Depends on: 7, 64

Context: none

```prompt
/task-implement 211 --review
```

## [x] 17. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16

Context: none

```prompt
/task-implement 173 --review
```

Done: struck — task 173 waits on task 206, and its step lacked the edge to step 36; replaced by step 37.

## [x] 37. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 36

Context: none

```prompt
/task-implement 173 --review
```

Done: struck — task 173 now also waits on tasks 209, 210 and 211; replaced by step 49.

## [x] 49. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 36, 40, 41, 42, 43, 44, 45, 46, 47, 48

Context: none

```prompt
/task-implement 173 --review
```

Done: struck — for a parallel run its Depends on lacked the edge to task 212, its precondition; lacked the order against task 162, which edits the same files; replaced by step 66.

## [ ] 66. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 6, 7, 8, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65

Context: none

```prompt
/task-implement 173 --review
```

## [x] 18. Implement task 174 — Live figures model: 3BV progress, pace vs PB, 3BV/s, clicks and flags

Depends on: none

Context: none

```prompt
/task-implement 174 --review
```

Done: 2026-10-19, commit `d0d5dce` (4 files, +214/-2). Mines left stays signed (over-flagging shows "-2 mines left"), matching the overlay counter and pause card; `MINUS` is now exported from `js/results/view.js` and shared.

## [x] 19. Implement task 175 — Counter readout and figures panel kit components

Depends on: 7

Context: none

```prompt
/task-implement 175 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 211, which edit the same files; replaced by step 67.

## [ ] 67. Implement task 175 — Counter readout and figures panel kit components

Depends on: 7, 65

Context: none

```prompt
/task-implement 175 --review
```

## [x] 20. Implement task 176 — Classic 2D game window: counter strip, side panel and foot line

Depends on: 7, 18, 19

Context: none

```prompt
/task-implement 176 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 166, 211, which edit the same files; replaced by step 68.

## [ ] 68. Implement task 176 — Classic 2D game window: counter strip, side panel and foot line

Depends on: 7, 18, 67

Context: none

```prompt
/task-implement 176 --review
```

## [x] 21. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 20

Needs: agent+human

Context: none

```prompt
/task-implement 177 --review
```

Done: struck — task 177 needs no human, its artboards being drawn; replaced by step 50.

## [x] 50. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 20

Context: none

```prompt
/task-implement 177 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 210, which edits the same files; replaced by step 69.

## [ ] 69. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 68

Context: none

```prompt
/task-implement 177 --review
```

## [x] 22. Implement task 178 — Live figures in the replay viewer

Depends on: 16, 18, 19

Needs: agent+human

Context: none

```prompt
/task-implement 178 --review
```

Done: struck — task 178 needs no human, its artboards being drawn, and waits on the re-added step 45; replaced by step 51.

## [x] 51. Implement task 178 — Live figures in the replay viewer

Depends on: 16, 18, 19, 45

Context: none

```prompt
/task-implement 178 --review
```

Done: struck — for a parallel run its Depends on named struck step 16; lacked the order against task 177, which edits the same files; replaced by step 70.

## [ ] 70. Implement task 178 — Live figures in the replay viewer

Depends on: 18, 61, 67, 69

Context: none

```prompt
/task-implement 178 --review
```

## [x] 23. Implement task 179 — Update documentation for feature `in-game-layout`

Depends on: 18, 19, 20, 21, 22

Context: none

```prompt
/task-implement 179 --review
```

Done: struck — for a parallel run its Depends on named struck steps 21, 22; lacked the edges to tasks 177, 178, its preconditions; lacked the order against task 173, which edits the same files; replaced by step 71.

## [ ] 71. Implement task 179 — Update documentation for feature `in-game-layout`

Depends on: 18, 66, 67, 68, 69, 70

Context: none

```prompt
/task-implement 179 --review
```

## [x] 24. Implement task 180 — Tile recipe drawing styles: flat and bevel, with corner radius and depth

Depends on: none

Context:
- *Joyful tiles* draws flat 2D tiles with a corner radius that scales with the tile and bevel 3D cubes with four lit sides (J-BoardSheet, J-3DSheet).

```prompt
/task-implement 180 --review
```

Done: 2026-10-19, commit `eb90d70` (5 files, +675/-87). The sunk tile is a face of its own (`closed | sunk | revealed`), not a depth value; depth (0–1) scales the bevel slope on closed and sunk faces.

## [x] 25. Implement task 181 — Board module shape, the Joyful tiles board module and the board conformance checks

Depends on: 5, 24

Context: none

```prompt
/task-implement 181 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 157, 163, which edit the same files; replaced by step 72.

## [ ] 72. Implement task 181 — Board module shape, the Joyful tiles board module and the board conformance checks

Depends on: 5, 7, 24

Context:
- 2026-10-19 (from step 24): bevel side shades are numbers from −1 (`bevelDark`) to 1 (`bevelLight`); an in-between shade mixes colours and works only with `#rrggbb` palette values, so task 181's palettes must use that form. Flat reuses bevel's palette keys (`bevelLight`, `bevelDark`, `rim`), and flat's built-in values are placeholders for task 181 to set.

```prompt
/task-implement 181 --review
```

## [x] 26. Implement task 182 — Classic 2D tiles drawn from the active theme's board module

Depends on: 3, 25

Context: none

```prompt
/task-implement 182 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 175, 176, 177, 180, which edit the same files; replaced by step 73.

## [ ] 73. Implement task 182 — Classic 2D tiles drawn from the active theme's board module

Depends on: 3, 69, 72

Context: none

```prompt
/task-implement 182 --review
```

## [x] 27. Implement task 183 — 3D cubes, numbers and sky drawn from the active theme's board module

Depends on: 3, 25

Context: none

```prompt
/task-implement 183 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 158, 164, 180, 182, which edit the same files; replaced by step 74.

## [ ] 74. Implement task 183 — 3D cubes, numbers and sky drawn from the active theme's board module

Depends on: 3, 72, 73

Context: none

```prompt
/task-implement 183 --review
```

## [x] 28. Implement task 184 — Cell motion player

Depends on: 4, 25

Context: none

```prompt
/task-implement 184 --review
```

Done: struck — for a parallel run its Depends on waited on task 160, which neither a precondition nor a shared file needs; replaced by step 75.

## [ ] 75. Implement task 184 — Cell motion player

Depends on: 72

Context: none

```prompt
/task-implement 184 --review
```

## [x] 29. Implement task 185 — Classic 2D cell motion: motion layer and event sources

Depends on: 26, 28

Context: none

```prompt
/task-implement 185 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 172, 176, which edit the same files; replaced by step 76.

## [ ] 76. Implement task 185 — Classic 2D cell motion: motion layer and event sources

Depends on: 73, 75

Context: none

```prompt
/task-implement 185 --review
```

## [x] 30. Implement task 186 — 3D cell motion: motion mesh, event sources and the solved pulse as a cell event

Depends on: 27, 28

Context: none

```prompt
/task-implement 186 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 172, 177, which edit the same files; replaced by step 77.

## [ ] 77. Implement task 186 — 3D cell motion: motion mesh, event sources and the solved pulse as a cell event

Depends on: 74, 75

Context: none

```prompt
/task-implement 186 --review
```

## [ ] 78. Implement task 213 — 3D selection glow line, selected-face tint and confetti colours drawn from the board module

Depends on: 72, 74, 77

Context: none

```prompt
/task-implement 213 --review
```

## [x] 31. Implement task 187 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 24, 25, 26, 27, 28, 29, 30

Context: none

```prompt
/task-implement 187 --review
```

Done: struck — for a parallel run its Depends on lacked the edge to task 213, its precondition; lacked the order against tasks 173, 179, which edit the same files; replaced by step 79.

## [ ] 79. Implement task 187 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 24, 71, 72, 73, 74, 75, 76, 77, 78

Context:
- 2026-10-19 (from step 6): `.claude/domain/features/theme-system.md` records the placeholder board module and the to-do board-check test; remove those two sentences once `themed-board-art-and-motion` replaces them.

```prompt
/task-implement 187 --review
```

## [x] 32. Implement task 188 — The theme-implement skill

Depends on: 5, 7, 19, 25

Context: none

```prompt
/task-implement 188 --review
```

Done: struck — the steps its Depends on names are re-added for a parallel run; replaced by step 80.

## [ ] 80. Implement task 188 — The theme-implement skill

Depends on: 5, 7, 67, 72

Context: none

```prompt
/task-implement 188 --review
```

## [x] 33. Implement task 189 — Update documentation for feature `theme-implement-skill`

Depends on: 32

Context: none

```prompt
/task-implement 189 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 187, which edits the same files; replaced by step 81.

## [ ] 81. Implement task 189 — Update documentation for feature `theme-implement-skill`

Depends on: 79, 80

Context: none

```prompt
/task-implement 189 --review
```

## [x] 34. Implement task 204 — Daily screen won time in the standard time format

Depends on: none

Context: none

```prompt
/task-implement 204 --review
```

Done: struck — task 204 replaced by task 206, step 36, placed before step 17 because task 173 waits on it.

## [x] 35. Implement task 205 — Update documentation for feature `game-shell`

Depends on: 34

Context: none

```prompt
/task-implement 205 --review
```

Done: struck — task 205 dropped; task 173 documents the Daily won time.
