# Implement the three test tiers

## Goal
`CLAUDE.md` § Tasks implementation defines three test tiers — Fast, Browser
and Slow (browser tests tagged `[slow]`) — and leaves the tag, the mapping and
the runner scripts to `.claude/context/testing.md`. Make the code match: tag
the long walks and the animation, timing and frame-count checks `[slow]`, keep
them out of the full and browser runs, give them their own runner, and narrow
the page-shell rule of the affected-tests mapping to a small smoke set.

## Acceptance criteria
- The long controller and focus walks and the animation, timing and
  frame-count browser checks carry `[slow]` in their test names; functional
  browser checks stay untagged, and every `[slow]` test is also named "in a
  browser".
- `run-full-tests.sh` and `run-browser-tests.sh` skip tests named `[slow]`;
  `run-fast-tests.sh` is unchanged.
- `.claude/external/run-slow-tests.sh` runs only the tests named `[slow]`,
  with the full run's concurrency and per-test timeout.
- A change to `index.html`, `js/main.js` or `css/**` selects the shell smoke
  set (one browser test file per screen, or the closest equivalent), not every
  browser test file.
- `run-affected-tests.sh` runs `[slow]` tests only in test files that a
  changed file's import closure reaches or that were named as arguments; a
  file selected by the shell rule or the renderer rule alone runs with
  `[slow]` skipped.
- `.claude/context/testing.md` states the tag, the tiers, the four runners
  plus the slow one and the smoke set; `README.md`'s Tests section matches.
- `tests/affected-tests.test.mjs` pins the scripts, the smoke set, the split
  between closure-reached and rule-selected files, and the tag convention.

## Decisions
- `js/render.js` keeps selecting every browser test file: the narrowing
  covers the page shell only, as `CLAUDE.md` names it; its rule-selected
  files skip `[slow]` like the shell's.
- The smoke set lives in `affected-tests.mjs` as `SHELL_SMOKE`; documents
  cite it rather than list it.
- `affected-tests.mjs` keeps printing the union with no flag; `--full` and
  `--smoke` print the two groups `run-affected-tests.sh` runs separately.

## Hints
- `.claude/external/affected-tests.mjs`, `run-affected-tests.sh`,
  `run-full-tests.sh`, `run-browser-tests.sh`, new `run-slow-tests.sh`
- `tests/affected-tests.test.mjs` (the pins)
- `tests/shell-pad-walk.test.mjs`, `tests/shell-focus-containment.test.mjs`,
  `tests/shell-menu.test.mjs`, `tests/shell-router.test.mjs`,
  `tests/mode3d-end.test.mjs`, `tests/render-3d-flag-flash.test.mjs`,
  `tests/render-3d-feedback.test.mjs`, `tests/replay-viewer.test.mjs`,
  `tests/replay-viewer-3d.test.mjs` (the tags)
- `.claude/context/testing.md` § OVERVIEW and its row in
  `.claude/context/INDEX.md`, `README.md` § Tests

## Drift
- `CLAUDE.md` § Tasks implementation — settles: the tag, the mapping and the
  runner scripts it delegates to `.claude/context/testing.md`.
- `.claude/context/testing.md` § OVERVIEW — diverges: says the full run is the
  whole suite and that `js/main.js`, `index.html` and `css/**` select every
  browser test file; the change skips `[slow]` in the full run and selects the
  smoke set (updated in this change).
- `README.md` § Tests — diverges: describes the full run as the whole suite
  and names three runs; the change adds the slow run (updated in this change).
