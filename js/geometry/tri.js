// The triangle geometry: a board of H rows of W alternating triangles, as the flat grid geometry
// contract (js/geometry/index.js) describes it. The tile is measured by its side; the triangle is
// √3 / 2 of it high. Cell c sits at column c % width, row floor(c / width) — numbered row by row, as
// on the square grid — and points up when column + row is even, the triangle graph provider's
// orientation (js/engine/tri-grid.js). Rows sit one triangle height plus the gap apart, base facing
// base; along a row the tiles sit half a side apart plus the run that puts the gap between the
// slanted sides facing each other, so every pair of facing sides is one gap apart. The centre is the
// centroid, and the glyph box the square around the circle inside the tile. A cell's slot is every
// board point nearer its triangle than any other tile's, so a press in a gap goes to the nearest tile
// (a tie to the lower index). The floor is 44 px a side, where the circle inside the tile is about
// as large as the square floor's tile; the tile at each board scale is the whole side whose circle
// matches the square's tile there (the board view's tileCap). The cursor moves left and right along
// the row, and up and down to the same column in the row above or below. DOM-free.

import { tileCap } from '../classic2d/board-view.js';

const SQRT3 = Math.sqrt(3);
const MIN_SIDE = 44;
const STEPS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });

export function createTriGeometry(width, height) {
  for (const v of [width, height]) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
  }
  const count = width * height;
  const isCell = (c) => Number.isInteger(c) && c >= 0 && c < count;
  const isUp = (col, row) => (col + row) % 2 === 0;
  const clamp = (v, max) => Math.max(0, Math.min(max, v));

  // The steps between tiles and the triangle's height for a tile size and gap.
  function metrics(tile, gap) {
    const tall = (tile * SQRT3) / 2;
    return { tile, tall, row: tall + gap, col: tile / 2 + (2 * gap) / SQRT3 };
  }

  // The corners of the tile at (col, row), clockwise on the page from its tip or its top-left.
  function cornersAt(col, row, m) {
    const x = col * m.col;
    const y = row * m.row;
    return isUp(col, row)
      ? [[x + m.tile / 2, y], [x + m.tile, y + m.tall], [x, y + m.tall]]
      : [[x, y], [x + m.tile, y], [x + m.tile / 2, y + m.tall]];
  }

  function centreAt(col, row, m) {
    return { x: col * m.col + m.tile / 2, y: row * m.row + (isUp(col, row) ? (2 * m.tall) / 3 : m.tall / 3) };
  }

  function extent(tile, gap = 0) {
    const m = metrics(tile, gap);
    return { width: (width - 1) * m.col + tile, height: height * m.row - gap };
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
    const row = (c - col) / width;
    return Object.freeze({
      shape: 'triangle',
      orientation: isUp(col, row) ? 'up' : 'down',
      x: col * m.col,
      y: row * m.row,
      width: tile,
      height: m.tall,
      points: Object.freeze(cornersAt(col, row, m).map(Object.freeze)),
    });
  }

  // The squared distance from a board point to a triangle, none inside it.
  function distance2(points, x, y) {
    let inside = true;
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % 3];
      const dx = x1 - x0;
      const dy = y1 - y0;
      if (dx * (y - y0) - dy * (x - x0) < 0) inside = false;
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy), 1);
      best = Math.min(best, (x0 + t * dx - x) ** 2 + (y0 + t * dy - y) ** 2);
    }
    return inside ? 0 : best;
  }

  return Object.freeze({
    kind: 'tri',
    width,
    height,
    count,
    minTile: MIN_SIDE,
    tileCap: (scale) => Math.round(tileCap(scale) * SQRT3),
    extent,
    outline,
    centre,
    glyphBox(c, tile, gap = 0) {
      const p = centre(c, tile, gap);
      const side = tile / SQRT3;
      return p && { x: p.x - side / 2, y: p.y - side / 2, width: side, height: side };
    },
    cellAt(x, y, tile, gap = 0) {
      const e = extent(tile, gap);
      if (!(x >= 0 && y >= 0 && x < e.width && y < e.height)) return -1;
      const m = metrics(tile, gap);
      // The nearest tile lies in the point's row band or the one after its gap, within two columns
      // of the column whose centre is nearest across.
      const r = clamp(Math.floor(y / m.row), height - 1);
      const near = clamp(Math.round((x - tile / 2) / m.col), width - 1);
      let best = -1;
      let bestD = Infinity;
      for (let row = Math.max(0, r - 1); row <= Math.min(height - 1, r + 1); row++) {
        for (let col = Math.max(0, near - 2); col <= Math.min(width - 1, near + 2); col++) {
          const d = distance2(cornersAt(col, row, m), x, y);
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
