// Box graph provider: the 26-neighbour box of X x Y x Z cubes, each side 1..100 (no DOM).
//
// Index layout: index = i + X * (j + Y * k). i (0..X-1) varies fastest, then j, then k —
// the layout the 3D renderer's instancing, picking and camera are written against.
//
// Neighbour order (fixed; generation and flood-fill order depend on it) is the 3D game's
// enumeration of the 3 x 3 x 3 block around the cell: (di, dj, dk) each over -1..1, di outer,
// dk inner, skipping the cell itself and anything outside the box. A corner has 7
// neighbours, an edge cell 11, a face cell 17, an interior cell 26.
//
// Neighbours are not stored: they are enumerated from 26 fixed index offsets with the edges
// clipped, so a million-cell box builds in constant memory. The graph serves the same
// members as js/engine/graph.js's stored graph, so the rules engine, the placer and the
// solver take it unchanged.

const MAX_SIDE = 100;

// (di, dj, dk) per slot, in enumeration order.
const DI = new Int8Array(26), DJ = new Int8Array(26), DK = new Int8Array(26);
for (let di = -1, t = 0; di <= 1; di++) {
  for (let dj = -1; dj <= 1; dj++) {
    for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dj && !dk) continue;
      DI[t] = di; DJ[t] = dj; DK[t] = dk; t++;
    }
  }
}

// Number of in-range positions along one axis of size n, over all cells and deltas -1..1.
const axisPairs = (n) => 3 * n - 2;

export function createBoxGrid(X, Y, Z) {
  for (const v of [X, Y, Z]) {
    if (!Number.isInteger(v) || v < 1 || v > MAX_SIDE) {
      throw new RangeError(`box dimensions must be integers from 1 to ${MAX_SIDE}`);
    }
  }
  const XY = X * Y;
  const count = XY * Z;
  const delta = new Int32Array(26);
  for (let t = 0; t < 26; t++) delta[t] = DI[t] + X * DJ[t] + XY * DK[t];

  const check = (c) => {
    if (!Number.isInteger(c) || c < 0 || c >= count) throw new RangeError(`cell index ${c} is out of range`);
  };
  const interior = (i, j, k) => i > 0 && j > 0 && k > 0 && i < X - 1 && j < Y - 1 && k < Z - 1;
  const inBox = (t, i, j, k) => {
    const a = i + DI[t], b = j + DJ[t], d = k + DK[t];
    return a >= 0 && b >= 0 && d >= 0 && a < X && b < Y && d < Z;
  };

  const degreeOf = (c) => {
    const i = c % X, r = (c - i) / X, j = r % Y, k = (r - j) / Y;
    return ((i > 0) + 1 + (i < X - 1)) * ((j > 0) + 1 + (j < Y - 1)) * ((k > 0) + 1 + (k < Z - 1)) - 1;
  };

  const eachNeighbour = (c, fn) => {
    const i = c % X, r = (c - i) / X, j = r % Y, k = (r - j) / Y;
    if (interior(i, j, k)) {
      for (let t = 0; t < 26; t++) fn(c + delta[t]);
      return;
    }
    for (let t = 0; t < 26; t++) if (inBox(t, i, j, k)) fn(c + delta[t]);
  };

  const graph = Object.freeze({
    count,
    edgeCount: axisPairs(X) * axisPairs(Y) * axisPairs(Z) - count,
    maxDegree: Math.min(X, 3) * Math.min(Y, 3) * Math.min(Z, 3) - 1,
    degree(c) { check(c); return degreeOf(c); },
    neighbour(c, s) {
      check(c);
      if (!Number.isInteger(s) || s < 0 || s >= degreeOf(c)) {
        throw new RangeError(`neighbour slot ${s} of cell ${c} is out of range`);
      }
      const i = c % X, r = (c - i) / X, j = r % Y, k = (r - j) / Y;
      if (interior(i, j, k)) return c + delta[s];
      for (let t = 0, n = 0; t < 26; t++) {
        if (inBox(t, i, j, k) && n++ === s) return c + delta[t];
      }
      return -1; // unreachable: s < degree
    },
    neighbours(c) {
      check(c);
      const out = new Int32Array(degreeOf(c));
      let n = 0;
      eachNeighbour(c, (x) => { out[n++] = x; });
      return out;
    },
    forEachNeighbour(c, fn) { check(c); eachNeighbour(c, fn); },
  });

  return Object.freeze({
    X,
    Y,
    Z,
    graph,
    index(i, j, k) {
      if (!Number.isInteger(i) || !Number.isInteger(j) || !Number.isInteger(k) ||
          i < 0 || i >= X || j < 0 || j >= Y || k < 0 || k >= Z) {
        throw new RangeError(`cell (${i}, ${j}, ${k}) is outside the box`);
      }
      return i + X * (j + Y * k);
    },
    coords(c) {
      check(c);
      const i = c % X, r = (c - i) / X, j = r % Y;
      return [i, j, (r - j) / Y];
    },
  });
}
