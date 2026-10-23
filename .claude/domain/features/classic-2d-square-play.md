# Classic 2D square play

The Classic 2D mode on the square grid, as the player meets it: pick
Beginner, Intermediate, Expert or a custom board, switch no-guess on or off,
and play on a flat Canvas 2D board with mouse, touch, keyboard or controller, with
the timer, mine counter and click counter in the in-game overlay and the
finished game
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
  Expert (30 × 16, 99) and Custom (width and height each 1 to 100, at
  least one mine and at most the limit Board setup states), plus the
  no-guess switch, which says it keeps separate records. Each standard size
  keeps its size line with its mine density, with no Last played mark —
  the last board played is selected when the board choice opens —; the
  board's three bests show in the board choice's panel beside the options
  (`shared-screen-layout`
  § Scope and non-goals, *Board choice screens*). Custom's size form has a
  *Random* fill, as the 3D custom form does: it fills width, height and
  mines with a valid random board. *Insert Board Code* is the last board
  option: its code field starts a Classic 2D code as a challenge with the
  screen's *Play*, which is disabled while the field is empty or its code
  is refused — the reason shown live, as the custom fields' validation
  does, and a 3D code refused with a hint naming the 3D board choice
  (`game-shell`). *Play* is likewise disabled on a refused custom size.
- The start-of-game flow: a closed board, the first click, board
  generation around it, the timer starting once the board is ready. The
  "generating" card's *Cancel* goes back to the closed board, recording
  nothing.
- The Canvas 2D board: layout and scaling to the window, scrolling or
  panning for boards larger than the screen — by touch too, with a pinch
  zoom between the minimum tile and the tile at which the whole board fits
  — hit-testing, and per-cell redraw from the engine's change lists through
  `square-tile-skin`.
- Mouse input reproducing the reference's feel: press feedback on button
  down, reveal and chord on release and a flag on the right press, the
  chord gestures the reference accepts (left or middle on a number,
  left + right), and cancelling by moving off a cell before release.
- A *Swap clicks* toggle in the game window's head, across from Pause, that trades the
  left and right mouse buttons for presses starting on a closed or flagged
  cell, so the left button alone flags, unflags and chords. The switch
  lives for the page — kept across games, off on reload, never a setting —
  and the toggle shows only while the game is unpaused and only where a
  fine pointer exists (a coarse-only device has no mouse buttons to trade),
  and never takes keyboard focus. Keyboard, controller, touch and the 3D
  mode are unaffected.
- Touch input: a tap acts on its lift — it reveals a closed cell, or
  toggles its flag while the Tap choice is on *Tap: Flag*, and chords
  on a revealed number whichever way the choice is set — with the mouse's
  press feedback while the finger is down. A touch held 400 ms flags or
  unflags the cell under it while still held, with a short vibration where
  the device has one, and does nothing on a revealed cell. A touch that
  moves 8 px or more never acts: it pans a board that scrolls. The Tap
  choice, a control by the board on a coarse pointer only
  ([in-game-layout.md](./in-game-layout.md)), starts on Reveal and lives
  for the page, never a setting. Touch never reaches the mouse
  input; the 3D mode's touch play is its own and shares only the long-press
  time, the 8 px threshold and the vibration length.
- Keyboard and controller play: a visible cell cursor moved by arrow keys,
  d-pad or stick, with reveal, flag and chord on buttons, so Classic 2D is
  fully playable with a controller.
- The timer, mine counter and click counter, fed to the in-game overlay.
- Sound: each action, by mouse, touch, keyboard or controller, plays the
  synthesized cue the 3D game plays for the same outcome — reveal and chord
  scaled by the cells opened, a flag placed or removed, a no-op, the
  explosion of a loss and the win — at the shared volume and mute
  settings, with no setting of its own.
- Pause, restart and back to menu, as the game shell asks; the board is
  hidden while paused.
- The end-of-game moment: at a win or a loss the board plays the 3D game's
  end effect at board scale for a short end delay — on a win a pulse wave
  from the last action's cell and confetti over the board, on a loss the
  reveal wave from the exploded tile — before the results screen; any
  click, key or controller button cuts the delay short.
- Handing every finished or abandoned game's summary on, through
  `game-summary`.

Non-goals:

- Hexagonal and triangle grids, and grid choice in the menu —
  `hexagon-grid`, `triangle-grid`, `flat-grid-modes` and
  `flat-grid-menu-entries` (`m2c-flat-grids`); `flat-grid-geometry` writes
  this feature's board view against its geometry contract.
- Leaderboards and Steam ranks — deferred to `m3-on-steam`.
- Replays — deferred to `m2-3d-joins`.
- Campaign levels — deferred to `m4-campaigns`.
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
[input.md](../../context/input.md),
[input-camera.md](../../context/input-camera.md)) is left as it is; the controller reader
and its pure helpers in [input-controller.md](../../context/input-controller.md) are reused, not
copied.

- **Board setup.** Turns the chosen size and no-guess switch into a board
  request: the square graph from `cell-graph-rules-engine` and the
  generation options. Validates custom boards: width and height 1 to 100
  each, and a mine count from 1 up to the smaller of Minesweeper Online's
  size-dependent cap, recorded in `tests/fidelity/minesweeper-online.md`,
  and the cell count minus one. The site takes a mine in every cell on
  boards of up to 36 cells; this game keeps one cell free so the first
  click is always safe — a deliberate difference from the reference, and
  the same rule as 3D custom boards. A 1 × 1 board therefore has no room
  for a mine and is refused on the mines field, so the smallest custom
  board is 1 × 2 or 2 × 1 with 1 mine. The refusals read as the 3D form's:
  "Mines must be a whole number from 1 to <max> on a <width> × <height>
  board", and "A 1 × 1 board has no room for a mine beside the safe first
  click — make it at least 2 cells".
- **Game session.** Owns one game from closed board to result: holds the
  engine, places a standard board itself at the first click, asks the
  generation worker only for a no-guess board, shows the "generating" state
  when that answer is slow, starts the timer once the board is ready,
  applies actions, and on win or loss stops the timer and hands the summary
  on. A board pre-generated while the results screen showed
  (`board-generation` § Architecture) is taken over when the first click
  lands on its marked start cell, and discarded when it lands anywhere
  else. Restart discards the game and its pending generation; *Play again*
  starts a new one with the same choice, which opens with the marked start
  cell shown on the closed board while a pre-generated board waits for it.
  A daily or a challenge forces its start cell: the closed board marks it
  and the keyboard and controller cursor starts on it, a first reveal
  anywhere else changes nothing and is not recorded — the hint *Start on
  the marked cell* shows and the mark pulses —, and the board is the one
  generated for that cell with the code's seed, so the timer starts at the
  first click. A failed no-guess board of a challenge offers Back only,
  never another board.
- **Board view.** Fits the board to the window at the largest whole tile
  size that fits, capped by the board-scale setting (`settings`): 48 px at
  100 %, the default, 60 px at 125 %, no cap at Fit. Every scale shrinks the
  tile to the skin's minimum tile size before the board scrolls. The board
  sits centred in a framed panel sized to the board at its tile, in the
  board area of the game window, whose head, counter strip, figures panel
  and foot line reduce the room the fit rule works in (`in-game-layout`).
  A board that does not fit at the
  minimum fills the panel, the panel fills the board area, and the player
  scrolls or pans it; each edge beyond which cells are hidden carries an
  inset shadow, each overflowing axis a thin scroll bar showing the visible
  part's size and place, and the first clipped board shows a one-time hint
  beside it, "Wheel scrolls · Shift+wheel sideways" — on a coarse-only
  device "Drag to pan · pinch to zoom" — which never shows again once
  dismissed or once the player scrolls or pans. A board that fits draws
  none of the three. By touch, one finger pans a board that scrolls and two
  fingers pan and pinch: the pinch sets the tile anywhere between the
  minimum tile and the fit-to-view tile, its midpoint kept over the same
  board point and the scroll re-clamped, for the rest of that game — a new
  game, restart or *Play again* opens at the fit rule's tile; a pan or zoom
  changes no game state and records nothing. A setting change refits an
  open board at once. Maps
  pointer positions to cells, redraws only the cells each action changed,
  and asks `square-tile-skin` to paint each one.
- **Pointer input.** A press-and-release state machine over the mouse
  buttons that reproduces the reference: which buttons and combinations
  reveal, flag and chord, what shows as pressed while a button is held, and
  what releasing elsewhere does.
- **Button swap.** A per-press translator in front of the pointer state
  machine: while the switch is on, a press on a closed or flagged cell
  trades left and right, and the translation chosen at the press holds
  until that button's release. The state machine sees the logical buttons,
  so a swapped click keeps the timing, press feedback and chord gestures of
  the button it stands for; swapping finished actions instead would flag on
  a release and reveal on a press.
- **Touch input.** Its own state machine over touch pointers, beside the
  mouse's: the 400 ms long-press, the tap on its lift, the 8 px threshold,
  the one-finger pan, and two fingers that cancel the first finger's
  pending tap or long-press and drive the pan and pinch. It reads the
  Tap choice and the profile's press feedback, and suppresses the
  emulated mouse events a tap produces, so the mouse state machine and its
  profile markers never see a touch and a tap acts exactly once. Its
  actions are recorded in the replay like mouse ones; a touch has no hover
  position, so no pointer is sampled for it.
- **Cursor input.** A cell cursor driven by keyboard and controller, with
  auto-repeat for held directions, drawn as a focus ring over the board in
  a board-only cursor colour distinct from the tile edge it covers, so the
  ring shows on every tile state in every theme. The ring shows only once
  the player uses the cursor: no ring when a game starts; the first cursor
  key or controller input shows it on the cursor's cell, and the next mouse
  action on the board — a button pressed, or the pointer moving over it —
  hides it, the cursor keeping its cell. Pointer and cursor input both end
  in the same engine actions.
- **Timer.** Elapsed time measured from the moment the board is ready,
  running through pauses, stopped at win or loss; displayed in whole
  seconds in the overlay and kept at millisecond resolution for the
  result. Each pause, from the pause to the resume — or to the game's end
  when it is abandoned while paused — is one span on the game clock; a
  pause begun while the board is generated counts from the board's arrival.

## Data and state

- **Session state** — the current board choice, the engine instance, the
  seed and generator version of the board, timer start and the game's pause
  spans, pending generation request, cursor position. In memory for one
  game.
- **Last board choice** — size, custom dimensions and the no-guess switch,
  remembered between sessions through the game shell's settings storage so
  the mode reopens on the player's last choice. A player with no stored
  choice meets no-guess on; after that the switch is remembered as played.
- **Source of truth** — the engine for cell and game state; this feature
  derives nothing from the canvas.
- The game's summary — built by `game-summary` from the engine's summary
  or counts, the elapsed time, the pause spans, board choice, seed and
  generator version — is
  handed to the game shell; `personal-records` persists it.

## Interfaces and contracts

- **Start** — from the game shell, with a board choice; opens a closed
  board ready for its first click.
- **Pause, resume, restart, back to menu** — from the game shell. Pause
  hides the board and stops board input while the timer keeps running; it
  does nothing before the first click or after the game ends.
- **Overlay feed** — timer, mines left and the game's counted clicks (the
  engine's click counts the summary carries, wasted ones included), pushed
  to the game window's counters whenever they change, and the live figures'
  input — the engine's counts, flags, mines and elapsed time — fed to its
  figures panel (`in-game-layout`).
- **Game finished** — one event per won or lost game with its summary, sent
  to the game shell, which opens `results-screen`, after a short end delay
  (about one second, a named constant of the mode) in which the win
  confetti or the loss reveal wave plays on the board; any click, key or
  controller button during the delay ends it at once and does nothing else.
  A game in its end delay is finished, never abandoned: the page going away
  ends the delay and reports it finished. Its *Play again* comes back here
  as a new start with the same choice.
- **Game abandoned** — a restart or back to menu after the first click and
  before a win or loss reports the game's summary with outcome abandoned
  before the game is discarded; before the first click nothing is
  reported.
- **Game in progress** — the mode contract's `summary()` returns a
  started, unfinished game's summary so far, with outcome abandoned, built
  the same way as the abandoned report's; before the first click there is
  none.
- **Generation failure** — when a no-guess request fails, the session shows
  the failure and offers *Retry* (a new seed), *Play a standard board* (the
  same size, no-guess off) or *Main menu*, above the pause card and
  defaulting to *Play a standard board* after a second failure in a row, as
  `board-generation` § Failure offer settles; the timer never starts on a
  failed board.
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
- `board-generation` — the board built around the first click: a standard
  board placed on the main thread, a no-guess one in a worker, and the next
  no-guess board pre-generated for the marked start cell.
- `square-tile-skin` — the paint call and minimum tile size.
- `themed-board-art-and-motion` — the board ground and cursor ring
  colours of the active theme; `theme-system` — the theme-change
  notification.
- `screen-components` — the counters' display formats; `in-game-layout` —
  the game window around the board.
- Main menu and game shell (m1-classic-2d) — entry from the menu, pause,
  restart, back to menu, settings storage, controller navigation outside
  the board.
- `game-summary` — builds the summary of each finished or abandoned
  game.
- The sound module (`js/audio.js`) — the 3D game's synthesized cues, played
  at the volume and mute the settings apply.
- No external libraries.

## Controller mapping and held buttons

Settled: on the board, A or RT reveals, X or LT flags, and Y or both
triggers chord; no single "smart" button is offered, so a reveal never
chords a number and a chord never reveals. The
triggers match the 3D mode's trigger-as-mouse-button feel, and the face
buttons avoid B and Start, which keep their shell meanings (back and pause)
and never act on the board. Holding a reveal or chord button shows the same
pressed feedback as a held mouse button, and the action happens on release.
