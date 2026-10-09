# Cell-graph rules engine

The one rules engine every mode plays through: a board is a graph of cells
and their neighbours, and reveal, flood fill, flag, chord, win, loss and the
game's 3BV and click counts are implemented once over that graph. In
m1-classic-2d it carries the square grid and plays Classic 2D exactly as
Minesweeper Online does with its default options.

## Purpose

[product-design.md § Classic 2D](../product-design.md#classic-2d) asks for
flat Minesweeper whose logic reproduces Minesweeper Online exactly, and the
roadmap's first exit criterion holds it to that on every action. Enthusiasts
notice a rule that is subtly wrong before anything else, so this engine's
first job is fidelity, and fidelity is checked rather than asserted: every
rule whose behaviour the reference could plausibly do two ways is pinned by
a fidelity test written from an observation of the live site.

The engine is graph-based, rather than a square-grid engine, because
[technical-direction.md](../technical-direction.md) makes one engine serve
every grid and mode; the square grid is the first graph it is given.

## Scope and non-goals

In scope (m1-classic-2d):

- The engine over an arbitrary cell graph: cell state, reveal with flood
  fill, flag and unflag, chord, the first-click hand-off to board
  generation, win and loss, and post-game state.
- The square-grid graph provider: 8-neighbour cells on a width × height
  rectangle.
- The reference ruleset: Minesweeper Online with its default options, each
  rule that could go two ways pinned by a fidelity test (see Interfaces and
  contracts).
- Per-game counts the results screen needs: the board's 3BV, the 3BV
  solved so far, and the player's clicks by kind.
- A deterministic, ordered stream of applied actions, so that the same
  board and the same actions always produce the same game.

Non-goals:

- Hexagonal and triangle graphs — deferred to `m6-launch`; they slot in as
  further graph providers with no engine change.
- The 3D and Surface graphs. The 3D mode keeps the existing engine
  ([logic.md](../../context/logic.md)) in m1; moving it onto this engine,
  with its unlinking and its own right-click rule, is the 3D mode slice of
  `m2-3d-joins`.
- Mine placement, the safe first click and no-guess generation —
  `board-generation`.
- The timer, input mapping and drawing — `classic-2d-square-play`.
- Derived stats (3BV/s, efficiency) — `game-summary`; personal bests and
  stats history — `personal-records`.
- Recording and playing back replays — `m2-3d-joins`. The action stream is
  the hook they will use; no replay format is defined here.
- Variant rules of any kind — rejected by the product design.

## Architecture

Built within the recorded technical direction — a DOM-free JavaScript ES
module run unchanged under Node's test runner (see
[technical-direction.md](../technical-direction.md)).

- **Cell graph.** An immutable description of a board's topology: a cell
  count and, per cell, its neighbour list. Built once per board by a graph
  provider and shared by the engine, the generator and the renderer. Cells
  are identified by a dense integer index; what an index means in space
  belongs to the provider.
- **Square-grid provider.** Builds the graph for a width × height square
  board and maps between a cell index and its column and row. Neighbour
  order is fixed and documented, because generation and flood-fill order
  depend on it.
- **Game state.** Per cell: mine or number, revealed, flagged; per game:
  phase, mine count, flag count, unrevealed safe-cell count, the exploded
  cell, and the counts below. Held in flat typed arrays over the cell index,
  as the existing engine does, so an Expert or large custom board updates
  without allocation.
- **Rules.** The actions — reveal, toggle flag, chord — applied to the state
  under the reference ruleset. Flood fill is iterative. Each action returns
  what changed, so the renderer redraws only those cells and the audio layer
  can pick a sound, the same pattern [logic.md](../../context/logic.md)
  describes for the 3D engine.
- **Board metrics.** Computes the board's 3BV once the mines are placed
  (each opening counts once, each safe cell outside any opening's reach
  counts once) and tracks how much of it the player has solved, so a loss
  can still report progress.

The existing 3D engine is neither extended nor replaced in m1; both engines
live side by side until the 3D mode moves over.

## Data and state

- **Board** — the graph plus a mine set. The mine set comes from
  `board-generation`; the engine never chooses where mines go.
- **Phases** — *awaiting first click* (graph known, no mines), *playing*,
  *won*, *lost*. The first reveal in *awaiting first click* does not act on
  its own: it is handed to the caller as a request for a board built around
  that cell, and is applied once the board arrives.
- **Counts** — 3BV of the board, 3BV solved, and clicks split into
  effective and wasted per action kind (reveal, flag, chord), counted by the
  reference's rules for what is a click.
- **Action stream** — the ordered list of applied actions with their cell
  indices. In memory only, for the length of a game; the timing of each
  action belongs to the caller.
- Nothing is persisted by the engine. The finished game's summary is handed
  to `game-summary`; `personal-records` owns persistence.

## Interfaces and contracts

- **Create** — from a graph and a mine count, in *awaiting first click*; or
  from a graph and a full mine set, for tests and later replays, directly in
  *playing*. Invalid input — a mine count outside what the board and the
  first-click guarantee allow, a mine index out of range or repeated —
  throws a range error, never a half-built game.
- **First-click hand-off** — the first reveal returns "board needed at cell
  c"; the caller obtains a board from `board-generation` with c as the
  first-click cell and supplies it; the engine then applies the reveal. A
  supplied board that breaks the first-click guarantee is rejected.
- **Actions** — reveal, toggle flag, chord: each takes a cell index and
  returns the cells changed and whether the game ended. An action outside
  *playing* is a no-op that changes nothing and counts nothing.
- **Queries** — a cell's visual state (closed, flagged, revealed with its
  number, mine, exploded mine, wrong flag) in the vocabulary
  `square-tile-skin` paints; mines left (mines minus flags, may go
  negative); phase; counts.
- **Game summary** — at win or loss: outcome, board dimensions and mine
  count, 3BV, 3BV solved, click counts. `game-summary` derives 3BV/s and
  efficiency from it, or from the counts of an abandoned game, and the
  caller's elapsed time.
- **Reference ruleset, pinned by fidelity tests.** Each of these is
  observed once on Minesweeper Online with its default options, the
  observation is recorded beside the test, and a Node test asserts the
  engine reproduces it:
  - what the first click guarantees — a safe cell, or always an opening
    (`board-generation` implements it; the guarantee is stated here);
  - whether a left click on a revealed, satisfied number chords, and which
    inputs chord at all;
  - what a chord does when its flags are wrong;
  - what the board shows on a loss: unflagged mines, wrong flags, the
    exploded mine;
  - what counts as a click for efficiency, and whether wasted clicks count;
  - whether flagging is possible on a revealed cell (it is not expected to
    be).
  A rule the engine plays differently from the observation is a defect,
  never a design choice, unless a feature document records it as a
  deliberate difference.

## Dependencies

- `board-generation` — supplies the mine set for a board, built around the
  first-click cell.
- No external libraries.

Consumed by `classic-2d-square-play` (drives the actions and draws the
state) and by `game-summary` (reads the game summary and counts).

## Open questions

- The fidelity observations themselves. Each pinned rule above needs one
  recorded observation of Minesweeper Online with default options, made by a
  person on the live site; until then its test cannot be written. Blocks the
  fidelity tests, not the engine's structure.
