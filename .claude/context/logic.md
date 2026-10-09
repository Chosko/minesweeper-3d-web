# Logic — 3D rules engine

## OVERVIEW

This file covers the 3D game's engine only; Classic 2D plays through the
cell-graph rules engine in `js/engine/` ([engine.md](engine.md)). The two
share no code.

The pure gameplay rules of Minesweeper 3D: mine placement, number computation,
reveal and flood fill, flags, chord, unlinking (auto-hide), win and loss. No DOM,
no three.js, no timer; it runs unchanged under `node --test`.

- `js/logic.js` — the whole area: class `Game` and factory
  `createGameFromMinePositions`. It mirrors the original `Cell.cs` / `Grid.cs` /
  `Minesweeper.cs`; the file's header comment lists its deliberate deviations.

## PUBLIC API

Construction
- `js/logic.js::Game` constructor `(X, Y, Z, mines, rng = Math.random, minePositions = null)`.
  Throws `RangeError` on non-integer or < 1 dimensions, mines outside `0..X*Y*Z`,
  out-of-range or duplicate mine index. When `minePositions` is given, `mines` is
  replaced by its length and `rng` is unused. Places mines, computes numbers,
  runs an initial settle, then resets `version` to 0 and clears the dirty set.
- `js/logic.js::createGameFromMinePositions(X, Y, Z, mineIdxList)` — deterministic
  board from a list (or typed array) of linear indices. Used by `js/main.js` when
  settings carry `minePositions` (debug/test hook) and by `tests/logic.test.mjs`.

Actions (each settles, and bumps `version` only if something changed)
- `Game.leftClick(idx)` → `{ exploded, revealed }`. Flagged cell: no-op. Mine:
  explode. Zero: flood fill via chord. Does not start any timer (caller's job).
- `Game.chord(idx)` → `{ exploded, revealed }`. Only acts when the cell is pressed
  and its flagged-neighbour count equals its number.
- `Game.rightClick(idx)` → `{ flagged, unflagged }`. Unrevealed: toggle flag.
  Revealed: flag all unrevealed neighbours, or unflag them all if every one is
  already flagged.
- `Game.settle()` → boolean changed. Public re-run of unlink propagation + win
  check; actions already call it, so callers rarely need it.

Geometry
- `Game.idx(i, j, k)`, `Game.coords(idx)` → `[i, j, k]`.
- `Game.neighbors(idx)` → `Int32Array` of up to 26 indices (allocates; for callers,
  not hot loops).

State (read-only to other areas; typed arrays indexed by linear idx)
- `number` (`Int8Array`, -1 = mine, else 0..26), `pressed`, `flagged`, `unlinked`
  (`Uint8Array`, 0/1).
- `state` (`'playing' | 'won' | 'lost'`), `explodedIdx` (-1 until a loss),
  `flagCount`, `unpressedCount`, `mines`, `X`, `Y`, `Z`, `n`.
- `minesLeft` getter = `mines - flagCount` (may be negative).
- `version` — monotonically increasing change counter; `js/render.js` compares it
  to its last seen value to skip work, and `js/main.js` folds it into its
  redraw signature.
- `dirty` getter → copy of indices changed (pressed/flagged/unlinked) since the
  last `consumeDirty()`; `consumeDirty()` returns that copy and clears the set.
  `js/render.js` is the single consumer.

## INTERNAL PATTERNS

- Linear index layout `idx = i + X*(j + Y*k)`: `i` varies fastest, so the
  original's linear probe (i++ → j++ → k++ with wrap) is exactly `idx+1 mod n`.
  Changing the layout breaks seeded-placement fidelity.
- Mine placement draws `rng()` for x, then y, then z per mine (original order) and
  resolves collisions with a path-compressed "next free" table. Changing the
  draw order changes every seeded board.
- Neighbour enumeration (`_fillNb`) follows the original `adjacent[]` loop order
  (di outer, dk inner); interior cells take a fast path using precomputed index
  deltas in `_od`. Uses shared scratch buffers `_nbBuf` / `_nbBuf2` — never call
  something that refills a buffer while iterating it (`_flag`/`_unflag` use
  `_nbBuf2`, `_chordCore`/`_settle` use `_nbBuf`, `_tryUnlink` uses `_nbBuf2`).
- Flood fill is iterative over a preallocated `_stack` (size n); each cell is
  pressed once, so pushed at most once. No recursion anywhere.
- `_flagNb[c]` caches the flagged-neighbour count so checkMines is O(1); every
  flag/unflag/explode path must keep it in sync.
- `_flaggedNonMine` is the live counter behind the win condition.
- All mutations go through `_press` / `_flag` / `_unflag` / `_explode`, which
  record dirty cells (`_markDirty`, bumps `_mods`) and pending cells (`_pend`).
  A new mutation path that skips them breaks rendering updates and unlinking.
- Settle runs after every action: unlink propagation over pending cells and their
  neighbours in one pass (provably the fixed point, since `unlinked` is only set
  on pressed cells), then the win check. Unlinking runs only while `playing`;
  unflag still relinks neighbours after the game ended.
- Actions remain legal after the game ended (original behaviour). Clicking an
  unflagged mine after a win reveals the board but `state` stays `'won'`; after a
  loss every cell is pressed, so further clicks are no-ops.
- `_explode` presses, unflags and relinks every cell, zeroes `flagCount`,
  `unpressedCount` and `_flagNb`.
- `version` changes only when `_mods` changed during the call; read-only or
  no-op actions leave it untouched.
- No first-click safety: mines are fixed at construction (spec rule).

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule: every behaviour
here must match it exactly.

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md) — "Mines & numbers"
  (placement with linear probe, no first-click safety, 26-neighbourhood),
  "Cell state", and "Rules" (leftClick, chord/checkMines, rightClick incl.
  relink-on-unflag, unlinking conditions, win and lose). Timer and HUD rules in
  the same section are enforced by the app shell, not here.
- [../domain/INDEX.md](../domain/INDEX.md) — product domain index (no rules file
  specific to this area).

## CROSS-REFERENCES

- [rendering.md](rendering.md) — reads `number`/`pressed`/`flagged`/`unlinked`/
  `state`/`explodedIdx`, polls `version` and drains `consumeDirty()`.
- [input.md](input.md) — picking reads `unlinked` and `pressed` to exclude
  cells; the mouse state machine decides which action to call.
- [app-shell.md](app-shell.md) — constructs `Game`, dispatches
  `leftClick`/`rightClick`/`chord`, owns the timer and end-of-game flow from
  `state` and `minesLeft`.
- [audio.md](audio.md) — sound choice driven by the action result objects
  (`exploded`, `revealed`, `flagged`, `unflagged`), via the app shell.
- [testing.md](testing.md) — `tests/logic.test.mjs` exercises this area through
  `createGameFromMinePositions` and seeded `rng`.

## WHEN TO READ THE SOURCE

- Changing any rule (reveal, chord, flag toggling, unlinking, win/loss) or
  fixing a fidelity bug against ORIGINAL_SPEC.md.
- Adding a new action or mutation path (must hook into dirty/pending tracking,
  `_flagNb`, `_flaggedNonMine` and `version`).
- Reproducing a specific seeded board or changing mine placement / rng order.
- Changing the index layout or neighbour order, or optimising `_fillNb`.
- Adding state that rendering must see incrementally (dirty-set semantics).
- Debugging post-game behaviour (actions after win/loss, explode reveal).
