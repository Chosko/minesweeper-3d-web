// Immutable cell graph: the topology every board is described by (no DOM, no three.js).
//
// A graph is a cell count and, per cell, an ordered neighbour list over the dense integer
// index 0..count-1. What an index means in space belongs to the provider that built it
// (js/engine/square-grid.js for the 8-neighbour square grid). Neighbour order is the
// provider's documented order and is preserved exactly: generation and flood fill follow it.
//
// Storage is flat (compressed rows): `offsets` (Uint32Array, count+1 entries) and `targets`
// (Int32Array); cell i's neighbours are targets[offsets[i] .. offsets[i+1]-1]. Both arrays
// are private copies, so the graph can be shared read-only by the engine, the generator and
// the renderer without anyone mutating it. Hot loops use degree(i) / neighbour(i, k) or
// forEachNeighbour; neighbours(i) allocates a copy and is for callers, not hot loops.
//
// The cell-graph interface is the frozen object's members — count, edgeCount, maxDegree,
// degree, neighbour, neighbours, forEachNeighbour — not this storage: a provider may serve
// them computed instead (js/engine/box-grid.js enumerates its neighbours from fixed offsets).

function checkCount(count) {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('cell count must be an integer >= 0');
}

export function createCellGraph(count, offsets, targets) {
  checkCount(count);
  if (!offsets || offsets.length !== count + 1) throw new RangeError('offsets must have count + 1 entries');
  const off = Uint32Array.from(offsets);
  const tgt = Int32Array.from(targets);
  if (off[0] !== 0 || off[count] !== tgt.length) throw new RangeError('offsets must span targets from 0');
  let maxDegree = 0;
  const seen = new Int32Array(count).fill(-1);
  for (let i = 0; i < count; i++) {
    const a = off[i], b = off[i + 1];
    if (b < a) throw new RangeError('offsets must be non-decreasing');
    if (b - a > maxDegree) maxDegree = b - a;
    for (let p = a; p < b; p++) {
      const j = tgt[p];
      if (j < 0 || j >= count) throw new RangeError(`neighbour ${j} of cell ${i} is out of range`);
      if (j === i) throw new RangeError(`cell ${i} lists itself as a neighbour`);
      if (seen[j] === i) throw new RangeError(`cell ${i} lists neighbour ${j} twice`);
      seen[j] = i;
    }
  }

  const check = (i) => {
    if (!Number.isInteger(i) || i < 0 || i >= count) throw new RangeError(`cell index ${i} is out of range`);
  };

  return Object.freeze({
    count,
    edgeCount: tgt.length,
    maxDegree,
    degree(i) { check(i); return off[i + 1] - off[i]; },
    neighbour(i, k) {
      check(i);
      if (!Number.isInteger(k) || k < 0 || k >= off[i + 1] - off[i]) {
        throw new RangeError(`neighbour slot ${k} of cell ${i} is out of range`);
      }
      return tgt[off[i] + k];
    },
    neighbours(i) { check(i); return tgt.slice(off[i], off[i + 1]); },
    forEachNeighbour(i, fn) {
      check(i);
      for (let p = off[i], b = off[i + 1]; p < b; p++) fn(tgt[p]);
    },
  });
}

export function cellGraphFromLists(count, lists) {
  checkCount(count);
  if (!lists || lists.length !== count) throw new RangeError('expected one neighbour list per cell');
  const offsets = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + lists[i].length;
  const targets = new Int32Array(offsets[count]);
  for (let i = 0; i < count; i++) targets.set(lists[i], offsets[i]);
  return createCellGraph(count, offsets, targets);
}
