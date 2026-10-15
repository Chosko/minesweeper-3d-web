# Runbook: ux-review-tasks-implementation

Created: 2026-10-12 · Source: /runbook-create interview · Model: opus
Last step number: 41
Sequencing: Run in list order, one step at a time: most tasks edit js/main.js, index.html and css/style.css, and each body says whichever of two overlapping tasks lands second merges around the first; task 119's help component is reused by many later tasks, so it goes first.
Archive: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 23, 28, 34, 41

## [x] 39. Implement task 154 — Fast and slow test tiers and a cheaper browser suite

Depends on: none

Context: none

```prompt
/task-implement 154 --review
```

Done: 2026-10-14, commit `e5c1865` (30 files, +457/-55). Browser tests drop 3D with a per-file `removeWebGL2` init script, or load `index.html?still-backdrop` (a new hook in js/main.js) where they need WebGL 2; the body's 549 s full-run baseline measured 377 s here, 267–289 s after.

## [x] 40. Implement task 155 — Load-robust timing tests and one shared Chromium per test file

Depends on: 39

Context:
- 2026-10-14 (from step 39): `shell-menu` "in a browser without WebGL 2, the shell starts with a static background…" timed out in every loaded full run (passes alone); its 81-click loop races the end delay, so a late click can hit a results button. `classic2d-button-swap` "the swap toggle shows…" fails on HEAD too: it asks for 60 mines on 9×9 against the cap of 31.

```prompt
/task-implement 155 --review
```

Done: 2026-10-14, commit `24cac6d` (47 files, +901/-2140). The shell-menu no-WebGL timeout was stale click coordinates measured before Restart, not the end-delay race step 39 recorded; timing tolerance is `MS_TIME_SLACK` (default 2).

## [x] 21. Implement task 139 — 3D flight: fly-through fade, forward follows the view, spacing, FOV

Depends on: none

Context: none

```prompt
/task-implement 139 --review --rounds 2
```

Done: 2026-10-14, commit `f92d922` (32 files, +830/-138). 3D picking now starts at the camera (it started one unit ahead), in play and in the replay viewer, so cubes in the fade band are pickable.

## [x] 22. Implement task 140 — Look at the board and end delay

Depends on: none

Context: none

```prompt
/task-implement 140 --review
```

Done: 2026-10-14, commit `b4cde3a` (25 files, +725/-163). *Look at the board* shows only while the 3D mode still holds the finished board, so not after Records → Back; Esc's pointer-lock request is untested in a real browser.

## [x] 24. Implement task 142 — Touch Classic 2D and touch-safe 3D entry

Depends on: none

Context: none

```prompt
/task-implement 142 --review
```

Done: 2026-10-14, commit `e7ba648` (30 files, +1517/-58). Every 3D pointer-lock request goes through `requestLock3D()` in js/main.js, which asks for none on a coarse-only device; Look at the board opens lockless there too.

## [x] 25. Implement task 143 — Keyboard-only 3D

Depends on: none

Context: none

```prompt
/task-implement 143 --review
```

Done: 2026-10-14, commit `a20fd62` (12 files, +662/-16). Arrow-key look goes through `FlyCamera.look` (new `KeyLook`), Enter / `'` feed the mouse's `MouseActions` (new `KeyActions`), gated by new `Input` options `canAct` / `canLook`; the context files do not describe these yet.

## [x] 26. Implement task 144 — Controller walk, pad-aware Records and viewer, haptics

Depends on: none

Context: none

```prompt
/task-implement 144 --review
```

Done: 2026-10-14, commit `1ebf0ea` (20 files, +771/-65). `navStep` in js/main.js also steps menus in page order, moves the custom-size row as one control and aims at table rows; the P-41 skip did not reproduce at HEAD, and a replays row is Watch then Pin / Unpin, not the body's order.

## [x] 27. Implement task 145 — Focus containment in overlays

Depends on: none

Context:
- 2026-10-14 (from step 26): controller and arrow navigation is `navStep` in js/main.js, with a 45° direction rule; menus and tables step in page order.

```prompt
/task-implement 145 --review
```

Done: 2026-10-14, commit `390bfcd` (8 files, +364/-20). An open overlay makes every top-level `<body>` element with an id inert, the 3D canvas `#scene` included; containment follows which layers are visible, not `inert`.

## [x] 38. Implement task 146 — Orbit camera mode

Depends on: 25

Context:
- 2026-10-14 (from step 25): keyboard look is `KeyLook` in js/input.js, through `FlyCamera.look`; Enter / `'` are `KeyActions` feeding `MouseActions`; `Input` takes `canAct` / `canLook`. .claude/context/input.md, app-shell-3d.md and settings-bindings.md do not describe these yet.
- 2026-10-12 (amend): The review must include the automated browser play test task 146's body requires, because the orbit camera is a large UX change.

```prompt
/task-implement 146 --review --rounds 2
```

Done: 2026-10-14, commit `78193e9` (19 files, +701/-80). The body's dolly minimum (one lattice pitch) puts the camera inside small boards, where the nearest cubes fade to glass and can't be picked; kept as written, left as a design question.

## [x] 29. Implement task 147 — Touch controls for 3D

Depends on: 21, 24

Context:
- 2026-10-14 (from step 38): 3D has an Orbit camera mode (Camera setting), in which `__ms.wheel` dollies; a game started with `__ms.start(..., minePositions)` ends on the pause card, so a test that needs the results screen uses `__ms.modes.start('3d', …)`.
- 2026-10-14 (from step 27): while an overlay is open the 3D canvas `#scene` is inert, so it takes no pointer or touch input.
- 2026-10-14 (from step 24): every 3D pointer-lock request goes through `requestLock3D()` in js/main.js, which asks for none on a coarse-only device; the 2D Reveal / Flag switch is `#hud-tap` in the overlay bar beside Pause, shown on a coarse pointer only.
- 2026-10-14 (from step 21): a spacing step called without a timestamp moves exactly 0.1; only the wheel (notches under 200 ms apart) accelerates. 3D picking starts at the camera, not one unit ahead.

```prompt
/task-implement 147 --review --rounds 2
```

Done: 2026-10-14, commit `f32eb68` (34 files, +1547/-179). On a coarse-only device, Look at the board takes the stick and look drag, and a tap brings the card back (the body left this open); the bindings gain a 3D-only touch device (`TOUCH_DEVICE`).

## [x] 30. Implement task 148 — Records layout, pagination and lists

Depends on: none

Context:
- 2026-10-14 (from step 26): the Records board picker carries LB / RB glyph slots that keep their space when hidden, so it wraps onto two lines at 1366 px; moving up or down into a table aims at the whole row.

```prompt
/task-implement 148 --review
```

Done: 2026-10-14, commit `f7aa2fd` (33 files, +1357/-288). Records is two columns split 2 : 3 whose tables stack under their column names below a 539 px container query; controller Up / Down stays within the focused column.

## [x] 31. Implement task 149 — Richer Records and local top-10

Depends on: 10, 13, 30

Context:
- 2026-10-14 (from step 30): Records is two columns (2 : 3); its tables stack each row's cells under the column names below a 539 px container query, controller Up / Down moves within one column, and the page and view state live in a new `records.view` storage document.
- 2026-10-12 (from step 12): the records format is already version 3 (completed-games figures, rebuilt from the game history on load); a further format change starts from there.

```prompt
/task-implement 149 --review
```

Done: 2026-10-14, commit `0bf3728` (31 files, +2050/-151). The results screen's "#n of N" rank comes from the Top 10 ranking in the new js/records/stats.js; Records filters and tabs reset on every open.

## [x] 32. Implement task 150 — Replay viewer as a study tool

Depends on: none

Context: none

```prompt
/task-implement 150 --review --rounds 2
```

Done: 2026-10-14, commit `cfcb186` (37 files, +1912/-330). The viewer's `state.time` / `seek(ms)` are game time from -500 (the lead-in), so a replay opens at -500, not 0; its key line shows over 3D replays only.

## [x] 33. Implement task 151 — Daily board, board codes and challenge links

Depends on: 20

Context:
- 2026-10-13 (from step 20): the game sessions take a `place` option, defaulting to the worker's `generate()`, through which tests and dev/measure-replays.mjs supply fixed boards; a pre-generated board is discarded when the mode is left for the board choice.

```prompt
/task-implement 151 --review --rounds 2
```

Done: 2026-10-14, commit `7663531` (93 files, +3316/-358). Records format goes to version 4, history to 2 and `BOARD_KEY_FORMAT` to 2 (new `daily:` keys); a daily code from another day plays as a challenge.

## [x] 35. Implement task 152 — Cube preset re-tune and first-box presets

Depends on: 15

Context:
- 2026-10-14 (from step 33): the records document is version 4, the history version 2 and `BOARD_KEY_FORMAT` 2 (with `daily:` keys); a further format change starts from there.
- 2026-10-12 (from step 15): after re-tuning the cube presets, re-run `node dev/measure-typical-bbbv.mjs` and paste its lines into js/records/typical-bbbv.js — a test requires a typical-3BV entry for every named board and fails until then.

```prompt
/task-implement 152 --review
```

Done: 2026-10-14, commit `f4c0b03` (32 files, +479/-146). Cube Beginner is 6 × 6 × 6 · 20 and First box 1 is 4 × 4 × 3 · 4; the cube curve misses the ×2.5–×3 target at Beginner → Intermediate (×1.9), shipped as decided.

## [x] 36. Implement task 153 — Learn 3D guided board

Depends on: 1, 35

Context:
- 2026-10-14 (from step 35): `PRESETS_3D` holds six presets, two first boxes then four cubes; First box 1 is 4 × 4 × 3 · 4 and Cube Beginner 6 × 6 × 6 · 20 (old 6 × 6 × 6 · 10 records read as Cube Intro). With nothing played, focus goes to Cube Beginner, not the first item.

```prompt
/task-implement 153 --review
```

Done: 2026-10-14, commit `2c25d21` (36 files, +1063/-109). The guided board is First box 1 (seed 75, generator version 1, mines 1, 2, 3, 40, start cell 26), whose marked start cell is an interior cube the player flies in to click.

## [x] 37. Check the result against the UX review

Depends on: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 36

Context: none

```prompt
Audit the implemented game against the game director's UX review and write the
findings down. This step reports; it fixes nothing — no code, test, task or
feature-document edit.

Read first: docs/UX_REVIEW.md in full. For navigation in the codebase, read
CLAUDE.md and .claude/context/INDEX.md, then only the context files you need.
The backlog tasks that implemented the review are in .claude/TASKS.md (bodies
in .claude/tasks/<N>.md); each body names the P-nn / I-nn items it closes and
the files it touched, which tells you where to look.

What to check, three groups:
1. Every P-nn and I-nn row that § "Approved scope and work plan" approves
   (its opening paragraph lists the exclusions; everything else numbered is
   approved). For each, compare the implemented game with the row's proposed
   solution and with any decision that bears on it.
2. Every row of the "Decisions taken" table (under § Priorities): does the
   game follow the decision and its stated effect?
3. The conditions in the opening paragraph of § "Approved scope and work
   plan" (P-21 built as undo-last-batch plus visibility, never a certainty
   gate; P-23 built in attended iterations; P-45 only where it degrades nothing
   on normal pointers; P-25 the fade, not half speed; P-26 forward vector
   changed with no new setting and Q/E staying world up and down).

How to check: read the code the relevant tasks touched, and play the build.
Serve the repository root as static files with `python3 -m http.server <port>`
(in the background) and drive it in headless Chromium with Playwright,
imported from /opt/node-tools/node_modules/playwright/index.js, launching
Chromium with the args `--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader --ignore-gpu-blocklist`. The tests under tests/
show how the project drives the game — including the `__ms` debug hook (for
example tests/classic2d-mode.test.mjs) and a faked gamepad
(tests/gamepad.test.mjs); reuse their patterns. Keep any scratch scripts out
of the repository.

Classify each item as exactly one of:
- implemented as specified;
- implemented with drift — say what differs from the proposed solution or
  decision;
- missing;
- defective — a bug found while checking it, with steps to reproduce.
Also list (a) defects found outside the numbered items, with steps to
reproduce, and (b) every feature document under .claude/domain/ left
inconsistent with what the code does, naming the passage and the behaviour.

Run the project's full test suite (`node --test` from the repository root)
and record the result: pass/fail counts and the names of any failing tests.

Write the report to docs/UX_REVIEW_DRIFT.md: a short verdict on top (overall
state and the counts per status), then tables with the columns item, status,
evidence (file:line or the observed in-game behaviour), what to do — one
table per group above, one for the outside defects, one for the inconsistent
feature documents — and the test-suite result. Commit only that file and push
the current branch.

The closing report names the counts per status and the five most important
findings.
```

Done: 2026-10-15, commit `59ba9f4` (1 file, +190/-0). Bare `node --test` also runs the review scripts under docs/; the project's suite command is .claude/external/run-full-tests.sh.

## Do not re-propose

Everything in docs/UX_REVIEW.md § "Decisions taken" (under § Priorities) and § "Approved scope and work plan" is settled. In particular:

- A certainty-gated anti-chord for right-click on a number (P-21): measured and rejected; it is built as undo-last-batch plus visibility.
- An opening first click in 3D (P-19): dropped; the first click stays safe-cell-only.
- Half speed inside the box instead of the fly-through fade (P-25): the fade was chosen.
- A "Fly where you look" setting: P-26 changes the forward vector outright, with no new setting.
- Accessibility settings or an accessibility panel (P-56 to P-60, I-16): dropped for now.
- Crash durability and resume (P-49, P-50, and P-18 with them): not this stage.
- Rebinding (P-44): waits for its own feature.
- Camera presets and snap aiming (I-12, I-13): later.
- The landing tagline (P-09): not fixed.
