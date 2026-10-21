// Hexagon graph provider: the hexagonal board of width x height (no DOM).
//
// A board of W x H is W columns of H flat-top hexagons; every odd column sits half a tile lower.
// A tile's neighbours are the tiles that share a side: 6 in the interior, fewer at the edge.
//
// Index layout, as on the square grid: index = col + width * row. col (0..width-1) varies
// fastest; row 0 is the top.
//
// Neighbour order (fixed; generation and flood-fill order depend on it) is ascending index:
//   even column — (col-1,row-1) (col,row-1) (col+1,row-1) (col-1,row) (col+1,row) (col,row+1)
//   odd column  — (col,row-1) (col-1,row) (col+1,row) (col-1,row+1) (col,row+1) (col+1,row+1)
// skipping anything off the board: an even column's side neighbours are on its row and the row
// above, an odd column's on its row and the row below.

import { createCellGraph } from './graph.js';

export function createHexGrid(width, height) {
  for (const v of [width, height]) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
  }
  const count = width * height;

  const lists = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const side = col & 1 ? row : row - 1; // the upper row of the side neighbours
      const cells = col & 1
        ? [[col, row - 1], [col - 1, side], [col + 1, side], [col - 1, side + 1], [col, row + 1], [col + 1, side + 1]]
        : [[col - 1, side], [col, row - 1], [col + 1, side], [col - 1, side + 1], [col + 1, side + 1], [col, row + 1]];
      const list = [];
      for (const [c, r] of cells) {
        if (c >= 0 && c < width && r >= 0 && r < height) list.push(c + width * r);
      }
      lists.push(list);
    }
  }
  const offsets = new Uint32Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + lists[i].length;
  const targets = new Int32Array(offsets[count]);
  for (let i = 0, p = 0; i < count; i++) for (const j of lists[i]) targets[p++] = j;
  const graph = createCellGraph(count, offsets, targets);

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
      if (!Number.isInteger(index) || index < 0 || index >= count) throw new RangeError(`cell index ${index} is out of range`);
      return [index % width, (index - (index % width)) / width];
    },
  });
}
