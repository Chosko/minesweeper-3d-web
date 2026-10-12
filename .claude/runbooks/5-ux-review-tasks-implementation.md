# Runbook: ux-review-tasks-implementation

Created: 2026-10-12 · Source: /runbook-create interview · Model: opus
Last step number: 38
Sequencing: Run in list order, one step at a time: most tasks edit js/main.js, index.html and css/style.css, and each body says whichever of two overlapping tasks lands second merges around the first; task 119's help component is reused by many later tasks, so it goes first.

## [x] 1. Implement task 119 — Mode-aware help and first-use hints

Depends on: none

Context: none

```prompt
/task-implement 119 --review
```

Done: 2026-10-12, commit `828a0a4` (22 files, +1652/-170). Decisions: only the hint strip's × dismisses it, H (controller X in 3D) merely hides it while the help panel is open; F no longer toggles fullscreen anywhere in Classic 2D, since F flags there.

## [x] 2. Implement task 120 — Dark theme completion

Depends on: none

Context: none

```prompt
/task-implement 120 --review
```

Done: 2026-10-12, commit `d1f4691` (16 files, +350/-48). Wrong premise: the four scrims were not every light tint over the scene — the gradient behind the menu screens in css/style.css is still hard-coded light blue, and the context-lost card stays near-white in the dark theme; both left for a task of their own.

## [x] 3. Implement task 121 — No-guess default, switch copy, generating flow

Depends on: none

Context: none

```prompt
/task-implement 121 --review
```

Done: 2026-10-12, commit `03e8e72` (31 files, +1046/-193). Decisions: the component-kit test now allows exactly one keyframed animation, the `ui-spinner` turn; `#c2d-status` moved out of `#c2d` so it can sit above the pause card; the density threshold and no-guess hint copy live in js/classic2d/board-setup.js and the 3D board choice imports them.

## [x] 4. Implement task 122 — Menu keyboard navigation and browser Back

Depends on: none

Context: none

```prompt
/task-implement 122 --review
```

Done: 2026-10-12, commit `d74bdf5` (21 files, +1239/-70). Decisions: with the main menu's Controls panel open, browser Back leaves the site rather than closing the panel (history depth equals stack depth); the Settings Theme choice is unreachable by arrow keys in the multi-column layout, left for the single-column Settings layout (P-69, W-30).

## [x] 5. Implement task 123 — Wording and small shell fixes

Depends on: none

Context: none

```prompt
/task-implement 123 --review
```

Done: 2026-10-12, commit `70d9b42` (37 files, +882/-162). Wrong premise: the body's mine-counter width rule conflicts with "standard boards look as they do today" — only boards of more than 999 mines get a fixed width now. Decision: the "Esc: Back" hint stays beside the results and context-lost Main menu buttons.

## [ ] 6. Implement task 124 — Custom form: at least one mine

Depends on: none

Context: none

```prompt
/task-implement 124 --review
```

## [ ] 7. Implement task 125 — 3D spawn framing and world reference

Depends on: none

Context: none

```prompt
/task-implement 125 --review
```

## [ ] 8. Implement task 126 — 3D small feedback

Depends on: none

Context: none

```prompt
/task-implement 126 --review
```

## [ ] 9. Implement task 127 — Right-click on a number

Depends on: none

Context: none

```prompt
/task-implement 127 --review
```

## [ ] 10. Implement task 128 — Results precision, figures and hierarchy

Depends on: none

Context: none

```prompt
/task-implement 128 --review
```

## [ ] 11. Implement task 129 — Pause keeps the clock running, pauses recorded

Depends on: none

Context: none

```prompt
/task-implement 129 --review
```

## [ ] 12. Implement task 130 — One-key restart and completed-games stats

Depends on: none

Context: none

```prompt
/task-implement 130 --review
```

## [ ] 13. Implement task 131 — Reset all data

Depends on: none

Context: none

```prompt
/task-implement 131 --review
```

## [ ] 14. Implement task 132 — Shell without WebGL 2

Depends on: none

Context: none

```prompt
/task-implement 132 --review
```

## [ ] 15. Implement task 133 — Returning-player surfaces

Depends on: none

Context: none

```prompt
/task-implement 133 --review
```

## [ ] 16. Implement task 134 — 2D board scale, framed panel, cursor ring

Depends on: none

Context: none

```prompt
/task-implement 134 --review
```

## [ ] 17. Implement task 135 — 2D sound

Depends on: none

Context: none

```prompt
/task-implement 135 --review
```

## [ ] 18. Implement task 136 — 2D tile art parity with 3D

Depends on: none

Context: none

```prompt
/task-implement 136 --review
```

## [ ] 19. Implement task 137 — 2D end-of-game moment and the faster loop

Depends on: none

Context: none

```prompt
/task-implement 137 --review
```

## [ ] 20. Implement task 138 — Generation pipeline

Depends on: none

Context: none

```prompt
/task-implement 138 --review --rounds 2
```

## [ ] 21. Implement task 139 — 3D flight: fly-through fade, forward follows the view, spacing, FOV

Depends on: none

Context: none

```prompt
/task-implement 139 --review --rounds 2
```

## [ ] 22. Implement task 140 — Look at the board and end delay

Depends on: none

Context: none

```prompt
/task-implement 140 --review
```

## [ ] 23. Implement task 141 — 3D readability

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 141 --review
```

## [ ] 24. Implement task 142 — Touch Classic 2D and touch-safe 3D entry

Depends on: none

Context: none

```prompt
/task-implement 142 --review
```

## [ ] 25. Implement task 143 — Keyboard-only 3D

Depends on: none

Context: none

```prompt
/task-implement 143 --review
```

## [ ] 26. Implement task 144 — Controller walk, pad-aware Records and viewer, haptics

Depends on: none

Context: none

```prompt
/task-implement 144 --review
```

## [ ] 27. Implement task 145 — Focus containment in overlays

Depends on: none

Context: none

```prompt
/task-implement 145 --review
```

## [x] 28. Implement task 146 — Orbit camera mode

Depends on: 25

Context: none

```prompt
/task-implement 146 --review
```

Done: struck — its prompt runs one review round; the director requires two and the browser play test task 146's body now asks for; superseded by its corrected copy, step 38.

## [ ] 38. Implement task 146 — Orbit camera mode

Depends on: 25

Context:
- 2026-10-12 (amend): The review must include the automated browser play test task 146's body requires, because the orbit camera is a large UX change.

```prompt
/task-implement 146 --review --rounds 2
```

## [ ] 29. Implement task 147 — Touch controls for 3D

Depends on: 21, 24

Context: none

```prompt
/task-implement 147 --review --rounds 2
```

## [ ] 30. Implement task 148 — Records layout, pagination and lists

Depends on: none

Context: none

```prompt
/task-implement 148 --review
```

## [ ] 31. Implement task 149 — Richer Records and local top-10

Depends on: 10, 13, 30

Context: none

```prompt
/task-implement 149 --review
```

## [ ] 32. Implement task 150 — Replay viewer as a study tool

Depends on: none

Context: none

```prompt
/task-implement 150 --review --rounds 2
```

## [ ] 33. Implement task 151 — Daily board, board codes and challenge links

Depends on: 20

Context: none

```prompt
/task-implement 151 --review --rounds 2
```

## [ ] 35. Implement task 152 — Cube preset re-tune and first-box presets

Depends on: 15

Context: none

```prompt
/task-implement 152 --review
```

## [ ] 36. Implement task 153 — Learn 3D guided board

Depends on: 1, 35

Context: none

```prompt
/task-implement 153 --review
```

## [ ] 37. Check the result against the UX review

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

## [x] 34. Check the result against the UX review

Depends on: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33

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

Done: struck — its Depends on omits steps 35 and 36, appended after it was written; superseded by its corrected copy, step 37.

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
