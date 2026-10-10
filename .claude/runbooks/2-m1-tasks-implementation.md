# Runbook: m1-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 15) · Model: opus
Last step number: 55
Archive: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52

## [x] 53. Fix the Classic 2D keyboard/controller cursor ring if it is invisible

Depends on: none

Context: none

```prompt
/quick-implement "Make the Classic 2D keyboard/controller cursor ring visible. When step 36 of this runbook (task 36) was implemented, a Playwright screenshot taken after an arrow-key move on a Classic 2D board showed no visible cursor ring. The cause is unverified; the suspicion is that `--color-focus-ring` and `--color-tile-edge` in `css/tokens.css` are both `#3f78e0`, so the ring the board view draws via `setCursor` blends into the tile edges. First reproduce it in a real browser: open Classic 2D, start a Beginner board, move the cursor with the arrow keys, and screenshot in both light and dark themes. If the ring is in fact visible, report that and make no change. If it is not, fix it with the smallest change (a distinct ring colour or a thicker/offset ring), keep every contrast check in `tests/tokens.test.mjs` passing, and add a browser test that asserts the ring pixels differ from the tile edge after an arrow-key move." feature=classic-2d-square-play
```

Done: 2026-10-10, commit `0fbb8a6` (5 files, +113/-7). The light-theme ring was invisible (dark was fine); the ring now draws in a new board-only token `--color-tile-cursor` (light #14233f, dark #93b6f6), leaving `--color-focus-ring` unchanged.

## [ ] 54. Settle a pending generation request when the worker reply cannot be decoded

Depends on: none

Context: none

```prompt
/quick-implement "In `js/generation/client.js`, handle the worker's `messageerror` event. Today a reply the page cannot decode leaves the pending `request()` promise waiting until `cancel()` is called (raised by the reviewer of task 12, deliberately left unfixed then). On `messageerror`, settle the pending request exactly as a worker failure is settled today — `request` rejects only when the worker itself fails, so reject it the same way — and leave the client ready for the next request. Add a Node unit test with a fake worker that emits `messageerror`." feature=board-generation
```

## [ ] 55. Add a controller browser test for the board-choice and coming-soon screens

Depends on: none

Context: none

```prompt
/quick-implement "Add a Playwright browser test that drives the shell with a controller only, through a fake gamepad (stub `navigator.getGamepads` in the page). Cover the 3D `board-choice` screen (`#board-choice`, reached from the main menu's 3D entry): move between presets, confirm one, and press Back to return to the menu. Cover the `coming-soon` placeholder (`#coming-soon`): no current menu entry reaches it any more, since every entry has its own screen, so reach it the way the router falls back for a screen that is not registered, and check that Back leaves it. Controller navigation lives in `js/shell/navigation.js`; the Back button means Back in menus. This gap was deferred by the review of task 26. Test-only: change no production code unless the test exposes a real bug, and report any such bug." feature=game-shell
```
