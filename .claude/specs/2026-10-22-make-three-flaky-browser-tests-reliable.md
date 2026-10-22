# Make three flaky browser tests reliable

## Goal
Three browser tests fail intermittently on a loaded machine. Fix the cause of each in the test, so it
passes every run; none is skipped, disabled or quarantined.

## Acceptance criteria
- `tests/settings-page.test.mjs`'s controller tap presses and releases a button inside one
  `page.evaluate`, the release in the next animation frame, with no test-to-page round trip while the
  button is held.
- `tests/shell-menu.test.mjs` 'the menu fits each window…' reads a menu preview's frame only once the
  board art hand-off (`BOARD_ART.current()`) has happened, so the frame is laid out with the board
  module's gap, the one `tileOf` assumes.
- `tests/input-keyboard-3d.test.mjs`'s browser test runs several times through the runner; it is
  changed only if a real cause of its timeout is found.
- Each touched file passes repeated runs through `.claude/external/run-affected-tests.sh`.

## Decisions
- The settings-page tap stays a local copy of `shell-pad-walk`'s, not a shared helper: the in-page
  `__pad` tap is repeated across several test files, and sharing it is a wider change than this one.
- The menu-preview wait is on the board art hand-off, the existing pattern of `classic2d-mode` and
  `classic2d-view`: until the theme's number font loads the skin has no board module, the view lays the
  board out with no gap, and that gapless frame is stable enough to pass `framed()`'s two-poll check.

## Hints
- tests/shell-pad-walk.test.mjs (its in-page `tap`)
- js/classic2d/board-view.js (`gapOf`, the skin's `redraw` refit), js/classic2d/tile-skin.js (`BOARD_ART`),
  js/shell/board-art.js (the hand-off after the number font loads)
- .claude/context/testing-browser.md (input a round trip cannot stretch)

## Drift
none
