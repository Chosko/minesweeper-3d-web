// Flat grid geometry (js/geometry/): the hexagon geometry — flat-top tiles in columns, odd columns
// half a row step lower, sized across the flats — checked against the hexagon's own arithmetic, the
// nearest-tile rule for hit-testing, the cursor's column and row moves, and the square geometry's
// floor and caps for the glyph.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRID_KINDS, createGeometry } from '../js/geometry/index.js';
import { createHexGeometry } from '../js/geometry/hex.js';
import { createSquareGeometry } from '../js/geometry/square.js';
import { boardLayout, gapPx, tileCap, BOARD_SCALES } from '../js/classic2d/board-view.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { createSeededSource } from '../js/generation/random.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQRT3 = Math.sqrt(3);
const EPS = 1e-9;

// Boards and tile sizes the checks sweep: a single cell, thin strips, the standard sizes, with and
// without a gap (gap fractions as the board module gives them).
const SIZES = [[1, 1], [1, 7], [9, 1], [2, 1], [2, 2], [9, 9], [16, 16], [30, 16], [5, 4]];
const TILES = [26, 31, 48, 60];
const GAPS = [0, 0.04, 0.08, 0.15];

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

// The hexagon's own arithmetic, written out independently of the module: a flat-top hexagon `tile`
// across the flats has sides tile / √3 and is twice that corner to corner; neighbours sit one
// row step (tile + gap) apart in all six directions.
function expected(cols, rows, tile, gap) {
  const side = tile / SQRT3;
  const rowStep = tile + gap;
  const colStep = rowStep * SQRT3 / 2;
  const centre = (c) => {
    const col = c % cols;
    const row = (c - col) / cols;
    return { x: side + col * colStep, y: tile / 2 + row * rowStep + (col % 2 ? rowStep / 2 : 0) };
  };
  const width = 2 * side + (cols - 1) * colStep;
  const height = rows * rowStep - gap + (cols > 1 ? rowStep / 2 : 0);
  return { side, rowStep, colStep, centre, width, height };
}

// The six neighbours of (col, row) on a board of flat-top columns, odd columns lower.
function sharedSide(cols, rows, c) {
  const col = c % cols;
  const row = (c - col) / cols;
  const odd = col % 2;
  const out = [[col, row - 1], [col, row + 1]];
  for (const dc of [-1, 1]) out.push([col + dc, row - 1 + odd], [col + dc, row + odd]);
  return out.filter(([x, y]) => x >= 0 && x < cols && y >= 0 && y < rows).map(([x, y]) => x + cols * y);
}

const insidePolygon = (points, x, y) => {
  // Strictly inside a convex polygon whose corners run clockwise on the page (y down).
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    if ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0) <= EPS) return false;
  }
  return true;
};

// ---------- the kind lookup ----------

test('the grid kinds hold the hexagon geometry under hex, and the lookup builds it', () => {
  assert.ok(GRID_KINDS.includes('hex'));
  assert.ok(GRID_KINDS.includes('square'));
  const g = createGeometry('hex', 9, 6);
  assert.equal(g.kind, 'hex');
  assert.equal(g.width, 9);
  assert.equal(g.height, 6);
  assert.equal(g.count, 54);
  assert.ok(Object.isFrozen(g));
});

test('a hexagon board size that is not a whole number of cells throws a RangeError', () => {
  for (const [w, h] of [[0, 9], [9, 0], [1.5, 2], [-1, 3], [NaN, 2]]) {
    assert.throws(() => createHexGeometry(w, h), RangeError, `${w} × ${h}`);
    assert.throws(() => createGeometry('hex', w, h), RangeError, `${w} × ${h}`);
  }
});

// ---------- extent, centre, outline and glyph box ----------

test('the board extent is the columns\' span: corner to corner across, odd columns half a row step lower', () => {
  for (const [cols, rows] of SIZES) {
    const g = createHexGeometry(cols, rows);
    for (const tile of TILES) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const e = expected(cols, rows, tile, space);
        const got = g.extent(tile, space);
        near(got.width, e.width, `${cols} × ${rows} width at ${tile}, gap ${space}`);
        near(got.height, e.height, `${cols} × ${rows} height at ${tile}, gap ${space}`);
      }
    }
  }
  near(createHexGeometry(3, 2).extent(30).width, createHexGeometry(3, 2).extent(30, 0).width, 'the gap defaults to none');
});

test('cells are numbered row by row: cell c is column c % width, row floor(c / width)', () => {
  const g = createHexGeometry(5, 4);
  for (let c = 0; c < g.count; c++) {
    const col = c % 5;
    const row = (c - col) / 5;
    const centre = g.centre(c, 40, 4);
    const rowStep = 44;
    near(centre.y, 20 + row * rowStep + (col % 2 ? rowStep / 2 : 0), `cell ${c} y`);
    near(centre.x, 40 / SQRT3 + col * rowStep * SQRT3 / 2, `cell ${c} x`);
  }
});

test('each cell\'s outline is a flat-top hexagon the tile across the flats, around its centre', () => {
  for (const [cols, rows] of SIZES) {
    const g = createHexGeometry(cols, rows);
    for (const tile of TILES) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const e = expected(cols, rows, tile, space);
        for (let c = 0; c < cols * rows; c++) {
          const { x: cx, y: cy } = e.centre(c);
          const centre = g.centre(c, tile, space);
          near(centre.x, cx, `centre x of ${c}`);
          near(centre.y, cy, `centre y of ${c}`);
          const o = g.outline(c, tile, space);
          assert.equal(o.shape, 'hexagon');
          assert.equal(o.orientation, 'none', 'every hexagon tile has the one orientation');
          near(o.x, cx - e.side, 'box x');
          near(o.y, cy - tile / 2, 'box y');
          near(o.width, 2 * e.side, 'box width corner to corner');
          near(o.height, tile, 'box height across the flats');
          const want = [
            [cx - e.side, cy], [cx - e.side / 2, cy - tile / 2], [cx + e.side / 2, cy - tile / 2],
            [cx + e.side, cy], [cx + e.side / 2, cy + tile / 2], [cx - e.side / 2, cy + tile / 2],
          ];
          assert.equal(o.points.length, 6);
          o.points.forEach(([px, py], i) => { near(px, want[i][0], `corner ${i} x`); near(py, want[i][1], `corner ${i} y`); });
          const box = g.glyphBox(c, tile, space);
          near(box.width, tile, 'glyph box across the flats');
          near(box.height, tile, 'glyph box across the flats');
          near(box.x + box.width / 2, cx, 'glyph box centred');
          near(box.y + box.height / 2, cy, 'glyph box centred');
        }
      }
    }
  }
});

test('the tiles lie on the board, touching its edges, and neighbours sit one gap apart across a shared side', () => {
  for (const [cols, rows] of SIZES) {
    const g = createHexGeometry(cols, rows);
    for (const tile of [26, 48]) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const { width, height } = g.extent(tile, space);
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (let c = 0; c < g.count; c++) {
          for (const [px, py] of g.outline(c, tile, space).points) {
            minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
          }
          const a = g.centre(c, tile, space);
          for (const n of sharedSide(cols, rows, c)) {
            const b = g.centre(n, tile, space);
            // Centres one row step apart: the tile across the flats plus the gap between the sides.
            near(Math.hypot(b.x - a.x, b.y - a.y), tile + space, `${cols} × ${rows}: ${c} to ${n}`);
          }
        }
        near(minX, 0, 'left edge'); near(minY, 0, 'top edge');
        near(maxX, width, 'right edge'); near(maxY, height, 'bottom edge');
      }
    }
  }
});

test('the hexagon geometry\'s answers are frozen, and a cell off the board has none', () => {
  const g = createHexGeometry(4, 3);
  assert.ok(Object.isFrozen(g.outline(5, 30, 2)));
  assert.ok(Object.isFrozen(g.outline(5, 30, 2).points));
  assert.ok(g.outline(5, 30, 2).points.every(Object.isFrozen));
  for (const c of [-1, 12, 1.5, NaN, '3']) {
    assert.equal(g.outline(c, 30, 2), null, String(c));
    assert.equal(g.centre(c, 30, 2), null, String(c));
    assert.equal(g.glyphBox(c, 30, 2), null, String(c));
  }
});

// ---------- hit-testing ----------

test('a point inside a tile\'s hexagon is that tile (property, seeded)', () => {
  const rng = createSeededSource(255);
  const uniform = () => rng.next() / 0x100000000;
  for (let run = 0; run < 200; run++) {
    const cols = 1 + rng.int(30);
    const rows = 1 + rng.int(24);
    const tile = MIN_TILE_SIZE + rng.int(40);
    const space = gapPx(tile, GAPS[rng.int(GAPS.length)]);
    const g = createHexGeometry(cols, rows);
    for (let k = 0; k < 30; k++) {
      const c = rng.int(g.count);
      const o = g.outline(c, tile, space);
      const x = o.x + uniform() * o.width;
      const y = o.y + uniform() * o.height;
      if (!insidePolygon(o.points, x, y)) continue;
      assert.equal(g.cellAt(x, y, tile, space), c, `run ${run}: ${cols} × ${rows}, cell ${c} at ${x}, ${y}`);
    }
  }
});

test('every point on the board belongs to exactly one cell, the nearest tile — a gap goes to the nearest (property, seeded)', () => {
  const rng = createSeededSource(2550);
  const uniform = () => rng.next() / 0x100000000;
  for (let run = 0; run < 200; run++) {
    const cols = 1 + rng.int(20);
    const rows = 1 + rng.int(16);
    const tile = MIN_TILE_SIZE + rng.int(40);
    const space = gapPx(tile, GAPS[rng.int(GAPS.length)]);
    const g = createHexGeometry(cols, rows);
    const { width, height } = g.extent(tile, space);
    const centres = Array.from({ length: g.count }, (_, c) => g.centre(c, tile, space));
    for (let k = 0; k < 50; k++) {
      const x = uniform() * width;
      const y = uniform() * height;
      const d = centres.map((p) => Math.hypot(p.x - x, p.y - y));
      const best = Math.min(...d);
      const got = g.cellAt(x, y, tile, space);
      assert.ok(got >= 0 && got < g.count, `run ${run}: a cell at ${x}, ${y}`);
      assert.ok(d[got] - best < 1e-9, `run ${run}: ${cols} × ${rows}, ${x}, ${y} went to ${got}, not the nearest`);
      assert.equal(g.cellAt(x, y, tile, space), got, 'the same point, the same cell');
    }
  }
});

test('a point in the gap between two tiles goes to the tile it is nearer; a point off the board to none', () => {
  const g = createHexGeometry(3, 2);
  const tile = 40;
  const gap = 4;
  const a = g.centre(0, tile, gap);
  const b = g.centre(3, tile, gap);
  // Cell 3 sits right under cell 0; the gap between them runs from y = 40 to y = 44.
  assert.equal(g.cellAt(a.x, 41, tile, gap), 0, 'the upper half of the gap');
  assert.equal(g.cellAt(a.x, 43, tile, gap), 3, 'the lower half of the gap');
  assert.equal(b.y - a.y, tile + gap);
  const { width, height } = g.extent(tile, gap);
  for (const [x, y] of [[-0.1, 5], [5, -0.1], [width, 5], [5, height], [NaN, 2], [2, Infinity], [undefined, 3]]) {
    assert.equal(g.cellAt(x, y, tile, gap), -1, `${x}, ${y}`);
  }
  // A corner of the board's rectangle beside a lowered column is still on the board: its nearest tile.
  assert.equal(g.cellAt(width / 2, 0.5, tile, gap), 1, 'the notch above the lowered middle column is its top tile');
});

test('the board view lays a hexagon board out on its extent and hit-tests through it', () => {
  const g = createHexGeometry(16, 16);
  const layout = boardLayout({ geometry: g, width: 1200, height: 1000, max: tileCap('100'), gap: 0.08 });
  assert.equal(layout.tile, tileCap('100'));
  const e = g.extent(layout.tile, layout.gap);
  assert.deepEqual({ width: layout.boardWidth, height: layout.boardHeight }, e);
  const tight = boardLayout({ geometry: g, width: 500, height: 500, gap: 0.08 });
  assert.ok(tight.tile >= g.minTile);
  const fits = g.extent(tight.tile, tight.gap);
  assert.ok(tight.scrolls || (fits.width <= 500 && fits.height <= 500));
});

// ---------- cursor moves ----------

test('the cursor moves up and down within the column, left and right to the same row of the next column, none at the edge', () => {
  for (const [cols, rows] of SIZES) {
    const g = createHexGeometry(cols, rows);
    for (let c = 0; c < cols * rows; c++) {
      const col = c % cols;
      const row = (c - col) / cols;
      assert.equal(g.neighbour(c, 'up'), row > 0 ? c - cols : -1, `${cols} × ${rows}: ${c} up`);
      assert.equal(g.neighbour(c, 'down'), row < rows - 1 ? c + cols : -1, `${cols} × ${rows}: ${c} down`);
      assert.equal(g.neighbour(c, 'left'), col > 0 ? c - 1 : -1, `${cols} × ${rows}: ${c} left`);
      assert.equal(g.neighbour(c, 'right'), col < cols - 1 ? c + 1 : -1, `${cols} × ${rows}: ${c} right`);
    }
  }
});

test('stepping right along a row zig-zags: every step is to a tile sharing a side, alternately down and up', () => {
  const g = createHexGeometry(6, 3);
  let c = 6;
  const ys = [g.centre(c, 30, 0).y];
  for (let k = 0; k < 5; k++) {
    const next = g.neighbour(c, 'right');
    assert.ok(sharedSide(6, 3, c).includes(next), `${c} → ${next} shares a side`);
    c = next;
    ys.push(g.centre(c, 30, 0).y);
  }
  assert.equal(g.neighbour(c, 'right'), -1);
  for (let k = 1; k < ys.length; k++) assert.equal(Math.sign(ys[k] - ys[k - 1]), k % 2 ? 1 : -1, `step ${k}`);
});

test('an unknown direction is a RangeError; a cell off the board has no neighbour', () => {
  const g = createHexGeometry(4, 4);
  assert.throws(() => g.neighbour(5, 'north'), RangeError);
  for (const c of [-1, 16, 2.5]) assert.equal(g.neighbour(c, 'up'), -1, String(c));
});

// ---------- tile sizes ----------

test('the floor is the square floor across the flats, and the tile at each board scale the square\'s cap', () => {
  const g = createHexGeometry(9, 9);
  assert.equal(g.minTile, MIN_TILE_SIZE);
  assert.equal(g.minTile, 26, 'the feature document\'s floor across the flats');
  for (const scale of BOARD_SCALES) assert.equal(g.tileCap(scale), tileCap(scale), scale);
  assert.equal(g.tileCap(), tileCap());
});

test('the glyph at the floor and at each cap matches the square\'s', () => {
  const hex = createHexGeometry(9, 9);
  const square = createSquareGeometry(9, 9);
  assert.equal(hex.minTile, square.minTile, 'the same floor');
  for (const scale of BOARD_SCALES) assert.equal(hex.tileCap(scale), square.tileCap(scale), `the same cap at ${scale}`);
  for (const tile of [hex.minTile, ...BOARD_SCALES.map((s) => hex.tileCap(s)).filter(Number.isFinite)]) {
    const h = hex.glyphBox(0, tile, 0);
    const s = square.glyphBox(0, tile, 0);
    assert.deepEqual({ width: h.width, height: h.height }, { width: s.width, height: s.height }, `at ${tile} px`);
  }
});

test('the hexagon geometry reads its floor and cap from where they live, never a copy', () => {
  const src = readFileSync(join(ROOT, 'js/geometry/hex.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.match(src, /MIN_TILE_SIZE/);
  assert.match(src, /tileCap/);
  assert.doesNotMatch(src, /\b(26|48|60)\b/, 'no tile size literal');
});

// ---------- DOM-free ----------

test('the hexagon geometry module is DOM-free: no document, window or canvas at import or in its body', () => {
  const src = readFileSync(join(ROOT, 'js/geometry/hex.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.doesNotMatch(src, /\b(document|window|globalThis|HTMLCanvasElement|getContext)\b/);
});
