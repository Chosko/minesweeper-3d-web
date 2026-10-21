# Board generation

Where every board's mines come from: a seeded, deterministic generator that
places mines around the player's first click, and, with the no-guess switch
on, a solver that only accepts boards solvable by logic alone. No-guess
boards are built in a Web Worker so the game never freezes while a large
one is built; standard boards are placed at once on the main thread.

## Purpose

[product-design.md § Classic 2D](../product-design.md#classic-2d) offers a
safe first click and a no-guess switch, and the roadmap requires no-guess
boards at every size that never require a guess. Enthusiasts treat a forced
guess on a no-guess board as a broken game, so the solver's correctness is
the feature. Generation is deterministic — the same seed and generator
version produce the same board on every machine — because
[technical-direction.md](../technical-direction.md) makes the daily board
and later campaign levels depend on it.

## Scope and non-goals

In scope (m1-classic-2d):

- A seeded pseudo-random source with a fixed algorithm, owned by the
  generator so its output never depends on the platform.
- Standard placement: a uniformly random mine set honouring the first-click
  guarantee of the reference ruleset (`cell-graph-rules-engine`).
- No-guess placement: candidate boards are generated and checked by a
  logic-only solver from the first click; the first candidate the solver
  clears entirely is the board.
- The logic-only solver over any cell graph, with no guessing and with the
  remaining-mine count as one of its constraints.
- The generation worker and its message protocol, used for no-guess boards
  only. A standard board is placed synchronously on the main thread at the
  first click, by the same code the worker runs, so it opens with the
  click.
- The marked start cell of every board, and the next no-guess board
  pre-generated for it while the results screen shows.
- A generator version, recorded with each board.
- Daily boards from the date and board codes that rebuild any board: the
  generator serves both unchanged — a daily board is a no-guess request
  with the daily seed and its marked start cell as the first click, and a
  code carries the board, seed, start cell and generator version
  (`game-summary` § Architecture, "Board code").

Non-goals:

- Campaign shapes, holes and difficulty profiles — deferred to
  `m4-campaigns`.
- The 3D mode's safe first click and no-guess switch — `3d-play-flow`
  (m2-3d-joins). The generator works over any cell graph; the 3D mode adds
  only the box graph description.
- Hexagonal and triangle grids — `hexagon-grid` and `triangle-grid`
  (`m2c-flat-grids`).
- A forced starting cell in free play. A board pre-generated for the
  marked start cell is used only when the first click lands there; a first
  click anywhere else discards it and the board is generated around that
  click, so the player keeps a free first click. Minesweeper Online's
  no-guess mode forces a starting cell its server chooses
  (`tests/fidelity/minesweeper-online.md`), so the free first click is a
  deliberate difference from the reference. The daily board and a
  challenge — a game started from a board code — are the one place the
  start cell is forced and marked (`game-shell`).

## Architecture

Built within the recorded technical direction — a DOM-free JavaScript ES
module run in a Web Worker in the game for no-guess boards, on the main
thread for standard ones, and directly under Node's test runner
(see [technical-direction.md](../technical-direction.md)). It is a feature
of its own rather than part of the rules engine, because the solver is the
largest and riskiest piece of m1 and is shared later by campaigns and the
daily board, which never play through the engine's actions.

- **Seeded source.** A small, fixed pseudo-random algorithm seeded from a
  32-bit or wider seed. Part of the generator version: changing it bumps
  the version.
- **Placer.** Given a cell graph, a mine count, a first-click cell and a
  seeded source, draws a mine set that honours the first-click guarantee:
  the first-click cell alone is excluded, as the pinned reference rule
  says, and its neighbours may hold mines, so the first click is safe but
  not always an opening.
- **Solver.** Given a graph, a mine set and a first-click cell, plays the
  board by deduction alone: single-cell rules first, then subset and
  overlapping-constraint reasoning between neighbouring numbers, then the
  remaining-mine count over the frontier. Reports whether the board clears
  without a guess. It never sees a mine it has not deduced.
- **No-guess loop.** Draws candidates from the seeded source, one after
  another, until the solver clears one or an attempt budget runs out. The
  sequence of candidates is part of the deterministic output: the same seed
  always yields the same accepted board.
- **Generation worker.** Hosts the placer, solver and loop off the main
  thread for no-guess boards; one request at a time, cancellable when the
  player leaves or restarts before it answers. Each mode keeps one worker
  for the page, spawned and warmed when its board choice opens, so the
  first no-guess board pays no worker start-up. The placer also runs on the
  main thread, for standard boards.
- **Background generation.** When a no-guess game finishes, its mode asks
  the worker for the next board of the same board choice for the marked
  start cell, with a fresh seed, while the results screen shows. The next
  start with the same choice (Play again, or Restart of the finished game)
  takes it over and shows the marked start cell on the closed board until
  the first click; a start with another choice, or leaving the mode,
  discards it.

## Data and state

- **Request** — graph description (square: width, height; box: X, Y, Z),
  mine count, first-click cell, no-guess on or off, seed.
- **Result** — the mine set as cell indices, the seed, the generator
  version, and for no-guess boards the number of candidates tried.
- The seed of every game is chosen by the caller (random for free play,
  the daily seed for a daily board, the code's seed for a challenge) and
  returned with the board, so the board can be rebuilt exactly later. A
  pre-generated board records the seed its request used and is rebuilt
  exactly from it with its marked start cell as the first click.
- **Marked start cell** — exactly one per board, a pure function of the
  graph description: the centre cell of each side (square: column
  ⌊width / 2⌋, row ⌊height / 2⌋; box: ⌊X / 2⌋, ⌊Y / 2⌋, ⌊Z / 2⌋). It is a
  request input like any first click and changes nothing in the placer,
  the solver or the no-guess loop, so it changes no board and no generator
  version.
- The worker holds no state between requests; nothing is persisted here.

## Interfaces and contracts

- **Generate** — request in, result out, as plain messages between the page
  and the worker; during a no-guess request the worker posts progress
  messages (the candidates tried so far, at most every 250 ms) before its
  one result, and progress never changes the result. Determinism contract:
  same request, same generator version → same result, in the worker, on the
  main thread and in Node.
- **Timing** — a standard board is placed in the first click's own call.
  Beginner, Intermediate and Expert no-guess boards answer fast enough that
  no pause shows (measured in § Attempt budget and timing). A large custom
  no-guess board may take long enough that the caller shows its
  "generating" state, with a progress line ("candidate 14 · 6 s": the
  candidates tried and the whole seconds since the click) and *Play a
  standard board*, which cancels the request and plays the same size with
  no-guess off at once; the generator promises an answer or a failure
  within its attempt budget, never an open-ended wait.
- **Failure** — an impossible request (more mines than the first-click
  guarantee leaves room for: every cell but the first-click cell) is
  rejected at once with a reason. A no-guess
  request that exhausts its budget returns a failure, not a board that
  needs a guess; the caller decides what the player is offered.
- **Cancel** — a cancelled request never delivers a result.
- **Solver correctness** — tested on hand-built boards with a known answer
  (solvable, needing exactly one guess, needing a guess only at the end) and
  by checking that every accepted no-guess board clears with the solver from
  its first-click cell.

## Dependencies

- `cell-graph-rules-engine` — the cell graph and the square-grid provider,
  the number computation the solver reasons over, and the pinned first-click
  guarantee.
- The platform's Web Worker, in the web build and in Electron's Chromium.
  No external libraries.

Consumed by `classic-2d-square-play` and `3d-play-flow`, whose game sessions
place a standard board or ask for a no-guess one when the first click
lands.

## Failure offer

Settled: when a no-guess request fails, the player is offered *Retry* (the
same board request with a new seed), *Play a standard board* (the same
size with no-guess off) or *Main menu*. The offer shows above the pause
card, also when the failure arrives while the game is paused, and takes the
focus: *Retry* after a first failure, *Play a standard board* after a
second failure in a row. High-density custom boards do not refuse the
no-guess switch up front; above 25 % mines the board choice shows a hint
that a no-guess board may not be found, and the failure offer covers them.

## Attempt budget and timing

Settled by measurement of Expert no-guess generation (30 × 16, 99 mines)
under Node 22, over a fixed set of 1000 seeds: a board takes a median of 23
candidates and at worst 433 (about 1 candidate in 36 clears), in a median of
2 ms and at worst about 40 ms. The attempt budget is 2000 candidates, over
four times the worst seen; 2000 failing Expert candidates take about 0.2 to
0.3 s, which bounds a failure's wait.
