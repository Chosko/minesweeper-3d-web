# Make the Classic 2D cursor ring visible

## Goal
The keyboard and controller cursor ring on a Classic 2D board is invisible
in the light theme: `--color-focus-ring` and `--color-tile-edge` are both
`#3f78e0`, and the ring is stroked at the edge's exact width and position,
so it lands on the edge pixel for pixel. The ring gets a board-only token,
`--color-tile-cursor`, distinct from the tile edge in both themes, so the
cursor is visible on every tile state while the shell's focus outlines keep
`--color-focus-ring`.

## Acceptance criteria
- `css/tokens.css` declares `--color-tile-cursor`: `#14233f` in the light
  theme, `#93b6f6` in the dark theme.
- `js/classic2d/board-view.js` `CURSOR_RING` is `--color-tile-cursor`; the
  ring's geometry is unchanged.
- `tests/tokens.test.mjs` checks, in both themes, that `--color-tile-cursor`
  meets 3:1 against `--color-tile-edge`, `--color-tile-closed`,
  `--color-tile-pressed` and `--color-tile-revealed`; every existing
  contrast check still passes.
- `tests/classic2d-cursor.test.mjs` has a Playwright test that, in both
  themes, moves the cursor with an arrow key on a Beginner board and asserts
  the pixels of the ring band on the cursor cell differ from the tile-edge
  colour and from the same band on a neighbouring closed cell.

## Decisions
- A board-only token rather than a new light `--color-focus-ring`: the fix
  stays on the board and leaves every shell focus outline as it is.
- A colour change rather than a thicker or offset ring: off the edge the
  light focus-ring colour is only 1.66:1 against the closed tile.

## Hints
- `css/tokens.css` (the tile tokens block, light and dark)
- `js/classic2d/board-view.js` (`CURSOR_RING`, `drawCell`)
- `tests/tokens.test.mjs` (`TILE_TOKENS`, the contrast contract)
- `tests/classic2d-cursor.test.mjs` (the focus-ring unit test, the browser harness)
- `.claude/domain/features/classic-2d-square-play.md` (Cursor input)

## Drift
- `.claude/context/classic2d.md` § Exports (board view) — diverges: says `CURSOR_RING` is `--color-focus-ring`; the ring is drawn in `--color-tile-cursor`.
- `.claude/context/testing.md` § `tests/classic2d-cursor.test.mjs` — diverges: says the focus ring is checked against `CURSOR_RING` only, with one Playwright test; a second Playwright test checks the ring pixels in both themes, and `tests/tokens.test.mjs` gains the cursor contrast check.
- `.claude/domain/features/classic-2d-square-play.md` § Cursor input — settles: "drawn as a focus ring over the board" leaves the colour open; the ring takes the board-only `--color-tile-cursor`.
