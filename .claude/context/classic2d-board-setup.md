# Classic 2D — board setup

## OVERVIEW

Board setup turns a flat mode's board choice into a board request, under
its flat mode configuration: standard sizes, custom limits and validation,
grid and records identity, the last board choice document. The flat mode
configuration and the Classic 2D map are [classic2d.md](classic2d.md)'s;
the board choice screen is [classic2d-board-choice.md](classic2d-board-choice.md)'s.

| File | Responsibility |
| --- | --- |
| `js/classic2d/board-setup.js` | Board choice → board request: standard sizes, custom limits and validation, grid and records identity of a choice, the last board choice document — each under a flat mode configuration, the square values by default. DOM-free. |
| `js/hexagon/board-setup.js` | The Hexagon mode's board setup values: its standard boards and Classic 2D's custom limits, read by the board-code parser and Hexagon's configuration. DOM-free. |
| `js/triangle/board-setup.js` | The Triangle mode's board setup values, in the same shape as Hexagon's. DOM-free. |

## PUBLIC API

`js/classic2d/board-setup.js`
- `MODE` (`'classic-2d'`), `GRID` (`'square'`), `BOARD_SIZES` (`beginner`,
  `intermediate`, `expert`, `custom`), `STANDARD_SIZES` (from the records'
  `STANDARD_BOARDS`), `DEFAULT_CHOICE` (Beginner, custom at Expert's
  size and mines, no-guess on). A choice is `{size, custom, noGuess}`.
- `NOGUESS_HELP_TEXT`, `NOGUESS_DENSITY_HINT`, `DENSITY_HINT_TEXT`,
  `aboveDensityHint(mines, cells)` — shared by both modes' board choices.
- `customMineCap(width, height)` — the reference site's cap;
  `maxMines(width, height)` — that cap, at most cells − 1;
  `validateCustom({width, height, mines})` → `{ok: true}` or `{ok: false,
  field, reason}`; `normaliseChoice(choice, config?)` → a plain valid copy
  or null under the configuration's custom limits.
- `boardSetup(choice, config?)` → frozen `{choice, width, height, mines,
  noGuess, identity, grid, request(firstClick, seed)}` — `grid` the
  configuration's grid ([engine.md](engine.md)), `identity` the records
  board identity in its mode and grid
  ([records.md](records.md)), `request` the generation request
  ([generation.md](generation.md)); an invalid choice throws `RangeError`.
- `LAST_CHOICE_DOC` (`'classic2d.lastChoice'`), `LAST_CHOICE_VERSION`,
  `createLastChoice({storage, config?})` → `{current, load(), save(choice)}`
  over the configuration's `lastChoiceDoc` ([platform.md](platform.md)).
- `SQUARE_SETUP` — the square values in a configuration's shape, less its
  name and geometry: what `normaliseChoice`, `boardSetup`,
  `createLastChoice` and the board choice read with no configuration
  handed in.

`js/hexagon/board-setup.js`
- `MODE` (`'hexagon'`), `GRID` (`'hex'`), `STANDARD_SIZES` (`beginner`,
  `intermediate`, `expert`, as drawn on the Hexagon board sheet; equal to
  the records' `STANDARD_BOARDS_HEX`, [records.md](records.md), held equal
  by a test).
- `BOARD_SIZES`, `maxMines`, `validateCustom` — re-exported from Classic
  2D's board setup, so a hexagon custom board has Classic 2D's limits, mine
  cap and refusal shape.

`js/triangle/board-setup.js`
- `MODE` (`'triangle'`), `GRID` (`'tri'`), `STANDARD_SIZES` (as drawn on
  the Triangle board sheet; equal to the records' `STANDARD_BOARDS_TRI`,
  held equal by a test), and the same three re-exports as Hexagon's.

## INTERNAL PATTERNS

- **Board setup and limits.** The standard sizes are the records' standard
  boards. A custom board's sides run from `minSide` to `maxSide`
  (`CUSTOM_LIMITS` in `js/engine/profiles.js`, citing "Largest custom board" in
  `tests/fidelity/minesweeper-online.md`); its mines run from 1 to the
  smaller of the site's cap — every cell up to `everyCellUpTo` cells, then the measured
  caps interpolated by cell count, rounded down — and cells − 1, so the
  first click is always safe. A one-cell board, which has no room for a
  mine, is refused on the mines field, after the side checks. The records identity still
  accepts 0 mines, so entries earned on such boards keep loading. The
  Hexagon and Triangle board setups take the same limits through their
  re-exports; only their standard boards are their own.
- **No-guess is never refused up front**, however dense the board: above
  `NOGUESS_DENSITY_HINT` the board choice shows its hint, and a failed
  no-guess request gets the session's failure offer.
- **Stored choice.** One document per flat mode, its configuration's
  `lastChoiceDoc`, every one in Classic 2D's shape and version. One that
  does not normalise under the configuration's limits reads as
  `DEFAULT_CHOICE`; an invalid one is never saved.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — board setup and its custom limits (and the free cell kept on small
  boards, a deliberate difference from the reference).
- [../domain/features/flat-grid-modes.md](../domain/features/flat-grid-modes.md)
  — Hexagon's and Triangle's last board choices.
- [../domain/features/hexagon-grid.md](../domain/features/hexagon-grid.md)
  — the Hexagon standard boards and custom limits.
- [../domain/features/triangle-grid.md](../domain/features/triangle-grid.md)
  — the Triangle standard boards and custom limits.

## CROSS-REFERENCES

- [classic2d.md](classic2d.md) — the flat mode configuration the setup
  reads; [classic2d-board-choice.md](classic2d-board-choice.md) — the
  screen that reads the setup.
- [engine.md](engine.md) — the square grid and `CUSTOM_LIMITS`.
- [records.md](records.md) — `STANDARD_BOARDS`, `STANDARD_BOARDS_HEX`,
  `STANDARD_BOARDS_TRI` and the board identity;
  [records-board-code.md](records-board-code.md) — the board-code parser
  that reads every board setup's limits.
- [generation.md](generation.md) — the board request.
- [platform.md](platform.md) — the storage the last board choice lives in.
- [mode3d.md](mode3d.md) — the 3D board choice, which imports the density
  hint from here.
- [testing-files.md](testing-files.md) — `tests/classic2d-session.test.mjs` pins board
  setup and the last choice; `tests/classic2d-fidelity.test.mjs` the custom limits against the
  fidelity observations; `tests/hexagon-board-setup.test.mjs` and
  `tests/triangle-board-setup.test.mjs` the Hexagon and Triangle board
  setups; `tests/flat-modes.test.mjs` the configured board setup and last
  choice.

## WHEN TO READ THE SOURCE

- Changing the custom limits or the stored choice (`customMineCap`,
  `normaliseChoice` in `board-setup.js`, `CUSTOM_LIMITS` in
  `js/engine/profiles.js`); a change to the limits reaches Hexagon and
  Triangle too.
- Changing a Hexagon or Triangle standard board: `STANDARD_SIZES` in
  `js/hexagon/board-setup.js` or `js/triangle/board-setup.js` with
  `STANDARD_BOARDS_HEX` or `STANDARD_BOARDS_TRI` in `js/records/board.js`.
