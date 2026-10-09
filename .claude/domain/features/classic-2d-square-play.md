# Classic 2D square play

The Classic 2D mode on the square grid, as the player meets it: pick
Beginner, Intermediate, Expert or a custom board, switch no-guess on or off,
and play on a flat Canvas 2D board with mouse, keyboard or controller, with
the timer and mine counter in the in-game overlay and the finished game
handed to the results screen.

## Purpose

[product-design.md § Classic 2D](../product-design.md#classic-2d) is the
enthusiast loop's home: real, flat Minesweeper that plays exactly like
Minesweeper Online with its default options. The rules live in
`cell-graph-rules-engine` and the boards in `board-generation`; this feature
is everything between them and the player — board choice, the start-of-game
flow, input feel, the board on screen and the timer — and it is where
"plays like the reference" is felt rather than computed.

## Scope and non-goals

In scope (m1-classic-2d):

- Board choice: Beginner (9 × 9, 10 mines), Intermediate (16 × 16, 40),
  Expert (30 × 16, 99) and Custom (width and height each 1 to 100, mines
  within the limit Board setup states), plus the no-guess switch.
- The start-of-game flow: a closed board, the first click, board
  generation around it, the timer starting once the board is ready.
- The Canvas 2D board: layout and scaling to the window, scrolling or
  panning for boards larger than the screen, hit-testing, and per-cell
  redraw from the engine's change lists through `square-tile-skin`.
- Mouse input reproducing the reference's feel: press feedback on button
  down, reveal and chord on release and a flag on the right press, the
  chord gestures the reference accepts (left or middle on a number,
  left + right), and cancelling by moving off a cell before release.
- Keyboard and controller play: a visible cell cursor moved by arrow keys,
  d-pad or stick, with reveal, flag and chord on buttons, so Classic 2D is
  fully playable with a controller.
- The timer and mine counter, fed to the in-game overlay.
- Pause, restart and back to menu, as the game shell asks; the board is
  hidden while paused.
- Handing every finished or abandoned game's summary on, through
  `game-summary`.

Non-goals:

- Hexagonal and triangle grids, and grid choice in the menu — deferred to
  `m6-launch`.
- Leaderboards and Steam ranks — deferred to `m3-on-steam`.
- Replays — deferred to `m2-3d-joins`.
- Daily boards and campaign levels — deferred to `m5-core-complete` and
  `m4-campaigns`.
- Demo locks on custom boards and no-guess — deferred to
  `m5-core-complete`.
- The main menu entry, settings pages and the pause card's design — Main
  menu and game shell and `screen-components`.
- Tile appearance — `square-tile-skin`.

## Architecture

Built within the recorded technical direction — Canvas 2D for Classic 2D,
independent of three.js, as one mode front-end over the shared engine (see
[technical-direction.md](../technical-direction.md)). The 3D mode's
front-end ([rendering.md](../../context/rendering.md),
[input.md](../../context/input.md)) is left as it is; the controller reader
and its pure helpers in [input.md](../../context/input.md) are reused, not
copied.

- **Board setup.** Turns the chosen size and no-guess switch into a board
  request: the square graph from `cell-graph-rules-engine` and the
  generation options. Validates custom boards: width and height 1 to 100
  each, and a mine count up to the smaller of Minesweeper Online's
  size-dependent cap, recorded in `tests/fidelity/minesweeper-online.md`,
  and the cell count minus one. The site takes a mine in every cell on
  boards of up to 36 cells; this game keeps one cell free so the first
  click is always safe — a deliberate difference from the reference, and
  the same rule as 3D custom boards.
- **Game session.** Owns one game from closed board to result: holds the
  engine, makes the first-click request to the generation worker, shows the
  "generating" state when the answer is slow, starts the timer once the
  board is ready, applies actions, and on win or loss stops the timer and
  hands the summary on. Restart discards the game and its pending
  generation; *Play again* starts a new one with the same choice.
- **Board view.** Fits the board to the available area at the largest tile
  size that fits, down to the skin's minimum tile size; below that it keeps
  the minimum size and lets the player scroll or pan. Maps pointer
  positions to cells, redraws only the cells each action changed, and asks
  `square-tile-skin` to paint each one.
- **Pointer input.** A press-and-release state machine over the mouse
  buttons that reproduces the reference: which buttons and combinations
  reveal, flag and chord, what shows as pressed while a button is held, and
  what releasing elsewhere does.
- **Cursor input.** A cell cursor driven by keyboard and controller, with
  auto-repeat for held directions, drawn as a focus ring over the board.
  Pointer and cursor input both end in the same engine actions.
- **Timer.** Elapsed play time measured from the moment the board is ready,
  paused while the game is paused, stopped at win or loss; displayed in
  whole seconds in the overlay and kept at millisecond resolution for the
  result.

## Data and state

- **Session state** — the current board choice, the engine instance, the
  seed and generator version of the board, timer start and accumulated
  pause, pending generation request, cursor position. In memory for one
  game.
- **Last board choice** — size, custom dimensions and the no-guess switch,
  remembered between sessions through the game shell's settings storage so
  the mode reopens on the player's last choice.
- **Source of truth** — the engine for cell and game state; this feature
  derives nothing from the canvas.
- The game's summary — built by `game-summary` from the engine's summary
  or counts, the elapsed time, board choice, seed and generator version — is
  handed to the game shell; `personal-records` persists it.

## Interfaces and contracts

- **Start** — from the game shell, with a board choice; opens a closed
  board ready for its first click.
- **Pause, resume, restart, back to menu** — from the game shell. Pause
  freezes the timer and hides the board; it does nothing before the first
  click or after the game ends.
- **Overlay feed** — timer and mines left, pushed to the in-game overlay
  from `screen-components` whenever they change.
- **Game finished** — one event per won or lost game with its summary, sent
  to the game shell, which opens `results-screen`; its *Play again* comes
  back here as a new start with the same choice.
- **Game abandoned** — a restart or back to menu after the first click and
  before a win or loss reports the game's summary with outcome abandoned
  before the game is discarded; before the first click nothing is
  reported.
- **Game in progress** — the mode contract's `summary()` returns a
  started, unfinished game's summary so far, with outcome abandoned, built
  the same way as the abandoned report's; before the first click there is
  none.
- **Generation failure** — when a no-guess request fails, the session shows
  the failure and offers what `board-generation`'s open question settles;
  the timer never starts on a failed board.
- **Input fidelity** — every reference behaviour this feature owns (which
  inputs chord, when a flag toggles, press feedback, release-off-cell
  cancelling, the largest custom board) is pinned by a fidelity test in the
  same way as the engine's rules, against the behaviour recorded in
  `tests/fidelity/minesweeper-online.md`; a failing test is resolved by
  correcting the game against the file, apart from the deliberate
  difference Board setup records. Pointer behaviour is checked with
  Playwright; the state machine itself is DOM-free and tested in Node.
- **Controller parity** — every action available to the mouse is
  available on the controller.

## Dependencies

- `cell-graph-rules-engine` — square graph, game state, actions, summary.
- `board-generation` — the board built around the first click, in a
  worker.
- `square-tile-skin` — the paint call and minimum tile size.
- `design-tokens-and-themes` — the board background and cursor ring
  colours, and theme-change notification.
- `screen-components` — the in-game overlay bar.
- Main menu and game shell (m1-classic-2d) — entry from the menu, pause,
  restart, back to menu, settings storage, controller navigation outside
  the board.
- `game-summary` — builds the summary of each finished or abandoned
  game.
- No external libraries.

## Open questions

- Controller mapping on the board: which buttons reveal, flag and chord,
  and whether a single "smart" button (reveal on closed, chord on numbers)
  is offered. Blocks the controller input task; the mapping must not clash
  with the shell's menu buttons.
- Whether a press-and-hold on the controller shows the same pressed-cell
  feedback as a held mouse button.
