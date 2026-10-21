// Flat grid geometry (js/geometry/): the kind lookup and the square geometry, checked against the
// Classic 2D board view's pitch arithmetic (boardLayout, cellAtLayout), the cursor input's column
// and row steps, and the shipped MIN_TILE_SIZE and board scale caps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRID_KINDS, createGeometry } from '../js/geometry/index.js';
import { createSquareGeometry } from '../js/geometry/square.js';
import { boardLayout, cellAtLayout, gapPx, tileCap, BOARD_SCALES } from '../js/classic2d/board-view.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { createCursorInput } from '../js/classic2d/cursor-input.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { createSeededSource } from '../js/generation/random.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Boards and tile sizes the checks sweep: a single cell, thin strips, the standard sizes, with and
// without a gap (gap fractions as the board module gives them).
const SIZES = [[1, 1], [1, 7], [9, 1], [8, 8], [9, 9], [16, 16], [30, 16], [5, 4]];
const TILES = [26, 31, 48, 60];
const GAPS = [0, 0.04, 0.08, 0.15];

// ---------- the kind lookup ----------

test('the grid kinds hold the square geometry, and the lookup builds it', () => {
  assert.ok(GRID_KINDS.includes('square'));
  assert.ok(Object.isFrozen(GRID_KINDS));
  const g = createGeometry('square', 9, 6);
  assert.equal(g.kind, 'square');
  assert.equal(g.width, 9);
  assert.equal(g.height, 6);
  assert.equal(g.count, 54);
});

test('an unknown grid kind throws a RangeError when the geometry is built', () => {
  for (const kind of ['hexagon-x', 'triangle-x', '', undefined, null, 'Square']) {
    assert.throws(() => createGeometry(kind, 9, 9), RangeError, String(kind));
  }
});

test('a board size that is not a whole number of cells throws a RangeError', () => {
  for (const [w, h] of [[0, 9], [9, 0], [1.5, 2], [-1, 3], [NaN, 2]]) {
    assert.throws(() => createSquareGeometry(w, h), RangeError, `${w} × ${h}`);
    assert.throws(() => createGeometry('square', w, h), RangeError, `${w} × ${h}`);
  }
});

// ---------- extent, centre, outline and glyph box ----------

test('the board extent at a tile size and gap is boardLayout\'s board size', () => {
  for (const [cols, rows] of SIZES) {
    const g = createSquareGeometry(cols, rows);
    for (const tile of TILES) {
      for (const gap of GAPS) {
        const layout = boardLayout({ cols, rows, width: 4000, height: 4000, min: tile, max: tile, gap });
        assert.equal(layout.tile, tile);
        assert.deepEqual(g.extent(layout.tile, layout.gap), { width: layout.boardWidth, height: layout.boardHeight },
          `${cols} × ${rows} at ${tile} px, gap ${gap}`);
      }
    }
  }
});

test('each cell\'s outline is its square tile one pitch from the last, its centre the tile\'s centre', () => {
  for (const [cols, rows] of SIZES) {
    const g = createSquareGeometry(cols, rows);
    for (const tile of TILES) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const pitch = tile + space;
        for (let c = 0; c < cols * rows; c++) {
          const col = c % cols;
          const row = (c - col) / cols;
          const x = col * pitch;
          const y = row * pitch;
          const o = g.outline(c, tile, space);
          assert.equal(o.shape, 'square');
          assert.equal(o.orientation, 'none');
          assert.deepEqual({ x: o.x, y: o.y, width: o.width, height: o.height }, { x, y, width: tile, height: tile });
          assert.deepEqual(o.points, [[x, y], [x + tile, y], [x + tile, y + tile], [x, y + tile]]);
          assert.deepEqual(g.centre(c, tile, space), { x: x + tile / 2, y: y + tile / 2 });
          assert.deepEqual(g.glyphBox(c, tile, space), { x, y, width: tile, height: tile });
        }
      }
    }
  }
});

test('the square geometry\'s answers are frozen, and a cell off the board has none', () => {
  const g = createSquareGeometry(4, 3);
  assert.ok(Object.isFrozen(g));
  assert.ok(Object.isFrozen(g.outline(5, 30, 2)));
  assert.ok(Object.isFrozen(g.outline(5, 30, 2).points));
  for (const c of [-1, 12, 1.5, NaN, '3']) {
    assert.equal(g.outline(c, 30, 2), null, String(c));
    assert.equal(g.centre(c, 30, 2), null, String(c));
    assert.equal(g.glyphBox(c, 30, 2), null, String(c));
  }
});

// ---------- hit-testing ----------

test('the cell at a board point is cellAtLayout\'s cell, gaps going to the slot that holds them', () => {
  for (const [cols, rows] of SIZES) {
    const g = createSquareGeometry(cols, rows);
    for (const tile of [26, 48]) {
      for (const gap of GAPS) {
        const layout = boardLayout({ cols, rows, width: 4000, height: 4000, min: tile, max: tile, gap });
        assert.ok(!layout.scrolls);
        const at = (bx, by) => cellAtLayout(layout, { x: 0, y: 0 }, cols, rows, layout.viewX + bx, layout.viewY + by);
        for (let by = -2; by < layout.boardHeight + 2; by += 0.5) {
          for (let bx = -2; bx < layout.boardWidth + 2; bx += 3.5) {
            assert.equal(g.cellAt(bx, by, layout.tile, layout.gap), at(bx, by), `${cols} × ${rows} at ${bx}, ${by}`);
          }
        }
      }
    }
  }
});

test('a point in the gap after a tile goes to that tile; a point off the board to none', () => {
  const g = createSquareGeometry(3, 2);
  const tile = 40;
  const gap = 4;
  assert.equal(g.cellAt(41, 10, tile, gap), 0, 'the gap right of the first tile');
  assert.equal(g.cellAt(10, 42, tile, gap), 0, 'the gap under the first tile');
  assert.equal(g.cellAt(43.9, 43.9, tile, gap), 0, 'the gap corner after the first tile');
  assert.equal(g.cellAt(44, 44, tile, gap), 4, 'the next tile starts one pitch on');
  for (const [x, y] of [[-0.1, 5], [5, -0.1], [3 * 40 + 2 * 4, 5], [5, 2 * 40 + 4], [NaN, 2], [2, Infinity]]) {
    assert.equal(g.cellAt(x, y, tile, gap), -1, `${x}, ${y}`);
  }
});

test('every point inside the board\'s outline maps to exactly one cell (property, seeded)', () => {
  const rng = createSeededSource(248);
  const uniform = () => rng.next() / 0x100000000;
  for (let run = 0; run < 200; run++) {
    const cols = 1 + rng.int(30);
    const rows = 1 + rng.int(24);
    const tile = MIN_TILE_SIZE + rng.int(40);
    const space = gapPx(tile, GAPS[rng.int(GAPS.length)]);
    const g = createSquareGeometry(cols, rows);
    const { width, height } = g.extent(tile, space);
    // A cell's slot: its outline widened by the gap after it, on the board.
    const slots = Array.from({ length: g.count }, (_, c) => {
      const o = g.outline(c, tile, space);
      return { x0: o.x, y0: o.y, x1: Math.min(width, o.x + tile + space), y1: Math.min(height, o.y + tile + space) };
    });
    for (let k = 0; k < 50; k++) {
      const x = uniform() * width;
      const y = uniform() * height;
      const holders = [];
      slots.forEach((s, c) => { if (x >= s.x0 && x < s.x1 && y >= s.y0 && y < s.y1) holders.push(c); });
      assert.equal(holders.length, 1, `run ${run}: ${cols} × ${rows}, tile ${tile}, gap ${space}, at ${x}, ${y}`);
      assert.equal(g.cellAt(x, y, tile, space), holders[0], `run ${run}: ${x}, ${y}`);
    }
  }
});

// ---------- cursor moves ----------

test('the cursor\'s neighbour in each direction is the cursor input\'s column or row step, none at the edge', () => {
  const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  for (const [cols, rows] of SIZES) {
    const g = createSquareGeometry(cols, rows);
    const grid = createSquareGrid(cols, rows);
    const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines: [], dimensions: { width: cols, height: rows } });
    const input = createCursorInput({ grid, game: () => game, onPress: () => {}, onAction: () => {} });
    for (let c = 0; c < cols * rows; c++) {
      for (const [dir, [dx, dy]] of Object.entries(STEPS)) {
        input.setCell(c);
        input.move(dx, dy);
        const moved = input.cell === c ? -1 : input.cell;
        assert.equal(g.neighbour(c, dir), moved, `${cols} × ${rows}: cell ${c} ${dir}`);
      }
    }
  }
});

test('an unknown direction or a cell off the board has no neighbour to give', () => {
  const g = createSquareGeometry(4, 4);
  assert.throws(() => g.neighbour(5, 'north'), RangeError);
  for (const c of [-1, 16, 2.5]) assert.equal(g.neighbour(c, 'up'), -1, String(c));
});

// ---------- tile sizes ----------

test('the floor is MIN_TILE_SIZE and the tile at each board scale is the board view\'s cap', () => {
  const g = createSquareGeometry(9, 9);
  assert.equal(g.minTile, MIN_TILE_SIZE);
  for (const scale of BOARD_SCALES) assert.equal(g.tileCap(scale), tileCap(scale), scale);
  assert.equal(g.tileCap(), tileCap());
});

test('the square geometry reads its floor and cap from where they live, never a copy', () => {
  const src = readFileSync(join(ROOT, 'js/geometry/square.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.match(src, /MIN_TILE_SIZE/);
  assert.match(src, /tileCap/);
  assert.doesNotMatch(src, /\b(26|48|60)\b/, 'no tile size literal');
});

// ---------- DOM-free ----------

test('the geometry modules are DOM-free: no document, window or canvas at import or in their body', () => {
  for (const file of ['js/geometry/index.js', 'js/geometry/square.js']) {
    const src = readFileSync(join(ROOT, file), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    assert.doesNotMatch(src, /\b(document|window|globalThis|HTMLCanvasElement|getContext)\b/, file);
  }
});
