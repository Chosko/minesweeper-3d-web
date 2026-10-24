# Classic 2D — overview and board setup

## OVERVIEW

The Classic 2D mode, independent of three.js: board setup turns a board
choice into a board request, the session owns one game from closed board to
result, the board view lays the board out, hit-tests and scrolls it, the
pointer, touch and cursor inputs drive it, the tile skin paints each tile, and the
mode joins them behind the game shell's contract. The session owns the game
and its timer; the view owns where tiles go and the input that moves the
board; the skin owns how a tile looks.

| File | Responsibility | Context file |
| --- | --- | --- |
| `js/classic2d/board-setup.js` | Board choice → board request: standard sizes, custom limits and validation, grid and records identity of a choice, the last board choice document. DOM-free. | this file |
| `js/hexagon/board-setup.js` | The Hexagon mode's board setup values: its standard boards and Classic 2D's custom limits, read by the board-code parser. DOM-free. | this file |
| `js/triangle/board-setup.js` | The Triangle mode's board setup values, in the same shape as Hexagon's. DOM-free. | this file |
| `js/classic2d/board-choice.js` | The board choice screen: custom info line, validation and Random, the choice its fields describe, the bests line, the board choice panel every mode's board choice shares (`bindChoicePanel`), `bindBoardChoice` (touches only the elements it is handed). | this file |
| `js/classic2d/session.js` | The game session and timer: closed board, first click's board (standard, no-guess, pre-generated), generating state, failure offer, pause, end, restart and leave with summaries and replays, the replay recorder. DOM-free. | [classic2d-session.md](classic2d-session.md) |
| `js/classic2d/mode.js` | The mode behind the shell's contract: one session, view, inputs and sampler per game, overlay feed, sound cues, pause by hiding the board, generation client and pre-generation, end delay. DOM-free. | [classic2d-mode.md](classic2d-mode.md) |
| `js/classic2d/end-effect.js` | The 3D win and loss waves and the win confetti at board scale, and their Canvas 2D drawing. DOM-free and token-free. | [classic2d-end-effect.md](classic2d-end-effect.md) |
| `js/classic2d/board-view.js` | Fit rule, scale cap and frame, layout on the tile and gap, `cellAt`, per-cell redraw, scrolling and panning with shadows and bars, the touch zoom, hidden while paused, pressed feedback, focus ring, the cell events it plays, `mountBoardView`. DOM-free at import. | [classic2d-board-view.md](classic2d-board-view.md), [classic2d-board-canvas.md](classic2d-board-canvas.md), [classic2d-board-motion.md](classic2d-board-motion.md) |
| `js/classic2d/motion-layer.js` | The motion layer over the board canvas: animating cells drawn from the tile cache, frames only while a cell animates; `changeEvent`. DOM-free at import. | [classic2d-board-motion.md](classic2d-board-motion.md) |
| `js/classic2d/pointer-input.js` | Mouse press-and-release state machine from profile markers, `mountPointerInput`. DOM-free at import. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/button-swap.js` | The page's mouse button swap (off at creation, never saved), per-press translation. DOM-free. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/touch-input.js` | Touch state machine: tap on the lift, 400 ms long-press flag, the Tap choice's Reveal / Flag, chord on a number, one-finger pan, two-finger pan and pinch; `mountTouchInput`. DOM-free at import. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/cursor-input.js` | Keyboard and controller cell cursor, auto-repeat, reveal / flag / chord, `mountCursorInput`. DOM-free at import. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/tile-skin.js` | Stateless tile painter from the active board module, tile cache with its depth steps, the board art hand-off `BOARD_ART`, `MIN_TILE_SIZE`. DOM-free at import. | [classic2d-tile-skin.md](classic2d-tile-skin.md) |
| `js/tile-art.js` | The shared tile recipe both boards draw through — named drawing styles (`bevel`, `flat`) at any size and depth, the glyphs, every colour an argument; imports nothing. | [tile-art.md](tile-art.md) |
| `js/cell-motion.js` | The cell motion player both renderers use — running cell animations and their values per frame; imports nothing. | [classic2d-tile-motion.md](classic2d-tile-motion.md) |

## PUBLIC API

`js/classic2d/board-setup.js`
- `MODE` (`'classic-2d'`), `GRID` (`'square'`), `BOARD_SIZES` (`beginner`,
  `intermediate`, `expert`, `custom`), `STANDARD_SIZES` (from the records'
  `STANDARD_BOARDS`), `DEFAULT_CHOICE` (Beginner, custom 30 × 16 / 99,
  no-guess on). A choice is `{size, custom, noGuess}`.
- `NOGUESS_HELP_TEXT`, `NOGUESS_DENSITY_HINT` (0.25), `DENSITY_HINT_TEXT`,
  `aboveDensityHint(mines, cells)` — shared by both modes' board choices.
- `customMineCap(width, height)` — the reference site's cap;
  `maxMines(width, height)` — that cap, at most cells − 1;
  `validateCustom({width, height, mines})` → `{ok: true}` or `{ok: false,
  field, reason}`; `normaliseChoice(choice)` → a plain valid copy or null.
- `boardSetup(choice)` → frozen `{choice, width, height, mines, noGuess,
  identity, grid, request(firstClick, seed)}` — `grid` the square grid
  ([engine.md](engine.md)), `identity` the records board identity
  ([records.md](records.md)), `request` the generation request
  ([generation.md](generation.md)); an invalid choice throws `RangeError`.
- `LAST_CHOICE_DOC` (`'classic2d.lastChoice'`), `LAST_CHOICE_VERSION` (1),
  `createLastChoice({storage})` → `{current, load(), save(choice)}`
  ([platform.md](platform.md)).

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

`js/classic2d/board-choice.js` (its head comment is the contract)
- `CHOICE_SIZES`, `CUSTOM_HINT`, `boardLine(board)`, `sizeLabel(size)`,
  `mineDensity(board)`, `customInfo(custom)`, `customStatus(custom)` →
  `{ok, field, max, text}`, `randomCustom(random?)` (the Random fill, at
  most about one mine in five cells), `readChoice({size, fields, noGuess},
  fallbackCustom?)`, `densityHintShown(custom, noGuess)`,
  `bestsTitle({selected, custom, noGuess})`; `CODE_PROMPT`, the code
  field's empty line on both board choices; `showCodeLine(line, field, r)`,
  the code field's line on both board choices for `code.resolve`'s answer:
  the prompt muted, an accepted code `ui-text--success`, a code of the
  other mode (`r.otherMode`) a warn note, any other refused code an err
  note with the field `is-invalid`.
- The board choice panel: `PANEL_OPTIONS` (`custom`, `code`, `learn`, the
  options that open it on their own), `panelOpen(selected, pinned)`,
  `panelLabel(selected)` (the drawer's label: *Board code*, *Learn 3D*,
  else *Board settings*); `bindChoicePanel({root, pin})` →
  `{draw(selected), destroy()}` over a screen's panel `[data-panel]`, its
  rule `[data-panel-rule]`, the panel toggle `[data-panel-toggle]` and the
  drawer's bar `[data-drawer-bar]`; `pin` the shell's stored pin
  (`createBoardPanelPin`, [app-shell-menu.md](app-shell-menu.md)).
- `bindBoardChoice({root, onStart, onBack, onRecords?, code?, bests?, pin?})` →
  `{show(choice, {held}), state(), refresh(), destroy()}` over
  `#c2d-choice`: the options `[data-size]` (`beginner`, `intermediate`,
  `expert`, `custom`, `code`; `aria-pressed` the chosen one, `data-last`
  the last board played); `onRecords(identity)` — *All records* under the
  bests — with the chosen board's records identity (null with no board chosen);
  `code` `{resolve, onPlay}` validates the pasted code live; `bests(identity)`
  the shell's `boardBests` text ([app-shell-menu.md](app-shell-menu.md)),
  redrawn by `refresh()`; `held` (a `state()` taken before Records opened)
  brings the screen back as it was.

## INTERNAL PATTERNS

- **Board setup and limits.** The standard sizes are the records' standard
  boards. A custom board is 1 to 100 a side (`CUSTOM_LIMITS` in
  `js/engine/profiles.js`, citing "Largest custom board" in
  `tests/fidelity/minesweeper-online.md`); its mines run from 1 to the
  smaller of the site's cap — every cell up to 36 cells, then the measured
  caps interpolated by cell count, rounded down — and cells − 1, so the
  first click is always safe. A 1 × 1 board is refused on the mines field,
  after the side checks; the smallest is 1 × 2. The records identity still
  accepts 0 mines, so entries earned on such boards keep loading. The
  Hexagon and Triangle board setups take the same limits through their
  re-exports; only their standard boards are their own.
- **No-guess is never refused up front**, however dense the board: above
  `NOGUESS_DENSITY_HINT` the board choice shows its hint, and a failed
  no-guess request gets the session's failure offer.
- **Stored choice.** One that does not normalise reads as
  `DEFAULT_CHOICE`; an invalid one is never saved.
- **The board choice screen** (`css/components.css` head comment, *Classic
  2D board choice*): the Board list on the left — the standard sizes and
  Custom, then Insert Board Code, with no chip; the last board played is
  the chosen option when the window opens — and the foot holding Play
  alone, the go button, at the right. Everything else sits in the board
  choice panel to the list's right: a preset's no-guess switch row and the
  board's three bests with *All records* under them, Custom's switch row,
  form (on the panel, in no box of its own: the fields filling one row
  over the info line and Random) and refusal (a warn note) with the bests
  for that size, or Insert Board Code's field alone. Choosing an option is
  a click (a tap, the controller's A); Enter plays. The info line, refusal
  line, density hint, bests and Play follow the fields and the switch
  live; Play is disabled on a refused custom board and an empty or refused
  code. *All records* opens Records on the chosen board and switch. The
  binder reads no records: the shell hands it `bests` and calls
  `refresh()` on the records' change.
- **Board choice panel** (`bindChoicePanel`, one behaviour for every
  mode's board choice — the 3D one's and any flat mode configured on this
  binder): open while pinned or while an option of `PANEL_OPTIONS` is
  chosen, closed otherwise, the window widening for it. The panel toggle,
  at the right of the heading, flips the pin (`aria-pressed` while
  pinned); on a phone the drawer's bar does the same (`aria-expanded`
  while open) under the label `panelLabel` gives. While an option of
  `PANEL_OPTIONS` is chosen the panel stays open and a click changes only
  the stored preference; choosing a preset closes it again unless pinned.
  No pin handed in reads as unpinned.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — board setup and its custom limits (and the free cell kept on small
  boards, a deliberate difference from the reference), the game session,
  timer and failure offer, the board view, the pointer and cursor inputs,
  the sound of each action and the mode.
- [../domain/features/hexagon-grid.md](../domain/features/hexagon-grid.md)
  — the Hexagon standard boards and custom limits.
- [../domain/features/triangle-grid.md](../domain/features/triangle-grid.md)
  — the Triangle standard boards and custom limits.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — what the 2D session records and the pointer and cursor sampling.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the tile states, drawing contract, cache, contrast and minimum tile size.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the tile and number tokens, the token reader and theme changes.

## CROSS-REFERENCES

- Siblings: [classic2d-session.md](classic2d-session.md),
  [classic2d-mode.md](classic2d-mode.md),
  [classic2d-board-view.md](classic2d-board-view.md),
  [classic2d-board-canvas.md](classic2d-board-canvas.md),
  [classic2d-board-motion.md](classic2d-board-motion.md),
  [classic2d-input.md](classic2d-input.md),
  [classic2d-tile-skin.md](classic2d-tile-skin.md), [tile-art.md](tile-art.md),
  [classic2d-end-effect.md](classic2d-end-effect.md),
  [classic2d-tile-motion.md](classic2d-tile-motion.md).
- [engine.md](engine.md) — the square grid and `CUSTOM_LIMITS`.
- [records.md](records.md) — `STANDARD_BOARDS`, `STANDARD_BOARDS_HEX`,
  `STANDARD_BOARDS_TRI` and the board identity;
  [records-board-code.md](records-board-code.md) — the board-code parser
  that reads every board setup's limits.
- [generation.md](generation.md) — the board request.
- [platform.md](platform.md) — the storage the last board choice lives in.
- [mode3d.md](mode3d.md) — the 3D board choice, which imports the density
  hint from here.
- [testing.md](testing.md) — `tests/classic2d-session.test.mjs` pins board
  setup and the last choice; `tests/classic2d-mode.test.mjs` board choice;
  `tests/classic2d-fidelity.test.mjs` the custom limits against the
  fidelity observations; `tests/hexagon-board-setup.test.mjs` and
  `tests/triangle-board-setup.test.mjs` the Hexagon and Triangle board
  setups.

## WHEN TO READ THE SOURCE

- Changing the custom limits or the stored choice (`customMineCap`,
  `normaliseChoice` in `board-setup.js`, `CUSTOM_LIMITS` in
  `js/engine/profiles.js`); a change to the limits reaches Hexagon and
  Triangle too.
- Changing a Hexagon or Triangle standard board: `STANDARD_SIZES` in
  `js/hexagon/board-setup.js` or `js/triangle/board-setup.js` with
  `STANDARD_BOARDS_HEX` or `STANDARD_BOARDS_TRI` in `js/records/board.js`.
- Changing the board choice screen's options, fields, info line, bests
  or panel (`customStatus`, `bindChoicePanel`, `bindBoardChoice` in
  `board-choice.js`; the `#c2d-choice` markup in `index.html`).
