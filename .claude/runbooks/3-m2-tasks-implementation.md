# Runbook: m2-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 16) · Model: opus
Last step number: 33

## [x] 1. Implement task 51 — Box graph provider

Depends on: none

Context: none

```prompt
/task-implement 51 --review
```

Done: 2026-10-10, commit `4506451` (4 files, +351/-1). The box graph computes neighbours from 26 offsets and stores no neighbour lists (not `createCellGraph`); neighbour order at edges and corners follows the original 3D game, not ascending.

## [x] 2. Implement task 52 — 3D rule profile: revealed-cell flagging, chord, auto-hide and win

Depends on: 1

Context:
- 2026-10-10 (from step 1): `js/engine/box-grid.js` exports `createBoxGrid(X, Y, Z)`, returning a frozen `{ X, Y, Z, graph, index(i, j, k), coords(idx) }`; build on these names. The rules engine takes the rule profile by its name, not as an object.

```prompt
/task-implement 52 --review --rounds 2
```

Done: 2026-10-10, commit `f526267` (5 files, +747/-23). The 3D profile is `minesweeper-3d` (`PROFILE_3D`); under it `reveal()` on a revealed zero expands like a chord (not in the task body, needed by the original tests), and a chord through a wrong flag still opens every safe neighbour before losing, unlike the original game.

## [ ] 3. Implement task 53 — 3D state view and the large-board memory check

Depends on: 2

Context:
- 2026-10-10 (from step 2): the engine `state` carries `hidden`, a `Uint8Array` on every profile (set only by the 3D profile `minesweeper-3d`, `PROFILE_3D` in `js/engine/profiles.js`); the state view reads hidden cells from there.

```prompt
/task-implement 53 --review
```

## [ ] 4. Implement task 54 — 3D front-end on the shared engine and retirement of the 3D engine

Depends on: 3

Context: none

```prompt
/task-implement 54 --review --rounds 2
```

## [ ] 5. Implement task 55 — Update documentation for feature `3d-board-graph`

Depends on: 1, 2, 3, 4

Context: none

```prompt
/task-implement 55 --review
```

## [ ] 6. Implement task 56 — 3D board choice: presets, custom boards and the no-guess switch

Depends on: 4

Context: none

```prompt
/task-implement 56 --review
```

## [ ] 7. Implement task 57 — 3D game session: safe first click, generation and timer

Depends on: 4, 6

Context: none

```prompt
/task-implement 57 --review --rounds 2
```

## [ ] 8. Implement task 58 — No-guess cell-count limit for 3D boards

Depends on: 7

Context: none

```prompt
/task-implement 58 --review
```

## [ ] 9. Implement task 59 — 3D mode adapter on the session

Depends on: 7

Context: none

```prompt
/task-implement 59 --review
```

## [ ] 10. Implement task 60 — Update documentation for feature `3d-play-flow`

Depends on: 6, 7, 8, 9

Context: none

```prompt
/task-implement 60 --review
```

## [ ] 11. Implement task 61 — 3D board identity, board key and labels

Depends on: 6

Context:
- 2026-10-10 (from runbook m1-tasks-implementation, step 29): the m1 board-identity module in `js/records/board.js` (board key `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>`, `BOARD_KEY_FORMAT = 1`, plus `parseBoardKey`) requires a grid field, so it currently rejects a 3D board identity (no grid field, per `game-summary`). This task must extend it rather than add a parallel module.

```prompt
/task-implement 61 --review
```

## [ ] 12. Implement task 62 — 3D summaries and the 3D mode's summary hand-off

Depends on: 2, 9, 11

Context: none

```prompt
/task-implement 62 --review
```

## [ ] 13. Implement task 63 — Per-mode counters, mode-filtered board listing and the records format step

Depends on: 11

Context:
- 2026-10-10 (from runbook m1-tasks-implementation, step 43): the m1 records model already keeps overall counters per mode (`records.overall[mode]`, `overall(mode = 'classic-2d')`, `overallWinRate(mode)` in `js/records/model.js`); only `classic-2d` exists so far.

```prompt
/task-implement 63 --review --rounds 2
```

## [ ] 14. Implement task 64 — Update documentation for feature `3d-game-records`

Depends on: 11, 12, 13

Context: none

```prompt
/task-implement 64 --review
```

## [ ] 15. Implement task 65 — Replay format: header, streams, encoder and decoder

Depends on: 11

Context: none

```prompt
/task-implement 65 --review --rounds 2
```

## [ ] 16. Implement task 66 — Recorder and sealer

Depends on: 3, 15

Context: none

```prompt
/task-implement 66 --review --rounds 2
```

## [ ] 17. Implement task 67 — Classic 2D capture and the replay on the mode contract

Depends on: 16

Context: none

```prompt
/task-implement 67 --review
```

## [ ] 18. Implement task 68 — 3D capture: recorder and camera sampler

Depends on: 12, 16, 17

Context: none

```prompt
/task-implement 68 --review
```

## [ ] 19. Implement task 69 — Replay determinism tests and the measured recording constants

Depends on: 17, 18

Context: none

```prompt
/task-implement 69 --review --rounds 2
```

## [ ] 20. Implement task 70 — Update documentation for feature `replay-recording`

Depends on: 15, 16, 17, 18, 19

Context: none

```prompt
/task-implement 70 --review
```

## [ ] 21. Implement task 71 — Replay store: blob interface, in-memory and IndexedDB implementations

Depends on: none

Context: none

```prompt
/task-implement 71 --review
```

## [ ] 22. Implement task 72 — Replay library: index, retention, pinning and recovery

Depends on: 15, 21

Context: none

```prompt
/task-implement 72 --review --rounds 2
```

## [ ] 23. Implement task 73 — End-of-game hand-off to the replay library

Depends on: 13, 17, 18, 22

Context: none

```prompt
/task-implement 73 --review
```

## [ ] 24. Implement task 74 — Library view in the Records screen

Depends on: 22

Context: none

```prompt
/task-implement 74 --review
```

## [ ] 25. Implement task 75 — Update documentation for feature `replay-library`

Depends on: 21, 22, 23, 24

Context: none

```prompt
/task-implement 75 --review
```

## [ ] 26. Implement task 76 — Replay simulator and verifier

Depends on: 3, 15, 19

Context: none

```prompt
/task-implement 76 --review --rounds 2
```

## [ ] 27. Implement task 77 — Replay viewer screen with the 2D viewer, controls and overlay

Depends on: 22, 26

Context: none

```prompt
/task-implement 77 --review
```

## [ ] 28. Implement task 78 — 3D replay viewer

Depends on: 9, 27

Context: none

```prompt
/task-implement 78 --review
```

## [ ] 29. Implement task 79 — Watch replay on the results screen and from the library

Depends on: 23, 24, 27

Context: none

```prompt
/task-implement 79 --review
```

## [ ] 30. Implement task 80 — Update documentation for feature `replay-playback`

Depends on: 26, 27, 28, 29

Context: none

```prompt
/task-implement 80 --review
```

## [ ] 31. Implement task 81 — 3D end sequence and the results takeover

Depends on: 12, 18

Context: none

```prompt
/task-implement 81 --review
```

## [ ] 32. Implement task 82 — Records 2D | 3D switch and the 3D board picker

Depends on: 11, 13, 24

Context: none

```prompt
/task-implement 82 --review
```

## [ ] 33. Implement task 83 — Update documentation for feature `3d-results-records-screens`

Depends on: 31, 32

Context: none

```prompt
/task-implement 83 --review
```
