# Classic 2D — overview and flat mode configuration

## OVERVIEW

The Classic 2D mode, independent of three.js: board setup turns a board
choice into a board request, the session owns one game from closed board to
result, the board view lays the board out, hit-tests and scrolls it, the
pointer, touch and cursor inputs drive it, the tile skin paints each tile, and the
mode joins them behind the game shell's contract. The session owns the game
and its timer; the view owns where tiles go and the input that moves the
board; the skin owns how a tile looks. The flow is a template a flat mode
configuration sets up (`js/flat-modes.js`): Classic 2D is its square
configuration, Hexagon and Triangle its hex and tri ones, each a mode of its
own on the same board setup, board choice, session and mode.

| File | Responsibility | Context file |
| --- | --- | --- |
| `js/flat-modes.js` | The flat mode configuration — what differs between Classic 2D, Hexagon and Triangle: mode id and name, grid kind with its graph provider and geometry, standard sizes and custom limits, the last-choice document; the three configurations. DOM-free at import. | this file |
| `js/classic2d/board-setup.js` | Board choice → board request: standard sizes, custom limits and validation, grid and records identity of a choice, the last board choice document — each under a flat mode configuration, the square values by default. DOM-free. | [classic2d-board-setup.md](classic2d-board-setup.md) |
| `js/hexagon/board-setup.js` | The Hexagon mode's board setup values: its standard boards and Classic 2D's custom limits, read by the board-code parser and Hexagon's configuration. DOM-free. | [classic2d-board-setup.md](classic2d-board-setup.md) |
| `js/triangle/board-setup.js` | The Triangle mode's board setup values, in the same shape as Hexagon's. DOM-free. | [classic2d-board-setup.md](classic2d-board-setup.md) |
| `js/classic2d/board-choice.js` | A flat mode's board choice screen (Classic 2D's, Hexagon's, Triangle's): custom info line, validation and Random, the choice its fields describe, the bests line, the board choice panel every mode's board choice shares (`bindChoicePanel`), `bindBoardChoice` (touches only the elements it is handed). | [classic2d-board-choice.md](classic2d-board-choice.md) |
| `js/classic2d/session.js` | The game session and timer: closed board, first click's board (standard, no-guess, pre-generated), generating state, failure offer, pause, end, restart and leave with summaries and replays, the replay recorder. DOM-free. | [classic2d-session.md](classic2d-session.md) |
| `js/classic2d/mode.js` | The mode behind the shell's contract, one instance per flat mode: one session, view, inputs and sampler per game, overlay feed, sound cues, pause by hiding the board, generation client and pre-generation, end delay. DOM-free. | [classic2d-mode.md](classic2d-mode.md), [classic2d-mode-window.md](classic2d-mode-window.md) |
| `js/classic2d/end-effect.js` | The 3D win and loss waves and the win confetti at board scale, and their Canvas 2D drawing. DOM-free and token-free. | [classic2d-end-effect.md](classic2d-end-effect.md) |
| `js/classic2d/board-view.js` | Fit rule, scale cap and frame, layout on the tile and gap, `cellAt`, per-cell redraw, scrolling and panning with shadows and bars, the touch zoom, hidden while paused, pressed feedback, focus ring, the cell events it plays, `mountBoardView`. DOM-free at import. | [classic2d-board-view.md](classic2d-board-view.md), [classic2d-board-canvas.md](classic2d-board-canvas.md), [classic2d-board-motion.md](classic2d-board-motion.md) |
| `js/classic2d/motion-layer.js` | The motion layer over the board canvas: animating cells drawn from the tile cache, frames only while a cell animates; `changeEvent`. DOM-free at import. | [classic2d-board-motion.md](classic2d-board-motion.md) |
| `js/classic2d/pointer-input.js` | Mouse press-and-release state machine from profile markers, `mountPointerInput`. DOM-free at import. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/button-swap.js` | The page's mouse button swap (off at creation, never saved), per-press translation. DOM-free. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/touch-input.js` | Touch state machine: tap on the lift, long-press flag (`LONG_PRESS_MS`), the Tap choice's Reveal / Flag, chord on a number, one-finger pan, two-finger pan and pinch; `mountTouchInput`. DOM-free at import. | [classic2d-input.md](classic2d-input.md) |
| `js/classic2d/cursor-input.js` | Keyboard and controller cell cursor, auto-repeat, reveal / flag / chord, `mountCursorInput`. DOM-free at import. | [classic2d-input-cursor.md](classic2d-input-cursor.md) |
| `js/classic2d/tile-skin.js` | Stateless tile painter from the active board module, tile cache with its depth steps, the board art hand-off `BOARD_ART`, `MIN_TILE_SIZE`. DOM-free at import. | [classic2d-tile-skin.md](classic2d-tile-skin.md), [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md) |
| `js/tile-art.js` | The shared tile recipe both boards draw through — named drawing styles (`bevel`, `flat`) at any size and depth, the glyphs, every colour an argument; imports nothing. | [tile-art.md](tile-art.md) |
| `js/cell-motion.js` | The cell motion player both renderers use — running cell animations and their values per frame; imports nothing. | [classic2d-tile-motion.md](classic2d-tile-motion.md) |

## PUBLIC API

`js/flat-modes.js` (its head comment is the contract)
- `defineFlatMode(spec)` → a frozen configuration `{id, name, grid,
  standardSizes, validateCustom, maxMines, lastChoiceDoc,
  createGrid(width, height), createGeometry(width, height)}` — `grid` a
  kind of `GRID_KINDS` ([geometry.md](geometry.md)), `standardSizes` copied
  and frozen, `createGrid` its graph provider ([engine.md](engine.md)),
  `createGeometry` its flat grid geometry. An unknown grid kind, a
  malformed field, or a standard size its own `validateCustom` refuses
  throws `RangeError`. `FLAT_SIZES` — the standard sizes every flat mode
  offers, in order.
- `CLASSIC_2D` (the square configuration, from Classic 2D's board setup
  values, [classic2d-board-setup.md](classic2d-board-setup.md)),
  `HEXAGON` and `TRIANGLE` (from their board setups, each with its own
  last-choice document), `FLAT_MODES` — the three in the menu's order. A
  board's code prefix is not part of the configuration: board codes route
  through `js/records/board-code.js`'s own table
  ([records-board-code.md](records-board-code.md)).

## INTERNAL PATTERNS

- **Flat mode configuration.** A flat mode is its configuration: the
  board setup, the board choice binder, the last-choice store, the session
  and the mode ([classic2d-mode.md](classic2d-mode.md)) take one wherever
  they read the grid, the sizes or the limits, and the shell builds each
  flat mode from its own ([app-shell-2d.md](app-shell-2d.md)). A
  configuration is checked once, at definition: its standard sizes must
  pass its own `validateCustom`. Classic 2D's stored last choice, board
  codes, records keys and replays are those of the square values the
  functions read without a configuration.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — board setup and its custom limits, the game session,
  timer and failure offer, the board view, the pointer and cursor inputs,
  the sound of each action and the mode.
- [../domain/features/flat-grid-modes.md](../domain/features/flat-grid-modes.md)
  — the flat mode configuration.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — what the 2D session records and the pointer and cursor sampling.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the tile states, drawing contract, cache, contrast and minimum tile size.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the tile and number tokens, the token reader and theme changes.

## CROSS-REFERENCES

- Siblings: [classic2d-board-setup.md](classic2d-board-setup.md) (board
  setup, custom limits, the last board choice),
  [classic2d-board-choice.md](classic2d-board-choice.md) (the
  board choice screen and panel),
  [classic2d-session.md](classic2d-session.md),
  [classic2d-mode.md](classic2d-mode.md),
  [classic2d-mode-window.md](classic2d-mode-window.md),
  [classic2d-board-view.md](classic2d-board-view.md),
  [classic2d-board-canvas.md](classic2d-board-canvas.md),
  [classic2d-board-motion.md](classic2d-board-motion.md),
  [classic2d-input.md](classic2d-input.md),
  [classic2d-input-cursor.md](classic2d-input-cursor.md),
  [classic2d-tile-skin.md](classic2d-tile-skin.md),
  [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md), [tile-art.md](tile-art.md),
  [classic2d-end-effect.md](classic2d-end-effect.md),
  [classic2d-tile-motion.md](classic2d-tile-motion.md).
- [geometry.md](geometry.md) — `GRID_KINDS` and the flat grid geometries;
  [engine.md](engine.md) — the graph providers.
- [records-board-code.md](records-board-code.md) — the board-code table
  outside the configuration.
- [app-shell-2d.md](app-shell-2d.md) — each flat mode registered from its
  configuration.
- [testing-files.md](testing-files.md) — `tests/flat-modes.test.mjs` the
  configurations.

## WHEN TO READ THE SOURCE

- Adding a flat mode or changing what a configuration holds:
  `defineFlatMode` and the configurations in `js/flat-modes.js`, then the
  mode's registration in `js/main.js` ([app-shell-2d.md](app-shell-2d.md)).
- Changing the board setup, custom limits or a standard board:
  [classic2d-board-setup.md](classic2d-board-setup.md).
- Changing the board choice screen or its panel:
  [classic2d-board-choice.md](classic2d-board-choice.md).
