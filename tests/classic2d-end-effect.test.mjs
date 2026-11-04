// Classic 2D end effect (js/classic2d/end-effect.js): the 3D win and loss effects at board scale —
// the loss wave's per-tile reach time from the exploded tile, scaled so the farthest tile is reached
// within the 2D end delay on Beginner, Expert and a 100 × 100 board, the pre-loss tiles shown until
// it arrives, each wave's scale and light from the board module, drawn clipped to the rounded tile,
// the confetti in the module's colours bounded to the board's rectangle, and the effect done at the
// end of the delay. DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEndEffect, reachMs, preLossState, wonState, shownState, waveAt, confettiAt, done, drawWave, drawConfetti,
  WIN, LOSS, WAVE_STEP_MS, WAVE_SHARE, WIN_WAVE, LOSS_SNAP_MS,
} from '../js/classic2d/end-effect.js';
import { END_DELAY_MS } from '../js/classic2d/mode.js';
import { END_DELAY_MS as END_DELAY_3D_MS } from '../js/shell/mode-3d.js';
import { CELL } from '../js/engine/rules.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';
import { createGeometry } from '../js/geometry/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const END2D = JOYFUL.end2d;

const BOARDS = { beginner: [9, 9], expert: [30, 16], huge: [100, 100] };
const corners = (cols, rows) => [0, cols - 1, (rows - 1) * cols, rows * cols - 1];
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('the 2D end delay is a named constant of about one second, the same order as the 3D one', () => {
  assert.ok(Number.isInteger(END_DELAY_MS));
  assert.ok(END_DELAY_MS >= 700 && END_DELAY_MS <= 1500, `${END_DELAY_MS} ms`);
  assert.ok(END_DELAY_MS <= 1.5 * END_DELAY_3D_MS && END_DELAY_MS >= END_DELAY_3D_MS / 1.5);
});

test('the loss wave reaches the exploded tile at once and each other tile later the farther it is', () => {
  const [cols, rows] = BOARDS.expert;
  const origin = 5 * cols + 7;
  const e = createEndEffect({ kind: LOSS, cols, rows, origin, duration: END_DELAY_MS });
  assert.equal(reachMs(e, origin), 0);
  const at = (col, row) => reachMs(e, row * cols + col);
  assert.ok(at(8, 5) > 0, 'a neighbour is reached after the exploded tile');
  assert.ok(at(9, 5) > at(8, 5) && at(12, 5) > at(9, 5), 'farther along a row is later');
  assert.ok(at(7, 9) > at(7, 6), 'farther along a column is later');
  assert.ok(Math.abs(at(9, 5) - at(7, 3)) < 1e-9 && Math.abs(at(9, 5) - at(5, 5)) < 1e-9, 'equal distance, equal time');
  assert.ok(Math.abs(at(9, 5) - 2 * at(8, 5)) < 1e-9, 'proportional to the distance');
  assert.ok(at(8, 5) <= WAVE_STEP_MS, 'never slower than the 3D wave per tile');
});

test('on Beginner, Expert and a 100 × 100 board the wave reaches the farthest tile within the 2D end delay, from any tile', () => {
  for (const [name, [cols, rows]] of Object.entries(BOARDS)) {
    const origins = [...corners(cols, rows), Math.floor(rows / 2) * cols + Math.floor(cols / 2), cols + 1];
    for (const origin of origins) {
      const e = createEndEffect({ kind: LOSS, cols, rows, origin, duration: END_DELAY_MS });
      let latest = 0;
      for (let c = 0; c < cols * rows; c++) latest = Math.max(latest, reachMs(e, c));
      assert.ok(latest > 0, `${name}: the wave travels`);
      assert.ok(latest < END_DELAY_MS, `${name} from ${origin}: the farthest tile at ${latest.toFixed(1)} ms`);
    }
  }
});

test('a tile the loss changed keeps its pre-loss tile until the wave reaches it, then shows its end state', () => {
  assert.equal(preLossState(CELL.MINE), CELL.CLOSED, 'a mine shown was closed');
  assert.equal(preLossState(CELL.WRONG_FLAG), CELL.FLAGGED, 'a wrong flag was a flag');
  assert.equal(preLossState(CELL.EXPLODED), CELL.CLOSED);
  for (const s of [CELL.CLOSED, CELL.FLAGGED, CELL.REVEALED]) assert.equal(preLossState(s), s, `${s} is not changed by the loss`);

  const [cols, rows] = BOARDS.beginner;
  const e = createEndEffect({ kind: LOSS, cols, rows, origin: 0, duration: END_DELAY_MS });
  assert.equal(shownState(e, 0, CELL.EXPLODED, 0), CELL.EXPLODED, 'the exploded tile shows at once');
  const far = cols * rows - 1;
  const reach = reachMs(e, far);
  assert.equal(shownState(e, far, CELL.MINE, 0), CELL.CLOSED);
  assert.equal(shownState(e, far, CELL.MINE, reach - 1), CELL.CLOSED);
  assert.equal(shownState(e, far, CELL.MINE, reach), CELL.MINE);
  assert.equal(shownState(e, far, CELL.WRONG_FLAG, reach / 2), CELL.FLAGGED);
  assert.equal(shownState(e, far, CELL.WRONG_FLAG, END_DELAY_MS), CELL.WRONG_FLAG);
  assert.equal(shownState(e, far, CELL.REVEALED, 0), CELL.REVEALED, 'an unchanged tile is never held back');

  const win = createEndEffect({ kind: WIN, cols, rows, origin: 0, duration: END_DELAY_MS });
  assert.equal(wonState(CELL.CLOSED), CELL.FLAGGED, 'a won board\'s closed cell is an unflagged mine, shown as a flag');
  for (const s of [CELL.FLAGGED, CELL.REVEALED]) assert.equal(wonState(s), s);
  assert.equal(shownState(win, far, CELL.CLOSED, reachMs(win, far) - 1), CELL.CLOSED, 'a win\'s mine stays closed until the wave reaches it');
  assert.equal(shownState(win, far, CELL.CLOSED, reachMs(win, far)), CELL.FLAGGED, 'then shows its end-state flag');
  assert.equal(shownState(win, far, CELL.FLAGGED, 0), CELL.FLAGGED);
  assert.equal(shownState(win, far, CELL.REVEALED, 0), CELL.REVEALED);
});

test('the win wave starts at the last action\'s cell and spreads from it, each tile bumped in scale and lightened by the module\'s values', () => {
  const [cols, rows] = BOARDS.expert;
  const origin = 8 * cols + 20;
  const e = createEndEffect({ kind: WIN, cols, rows, origin, duration: END_DELAY_MS, random: seeded() });
  assert.equal(e.origin, origin);
  assert.equal(waveAt(e, origin, CELL.REVEALED, 0, END2D), null, 'nothing before the wave has left');
  const strongest = (c) => {
    let best = { t: -1, scale: 1, flash: 0 };
    for (let t = 0; t < END_DELAY_MS; t += 5) { const w = waveAt(e, c, CELL.REVEALED, t, END2D); if (w && w.scale > best.scale) best = { t, ...w }; }
    return best;
  };
  const here = strongest(origin);
  const near = strongest(origin + 3);
  const far = strongest(0);
  assert.ok(here.scale > 1 && near.scale > 1 && far.scale > 1, 'every tile bumps');
  assert.ok(here.t < near.t && near.t < far.t, `the wave passes the origin first (${here.t}, ${near.t}, ${far.t} ms)`);
  assert.ok(far.t < END_DELAY_MS, 'and reaches the farthest tile within the delay');
  assert.ok(Math.abs(here.t - WIN_WAVE.peakMs) <= 5, 'its peak WIN_WAVE.peakMs after the wave arrives');
  assert.ok(Math.abs(here.scale - END2D.win.scale) < 0.01, `at its peak the tile is at the module's scale (${here.scale})`);
  assert.ok(Math.abs(here.flash - END2D.win.mix) < 0.01, `and mixed the module's share toward its light (${here.flash})`);
  for (const t of [here.t - 60, here.t + 60]) {
    const w = waveAt(e, origin, CELL.REVEALED, t, END2D);
    assert.ok(Math.abs((w.scale - 1) / (END2D.win.scale - 1) - w.flash / END2D.win.mix) < 1e-9, 'scale and lightening rise and fall together');
  }
  assert.equal(waveAt(e, 0, CELL.REVEALED, END_DELAY_MS, END2D), null, 'gone at the end of the delay');
  const loss = createEndEffect({ kind: LOSS, cols, rows, origin, duration: END_DELAY_MS });
  assert.equal(waveAt(loss, origin + 1, CELL.REVEALED, here.t, END2D), null, 'a loss leaves a tile it did not change still');
  assert.deepEqual(confettiAt(loss, 300, { width: 900, height: 480, tile: 30 }), [], 'and throws no confetti');
});

test('the loss wave snaps each tile the loss changed to its revealed face, from the module\'s scale with an overshoot, under the module\'s flash fading out', () => {
  const [cols, rows] = BOARDS.expert;
  const origin = 5 * cols + 7;
  const e = createEndEffect({ kind: LOSS, cols, rows, origin, duration: END_DELAY_MS });
  const c = origin + 4;
  const reach = reachMs(e, c);
  assert.equal(waveAt(e, c, CELL.MINE, reach - 1, END2D), null, 'nothing before the wave reaches it');
  const first = waveAt(e, c, CELL.MINE, reach, END2D);
  assert.ok(Math.abs(first.scale - END2D.loss.scale) < 1e-9, `it arrives at the module's scale (${first.scale})`);
  assert.ok(Math.abs(first.flash - END2D.loss.flash) < 1e-9, `under the module's flash (${first.flash})`);
  let peak = 0;
  let lastFlash = first.flash;
  for (let t = reach; t < reach + LOSS_SNAP_MS; t += 5) {
    const w = waveAt(e, c, CELL.MINE, t, END2D);
    peak = Math.max(peak, w.scale);
    assert.ok(w.flash <= lastFlash + 1e-9, 'the flash only fades');
    lastFlash = w.flash;
  }
  assert.ok(peak > 1, `it overshoots its size before settling (${peak.toFixed(3)})`);
  assert.equal(waveAt(e, c, CELL.MINE, reach + LOSS_SNAP_MS, END2D), null, 'settled LOSS_SNAP_MS after the wave reaches it');
  assert.ok(waveAt(e, c, CELL.WRONG_FLAG, reach + 10, END2D), 'a wrong flag snaps too');
  assert.equal(waveAt(e, c, CELL.REVEALED, reach + 10, END2D), null, 'a tile the loss did not change stays still');
  for (const [name, [w, h]] of Object.entries(BOARDS)) {
    const big = createEndEffect({ kind: LOSS, cols: w, rows: h, origin: 0, duration: END_DELAY_MS });
    assert.ok(reachMs(big, w * h - 1) + LOSS_SNAP_MS < END_DELAY_MS, `${name}: the farthest tile has settled before the delay ends`);
  }
});

test('a win effect without a known origin starts at the board\'s centre', () => {
  const e = createEndEffect({ kind: WIN, cols: 9, rows: 9, origin: -1, duration: END_DELAY_MS });
  assert.equal(e.origin, 4 * 9 + 4);
});

test('the confetti falls over the board\'s own rectangle, never outside it, and is gone at the end of the delay', () => {
  for (const [cols, rows, tile] of [[9, 9, 48], [30, 16, 32], [100, 100, 26], [2, 1, 48]]) {
    const width = cols * tile;
    const height = rows * tile;
    for (const origin of [0, cols * rows - 1, Math.floor(cols * rows / 2)]) {
      const e = createEndEffect({ kind: WIN, cols, rows, origin, duration: END_DELAY_MS, random: seeded(origin + 3) });
      let shown = 0;
      for (let t = 0; t < END_DELAY_MS; t += 25) {
        const pieces = confettiAt(e, t, { width, height, tile });
        shown += pieces.length;
        for (const p of pieces) {
          assert.ok(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height, `${cols}×${rows}: a piece at ${p.x}, ${p.y} is inside ${width} × ${height}`);
          assert.ok(p.size > 0 && p.alpha > 0 && p.alpha <= 1);
          assert.ok(Number.isInteger(p.color) && p.color >= 0, 'a colour index into the module\'s confetti colours');
        }
      }
      assert.ok(shown > 0, `${cols}×${rows}: confetti shows during the delay`);
      assert.deepEqual(confettiAt(e, END_DELAY_MS, { width, height, tile }), []);
    }
  }
});

test('the effect reports itself done at the end of the delay', () => {
  for (const kind of [WIN, LOSS]) {
    const e = createEndEffect({ kind, cols: 9, rows: 9, origin: 40, duration: END_DELAY_MS });
    assert.equal(done(e, 0), false);
    assert.equal(done(e, END_DELAY_MS - 1), false);
    assert.equal(done(e, END_DELAY_MS), true);
  }
  assert.throws(() => createEndEffect({ kind: 'draw', cols: 9, rows: 9, origin: 0, duration: 1000 }), RangeError);
});

test('a tile\'s wave is drawn about its centre, its light clipped to the rounded tile, never a square over its corners and the ground', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : (...args) => calls.push([prop, args, target.fillStyle, target.globalAlpha])),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  let painted = 0;
  drawWave(ctx, 10, 20, 40, { scale: 1.2, flash: 0.4 }, JOYFUL, () => { painted++; calls.push(['paint']); });
  assert.equal(painted, 1, 'the tile is painted once');
  const ops = calls.map((c) => c[0]);
  assert.ok(ops.indexOf('scale') < ops.indexOf('paint'), 'scaled before it is painted');
  assert.deepEqual(calls.find((c) => c[0] === 'scale')[1], [1.2, 1.2]);
  assert.deepEqual(calls.find((c) => c[0] === 'translate')[1], [30, 40], 'about the tile\'s centre');
  assert.ok(!ops.includes('fillRect'), 'no square');
  const corners = calls.filter((c) => c[0] === 'arcTo');
  assert.ok(corners.length === 4 && corners.every((c) => Math.abs(c[1][4] - 40 * JOYFUL.style2d.params.radius) < 1e-9), 'the light follows the tile\'s rounded corners');
  const fill = calls.find((c) => c[0] === 'fill');
  assert.equal(fill[2], JOYFUL.end2d.light, 'in the module\'s light');
  assert.equal(fill[3], 0.4, 'at the wave\'s share');
  assert.ok(ops.indexOf('paint') < ops.indexOf('fill'), 'over the tile');
  assert.equal(ops[0], 'save');
  assert.equal(ops.at(-1), 'restore');
  calls.length = 0;
  painted = 0;
  drawWave(ctx, 10, 20, 40, null, JOYFUL, () => { painted++; });
  assert.equal(painted, 1, 'no wave: the tile alone');
  assert.ok(!calls.some((c) => c[0] === 'scale' || c[0] === 'fill'), 'unscaled and unlit');
});

test('a hexagon or triangle tile\'s wave is drawn about its outline\'s centre, its light filled in the outline at its radius, never its box', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : (...args) => calls.push([prop, args, target.fillStyle, target.globalAlpha])),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  const points = [[20, 20], [60, 20], [40, 54.64]]; // a triangle pointing down, in canvas pixels
  const outline = { points, centre: [40, 31.55], radius: 2 };
  drawWave(ctx, 20, 20, 40, { scale: 1.2, flash: 0.4 }, JOYFUL, () => calls.push(['paint']), outline);
  const ops = calls.map((c) => c[0]);
  assert.deepEqual(calls.find((c) => c[0] === 'translate')[1], [40, 31.55], 'scaled about the outline\'s centre');
  assert.deepEqual(calls.find((c) => c[0] === 'scale')[1], [1.2, 1.2]);
  assert.ok(ops.indexOf('paint') < ops.indexOf('fill'), 'the light over the tile');
  const corners = calls.filter((c) => c[0] === 'arcTo');
  assert.equal(corners.length, 3, 'one rounded corner per corner of the outline, none of a box');
  assert.deepEqual(corners.map((c) => [c[1][0], c[1][1]]), points, 'round the outline\'s corners');
  assert.ok(corners.every((c) => c[1][4] <= 2), 'at the outline\'s radius');
  const fill = calls.find((c) => c[0] === 'fill');
  assert.deepEqual([fill[2], fill[3]], [JOYFUL.end2d.light, 0.4], 'in the module\'s light at the wave\'s share');
  assert.ok(!ops.includes('fillRect'));
});

test('the confetti is drawn in the colours it is handed: the board module\'s', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : (...args) => calls.push([prop, args, target.fillStyle, target.globalAlpha])),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  drawConfetti(ctx, [{ x: 5, y: 6, size: 8, angle: 0, color: 8, alpha: 0.5 }], ['#111111', '#222222'], 100, 200);
  assert.deepEqual(calls.find((c) => c[0] === 'translate')[1], [105, 206], 'from the board\'s corner');
  assert.equal(calls.find((c) => c[0] === 'fillRect')[2], '#111111');
  const e = createEndEffect({ kind: WIN, cols: 9, rows: 9, origin: 40, duration: END_DELAY_MS, random: seeded() });
  const pieces = confettiAt(e, 200, { width: 9 * 32, height: 9 * 32, tile: 32 });
  calls.length = 0;
  drawConfetti(ctx, pieces, JOYFUL.palette.confetti, 0, 0);
  const used = new Set(calls.filter((c) => c[0] === 'fillRect').map((c) => c[2]));
  assert.ok(used.size > 1 && [...used].every((c) => JOYFUL.palette.confetti.includes(c)), 'Joyful tiles\' confetti colours');
});

// ---------- the grid geometry ----------

// A two-cell-wide geometry whose cell centres are not on a square lattice: cell c sits at
// (c % 2 + (row odd ? 0.5 : 0), row × 0.75), as a column of offset rows would.
function offsetGeometry(width = 2, height = 6) {
  const count = width * height;
  const centre = (c, tile = 1) => {
    const col = c % width;
    const row = (c - col) / width;
    return { x: (col + 0.5 + (row % 2 ? 0.5 : 0)) * tile, y: (row * 0.75 + 0.5) * tile };
  };
  return {
    kind: 'offset', width, height, count,
    centre: (c, tile = 1) => (Number.isInteger(c) && c >= 0 && c < count ? centre(c, tile) : null),
    extent: (tile) => ({ width: (width + 0.5) * tile, height: ((height - 1) * 0.75 + 1) * tile }),
    cellAt: (x, y) => {
      let best = -1;
      let bestD = Infinity;
      for (let c = 0; c < count; c++) {
        const p = centre(c);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { best = c; bestD = d; }
      }
      return best;
    },
  };
}

test('on the square geometry every reach time and confetti piece equals the cols × rows effect\'s', () => {
  for (const [cols, rows] of Object.values(BOARDS)) {
    const geometry = createGeometry('square', cols, rows);
    for (const origin of [...corners(cols, rows), cols + 1, -1]) {
      for (const kind of [WIN, LOSS]) {
        const plain = createEndEffect({ kind, cols, rows, origin, duration: END_DELAY_MS, random: seeded(7) });
        const on = createEndEffect({ kind, geometry, origin, duration: END_DELAY_MS, random: seeded(7) });
        assert.equal(on.origin, plain.origin);
        // Today's reach: the column and row distance from the origin, the farthest tile at WAVE_SHARE of the delay at most.
        const oc = plain.origin % cols;
        const or = (plain.origin - oc) / cols;
        const far = Math.hypot(Math.max(oc, cols - 1 - oc), Math.max(or, rows - 1 - or));
        const step = Math.min(WAVE_STEP_MS, (END_DELAY_MS * WAVE_SHARE) / far);
        for (let c = 0; c < cols * rows; c++) {
          const today = Math.hypot((c % cols) - oc, Math.floor(c / cols) - or) * step;
          assert.equal(reachMs(on, c), today, `${cols}×${rows} from ${origin}: cell ${c}`);
          assert.equal(reachMs(plain, c), today);
        }
        if (kind === WIN) {
          for (const p of confettiAt(on, 0, { width: cols * 32, height: rows * 32, tile: 32 })) {
            assert.deepEqual([p.x, p.y], [(oc + 0.5) * 32, (or + 0.5) * 32], 'the burst from the origin tile as today');
          }
        }
        for (const tile of [26, 32, 48]) {
          const area = { width: cols * tile, height: rows * tile, tile };
          for (let t = 0; t < END_DELAY_MS; t += 50) assert.deepEqual(confettiAt(on, t, area), confettiAt(plain, t, area));
        }
      }
    }
  }
});

test('the waves travel by the distance between the geometry\'s cell centres', () => {
  const geometry = offsetGeometry();
  const e = createEndEffect({ kind: LOSS, geometry, origin: 0, duration: END_DELAY_MS });
  const dist = (c) => Math.hypot(geometry.centre(c).x - geometry.centre(0).x, geometry.centre(c).y - geometry.centre(0).y);
  assert.equal(reachMs(e, 0), 0);
  let far = 0;
  for (let c = 1; c < geometry.count; c++) {
    assert.ok(Math.abs(reachMs(e, c) / dist(c) - reachMs(e, 1) / dist(1)) < 1e-9, `cell ${c}: proportional to its centre's distance`);
    far = Math.max(far, reachMs(e, c));
  }
  assert.ok(far > 0 && far < END_DELAY_MS, 'the farthest centre is reached within the delay');
  assert.ok(Math.abs(reachMs(e, 2) - reachMs(e, 1) * dist(2) / dist(1)) < 1e-9, 'the offset row\'s cell is reached by its centre, not its column');
  const middle = createEndEffect({ kind: WIN, geometry, origin: -1, duration: END_DELAY_MS });
  const ext = geometry.extent(1);
  assert.equal(middle.origin, geometry.cellAt(ext.width / 2, ext.height / 2), 'no origin: the cell at the middle of the extent');
});

test('the confetti bursts from the origin\'s centre and covers the geometry\'s extent', () => {
  const geometry = offsetGeometry();
  const tile = 40;
  const origin = 7;
  const e = createEndEffect({ kind: WIN, geometry, origin, duration: END_DELAY_MS, random: () => 0.5 });
  const { width, height } = geometry.extent(tile);
  const first = confettiAt(e, 0, { tile });
  assert.ok(first.length > 0);
  const centre = geometry.centre(origin, tile);
  for (const p of first) assert.ok(Math.abs(p.y - centre.y) < 1e-9 && Math.abs(p.x - centre.x) <= tile * 0.3, 'bursting from the origin\'s centre');
  for (let t = 0; t < END_DELAY_MS; t += 25) {
    const without = confettiAt(e, t, { tile });
    assert.deepEqual(without, confettiAt(e, t, { width, height, tile }), 'with no rectangle given, the geometry\'s extent');
    for (const p of without) assert.ok(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  }
});

test('the module is DOM-free and holds no literal colour', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/end-effect.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|requestAnimationFrame|performance)\b/);
  assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.doesNotMatch(src, /from ['"][^'"]*(three|tokens)/);
  assert.doesNotMatch(src, /--color-/, 'it reads no design token: every colour and value is the board module\'s');
});
