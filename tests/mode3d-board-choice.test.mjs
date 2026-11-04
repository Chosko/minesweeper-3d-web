// The 3D board choice (js/mode3d/board-choice.js): Learn 3D, the four cube presets, the validated
// custom board, the Random fill, the no-guess switches with the cell-count limit and the side-of-2
// rule, the board's bests, Insert Board Code, the last 3D board choice kept through the shell's
// last-board-choice mechanism (js/shell/menu.js), and the screen's markup, layout and wiring in
// index.html, css/style.css and js/main.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRESETS, FAMILIES, BOARD_SIZES, DEFAULT_CHOICE, DIM_MIN, DIM_MAX, NOGUESS_CELL_LIMIT, LAST_CHOICE_DOC, LAST_CHOICE_VERSION,
  presetKey, presetByKey, presetLabel, presetTitle, validateCustom, customStatus, noGuessAvailable, noGuessReason, normaliseChoice,
  readChoice, boardOf, randomBoard, densityHintShown, boxLine, mineDensity, customInfo, bestsTitle, CUSTOM_HINT,
} from '../js/mode3d/board-choice.js';
import * as BOARD_CHOICE_3D from '../js/mode3d/board-choice.js';
import { NOGUESS_DENSITY_HINT, DENSITY_HINT_TEXT, NOGUESS_HELP_TEXT } from '../js/classic2d/board-setup.js';
import { createLastBoardChoice } from '../js/shell/menu.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { browserSuite } from './helpers/browser.mjs';
import { encodeBoardCode, dailyGame, dateText, CODE_REASONS } from '../js/records/board-code.js';
import { otherModeHint } from '../js/shell/challenge.js';
import { CODE_PROMPT } from '../js/classic2d/board-choice.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

// ---------------------------------------------------------------- presets

test('the 3D board choice offers the four cube presets, and no first-box, flat or double layer preset', () => {
  const rows = PRESETS.map((p) => [p.id, p.family, p.name, p.X, p.Y, p.Z, p.mines]);
  assert.deepEqual(rows, [
    ['cube-intro', 'cube', 'Intro', 6, 6, 6, 10],
    ['cube-beginner', 'cube', 'Beginner', 6, 6, 6, 20],
    ['cube-intermediate', 'cube', 'Intermediate', 8, 8, 8, 40],
    ['cube-expert', 'cube', 'Expert', 10, 10, 10, 100],
  ]);
  assert.ok(PRESETS.every((p) => [p.X, p.Y, p.Z].every((side) => side > 2)), 'no flat or double layer preset');
  assert.deepEqual(FAMILIES.map((f) => [f.id, f.label]), [['cube', 'Cube']]);
  assert.deepEqual(PRESETS.map(presetTitle), ['Cube Intro', 'Cube Beginner', 'Cube Intermediate', 'Cube Expert']);
  assert.deepEqual(BOARD_SIZES, [...PRESETS.map((p) => p.id), 'custom']);
  assert.ok(Object.isFrozen(PRESETS) && PRESETS.every(Object.isFrozen));
  assert.equal(presetKey(PRESETS[0]), '6,6,6,10');
  assert.equal(presetByKey('4,4,3,4'), null, 'the former First box 1 is no preset');
  assert.equal(presetByKey('5,5,3,6'), null, 'the former First box 2 is no preset');
  assert.equal(presetByKey('6,6,6,10').id, 'cube-intro');
  assert.equal(presetByKey('10,10,10,100').id, 'cube-expert');
  assert.equal(presetByKey('12,12,8,130'), null, 'the former Cube Expert is no preset');
  assert.equal(presetByKey('9,9,1,10'), null, 'a flat preset is no preset');
  assert.equal(presetByKey('8,8,2,10'), null, 'a double layer board is no preset');
  assert.equal(presetLabel(PRESETS[3]), '10 × 10 × 10 · 100 mines');
  for (const p of PRESETS) {
    assert.equal(validateCustom(p).ok, true, `${p.id} is a valid board`);
    assert.equal(noGuessAvailable({ size: p.id, custom: DEFAULT_CHOICE.custom, noGuess: true }), true, `${p.id} offers no-guess`);
    assert.equal(noGuessAvailable({ size: 'custom', custom: p, noGuess: true }), true, `${p.id}'s board offers no-guess as a custom board`);
  }
});

test('no preset carries a start spacing of its own: every 3D board starts at the camera\'s ordinary spacing', () => {
  assert.ok(PRESETS.every((p) => !('spacing' in p)), 'no preset spacing');
  assert.equal('startSpacing' in BOARD_CHOICE_3D, false, 'no per-board start spacing');
  assert.doesNotMatch(read('js/mode3d/board-choice.js'), /SPACING_FIRST_BOX|First box|'box-[12]'/,'no First box left in the board choice');
  const main = read('js/main.js');
  const startGame = main.slice(main.indexOf('function startGame('), main.indexOf('\n}\n', main.indexOf('function startGame(')));
  assert.match(startGame, /S\.spacing = SPACING_START;\s*ui\.setSpacing\(S\.spacing\);/, 'a new game starts at the ordinary spacing');
});

// ---------------------------------------------------------------- custom validation

test('custom validates each dimension 1 to 100, naming the field out of range', () => {
  assert.equal(DIM_MIN, 1);
  assert.equal(DIM_MAX, 100);
  assert.deepEqual(validateCustom({ X: 1, Y: 1, Z: 2, mines: 1 }), { ok: true });
  assert.deepEqual(validateCustom({ X: 100, Y: 100, Z: 100, mines: 999999 }), { ok: true });
  for (const [field, label] of [['X', 'Width'], ['Y', 'Height'], ['Z', 'Depth']]) {
    for (const bad of [0, 101, 2.5, NaN, undefined]) {
      const board = { X: 10, Y: 10, Z: 10, mines: 10, [field]: bad };
      const v = validateCustom(board);
      assert.equal(v.ok, false, `${field} = ${bad}`);
      assert.equal(v.field, field);
      const s = customStatus(board);
      assert.equal(s.ok, false);
      assert.equal(s.field, field);
      assert.equal(s.text, `${label} must be a whole number from 1 to 100`);
      assert.equal(s.max, null, 'no mine limit while the size is invalid');
    }
  }
});

test('custom validates mines 1 to cells minus one, naming the mines field', () => {
  assert.equal(validateCustom({ X: 10, Y: 10, Z: 10, mines: 999 }).ok, true);
  assert.equal(validateCustom({ X: 10, Y: 10, Z: 10, mines: 1 }).ok, true);
  for (const bad of [0, 1000, -3, 4.5, NaN]) {
    const s = customStatus({ X: 10, Y: 10, Z: 10, mines: bad });
    assert.equal(s.ok, false, `mines = ${bad}`);
    assert.equal(s.field, 'mines');
    assert.equal(s.max, 999, 'one cell stays free for the safe first click');
    assert.equal(s.text, 'Mines must be a whole number from 1 to 999 on a 10 × 10 × 10 board');
  }
  const ok = customStatus({ X: 10, Y: 10, Z: 10, mines: 25 });
  assert.deepEqual(ok, { ok: true, field: null, max: 999, text: '1,000 cells · up to 999 mines' });
});

test('a one-cell custom board is refused: no mine count fits beside the safe first click', () => {
  const s = customStatus({ X: 1, Y: 1, Z: 1, mines: 1 });
  assert.equal(s.ok, false);
  assert.equal(s.field, 'mines');
  assert.equal(s.max, 0);
  assert.equal(s.text, 'A 1 × 1 × 1 board has no room for a mine beside the safe first click — make it at least 2 cells');
  assert.doesNotMatch(s.text, /1–0|1 to 0/);
  assert.equal(customStatus({ X: 1, Y: 1, Z: 1, mines: 0 }).field, 'mines');
  assert.equal(customStatus({ X: 1, Y: 1, Z: 2, mines: 1 }).ok, true, 'two cells take one mine');
});

test('a very large custom board stays valid with a warning', () => {
  const s = customStatus({ X: 100, Y: 100, Z: 100, mines: 1000 });
  assert.equal(s.ok, true);
  assert.equal(s.warn, true);
  assert.match(s.text, /^1,000,000 cells · up to 999,999 mines · very large board, may run slowly$/);
  assert.ok(!customStatus({ X: 10, Y: 10, Z: 10, mines: 25 }).warn);
});

test('the board choice\'s lines: each option\'s board line and density, the custom info line and the bests title follow the switch', () => {
  assert.deepEqual(PRESETS.map(boxLine), ['6 × 6 × 6 · 10 mines', '6 × 6 × 6 · 20 mines', '8 × 8 × 8 · 40 mines', '10 × 10 × 10 · 100 mines']);
  assert.deepEqual(PRESETS.map(presetLabel), PRESETS.map(boxLine));
  assert.equal(boxLine({ X: 24, Y: 24, Z: 24, mines: 2000 }), '24 × 24 × 24 · 2,000 mines');
  assert.equal(boxLine({ X: 1, Y: 1, Z: 2, mines: 1 }), '1 × 1 × 2 · 1 mine');
  assert.deepEqual(PRESETS.map(mineDensity), ['4.6 % mines', '9.3 % mines', '7.8 % mines', '10.0 % mines']);
  assert.equal(CUSTOM_HINT, 'Each side 1–100');

  assert.equal(customInfo({ X: 10, Y: 10, Z: 10, mines: 1000 }), '1,000 cells · up to 999 mines', 'the size\'s line, whatever the mines');
  assert.equal(customInfo({ X: 24, Y: 24, Z: 24, mines: 2000 }), '13,824 cells · up to 13,823 mines');
  assert.equal(customInfo({ X: 100, Y: 100, Z: 100, mines: 1 }), '1,000,000 cells · up to 999,999 mines · very large board, may run slowly');
  assert.equal(customInfo({ X: 1, Y: 1, Z: 1, mines: 1 }), '1 cell · no room for a mine');
  assert.equal(customInfo({ X: 0, Y: 10, Z: 10, mines: 1 }), '', 'nothing while a side is out of range');
  assert.equal(customStatus({ X: 10, Y: 10, Z: 10, mines: 25 }).text, customInfo({ X: 10, Y: 10, Z: 10, mines: 25 }), 'a valid board\'s status is its info line');

  const intermediate = PRESETS[2].id;
  const custom = { X: 10, Y: 10, Z: 10, mines: 120 };

  assert.equal(bestsTitle({ selected: intermediate, custom, noGuess: true }), 'Cube Intermediate · no-guess · your bests');
  assert.equal(bestsTitle({ selected: intermediate, custom, noGuess: false }), 'Cube Intermediate · your bests');
  assert.equal(bestsTitle({ selected: 'custom', custom, noGuess: true }), '10 × 10 × 10 · 120 mines · no-guess · your bests');
  assert.equal(bestsTitle({ selected: 'custom', custom: { X: NaN, Y: 1, Z: 1, mines: 1 }, noGuess: false }), 'Custom · your bests');
});

// ---------------------------------------------------------------- no-guess availability

test('no-guess is available on every preset and on a custom board up to the cell-count limit', () => {
  assert.ok(Number.isInteger(NOGUESS_CELL_LIMIT) && NOGUESS_CELL_LIMIT > 1);
  const custom = (cells) => ({ size: 'custom', custom: { X: cells, Y: 1, Z: 1, mines: 1 }, noGuess: true });
  for (const p of PRESETS) {
    assert.equal(noGuessAvailable({ size: p.id, custom: { X: 100, Y: 100, Z: 100, mines: 1 }, noGuess: true }), true, p.id);
  }
  assert.equal(noGuessAvailable({ size: 'custom', custom: { X: 1, Y: 1, Z: 3, mines: 1 }, noGuess: true }), true);
  const over = { size: 'custom', custom: { X: 100, Y: 100, Z: 100, mines: 1 }, noGuess: true };
  assert.equal(noGuessAvailable(over), false, 'above the limit');
  assert.equal(noGuessAvailable(custom(3)), true);
  const limit = `No-guess is available up to ${NOGUESS_CELL_LIMIT.toLocaleString('en-US')} cells`;
  assert.equal(noGuessReason(), limit);
  assert.equal(noGuessReason(over), limit);
});

test('no-guess is not available on a custom board with a side of 2 cells; a side of 1 keeps it', () => {
  const custom = (X, Y, Z, mines = 1) => ({ size: 'custom', custom: { X, Y, Z, mines }, noGuess: true });
  const SIDE_2 = 'No-guess isn\'t available when a side is 2 cells';
  for (const [X, Y, Z] of [[2, 1, 1], [1, 2, 1], [1, 1, 2], [8, 8, 2], [14, 14, 2], [25, 16, 2], [2, 10, 10], [10, 2, 10], [2, 2, 2]]) {
    for (const mines of [1, Math.floor((X * Y * Z) / 6) || 1, X * Y * Z - 1]) {
      assert.equal(noGuessAvailable(custom(X, Y, Z, mines)), false, `${X} × ${Y} × ${Z}, ${mines} mines`);
    }
    assert.equal(noGuessReason(custom(X, Y, Z)), SIDE_2, `${X} × ${Y} × ${Z}`);
  }
  for (const [X, Y, Z] of [[1, 1, 3], [3, 1, 1], [10, 10, 1], [1, 30, 16], [3, 3, 3], [20, 20, 20]]) {
    assert.equal(noGuessAvailable(custom(X, Y, Z)), true, `${X} × ${Y} × ${Z}`);
  }
  const large = custom(100, 100, 2);
  assert.equal(noGuessAvailable(large), false);
  assert.equal(noGuessReason(large), SIDE_2, 'a side of 2 takes precedence over the cell limit');
  assert.equal(normaliseChoice(custom(8, 8, 2, 10)).noGuess, false, 'normalising drops no-guess on a side of 2');
  for (const p of PRESETS) {
    assert.equal(noGuessAvailable({ size: p.id, custom: { X: 2, Y: 2, Z: 2, mines: 1 }, noGuess: true }), true, `${p.id} keeps no-guess`);
  }
});

test('the no-guess limit is one exported constant, read everywhere from js/mode3d/board-choice.js', () => {
  const src = strip(read('js/mode3d/board-choice.js'));
  assert.equal([...src.matchAll(/export const NOGUESS_CELL_LIMIT = (\d+);/g)].length, 1);
  const literal = String(NOGUESS_CELL_LIMIT);
  for (const f of ['js/ui.js', 'js/main.js', 'index.html']) {
    assert.ok(!new RegExp(`\\b${literal}\\b[^\\n]*cells`).test(strip(read(f))), `${f} restates the limit`);
  }
  // the custom board exactly at the limit
  const side = (n) => {
    for (let x = 1; x <= DIM_MAX; x++) for (let y = 1; y <= DIM_MAX; y++) {
      if (n % (x * y) === 0 && n / (x * y) <= DIM_MAX) return [x, y, n / (x * y)];
    }
    return null;
  };
  const dims = side(NOGUESS_CELL_LIMIT);
  if (dims) {
    const [X, Y, Z] = dims;
    assert.equal(noGuessAvailable({ size: 'custom', custom: { X, Y, Z, mines: 1 }, noGuess: true }), true, 'at the limit');
    const [X1, Y1, Z1] = side(NOGUESS_CELL_LIMIT + 1) ?? [X, Y, Z + 1];
    assert.equal(noGuessAvailable({ size: 'custom', custom: { X: X1, Y: Y1, Z: Z1, mines: 1 }, noGuess: true }), false, 'one cell over');
  }
});

// ---------------------------------------------------------------- the choice

test('a choice is X, Y, Z, mines and no-guess; normalising drops no-guess on a custom board above the limit', () => {
  assert.deepEqual(DEFAULT_CHOICE, { size: 'cube-beginner', custom: { X: 10, Y: 10, Z: 10, mines: 25 }, noGuess: true }, 'no-guess on by default');
  assert.equal(normaliseChoice(DEFAULT_CHOICE).size, 'cube-beginner');
  assert.equal(normaliseChoice(null), null);
  assert.equal(normaliseChoice({ size: 'flat-beginner', custom: DEFAULT_CHOICE.custom, noGuess: false }), null);
  for (const size of ['double-beginner', 'double-intermediate', 'double-expert']) {
    assert.equal(normaliseChoice({ size, custom: DEFAULT_CHOICE.custom, noGuess: false }), null, `${size} is no longer offered`);
  }
  assert.equal(normaliseChoice({ size: 'custom', custom: { X: 0, Y: 1, Z: 1, mines: 1 }, noGuess: false }), null);
  assert.equal(normaliseChoice({ size: 'cube-expert', custom: DEFAULT_CHOICE.custom, noGuess: 'yes' }), null);
  assert.deepEqual(normaliseChoice({ size: 'cube-expert', noGuess: true }),
    { size: 'cube-expert', custom: DEFAULT_CHOICE.custom, noGuess: true }, 'a preset without custom fields takes the default');
  const big = { X: 100, Y: 100, Z: 100, mines: 10 };
  assert.equal(normaliseChoice({ size: 'custom', custom: big, noGuess: true }).noGuess, false, 'no no-guess above the limit');
  assert.equal(normaliseChoice({ size: 'cube-expert', custom: big, noGuess: true }).noGuess, true, 'a preset keeps it');

  assert.deepEqual(boardOf({ size: 'cube-intermediate', custom: big, noGuess: true }), { X: 8, Y: 8, Z: 8, mines: 40, noGuess: true });
  assert.deepEqual(boardOf({ size: 'custom', custom: { X: 3, Y: 4, Z: 5, mines: 7 }, noGuess: false }), { X: 3, Y: 4, Z: 5, mines: 7, noGuess: false });
  assert.deepEqual(boardOf({ size: 'custom', custom: big, noGuess: true }).noGuess, false);
  assert.throws(() => boardOf({ size: 'custom', custom: { X: 1, Y: 1, Z: 1, mines: 1 }, noGuess: false }), RangeError);
});

test('readChoice reads the fields: custom needs a valid board, a preset keeps the last valid custom board', () => {
  const fields = { X: '5', Y: '6', Z: ' 7 ', mines: '20' };
  assert.deepEqual(readChoice({ size: 'custom', fields, noGuess: true }),
    { size: 'custom', custom: { X: 5, Y: 6, Z: 7, mines: 20 }, noGuess: true });
  assert.equal(readChoice({ size: 'custom', fields: { ...fields, X: '101' }, noGuess: false }), null);
  assert.equal(readChoice({ size: 'custom', fields: { ...fields, X: '2.5' }, noGuess: false }), null);
  assert.deepEqual(readChoice({ size: 'cube-intermediate', fields: { ...fields, mines: '0' }, noGuess: false }, { X: 9, Y: 9, Z: 9, mines: 9 }),
    { size: 'cube-intermediate', custom: { X: 9, Y: 9, Z: 9, mines: 9 }, noGuess: false });
  assert.deepEqual(readChoice({ size: 'cube-intermediate', fields, noGuess: false }).custom, { X: 5, Y: 6, Z: 7, mines: 20 });
});

test('Random fills a valid custom board by the original formula', () => {
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 2000; i++) {
    const b = randomBoard(rand);
    assert.equal(validateCustom(b).ok, true, JSON.stringify(b));
    assert.ok(b.Z <= 29 && b.Y <= 29, JSON.stringify(b));
  }
  assert.equal(validateCustom(randomBoard(() => 0)).ok, true, 'Random never lands on a board with no mine count');
  assert.equal(validateCustom(randomBoard(() => 0.999999)).ok, true);
});

// ---------------------------------------------------------------- the last 3D board choice

const memoryStorage = (initial, backend = createMemoryBackend({ initial })) => createStorage({ backend });
const lastChoice = (storage) => createLastBoardChoice({
  storage, doc: LAST_CHOICE_DOC, version: LAST_CHOICE_VERSION, normalise: normaliseChoice, fallback: DEFAULT_CHOICE,
});

test('the last 3D board choice is remembered through the shell and restored on return', async () => {
  assert.equal(LAST_CHOICE_DOC, 'mode3d.lastChoice');
  const backend = createMemoryBackend();
  const last = lastChoice(memoryStorage(null, backend));
  assert.deepEqual(last.current, DEFAULT_CHOICE);
  assert.equal('played' in last, false, 'the choice keeps no played flag');
  assert.deepEqual(await last.load(), DEFAULT_CHOICE, 'nothing stored loads the fallback');
  assert.deepEqual(last.current, DEFAULT_CHOICE);

  const choice = { size: 'custom', custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true };
  const saving = last.save(choice);
  assert.deepEqual(last.current, choice, 'current changes at once');
  await saving;

  const again = lastChoice(memoryStorage(null, backend));
  assert.deepEqual(await again.load(), choice, 'a later launch restores X, Y, Z, mines and no-guess');
  assert.deepEqual(again.current, choice);
  await assert.rejects(() => again.save({ size: 'custom', custom: { X: 0, Y: 1, Z: 1, mines: 1 }, noGuess: false }), RangeError);
  assert.deepEqual(again.current, choice, 'an invalid choice changes nothing');
});

test('a malformed stored 3D choice falls back to the default; the 2D choice is a different document', async () => {
  const storage = memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: 1, data: { size: 'custom', custom: { X: 500 }, noGuess: false } }) });
  const last = lastChoice(storage);
  assert.deepEqual(await last.load(), DEFAULT_CHOICE);
  assert.deepEqual(last.current, DEFAULT_CHOICE);
  const { LAST_CHOICE_DOC: doc2d } = await import('../js/classic2d/board-setup.js');
  assert.notEqual(LAST_CHOICE_DOC, doc2d, 'each mode keeps its own last board choice');
});

test('a remembered double layer choice opens on cube Beginner', async () => {
  for (const size of ['double-beginner', 'double-intermediate', 'double-expert']) {
    const data = { size, custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true };
    const last = lastChoice(memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: LAST_CHOICE_VERSION, data }) }));
    const choice = await last.load();
    assert.equal(choice.size, 'cube-beginner', size);
    assert.deepEqual(boardOf(choice), { X: 6, Y: 6, Z: 6, mines: 20, noGuess: true }, 'the fallback opens with no-guess on');
  }
});

test('a remembered First box choice opens on cube Beginner with no-guess on', async () => {
  for (const size of ['box-1', 'box-2']) {
    assert.equal(normaliseChoice({ size, custom: DEFAULT_CHOICE.custom, noGuess: false }), null, `${size} is no longer offered`);
    const data = { size, custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: false };
    const last = lastChoice(memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: LAST_CHOICE_VERSION, data }) }));
    const choice = await last.load();
    assert.equal(choice.size, 'cube-beginner', size);
    assert.deepEqual(boardOf(choice), { X: 6, Y: 6, Z: 6, mines: 20, noGuess: true }, 'the fallback opens with no-guess on');
  }
});

test('a remembered preset id opens on that id\'s current board', async () => {
  for (const [size, board] of [['cube-expert', { X: 10, Y: 10, Z: 10, mines: 100 }], ['cube-beginner', { X: 6, Y: 6, Z: 6, mines: 20 }], ['cube-intro', { X: 6, Y: 6, Z: 6, mines: 10 }]]) {
    const data = { size, custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: false };
    const last = lastChoice(memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: LAST_CHOICE_VERSION, data }) }));
    const choice = await last.load();
    assert.equal(choice.size, size);
    assert.deepEqual(boardOf(choice), { ...board, noGuess: false }, size);
  }
  const data = { size: 'cube-double', custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: false };
  const last = lastChoice(memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: LAST_CHOICE_VERSION, data }) }));
  assert.equal((await last.load()).size, 'cube-beginner', 'an id naming no current preset falls back to cube Beginner');
});

test('a profile with no stored 3D choice opens with no-guess on; a stored no-guess off is kept as stored', async () => {
  const backend = createMemoryBackend();
  const last = lastChoice(memoryStorage(null, backend));
  assert.equal(last.current.noGuess, true, 'before the load');
  assert.equal((await last.load()).noGuess, true, 'nothing stored');
  assert.equal(boardOf(last.current).noGuess, true, 'the presets\' board');
  const custom = { ...last.current, size: 'custom' };
  assert.equal(boardOf(custom).noGuess, true, 'the custom board\'s switch, on the default 10 × 10 × 10 board');
  const off = { size: 'cube-expert', custom: DEFAULT_CHOICE.custom, noGuess: false };
  await last.save(off);
  const again = lastChoice(memoryStorage(null, backend));
  assert.deepEqual(await again.load(), off, 'a stored no-guess off survives');
});

test('the density hint shows above 25 % mines with no-guess on, never refusing the board or the switch', () => {
  assert.equal(NOGUESS_DENSITY_HINT, 0.25, 'one named constant');
  assert.equal(DENSITY_HINT_TEXT, 'Above 25 % mines, a no-guess board may not be found.');
  const board = (mines) => ({ X: 10, Y: 10, Z: 10, mines });
  assert.equal(densityHintShown(board(250), true), false, 'exactly 25 % is not above it');
  assert.equal(densityHintShown(board(251), true), true);
  assert.equal(densityHintShown(board(251), false), false, 'no-guess off: no hint');
  assert.equal(densityHintShown(board(25), true), false);
  assert.equal(densityHintShown({ X: 0, Y: 10, Z: 10, mines: 999 }, true), false, 'an invalid board shows its own reason instead');
  assert.equal(densityHintShown({ X: 2, Y: 10, Z: 10, mines: 150 }, true), false, 'no switch offered on a side of 2: no hint');
  const dense = { size: 'custom', custom: board(900), noGuess: true };
  assert.equal(noGuessAvailable(dense), true, 'the switch stays offered');
  assert.equal(boardOf(dense).noGuess, true, 'and the board is not refused');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const UI_SRC = strip(read('js/ui.js'));
const BOARD = INDEX.slice(INDEX.indexOf('<section id="board-choice"'), INDEX.indexOf('<!-- Coming soon -->'));
const between = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end));
const unescape = (t) => t.replace(/&times;/g, '×').replace(/&middot;/g, '·').replace(/&ndash;/g, '–');
const C2D = between(INDEX, '<section id="c2d-choice"', '<!-- Classic 2D board -->');

test('index.html builds the 3D board choice from kit components, as the Classic 2D one: a window under its title bar, the mode its heading, the options beside what the chosen one needs, a bottom bar', () => {
  assert.match(BOARD, /^<section id="board-choice" class="overlay ui-backdrop hidden" aria-label="3D board choice">\s*<section class="ui-frame" id="board-choice-frame" aria-labelledby="board-choice-title">/, 'the window alone on the backdrop: no game title above it');
  assert.match(BOARD, /<div class="ui-frame__start"><button type="button" id="board-choice-back" class="ui-button ui-button--secondary ui-button--sm ui-frame__back" data-back data-icon="arrow-left" aria-label="Back to Main menu" title="Back"><\/button><\/div>\s*<h1 class="ui-logo ui-frame__logo" aria-label="Minesweeper 3D"><\/h1>/,
    'the title bar: Back its arrow alone, named Back to Main menu, then the logo');
  assert.match(BOARD, /<div class="ui-frame__heading">\s*<h2 class="ui-frame__title" id="board-choice-title">3D<\/h2>\s*<div class="ui-frame__action"><button type="button" id="bc-panel-toggle" class="ui-button ui-button--quiet ui-button--sm" data-panel-toggle data-icon="panel" aria-pressed="false" aria-controls="bc-choice-panel" aria-label="Settings &amp; bests" title="Settings &amp; bests"><\/button><\/div>/,
    'the panel toggle at the heading\'s right, as Classic 2D\'s');
  assert.match(BOARD, /<div class="ui-divider ui-divider--vertical hidden" role="separator" aria-orientation="vertical" data-panel-rule><\/div>\s*<div class="ui-drawer" id="bc-choice-panel" data-panel data-open="false">\s*<button type="button" class="ui-drawer__bar" id="bc-drawer-bar" data-drawer-bar aria-expanded="false" aria-controls="board-choice-detail"><span class="ui-section-label__text ui-drawer__label" data-drawer-label>Board settings<\/span>/,
    'the panel after the options, closed, its drawer bar before its body, as Classic 2D\'s');
  // The Classic 2D composition: the same parts in the same order.
  const parts = (html, prefix) => [...html.matchAll(/class="(ui-[\w-]+(?: ui-[\w-]+)*)" id="([\w-]+)"/g)]
    .map((m) => [m[1], m[2].replace(prefix, '')]).filter(([, id]) => /^(choice-(frame|title|body|options|detail))$/.test(id));
  assert.deepEqual(parts(BOARD, /^board-/), parts(C2D, /^c2d-/), 'the window, its heading, its body and its two columns, as Classic 2D\'s');

  // Left: Board; Learn 3D, the four presets and Custom in one group with no group label; a divider; Insert Board Code.
  const left = between(BOARD, '<div class="ui-column" id="board-choice-options">', '<div class="ui-divider ui-divider--vertical hidden" role="separator"');
  assert.match(left, /<h3 class="ui-section-label__text" id="bc-board-label">Board<\/h3>/);
  const options = [...left.matchAll(/<button type="button" class="ui-option[^"]*" aria-pressed="false" data-preset="([\w,]+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, ['learn', ...PRESETS.map(presetKey), 'custom', 'code']);
  assert.equal([...left.matchAll(/class="ui-options"/g)].length, 2, 'one group of boards, one of the code');
  assert.doesNotMatch(left, /class="ui-heading"|aria-label="Presets"|>Cube<\/h/, 'no group label');
  const learn = unescape(left.slice(left.indexOf('data-preset="learn"') - 120, left.indexOf('</button>', left.indexOf('data-preset="learn"'))));
  assert.match(learn, /<button type="button" class="ui-option ui-option--learn" aria-pressed="false" data-preset="learn" id="bc-learn" data-learn><span class="ui-option__badge" aria-hidden="true"><svg [^>]*>[\s\S]*?<\/svg><\/span><span class="ui-option__name">Learn 3D<\/span><span class="ui-option__meta">A guided 4 × 4 × 3 box<\/span>/,
    'Learn 3D: its accent outline and cube badge, no Last played chip');
  for (const p of PRESETS) {
    const key = presetKey(p);
    const b = unescape(left.slice(left.indexOf(`data-preset="${key}"`), left.indexOf('</button>', left.indexOf(`data-preset="${key}"`))));
    assert.ok(b.includes(`<span class="ui-option__name">${presetTitle(p)}</span><span class="ui-option__meta"><span class="ui-option__size">${boxLine(p)}</span> · <span class="ui-option__density">${mineDensity(p)}</span></span>`),
      `${p.id}: its name, with no Last played chip, its size line and density`);
  }
  assert.ok(unescape(left).includes(`<span class="ui-option__meta" data-custom-meta>${CUSTOM_HINT}</span>`));
  const divider = left.indexOf('<hr class="ui-divider">');
  assert.ok(divider > left.indexOf('data-preset="custom"') && divider < left.indexOf('data-preset="code"'), 'a divider before Insert Board Code');
  const code = left.slice(left.indexOf('data-preset="code"'), left.indexOf('</button>', left.indexOf('data-preset="code"')));
  assert.match(code, /^data-preset="code" id="bc-code-option"><span class="ui-option__name">Insert Board Code<\/span><span class="ui-option__meta">Play the exact board a code describes<\/span>/);
  assert.doesNotMatch(left, /ui-menu|data-detail|3BV|Best /, 'nothing from the records on an option');
  assert.doesNotMatch(left, /ui-chip|data-last|Last played/, 'no Last played chip on any option');
  assert.doesNotMatch(BOARD, /First box|first-box|bc-box|Double layer|bc-double/, 'no First box or double layer');
  assert.doesNotMatch(read('css/components.css'), /Double layer|bc-double/, 'no double layer group in the styles');

  // In the panel: Learn 3D's panel, the settings with both switches, the custom form, the bests, the code panel.
  const right = between(BOARD, '<div class="ui-column ui-drawer__body" id="board-choice-detail">', '<footer class="ui-frame__foot ui-frame__foot--action">');
  const lesson = between(right, '<div id="bc-learn-panel"', '<div id="bc-settings"');
  assert.match(lesson, /^<div id="bc-learn-panel" class="hidden" data-learn-panel>\s*<div class="ui-section-label"><h3 class="ui-section-label__text">Learn 3D<\/h3><span class="ui-section-label__aside">keeps no records<\/span><\/div>/);
  assert.deepEqual([...lesson.matchAll(/<p class="ui-text">([^<]+)<\/p>/g)].map((m) => m[1]), [
    'A number counts the mines among the 26 cubes around it.', 'Empty and solved cubes hide themselves; hold Ctrl to show them.', 'The first click is always safe.',
  ], 'How 3D works, its three lines');
  assert.match(lesson, /<div class="ui-panel ui-panel--muted" role="group" aria-labelledby="bc-rules-title">\s*<div class="ui-section-label"><h4 class="ui-section-label__text" id="bc-rules-title">How 3D works<\/h4><\/div>/);
  assert.doesNotMatch(lesson, /data-noguess|data-best/, 'no switch and no bests');
  const settings = between(right, '<div id="bc-settings"', '<form id="custom"');
  assert.match(settings, /^<div id="bc-settings" data-settings>\s*<div class="ui-section-label"><h3 class="ui-section-label__text">Board settings<\/h3><\/div>/);
  assert.ok(settings.includes('<div id="bc-preset-settings" data-preset-settings>\n'
    + `                <div class="ui-switchrow"><span class="ui-switchrow__text"><label class="ui-switchrow__label" for="bc-noguess">No-guess</label><span class="ui-switchrow__help" id="bc-noguess-help">${NOGUESS_HELP_TEXT}</span></span>`
    + '<input type="checkbox" role="switch" id="bc-noguess" class="ui-toggle__input" data-noguess="presets" aria-describedby="bc-noguess-help"></div>'),
  'the presets\' no-guess switch row: its label and help line on the left, the switch at the right');
  assert.equal(NOGUESS_HELP_TEXT, 'Solvable by logic alone, no 50/50 guesses. Separate records.');
  const customSettings = settings.slice(settings.indexOf('<div id="bc-custom-settings"'));
  assert.match(customSettings, /^<div id="bc-custom-settings" class="hidden" data-custom-settings>\s*<p id="c-noguess-reason" class="ui-note ui-note--warn hidden" data-icon="info" data-noguess-reason><span class="ui-note__text"><\/span><\/p>\s*<div class="ui-switchrow"><span class="ui-switchrow__text"><label class="ui-switchrow__label" for="c-noguess">No-guess<\/label><span class="ui-switchrow__help" id="c-noguess-help">Keeps separate records\.<\/span><\/span><input type="checkbox" role="switch" id="c-noguess" class="ui-toggle__input" data-noguess="custom" aria-describedby="c-noguess-help"><\/div>\s*<p id="c-density-hint" class="ui-note ui-note--warn hidden" data-icon="warning" data-density-hint><span class="ui-note__text"><\/span><\/p>/,
    'the custom switch under its reason line (a warn note, the info icon), over the density hint (a warn note, the warning icon)');
  const form = right.slice(right.indexOf('<form id="custom"'), right.indexOf('</form>'));
  assert.match(form, /^<form id="custom" class="hidden" aria-label="Custom board" novalidate>/, 'the form, on the panel in no box of its own, with its Depth field, shows for Custom only');
  for (const [f, id] of [['X', 'c-x'], ['Y', 'c-y'], ['Z', 'c-z'], ['mines', 'c-m']]) {
    assert.match(form, new RegExp(`<label class="ui-field"><span class="ui-field__label">[^<]+</span><input id="${id}" data-field="${f}" class="ui-field__input" type="number"`), f);
  }
  assert.deepEqual([...form.matchAll(/<span class="ui-field__label">([^<]+)<\/span>/g)].map((m) => m[1]), ['Width', 'Height', 'Depth', 'Mines']);
  assert.match(form, /id="c-x"[^>]*min="1" max="100"/);
  const [info, random, refusal] = ['data-info', 'id="c-random"', 'data-refusal'].map((x) => form.indexOf(x));
  assert.ok(info > form.indexOf('id="c-m"') && random > info && refusal > random, 'the fields, the info line, Random, the refusal line');
  assert.match(form, /<div class="ui-actions ui-actions--row"><p id="c-info" class="ui-text ui-text--muted" data-info>[^<]*<\/p><button type="button" id="c-random" class="ui-button ui-button--secondary ui-button--sm" data-random data-icon="shuffle">Random<\/button><\/div>/,
    'the info line and Random, with its shuffle icon, on one row');
  assert.match(form, /<p id="c-refusal" class="ui-note ui-note--warn hidden" data-icon="warning" data-refusal><span class="ui-note__text"><\/span><\/p>/, 'the refusal, a warn note with its warning icon');
  assert.doesNotMatch(BOARD, /c-start|type="submit"/, 'Play starts a custom board');
  const bests = between(right, '<div id="bc-bests"', '<div id="bc-code-panel"');
  assert.ok(right.indexOf('<div id="bc-bests"') > right.indexOf('</form>'), 'the bests under the form');
  assert.match(bests, /<hr class="ui-divider">\s*<div class="ui-section-label"><h3 class="ui-section-label__text" id="bc-bests-title" data-bests-title>/);
  const tiles = [...bests.matchAll(/<div id="bc-best-(\w+)" class="ui-stat ui-stat--tile" role="group" aria-labelledby="bc-best-\1-label" data-best="\1"><span class="ui-stat__label" id="bc-best-\1-label">([^<]+)<\/span>/g)];
  assert.deepEqual(tiles.map((m) => [m[1], m[2]]), [['time', 'Time'], ['bbbvPerSecond', '3BV/s'], ['efficiency', 'Efficiency']], 'three tiles only');
  assert.match(bests, /<button type="button" id="bc-records" class="ui-button ui-button--secondary ui-button--sm" data-records data-icon="chart">All records<\/button>\s*<\/div>\s*$/, 'All records under the bests');
  const panel = right.slice(right.indexOf('<div id="bc-code-panel"'));
  assert.match(panel, /^<div id="bc-code-panel" class="hidden" role="group" aria-labelledby="bc-code-title" data-code-panel>/);
  assert.match(panel, /<input id="bc-code" data-code-field class="ui-field__input" type="text"/);
  assert.ok(panel.includes(`<p id="bc-code-info" class="ui-text ui-text--muted" data-code-info>${CODE_PROMPT}</p>`));
  assert.doesNotMatch(BOARD, /bc-code-play|Play this board|data-esc-hint/, 'the code is played with Play; no text Esc hint');

  // The foot: Play alone, with its confirm hint.
  const foot = between(BOARD, '<footer class="ui-frame__foot ui-frame__foot--action">', '</footer>');
  assert.match(foot, /^<footer class="ui-frame__foot ui-frame__foot--action">\s*<div class="ui-actions ui-actions--row">\s*<button type="button" id="bc-play" class="ui-button ui-button--primary ui-button--go ui-button--lg" data-play data-icon="play">Play <span class="ui-key-hint" data-action="confirm" aria-hidden="true"><\/span><\/button>\s*<\/div>\s*$/,
    'Play alone, with its play icon');
  assert.doesNotMatch(BOARD, /ui-frame__summary|data-summary/, 'no summary');
  for (const [, cls] of BOARD.matchAll(/class="([^"]+)"/g)) {
    for (const c of cls.split(/\s+/)) assert.ok(c.startsWith('ui-') || ['overlay', 'hidden'].includes(c), `kit class: ${c}`);
  }
});

test('the shell stylesheet lays both board choices out alike: the window centred on the page, the 3D one placed as the Classic 2D one, one column on a phone', () => {
  // The rules themselves are pinned by tests/classic2d-mode.test.mjs; here, that both screens share them.
  const css = read('css/style.css');
  assert.match(css, /\n#c2d-choice, #board-choice, #daily \{ flex-direction: column; justify-content: flex-start;/);
  assert.match(css, /\n#c2d-choice::before, #board-choice::before, #daily::before,\n#c2d-choice::after, #board-choice::after, #daily::after \{ content: ""; flex: 1 1 0; min-height: 40px; \}/, 'the 3D window centres as the Classic 2D one');
  assert.match(css, /\n#c2d-choice-frame, #board-choice-frame \{ flex: 0 1 auto; align-self: center; width: auto; \}/, 'both windows as narrow as their content');
  assert.match(css, /\n#c2d-choice-panel, #bc-choice-panel \{ flex: 0 1 639px; width: 639px; min-width: 0; \}/, 'both panels alike');
  assert.match(css, /#custom > \.ui-row \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\); gap: 10px; \}/, 'the four fields fill one row');
  assert.doesNotMatch(css, /\n#board-choice-top \{|\n#board-choice::before \{/, 'no placement of its own');
  assert.doesNotMatch(css, /\n#c2d-choice-frame \{|\n#c2d-choice-top \{/, 'no rule for one board choice that the other repeats');
});

test('the board choice leads with Learn 3D, played through onLearn, never a preset, the last choice or its "Last played" mark', () => {
  const learn = BOARD.indexOf('data-learn');
  assert.ok(learn > 0 && learn < BOARD.indexOf('data-preset="6'), 'the first option, above the presets');
  assert.doesNotMatch(BOARD.slice(learn, BOARD.indexOf('</button>', learn)), /data-last/, 'no Last played chip');
  const src = read('js/mode3d/board-choice.js');
  assert.match(src, /bindBoardChoice\(\{ root, onStart, onLearn, onBack, onRecords = null, code = null, bests = null, pin = null \}\)/);
  assert.match(src, /if \(selected === 'learn'\) \{\s*onLearn\?\.\(\);/, 'Play on Learn 3D starts the guided board');
  assert.match(MAIN, /onLearn: \(\) => startLearn\(/);
  const onLearn = MAIN.slice(MAIN.indexOf('onLearn:'), MAIN.indexOf('\n', MAIN.indexOf('onLearn:')));
  assert.doesNotMatch(onLearn, /LAST_CHOICE_3D\.save/, 'starting it does not save the last 3D choice');
});

test('the old per-size 3D best times are not read or shown by the board choice', () => {
  const src = strip(read('js/mode3d/board-choice.js'));
  assert.doesNotMatch(src, /\bgetBest\b|ms3d\.best|localStorage/);
  assert.doesNotMatch(UI_SRC, /refreshBests|\[data-best\]|dataset\[kind\]|ms3d\.lastPreset|ms3d\.custom/);
});

test('the board choice module touches only the elements it is handed', () => {
  const src = strip(read('js/mode3d/board-choice.js'));
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
  assert.doesNotMatch(UI_SRC, /'c-random'|getElementById\('custom'\)|data-preset/, 'ui.js no longer drives the 3D board choice');
});

test('the shell wires the 3D board choice, its last choice and every control', () => {
  assert.match(MAIN, /import \{[^}]*bindBoardChoice as bindBoardChoice3D[^}]*\} from '\.\/mode3d\/board-choice\.js'/);
  assert.match(MAIN, /createLastBoardChoice\(\{ storage, doc: LAST_CHOICE_DOC_3D/);
  assert.match(MAIN, /LAST_CHOICE_3D\.load\(\)/, 'the last 3D choice is loaded at start-up');
  assert.match(MAIN, /'board-choice': \{ defaultFocus: '\[data-preset\]\[aria-pressed="true"\]', show: \(d = \{\}, from\) => \{[^\n]*showChoice3D\(from\); \} \}/,
    'the board choice focuses the chosen option, the last choice when it opens');
  assert.match(MAIN, /CHOICE_3D\.show\(LAST_CHOICE_3D\.current, \{ held \}\)/);
  assert.match(MAIN, /onStart: \(choice\) => \{[^\n]*LAST_CHOICE_3D\.save\(choice\)[^\n]*MODES\.start\('3d', boardOf\(choice\)\)/);
  assert.match(MAIN, /bests: \(board\) => boardBests\(identity3D\(board\), RECORDS\)/, 'the bests read through the store\'s queries');
  assert.match(MAIN, /RECORDS\.onChange\(\(\) => \{ CHOICE_2D\.refresh\(\); HEX_MODE\.choice\.refresh\(\); TRI_MODE\.choice\.refresh\(\); CHOICE_3D\.refresh\(\); \}\)/, 'and redrawn on its change notification');
  assert.match(MAIN, /onRecords: \(board\) => \{\s*held3D = CHOICE_3D\.state\(\);\s*SHELL\.go\('records', \{ data: \{ mode: MODE_3D, boardKey: board \? boardKey\(identity3D\(board\)\) : null \} \}\);/,
    'All records opens on the chosen board and switch, Back returning to what the screen held');
  assert.match(MAIN, /bests: \(board\) => boardBests\(identity3D\(board\), RECORDS\),\n  pin: BOARD_PANEL,\n\}\);/, 'the panel\'s pin, shared with Classic 2D');
  assert.match(strip(read('js/mode3d/board-choice.js')), /import \{[^}]*\bbindChoicePanel\b[^}]*\} from '\.\.\/classic2d\/board-choice\.js'/, 'one panel behaviour, the Classic 2D binder\'s');
  assert.doesNotMatch(MAIN, /presetDetails|CHOICE_ITEMS/, 'no detail lines on the options');
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /3D board choice \(index\.html #board-choice\): the Classic 2D board choice's composition[\s\S]*?Learn 3D[\s\S]*?no-guess ui-switchrow[\s\S]*?Default focus: the last board choice/);
});

// ---------------------------------------------------------------- browser

test('in a browser, the custom board validates, the switch follows the limit and the choice is restored', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const info = () => ms(() => document.getElementById('c-info').textContent);
    const refusal = () => ms(() => { const r = document.getElementById('c-refusal'); return r.classList.contains('hidden') ? '' : r.textContent; });
    const sw = () => ms(() => {
      const s = document.getElementById('c-noguess');
      const r = document.getElementById('c-noguess-reason');
      return { disabled: s.disabled, checked: s.checked, reason: r.classList.contains('hidden') ? '' : r.textContent };
    });

    await page.click('#menu-entry-3d');
    assert.equal(await mode(), 'board-choice');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '6,6,6,20', 'the default preset, cube Beginner, takes the focus when none was played');
    // Each preset carries its name, its size line and density, and nothing from the records: no Last played chip.
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#board-choice [data-preset]')].filter((b) => /,/.test(b.dataset.preset))
      .map((b) => [...b.children].map((c) => `${c.className}${c.classList.contains('ui-option__meta') ? `: ${c.textContent}` : ''}`))),
    PRESETS.map((p) => ['ui-option__name', `ui-option__meta: ${boxLine(p)} · ${mineDensity(p)}`, 'ui-option__check']));
    assert.equal(await ms(() => document.querySelectorAll('#board-choice .ui-chip, #board-choice [data-detail]').length), 0, 'no chip and no detail lines');
    // A preset with nothing stored: the Board list and the foot alone, the panel closed and unpinned.
    const panelState = () => ms(() => ({ open: document.getElementById('bc-choice-panel').dataset.open, pinned: document.getElementById('bc-panel-toggle').getAttribute('aria-pressed'),
      shown: document.getElementById('board-choice-detail').getClientRects().length > 0 }));
    assert.deepEqual(await panelState(), { open: 'false', pinned: 'false', shown: false }, 'the panel closed while unpinned on a preset');

    // The fields name what is out of range, under Random; the info line keeps the size's line.
    await page.click('#board-choice [data-preset="custom"]');
    assert.deepEqual(await panelState(), { open: 'true', pinned: 'false', shown: true }, 'Custom opens the panel on its own, pinning nothing');
    await page.fill('#c-y', '0');
    assert.equal(await refusal(), 'Height must be a whole number from 1 to 100');
    assert.equal(await info(), '', 'no size line while a side is out of range');
    assert.ok(await ms(() => document.getElementById('c-y').classList.contains('is-invalid')), 'the refused field is marked invalid');
    assert.equal(await ms(() => document.getElementById('c-y').getAttribute('aria-invalid')), 'true');
    await page.fill('#c-y', '1');
    await page.fill('#c-x', '1');
    await page.fill('#c-z', '1');
    await page.fill('#c-m', '1');
    assert.match(await refusal(), /^A 1 × 1 × 1 board has no room for a mine/);
    assert.equal(await info(), '1 cell · no room for a mine');
    assert.equal(await ms(() => document.getElementById('bc-play').disabled), true, 'Play waits for a valid board');
    await page.press('#c-m', 'Enter');
    assert.equal(await mode(), 'board-choice', 'an invalid custom board does not start');
    assert.equal(await ms(() => document.activeElement?.id), 'c-m', 'the field out of range takes the focus');

    // No-guess follows the limit on the custom board.
    await page.fill('#c-x', '100');
    await page.fill('#c-y', '100');
    await page.fill('#c-z', '100');
    await page.fill('#c-m', '50');
    assert.match(await info(), /^1,000,000 cells/);
    assert.deepEqual(await sw(), { disabled: true, checked: false, reason: `No-guess is available up to ${NOGUESS_CELL_LIMIT.toLocaleString('en-US')} cells` });
    await page.fill('#c-x', '3');
    await page.fill('#c-y', '3');
    await page.fill('#c-z', '3');
    await page.fill('#c-m', '3');
    assert.deepEqual(await sw(), { disabled: false, checked: true, reason: '' }, 'no-guess on by default for a player who never played');
    assert.equal(await ms(() => document.getElementById('bc-noguess').checked), true, 'the presets\' switch too');
    assert.equal(await ms(() => document.getElementById('bc-noguess-help').textContent), 'Solvable by logic alone, no 50/50 guesses. Separate records.');
    // The density hint follows the fields and the switch live, and never disables anything.
    const hint = () => ms(() => { const h = document.getElementById('c-density-hint'); return h.classList.contains('hidden') ? '' : h.textContent; });
    assert.equal(await hint(), '', '3 mines in 27 cells');
    await page.fill('#c-m', '6');
    assert.equal(await hint(), '', '6 in 27 is below 25 %');
    await page.fill('#c-m', '10');
    assert.equal(await hint(), 'Above 25 % mines, a no-guess board may not be found.');
    assert.equal((await sw()).disabled, false, 'the switch stays offered');
    await page.uncheck('#c-noguess');
    assert.equal(await hint(), '', 'no-guess off: no hint');
    await page.check('#c-noguess');
    assert.equal(await hint(), 'Above 25 % mines, a no-guess board may not be found.');
    await page.fill('#c-m', '3');
    assert.equal(await hint(), '');
    await page.fill('#c-x', '100');
    await page.fill('#c-y', '100');
    assert.deepEqual(await sw(), { disabled: true, checked: false, reason: `No-guess is available up to ${NOGUESS_CELL_LIMIT.toLocaleString('en-US')} cells` });
    assert.equal(await ms(() => document.getElementById('bc-noguess').disabled), false, 'the presets keep their switch above the limit');
    await page.fill('#c-z', '2');
    assert.deepEqual(await sw(), { disabled: true, checked: false, reason: 'No-guess isn\'t available when a side is 2 cells' },
      'a side of 2 takes precedence over the cell limit');
    await page.fill('#c-x', '3');
    await page.fill('#c-y', '3');
    assert.deepEqual(await sw(), { disabled: true, checked: false, reason: 'No-guess isn\'t available when a side is 2 cells' });
    await page.fill('#c-z', '3');
    assert.equal((await sw()).checked, true, 'the custom board\'s choice comes back on a board that offers it');

    // Random fills valid fields, and Play is offered again.
    for (let i = 0; i < 5; i++) {
      await page.click('#c-random');
      const f = await ms(() => ['c-x', 'c-y', 'c-z', 'c-m'].map((id) => Number(document.getElementById(id).value)));
      assert.equal(validateCustom({ X: f[0], Y: f[1], Z: f[2], mines: f[3] }).ok, true, `a valid board: ${f}`);
      assert.equal(await refusal(), '');
      assert.equal(await ms(() => document.getElementById('bc-play').disabled), false);
    }

    // Start a custom board by keyboard: Enter in a field plays; the choice is remembered and restored on return.
    await page.fill('#c-x', '4');
    await page.fill('#c-y', '5');
    await page.fill('#c-z', '6');
    await page.fill('#c-m', '11');
    await page.press('#c-m', 'Enter');
    assert.equal(await mode(), 'ready');
    assert.deepEqual(await ms(() => globalThis.__ms.state.settings), { X: 4, Y: 5, Z: 6, mines: 11 });
    await page.click('#ready-back');
    assert.equal(await mode(), 'board-choice');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), 'custom', 'Custom, chosen, keeps the focus');
    await page.waitForFunction(() => localStorage.getItem('ms3d:doc:mode3d.lastChoice') !== null);
    assert.deepEqual(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data),
      { size: 'custom', custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true });

    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.click('#menu-entry-3d');
    assert.deepEqual(await ms(() => ['c-x', 'c-y', 'c-z', 'c-m'].map((id) => document.getElementById(id).value)), ['4', '5', '6', '11']);
    assert.equal((await sw()).checked, true, 'the no-guess switch is restored');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), 'custom', 'the last choice takes the focus');
    assert.equal(await ms(() => document.querySelector('#board-choice [data-custom-meta]').textContent), '4 × 5 × 6 · 11 mines · 9.2 % mines', 'Custom names its board');

    assert.equal(await ms(() => document.getElementById('bc-noguess').checked), true, 'the presets\' switch shows the choice');

    // A preset by mouse, with no-guess switched by keyboard, above the custom limit.
    await page.fill('#c-x', '100');
    await page.fill('#c-y', '100');
    await page.fill('#c-z', '100');
    await page.click('#board-choice [data-preset="8,8,8,40"]');
    assert.equal(await mode(), 'board-choice', 'a click chooses, and starts nothing');
    assert.deepEqual(await panelState(), { open: 'false', pinned: 'false', shown: false }, 'a preset closes the panel again');
    // The toggle pins the panel open, a stored preference.
    await page.click('#bc-panel-toggle');
    assert.deepEqual(await panelState(), { open: 'true', pinned: 'true', shown: true }, 'pinned, the panel shows the preset\'s settings and bests');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.boardPanel') ?? 'null')?.data?.pinned === true);
    await page.focus('#bc-noguess');
    await page.keyboard.press('Space');
    assert.equal(await ms(() => document.getElementById('bc-noguess').checked), false);
    await page.click('#bc-play');
    assert.equal(await mode(), 'ready');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data.size === 'cube-intermediate');
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data.noGuess), false);
    await page.click('#ready-back');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '8,8,8,40');
    assert.equal(await ms(() => document.querySelector('[data-preset="8,8,8,40"]').hasAttribute('data-last')), true, 'the last board played, marked with no chip');
    assert.deepEqual(await panelState(), { open: 'true', pinned: 'true', shown: true }, 'the pin holds when the board choice opens again');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- Insert Board Code

test('both board choices hold a board code field wired to the shell, played with Play', () => {
  const html = read('index.html');
  for (const [section, prefix] of [['<section id="board-choice"', 'bc'], ['<section id="c2d-choice"', 'c2d']]) {
    const part = html.slice(html.indexOf(section), html.indexOf('</section>\n  </section>', html.indexOf(section)));
    assert.match(part, new RegExp(`<input id="${prefix}-code" data-code-field class="ui-field__input" type="text"`));
    assert.match(part, new RegExp(`<input id="${prefix}-code"[^>]* placeholder="EN-…">`), 'the canvas\'s placeholder');
    assert.match(part, new RegExp(`<p id="${prefix}-code-info" class="ui-text ui-text--muted" data-code-info>${CODE_PROMPT}</p>`));
  }
  assert.doesNotMatch(html, /data-code-play|Play this board/, 'no button of its own');
  assert.match(MAIN_SRC, /code: \{ resolve: \(text\) => checkCode\(text, '3d'\), onPlay: \(text\) => playCode\(text, '3d'\) \}/);
  assert.match(MAIN_SRC, /code: \{ resolve: \(text\) => checkCode\(text, 'classic-2d'\), onPlay: \(text\) => playCode\(text, 'classic-2d'\) \}/);
});
const MAIN_SRC = read('js/main.js');

test('in a browser, a board code in a board choice: validated live, the other mode refused with a hint, a challenge started, today\'s daily opens the Daily screen', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const field = (prefix) => ms((p) => ({
      info: document.getElementById(`${p}-code-info`).textContent,
      line: document.getElementById(`${p}-code-info`).className,
      invalid: document.getElementById(`${p}-code`).classList.contains('is-invalid'),
      disabled: document.getElementById(`${p}-play`).disabled,
    }), prefix);
    const two = encodeBoardCode({ board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, seed: 3, startCell: 40, generatorVersion: 1 });
    const three = encodeBoardCode({ board: { mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: false }, seed: 9, startCell: 129, generatorVersion: 1 });

    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="code"]');
    const shown = (id) => ms((i) => { const e = document.getElementById(i); return !e.closest('.hidden') && e.getBoundingClientRect().height > 0; }, id);
    assert.deepEqual(await Promise.all(['bc-learn-panel', 'bc-settings', 'custom', 'bc-bests', 'bc-code-panel'].map(shown)), [false, false, false, false, true], 'only the code field');
    assert.equal(await ms(() => document.getElementById('bc-choice-panel').dataset.open), 'true', 'Insert Board Code opens the panel on its own');
    assert.deepEqual(await field('bc'), { info: CODE_PROMPT, line: 'ui-text ui-text--muted', invalid: false, disabled: true });
    await page.fill('#bc-code', 'nonsense');
    assert.deepEqual(await field('bc'), { info: CODE_REASONS.malformed, line: 'ui-note ui-note--err', invalid: true, disabled: true }, 'refused: an err note, the field invalid');
    await page.fill('#bc-code', two);
    assert.deepEqual(await field('bc'), { info: otherModeHint('classic-2d'), line: 'ui-note ui-note--warn', invalid: false, disabled: true }, 'the other mode: a warn note');
    await page.fill('#bc-code', three.toLowerCase());
    assert.equal((await field('bc')).disabled, false);
    assert.equal((await field('bc')).line, 'ui-text ui-text--success', 'accepted: the success line');
    assert.match((await field('bc')).info, /^Cube Intro · 6 × 6 × 6 · 10 mines · starts on the marked cube$/);
    await page.click('#bc-play');
    await page.waitForFunction(() => globalThis.__ms.modes.active === '3d');
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), 129, 'the start cell is tinted');
    await page.evaluate(() => globalThis.__ms.forcePlay());
    await page.evaluate(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    assert.equal(await ms(() => globalThis.__ms.modes.state.started), false, 'a reveal off the mark changes nothing');
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Start on the marked cell');
    assert.equal(await ms(() => localStorage.getItem('ms3d:doc:mode3d.lastChoice')), null, 'a challenge never changes the last board choice');
    await page.evaluate(() => globalThis.__ms.pause());
    await page.click('#p-menu');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu');

    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="code"]');
    await page.fill('#c2d-code', dailyGame('expert', dateText()).code);
    assert.equal((await field('c2d')).disabled, false);
    await page.press('#c2d-code', 'Enter');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'daily', 'today\'s daily opens the Daily screen');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- the screen in a browser

const PANELS = ['bc-learn-panel', 'bc-settings', 'bc-preset-settings', 'bc-custom-settings', 'custom', 'bc-bests', 'bc-code-panel'];

test('in a browser, the 3D board choice: a click chooses, Play or Enter plays; the panel opens for Learn 3D, Custom and the code or while pinned; the bests follow the switch and the records; All records and back', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const text = (id) => ms((i) => document.getElementById(i).textContent, id);
    const shown = (id) => ms((i) => { const e = document.getElementById(i); return !e.closest('.hidden') && e.getBoundingClientRect().height > 0; }, id);
    const panels = async () => Object.fromEntries(await Promise.all(PANELS.map(async (id) => [id, await shown(id)])));
    const only = (...ids) => Object.fromEntries(PANELS.map((id) => [id, ids.includes(id)]));
    const chosen = () => ms(() => [...document.querySelectorAll('#board-choice [data-preset][aria-pressed="true"]')].map((b) => b.dataset.preset));
    const tiles = () => ms(() => [...document.querySelectorAll('#bc-bests [data-best]')].map((x) => [x.querySelector('.ui-stat__label').textContent, x.querySelector('.ui-stat__value').textContent, x.querySelector('.ui-stat__detail').textContent]));
    const lastChoice = () => ms(() => localStorage.getItem('ms3d:doc:mode3d.lastChoice'));
    const pinned = () => ms(() => document.getElementById('bc-panel-toggle').getAttribute('aria-pressed'));
    const width = () => ms(() => Math.round(document.getElementById('board-choice-frame').getBoundingClientRect().width));

    // A new player: Cube Beginner chosen and focused, no-guess on, the panel closed: the Board list and the foot alone.
    await page.click('#menu-entry-3d');
    assert.deepEqual(await chosen(), ['6,6,6,20']);
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '6,6,6,20');
    assert.deepEqual(await panels(), only(), 'the panel closed');
    assert.equal(await pinned(), 'false');
    assert.deepEqual(await ms(() => { const b = document.getElementById('bc-panel-toggle'); return [b.getAttribute('aria-label'), b.querySelector('.ui-icon')?.dataset.icon, b.innerText.trim()]; }),
      ['Settings & bests', 'panel', ''], 'the panel toggle: an icon alone, named');
    const narrow = await width();
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#board-choice-frame > .ui-frame__foot button')].map((b) => b.id)), ['bc-play'], 'the foot holds Play alone');
    assert.deepEqual(await ms(() => { const b = document.getElementById('board-choice-back'); return [b.innerText.trim(), b.getAttribute('aria-label'), b.getAttribute('title')]; }), ['', 'Back to Main menu', 'Back'], 'Back is the title bar\'s arrow alone, named, with its tooltip');

    // Learn 3D opens the panel on its own: only how 3D works and the note that it keeps no records; the window widens, centred.
    await page.click('#bc-learn');
    assert.deepEqual(await chosen(), ['learn']);
    assert.equal(await mode(), 'board-choice', 'a click chooses, and starts nothing');
    assert.deepEqual(await panels(), only('bc-learn-panel'));
    assert.equal(await pinned(), 'false', 'opening it on its own pins nothing');
    assert.ok(await width() > narrow, 'the window widens for the panel');
    assert.ok(await ms(() => { const r = document.getElementById('board-choice-frame').getBoundingClientRect(); return Math.abs(r.left + r.right - innerWidth) <= 1; }), 'and stays centred');
    assert.match(await text('bc-learn-panel'), /keeps no records[\s\S]*How 3D works[\s\S]*26 cubes around it[\s\S]*hold Ctrl to show them[\s\S]*always safe/);

    // A preset closes it again; the toggle pins it: the preset's settings and the board's bests.
    await page.click('#board-choice [data-preset="8,8,8,40"]');
    assert.deepEqual(await panels(), only(), 'a preset closes the panel unless pinned');
    assert.equal(await width(), narrow);
    await page.click('#bc-panel-toggle');
    assert.equal(await pinned(), 'true');
    assert.deepEqual(await panels(), only('bc-settings', 'bc-preset-settings', 'bc-bests'));
    assert.deepEqual(await tiles(), [['Time', '—', 'no best yet'], ['3BV/s', '—', 'no best yet'], ['Efficiency', '—', 'no best yet']]);
    // Cube Intermediate with no-guess off; a win recorded meanwhile shows at once, with its date.
    await page.click('#bc-noguess');
    assert.equal(await text('bc-bests-title'), 'Cube Intermediate · your bests');
    await ms(async () => {
      const { buildSummary } = await import('/js/records/summary.js');
      const engine = { outcome: 'won', bbbv: 20, bbbvSolved: 20, clicks: { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } } };
      globalThis.__ms.records.record(buildSummary({ engine, elapsedMs: 71902, board: { mode: '3d', width: 8, height: 8, depth: 8, mines: 40, noGuess: false }, seed: 1, generatorVersion: 1, endedAt: new Date(2026, 9, 11, 12), id: 'w-3d' }));
    });
    assert.deepEqual(await tiles(), [['Time', '71.902 s', '11 Oct 2026'], ['3BV/s', '0.28', '11 Oct 2026'], ['Efficiency', '80.0%', '11 Oct 2026']]);
    await page.click('#bc-noguess');
    assert.deepEqual((await tiles()).map((x) => x[1]), ['—', '—', '—'], 'the no-guess twin is another board');
    await page.click('#bc-noguess');

    // All records, under the bests, opens Records on the chosen board and switch; Back returns here, as it was.
    assert.equal(await text('bc-records'), 'All records');
    await page.click('#bc-records');
    assert.equal(await mode(), 'records');
    assert.match(await ms(() => document.querySelector('#records-picker [aria-checked="true"]')?.textContent ?? ''), /Cube Intermediate/);
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'board-choice');
    assert.deepEqual(await chosen(), ['8,8,8,40']);
    assert.equal(await ms(() => document.getElementById('bc-noguess').checked), false);
    assert.equal(await pinned(), 'true', 'still pinned');

    // Custom: its own switch, the four fields, Random, then the bests for that size; a refused board disables Play.
    await page.click('#board-choice [data-preset="custom"]');
    assert.deepEqual(await panels(), only('bc-settings', 'bc-custom-settings', 'custom', 'bc-bests'));
    // While Custom is chosen the panel stays open unpinned: the toggle changes only the stored preference.
    await page.click('#bc-panel-toggle');
    assert.equal(await pinned(), 'false');
    assert.deepEqual(await panels(), only('bc-settings', 'bc-custom-settings', 'custom', 'bc-bests'), 'Custom keeps it open');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.boardPanel') ?? 'null')?.data?.pinned === false);
    assert.equal(await text('bc-bests-title'), '10 × 10 × 10 · 25 mines · no-guess · your bests');
    assert.equal(await text('c-info'), '1,000 cells · up to 999 mines');
    await page.fill('#c-m', '1000');
    assert.equal(await ms(() => document.getElementById('bc-play').disabled), true);
    assert.equal(await text('c-refusal'), 'Mines must be a whole number from 1 to 999 on a 10 × 10 × 10 board');
    assert.equal(await text('c-info'), '1,000 cells · up to 999 mines', 'the info line keeps the size\'s line');
    await page.fill('#c-y', '2');
    await page.fill('#c-m', '40');
    assert.equal(await text('c-noguess-reason'), 'No-guess isn\'t available when a side is 2 cells');
    assert.equal(await text('bc-bests-title'), '10 × 2 × 10 · 40 mines · your bests');
    await page.fill('#c-y', '10');

    // Play on Learn 3D starts the guided board and saves no choice.
    await page.click('#bc-learn');
    await page.click('#bc-play');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    assert.equal(await text('ready-board'), 'Learn 3D');
    assert.equal(await lastChoice(), null, 'no last choice saved');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'board-choice');

    // Enter on an option chooses it and plays it, saved as the last choice.
    await ms(() => document.querySelector('#board-choice [data-preset="10,10,10,100"]').focus());
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'ready');
    assert.deepEqual(await ms(() => globalThis.__ms.state.settings), { X: 10, Y: 10, Z: 10, mines: 100 });
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice') ?? 'null')?.data.size === 'cube-expert');
    await page.keyboard.press('Escape');
    assert.deepEqual(await chosen(), ['10,10,10,100']);
    assert.equal(await ms(() => document.querySelector('#board-choice [data-preset="10,10,10,100"]').hasAttribute('data-last')), true, 'the last board played');
    assert.deepEqual(await panels(), only(), 'unpinned, a preset shows the Board list alone');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the 3D board choice at every supported window size: its window as narrow as its content, the panel widening it, centred under the title, no horizontal scroll, Play in the page, one column with the drawer on a phone that scrolls past the fold', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    // One page, resized: each size lays the open board choice out afresh.
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    await page.click('#menu-entry-3d');
    for (const [width, height, open] of [[1920, 1080, 1120], [1366, 768, 1080], [1024, 768, 984], [390, 844, 390]]) {
      await page.setViewportSize({ width, height });
      const at = `${width} × ${height}`;
      for (const option of ['learn', '8,8,8,40', 'custom', 'code']) {
        if (width <= 719) {
          await page.evaluate((o) => document.querySelector(`#board-choice [data-preset="${o}"]`).scrollIntoView({ block: 'center' }), option);
        }
        await page.click(`#board-choice [data-preset="${option}"]`);
        const m = await page.evaluate(() => {
          const r = (id) => document.getElementById(id).getBoundingClientRect();
          const body = document.getElementById('board-choice-body');
          return {
            scroll: document.documentElement.scrollWidth, layer: document.getElementById('board-choice').scrollWidth,
            frame: r('board-choice-frame'), body: [body.scrollHeight, body.clientHeight, body.scrollWidth, body.clientWidth],
            toggle: getComputedStyle(document.getElementById('bc-panel-toggle')).display, bar: getComputedStyle(document.getElementById('bc-drawer-bar')).display,
            label: document.getElementById('bc-drawer-bar').textContent, open: document.getElementById('bc-choice-panel').dataset.open,
            play: r('bc-play'), foot: r('board-choice-frame').bottom - document.querySelector('#board-choice-frame > .ui-frame__foot').getBoundingClientRect().top,
          };
        });
        const opens = option !== '8,8,8,40';
        assert.equal(m.open, String(opens), `${at} ${option}: the panel open for Learn 3D, Custom and the code only`);
        assert.ok(m.scroll <= width && m.layer <= width && m.body[2] <= m.body[3], `${at} ${option}: no horizontal scroll`);
        if (width > 719 && opens) assert.equal(Math.round(m.frame.width), open, `${at}: the window's width with the panel open`);
        if (width > 719 && !opens) assert.ok(Math.round(m.frame.width) < open && m.frame.width >= 460, `${at}: the window as narrow as its content`);
        if (width <= 719) assert.equal(Math.round(m.frame.width), open, `${at}: full-bleed`);
        assert.ok(m.frame.bottom <= height + 0.5 && m.play.bottom <= height, `${at} ${option}: the window and Play in the page`);
        assert.ok(m.play.right >= m.frame.right - 30, `${at} ${option}: Play at the foot's right`);
        if (width > 719) {
          const margin = width >= 1440 ? 40 : 24;
          const centred = Math.abs((m.frame.top + m.frame.bottom) / 2 - height / 2) <= 1;
          assert.ok(m.frame.top >= margin - 0.5 && (centred || m.frame.top - margin <= 0.5), `${at} ${option}: centred, or held at the canvas's margin`);
          assert.ok(Math.abs(m.frame.left + m.frame.right - width) <= 1, `${at} ${option}: centred across`);
          assert.notEqual(m.toggle, 'none', 'the panel toggle in the heading');
          assert.equal(m.bar, 'none', 'no drawer bar on a desktop window');
        } else {
          assert.equal(m.toggle, 'none', 'no panel toggle on a phone');
          assert.notEqual(m.bar, 'none', 'the drawer bar under the Board list');
          assert.equal(m.label, { learn: 'Learn 3D', code: 'Board code' }[option] ?? 'Board settings', `${option}: the drawer names what it holds`);
          assert.ok(Math.abs(m.play.bottom - height) <= 24, 'Play pinned at the bottom');
          assert.ok(m.foot <= 66, 'the slimmer bottom bar');
          if (option === 'custom') assert.ok(m.body[0] > m.body[1], 'the column scrolls past the fold');
        }
      }
      if (width <= 719) {
        // Pinned on a phone, a preset's drawer holds the bests as one row of three cells.
        await page.evaluate(() => document.querySelector('#board-choice [data-preset="8,8,8,40"]').scrollIntoView({ block: 'center' }));
        await page.click('#board-choice [data-preset="8,8,8,40"]');
        await page.evaluate(() => document.getElementById('bc-drawer-bar').scrollIntoView({ block: 'center' }));
        await page.click('#bc-drawer-bar');
        assert.equal(await page.evaluate(() => document.getElementById('bc-choice-panel').dataset.open), 'true', 'the bar pins the drawer open');
        const row = await page.evaluate(() => [...document.querySelectorAll('#bc-bests [data-best]')].map((x) => Math.round(x.getBoundingClientRect().top)));
        assert.equal(new Set(row).size, 1, 'the bests one row');
        await page.click('#bc-drawer-bar');
        assert.equal(await page.evaluate(() => document.getElementById('bc-choice-panel').dataset.open), 'false', 'and unpins it');
      }
    }
  } finally {
    await browser.close();
  }
});
