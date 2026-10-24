// Triangle board setup (js/triangle/board-setup.js): the mode and grid of a triangle board, its
// standard boards — equal to the records' STANDARD_BOARDS_TRI — and its custom limits, Classic 2D's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODE, GRID, BOARD_SIZES, STANDARD_SIZES, maxMines, validateCustom } from '../js/triangle/board-setup.js';
import * as classic2d from '../js/classic2d/board-setup.js';
import { STANDARD_BOARDS_TRI, createBoardIdentity, standardBoard } from '../js/records/board.js';

test('triangle board setup: a triangle board is mode triangle on the tri grid', () => {
  assert.equal(MODE, 'triangle');
  assert.equal(GRID, 'tri');
  assert.deepEqual(BOARD_SIZES, ['beginner', 'intermediate', 'expert', 'custom']);
});

test('triangle board setup: the standard boards as drawn on the Triangle board sheet', () => {
  assert.deepEqual(STANDARD_SIZES, {
    beginner: { width: 13, height: 7, mines: 8 },
    intermediate: { width: 25, height: 13, mines: 36 },
    expert: { width: 41, height: 17, mines: 103 },
  });
  assert.ok(Object.isFrozen(STANDARD_SIZES));
  assert.ok(Object.values(STANDARD_SIZES).every(Object.isFrozen));
});

test('triangle board setup: the standard boards equal the records\' triangle standard boards, which recognise them', () => {
  assert.deepEqual(
    Object.entries(STANDARD_SIZES).map(([size, b]) => [size, b.width, b.height, b.mines]),
    STANDARD_BOARDS_TRI.map((b) => [b.name.toLowerCase(), b.width, b.height, b.mines]),
  );
  for (const [size, b] of Object.entries(STANDARD_SIZES)) {
    const id = createBoardIdentity({ mode: MODE, grid: GRID, ...b, noGuess: false });
    assert.equal(standardBoard(id).name.toLowerCase(), size);
  }
});

test('triangle board setup: custom sides run from 1 to 100, refused in Classic 2D\'s shape', () => {
  for (const [custom, field] of [
    [{ width: 0, height: 7, mines: 8 }, 'width'], [{ width: 101, height: 7, mines: 8 }, 'width'],
    [{ width: 2.5, height: 7, mines: 8 }, 'width'], [{ width: 13, height: 0, mines: 8 }, 'height'],
    [{ width: 13, height: 101, mines: 8 }, 'height'], [{ width: 13, height: '7', mines: 8 }, 'height'],
  ]) {
    const v = validateCustom(custom);
    assert.equal(v.ok, false, JSON.stringify(custom));
    assert.equal(v.field, field);
    assert.deepEqual(v, classic2d.validateCustom(custom), 'the same field and reason as Classic 2D');
  }
  assert.deepEqual(validateCustom({ width: 100, height: 100, mines: 1 }), { ok: true });
  assert.deepEqual(validateCustom({ width: 1, height: 2, mines: 1 }), { ok: true });
});

test('triangle board setup: mines run from 1 to Classic 2D\'s cap for the cell count, at most cells − 1', () => {
  for (const [w, h] of [[1, 2], [6, 6], [13, 7], [25, 13], [41, 17], [50, 40], [100, 100]]) {
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

test('triangle board setup: a 1 × 1 board is refused on the mines field', () => {
  const v = validateCustom({ width: 1, height: 1, mines: 1 });
  assert.equal(v.ok, false);
  assert.equal(v.field, 'mines');
  assert.match(v.reason, /no room for a mine/);
});

test('triangle board setup: no-guess is never refused up front, however dense the board', () => {
  const dense = { width: 13, height: 7, mines: maxMines(13, 7), noGuess: true };
  assert.deepEqual(validateCustom(dense), { ok: true });
  assert.deepEqual(validateCustom({ ...STANDARD_SIZES.expert, noGuess: true }), { ok: true });
});

test('triangle board setup: DOM-free', () => {
  const src = readFileSync(new URL('../js/triangle/board-setup.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|navigator|localStorage)\b/);
});
