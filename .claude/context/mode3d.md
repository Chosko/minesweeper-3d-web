# 3D mode — board choice

## OVERVIEW

The 3D mode's game flow from board choice to result, around the 3D scene,
camera and controls ([rendering.md](rendering.md), [input.md](input.md), [input-camera.md](input-camera.md)),
which it leaves as they are. `js/main.js` wires it to the screens, the
renderer and the pointer-lock flow ([app-shell-3d.md](app-shell-3d.md)).

| File | Responsibility | Context file |
| --- | --- | --- |
| `js/mode3d/learn.js` | Learn 3D: the guided board `LEARN_BOARD`, `lessonCells`, `learnChoice` and the prompt sequence `createLearnPrompts`. DOM-free. | [mode3d-learn.md](mode3d-learn.md) |
| `js/mode3d/board-choice.js` | The presets, custom validation, Random fill, the no-guess switch with its cell-count limit and side-of-2 rule, the last 3D choice's document name, and `bindBoardChoice` over `#board-choice`. Helpers DOM-free; the binder touches only the elements it is handed. | this file |
| `js/mode3d/session.js` | The 3D game on the shared engine (`create3DGame`) and the game session (`createSession`): closed box, flags before the first reveal, the first reveal's board, generating, failure offer, timer, pause, restart, leave, replay recorder. DOM-free. | [mode3d-session.md](mode3d-session.md) |
| `js/shell/mode-3d.js` | The adapter (`create3DMode`) behind the mode contract: end delay, summaries, sealed replays, the movement sampler, pre-generation for Play again. DOM-free. | [mode3d-adapter.md](mode3d-adapter.md) |

## PUBLIC API

`js/mode3d/board-choice.js`
- `PRESETS` — frozen `{id, family, name, X, Y, Z, mines}` in menu order:
  `cube-intro` Cube Intro, `cube-beginner`, `cube-intermediate`,
  `cube-expert` (sizes and mines in `PRESETS` itself). `FAMILIES` (`cube` "Cube");
  `BOARD_SIZES` (the preset ids plus `'custom'`). Cube Beginner's measured
  mine count comes from `dev/measure-first-box-3d.mjs`, named in the
  presets' comment. No preset has a start spacing of its own: every 3D game
  starts at `SPACING_START` ([input-camera.md](input-camera.md)).
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
  outside `BOARD_SIZES`, such as a double layer or First box preset's id), with no-guess
  dropped on a custom board that does not offer it;
  `readChoice({size, fields, noGuess}, fallbackCustom?)`; `boardOf(choice)`
  → `{X, Y, Z, mines, noGuess}` (a `RangeError` on an invalid choice);
  `randomBoard(random?)` — the original Random formula, always valid.
- `presetKey(p)` (`'6,6,6,10'`, the options' `data-preset`), `presetByKey`,
  `presetLabel(p)` / `boxLine(board)` (the size line), `mineDensity(board)`,
  `presetTitle(p)` → 'Cube Beginner' (as results and Records name the
  board); `CUSTOM_HINT`, `customInfo(board)`; `LEARN_SUMMARY`,
  `choiceSummary({selected, custom, noGuess, code})` (the bottom bar's
  line), `bestsTitle({selected, custom, noGuess})`.
- `LAST_CHOICE_DOC` = `'mode3d.lastChoice'`, `LAST_CHOICE_VERSION` = 1.
- `bindBoardChoice({root, onStart, onLearn, onBack, onRecords?, code?,
  bests?})` → `{show(choice, {played, held}), state(), refresh(),
  destroy()}`, the Classic 2D binder's shape ([classic2d.md](classic2d.md))
  over `#board-choice`: `onLearn` for the Learn 3D option (first, no
  preset), `onRecords(board)` with the chosen board as `boardOf` gives it
  (null for Learn 3D, a code or a refused custom board), `bests(board)` the
  shell's `boardBests` text. Its head comment lists the `data-*` hooks it
  reads and what each option shows; the binder never reads the records
  itself.

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
- **Learn 3D** is the first option, with no preset: the guided board, its
  prompts and its end are [mode3d-learn.md](mode3d-learn.md).
- **Last board choice.** `js/main.js` keeps it with the shell's
  `createLastBoardChoice` (`js/shell/menu.js`) in the `mode3d.lastChoice`
  document, loaded before the first screen; a stored choice
  `normaliseChoice` refuses falls back to `DEFAULT_CHOICE`. Picking a board
  saves the choice (a failed save never stops the game) and starts
  `MODES.start('3d', boardOf(choice))`; `show` marks it `data-last`, with
  its Last played chip only once a choice was played or loaded.
- **The screen.** The Classic 2D board choice's composition, its window
  taller (`css/components.css` head comment, *3D board choice*): Learn 3D
  shows only its panel (how 3D works, no records), a preset the presets'
  switch and the board's bests, Custom its own switch, the form with Random
  and the bests for that size, Insert Board Code its field alone; the
  bottom bar's summary, Records and Play follow the choice live. Records
  holds the screen's state (`state()`) and Back from Records brings it back
  (`held`). The First box sizes (4 × 4 × 3 · 4, 5 × 5 × 3 · 6) are no
  preset: the records and replays played on them read as custom boards
  ([records.md](records.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the presets, the custom limits, no-guess availability and its limit.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  last board choice mechanism.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) "Grid &
  geometry" — the custom limits and the Random formula.

## CROSS-REFERENCES

- [mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md) — the session and the adapter
  the chosen board is handed to.
- [mode3d-learn.md](mode3d-learn.md) — Learn 3D's guided board and prompts.
- [classic2d.md](classic2d.md) — `NOGUESS_DENSITY_HINT` and the density
  hint text.
- [app-shell-menu.md](app-shell-menu.md) — the board choices' wiring in
  `js/main.js`, `createLastBoardChoice` and `boardBests`.
- [platform.md](platform.md) — the storage the last 3D choice is a document
  in.
- [records.md](records.md) — `PRESETS_3D`, kept equal to `PRESETS` by a test.
- [testing.md](testing.md) — `tests/mode3d-board-choice.test.mjs`,
  `tests/mode3d-noguess-limit.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a preset, the custom limits or the stored choice
  (`PRESETS`, `validateCustom`, `normaliseChoice` in `board-choice.js`; the
  `data-preset` markup in `index.html`, one unlabelled group). A changed
  preset re-runs `node dev/measure-first-box-3d.mjs` (the measured count).
- Changing the no-guess limit: re-run `node dev/measure-noguess-3d.mjs` and
  read its head comment before touching `NOGUESS_CELL_LIMIT`.
- Changing the board choice screen's hooks (`bindBoardChoice`'s head
  comment).
