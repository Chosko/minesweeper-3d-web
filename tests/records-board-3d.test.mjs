import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODE_3D,
  PRESETS_3D,
  createBoardIdentity,
  boardKey,
  boardLabel,
  preset3D,
  standardBoard,
  parseBoardKey,
} from '../js/records/board.js';
import { PRESETS, FAMILIES, DIM_MAX } from '../js/mode3d/board-choice.js';

const box = (width, height, depth, mines, noGuess = false) =>
  createBoardIdentity({ mode: '3d', width, height, depth, mines, noGuess });

const square = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });

// ---------- identity ----------

test('3D identity: mode 3d, width, height, depth, mines and noGuess, no grid, frozen', () => {
  assert.equal(MODE_3D, '3d');
  const id = box(12, 12, 8, 130, true);
  assert.deepEqual({ ...id }, { mode: '3d', width: 12, height: 12, depth: 8, mines: 130, noGuess: true });
  assert.ok(!('grid' in id));
  assert.ok(Object.isFrozen(id));
});

test('3D identity: each dimension 1 to 100 and mines 1 to cells minus one, else a range error', () => {
  const ok = { mode: '3d', width: 10, height: 10, depth: 10, mines: 80, noGuess: false };
  const bad = [
    { width: 0 }, { width: 101 }, { width: 2.5 }, { width: '10' },
    { height: 0 }, { height: 101 }, { height: NaN },
    { depth: 0 }, { depth: 101 }, { depth: undefined }, { depth: '10' },
    { mines: 0 }, { mines: -1 }, { mines: 1.5 }, { mines: 1000 }, { mines: undefined },
    { noGuess: 'yes' }, { noGuess: undefined },
    { grid: 'square' }, { grid: 'box' },
    { width: 1, height: 1, depth: 1, mines: 1 },
  ];
  for (const change of bad) {
    assert.throws(() => createBoardIdentity({ ...ok, ...change }), RangeError, JSON.stringify(change));
  }
  assert.doesNotThrow(() => createBoardIdentity({ ...ok, mines: 999 }));
  assert.doesNotThrow(() => createBoardIdentity({ ...ok, mines: 1 }));
  assert.doesNotThrow(() => createBoardIdentity({ ...ok, width: 1, height: 1, depth: 2, mines: 1 }));
  assert.doesNotThrow(() => createBoardIdentity({ ...ok, width: DIM_MAX, height: DIM_MAX, depth: DIM_MAX, mines: 1 }));
});

test('3D identity: a 2D identity is unchanged — it keeps its grid and has no depth', () => {
  const id = square(30, 16, 99, true);
  assert.deepEqual({ ...id }, { mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99, noGuess: true });
});

// ---------- presets ----------

test('3D presets: the six presets, the same sizes and mines as the 3D board choice', () => {
  assert.ok(Object.isFrozen(PRESETS_3D));
  const family = (id) => FAMILIES.find((f) => f.id === id).label;
  assert.deepEqual(
    PRESETS_3D.map((p) => [p.family, p.name, p.width, p.height, p.depth, p.mines]),
    PRESETS.map((p) => [family(p.family), p.name, p.X, p.Y, p.Z, p.mines]),
  );
  assert.deepEqual(PRESETS_3D.map((p) => [p.width, p.height, p.depth, p.mines]), [
    [8, 8, 2, 10], [14, 14, 2, 60], [25, 16, 2, 130],
    [6, 6, 6, 10], [8, 8, 8, 40], [12, 12, 8, 130],
  ]);
});

test('3D presets: recognised from the exact size and mine count, never for a 2D board', () => {
  assert.equal(preset3D(box(8, 8, 2, 10)).name, 'Beginner');
  assert.equal(preset3D(box(12, 12, 8, 130, true)).family, 'Cube');
  assert.equal(preset3D(box(8, 8, 2, 11)), null);
  assert.equal(preset3D(box(8, 2, 8, 10)), null);
  assert.equal(preset3D(box(10, 10, 10, 80)), null);
  assert.equal(preset3D(square(9, 9, 10)), null);
  assert.equal(standardBoard(box(8, 8, 2, 10)), null);
});

// ---------- key ----------

const PRESET_KEYS = [
  [[8, 8, 2, 10], '3d:8x8x2:10'],
  [[14, 14, 2, 60], '3d:14x14x2:60'],
  [[25, 16, 2, 130], '3d:25x16x2:130'],
  [[6, 6, 6, 10], '3d:6x6x6:10'],
  [[8, 8, 8, 40], '3d:8x8x8:40'],
  [[12, 12, 8, 130], '3d:12x12x8:130'],
];

test('3D key: pinned for the six presets with and without no-guess', () => {
  for (const [[w, h, d, m], key] of PRESET_KEYS) {
    assert.equal(boardKey(box(w, h, d, m)), `${key}:guess`);
    assert.equal(boardKey(box(w, h, d, m, true)), `${key}:no-guess`);
  }
});

test('3D key: pinned for custom boards', () => {
  assert.equal(boardKey(box(10, 10, 10, 80)), '3d:10x10x10:80:guess');
  assert.equal(boardKey(box(10, 10, 10, 25, true)), '3d:10x10x10:25:no-guess');
  assert.equal(boardKey(box(1, 1, 2, 1)), '3d:1x1x2:1:guess');
  assert.equal(boardKey(box(100, 100, 100, 999999)), '3d:100x100x100:999999:guess');
  assert.equal(boardKey(box(2, 8, 8, 10)), '3d:2x8x8:10:guess');
});

test('3D key: carries the mode and never equals a 2D key', () => {
  const keys3d = [box(8, 8, 2, 10), box(9, 9, 1, 10), box(30, 16, 1, 99, true), box(16, 16, 1, 40)].map(boardKey);
  for (const key of keys3d) assert.match(key, /^3d:/);
  const keys2d = [square(9, 9, 10), square(30, 16, 99, true), square(16, 16, 40), square(8, 8, 10),
    createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 8, height: 16, mines: 10, noGuess: false })].map(boardKey);
  for (const key of keys3d) assert.ok(!keys2d.includes(key), key);
  // A one-layer 3D board is still a 3D board, never the 2D board of the same size.
  assert.notEqual(boardKey(box(9, 9, 1, 10)), boardKey(square(9, 9, 10)));
});

test('3D key: every field takes part, so distinct 3D boards get distinct keys', () => {
  const base = { mode: '3d', width: 12, height: 10, depth: 8, mines: 130, noGuess: false };
  const variants = [
    base,
    { ...base, width: 10, height: 12 },
    { ...base, width: 8, depth: 12 },
    { ...base, depth: 9 },
    { ...base, mines: 129 },
    { ...base, noGuess: true },
  ];
  assert.equal(new Set(variants.map(boardKey)).size, variants.length);
});

test('3D key: the same fields give the same key, whatever object carries them', () => {
  const plain = { noGuess: true, mines: 130, depth: 8, height: 12, width: 12, mode: '3d' };
  assert.equal(boardKey(plain), boardKey(box(12, 12, 8, 130, true)));
  assert.equal(boardKey(JSON.parse(JSON.stringify(box(12, 12, 8, 130, true)))), boardKey(plain));
  assert.equal(boardKey({ ...plain, extra: 'ignored' }), boardKey(plain));
});

test('3D key: parsing a key gives back the identity it was made from', () => {
  for (const id of [box(8, 8, 2, 10), box(12, 12, 8, 130, true), box(1, 1, 2, 1), box(100, 100, 100, 5, true)]) {
    const parsed = parseBoardKey(boardKey(id));
    assert.deepEqual(parsed, id);
    assert.ok(Object.isFrozen(parsed));
  }
});

test('3D key: a malformed or impossible 3D key throws a range error', () => {
  for (const key of ['3d:8x8x2:10', '3d:8x8:10:guess', '3d:8x8x2x2:10:guess', '3d:8x8x0:10:guess',
    '3d:8x8x101:10:guess', '3d:8x8x2:0:guess', '3d:8x8x2:128:guess', '3d:08x8x2:10:guess',
    '3d:square:8x8:10:guess', '3d:box:8x8x2:10:guess', '3d:8x8x2:10:maybe', 'classic-2d:8x8x2:10:guess']) {
    assert.throws(() => parseBoardKey(key), RangeError, key);
  }
});

// ---------- label ----------

test('3D label: the six presets with and without no-guess', () => {
  const names = [
    [[8, 8, 2, 10], 'Double layer Beginner'],
    [[14, 14, 2, 60], 'Double layer Intermediate'],
    [[25, 16, 2, 130], 'Double layer Expert'],
    [[6, 6, 6, 10], 'Cube Beginner'],
    [[8, 8, 8, 40], 'Cube Intermediate'],
    [[12, 12, 8, 130], 'Cube Expert'],
  ];
  for (const [[w, h, d, m], name] of names) {
    assert.equal(boardLabel(box(w, h, d, m)), name);
    assert.equal(boardLabel(box(w, h, d, m, true)), `${name} · no-guess`);
  }
});

test('3D label: custom boards by size and mine count', () => {
  assert.equal(boardLabel(box(10, 10, 10, 80)), '10 × 10 × 10 · 80 mines');
  assert.equal(boardLabel(box(10, 10, 10, 80, true)), '10 × 10 × 10 · 80 mines · no-guess');
  assert.equal(boardLabel(box(1, 1, 2, 1)), '1 × 1 × 2 · 1 mine');
  // A preset size with another mine count, or another orientation, is a custom board.
  assert.equal(boardLabel(box(12, 12, 8, 129)), '12 × 12 × 8 · 129 mines');
  assert.equal(boardLabel(box(8, 2, 8, 10)), '8 × 2 × 8 · 10 mines');
  assert.equal(boardLabel(box(16, 25, 2, 130)), '16 × 25 × 2 · 130 mines');
});

test('3D label: a custom board matching a preset exactly is that preset\'s board', () => {
  // Chosen as Custom with Cube Expert's exact size and mines: same key, same label.
  const custom = { mode: '3d', width: 12, height: 12, depth: 8, mines: 130, noGuess: true };
  assert.equal(boardLabel(custom), 'Cube Expert · no-guess');
  assert.equal(boardKey(custom), boardKey(box(12, 12, 8, 130, true)));
  assert.equal(preset3D(custom).name, 'Expert');
});

// ---------- module ----------

test('3D module: the 3D key form is documented in the module', () => {
  const src = readFileSync(new URL('../js/records/board.js', import.meta.url), 'utf8');
  assert.match(src, /3d:<width>x<height>x<depth>:<mines>:<guess\|no-guess>/);
  assert.match(src, /3d:12x12x8:130:no-guess/);
});
