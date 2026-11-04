// Triangle graph provider: the triangle board of width x height (no DOM).
//
// A board of W x H is H rows of W triangles. The tile at (col, row) points up when col + row is
// even: the top-left tile points up, tiles alternate along a row and each row starts opposite to
// the one above. A tile's neighbours are the tiles that share a side or a corner: 12 in the
// interior — 3 on the side of its tip, 2 on each side in its own row and 5 on the side of its
// base — fewer at the edge.
//
// Index layout, as on the square grid: index = col + width * row. col (0..width-1) varies
// fastest; row 0 is the top.
//
// Neighbour order (fixed; generation and flood-fill order depend on it) is ascending index,
// reading order over the three rows, skipping anything off the board:
//   up tile   — (col-1..col+1, row-1)  (col-2, col-1, col+1, col+2, row)  (col-2..col+2, row+1)
//   down tile — (col-2..col+2, row-1)  (col-2, col-1, col+1, col+2, row)  (col-1..col+1, row+1)

import { createCellGraph } from './graph.js';

export function createTriGrid(width, height) {
  for (const v of [width, height]) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
  }
  const count = width * height;

  const lists = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const up = (col + row) % 2 === 0;
      const above = up ? 1 : 2; // half-reach of the row above: the tip's side or the base's
      const below = up ? 2 : 1;
      const list = [];
      const add = (c, r) => { if (c >= 0 && c < width && r >= 0 && r < height) list.push(c + width * r); };
      for (let c = col - above; c <= col + above; c++) add(c, row - 1);
      for (let c = col - 2; c <= col + 2; c++) if (c !== col) add(c, row);
      for (let c = col - below; c <= col + below; c++) add(c, row + 1);
      lists.push(list);
    }
  }
  const offsets = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + lists[i].length;
  const targets = new Int32Array(offsets[count]);
  for (let i = 0, p = 0; i < count; i++) for (const j of lists[i]) targets[p++] = j;
  const graph = createCellGraph(count, offsets, targets);

  const checkIndex = (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError(`cell index ${index} is out of range`);
  };

  return Object.freeze({
    width,
    height,
    graph,
    index(col, row) {
      if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= width || row < 0 || row >= height) {
        throw new RangeError(`cell (${col}, ${row}) is off the board`);
      }
      return col + width * row;
    },
    colRow(index) {
      checkIndex(index);
      return [index % width, (index - (index % width)) / width];
    },
    // orientation(index) → 'up' or 'down', the way the cell's tip points.
    orientation(index) {
      checkIndex(index);
      const col = index % width;
      return (col + (index - col) / width) % 2 === 0 ? 'up' : 'down';
    },
  });
}
