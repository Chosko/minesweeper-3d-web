# Runbook: m1-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 15) · Model: opus
Last step number: 52

## [ ] 1. Implement task 1 — Token sheet with light and dark values

Depends on: none

Context: none

```prompt
/task-implement 1 --review
```

## [ ] 2. Implement task 2 — Theme applier and token reader

Depends on: 1

Context: none

```prompt
/task-implement 2 --review
```

## [ ] 3. Implement task 3 — Update documentation for feature `design-tokens-and-themes`

Depends on: 1, 2

Context: none

```prompt
/task-implement 3 --review
```

## [ ] 4. Implement task 4 — Cell graph and square-grid provider

Depends on: none

Context: none

```prompt
/task-implement 4 --review
```

## [ ] 5. Implement task 5 — Rules engine: game state, actions and the first-click hand-off

Depends on: 4

Context: none

```prompt
/task-implement 5 --review
```

## [ ] 6. Implement task 6 — Board metrics, click counts and the game summary

Depends on: 5

Context: none

```prompt
/task-implement 6 --review
```

## [x] 7. Implement task 7 — Fidelity tests for the reference ruleset

Depends on: 5, 6

Needs: agent+human

Context: none

```prompt
/task-implement 7 --review
```
Done: struck — Task 7 no longer needs a person (it reads tests/fidelity/minesweeper-online.md); the prompt runs as step 51, without the Needs: agent+human line.

## [ ] 51. Implement task 7 — Fidelity tests for the reference ruleset

Depends on: 5, 6

Context: none

```prompt
/task-implement 7 --review
```

## [ ] 8. Implement task 8 — Update documentation for feature `cell-graph-rules-engine`

Depends on: 4, 5, 6, 7

Context: none

```prompt
/task-implement 8 --review
```

## [ ] 9. Implement task 9 — Seeded source and standard mine placer

Depends on: 4, 5

Context: none

```prompt
/task-implement 9 --review
```

## [ ] 10. Implement task 10 — Logic-only solver

Depends on: 4

Context: none

```prompt
/task-implement 10 --review
```

## [ ] 11. Implement task 11 — No-guess generation loop and attempt budget

Depends on: 9, 10

Context: none

```prompt
/task-implement 11 --review
```

## [ ] 12. Implement task 12 — Generation worker and message protocol

Depends on: 11

Context: none

```prompt
/task-implement 12 --review
```

## [ ] 13. Implement task 13 — Update documentation for feature `board-generation`

Depends on: 9, 10, 11, 12

Context: none

```prompt
/task-implement 13 --review
```

## [ ] 14. Implement task 14 — Storage interface and document versioning

Depends on: none

Context: none

```prompt
/task-implement 14 --review
```

## [ ] 15. Implement task 15 — Browser storage implementation and start-up selection

Depends on: 14

Context: none

```prompt
/task-implement 15 --review
```

## [ ] 16. Implement task 16 — Update documentation for feature `platform-storage`

Depends on: 14, 15

Context: none

```prompt
/task-implement 16 --review
```

## [ ] 17. Implement task 17 — Component kit: styles, markup patterns and focus contract

Depends on: 1, 2

Context: none

```prompt
/task-implement 17 --review
```

## [ ] 18. Implement task 18 — In-game overlay bar component

Depends on: 17

Context: none

```prompt
/task-implement 18 --review
```

## [ ] 19. Implement task 19 — Main menu, pause card and results layout from the kit

Depends on: 17, 18

Context: none

```prompt
/task-implement 19 --review
```

## [ ] 20. Implement task 20 — Update documentation for feature `screen-components`

Depends on: 17, 18, 19

Context: none

```prompt
/task-implement 20 --review
```

## [ ] 21. Implement task 21 — Tile and number colour tokens

Depends on: 1

Context: none

```prompt
/task-implement 21 --review
```

## [ ] 22. Implement task 22 — Tile painter, tile cache and minimum tile size

Depends on: 2, 5, 21

Context: none

```prompt
/task-implement 22 --review
```

## [ ] 23. Implement task 23 — Update documentation for feature `square-tile-skin`

Depends on: 21, 22

Context: none

```prompt
/task-implement 23 --review
```

## [ ] 24. Implement task 24 — Screen router and shell navigation

Depends on: 19

Context: none

```prompt
/task-implement 24 --review
```

## [ ] 25. Implement task 25 — Mode host contract and the 3D adapter

Depends on: 24

Context: none

```prompt
/task-implement 25 --review
```

## [ ] 26. Implement task 26 — Main menu entries and the last mode played

Depends on: 15, 24, 25

Context: none

```prompt
/task-implement 26 --review
```

## [ ] 27. Implement task 27 — Pause controller, restart, back to menu and game hand-offs

Depends on: 25

Context: none

```prompt
/task-implement 27 --review
```

## [ ] 28. Implement task 28 — Update documentation for feature `game-shell`

Depends on: 24, 25, 26, 27

Context: none

```prompt
/task-implement 28 --review
```

## [ ] 29. Implement task 29 — Board identity, board key and display label

Depends on: none

Context: none

```prompt
/task-implement 29 --review
```

## [ ] 30. Implement task 30 — Summary builder, derived stats and best eligibility

Depends on: 6, 29

Context: none

```prompt
/task-implement 30 --review
```

## [ ] 31. Implement task 31 — Update documentation for feature `game-summary`

Depends on: 29, 30

Context: none

```prompt
/task-implement 31 --review
```

## [ ] 32. Implement task 32 — Classic 2D board setup, game session and timer

Depends on: 5, 6, 12, 15, 30

Context: none

```prompt
/task-implement 32 --review
```

## [ ] 33. Implement task 33 — Classic 2D Canvas board view

Depends on: 22, 32

Context: none

```prompt
/task-implement 33 --review
```

## [ ] 34. Implement task 34 — Classic 2D pointer input state machine

Depends on: 33

Context: none

```prompt
/task-implement 34 --review
```

## [ ] 35. Implement task 35 — Classic 2D keyboard and controller cursor

Depends on: 24, 33

Context: none

```prompt
/task-implement 35 --review
```

## [ ] 36. Implement task 36 — Classic 2D mode: board choice screen and shell integration

Depends on: 18, 26, 27, 32, 33

Context: none

```prompt
/task-implement 36 --review
```

## [x] 37. Implement task 37 — Classic 2D input fidelity tests

Depends on: 7, 34, 36

Needs: agent+human

Context: none

```prompt
/task-implement 37 --review
```
Done: struck — Task 37 no longer needs a person (it reads tests/fidelity/minesweeper-online.md); the prompt runs as step 52, without the Needs: agent+human line.

## [ ] 52. Implement task 37 — Classic 2D input fidelity tests

Depends on: 51, 34, 36

Context: none

```prompt
/task-implement 37 --review
```

## [ ] 38. Implement task 38 — Update documentation for feature `classic-2d-square-play`

Depends on: 32, 33, 34, 35, 36, 37

Context: none

```prompt
/task-implement 38 --review
```

## [ ] 39. Implement task 39 — Settings schema and store

Depends on: 15

Context: none

```prompt
/task-implement 39 --review
```

## [ ] 40. Implement task 40 — Settings appliers: theme, audio, look, resolution, fullscreen

Depends on: 2, 39

Context: none

```prompt
/task-implement 40 --review
```

## [ ] 41. Implement task 41 — Settings page and pause-card shortcuts

Depends on: 26, 27, 39, 40

Context: none

```prompt
/task-implement 41 --review
```

## [ ] 42. Implement task 42 — Update documentation for feature `settings`

Depends on: 39, 40, 41

Context: none

```prompt
/task-implement 42 --review
```

## [ ] 43. Implement task 43 — Records model: bests, counters, history and comparison

Depends on: 30

Context: none

```prompt
/task-implement 43 --review
```

## [ ] 44. Implement task 44 — Records store: persistence, recovery and the abandoned-game hook

Depends on: 15, 27, 43

Context: none

```prompt
/task-implement 44 --review
```

## [ ] 45. Implement task 45 — Update documentation for feature `personal-records`

Depends on: 43, 44

Context: none

```prompt
/task-implement 45 --review
```

## [ ] 46. Implement task 46 — Results flow and results view

Depends on: 19, 27, 36, 44

Context: none

```prompt
/task-implement 46 --review
```

## [ ] 47. Implement task 47 — Update documentation for feature `results-screen`

Depends on: 46

Context: none

```prompt
/task-implement 47 --review
```

## [ ] 48. Implement task 48 — Records view: board picker and figures

Depends on: 26, 44, 46

Context: none

```prompt
/task-implement 48 --review
```

## [ ] 49. Implement task 49 — Records history chart and recent games list

Depends on: 2, 48

Context: none

```prompt
/task-implement 49 --review
```

## [ ] 50. Implement task 50 — Update documentation for feature `records-screen`

Depends on: 48, 49

Context: none

```prompt
/task-implement 50 --review
```
