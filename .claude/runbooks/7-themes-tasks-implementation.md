# Runbook: themes-tasks-implementation

Created: 2026-10-13 · Source: /runbook-create interview (runbook themes-planning step 8) · Model: opus
Last step number: 33
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

Context: none

```prompt
/task-implement 165 --review
```

## [ ] 10. Implement task 166 — Classic 2D board choice screen with its records panel

Depends on: 7

Context: none

```prompt
/task-implement 166 --review
```

## [ ] 11. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10

Needs: agent+human

Context: none

```prompt
/task-implement 167 --review
```

## [ ] 12. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 168 --review
```

## [ ] 13. Implement task 169 — Results screen in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 169 --review
```

## [ ] 14. Implement task 170 — Records screen in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 170 --review
```

## [ ] 15. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7

Needs: agent+human

Context: none

```prompt
/task-implement 171 --review
```

## [ ] 16. Implement task 172 — Replay viewer in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 172 --review
```

## [ ] 17. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16

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

## [ ] 21. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 20

Needs: agent+human

Context: none

```prompt
/task-implement 177 --review
```

## [ ] 22. Implement task 178 — Live figures in the replay viewer

Depends on: 16, 18, 19

Needs: agent+human

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

Context: none

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
