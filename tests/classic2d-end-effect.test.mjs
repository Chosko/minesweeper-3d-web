// Classic 2D end effect (js/classic2d/end-effect.js): the 3D win and loss effects at board scale —
// the loss wave's per-tile reach time from the exploded tile, scaled so the farthest tile is reached
// within the 2D end delay on Beginner, Expert and a 100 × 100 board, the pre-loss tiles shown until
// it arrives, the win pulse's origin, the confetti bounded to the board's rectangle, and the effect
// done at the end of the delay. DOM-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createEndEffect, reachMs, preLossState, wonState, shownState, pulseAlpha, confettiAt, done, drawPulse, drawConfetti,
  WIN, LOSS, WAVE_STEP_MS, CONFETTI_COLORS, PULSE_COLOR,
} from '../js/classic2d/end-effect.js';
import { END_DELAY_MS } from '../js/classic2d/mode.js';
import { END_DELAY_MS as END_DELAY_3D_MS } from '../js/shell/mode-3d.js';
import { CELL } from '../js/engine/rules.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

test('the win pulse starts at the last action\'s cell and spreads from it', () => {
  const [cols, rows] = BOARDS.expert;
  const origin = 8 * cols + 20;
  const e = createEndEffect({ kind: WIN, cols, rows, origin, duration: END_DELAY_MS, random: seeded() });
  assert.equal(e.origin, origin);
  assert.equal(pulseAlpha(e, origin, 0), 0, 'nothing before the wave has left');
  const strongest = (c) => {
    let best = { t: -1, a: 0 };
    for (let t = 0; t < END_DELAY_MS; t += 5) { const a = pulseAlpha(e, c, t); if (a > best.a) best = { t, a }; }
    return best;
  };
  const here = strongest(origin);
  const near = strongest(origin + 3);
  const far = strongest(0);
  assert.ok(here.a > 0 && near.a > 0 && far.a > 0, 'every tile brightens');
  assert.ok(here.t < near.t && near.t < far.t, `the pulse passes the origin first (${here.t}, ${near.t}, ${far.t} ms)`);
  assert.ok(far.t < END_DELAY_MS, 'and reaches the farthest tile within the delay');
  assert.equal(pulseAlpha(e, 0, END_DELAY_MS), 0, 'gone at the end of the delay');
  const loss = createEndEffect({ kind: LOSS, cols, rows, origin, duration: END_DELAY_MS });
  assert.equal(pulseAlpha(loss, origin, here.t), 0, 'a loss has no pulse');
  assert.deepEqual(confettiAt(loss, 300, { width: 900, height: 480, tile: 30 }), [], 'nor confetti');
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
          assert.ok(p.color >= 0 && p.color < CONFETTI_COLORS.length);
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

test('drawing reads the colours it is handed: the pulse and the confetti take design tokens', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : (...args) => calls.push([prop, args, target.fillStyle, target.globalAlpha])),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
  drawPulse(ctx, 10, 20, 30, 0.4, '#abcdef');
  assert.deepEqual(calls.find((c) => c[0] === 'fillRect'), ['fillRect', [10, 20, 30, 30], '#abcdef', 0.4]);
  calls.length = 0;
  drawPulse(ctx, 0, 0, 30, 0, '#abcdef');
  assert.equal(calls.length, 0, 'no pulse, nothing drawn');
  drawConfetti(ctx, [{ x: 5, y: 6, size: 8, angle: 0, color: 8, alpha: 0.5 }], ['#111111', '#222222'], 100, 200);
  assert.deepEqual(calls.find((c) => c[0] === 'translate')[1], [105, 206], 'from the board\'s corner');
  assert.equal(calls.find((c) => c[0] === 'fillRect')[2], '#111111');
  assert.equal(PULSE_COLOR.startsWith('--color-'), true);
  assert.equal(CONFETTI_COLORS.every((t) => /^--color-number-\d$/.test(t)), true, 'the number tokens, themed');
});

test('the module is DOM-free and holds no literal colour', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/end-effect.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|requestAnimationFrame|performance)\b/);
  assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.doesNotMatch(src, /from ['"][^'"]*(three|tokens)/);
});
