import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOARD_KEY_FORMAT,
  STANDARD_BOARDS,
  createBoardIdentity,
  boardKey,
  boardLabel,
  standardBoard,
} from '../js/records/board.js';

const square = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });

// ---------- identity ----------

test('identity: built from its six fields, frozen, nothing else on it', () => {
  const id = square(30, 16, 99, true);
  assert.deepEqual({ ...id }, {
    mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99, noGuess: true,
  });
  assert.ok(Object.isFrozen(id));
});

test('identity: impossible values throw a range error', () => {
  const ok = { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false };
  const bad = [
    { width: 0 }, { width: -1 }, { width: 2.5 }, { width: '9' }, { height: 0 }, { height: NaN },
    { mines: -1 }, { mines: 1.5 }, { mines: 81 }, { mines: 100 }, { mines: undefined },
    { noGuess: 'yes' }, { noGuess: undefined },
    { mode: '' }, { mode: 'Classic 2D' }, { mode: 'a:b' }, { mode: undefined },
    { grid: '' }, { grid: 'sq/uare' }, { grid: 3 },
  ];
  for (const change of bad) {
    assert.throws(() => createBoardIdentity({ ...ok, ...change }), RangeError, JSON.stringify(change));
  }
  assert.throws(() => createBoardIdentity(null), RangeError);
  assert.doesNotThrow(() => createBoardIdentity({ ...ok, mines: 80 }));
  assert.doesNotThrow(() => createBoardIdentity({ ...ok, width: 1, height: 1, mines: 0 }));
});

test('identity: the standard boards are Beginner, Intermediate and Expert on the square grid', () => {
  assert.deepEqual(STANDARD_BOARDS.map((b) => [b.name, b.width, b.height, b.mines]), [
    ['Beginner', 9, 9, 10],
    ['Intermediate', 16, 16, 40],
    ['Expert', 30, 16, 99],
  ]);
  assert.ok(Object.isFrozen(STANDARD_BOARDS));
});

// ---------- key ----------

test('key: pinned for the three standard boards with and without no-guess', () => {
  assert.equal(BOARD_KEY_FORMAT, 1);
  assert.equal(boardKey(square(9, 9, 10)), 'classic-2d:square:9x9:10:guess');
  assert.equal(boardKey(square(9, 9, 10, true)), 'classic-2d:square:9x9:10:no-guess');
  assert.equal(boardKey(square(16, 16, 40)), 'classic-2d:square:16x16:40:guess');
  assert.equal(boardKey(square(16, 16, 40, true)), 'classic-2d:square:16x16:40:no-guess');
  assert.equal(boardKey(square(30, 16, 99)), 'classic-2d:square:30x16:99:guess');
  assert.equal(boardKey(square(30, 16, 99, true)), 'classic-2d:square:30x16:99:no-guess');
});

test('key: pinned for custom boards', () => {
  assert.equal(boardKey(square(20, 12, 50)), 'classic-2d:square:20x12:50:guess');
  assert.equal(boardKey(square(12, 20, 50, true)), 'classic-2d:square:12x20:50:no-guess');
  assert.equal(boardKey(square(16, 30, 99)), 'classic-2d:square:16x30:99:guess');
  assert.equal(boardKey(square(1, 1, 0)), 'classic-2d:square:1x1:0:guess');
});

test('key: the same fields give the same key, whatever object carries them', () => {
  const plain = { noGuess: true, mines: 99, height: 16, width: 30, grid: 'square', mode: 'classic-2d' };
  assert.equal(boardKey(plain), boardKey(square(30, 16, 99, true)));
  assert.equal(boardKey(JSON.parse(JSON.stringify(square(30, 16, 99, true)))), boardKey(plain));
  assert.equal(boardKey({ ...plain, extra: 'ignored' }), boardKey(plain));
});

test('key: every field takes part, so distinct boards get distinct keys', () => {
  const base = { mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99, noGuess: false };
  const variants = [
    base,
    { ...base, mode: '3d' },
    { ...base, grid: 'hex' },
    { ...base, width: 16, height: 30 },
    { ...base, mines: 98 },
    { ...base, noGuess: true },
  ];
  assert.equal(new Set(variants.map(boardKey)).size, variants.length);
});

test('key: an impossible identity throws a range error rather than giving a key', () => {
  assert.throws(() => boardKey({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 81, noGuess: false }), RangeError);
});

// ---------- label ----------

test('label: the three standard boards with and without no-guess', () => {
  assert.equal(boardLabel(square(9, 9, 10)), 'Beginner');
  assert.equal(boardLabel(square(9, 9, 10, true)), 'Beginner · no-guess');
  assert.equal(boardLabel(square(16, 16, 40)), 'Intermediate');
  assert.equal(boardLabel(square(16, 16, 40, true)), 'Intermediate · no-guess');
  assert.equal(boardLabel(square(30, 16, 99)), 'Expert');
  assert.equal(boardLabel(square(30, 16, 99, true)), 'Expert · no-guess');
});

test('label: custom boards by size and mine count', () => {
  assert.equal(boardLabel(square(20, 12, 50)), '20 × 12 · 50 mines');
  assert.equal(boardLabel(square(20, 12, 50, true)), '20 × 12 · 50 mines · no-guess');
  assert.equal(boardLabel(square(2, 1, 1)), '2 × 1 · 1 mine');
  assert.equal(boardLabel(square(1, 1, 0)), '1 × 1 · 0 mines');
  // A standard size with another mine count, or transposed, is a custom board.
  assert.equal(boardLabel(square(30, 16, 100)), '30 × 16 · 100 mines');
  assert.equal(boardLabel(square(16, 30, 99)), '16 × 30 · 99 mines');
  assert.equal(boardLabel(square(9, 9, 11)), '9 × 9 · 11 mines');
});

test('label: a custom board matching a standard board is that standard board', () => {
  // Chosen as Custom with Expert's exact size and mines: same key, same label.
  const custom = { mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99, noGuess: true };
  assert.equal(boardLabel(custom), 'Expert · no-guess');
  assert.equal(boardKey(custom), boardKey(square(30, 16, 99, true)));
  assert.equal(standardBoard(custom).name, 'Expert');
  assert.equal(standardBoard(square(30, 16, 98)), null);
});

test('label: standard sizes are recognised only on the square grid', () => {
  const hex = createBoardIdentity({ mode: 'classic-2d', grid: 'hex', width: 30, height: 16, mines: 99, noGuess: false });
  assert.equal(standardBoard(hex), null);
  assert.equal(boardLabel(hex), '30 × 16 · 99 mines');
});

// ---------- module ----------

test('module: DOM-free and documents its key format', () => {
  const src = readFileSync(new URL('../js/records/board.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|navigator|localStorage)\b/);
  assert.doesNotMatch(src, /^import /m);
  assert.match(src, /classic-2d:square:30x16:99:no-guess/);
  assert.match(src, /BOARD_KEY_FORMAT/);
});
