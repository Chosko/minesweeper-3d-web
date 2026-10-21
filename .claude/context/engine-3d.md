# Engine — 3D side: box graph, 3D profile, 3D state view

## OVERVIEW

What the shared rules engine ([engine.md](engine.md)) adds for the 3D mode:
the box graph provider, the 3D rule profile's behaviours (flag batches,
auto-hide) and the 3D state view the 3D front-end reads. The 3D mode plays
the original 3D game's rules on the box graph through the same `rules.js`
as Classic 2D.

| File | Responsibility |
| --- | --- |
| `js/engine/box-grid.js` | box graph provider: the 26-neighbour X × Y × Z box, neighbours computed, not stored |
| `js/engine/state-view-3d.js` | the 3D state view: the read surface of the 3D renderer, picking and HUD |
| `js/engine/profiles.js` | `PROFILE_3D` beside the reference profile ([engine.md](engine.md)) |

## PUBLIC API

- `createBoxGrid(X, Y, Z)` → `{ X, Y, Z, graph, index(i, j, k), coords(c) }`,
  each side 1 .. 100; `index = i + X * (j + Y * k)`; neighbour order (di, dj,
  dk) each over -1 .. 1, di outer, dk inner. It stores no neighbour lists
  (26 fixed offsets, edges clipped), so a million-cell box builds in
  constant memory.
- `PROFILE_3D` (`'minesweeper-3d'`, versions 1 and 2, 2 current). The engine
  branches on its `flagRevealedCell: 'neighbours'`, `zeroFloodStopsAtFlag`,
  `revealOnRevealedZero: 'chord'`, `autoHide` and (version 2)
  `revealedUnflag: 'own-batch'`.
- `createStateView3D(game, box)` → the fields the 3D renderer, picking and
  HUD read under their own names (`X`, `Y`, `Z`, `n`, `idx`, `coords`,
  `number`, `pressed`, `flagged`, `unlinked`, `state`, `phase`,
  `explodedIdx`, `minesLeft`, `version`, `dirty`, `consumeDirty()`); the
  head comment lists each. `apply(result)` — the driver passes every
  action's result through it (`view.apply(game.reveal(c))`); it is how the
  view learns of changes. The renderer is the one `consumeDirty()` consumer.

## INTERNAL PATTERNS

- **Box index layout is pinned.** The 3D renderer's instancing, picking and
  camera are written against `i + X * (j + Y * k)`; changing it or the
  neighbour order breaks them.
- **Flag batches.** A flag click on a revealed number flags its closed,
  unflagged neighbours into its batch, or when all are flagged unflags them
  — every closed neighbour (version 1) or only its own batch's surviving
  flags (`revealedUnflag: 'own-batch'`); every unflag drops a cell from its
  batch, a hand flag belongs to none. The membership is kept by `setFlag`
  ([engine-rules.md](engine-rules.md) § One mutation path).
- **Auto-hide.** A revealed, unflagged cell whose flagged-neighbour count
  equals its number hides when it is a zero or every neighbour is revealed
  or flagged; an unflag shows its hidden neighbours again; a loss shows
  every hidden cell. Only a changed cell or its neighbour can newly qualify
  and a hide changes no other cell's condition, so one pass per action is
  the fixed point; `changed` includes the cells hidden or shown again.
  `flagNb` is kept only for the profiles that read it.
- **Loss presentation.** The state view reads a loss as every cell pressed,
  none flagged or unlinked, every cell dirty; the engine's own arrays (served
  directly while not lost) are left as the loss left them.
- **Large-board memory.** A 100 × 100 × 100 game holds about 37 bytes a
  cell (box graph 0, game 31, state view 6, 2 more after a loss), measured
  by `tests/engine-3d-view.test.mjs`.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-board-graph.md](../domain/features/3d-board-graph.md)
  — box graph, 3D profile, 3D state view, deliberate differences from the
  original game, memory figures.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) § Rules — the
  rules the 3D profile reproduces; its `fidelity` cites them.

## CROSS-REFERENCES

- [engine.md](engine.md) — the graph interface and the rule profiles.
- [engine-rules.md](engine-rules.md) — the game API and the engine-wide
  invariants.
- [mode3d-session.md](mode3d-session.md) — `create3DGame` builds the 3D game (box graph, 3D
  profile, state view); the 3D session drives its actions.
- [rendering.md](rendering.md), [input-camera.md](input-camera.md) — the 3D renderer and
  picking read the state view.
- [testing.md](testing.md) — `tests/engine-box-grid.test.mjs`,
  `tests/engine-3d-profile.test.mjs`, `tests/engine-3d-view.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a field the 3D front-end reads, or changing the state view's loss
  presentation or change set.
- Changing a 3D rule (batches, auto-hide, zero flood at flags): the 3D
  profile in `profiles.js`, then `rules.js`'s head comment.
- Changing the box's index layout or neighbour order.
