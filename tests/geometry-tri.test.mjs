// Flat grid geometry (js/geometry/): the triangle geometry — alternating triangles sized by their
// side, a half side apart along a row and one triangle height apart between rows, plus the gap —
// checked against the triangle's own arithmetic and the triangle graph provider's orientation, the
// nearest-tile rule for hit-testing, the cursor's row and column moves, and the square geometry's
// glyph at the floor and the caps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRID_KINDS, createGeometry } from '../js/geometry/index.js';
import { createTriGeometry } from '../js/geometry/tri.js';
import { createSquareGeometry } from '../js/geometry/square.js';
import { createTriGrid } from '../js/engine/tri-grid.js';
import { boardLayout, gapPx, tileCap, BOARD_SCALES } from '../js/classic2d/board-view.js';
import { createSeededSource } from '../js/generation/random.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQRT3 = Math.sqrt(3);
const EPS = 1e-9;

// Boards and tile sizes the checks sweep: a single cell, thin strips, the standard sizes, with and
// without a gap (gap fractions as the board module gives them).
const SIZES = [[1, 1], [1, 7], [9, 1], [2, 1], [2, 2], [13, 7], [25, 13], [41, 17], [5, 4]];
const TILES = [44, 51, 70, 83];
const GAPS = [0, 0.04, 0.08, 0.15];

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

// The triangle's own arithmetic, written out independently of the module: a triangle `tile` a side
// is √3 / 2 of it high; rows sit one height plus the gap apart, and along a row the tiles sit half a
// side apart plus the horizontal run that puts the gap between the slanted sides facing each other.
function expected(cols, rows, tile, gap) {
  const height = (tile * SQRT3) / 2;
  const rowStep = height + gap;
  const colStep = tile / 2 + (2 * gap) / SQRT3;
  const up = (c) => ((c % cols) + Math.floor(c / cols)) % 2 === 0;
  const box = (c) => {
    const col = c % cols;
    return { x: col * colStep, y: ((c - col) / cols) * rowStep };
  };
  const points = (c) => {
    const { x, y } = box(c);
    return up(c)
      ? [[x + tile / 2, y], [x + tile, y + height], [x, y + height]]
      : [[x, y], [x + tile, y], [x + tile / 2, y + height]];
  };
  const centre = (c) => {
    const { x, y } = box(c);
    return { x: x + tile / 2, y: y + (up(c) ? (2 * height) / 3 : height / 3) };
  };
  return {
    height, rowStep, colStep, up, box, points, centre,
    width: (cols - 1) * colStep + tile,
    boardHeight: rows * rowStep - gap,
  };
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

// The distance from a point to a triangle's outline, none inside it.
function distanceTo(points, x, y) {
  if (insidePolygon(points, x, y)) return 0;
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % 3];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x0 + t * dx - x, y0 + t * dy - y));
  }
  return best;
}

// The perpendicular distance between two parallel sides, each given by its two ends.
function sideGap([[ax, ay], [bx, by]], [[cx, cy]]) {
  const len = Math.hypot(bx - ax, by - ay);
  return Math.abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / len;
}

// ---------- the kind lookup ----------

test('the grid kinds hold the triangle geometry under tri, and the lookup builds it', () => {
  assert.ok(GRID_KINDS.includes('tri'));
  assert.ok(GRID_KINDS.includes('hex'));
  assert.ok(GRID_KINDS.includes('square'));
  const g = createGeometry('tri', 13, 7);
  assert.equal(g.kind, 'tri');
  assert.equal(g.width, 13);
  assert.equal(g.height, 7);
  assert.equal(g.count, 91);
  assert.ok(Object.isFrozen(g));
});

test('a triangle board size that is not a whole number of cells throws a RangeError', () => {
  for (const [w, h] of [[0, 9], [9, 0], [1.5, 2], [-1, 3], [NaN, 2]]) {
    assert.throws(() => createTriGeometry(w, h), RangeError, `${w} × ${h}`);
    assert.throws(() => createGeometry('tri', w, h), RangeError, `${w} × ${h}`);
  }
});

// ---------- extent, centre, outline and glyph box ----------

test('the board extent is half a side per column after the first tile, one height plus the gap per row', () => {
  for (const [cols, rows] of SIZES) {
    const g = createTriGeometry(cols, rows);
    for (const tile of TILES) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const e = expected(cols, rows, tile, space);
        const got = g.extent(tile, space);
        near(got.width, e.width, `${cols} × ${rows} width at ${tile}, gap ${space}`);
        near(got.height, e.boardHeight, `${cols} × ${rows} height at ${tile}, gap ${space}`);
      }
    }
  }
  near(createTriGeometry(3, 2).extent(44).width, createTriGeometry(3, 2).extent(44, 0).width, 'the gap defaults to none');
});

test('cells are numbered row by row: cell c is column c % width, row floor(c / width)', () => {
  const g = createTriGeometry(5, 4);
  const tile = 50;
  const gap = 4;
  for (let c = 0; c < g.count; c++) {
    const col = c % 5;
    const row = (c - col) / 5;
    const o = g.outline(c, tile, gap);
    near(o.x, col * (tile / 2 + (2 * gap) / SQRT3), `cell ${c} x`);
    near(o.y, row * ((tile * SQRT3) / 2 + gap), `cell ${c} y`);
  }
});

test('each outline points the way the triangle graph provider orients its cell: up when column + row is even', () => {
  for (const [cols, rows] of SIZES) {
    const g = createTriGeometry(cols, rows);
    const grid = createTriGrid(cols, rows);
    for (let c = 0; c < g.count; c++) {
      const want = ((c % cols) + Math.floor(c / cols)) % 2 === 0 ? 'up' : 'down';
      assert.equal(grid.orientation(c), want, `the provider's ${c}`);
      assert.equal(g.outline(c, 44, 3).orientation, want, `${cols} × ${rows}: ${c}`);
    }
  }
  assert.equal(createTriGeometry(3, 3).outline(0, 44, 0).orientation, 'up', 'the top-left tile points up');
});

test('each cell\'s outline is its triangle the tile a side, its centre the centroid and its glyph box the circle inside it', () => {
  for (const [cols, rows] of SIZES) {
    const g = createTriGeometry(cols, rows);
    for (const tile of TILES) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const e = expected(cols, rows, tile, space);
        for (let c = 0; c < cols * rows; c++) {
          const o = g.outline(c, tile, space);
          assert.equal(o.shape, 'triangle');
          const { x, y } = e.box(c);
          near(o.x, x, 'box x');
          near(o.y, y, 'box y');
          near(o.width, tile, 'box width a side');
          near(o.height, e.height, 'box height the triangle\'s');
          assert.equal(o.points.length, 3);
          e.points(c).forEach(([px, py], i) => { near(o.points[i][0], px, `corner ${i} x`); near(o.points[i][1], py, `corner ${i} y`); });
          const centre = g.centre(c, tile, space);
          const want = e.centre(c);
          near(centre.x, want.x, `centre x of ${c}`);
          near(centre.y, want.y, `centre y of ${c}`);
          near(centre.x, (o.points[0][0] + o.points[1][0] + o.points[2][0]) / 3, 'the centroid\'s x');
          near(centre.y, (o.points[0][1] + o.points[1][1] + o.points[2][1]) / 3, 'the centroid\'s y');
          const glyph = g.glyphBox(c, tile, space);
          near(glyph.width, tile / SQRT3, 'glyph box across the circle inside the tile');
          near(glyph.height, tile / SQRT3, 'glyph box across the circle inside the tile');
          near(glyph.x + glyph.width / 2, want.x, 'glyph box centred on the centroid');
          near(glyph.y + glyph.height / 2, want.y, 'glyph box centred on the centroid');
          assert.ok(insidePolygon(o.points, glyph.x + glyph.width / 2, glyph.y + 0.01), 'the glyph box\'s top inside the tile');
          assert.ok(insidePolygon(o.points, glyph.x + glyph.width / 2, glyph.y + glyph.height - 0.01), 'its bottom inside the tile');
        }
      }
    }
  }
});

test('the tiles lie on the board, touching its edges, and every pair of sides facing each other is one gap apart', () => {
  for (const [cols, rows] of SIZES) {
    const g = createTriGeometry(cols, rows);
    for (const tile of [44, 70]) {
      for (const gap of GAPS) {
        const space = gapPx(tile, gap);
        const { width, height } = g.extent(tile, space);
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (let c = 0; c < g.count; c++) {
          const p = g.outline(c, tile, space).points;
          for (const [px, py] of p) {
            minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
          }
          const col = c % cols;
          const row = (c - col) / cols;
          const up = g.outline(c, tile, space).orientation === 'up';
          if (col < cols - 1) {
            // The tile to the right shares a slanted side: up's right side faces down's left, and so on.
            const q = g.outline(c + 1, tile, space).points;
            const mine = up ? [p[0], p[1]] : [p[1], p[2]];
            const theirs = up ? [q[0], q[2]] : [q[2], q[0]];
            near(sideGap(mine, theirs), space, `${cols} × ${rows}: ${c} to ${c + 1}`);
          }
          if (up && row < rows - 1) {
            // The tile below an up tile points down: base faces base.
            const q = g.outline(c + cols, tile, space).points;
            near(q[0][1] - p[2][1], space, `${cols} × ${rows}: ${c} to ${c + cols}`);
            near(q[0][0], p[2][0], 'the bases line up');
          }
        }
        near(minX, 0, 'left edge'); near(minY, 0, 'top edge');
        near(maxX, width, 'right edge'); near(maxY, height, 'bottom edge');
      }
    }
  }
});

test('the triangle geometry\'s answers are frozen, and a cell off the board has none', () => {
  const g = createTriGeometry(4, 3);
  assert.ok(Object.isFrozen(g.outline(5, 44, 2)));
  assert.ok(Object.isFrozen(g.outline(5, 44, 2).points));
  assert.ok(g.outline(5, 44, 2).points.every(Object.isFrozen));
  for (const c of [-1, 12, 1.5, NaN, '3']) {
    assert.equal(g.outline(c, 44, 2), null, String(c));
    assert.equal(g.centre(c, 44, 2), null, String(c));
    assert.equal(g.glyphBox(c, 44, 2), null, String(c));
  }
});

// ---------- hit-testing ----------

test('a point inside a tile\'s triangle is that tile (property, seeded)', () => {
  const rng = createSeededSource(259);
  const uniform = () => rng.next() / 0x100000000;
  for (let run = 0; run < 200; run++) {
    const cols = 1 + rng.int(41);
    const rows = 1 + rng.int(17);
    const g = createTriGeometry(cols, rows);
    const tile = g.minTile + rng.int(50);
    const space = gapPx(tile, GAPS[rng.int(GAPS.length)]);
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
  const rng = createSeededSource(2590);
  const uniform = () => rng.next() / 0x100000000;
  for (let run = 0; run < 200; run++) {
    const cols = 1 + rng.int(20);
    const rows = 1 + rng.int(12);
    const g = createTriGeometry(cols, rows);
    const tile = g.minTile + rng.int(50);
    const space = gapPx(tile, GAPS[rng.int(GAPS.length)]);
    const { width, height } = g.extent(tile, space);
    const outlines = Array.from({ length: g.count }, (_, c) => g.outline(c, tile, space).points);
    for (let k = 0; k < 50; k++) {
      const x = uniform() * width;
      const y = uniform() * height;
      const d = outlines.map((p) => distanceTo(p, x, y));
      const best = Math.min(...d);
      const got = g.cellAt(x, y, tile, space);
      assert.ok(got >= 0 && got < g.count, `run ${run}: a cell at ${x}, ${y}`);
      assert.ok(d[got] - best < 1e-9, `run ${run}: ${cols} × ${rows}, ${x}, ${y} went to ${got}, not the nearest`);
      assert.equal(g.cellAt(x, y, tile, space), got, 'the same point, the same cell');
    }
  }
});

test('a point in the gap between two tiles goes to the tile it is nearer; a point off the board to none', () => {
  const g = createTriGeometry(3, 2);
  const tile = 50;
  const gap = 4;
  const h = (tile * SQRT3) / 2;
  // Cell 0 points up, cell 3 under it points down: the gap between their bases runs from h to h + 4.
  const x = g.centre(0, tile, gap).x;
  assert.equal(g.cellAt(x, h + 1, tile, gap), 0, 'the upper half of the gap');
  assert.equal(g.cellAt(x, h + 3, tile, gap), 3, 'the lower half of the gap');
  // Cells 0 and 1 face each other across a slanted gap: points either side of its middle line.
  const p = g.outline(0, tile, gap).points;
  const q = g.outline(1, tile, gap).points;
  const midX = (p[1][0] + q[2][0]) / 2;
  assert.equal(g.cellAt(midX - 1, h - 0.5, tile, gap), 0, 'nearer the up tile');
  assert.equal(g.cellAt(midX + 1, h - 0.5, tile, gap), 1, 'nearer the down tile');
  // The board's rectangle beside the top-left tip is still on the board: its nearest tile.
  assert.equal(g.cellAt(0.5, 0.5, tile, gap), 0, 'the corner beside the first tip is the first tile');
  const { width, height } = g.extent(tile, gap);
  for (const [px, py] of [[-0.1, 5], [5, -0.1], [width, 5], [5, height], [NaN, 2], [2, Infinity], [undefined, 3]]) {
    assert.equal(g.cellAt(px, py, tile, gap), -1, `${px}, ${py}`);
  }
});

test('the board view lays a triangle board out on its extent, never below the triangle floor', () => {
  const g = createTriGeometry(25, 13);
  const layout = boardLayout({ geometry: g, width: 1600, height: 1200, max: g.tileCap('100'), gap: 0.08 });
  assert.equal(layout.tile, g.tileCap('100'));
  const e = g.extent(layout.tile, layout.gap);
  assert.deepEqual({ width: layout.boardWidth, height: layout.boardHeight }, e);
  const tight = boardLayout({ geometry: g, width: 500, height: 500, gap: 0.08 });
  assert.ok(tight.tile >= g.minTile);
  const fits = g.extent(tight.tile, tight.gap);
  assert.ok(tight.scrolls || (fits.width <= 500 && fits.height <= 500));
});

// ---------- cursor moves ----------

test('the cursor moves left and right along the row, up and down to the same column, none at the edge', () => {
  for (const [cols, rows] of SIZES) {
    const g = createTriGeometry(cols, rows);
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

test('an unknown direction is a RangeError; a cell off the board has no neighbour', () => {
  const g = createTriGeometry(4, 4);
  assert.throws(() => g.neighbour(5, 'north'), RangeError);
  for (const c of [-1, 16, 2.5]) assert.equal(g.neighbour(c, 'up'), -1, String(c));
});

// ---------- tile sizes ----------

test('the floor is the feature document\'s 44 px a side', () => {
  assert.equal(createTriGeometry(13, 7).minTile, 44);
});

test('the glyph at the floor and at each cap matches the square\'s', () => {
  const tri = createTriGeometry(13, 7);
  const square = createSquareGeometry(13, 7);
  // At the floor: the circle inside the triangle about as large as the square floor's tile.
  const floor = tri.glyphBox(0, tri.minTile, 0);
  assert.ok(Math.abs(floor.width - square.glyphBox(0, square.minTile, 0).width) < 1, `${floor.width} at the floor`);
  for (const scale of BOARD_SCALES) {
    const cap = tri.tileCap(scale);
    if (!Number.isFinite(cap)) {
      assert.equal(cap, tileCap(scale), `no cap at ${scale}, as on the square`);
      continue;
    }
    assert.ok(Number.isInteger(cap), `a whole tile at ${scale}`);
    const t = tri.glyphBox(0, cap, 0);
    const s = square.glyphBox(0, square.tileCap(scale), 0);
    assert.ok(Math.abs(t.width - s.width) <= 0.5, `${t.width} against ${s.width} at ${scale}`);
  }
  assert.equal(tri.tileCap(), tri.tileCap('100'), 'the default scale is 100 %');
});

test('the triangle geometry reads the square\'s cap from where it lives, never a copy', () => {
  const src = readFileSync(join(ROOT, 'js/geometry/tri.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.match(src, /tileCap/);
  assert.doesNotMatch(src, /\b(26|48|60)\b/, 'no square tile size literal');
});

// ---------- DOM-free ----------

test('the triangle geometry module is DOM-free: no document, window or canvas at import or in its body', () => {
  const src = readFileSync(join(ROOT, 'js/geometry/tri.js'), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.doesNotMatch(src, /\b(document|window|globalThis|HTMLCanvasElement|getContext)\b/);
});
