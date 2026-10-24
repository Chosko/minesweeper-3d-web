// Hexagon board setup (js/hexagon/board-setup.js): the mode and grid of a hexagon board, its
// standard boards — equal to the records' STANDARD_BOARDS_HEX — and its custom limits, Classic 2D's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODE, GRID, BOARD_SIZES, STANDARD_SIZES, maxMines, validateCustom } from '../js/hexagon/board-setup.js';
import * as classic2d from '../js/classic2d/board-setup.js';
import { STANDARD_BOARDS_HEX, createBoardIdentity, standardBoard } from '../js/records/board.js';

test('hexagon board setup: a hexagon board is mode hexagon on the hex grid', () => {
  assert.equal(MODE, 'hexagon');
  assert.equal(GRID, 'hex');
  assert.deepEqual(BOARD_SIZES, ['beginner', 'intermediate', 'expert', 'custom']);
});

test('hexagon board setup: the standard boards as drawn on the Hexagon board sheet', () => {
  assert.deepEqual(STANDARD_SIZES, {
    beginner: { width: 9, height: 9, mines: 13 },
    intermediate: { width: 16, height: 16, mines: 50 },
    expert: { width: 30, height: 16, mines: 100 },
  });
  assert.ok(Object.isFrozen(STANDARD_SIZES));
  assert.ok(Object.values(STANDARD_SIZES).every(Object.isFrozen));
});

test('hexagon board setup: the standard boards equal the records\' hexagon standard boards, which recognise them', () => {
  assert.deepEqual(
    Object.entries(STANDARD_SIZES).map(([size, b]) => [size, b.width, b.height, b.mines]),
    STANDARD_BOARDS_HEX.map((b) => [b.name.toLowerCase(), b.width, b.height, b.mines]),
  );
  for (const [size, b] of Object.entries(STANDARD_SIZES)) {
    const id = createBoardIdentity({ mode: MODE, grid: GRID, ...b, noGuess: false });
    assert.equal(standardBoard(id).name.toLowerCase(), size);
  }
});

test('hexagon board setup: custom sides run from 1 to 100, refused in Classic 2D\'s shape', () => {
  for (const [custom, field] of [
    [{ width: 0, height: 9, mines: 10 }, 'width'], [{ width: 101, height: 9, mines: 10 }, 'width'],
    [{ width: 2.5, height: 9, mines: 10 }, 'width'], [{ width: 9, height: 0, mines: 10 }, 'height'],
    [{ width: 9, height: 101, mines: 10 }, 'height'], [{ width: 9, height: '9', mines: 10 }, 'height'],
  ]) {
    const v = validateCustom(custom);
    assert.equal(v.ok, false, JSON.stringify(custom));
    assert.equal(v.field, field);
    assert.deepEqual(v, classic2d.validateCustom(custom), 'the same field and reason as Classic 2D');
  }
  assert.deepEqual(validateCustom({ width: 100, height: 100, mines: 1 }), { ok: true });
  assert.deepEqual(validateCustom({ width: 1, height: 2, mines: 1 }), { ok: true });
});

test('hexagon board setup: mines run from 1 to Classic 2D\'s cap for the cell count, at most cells − 1', () => {
  for (const [w, h] of [[1, 2], [6, 6], [9, 9], [16, 16], [30, 16], [50, 40], [100, 100]]) {
    const max = maxMines(w, h);
    assert.equal(max, classic2d.maxMines(w, h), `${w} × ${h}`);
    assert.ok(max <= w * h - 1);
    assert.deepEqual(validateCustom({ width: w, height: h, mines: max }), { ok: true }, `${w} × ${h}`);
    assert.deepEqual(validateCustom({ width: w, height: h, mines: 1 }), { ok: true });
    for (const mines of [0, max + 1, 1.5, undefined]) {
      const v = validateCustom({ width: w, height: h, mines });
      assert.equal(v.ok, false, `${w} × ${h} · ${mines}`);
      assert.equal(v.field, 'mines');
      assert.deepEqual(v, classic2d.validateCustom({ width: w, height: h, mines }));
    }
  }
});

test('hexagon board setup: a 1 × 1 board is refused on the mines field', () => {
  const v = validateCustom({ width: 1, height: 1, mines: 1 });
  assert.equal(v.ok, false);
  assert.equal(v.field, 'mines');
  assert.match(v.reason, /no room for a mine/);
});

test('hexagon board setup: no-guess is never refused up front, however dense the board', () => {
  const dense = { width: 9, height: 9, mines: maxMines(9, 9), noGuess: true };
  assert.deepEqual(validateCustom(dense), { ok: true });
  assert.deepEqual(validateCustom({ ...STANDARD_SIZES.expert, noGuess: true }), { ok: true });
});

test('hexagon board setup: DOM-free', () => {
  const src = readFileSync(new URL('../js/hexagon/board-setup.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|navigator|localStorage)\b/);
});
