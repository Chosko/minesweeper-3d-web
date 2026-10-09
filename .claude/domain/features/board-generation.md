# Board generation

Where every board's mines come from: a seeded, deterministic generator that
places mines around the player's first click, and, with the no-guess switch
on, a solver that only accepts boards solvable by logic alone. It runs in a
Web Worker so the game never freezes while a large no-guess board is built.

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
- The generation worker and its message protocol, used for every board, not
  only no-guess ones, so the start-of-game flow is one flow.
- A generator version, recorded with each board.

Non-goals:

- Campaign shapes, holes and difficulty profiles — deferred to
  `m4-campaigns`.
- Daily boards from the date — deferred to `m5-core-complete`; they reuse
  the seeded generator unchanged.
- The 3D mode's safe first click and no-guess switch — `3d-play-flow`
  (m2-3d-joins). The generator works over any cell graph; the 3D mode adds
  only the box graph description.
- Hexagonal and triangle grids — deferred to `m6-launch`.
- Pre-generating a no-guess board with a forced starting cell. The board is
  generated when the first click lands, so the player keeps a free first
  click. Minesweeper Online's no-guess mode marks a starting cell its server
  chooses (`tests/fidelity/minesweeper-online.md`), so generating at the
  first click is a deliberate difference from the reference.

## Architecture

Built within the recorded technical direction — a DOM-free JavaScript ES
module run in a Web Worker in the game and directly under Node's test runner
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
  thread; one request at a time per game, cancellable when the player
  leaves or restarts before it answers.

## Data and state

- **Request** — graph description (square: width, height; box: X, Y, Z),
  mine count, first-click cell, no-guess on or off, seed.
- **Result** — the mine set as cell indices, the seed, the generator
  version, and for no-guess boards the number of candidates tried.
- The seed of every game is chosen by the caller (random for free play) and
  returned with the board, so the board can be rebuilt exactly later.
- The worker holds no state between requests; nothing is persisted here.

## Interfaces and contracts

- **Generate** — request in, result out, as plain messages between the page
  and the worker. Determinism contract: same request, same generator version
  → same result, in the worker and in Node.
- **Timing** — Beginner and Intermediate boards, no-guess or not, answer
  fast enough that no pause shows. An Expert or large custom no-guess board
  may take long enough that the caller shows a short "generating" state;
  the generator promises an answer or a failure within its attempt budget,
  never an open-ended wait.
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

Consumed by `classic-2d-square-play`, which asks for a board when the first
click lands.

## Open questions

- What the player is offered when a no-guess request fails — retry, or a
  standard board — and whether high-density custom boards should refuse the
  no-guess switch up front. Blocks the failure message, not the generator.
- The attempt budget and the time Expert no-guess generation actually
  takes. Fixed by measurement once the solver exists; blocks the budget
  constant and whether the "generating" state is ever needed in practice.
