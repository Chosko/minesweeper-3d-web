# 3D mode — board choice

## OVERVIEW

The 3D mode's game flow from board choice to result, around the 3D scene,
camera and controls ([rendering.md](rendering.md), [input.md](input.md)),
which it leaves as they are. `js/main.js` wires it to the screens, the
renderer and the pointer-lock flow ([app-shell-3d.md](app-shell-3d.md)).

| File | Responsibility | Context file |
| --- | --- | --- |
| `js/mode3d/board-choice.js` | The three cube presets, custom validation, Random fill, the no-guess switch with its cell-count limit and side-of-2 rule, the last 3D choice's document name, and `bindBoardChoice` over `#board-choice`. Helpers DOM-free; the binder touches only the elements it is handed. | this file |
| `js/mode3d/session.js` | The 3D game on the shared engine (`create3DGame`) and the game session (`createSession`): closed box, flags before the first reveal, the first reveal's board, generating, failure offer, timer, pause, restart, leave, replay recorder. DOM-free. | [mode3d-session.md](mode3d-session.md) |
| `js/shell/mode-3d.js` | The adapter (`create3DMode`) behind the mode contract: end delay, summaries, sealed replays, the movement sampler, pre-generation for Play again. DOM-free. | [mode3d-session.md](mode3d-session.md) |

## PUBLIC API

`js/mode3d/board-choice.js`
- `PRESETS` — three frozen `{id, family, name, X, Y, Z, mines}` in menu
  order: cube Beginner 6 × 6 × 6 / 10, Intermediate 8 × 8 × 8 / 40, Expert
  12 × 12 × 8 / 130. `FAMILIES` (`cube` "Cube"); `BOARD_SIZES` (the preset
  ids plus `'custom'`).
- A board choice is `{size, custom: {X, Y, Z, mines}, noGuess}`; `custom` is
  kept beside a preset so the custom fields reopen as the player left them.
  `DEFAULT_CHOICE` is cube Beginner, custom 10 × 10 × 10 / 25, no-guess on.
- `DIM_MIN` / `DIM_MAX` (1 / 100); `validateCustom(board)` → `{ok: true}` or
  `{ok: false, field: 'X'|'Y'|'Z'|'mines', reason}` — mines 1 to cells − 1,
  so a one-cell board is refused. `customStatus(board)` → `{ok, field, max,
  text, warn?}` (a warning above 250,000 cells).
- `NOGUESS_CELL_LIMIT` = 8000 (20 × 20 × 20); `noGuessAvailable(choice)` —
  true on every preset and on a custom board of at most that many cells
  with no side of exactly 2 (a side of 1 keeps it); `noGuessReason(choice)`
  — the side-of-2 line, which takes precedence, else the 8,000-cell line.
  `densityHintShown(custom, noGuess)` — from Classic 2D's
  `NOGUESS_DENSITY_HINT` ([classic2d.md](classic2d.md)).
- `normaliseChoice(choice)` → a valid plain copy or null (null for a `size`
  outside `BOARD_SIZES`, such as a double layer preset's id), with no-guess
  dropped on a custom board that does not offer it;
  `readChoice({size, fields, noGuess}, fallbackCustom?)`; `boardOf(choice)`
  → `{X, Y, Z, mines, noGuess}` (a `RangeError` on an invalid choice);
  `randomBoard(random?)` — the original Random formula, always valid.
- `presetKey(p)` (`'6,6,6,10'`, the items' `data-preset`), `presetByKey`,
  `presetLabel(p)`, `presetTitle(p)` → 'Cube Beginner' (as results and
  Records name the board).
- `LAST_CHOICE_DOC` = `'mode3d.lastChoice'`, `LAST_CHOICE_VERSION` = 1.
- `bindBoardChoice({root, onStart, onBack, code?})` (`code` the board code
  field, as Classic 2D's, [classic2d.md](classic2d.md)) → `show(choice, {played,
  details})`, `destroy()`. Its head comment lists the `data-*` hooks it
  reads. `details` (the shell's `presetDetails`,
  [app-shell-menu.md](app-shell-menu.md)) fills each preset's `[data-detail]` line for
  the presets' switch; the binder never reads the records itself.

## INTERNAL PATTERNS

- **Two no-guess switches.** The presets' switch (`data-noguess="presets"`)
  is always enabled and applies to whichever preset is clicked. The custom
  board's switch (`data-noguess="custom"`) is disabled above
  `NOGUESS_CELL_LIMIT` or on a side of 2 cells, with `noGuessReason`'s line
  above it; the player's wish is kept while it is disabled. Both are filled
  from the last choice's `noGuess`, on when none is stored. A side of 2 is
  refused because two cells stacked along it share every neighbour, so a
  mine in one of them is always a guess. The limit is read from the one
  exported constant; `dev/measure-noguess-3d.mjs` is the measurement
  behind it.
- **Last board choice.** `js/main.js` keeps it with the shell's
  `createLastBoardChoice` (`js/shell/menu.js`) in the `mode3d.lastChoice`
  document, loaded before the first screen; a stored choice
  `normaliseChoice` refuses falls back to `DEFAULT_CHOICE`. Picking a board
  saves the choice (a failed save never stops the game) and starts
  `MODES.start('3d', boardOf(choice))`; `show` marks it `data-last`, with
  "Last played" only once a choice was played or loaded. Each preset item
  holds its label, size line, detail line and "Last played" line, in that
  order.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the presets, the custom limits, no-guess availability and its limit.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  last board choice mechanism.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) "Grid &
  geometry" — the custom limits and the Random formula.

## CROSS-REFERENCES

- [mode3d-session.md](mode3d-session.md) — the session and the adapter
  the chosen board is handed to.
- [classic2d.md](classic2d.md) — `NOGUESS_DENSITY_HINT` and the density
  hint text.
- [app-shell-menu.md](app-shell-menu.md) — the `#board-choice` screen in
  `js/main.js`, `createLastBoardChoice` and `presetDetails`.
- [platform.md](platform.md) — the storage the last 3D choice is a document
  in.
- [records.md](records.md) — `PRESETS_3D`, kept equal to `PRESETS` by a test.
- [testing.md](testing.md) — `tests/mode3d-board-choice.test.mjs`,
  `tests/mode3d-noguess-limit.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a preset, the custom limits or the stored choice
  (`PRESETS`, `validateCustom`, `normaliseChoice` in `board-choice.js`; the
  `data-preset` markup in `index.html`).
- Changing the no-guess limit: re-run `node dev/measure-noguess-3d.mjs` and
  read its head comment before touching `NOGUESS_CELL_LIMIT`.
- Changing the board choice screen's hooks (`bindBoardChoice`'s head
  comment).
