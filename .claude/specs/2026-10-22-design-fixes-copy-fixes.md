# Design-fixes copy fixes

## Goal
Three copy fixes from the design-fixes follow-ups: an ended game's pause card
gets a status line of its own instead of the line saying the board is not
started; the Learn 3D end card's loss title takes the canvas's wording; the
3D ready card's touch rules line says to tap the Ctrl button, which is a
toggle.

## Acceptance criteria
- `js/shell/pause.js` exports `ENDED_LINE`, `'No game in progress: the game is over.'`, beside `NO_GAME_LINE`, which stays `'No game in progress: the board is not started yet.'`.
- The pause card's status line (`#pause-sub`, `UI.showPause` in `js/ui.js`) reads `NO_GAME_LINE` before the first click, `ENDED_LINE` once the game is won or lost, and the time and mines line during a game; the running time never replaces either line.
- The Learn 3D end card's loss title is `'That was a mine!'`; the win title stays `'You cleared the box!'`.
- The ready card's touch rules line (`.ready-rules-touch`, `index.html`) reads `Empty and solved cubes hide themselves; tap the Ctrl button to show them.`; the keyboard line is unchanged.
- The tests pinning the old strings pin the new ones, and a test pins the ended game's line.
- `.claude/domain/features/shared-screen-layout.md` § the pause card and `.claude/context/app-shell-pause.md` state the two lines.

## Decisions
- The ended line keeps the `No game in progress: …` shape of the line before the first click, so the two read as a pair.
- The loss title ends in `!`, matching the win title beside it.

## Hints
- js/shell/pause.js (`NO_GAME_LINE`, the pause-rules comment)
- js/ui.js (`showPause`, `showLearnEnd`)
- index.html (`.ready-rules-touch`)
- tests/shell-pause.test.mjs, tests/results.test.mjs, tests/components-pause.test.mjs, tests/mode3d-learn.test.mjs, tests/shell-first-use.test.mjs, tests/shell-mode-3d.test.mjs

## Drift
- `.claude/domain/features/shared-screen-layout.md` § Cards (the pause card) — diverges: says with no game in progress the status line says so; the change gives an ended game a line of its own (updated in the same commit).
- `.claude/context/app-shell-pause.md` § pause card — diverges: says `NO_GAME_LINE` shows before the first click or after the end; the change shows `ENDED_LINE` after the end (updated in the same commit).
- `.claude/domain/features/game-shell.md` § Pause rules — settles: it does not word the status line; left to its own revision.
