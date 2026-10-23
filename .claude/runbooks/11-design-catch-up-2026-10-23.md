# Runbook: design-catch-up-2026-10-23

Created: 2026-10-23 · Source: /design-catch-up (design changelog entries 2026-10-23 13:13 to 18:08) · Model: opus
Last step number: 9
Parallelism: 4

## [ ] 1. Implement task 281 — Button colour rule: go and stop buttons

Depends on: none

Context: none

```prompt
/task-implement 281 --review
```

## [ ] 2. Implement task 282 — Window title bar and game logo on every screen

Depends on: 1

Context: none

```prompt
/task-implement 282 --review
```

## [ ] 3. Implement task 283 — Main menu redesign: play tiles with their own previews

Depends on: 2

Context: none

```prompt
/task-implement 283 --review
```

## [ ] 4. Implement task 284 — Collapsible board choice panel, Classic 2D and 3D

Depends on: 2, 3

Context: none

```prompt
/task-implement 284 --review
```

## [ ] 5. Implement task 286 — Classic 2D game window: title bar with Pause, mode in the footer, collapsed live figures

Depends on: 1, 2, 4

Context: none

```prompt
/task-implement 286 --review
```

## [ ] 6. Implement task 287 — 3D game overlay without a title: floating Pause and live-figures toggle

Depends on: 5

Context: none

```prompt
/task-implement 287 --review
```

## [ ] 7. Implement task 285 — Update documentation for feature shared-screen-layout

Depends on: 1, 2, 3, 4

Context: none

```prompt
/task-implement 285 --review
```

## [ ] 8. Implement task 288 — Update documentation for feature in-game-layout

Depends on: 5, 6

Context: none

```prompt
/task-implement 288 --review
```

## [ ] 9. Update the Joyful tiles theme from its canvas

Depends on: 3, 4, 6

Context: none

```prompt
/theme-implement https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC joyful-tiles

This is an update of the registered Joyful tiles theme from the "Minesweeper 3D Screens" canvas, after tasks 281–288 built the kit parts the design changelog entries of 2026-10-23 (13:13 to 18:08) added: the go and stop button variants, the title bar and game logo, the main menu buttons, the board choice panel toggle and drawer, the live-figures toggle. The values those entries left to the theme are: the main menu buttons' pastel and stronger-neutral tokens (J-Tokens, "Menu entry pastels"), their smaller edge with no drop shadow, the slimmer large confirm buttons, and the go / stop colours resting in a stronger pastel and taking the full colour when selected (J-Components). When the canvas needs a part the contract cannot express, stop as the skill says and name the task needed.
```
