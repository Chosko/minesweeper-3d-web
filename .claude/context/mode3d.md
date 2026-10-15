# 3D mode — board choice

## OVERVIEW

The 3D mode's game flow from board choice to result, around the 3D scene,
camera and controls ([rendering.md](rendering.md), [input.md](input.md), [input-camera.md](input-camera.md)),
which it leaves as they are. `js/main.js` wires it to the screens, the
renderer and the pointer-lock flow ([app-shell-3d.md](app-shell-3d.md)).

| File | Responsibility | Context file |
| --- | --- | --- |
| `js/mode3d/learn.js` | Learn 3D: the guided board `LEARN_BOARD`, `lessonCells`, `learnChoice` and the prompt sequence `createLearnPrompts`. DOM-free. | this file |
| `js/mode3d/board-choice.js` | The six presets and their start spacing (`startSpacing`), custom validation, Random fill, the no-guess switch with its cell-count limit and side-of-2 rule, the last 3D choice's document name, and `bindBoardChoice` over `#board-choice`. Helpers DOM-free; the binder touches only the elements it is handed. | this file |
| `js/mode3d/session.js` | The 3D game on the shared engine (`create3DGame`) and the game session (`createSession`): closed box, flags before the first reveal, the first reveal's board, generating, failure offer, timer, pause, restart, leave, replay recorder. DOM-free. | [mode3d-session.md](mode3d-session.md) |
| `js/shell/mode-3d.js` | The adapter (`create3DMode`) behind the mode contract: end delay, summaries, sealed replays, the movement sampler, pre-generation for Play again. DOM-free. | [mode3d-adapter.md](mode3d-adapter.md) |

## PUBLIC API

`js/mode3d/board-choice.js`
- `PRESETS` — six frozen `{id, family, name, X, Y, Z, mines, spacing}` in
  menu order: `box-1` First box 1 4 × 4 × 3 / 4, `box-2` First box 2
  5 × 5 × 3 / 6, `cube-intro` Cube Intro 6 × 6 × 6 / 10, `cube-beginner`
  6 × 6 × 6 / 20, `cube-intermediate` 8 × 8 × 8 / 40, `cube-expert`
  10 × 10 × 10 / 100. `spacing` is the start spacing: 1.5 for the first
  boxes, `SPACING_START` ([input-camera.md](input-camera.md)) for the cubes. `FAMILIES`
  (`box` "First box", `cube` "Cube"); `BOARD_SIZES` (the preset ids plus
  `'custom'`). The two measured mine counts (First box 1, Cube Beginner)
  come from `dev/measure-first-box-3d.mjs`, named in the presets' comment.
- `startSpacing({X, Y, Z, mines})` — the matching preset's `spacing` (by
  size and mines, so a custom board of a preset's size is that preset's),
  else `SPACING_START`; `startGame` in `js/main.js` sets it on every 3D
  start.
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
  `presetLabel(p)`, `presetTitle(p)` → 'Cube Beginner', 'First box 1' (as
  results and Records name the board).
- `LAST_CHOICE_DOC` = `'mode3d.lastChoice'`, `LAST_CHOICE_VERSION` = 1.
- `bindBoardChoice({root, onStart, onLearn, onBack, code?})` (`onLearn` the
  Learn 3D item `[data-learn]`, first and no preset; `code` the board code
  field, as Classic 2D's, [classic2d.md](classic2d.md)) → `show(choice, {played,
  details})`, `destroy()`. Its head comment lists the `data-*` hooks it
  reads. `details` (the shell's `presetDetails`,
  [app-shell-menu.md](app-shell-menu.md)) fills each preset's `[data-detail]` line for
  the presets' switch; the binder never reads the records itself.

`js/mode3d/learn.js`
- `LEARN_BOARD` — frozen `{X, Y, Z, mines, seed, generatorVersion,
  startCell, minePositions, proofNumber, lessonNumber, lessonMine}`: First
  box 1's 4 × 4 × 3 · 4, seed 75, start cell 26 (the marked centre cell),
  P 36, L 25, M 40; `LEARN_TITLE` 'Learn 3D'.
- `lessonCells(view, startCell)` → `{proofNumber, lessonNumber, lessonMine}`
  or null: the board conditions after the first reveal (not won, a cube
  hidden, a 1 with one closed neighbour M, another 1 L nearest the start
  with M and another closed cube).
- `learnChoice()` → `{X, Y, Z, mines, minePositions, noGuess: false, learn:
  true, forced: {startCell, seed, learn: true}}`: a fixed board with the
  session's forced, marked start cell ([mode3d-session.md](mode3d-session.md)).
- `LEARN_PROMPTS` (`start`, `shift`, `ctrl`, `flag`, `chord`, `rest`),
  `LEARN_HINTS` (each prompt's `HINT_TEXT` name,
  [settings-bindings.md](settings-bindings.md));
  `createLearnPrompts({lessonNumber, lessonMine})` → `current`,
  `done(name)`, `tinted`, `started()`, `shift(selected)`, `ctrl()`,
  `flagged(cells)`, `chorded(cell, revealed)`, `lessonClosed(count)` (L's
  closed, unflagged neighbour count; 0 completes the chord prompt);
  `closedAround(view, cell)` → that count on a 3D state view.

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
- **Learn 3D.** The guided board's mine positions are committed, found by
  `dev/find-learn-3d.mjs` (the first seed from 1 whose no-guess board meets
  `lessonCells`), so a later `GENERATOR_VERSION` changes no lesson. Each
  prompt is done by its action at any time after the first reveal and
  skipped when its turn comes; the chord prompt is also done once L has no
  closed, unflagged neighbour, since a chord on L can then open nothing; L
  carries the start-cell tint during prompts 1 and 4, M during prompt 3. Starting it saves no choice and moves
  no "Last played" mark; the shell's wiring is
  [app-shell-3d.md](app-shell-3d.md).
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

- [mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md) — the session and the adapter
  the chosen board is handed to.
- [classic2d.md](classic2d.md) — `NOGUESS_DENSITY_HINT` and the density
  hint text.
- [app-shell-menu.md](app-shell-menu.md) — the `#board-choice` screen in
  `js/main.js`, `createLastBoardChoice` and `presetDetails`.
- [platform.md](platform.md) — the storage the last 3D choice is a document
  in.
- [records.md](records.md) — `PRESETS_3D`, kept equal to `PRESETS` by a test.
- [testing.md](testing.md) — `tests/mode3d-board-choice.test.mjs`,
  `tests/mode3d-noguess-limit.test.mjs`, `tests/mode3d-learn.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a preset, the custom limits or the stored choice
  (`PRESETS`, `validateCustom`, `normaliseChoice` in `board-choice.js`; the
  `data-preset` markup in `index.html`, one group per family). A changed
  preset re-runs `node dev/measure-first-box-3d.mjs` (the measured counts)
  and `node dev/measure-typical-bbbv.mjs`, whose lines go into
  `js/records/typical-bbbv.js`.
- Changing the no-guess limit: re-run `node dev/measure-noguess-3d.mjs` and
  read its head comment before touching `NOGUESS_CELL_LIMIT`.
- Changing the board choice screen's hooks (`bindBoardChoice`'s head
  comment).
- Changing the guided board or its prompts: `learn.js`'s head comment; a
  changed board re-runs `node dev/find-learn-3d.mjs`.
