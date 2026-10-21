// The square geometry: Classic 2D's grid of square tiles one pitch apart (the tile plus the gap
// after it), as the flat grid geometry contract (js/geometry/index.js) describes it. Cell c sits at
// column c % width, row floor(c / width) — the square grid's index layout (js/engine/square-grid.js).
// A cell's slot is its tile and the gap after it, so a point in a gap goes to the tile before it;
// the cursor steps one column or row and has no neighbour past the board's edge. Its floor is the
// tile skin's MIN_TILE_SIZE and its tile at each board scale the board view's tileCap. DOM-free.

import { MIN_TILE_SIZE } from '../classic2d/tile-skin.js';
import { tileCap } from '../classic2d/board-view.js';

const STEPS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });

export function createSquareGeometry(width, height) {
  for (const v of [width, height]) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
  }
  const count = width * height;
  const isCell = (c) => Number.isInteger(c) && c >= 0 && c < count;
  const span = (n, tile, gap) => n * tile + (n - 1) * gap;

  function outline(c, tile, gap) {
    if (!isCell(c)) return null;
    const col = c % width;
    const x = col * (tile + gap);
    const y = ((c - col) / width) * (tile + gap);
    return Object.freeze({
      shape: 'square',
      orientation: 'none',
      x,
      y,
      width: tile,
      height: tile,
      points: Object.freeze([[x, y], [x + tile, y], [x + tile, y + tile], [x, y + tile]].map(Object.freeze)),
    });
  }

  return Object.freeze({
    kind: 'square',
    width,
    height,
    count,
    minTile: MIN_TILE_SIZE,
    tileCap: (scale) => tileCap(scale),
    extent: (tile, gap = 0) => ({ width: span(width, tile, gap), height: span(height, tile, gap) }),
    outline,
    centre(c, tile, gap = 0) {
      const o = outline(c, tile, gap);
      return o && { x: o.x + tile / 2, y: o.y + tile / 2 };
    },
    glyphBox(c, tile, gap = 0) {
      const o = outline(c, tile, gap);
      return o && { x: o.x, y: o.y, width: tile, height: tile };
    },
    cellAt(x, y, tile, gap = 0) {
      if (!(x >= 0 && y >= 0 && x < span(width, tile, gap) && y < span(height, tile, gap))) return -1;
      const pitch = tile + gap;
      return Math.min(width - 1, Math.floor(x / pitch)) + width * Math.min(height - 1, Math.floor(y / pitch));
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
