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

## [x] 3. Implement task 53 — 3D state view and the large-board memory check

Depends on: 2

Context:
- 2026-10-10 (from step 2): the engine `state` carries `hidden`, a `Uint8Array` on every profile (set only by the 3D profile `minesweeper-3d`, `PROFILE_3D` in `js/engine/profiles.js`); the state view reads hidden cells from there.

```prompt
/task-implement 53 --review
```

Done: 2026-10-10, commit `cd6ac10` (4 files, +339/-6). The shared engine uses about 37 bytes a cell on a 100³ board against the 3D engine's 24 (about 13 MB more); the size consequence is left open in `3d-board-graph.md` § Large-board memory. The view sees no change on its own: its driver must call `view.apply(result)` after every action.

## [x] 4. Implement task 54 — 3D front-end on the shared engine and retirement of the 3D engine

Depends on: 3

Context:
- 2026-10-10 (from step 3): the engine has no change hook, so the 3D state view (`js/engine/state-view-3d.js`, same field names as the old 3D engine plus `phase`) only updates when its driver calls `view.apply(result)` with every action's result, e.g. `view.apply(game.reveal(c))`; wire this in `js/main.js` or the renderer sees no change.

```prompt
/task-implement 54 --review --rounds 2
```

Done: 2026-10-10, commit `5b88d74` (11 files, +286/-797). The 3D game is built by `create3DGame` in `js/shell/mode-3d.js` (state view in `S.game`, actions in `S.play`); two behaviour changes are unrecorded in any feature document: a flag before the first click does nothing, and a 1×1×1 custom board gets 0 mines.

## [x] 5. Implement task 55 — Update documentation for feature `3d-board-graph`

Depends on: 1, 2, 3, 4

Context:
- 2026-10-10 (from step 4): `.claude/context/*` still describes the deleted `js/logic.js`; two behaviour changes need recording or deciding: right-click flagging before the first click now does nothing (the old engine allowed it), and a 1×1×1 custom board gets 0 mines with the info line "Mines must be 1–0".

```prompt
/task-implement 55 --review
```

Done: 2026-10-10, commit `c31e009` (11 files, +240/-220). The two step-4 behaviour changes are recorded in `app-shell.md`, not decided; `3d-board-graph.md` still calls the old 3D engine current (an /architect amend is needed).

## [x] 6. Implement task 56 — 3D board choice: presets, custom boards and the no-guess switch

Depends on: 4

Context:
- 2026-10-10 (from step 4): a 1×1×1 custom board cannot meet the 1-to-cells-minus-one mine range (it gets 0 mines, info line "Mines must be 1–0"); the custom-board rules here should settle it.

```prompt
/task-implement 56 --review
```

Done: 2026-10-10, commit `41326ce` (10 files, +764/-144). A 1×1×1 custom board is refused; there are two no-guess switches (presets always on, custom disabled above the limit), not the single one `3d-play-flow` describes; the last choice uses a new generic `createLastBoardChoice` in `js/shell/menu.js`.

## [x] 7. Implement task 57 — 3D game session: safe first click, generation and timer

Depends on: 4, 6

Context:
- 2026-10-10 (from step 6): the 3D board choice no longer reads or shows old best times; `recordBest` at the end of a 3D game is untouched and is this task's to handle.

```prompt
/task-implement 57 --review --rounds 2
```

Done: 2026-10-10, commit `328822e` (11 files, +1134/-162). Flags before the first reveal are held by the session (`js/mode3d/session.js`), not the engine, and applied before the reveal once the board arrives; `create3DGame` moved to `js/mode3d/session.js`; the generation worker gained the `box` board description.

## [x] 8. Implement task 58 — No-guess cell-count limit for 3D boards

Depends on: 7

Context:
- 2026-10-10 (from step 6): `NOGUESS_CELL_LIMIT` is a placeholder 1000, exported once from `js/mode3d/board-choice.js`; replace the value there.
- 2026-10-10 parked: The task was supposed to set the no-guess cell-count limit for custom 3D boards from a measurement. The measurement contradicts the premise: at the presets' densities (up to 16%), bigger boards need no more generation tries than small ones — every request from 10 × 10 × 10 to 70 × 70 × 70 succeeded within a few dozen of the 2000 allowed tries; only small, dense boards (4 × 4 × 4 to 6 × 6 × 6 at 15%) need hundreds. Successful requests: the slowest takes about 0.3 s at 1,000 cells, 0.5 s at 8,000, 1 s at 27,000, and 2–3 s at 125,000–343,000. Failed requests (a board too dense) use all 2000 tries before failing: 2–40 s at 1,000–125,000 cells, about 5–6 minutes at 1,000,000. So "a board at the limit answers within the attempt budget" holds at every size, and the limit has to be set by an acceptable wait instead.
  Second finding: a box with any axis exactly 2 cells long can never be a no-guess board — two stacked cells share every neighbour, so a mine in one is always a coin flip (8 × 8 × 2: 0 of 50 seeds, at every density). This includes the three double-layer presets, which the design says offer no-guess; a no-guess game on them always ends in the failure offer after several seconds. Work so far (`dev/measure-noguess-3d.mjs`) is on branch `park/task-58`; task 58 is `[PARKED]` in TASKS.md.
  Q1. What should set the no-guess cell-count limit?
    a. A short successful wait: 8,000 cells (20 × 20 × 20), where the slowest request at preset densities takes about 0.5 s.
    b. A one-second successful wait: 27,000 cells (30 × 30 × 30).
    c. No limit: no-guess on every custom board (1,000,000 cells), relying on the generating state and the failure offer. The disabled switch would never show, which changes the feature document's design.
    Recommendation: a.
  Q2. What happens to boards with a 2-cell axis, double-layer presets included?
    a. Leave them to a follow-up (`/architect amend feature=3d-play-flow "no-guess on boards with a 2-cell axis"`) and keep this task to the cell-count limit.
    b. Also disable no-guess on every board with a 2-cell axis in this task. That is a design change beyond the task's scope.
    Recommendation: a.
- 2026-10-10 unparked with answer: P1: Q1a, Q2a

```prompt
/task-implement 58 --review
```

Done: 2026-10-10, commit `00d38d6` (6 files, +105/-32). `NOGUESS_CELL_LIMIT` is 8,000 cells, set by an acceptable wait (about 0.5 s), not the attempt budget — the task's premise that the budget bounds it was wrong; boards with a 2-cell axis (double-layer presets included) can never be no-guess, left to an /architect amend.

## [x] 9. Implement task 59 — 3D mode adapter on the session

Depends on: 7

Context:
- 2026-10-10 (from step 7): `create3DGame` lives in `js/mode3d/session.js` (moved out of `js/shell/mode-3d.js` to avoid an adapter↔session import cycle); the adapter still reports `summary3d` fields.

```prompt
/task-implement 59 --review
```

Done: 2026-10-10, commit `96ea1e2` (5 files, +466/-238). The adapter still reports `summary3d` fields (now taking `{board, started, outcome, elapsedMs}` from the session), not the `game-summary` builder, per the task's own deferral; it listens to the session returned by `FLOW_3D.start`/`restart`.

## [x] 10. Implement task 60 — Update documentation for feature `3d-play-flow`

Depends on: 6, 7, 8, 9

Context:
- 2026-10-10 (from step 6): the board choice has two no-guess switches — one under the presets, always available, and one inside the custom panel, disabled above the cell limit — where `3d-play-flow` speaks of one; `.claude/context/app-shell.md` and `testing.md` still describe the old 3D board choice.
- 2026-10-10 (from step 7): `.claude/context/app-shell.md` still places `create3DGame` in `mode-3d.js` and best times in `localStorage`; `generation.md` lists only square boards, though the worker now takes a `box` description; the 3D timer is the session clock, starting when the board arrives.
- 2026-10-10 (from step 9): `.claude/context/app-shell.md` (around lines 144–150, 319–320) still describes the old `summary3d` signature, `snapshot` and `gameStarted`/`gameEnded`; `testing.md` (around line 332) still places the 3D adapter tests in `shell-mode-host` (they are in `tests/shell-mode-3d.test.mjs`).
- 2026-10-10 (from step 8): `3d-play-flow.md` § No-guess availability now states the 8,000-cell limit, set by wait; it still says every preset offers no-guess, though boards with a 2-cell axis (the double-layer presets) never can — that is left to `/architect amend feature=3d-play-flow`, not this task.

```prompt
/task-implement 60 --review
```

Done: 2026-10-10, commit `7560679` (11 files, +425/-137).

## [x] 11. Implement task 61 — 3D board identity, board key and labels

Depends on: 6

Context:
- 2026-10-10 (from runbook m1-tasks-implementation, step 29): the m1 board-identity module in `js/records/board.js` (board key `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>`, `BOARD_KEY_FORMAT = 1`, plus `parseBoardKey`) requires a grid field, so it currently rejects a 3D board identity (no grid field, per `game-summary`). This task must extend it rather than add a parallel module.

```prompt
/task-implement 61 --review
```

Done: 2026-10-10, commit `8deb5ef` (4 files, +294/-28). The 3D key is `3d:<w>x<h>x<d>:<mines>:<guess|no-guess>` (identity with mode `3d`, no grid); `BOARD_KEY_FORMAT` stays 1.

## [x] 12. Implement task 62 — 3D summaries and the 3D mode's summary hand-off

Depends on: 2, 9, 11

Context:
- 2026-10-10 (from step 9): the 3D adapter (`js/shell/mode-3d.js`) still reports `summary3d` fields (`{board, started, outcome, elapsedMs}`) rather than the `game-summary` builder; it listens to the session's `started`/`finished` events, the session being returned by `FLOW_3D.start`/`restart` in `js/main.js`.

```prompt
/task-implement 62 --review
```

Done: 2026-10-10, commit `c6ebe6c` (18 files, +404/-104). Finished 3D games are now records and reach the shared results screen immediately (before task 81): pointer lock stays on, "Play again" after Records → Back does nothing, and 3D boards can show in the 2D board list; a fixed debug board has no summary.

## [x] 13. Implement task 63 — Per-mode counters, mode-filtered board listing and the records format step

Depends on: 11

Context:
- 2026-10-10 (from runbook m1-tasks-implementation, step 43): the m1 records model already keeps overall counters per mode (`records.overall[mode]`, `overall(mode = 'classic-2d')`, `overallWinRate(mode)` in `js/records/model.js`); only `classic-2d` exists so far.
- 2026-10-10 (from step 11): `js/records/board.js` gained `MODE_3D`, `PRESETS_3D` (a tested copy of the presets in `js/mode3d/board-choice.js`) and `preset3D()`; the 3D key is `3d:<w>x<h>x<d>:<mines>:<guess|no-guess>`; `BOARD_KEY_FORMAT` stays 1 and `standardBoard()` still returns null for a 3D board — bumping the records format and 3D board ordering are this task's.
- 2026-10-10 (from step 12): finished and abandoned 3D games are already saved into the records file under 3D overall counters, before this task's format step — the step must expect 3D overall counters already present; 3D boards can also appear in the Records screen's 2D board list until per-mode listing lands.

```prompt
/task-implement 63 --review --rounds 2
```

Done: 2026-10-10, commit `4335f35` (6 files, +322/-38). Records format is version 2; the upgrade from 1 keeps 3D counters already present rather than zeroing them; the board list takes a mode defaulting to Classic 2D, so 3D boards no longer show in the 2D list.

## [ ] 14. Implement task 64 — Update documentation for feature `3d-game-records`

Depends on: 11, 12, 13

Context:
- 2026-10-10 (from step 11): `.claude/context/records.md` does not yet describe the 3D identity API added to `js/records/board.js` (`MODE_3D`, `PRESETS_3D`, `preset3D()`, the 3D key form).
- 2026-10-10 (from step 13): `.claude/context/` records, platform and testing files are untouched by task 63 — records format is version 2 (`upgradeRecords` adds zeroed 3D counters, keeping any already present), `emptyRecords()` holds both modes, and the board list takes a mode (default Classic 2D).

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

Context:
- 2026-10-10 (from step 12): finished 3D games already reach the shared results screen with no end delay; until this task: pointer lock stays on over it, and "Play again" does nothing after Records → Back. The debug hook's fixed 3D board has no seed or generator version, so its summary is null and it never reaches records or the results screen — a Playwright test that wins a fixed 3D board and expects the results screen must handle this.

```prompt
/task-implement 81 --review
```

## [ ] 32. Implement task 82 — Records 2D | 3D switch and the 3D board picker

Depends on: 11, 13, 24

Context:
- 2026-10-10 (from step 12): 3D boards can show up in the Records screen's 2D board list until the per-mode listing (task 63) and this switch land.
- 2026-10-10 (from step 13): the board list now takes a mode (default Classic 2D) and the Records screen calls it without one, so 3D boards no longer appear in the 2D list; step 12's note to the contrary no longer holds.

```prompt
/task-implement 82 --review
```

## [ ] 33. Implement task 83 — Update documentation for feature `3d-results-records-screens`

Depends on: 31, 32

Context: none

```prompt
/task-implement 83 --review
```
