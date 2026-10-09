# 3D board graph

The 3D box of cubes as a board of the shared rules engine: a graph provider
for X × Y × Z boxes with up to 26 neighbours per cell, and a 3D rule
profile that carries what the 3D game plays differently from Classic 2D —
auto-hiding solved cells, flagging every neighbour from a revealed cell —
so the 3D mode plays through the same engine, generator and solver as every
other mode and the separate 3D engine is retired.

## Purpose

[product-design.md § 3D mode](../product-design.md#3d-mode) keeps the
existing 3D game's look, controls and feel and changes its rules in two
ways: the first click is always safe, and a no-guess switch is available.
Both need the board to be a cell graph that `board-generation` can place
mines on and solve, and the roadmap's m2 goal — 3D plays by the game's
rules and shares its records — needs 3BV and click counts computed by the
same code as Classic 2D. [technical-direction.md](../technical-direction.md)
names one engine over a graph of cells for every mode; this feature makes
the 3D box that graph.

## Scope and non-goals

In scope (m2-3d-joins):

- The box graph provider: the cell graph of an X × Y × Z box, each
  dimension 1 to 100, with the 26-neighbourhood clipped at the edges.
- The 3D rule profile on the shared engine: the original game's rules for
  reveal, chord, right-click and auto-hiding (unlinking), as
  [ORIGINAL_SPEC.md](../../../docs/ORIGINAL_SPEC.md) states them, except
  where this document records a deliberate difference.
- The 3D state view: what the 3D renderer, picking and the HUD read from a
  game, served from the shared engine.
- Retiring the separate 3D engine ([logic.md](../../context/logic.md)) and
  porting its rule tests to the 3D profile.

Non-goals:

- The first-click flow, the no-guess switch, board choice and the hand-off
  of finished games — `3d-play-flow`.
- Any change to the 3D scene's look, camera or controls — ruled out by the
  m2 slice ("no visual redesign of the 3D scene").
- 3D board identities and 3D records — the Results and records slice of
  `m2-3d-joins`.
- Replays of 3D games — the Replays slice of `m2-3d-joins`; it records the
  engine's action stream, which this profile feeds like any other.
- Boards with holes and campaign shapes — deferred to `m4-campaigns`; the
  provider is a full box only.
- Surface boards — deferred to `m6-launch`.

## Architecture

Built within the recorded technical direction — a DOM-free JavaScript ES
module beside the rules engine, run unchanged under Node's test runner (see
[technical-direction.md](../technical-direction.md)). It extends
`cell-graph-rules-engine` with one more graph provider and one more rule
profile, and replaces the 3D engine described in
[logic.md](../../context/logic.md).

- **Box graph provider.** Builds the graph of an X × Y × Z box and maps
  between a cell index and its (i, j, k) coordinates. It keeps the current
  index layout (i fastest, then j, then k) and the current neighbour order,
  because the renderer's instancing, picking and the camera's start
  position are written against them. A million-cell board must build
  without per-cell allocation: neighbours are enumerated from fixed index
  offsets, with the edges clipped, rather than stored as lists.
- **3D rule profile.** A rule profile is the engine's per-game choice of
  ruleset; Classic 2D plays the reference profile, the 3D mode plays this
  one. It differs from the reference profile in:
  - **Right-click on a revealed cell** flags every unrevealed neighbour,
    or unflags them all when every one is already flagged.
  - **Chord** acts on a revealed cell whose flagged-neighbour count equals
    its number, revealing every unflagged, unrevealed neighbour; a zero
    cell's flood fill stops at a cell with a flagged neighbour.
  - **Auto-hide (unlinking).** A revealed, unflagged cell whose number is
    satisfied and whose every neighbour is revealed, flagged or hidden
    becomes hidden; a zero cell with no flagged neighbour is hidden at
    once. Hidden cells cannot be picked. Unflagging a cell un-hides its
    neighbours. Hiding is a per-cell state the profile maintains after
    every action; the reference profile never sets it.
  - **Win** when every safe cell is revealed and no safe cell is flagged;
    flags on mines are not required.
- **3D state view.** The read surface the 3D front-end consumes: per cell,
  number, revealed, flagged and hidden; the game's phase, exploded cell,
  mines left and a change counter; and the cells changed since the last
  read. It is the same information [rendering.md](../../context/rendering.md)
  and [app-shell.md](../../context/app-shell.md) read from the 3D engine
  today, served by the shared engine, so the renderer, picking and HUD keep
  their logic.

Deliberate differences from the original game, all following from the m2
rules change:

- **Mines are placed by `board-generation`** around the first click, from
  its seeded source. The original's per-mine draw with a linear probe is
  gone, so a seed no longer reproduces an original game's board.
- **At most every cell but one is a mine** on a custom board, since the
  first click must be safe. The original allowed every cell.
- **No action after the game ends.** A click after a win or a loss changes
  nothing, as on every engine profile; the original let the board be
  clicked and unflagged after it ended. The results screen takes over once
  a 3D game ends, so the player cannot reach the board then anyway.
- **On a loss** every mine is shown and the board is revealed, as in the
  original; wrong flags are reported by the engine's visual-state query
  like any profile's.

## Data and state

- **Graph** — X, Y, Z and the derived cell count; neighbour offsets for
  interior cells and the edge clipping. Immutable per board; shared by the
  engine, the generator, the solver and the renderer.
- **Game state** — the engine's per-cell typed arrays (number, revealed,
  flagged) plus the hidden flag the 3D profile maintains, and the engine's
  per-game fields. Nothing is persisted.
- **Counts** — the engine's 3BV, 3BV solved and clicks by kind, over the
  26-neighbour graph. A right-click on a revealed cell is one flag click,
  however many neighbours it flags.

## Interfaces and contracts

- **Build graph** — from X, Y and Z, each an integer from 1 to 100; anything
  else throws a range error.
- **Create game** — the engine's create, with the box graph and the 3D
  profile: from a mine count, awaiting the first click; or from a full mine
  set, for tests and replays. The mine count must lie between 1 and the
  cell count minus one.
- **Actions** — the engine's reveal, toggle flag and chord, each returning
  the cells changed (including cells hidden or un-hidden) and whether the
  game ended. The 3D front-end's mouse state machine decides which action a
  gesture is, as it does today ([input.md](../../context/input.md)).
- **3D state view** — read-only; the change set is drained by one consumer,
  the renderer.
- **Rule tests** — every rule case the 3D engine's tests cover today is
  ported to the 3D profile, built from fixed mine sets, except the cases
  this document records as deliberate differences, which are rewritten to
  the new rule.
- **Retirement** — once the 3D mode plays on the shared engine, the
  separate 3D engine and its tests are removed; nothing else may depend on
  it.

## Dependencies

- `cell-graph-rules-engine` — the engine, its rule-profile seam, its
  counts and its action stream.
- `board-generation` — places the 3D board's mines; its placer and solver
  already work over any cell graph.
- No external libraries.

Consumed by `3d-play-flow`, which drives the game, and through it by the
existing 3D renderer, picking and HUD.

## Open questions

- Whether the shared engine's typed-array state holds a 100 × 100 × 100
  board, with the 3D profile's hidden flag and the engine's counts, within
  the memory the 3D engine uses today. Measured once the profile exists;
  blocks only the largest custom boards.
