// The marked start cell of a board: one cell per graph description, a pure function of it (no DOM).
//
// startCell(description) → the cell index of the centre cell of each side.
//   { kind: 'square', width, height } — column floor(width / 2), row floor(height / 2).
//   { kind: 'hex', width, height }    — the same column and row, on the hexagon grid.
//   { kind: 'tri', width, height }    — the same column and row, on the triangle grid.
//   { kind: 'box', X, Y, Z }          — the cell floor(X / 2), floor(Y / 2), floor(Z / 2).
// Each is converted to a cell index by the graph provider's own coordinate order
// (js/engine/square-grid.js, js/engine/hex-grid.js, js/engine/tri-grid.js, js/engine/box-grid.js).
// Throws RangeError on any other description.
//
// The start cell is a request input like any first click: a board pre-generated for it is made by
// the same placer, solver and no-guess loop, so it changes no board and no GENERATOR_VERSION.

import { createSquareGrid } from '../engine/square-grid.js';
import { createBoxGrid } from '../engine/box-grid.js';
import { createHexGrid } from '../engine/hex-grid.js';
import { createTriGrid } from '../engine/tri-grid.js';

export function startCell(description) {
  if (!description || typeof description !== 'object') throw new RangeError('a graph description is required');
  if (description.kind === 'square') {
    const { width, height } = description;
    return createSquareGrid(width, height).index(Math.floor(width / 2), Math.floor(height / 2));
  }
  if (description.kind === 'hex') {
    const { width, height } = description;
    return createHexGrid(width, height).index(Math.floor(width / 2), Math.floor(height / 2));
  }
  if (description.kind === 'tri') {
    const { width, height } = description;
    return createTriGrid(width, height).index(Math.floor(width / 2), Math.floor(height / 2));
  }
  if (description.kind === 'box') {
    const { X, Y, Z } = description;
    return createBoxGrid(X, Y, Z).index(Math.floor(X / 2), Math.floor(Y / 2), Math.floor(Z / 2));
  }
  throw new RangeError(`unknown graph kind ${JSON.stringify(description.kind)}`);
}
