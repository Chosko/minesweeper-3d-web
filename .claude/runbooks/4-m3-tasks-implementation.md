# Runbook: m3-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 17) · Model: opus
Last step number: 27

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
/task-implement 85 --review
```

## [ ] 3. Implement task 86 — Page platform selection, capability flags, overlay pause and the quit flush

Depends on: 2

Context: none

```prompt
/task-implement 86 --review
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
/task-implement 89 --review
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
/task-implement 91 --review
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

Context: none

```prompt
/task-implement 95 --review
```

## [ ] 13. Implement task 96 — Leaderboard outbox, verifier gate and submission state

Depends on: 12

Context: none

```prompt
/task-implement 96 --review
```

## [ ] 14. Implement task 97 — Steam submitter, best cache, reader and replay fetcher

Depends on: 6, 9, 13

Needs: agent+human

Context: none

```prompt
/task-implement 97 --review
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

Context: none

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

Context: none

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

Context: none

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

Context: none

```prompt
/task-implement 109 --review
```

## [ ] 27. Implement task 110 — Update documentation for feature `results-steam-rank`

Depends on: 26

Context: none

```prompt
/task-implement 110 --review
```
