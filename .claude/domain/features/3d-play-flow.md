# 3D play flow

The 3D mode's game from board choice to result under the game's rules: the
Learn 3D guided board, then the cube 3D presets and custom boards with a
no-guess switch. Every game but that fixed, unrecorded
lesson board has a first click that is always safe because the board is
generated around it, the timer starting once that board is ready, and is
handed, finished or abandoned, to the shared results and records like a
Classic 2D game.

## Purpose

[product-design.md § 3D mode](../product-design.md#3d-mode) makes the
existing 3D game one mode among several, with a safe first click and a
no-guess switch, and the m2 exit criteria require both on every 3D game and
3D games feeding the same results screen, personal bests and stats history
as Classic 2D. `3d-board-graph` puts the 3D box on the shared engine; this
feature is the flow around it — what the player chooses, what happens
between the first click and a ready board, and what the mode reports to the
game shell — while the scene, camera and controls stay as they are.

## Scope and non-goals

In scope (m2-3d-joins):

- Board choice: Learn 3D first, then the 3D presets
  (`shared-screen-layout` § Scope and non-goals, **3D presets**), named as
  results and Records name them, each showing its name, size line and mine
  density, with no Last played mark — the last board played is selected
  when the board choice opens —, then Custom with the Random fill, then
  *Insert Board Code*, and the no-guess switch, which says it keeps
  separate records. The selected board's bests show in the board choice's
  panel beside the options (`shared-screen-layout` § Scope and non-goals, *Board choice
  screens*). Cube Beginner's mine count is measured by
  `dev/measure-first-box-3d.mjs`: no-guess boards with the first click on
  the marked start cell, so that its first click opens about 60 % of the
  safe cells.
- Learn 3D: one guided 4 × 4 × 3 lesson box, a fixed board with its own
  mine count taken from a fixed seed (`dev/find-learn-3d.mjs`) with a
  forced, marked start cell, played through the 3D game with four prompts
  in the hint strip — hold Shift on the lesson number, hold Ctrl, flag the
  one cube that must be a mine, chord the lesson number — then "Clear the
  rest of the box". No timer, no summary, no records and no replay; it ends
  on its own end card, not the results screen, which also offers *Back to
  board choice*: a win marks the 3D rules as learned and offers a first
  real board (`shared-screen-layout` § Scope and non-goals, **3D
  presets**); a loss offers Try again. It is repeatable and never
  the last 3D choice. Until the player finishes a 3D game or wins Learn 3D,
  every other 3D board's ready card offers it in one line.
- The start-of-game flow: a closed box, the first reveal, generation around
  it, the "generating" state, the timer starting when the board is ready.
- The first-click guarantee in 3D: the same rule as Classic 2D's pinned
  reference rule — the clicked cell is safe, not necessarily an opening.
- The no-guess switch on every preset, and on custom boards up to a
  cell-count limit and with no side of exactly 2 cells, shown disabled with
  its reason otherwise.
- The 3D mode's side of the mode contract: reporting game started, finished
  and abandoned with a summary built through `game-summary`, and returning a
  started game's summary so far when the shell asks.
- Leaving the current 3D best times behind: they are neither read, shown
  nor imported.

Non-goals:

- The flat 3D presets (9 × 9 × 1, 16 × 16 × 1, 30 × 16 × 1) — dropped;
  flat boards are Classic 2D's.
- Double-layer presets (8 × 8 × 2, 14 × 14 × 2, 25 × 16 × 2) — dropped: a
  box with a side of exactly 2 cells is never a no-guess board, because two
  stacked cells share every neighbour and a mine in one of them is always a
  coin flip. Records and replays already made on those sizes, and on
  12 × 12 × 8 with 130 mines, stay in the history as custom boards, since
  the preset labels and listing in `3d-game-records` recognise only the
  presets the board choice offers.
- The 3D scene's look, the camera, view modes and controls — kept as they
  are, per the m2 slice.
- 3D board identities, 3D personal bests and history, and the 3D results
  and Records screens — the Results and records slice of `m2-3d-joins`.
- Recording and watching 3D replays — the Replays slice of `m2-3d-joins`.
- 3D campaign levels — deferred to `m4-campaigns`.
- Demo locks on the harder presets, custom boards and no-guess — deferred
  to `m5-core-complete`.
- Leaderboards — deferred to `m3-on-steam`.

## Architecture

Built within the recorded technical direction — the 3D front-end in
three.js over the shared engine, with no-guess generation in the Web
Worker (see
[technical-direction.md](../technical-direction.md)). It reshapes the 3D
mode's existing game flow ([app-shell.md](../../context/app-shell.md)) and
its adapter to the game shell's mode contract (`game-shell`); the renderer
and input ([rendering.md](../../context/rendering.md),
[input.md](../../context/input.md),
[input-camera.md](../../context/input-camera.md)) are reused without change to their
behaviour.

- **3D board choice.** The 3D menu's presets, custom fields, Random fill
  and no-guess switches. Each preset shows its name, size line, mine
  density (mines ÷ cells as a whole percent, one decimal below 10 %), as
  Classic 2D's board options do, with no Last played mark and nothing from
  the records. The selected board's bests show in the board choice's panel
  beside the options, composed as
  Classic 2D's (`shared-screen-layout` § Scope and non-goals, *Board
  choice screens*): they follow the no-guess switch that governs the
  selected board, since a board and its no-guess twin are separate records.
  While Learn 3D is selected the screen shows how 3D works and that the
  lesson keeps no records, with no switch and no bests. Each no-guess switch says once that no-guess boards keep separate
  records. Validates custom sizes (each dimension 1 to 100,
  mines 1 to cells minus one) and decides whether no-guess is available for
  the chosen size, by the availability rule under Interfaces and contracts. Remembers the last 3D choice through the shell's
  last-board-choice mechanism. The *Insert Board Code* option's code field
  starts a 3D code as a challenge with the screen's *Play*, which is
  disabled while the field is empty or its code is refused — the reason
  shown live, and a Classic 2D code refused with a hint naming the Classic
  2D board choice (`game-shell`); *Play* is likewise disabled on a refused
  custom size. Learn 3D, the first item, starts
  the guided board without saving or marking a choice.
- **3D game session.** Owns one 3D game: builds the box graph and the game
  awaiting its first click, shows the closed box, and on the first reveal
  places a standard board around that cell itself, or asks the generation
  worker for a no-guess one; while it waits it shows the "generating" state
  and accepts no board action; the "generating" card's *Cancel* goes back
  to the closed box, its flags kept, recording nothing. A box pre-generated
  while the results screen showed (`board-generation` § Architecture) is
  taken over when the first reveal lands on its marked start cell, and
  discarded when it lands anywhere else; *Play again* opens the closed box
  with the marked start cell shown while a pre-generated board waits for
  it. A daily (the cube 8 × 8 × 8 · 40 no-guess) or a challenge forces its
  start cell: the closed box tints it, a first reveal elsewhere changes
  nothing and is not recorded — the hint *Start on the marked cell* shows
  and the tint pulses —, flags before it are kept as always, and the board
  is the one generated for that cell with the code's seed; a failed one
  offers Back only. The Learn 3D guided board forces its start cell the
  same way, its board fixed in advance: no generation request is made. When the board arrives it applies the reveal and starts the timer. It drives actions from the existing mouse state machine,
  fed by the mouse buttons, the controller triggers, the keyboard's reveal and flag keys and touch, stops the timer at a win or loss, and builds the
  summary. Restart and leave cancel a pending generation.
- **Mode adapter.** Implements the game shell's mode contract for 3D over
  the session: start, pause, resume, restart and leave, keeping today's
  pointer-lock and lockless behaviour, and reporting started, finished and
  abandoned. On a coarse-only device (coarse and no fine pointer) 3D plays
  by touch: the ready card reads "Tap to play", lists the touch gestures in
  place of the keys and keeps its Back action, and a tap enters lockless
  touch play — a left-thumb stick to fly, a right-half drag to look, tap,
  long-press and two-finger tap on the shared mouse state machine, pinch
  for the spacing and a view-modes toolbar of latched Shift, Space and Ctrl
  toggles. No path requests pointer lock there: not the card, resume,
  restart, a failed board's Retry or standard offer, fullscreen, nor Look
  at the board, which opens lockless as a controller's does, the stick and
  the drag flying it and a tap bringing the card back; a controller's Start
  still enters lockless play. After a second pointer-lock refusal (one inside the browser's
  re-lock delay does not count) the ready card explains that the browser
  is blocking mouse capture on this page and offers drag-to-look play or
  the controller, at once on every later ready card of the page session.

## Data and state

- **Board choice** — X, Y, Z, mine count and no-guess. The last 3D choice
  is persisted per mode, as `game-shell` describes. A player with no stored
  choice meets no-guess on, on the presets and the custom board alike;
  after that the switch is remembered as played. A remembered choice naming
  a preset opens on that preset's current board, since preset ids name the
  tier, not the board; one naming a preset that
  is no longer offered opens on cube Beginner with no-guess on. Learn 3D is
  never stored as the last choice: it is a board outside the choice.
- **Session** — the game, the pending generation request, the timer, and
  the seed and generator version of the board once it arrives. In memory
  only.
- **Old best times** — the per-size best times the current 3D game keeps in
  browser storage are no longer read or written. They are left where they
  are, not deleted and not imported: they were set without a safe first
  click and are not comparable with new games.

## Interfaces and contracts

- **First-click guarantee** — the 3D game asks `board-generation` for a
  board with the same first-click rule Classic 2D pins: the clicked cell
  alone is mine-free, so the first click is safe but not always an
  opening. The request never fails for density below the mine cap of
  every cell but one. The Learn 3D guided board is fixed in advance instead,
  and its first reveal is forced onto its marked start cell.
- **No-guess availability** — offered on every preset, and on a custom
  board whose cell count is at or below the no-guess limit and none of
  whose sides is exactly 2 cells. Otherwise the custom switch is shown
  disabled, with its reason shown above it: "No-guess isn't available when
  a side is 2 cells" when a side is 2 — it takes precedence, as no smaller
  size of that shape would help — and "No-guess is available up to N
  cells" above the limit. The side rule holds at every density: on
  8 × 8 × 2, no seed of 50 gave a no-guess board. A side of 1 is a flat
  board and keeps no-guess. The limit is one constant, 8,000 cells
  (20 × 20 × 20), set by wait: `dev/measure-noguess-3d.mjs` times no-guess
  requests on box boards of growing size at the presets' densities, which
  meet the attempt budget at every size, and the slowest request at the
  limit takes about half a second. Above 25 % mines with no-guess on, a
  hint under the custom switch says a no-guess board may not be found; it
  warns and never disables the switch or refuses the board.
- **No-guess failure** — a no-guess request that exhausts its budget is
  handled exactly as Classic 2D handles it, by the rule `board-generation`
  records.
- **Timer** — starts when the first reveal is applied to the generated
  board, and is shown in the overlay in the timer format `screen-components`
  sets. A left release on a flagged cell before that, and any chord, does
  not start it. Flags may be placed before the first reveal and are kept.
  The Learn 3D guided game shows no timer, on the overlay, the pause card
  or its end card.
- **Mode contract** — `game started` at the first applied reveal; `game
  finished(summary, replay)` at a win or loss, once the end effect has
  played or the player cut the end delay short, so the results screen
  follows it as the m2 Results and records
  slice decides; `game abandoned(summary, replay)` when a started,
  unfinished game is restarted or left, the replay being the game's sealed
  recording from `replay-recording`. A game left before the first reveal
  reports nothing.
  `summary()` returns a started, unfinished game's summary so far, outcome
  abandoned, so a game ended by closing the window counts as `game-shell`
  describes; before the first reveal there is none. The Learn 3D guided
  game has no summary: it reports neither a finished nor an abandoned game
  to the records or the replay library, and ends on the Learn 3D end card.
- **Summary** — built by `game-summary` from the engine's summary or
  counts, the elapsed time, the pause spans, the 3D board choice, the seed
  and the generator version. The 3D fields of the board identity belong to the m2 Results and
  records slice. A fixed board — the Learn 3D guided board, made by no
  generator in the game — has none, and so no replay.
- **Pause** — as `game-shell` describes for every mode: the board is hidden
  and the timer keeps running; each pause lasts until the return to play,
  or to the game's end when it is abandoned while paused. A pause during
  generation keeps the request running and the timer unstarted until the
  board arrives, the pause counting from there.
- **Failure** — a lost graphics context is reported to the shell as a
  start or play failure, as `game-shell` describes; a pending generation is
  cancelled.

## Dependencies

- `3d-board-graph` — the box graph, the 3D rule profile and the 3D state
  view.
- `board-generation` — boards around the first click, the no-guess solver,
  the worker and its attempt budget.
- `cell-graph-rules-engine` — the pinned first-click rule and the game's
  counts.
- `game-shell` — the mode contract, pause, restart and the last board
  choice.
- `game-summary` — the summary builder.
- `settings` — look sensitivity, invert Y, audio and render resolution,
  read as today.
- No external libraries.
