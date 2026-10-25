# Accept scene-off on the menu in the lock-fallback test

## Goal
The drag-to-look test in `tests/shell-lock-fallback.test.mjs` asserts, after
the game is left for the main menu, that the body carries no class but
`pointer-nav`. The main menu sets `scene-off` on the body, so the assertion
fails on a correct game. The test is brought in line with the game; it still
checks that no play class survives leaving the game.

## Acceptance criteria
- The menu-return assertion in "in a browser that refuses pointer lock, the
  second refusal offers drag-to-look, which plays by dragging and clicking"
  accepts `scene-off` on the body and fails on any play class
  (`drag-look`, `lockless` or any other) left there.
- No file under `js/` or `css/` changes.
- `.claude/external/run-affected-tests.sh tests/shell-lock-fallback.test.mjs`
  passes the whole file, and the fast tier passes.

## Hints
- `tests/shell-lock-fallback.test.mjs` (the `body()` helper and the
  assertion after `#p-confirm-yes`)
- `js/main.js` (`sceneOff()` and the `scene-off` toggle)
- `tests/shell-menu.test.mjs` (pins `scene-off` on the menu)

## Drift
none
