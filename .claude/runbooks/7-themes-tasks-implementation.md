# Runbook: themes-tasks-implementation

Created: 2026-10-13 · Source: /runbook-create interview (runbook themes-planning step 8) · Model: opus
Last step number: 51
Sequencing: Runs after the ux-review-tasks-implementation runbook is done and before the remaining steps of m3-tasks-implementation; steps follow PLAN.md's m2b-themes feature order, then task id.

## [ ] 1. Implement task 157 — Theme registry, kit catalogue and the Joyful tiles theme folder

Depends on: none

Context: none

```prompt
/task-implement 157 --review
```

## [ ] 2. Implement task 158 — Base stylesheet and the Joyful tiles theme stylesheet; retire light and dark

Depends on: 1

Context:
- 2026-10-13 (amend): Task 158 keeps the shipped `@media (prefers-reduced-motion: reduce)` rule in `css/style.css` unchanged — it is exempt from the no-animation-values test, and no theme stylesheet may override it (no `prefers-reduced-motion` rule, no `!important` animation or transition). Cell motion and the 2D/3D game effects ignore the preference; the full reduced-motion feature is `m7-after-launch`'s.

```prompt
/task-implement 158 --review
```

## [ ] 3. Implement task 159 — Registry-driven theme applier with run-time switch and board module hand-off

Depends on: 1, 2

Context: none

```prompt
/task-implement 159 --review
```

## [ ] 4. Implement task 160 — Settings theme list, light/dark carry-over and the reduced-motion setting

Depends on: 3

Context:
- 2026-10-13 (amend): Task 160 adds no reduced-motion setting; theme motion follows the operating system's `prefers-reduced-motion` preference, and the task is titled "Settings theme list and light/dark carry-over".
- 2026-10-13 (amend): Supersedes the fact above: reduced motion is deferred whole to `m7-after-launch`. Until then the game has no reduced-motion behaviour — no setting and no reading of the operating system's `prefers-reduced-motion` preference; theme motion always plays. Task 160 adds no settings field, root marker, accessibility section or preference read.
- 2026-10-13 (amend): Supersedes the fact above: the shipped `prefers-reduced-motion` rule in `css/style.css` stays (task 158 keeps it) and is the game's one reduced-motion behaviour until `m7-after-launch`; nothing new reads the preference. Task 160 still adds no settings field, root marker, accessibility section or preference read.

```prompt
/task-implement 160 --review
```

## [ ] 5. Implement task 161 — Theme conformance tests and the component gallery per theme

Depends on: 1, 2, 3

Context: none

```prompt
/task-implement 161 --review
```

## [ ] 6. Implement task 162 — Update documentation for feature `theme-system`

Depends on: 1, 2, 3, 4, 5

Context: none

```prompt
/task-implement 162 --review
```

## [ ] 7. Implement task 163 — Layout kit components: backdrop, screen frame, mode entry, board option, stat tile and the rest

Depends on: 2, 5

Context: none

```prompt
/task-implement 163 --review
```

## [ ] 8. Implement task 164 — 3D scene drawn into a screen's scene panel

Depends on: 7

Context: none

```prompt
/task-implement 164 --review
```

## [ ] 9. Implement task 165 — Main menu in the shared layout

Depends on: 7, 8

Context:
- 2026-10-19 (amend): Task 165 is rebuilt from the J-Menu artboards: nine entries (Hexagon, Triangle and Surface enabled, opening the Coming soon page), no Leaderboards entry, no Play again or session strip, the menu opening on the last mode played.

```prompt
/task-implement 165 --review
```

## [ ] 10. Implement task 166 — Classic 2D board choice screen with its records panel

Depends on: 7

Context:
- 2026-10-19 (amend): Task 166 is retitled "Classic 2D board choice screen with its bests, Insert Board Code and Custom Random" and rebuilt from the J-C2D artboards: no records panel; the board code is a board option played with Play; Custom gains Random.

```prompt
/task-implement 166 --review
```

## [ ] 38. Implement task 207 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: none

Context: none

```prompt
/task-implement 207 --review
```

## [ ] 39. Implement task 208 — Update documentation for feature `3d-play-flow`

Depends on: 38

Context: none

```prompt
/task-implement 208 --review
```

## [x] 11. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10

Needs: agent+human

Context: none

```prompt
/task-implement 167 --review
```

Done: struck — task 167 now also waits on task 207 (First box presets removed) and needs no human, its artboards being drawn; replaced by step 40.

## [ ] 40. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10, 38

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

## [ ] 41. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7

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

## [ ] 42. Implement task 169 — Results screen redesigned in the shared layout

Depends on: 7

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

## [ ] 43. Implement task 170 — Records screen in the shared layout, with its Leaderboards tab

Depends on: 7, 38

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

## [ ] 44. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7

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

## [ ] 45. Implement task 172 — Replay viewer in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 172 --review
```

## [ ] 36. Implement task 206 — Daily screen won time in the standard time format

Depends on: none

Context: none

```prompt
/task-implement 206 --review
```

## [ ] 46. Implement task 209 — Daily screen in the board-choice layout, listing every mode

Depends on: 7, 8, 10, 36

Context: none

```prompt
/task-implement 209 --review
```

## [ ] 47. Implement task 210 — 3D ready card, lock states and Learn 3D cards in the shared layout

Depends on: 7, 38

Context: none

```prompt
/task-implement 210 --review
```

## [ ] 48. Implement task 211 — Toasts, fatal card, no-JavaScript notice and 404 page in the shared layout

Depends on: 7

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

## [ ] 49. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 36, 40, 41, 42, 43, 44, 45, 46, 47, 48

Context: none

```prompt
/task-implement 173 --review
```

## [ ] 18. Implement task 174 — Live figures model: 3BV progress, pace vs PB, 3BV/s, clicks and flags

Depends on: none

Context: none

```prompt
/task-implement 174 --review
```

## [ ] 19. Implement task 175 — Counter readout and figures panel kit components

Depends on: 7

Context: none

```prompt
/task-implement 175 --review
```

## [ ] 20. Implement task 176 — Classic 2D game window: counter strip, side panel and foot line

Depends on: 7, 18, 19

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

## [ ] 50. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 20

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

## [ ] 51. Implement task 178 — Live figures in the replay viewer

Depends on: 16, 18, 19, 45

Context: none

```prompt
/task-implement 178 --review
```

## [ ] 23. Implement task 179 — Update documentation for feature `in-game-layout`

Depends on: 18, 19, 20, 21, 22

Context: none

```prompt
/task-implement 179 --review
```

## [ ] 24. Implement task 180 — Tile recipe drawing styles: bevel and chunky raised, with depth

Depends on: none

Context:
- 2026-10-15 (amend): Task 180 is retitled "Tile recipe drawing styles: bevel and flat, with depth" — *Joyful tiles* uses a flat style, not chunky raised.
- 2026-10-19 (amend): Supersedes the fact above: task 180 is retitled "Tile recipe drawing styles: flat and bevel, with corner radius and depth" — flat 2D tiles with a corner radius that scales with the tile, bevel 3D cubes with four lit sides (J-BoardSheet, J-3DSheet).

```prompt
/task-implement 180 --review
```

## [ ] 25. Implement task 181 — Board module shape, the Joyful tiles board module and the board conformance checks

Depends on: 5, 24

Context: none

```prompt
/task-implement 181 --review
```

## [ ] 26. Implement task 182 — Classic 2D tiles drawn from the active theme's board module

Depends on: 3, 25

Context: none

```prompt
/task-implement 182 --review
```

## [ ] 27. Implement task 183 — 3D cubes, numbers and sky drawn from the active theme's board module

Depends on: 3, 25

Context: none

```prompt
/task-implement 183 --review
```

## [ ] 28. Implement task 184 — Cell motion player

Depends on: 4, 25

Context: none

```prompt
/task-implement 184 --review
```

## [ ] 29. Implement task 185 — Classic 2D cell motion: motion layer and event sources

Depends on: 26, 28

Context: none

```prompt
/task-implement 185 --review
```

## [ ] 30. Implement task 186 — 3D cell motion: motion mesh, event sources and the solved pulse as a cell event

Depends on: 27, 28

Context: none

```prompt
/task-implement 186 --review
```

## [ ] 31. Implement task 187 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 24, 25, 26, 27, 28, 29, 30

Context: none

```prompt
/task-implement 187 --review
```

## [ ] 32. Implement task 188 — The theme-implement skill

Depends on: 5, 7, 19, 25

Context: none

```prompt
/task-implement 188 --review
```

## [ ] 33. Implement task 189 — Update documentation for feature `theme-implement-skill`

Depends on: 32

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
