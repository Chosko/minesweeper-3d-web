// Square-grid graph provider: the 8-neighbour square board of width x height (no DOM).
//
// Index layout: index = col + width * row. col (0..width-1) varies fastest; row 0 is the top.
//
// Neighbour order (fixed; generation and flood-fill order depend on it) is reading order
// over the 3 x 3 block around the cell, skipping the cell itself and anything off the board:
//   NW (col-1,row-1)  N (col,row-1)  NE (col+1,row-1)
//   W  (col-1,row)                   E  (col+1,row)
//   SW (col-1,row+1)  S (col,row+1)  SE (col+1,row+1)
// so every neighbour list is in ascending index order. A corner has 3 neighbours, an edge
// cell 5, an interior cell 8.

import { createCellGraph } from './graph.js';

export function createSquareGrid(width, height) {
  for (const v of [width, height]) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
  }
  const count = width * height;

  const offsets = new Uint32Array(count + 1);
  for (let row = 0, i = 0; row < height; row++) {
    const dy = (row > 0) + 1 + (row < height - 1);
    for (let col = 0; col < width; col++, i++) {
      const dx = (col > 0) + 1 + (col < width - 1);
      offsets[i + 1] = offsets[i] + dx * dy - 1;
    }
  }
  const targets = new Int32Array(offsets[count]);
  for (let row = 0, i = 0, p = 0; row < height; row++) {
    for (let col = 0; col < width; col++, i++) {
      for (let r = row - 1; r <= row + 1; r++) {
        if (r < 0 || r >= height) continue;
        for (let c = col - 1; c <= col + 1; c++) {
          if (c < 0 || c >= width || (c === col && r === row)) continue;
          targets[p++] = c + width * r;
        }
      }
    }
  }
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
