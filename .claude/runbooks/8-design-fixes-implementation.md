# Runbook: design-fixes-implementation

Created: 2026-10-20 · Source: /runbook-create interview · Model: opus
Last step number: 34

## [x] 1. Implement task 214 — Full test runs reliable again: the stale counter test, the random first click, the theme-switch flakes and the slow components file

Depends on: none

Context: none

```prompt
/task-implement 214 --review
```

Done: 2026-10-20, commit `b99a4b4` (13 files, +625/-399). Premise wrong: the slow tier is still not reliable — `render-3d-feedback`'s `[slow]` Ctrl-ghost test failed in both slow runs and `shell-focus-containment` timed out once, outside this task's files; only the classic2d mid-game theme-switch flake reproduced (fixed seed), the other two named theme-switch tests never failed and no product change was made for them.

## [x] 2. Implement task 215 — Settings page tests hold with more than one shipped theme

Depends on: 1

Context: none

```prompt
/task-implement 215 --review
```

Done: 2026-10-20, commit `c544e97` (4 files, +94/-58).

## [x] 3. Implement task 216 — Theme switch keeps every font weight the new theme declares loaded in Chromium

Depends on: 1

Context:
- 2026-10-20 (from step 1): task 214 found no cause for the `classic2d-view` large-scrolled and `theme.test.mjs` theme-switch flakes (never reproduced) and changed no product code for them; it did not cover the font unload.

```prompt
/task-implement 216 --review
```

Done: 2026-10-20, commit `504b397` (10 files, +247/-14). Decision: the applier re-loads the new theme's declared fonts after removing the old stylesheet, and a failed re-load goes to the error handler without undoing the switch; `tests/components-pause.test.mjs`'s contrast test is flaky on the base too.

## [x] 4. Implement task 217 — UX-review scripts follow the current board-choice markup

Depends on: 1

Context: none

```prompt
/task-implement 217 --review
```

Done: 2026-10-20, commit `f167ac2` (48 files, +92/-92). Premise wrong: the hint list missed many scripts; every Classic 2D preset click now also clicks Play. Scripts still stall on drift no task covers yet: custom boards the game now refuses, and `#hint-h`, `#p-restart`, the 2D `#hud-pause` and a removed 3D preset.

## [x] 5. Implement task 218 — Kit buttons: md size, key hint ink, quiet variant, latched toggles, danger variant

Depends on: 1

Context: none

```prompt
/task-implement 218 --review
```

Done: 2026-10-20, commit `e0548f7` (16 files, +298/-48). Premise wrong: the danger variant already existed; only Delete replay and Reset all data moved to it. Only the four named toggles became latched quiet toggles (their on state reuses the catalogue's `chosen`); Tap: Reveal/Flag and the replay's Sound stay secondary. Show 3BV keeps a stale `aria-pressed` into the next replay (pre-existing, no task).

## [x] 6. Implement task 219 — Kit form controls: switch, switch row, slider fill, number field, invalid state, focus halo

Depends on: 1

Context: none

```prompt
/task-implement 219 --review
```

Done: 2026-10-20, commits `f6d1394`, `0cd4696` (23 files, +563/-118). Premise wrong: styling the board option on `:focus-visible` alone does not work in Chromium after a mouse click; `js/main.js` now sets `body.pointer-nav` on mouse input and the theme keys the selected look on it. The focus halo is `!important`; `STATES` gains `invalid` and `REQUIRED_TOKENS` `--slider-fill`.

## [x] 7. Implement task 220 — Kit icon set and leading-icon slot

Depends on: 5

Context: none

```prompt
/task-implement 220 --review
```

Done: 2026-10-20, commit `b20dc22` (9 files, +411/-13). Decisions: one icon set, `ICONS` in `js/ui/components.js`, drawn from `data-icon` by `applyIcons(root)` or through `createButton`/`setButtonIcon`; nothing calls `applyIcons` yet; the code chip's icons are left to task 222.

## [x] 8. Implement task 221 — Kit feedback parts: confirm box, warn and err notes

Depends on: 5, 7

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.
- 2026-10-20: the run paused with this step mid-implementation (code and tests written, full suite and `--review` round not run). The work is a WIP commit on branch `wt/runbook-8-step-8` (pushed), with a handoff at `.claude/sessions/2026-10-20-runbook-8-step-8-task-221-handoff.md` on that branch. Resume from it: soft-reset the WIP commit, finish verification and the review round, then make the task's one commit.

```prompt
/task-implement 221 --review
```

Done: 2026-10-20, commit `788aeeb` (38 files, +594/-182). Decisions: `js/main.js` now calls `applyIcons(document.body)`; the Records delete confirmation keeps its `deleteMessage` wording; a board code from the other mode stays valid (only a refused code is invalid); the reset-failure line and `settings.md` changed together.

## [~] 9. Implement task 222 — Kit surfaces: plain stat tile, muted panel, tables, pager, code chip

Depends on: 5, 7

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`. The code chip's 14px icons were left to this task: `createCodeChip` adds none yet.
- 2026-10-20: the run paused with this step mid-implementation (code and tests written, full suite and `--review` round not run). The work is a WIP commit on branch `wt/runbook-8-step-9` (pushed), with a handoff at `.claude/sessions/2026-10-20-runbook-8-step-9-task-222-handoff.md` on that branch. Resume from it: soft-reset the WIP commit, finish verification and the review round, then make the task's one commit.

```prompt
/task-implement 222 --review
```

## [~] 10. Implement task 223 — Kit frames: head and foot steps, white action foot, message cards, scrims, status cards

Depends on: 5, 7

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.
- 2026-10-20: the run paused with this step mid-implementation (code and tests written, full suite and `--review` round not run). The work is a WIP commit on branch `wt/runbook-8-step-10` (pushed), with a handoff at `.claude/sessions/2026-10-20-runbook-8-step-10-task-223-handoff.md` on that branch. Resume from it: soft-reset the WIP commit, finish verification and the review round, then make the task's one commit.

```prompt
/task-implement 223 --review
```

## [x] 11. Implement task 224 — Board module: 2D numbers, 2D end effect from the module, theme token cleanup

Depends on: 1

Context: none

```prompt
/task-implement 224 --review
```

Done: 2026-10-20, commit `d43ceec` (29 files, +526/-214). Premises wrong: the canvas's 2D number colours fail the old every-point contrast rule, so the 2D list is now checked against the 2D revealed face and its shade only; the right bevel is not on the face–bevelDark line, so `tile-art.js` takes an exact bevel colour (Joyful's pressed 3D right slope becomes #92c2ff). The number list is split into `numbers2d`/`numbers3d` and a new `end2d` entry added.

## [x] 12. Implement task 225 — Board module motion tracks: opacity, flip, scale and brightness

Depends on: 11

Context: none

```prompt
/task-implement 225 --review
```

Done: 2026-10-20, commit `5921b67` (10 files, +201/-33). Premise wrong: the contract and player already had scale, flip, brightness and opacity; the change is brightness as a mix toward white/black in `motion-layer.js` plus Joyful keyframes. Press and chord press now cut to the pressed face at 90 ms, and a press held past 90 ms jumps back to rest (no task yet).

## [x] 13. Implement task 226 — 2D tile art: glyphs, hairline, start cell, flat widths and the cursor ring outside the tile

Depends on: 11

Context: none

```prompt
/task-implement 226 --review
```

Done: 2026-10-20, commit `f150d4d` (20 files, +627/-242). Decisions: the cursor ring sits on a third `board-ring` canvas passed as `createBoardView`'s `overlay` option; the start cell is a new `marked` tile state (a flagged or pressed start cell draws as flagged/pressed); flat `hairline` is now in CSS px; mine glyph proportions are the agent's own, since the canvas sprites could not be fetched.

## [x] 14. Implement task 227 — Board frame and framed previews

Depends on: 11

Context: none

```prompt
/task-implement 227 --review
```

Done: 2026-10-20, commits `4408553`, `f9e0595` (24 files, +405/-153). Decisions: previews and the replay viewer mount with `framed: true` and the view builds the frame; a scrolling board shows no frame and is clipped at `--board-viewport-radius`; the replay viewer always fits the whole board; the menu (1024×768) and replay (1920×1080) preview tile sizes are left unpinned for tasks 228 and 239.

## [ ] 15. Implement task 228 — Main menu: mode entries, scene panel, per-size layout, build label and scroll

Depends on: 7, 10

Context:
- 2026-10-20 (from step 14): task 227 left the menu's preview tile size unpinned — at 1024×768 it draws 27 px where the criteria give 23, and the Daily focus 28 px / 933 px wide against 27 px / about 872 px; this task's layout should pin them.
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.

```prompt
/task-implement 228 --review
```

## [ ] 16. Implement task 229 — Daily screen to the canvas

Depends on: 9, 10, 14, 15

Context: none

```prompt
/task-implement 229 --review
```

## [ ] 17. Implement task 230 — Board choice screens to the canvas

Depends on: 6, 8, 9, 10

Context: none

```prompt
/task-implement 230 --review
```

## [ ] 18. Implement task 231 — Classic 2D window layout and HUD density

Depends on: 10, 14

Context: none

```prompt
/task-implement 231 --review
```

## [ ] 19. Implement task 232 — First-use hint strip and the Tap: Reveal / Flag segmented choice

Depends on: 18

Context: none

```prompt
/task-implement 232 --review
```

## [ ] 20. Implement task 233 — Controls and bindings lists as one ruled two-column part

Depends on: 10

Context: none

```prompt
/task-implement 233 --review
```

## [ ] 21. Implement task 234 — Pause card to the canvas

Depends on: 8, 20

Context: none

```prompt
/task-implement 234 --review
```

## [ ] 22. Implement task 235 — 3D ready card, HUD readouts and the touch stick

Depends on: 7, 10, 20

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.

```prompt
/task-implement 235 --review
```

## [ ] 23. Implement task 236 — Learn 3D play layout and end cards

Depends on: 22

Context: none

```prompt
/task-implement 236 --review
```

## [ ] 24. Implement task 237 — Results screen to the canvas

Depends on: 9, 10

Context: none

```prompt
/task-implement 237 --review
```

## [ ] 25. Implement task 238 — Records screen to the canvas

Depends on: 8, 9

Context: none

```prompt
/task-implement 238 --review
```

## [ ] 26. Implement task 239 — Replay viewer to the canvas

Depends on: 9, 10, 14

Context:
- 2026-10-20 (from step 14): task 227 left the replay viewer's tile size unpinned — at 1920×1080 it draws 40 px where the criteria give 34; the viewer always fits the whole board (down to a 1 px tile) and this task's layout should pin the size.

```prompt
/task-implement 239 --review
```

## [ ] 27. Implement task 240 — Settings screen to the canvas

Depends on: 2, 6, 8

Context: none

```prompt
/task-implement 240 --review
```

## [ ] 28. Implement task 241 — Other surfaces: placeholder, fatal card and toasts

Depends on: 10

Context: none

```prompt
/task-implement 241 --review
```

## [ ] 29. Implement task 242 — Copy alignment with the canvas

Depends on: 17, 24

Context: none

```prompt
/task-implement 242 --review
```

## [ ] 30. Implement task 243 — Component gallery coverage and the theme list

Depends on: 5, 6, 7, 8, 9, 10

Context: none

```prompt
/task-implement 243 --review
```

## [ ] 31. Implement task 244 — Update documentation for feature `shared-screen-layout`

Depends on: 5, 6, 7, 8, 9, 10, 15, 16, 17, 20, 21, 22, 24, 25, 26, 27, 28, 29

Context: none

```prompt
/task-implement 244 --review
```

## [ ] 32. Implement task 245 — Update documentation for feature `in-game-layout`

Depends on: 18, 19, 23

Context: none

```prompt
/task-implement 245 --review
```

## [x] 33. Implement task 246 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 11, 12, 13, 14

Context:
- 2026-10-20 (from step 11): task 224 narrowed the 2D number contrast rule to the 2D revealed face and its shade only (the 3D list keeps every point of the revealed face); `themed-board-art-and-motion.md` still says "every point of its theme's revealed face" and must record it. It also split `numbers` into `numbers2d`/`numbers3d`, added the `end2d` module entry, and let a bevel side be an exact `#rrggbb`.
- 2026-10-20 (from step 13): task 226 added board-module entries `palette.faces2d.marked.ring`, `cursor.innerWidth` and flat-style `press`/`border`, changed flat `hairline` to CSS px, made the start cell a `marked` tile state, and moved the cursor ring to a `board-ring` overlay canvas.

```prompt
/task-implement 246 --review
```

Done: 2026-10-20, commit `a0771f1` (7 files, +41/-30).

## [ ] 34. Implement task 247 — Update documentation for feature `theme-system`

Depends on: 30

Context: none

```prompt
/task-implement 247 --review
```
