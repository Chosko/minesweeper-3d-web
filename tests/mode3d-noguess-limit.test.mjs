import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate, ATTEMPT_BUDGET } from '../js/generation/generate.js';
import { NOGUESS_CELL_LIMIT, PRESETS } from '../js/mode3d/board-choice.js';

// The limit is the measured 20 × 20 × 20 board (dev/measure-noguess-3d.mjs): the largest custom
// board whose slowest no-guess request at the presets' densities stays a short wait.
const AT_LIMIT = [20, 20, 20];

test('the no-guess limit is the measured 20 × 20 × 20 board', () => {
  assert.equal(NOGUESS_CELL_LIMIT, AT_LIMIT[0] * AT_LIMIT[1] * AT_LIMIT[2]);
});

test('a board at the limit generates no-guess within the attempt budget at the presets\' densities', () => {
  const [X, Y, Z] = AT_LIMIT;
  const cells = X * Y * Z;
  const densest = Math.max(...PRESETS.map((p) => p.mines / (p.X * p.Y * p.Z)));
  for (const density of [0.025, densest]) {
    const mineCount = Math.round(cells * density);
    for (const seed of [1, 2, 3]) {
      const r = generate({ graph: { kind: 'box', X, Y, Z }, mineCount, firstClick: seed % cells, noGuess: true, seed });
      assert.equal(r.ok, true, `${X}x${Y}x${Z}, ${mineCount} mines, seed ${seed}: ${r.reason}`);
      assert.ok(r.candidates <= ATTEMPT_BUDGET, `seed ${seed}: ${r.candidates} candidates`);
    }
  }
});
