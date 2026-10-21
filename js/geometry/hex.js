// The hexagon geometry: a board of W columns of H flat-top hexagons, every odd column half a row step
// lower, as the flat grid geometry contract (js/geometry/index.js) describes it. The tile is measured
// across the flats; its sides are tile / √3 and it is twice that corner to corner. Neighbours sit one
// row step (the tile plus the gap) apart in all six directions, so the column step is √3 / 2 of it
// and the gap between any two sides that face each other is the gap. Cell c sits at column c % width,
// row floor(c / width) — numbered row by row, as on the square grid. A cell's slot is every board
// point nearer its centre than any other tile's, so a press in a gap goes to the nearest tile (a tie
// to the lower index). The glyph box is the tile across the flats, so the floor and the tile at each
// board scale are the square's: the tile skin's MIN_TILE_SIZE and the board view's tileCap. The
// cursor moves up and down within the column, and left and right to the adjacent column at the same
// row index, zig-zagging along a row. DOM-free.

import { MIN_TILE_SIZE } from '../classic2d/tile-skin.js';
import { tileCap } from '../classic2d/board-view.js';

const SQRT3 = Math.sqrt(3);
const STEPS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });

export function createHexGeometry(width, height) {
  for (const v of [width, height]) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
  }
  const count = width * height;
  const isCell = (c) => Number.isInteger(c) && c >= 0 && c < count;
  const clamp = (v, max) => Math.max(0, Math.min(max, v));

  // The steps between centres and a tile's half sizes for a tile size and gap.
  function metrics(tile, gap) {
    const row = tile + gap;
    return { row, col: (row * SQRT3) / 2, side: tile / SQRT3, half: tile / 2 };
  }

  function centreAt(col, row, m) {
    return { x: m.side + col * m.col, y: m.half + row * m.row + (col % 2 ? m.row / 2 : 0) };
  }

  function extent(tile, gap = 0) {
    const m = metrics(tile, gap);
    return {
      width: 2 * m.side + (width - 1) * m.col,
      height: height * m.row - gap + (width > 1 ? m.row / 2 : 0),
    };
  }

  function centre(c, tile, gap = 0) {
    if (!isCell(c)) return null;
    const col = c % width;
    return centreAt(col, (c - col) / width, metrics(tile, gap));
  }

  function outline(c, tile, gap = 0) {
    if (!isCell(c)) return null;
    const m = metrics(tile, gap);
    const col = c % width;
    const { x, y } = centreAt(col, (c - col) / width, m);
    const s = m.side;
    const h = m.half;
    return Object.freeze({
      shape: 'hexagon',
      orientation: 'none',
      x: x - s,
      y: y - h,
      width: 2 * s,
      height: tile,
      points: Object.freeze([
        [x - s, y], [x - s / 2, y - h], [x + s / 2, y - h], [x + s, y], [x + s / 2, y + h], [x - s / 2, y + h],
      ].map(Object.freeze)),
    });
  }

  return Object.freeze({
    kind: 'hex',
    width,
    height,
    count,
    minTile: MIN_TILE_SIZE,
    tileCap: (scale) => tileCap(scale),
    extent,
    outline,
    centre,
    glyphBox(c, tile, gap = 0) {
      const p = centre(c, tile, gap);
      return p && { x: p.x - tile / 2, y: p.y - tile / 2, width: tile, height: tile };
    },
    cellAt(x, y, tile, gap = 0) {
      const e = extent(tile, gap);
      if (!(x >= 0 && y >= 0 && x < e.width && y < e.height)) return -1;
      const m = metrics(tile, gap);
      // The nearest centre lies within a column of the nearest column line, and within a row of the
      // nearest row in each of those columns.
      const near = clamp(Math.round((x - m.side) / m.col), width - 1);
      let best = -1;
      let bestD = Infinity;
      for (let col = Math.max(0, near - 1); col <= Math.min(width - 1, near + 1); col++) {
        const lowered = col % 2 ? m.row / 2 : 0;
        const r = clamp(Math.round((y - m.half - lowered) / m.row), height - 1);
        for (let row = Math.max(0, r - 1); row <= Math.min(height - 1, r + 1); row++) {
          const p = centreAt(col, row, m);
          const d = (p.x - x) ** 2 + (p.y - y) ** 2;
          const c = col + width * row;
          if (d < bestD || (d === bestD && c < best)) {
            best = c;
            bestD = d;
          }
        }
      }
      return best;
    },
    neighbour(c, direction) {
      const step = Object.hasOwn(STEPS, direction) ? STEPS[direction] : null;
      if (!step) throw new RangeError(`unknown direction: ${direction}`);
      if (!isCell(c)) return -1;
      const col = (c % width) + step[0];
      const row = Math.floor(c / width) + step[1];
      return col >= 0 && col < width && row >= 0 && row < height ? col + width * row : -1;
    },
  });
}
