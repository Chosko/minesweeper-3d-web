# 3D play flow

The 3D mode's game from board choice to result under the game's rules: the
six 3D presets and custom boards with a no-guess switch, a first click that
is always safe because the board is generated around it, the timer starting
once that board is ready, and every finished or abandoned game handed to the
shared results and records like a Classic 2D game.

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

- Board choice: six presets — double layer Beginner (8 × 8 × 2, 10 mines),
  Intermediate (14 × 14 × 2, 60), Expert (25 × 16 × 2, 130), and cube
  Beginner (6 × 6 × 6, 10), Intermediate (8 × 8 × 8, 40), Expert
  (12 × 12 × 8, 130) — plus Custom and the Random fill, and the no-guess
  switch.
- The start-of-game flow: a closed box, the first reveal, generation around
  it, the "generating" state, the timer starting when the board is ready.
- The first-click guarantee in 3D: the same rule as Classic 2D's pinned
  reference rule — the clicked cell is safe, not necessarily an opening.
- The no-guess switch on every preset and on custom boards up to a
  cell-count limit, shown disabled with its reason above the limit.
- The 3D mode's side of the mode contract: reporting game started, finished
  and abandoned with a summary built through `game-summary`, and returning a
  started game's summary so far when the shell asks.
- Leaving the current 3D best times behind: they are neither read, shown
  nor imported.

Non-goals:

- The flat 3D presets (9 × 9 × 1, 16 × 16 × 1, 30 × 16 × 1) — dropped;
  flat boards are Classic 2D's.
- The 3D scene's look, the camera, view modes and controls — kept as they
  are, per the m2 slice.
- 3D board identities, 3D personal bests and history, and the 3D results
  and Records screens — the Results and records slice of `m2-3d-joins`.
- Recording and watching 3D replays — the Replays slice of `m2-3d-joins`.
- 3D campaign levels and the 3D daily board — deferred to `m4-campaigns`
  and `m5-core-complete`.
- Demo locks on the harder presets, custom boards and no-guess — deferred
  to `m5-core-complete`.
- Leaderboards — deferred to `m3-on-steam`.

## Architecture

Built within the recorded technical direction — the 3D front-end in
three.js over the shared engine, with generation in the Web Worker (see
[technical-direction.md](../technical-direction.md)). It reshapes the 3D
mode's existing game flow ([app-shell.md](../../context/app-shell.md)) and
its adapter to the game shell's mode contract (`game-shell`); the renderer
and input ([rendering.md](../../context/rendering.md),
[input.md](../../context/input.md)) are reused without change to their
behaviour.

- **3D board choice.** The 3D menu's presets, custom fields, Random fill
  and no-guess switch. Validates custom sizes (each dimension 1 to 100,
  mines 1 to cells minus one) and decides whether no-guess is available for
  the chosen size. Remembers the last 3D choice through the shell's
  last-board-choice mechanism.
- **3D game session.** Owns one 3D game: builds the box graph and the game
  awaiting its first click, shows the closed box, and on the first reveal
  asks the generation worker for a board around that cell; while it waits
  it shows the "generating" state and accepts no board action; when the
  board arrives it applies the reveal and starts the timer. It drives
  actions from the existing mouse state machine and controller mapping,
  stops the timer at a win or loss, and builds the summary. Restart and
  leave cancel a pending generation.
- **Mode adapter.** Implements the game shell's mode contract for 3D over
  the session: start, pause, resume, restart and leave, keeping today's
  pointer-lock and lockless behaviour, and reporting started, finished and
  abandoned.

## Data and state

- **Board choice** — X, Y, Z, mine count and no-guess. The last 3D choice
  is persisted per mode, as `game-shell` describes.
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
  every cell but one.
- **No-guess availability** — offered on every preset, and on a custom
  board whose cell count is at or below the no-guess limit. Above it the
  switch is shown disabled, with the reason ("No-guess is available up to
  N cells") shown above it. The limit is one constant, set from measured
  generation time so that a board at the limit answers within the
  generator's attempt budget.
- **No-guess failure** — a no-guess request that exhausts its budget is
  handled exactly as Classic 2D handles it, by the rule `board-generation`
  records.
- **Timer** — starts when the first reveal is applied to the generated
  board, and is shown with two decimals as today. A left release on a
  flagged cell before that, and any chord, does not start it. Flags may be
  placed before the first reveal and are kept.
- **Mode contract** — `game started` at the first applied reveal; `game
  finished(summary)` at a win or loss, once the end effect has played, so
  the results screen follows it as the m2 Results and records slice
  decides; `game abandoned(summary)` when a started, unfinished game is
  restarted or left. A game left before the first reveal reports nothing.
  `summary()` returns a started, unfinished game's summary so far, outcome
  abandoned, so a game ended by closing the window counts as `game-shell`
  describes; before the first reveal there is none.
- **Summary** — built by `game-summary` from the engine's summary or
  counts, the elapsed time, the 3D board choice, the seed and the generator
  version. The 3D fields of the board identity belong to the m2 Results and
  records slice.
- **Pause** — as `game-shell` describes for every mode: the timer stops and
  the board is hidden; a pause during generation keeps the request running
  and the timer unstarted.
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

## Open questions

- The no-guess cell-count limit. Set by measuring no-guess generation time
  on 3D boards once the solver exists; blocks the constant and the disabled
  switch's message, not the flow.
