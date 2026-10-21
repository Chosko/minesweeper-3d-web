# Engine — cell-graph rules engine

## OVERVIEW

The one rules engine every mode plays through: a board is an immutable graph of
cells and neighbours, and reveal, flood fill, flag, chord, win, loss, 3BV and
click counts are implemented once over that graph. Classic 2D plays the
reference profile (Minesweeper Online, default options) on the square grid,
and the hexagon grid is a provider the same profile plays on unchanged;
the 3D mode plays the 3D profile (the original 3D game's rules) on the box
graph, read through the 3D state view ([engine-3d.md](engine-3d.md)).
DOM-free, no three.js, no timer; it never places mines itself. Each module's
head comment states its full contract; this file is the map and covers the
graph, the grid providers and the rule profiles. The game and its metrics are
[engine-rules.md](engine-rules.md).

| File | Responsibility |
| --- | --- |
| `js/engine/graph.js` | the immutable cell graph (flat compressed rows) and the cell-graph interface every provider serves |
| `js/engine/square-grid.js` | square-grid provider: index layout and neighbour order of the 8-neighbour board |
| `js/engine/hex-grid.js` | hexagon-grid provider: index layout and neighbour order of the 6-neighbour board |
| `js/engine/box-grid.js` | box graph provider ([engine-3d.md](engine-3d.md)) |
| `js/engine/profiles.js` | rule-profile table keyed by profile and rules version, each marker's fidelity citation |
| `js/engine/rules.js` | the game ([engine-rules.md](engine-rules.md)) |
| `js/engine/metrics.js` | 3BV and click counts ([engine-rules.md](engine-rules.md)) |
| `js/engine/state-view-3d.js` | the 3D state view ([engine-3d.md](engine-3d.md)) |

## PUBLIC API

Cell graph, square and hexagon grids
- `createCellGraph(count, offsets, targets)` (compressed rows: cell i's
  neighbours are `targets[offsets[i] .. offsets[i+1]-1]`, in the provider's
  order; validated, copied, frozen), `cellGraphFromLists(count, lists)`.
- The cell-graph interface: `count`, `edgeCount`, `maxDegree`, `degree(i)`,
  `neighbour(i, k)`, `forEachNeighbour(i, fn)` (hot loops), `neighbours(i)`
  (allocates). A provider may serve it computed instead of stored; the rules
  engine, the placer and the solver take either.
- `createSquareGrid(width, height)` → `{ width, height, graph, index(col,
  row), colRow(index) }`; `index = col + width * row`; neighbour order is
  reading order over the 3 × 3 block (NW N NE W E SW S SE), so every list is
  ascending.
- `createHexGrid(width, height)` → the same shape and index; W columns of H
  flat-top hexagons, odd columns half a tile lower, a tile's neighbours the
  tiles sharing a side (the row above at the sides in an even column, the
  row below in an odd one), every list ascending.

Rule profiles (`profiles.js`)
- `REFERENCE_PROFILE` (`'minesweeper-online'`, version 1), `PROFILE_3D`
  ([engine-3d.md](engine-3d.md)), `PROFILES`, `getRuleProfile(id, version?)`
  (current when omitted; `RangeError` on an unknown profile or version),
  `CUSTOM_LIMITS` (the reference profile's `customLimits`, which Classic 2D
  board setup interpolates).
- Who reads which marker: the engine branches on `flagRevealedCell` and the
  3D markers and applies `clickCounting`; the Classic 2D pointer input reads
  `chordInputs`, `revealInputs`, `flagToggle`, `pressFeedback` and
  `releaseOffCell` ([classic2d-input.md](classic2d-input.md)); the rest record reference
  behaviour that tests pin and board generation and board setup honour.
- `fidelity` maps every marker to its heading in
  `tests/fidelity/minesweeper-online.md` (reference profile) or to the rule
  or deliberate difference it follows (3D profile).

## INTERNAL PATTERNS

- **Neighbour order is the provider's** and is preserved exactly; flood fill
  and generation follow it. Changing a provider's order (`square-grid.js`,
  `hex-grid.js`) changes flood-fill order and every seeded board on it.
- **Index layout is shared.** A flat grid's geometry places cell c at column
  `c % width`, row `floor(c / width)`, the providers' layout
  ([geometry.md](geometry.md)).
- **Every branch is a marker.** A behaviour the engine branches on is a
  profile marker with a `fidelity` citation. A rule fixed against the
  fidelity file ships as a new rules version; earlier versions stay
  playable and their tests keep passing.

## DOMAIN DEPENDENCIES

Fidelity to the reference (Minesweeper Online, default options) is the
overriding rule, checked against a recorded observation, not asserted.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — graph model, square grid, profiles and versions.
- [../domain/features/hexagon-grid.md](../domain/features/hexagon-grid.md)
  — the hexagon grid provider.
- `tests/fidelity/minesweeper-online.md` — the observed reference behaviour
  every reference marker cites.
- The 3D profile's sources: [engine-3d.md](engine-3d.md) § Domain dependencies.

## CROSS-REFERENCES

- [engine-rules.md](engine-rules.md) — the game over the graph: actions,
  phases, first-click hand-off, 3BV, click counts, summary, snapshot.
- [engine-3d.md](engine-3d.md) — box graph, 3D profile, flag batches,
  auto-hide, the 3D state view.
- [geometry.md](geometry.md) — the flat grid geometry that places the square
  and hexagon providers' cells on the page in their index layout.
- [generation.md](generation.md) — placer, solver, generate loop, worker and
  client, which run over the cell graph.
- [testing.md](testing.md) — `tests/engine-*.test.mjs` and the fidelity
  observation file.

## WHEN TO READ THE SOURCE

- Changing a rule, adding a profile marker or a rules version, or fixing a
  fidelity failure (`profiles.js`, then `rules.js`).
- Adding a graph provider or changing a grid provider's index layout or
  neighbour order.
