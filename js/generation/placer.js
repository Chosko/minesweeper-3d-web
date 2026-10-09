// Standard mine placer: a uniformly random mine set over any cell graph (no DOM).
//
// Honours the reference ruleset's first-click guarantee (tests/fidelity/minesweeper-online.md,
// "First-click guarantee"): the first-click cell alone is excluded, its neighbours may hold
// mines, so the first click is safe but not always an opening.
//
// Draw order: the candidate pool is every cell but the first click, in ascending index order;
// a partial Fisher–Yates shuffle swaps pool[i] with pool[i + source.int(pool.length - i)] for
// i = 0 .. mineCount - 1, and the first mineCount entries, sorted ascending, are the mine set.
//
// GENERATOR_VERSION is recorded with every board. Same request + same version → same board.
// Changing the seeded source (js/generation/random.js) or this draw order changes boards and
// requires bumping GENERATOR_VERSION.

export const GENERATOR_VERSION = 1;

// placeMines({ graph, mineCount, firstClick, source }) → Int32Array of mine cells, ascending.
// Throws RangeError on a malformed request, and on an impossible one (more mines than every
// cell but the first-click cell) with the reason.
export function placeMines({ graph, mineCount, firstClick, source } = {}) {
  if (!graph || !Number.isInteger(graph.count)) throw new RangeError('a cell graph is required');
  if (!source || typeof source.int !== 'function') throw new RangeError('a seeded source is required');
  const n = graph.count;
  if (!Number.isInteger(firstClick) || firstClick < 0 || firstClick >= n) {
    throw new RangeError(`first-click cell ${firstClick} is out of range`);
  }
  if (!Number.isInteger(mineCount) || mineCount < 0) throw new RangeError('mine count must be an integer >= 0');
  if (mineCount > n - 1) {
    throw new RangeError(
      `${mineCount} mines do not fit: the first click must be safe, so at most ${n - 1} of ${n} cells can hold a mine`,
    );
  }

  const m = n - 1;
  const pool = new Int32Array(m);
  for (let c = 0, p = 0; c < n; c++) if (c !== firstClick) pool[p++] = c;
  for (let i = 0; i < mineCount; i++) {
    const j = i + source.int(m - i);
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  return pool.slice(0, mineCount).sort();
}
