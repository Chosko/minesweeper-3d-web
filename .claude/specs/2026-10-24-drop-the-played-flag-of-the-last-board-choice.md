# Drop the played flag of the last board choice

## Goal
`createLastBoardChoice` in `js/shell/menu.js` exposes a `played` getter that
no production code reads any more; only its tests do. Remove the flag and the
state behind it, and rewrite the tests that assert on it, without changing
what `current`, `load()` and `save()` do.

## Acceptance criteria
- `createLastBoardChoice` returns no `played` property and keeps no `played`
  state.
- `current` is `fallback` until a valid choice is loaded or saved; `load()`
  with nothing stored, or a malformed document, leaves `current` as it was and
  returns it; `save()` sets `current` at once and rejects an invalid choice
  with a `RangeError`, changing nothing.
- The function's doc comment no longer mentions `played`.
- `tests/mode3d-board-choice.test.mjs` asserts on `current` and `load()`'s
  result instead of `played`, and guards that the property is absent.
- The fast tier passes.

## Decisions
- `load()`'s fallback branch (`else if (!played) current = fallback`) is a
  no-op — `current` only leaves `fallback` through a load or save that set
  `played` — so it is dropped rather than replaced.

## Hints
- `js/shell/menu.js` (`createLastBoardChoice`)
- `tests/mode3d-board-choice.test.mjs` (the last 3D board choice tests)

## Drift
- `.claude/context/app-shell-menu.md` § PUBLIC API — diverges: lists `played`
  among `createLastBoardChoice`'s members; the change removes it.
