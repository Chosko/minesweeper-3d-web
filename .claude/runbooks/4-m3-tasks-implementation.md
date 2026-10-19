# Runbook: m3-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 17) · Model: opus
Last step number: 35

## [x] 32. Implement task 115 — Three cube 3D presets and no no-guess on a side of 2

Depends on: none

Context: none

```prompt
/task-implement 115 --review
```

Done: 2026-10-11, commit `b6a5977` (14 files, +211/-156). A remembered double-layer choice falls back to cube Beginner via `normaliseChoice`, dropping its saved custom fields; the 3D board choice is now a single Cube menu (no second column).

## [x] 33. Implement task 116 — Update documentation for feature `3d-play-flow`

Depends on: 32

Context:
- 2026-10-11 (from step 32): `noGuessReason(choice)` now takes the choice (side-of-2 line on a custom board with a side of 2, else the cell-limit line); the 3D board choice is a single Cube menu (the `ui-grid` second column is gone); the double-layer replay fixture is kept as a custom 8×8×2 board. `mode3d.md`, `records.md` and `README.md` still describe six presets.

```prompt
/task-implement 116 --review
```

Done: 2026-10-11, commit `222b091` (7 files, +84/-66).

## [x] 34. Implement task 117 — Movement playback holds each sample, then interpolates

Depends on: none

Context: none

```prompt
/task-implement 117 --review
```

Done: 2026-10-11, commit `3788ef0` (7 files, +143/-40). The interval comes from a fixed per-format-version table, `sampleIntervalMs(version, mode)` in `js/replay/format.js`, so a later sampler change never alters old replays; a new format version needs its own row.

## [x] 35. Implement task 118 — Update documentation for feature `replay-playback`

Depends on: 34

Context:
- 2026-10-11 (from step 34): a decoded replay carries `sampleIntervalMs` (from `sampleIntervalMs(version, mode)` in `js/replay/format.js`, a per-format-version table: v1 2D 50 ms, 3D 100 ms; not stored in the blob); `movementTrack` and `cameraTrack` take the interval (fallback `SAMPLE_INTERVAL_MS`); `.claude/context/replay.md` does not yet describe either or the hold-then-interpolate rule.

```prompt
/task-implement 118 --review
```

Done: 2026-10-11, commit `4132d08` (4 files, +85/-53).

## [ ] 1. Implement task 84 — Electron main process: window, game protocol, window state and crash log

Depends on: none

Context: none

```prompt
/task-implement 84 --review
```

## [ ] 2. Implement task 85 — Steamworks capability adapter, unavailable implementation and the page bridge

Depends on: 1

Context: none

```prompt
/task-implement 85 --review --rounds 2
```

## [ ] 3. Implement task 86 — Page platform selection, capability flags, overlay pause and the quit flush

Depends on: 2

Context: none

```prompt
/task-implement 86 --review --rounds 2
```

## [ ] 4. Implement task 87 — Windows packaging and the SteamPipe private build

Depends on: 1

Needs: agent+human

Context: none

```prompt
/task-implement 87 --review
```

## [ ] 5. Implement task 88 — Steamworks binding spike

Depends on: 2, 4

Needs: agent+human

Context: none

```prompt
/task-implement 88 --review
```

## [ ] 6. Implement task 89 — Steam adapter implementation on the chosen binding

Depends on: 2, 3, 5

Needs: agent+human

Context: none

```prompt
/task-implement 89 --review --rounds 2
```

## [ ] 7. Implement task 90 — Update documentation for feature `steam-desktop-host`

Depends on: 1, 2, 3, 4, 5, 6

Context: none

```prompt
/task-implement 90 --review
```

## [ ] 8. Implement task 91 — Main-process file service and the bridge's storage and blob operations

Depends on: 2

Context: none

```prompt
/task-implement 91 --review --rounds 2
```

## [ ] 9. Implement task 92 — Steam document storage, Steam blob store and the quit flush

Depends on: 3, 8

Context: none

```prompt
/task-implement 92 --review
```

## [ ] 10. Implement task 93 — Steam Auto-Cloud configuration and quota

Depends on: 4, 9

Needs: agent+human

Context: none

```prompt
/task-implement 93 --review
```

## [ ] 11. Implement task 94 — Update documentation for feature `steam-cloud-saves`

Depends on: 8, 9, 10

Context: none

```prompt
/task-implement 94 --review
```

## [ ] 12. Implement task 95 — Leaderboard catalogue, eligibility and score details

Depends on: none

Context:
- 2026-10-11 (amend): task 95 was re-planned for the three 3D cube presets (12 catalogue boards, not 18) and waits on task 115, which step 32 runs.

```prompt
/task-implement 95 --review
```

## [ ] 13. Implement task 96 — Leaderboard outbox, verifier gate and submission state

Depends on: 12

Context: none

```prompt
/task-implement 96 --review --rounds 2
```

## [ ] 14. Implement task 97 — Steam submitter, best cache, reader and replay fetcher

Depends on: 6, 9, 13

Needs: agent+human

Context:
- 2026-10-11 (amend): task 97 was re-planned for 12 leaderboards, not 18, after the double-layer 3D presets were dropped.

```prompt
/task-implement 97 --review --rounds 2
```

## [ ] 15. Implement task 98 — Local leaderboards stand-in for the web build

Depends on: 3, 12

Context: none

```prompt
/task-implement 98 --review
```

## [ ] 16. Implement task 99 — Update documentation for feature `steam-leaderboards`

Depends on: 12, 13, 14, 15

Context: none

```prompt
/task-implement 99 --review
```

## [ ] 17. Implement task 100 — Achievement catalogue and evaluator

Depends on: none

Context:
- 2026-10-11 (amend): task 100 was re-planned for 14 achievements (a win on each of the three 3D cube presets) and waits on task 115, which step 32 runs.

```prompt
/task-implement 100 --review
```

## [ ] 18. Implement task 101 — Achievement unlocker, catch-up and the end-of-game hook

Depends on: 3, 17

Context: none

```prompt
/task-implement 101 --review
```

## [ ] 19. Implement task 102 — Steamworks achievement definitions, threshold calibration and overlay check

Depends on: 4, 6, 18

Needs: agent+human

Context: none

```prompt
/task-implement 102 --review
```

## [ ] 20. Implement task 103 — Update documentation for feature `steam-achievements`

Depends on: 17, 18, 19

Context: none

```prompt
/task-implement 103 --review
```

## [ ] 21. Implement task 104 — Leaderboard screen: board picker, scope tabs, entries and states

Depends on: 14, 15

Context:
- 2026-10-11 (amend): task 104 was re-planned so the 3D board picker lists the three cube presets only.
- 2026-10-13 (amend): task 104 was re-planned into the shared layout's screen frame: it now waits on task 163 (themes-tasks-implementation step 7) and is claude+human — the owner supplies the leaderboard screen's *Joyful tiles* artboard before any markup is written.
- 2026-10-19 (amend): task 104 also builds the rankings (scope tabs, own standing, entry list, states) as one part for a given board, which the Records Leaderboards tab of task 107 (step 24) shows in place.

```prompt
/task-implement 104 --review
```

## [ ] 22. Implement task 105 — Watch replay from a leaderboard entry

Depends on: 21

Context: none

```prompt
/task-implement 105 --review
```

## [ ] 23. Implement task 106 — Update documentation for feature `leaderboard-screen`

Depends on: 21, 22

Context: none

```prompt
/task-implement 106 --review
```

## [ ] 24. Implement task 107 — Leaderboards and Quit entries in the main menu

Depends on: 3, 21

Context:
- 2026-10-13 (amend): task 107 was re-planned so Leaderboards and Quit are mode entries of the redesigned main menu; it now waits on task 165 (themes-tasks-implementation step 9).
- 2026-10-19 (amend): Supersedes the fact above: task 107 is "Leaderboards tab in Records and Quit in the main menu" — Leaderboards is the Records screen's fourth tab, not a menu entry; the task also waits on task 170 (themes-tasks-implementation step 43) and is `claude+human`: the owner first decides how the tab shows the leaderboards.
- 2026-10-19 (amend): Supersedes the `claude+human` part of the fact above: the owner settled the tab — it shows the rankings of the board Records shows in place, inside Records — so task 107 is `claude` with no manual intervention; it reuses the rankings part of task 104 and also waits on task 105 (step 22).

```prompt
/task-implement 107 --review
```

## [ ] 25. Implement task 108 — Update documentation for feature `leaderboards-menu-entry`

Depends on: 24

Context: none

```prompt
/task-implement 108 --review
```

## [ ] 26. Implement task 109 — Steam rank panel on the results screen

Depends on: 3, 14

Context:
- 2026-10-09 (amend): task 109 also builds the results screen's *Leaderboard* action and now waits on task 104, the leaderboard screen (step 21).
- 2026-10-13 (amend): task 109 was re-planned into the framed results screen: it now waits on task 169 (themes-tasks-implementation step 13) and is claude+human — the owner supplies an artboard drawing the rank panel and the *Leaderboard* action.

```prompt
/task-implement 109 --review
```

## [ ] 27. Implement task 110 — Update documentation for feature `results-steam-rank`

Depends on: 26

Context: none

```prompt
/task-implement 110 --review
```

## [ ] 28. Implement task 111 — Action catalogue, bindings resolver and the bindings setting

Depends on: none

Context:
- 2026-10-13 (amend): task 111 now also switches the shared layout's key hints and the in-game controls reminder to the resolver, and waits on tasks 163, 176 and 177 (themes-tasks-implementation steps 7, 20 and 21).

```prompt
/task-implement 111 --review --rounds 2
```

## [ ] 29. Implement task 112 — Classic 2D and 3D input read their actions through the bindings

Depends on: 28

Context: none

```prompt
/task-implement 112 --review --rounds 2
```

## [ ] 30. Implement task 113 — Rebinding controls on the Settings page

Depends on: 28, 29

Context:
- 2026-10-13 (amend): task 113 was re-planned into the framed Settings page: it now waits on task 171 (themes-tasks-implementation step 15) and is claude+human — the owner supplies an artboard drawing the rebinding panels.

```prompt
/task-implement 113 --review
```

## [ ] 31. Implement task 114 — Update documentation for feature `input-rebinding`

Depends on: 28, 29, 30

Context: none

```prompt
/task-implement 114 --review
```
