// The 3D board choice (js/mode3d/board-choice.js): the three cube presets, the validated custom
// board, the Random fill, the no-guess switch with its cell-count limit and its side-of-2 rule, the
// last 3D board choice kept through the shell's last-board-choice mechanism (js/shell/menu.js), and
// the screen's markup and wiring in index.html and js/main.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRESETS, FAMILIES, BOARD_SIZES, DEFAULT_CHOICE, DIM_MIN, DIM_MAX, NOGUESS_CELL_LIMIT, LAST_CHOICE_DOC, LAST_CHOICE_VERSION,
  presetKey, presetByKey, presetLabel, presetTitle, validateCustom, customStatus, noGuessAvailable, noGuessReason, normaliseChoice,
  readChoice, boardOf, randomBoard, densityHintShown,
} from '../js/mode3d/board-choice.js';
import { NOGUESS_DENSITY_HINT, DENSITY_HINT_TEXT, NOGUESS_HELP_TEXT } from '../js/classic2d/board-setup.js';
import { createLastBoardChoice } from '../js/shell/menu.js';
import { typicalBbbv } from '../js/records/typical-bbbv.js';
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

test('the 3D board choice offers the three cube presets, and no flat or double layer preset', () => {
  const rows = PRESETS.map((p) => [p.id, p.family, p.name, p.X, p.Y, p.Z, p.mines]);
  assert.deepEqual(rows, [
    ['cube-beginner', 'cube', 'Beginner', 6, 6, 6, 10],
    ['cube-intermediate', 'cube', 'Intermediate', 8, 8, 8, 40],
    ['cube-expert', 'cube', 'Expert', 12, 12, 8, 130],
  ]);
  assert.ok(PRESETS.every((p) => [p.X, p.Y, p.Z].every((side) => side > 2)), 'no flat or double layer preset');
  assert.deepEqual(FAMILIES.map((f) => [f.id, f.label]), [['cube', 'Cube']]);
  assert.deepEqual(BOARD_SIZES, [...PRESETS.map((p) => p.id), 'custom']);
  assert.ok(Object.isFrozen(PRESETS) && PRESETS.every(Object.isFrozen));
  assert.equal(presetKey(PRESETS[0]), '6,6,6,10');
  assert.equal(presetByKey('12,12,8,130').id, 'cube-expert');
  assert.equal(presetByKey('9,9,1,10'), null, 'a flat preset is no preset');
  assert.equal(presetByKey('8,8,2,10'), null, 'a double layer board is no preset');
  assert.equal(presetLabel(PRESETS[2]), '12 × 12 × 8 · 130 mines');
  for (const p of PRESETS) assert.equal(validateCustom(p).ok, true, `${p.id} is a valid board`);
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
      assert.equal(s.text, `${label} must be a whole number from 1 to 100.`);
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
    assert.equal(s.text, 'Mines must be a whole number from 1 to 999 on a 10 × 10 × 10 board.');
  }
  const ok = customStatus({ X: 10, Y: 10, Z: 10, mines: 25 });
  assert.deepEqual(ok, { ok: true, field: null, max: 999, text: '1,000 cells · up to 999 mines' });
});

test('a one-cell custom board is refused: no mine count fits beside the safe first click', () => {
  const s = customStatus({ X: 1, Y: 1, Z: 1, mines: 1 });
  assert.equal(s.ok, false);
  assert.equal(s.field, 'mines');
  assert.equal(s.max, 0);
  assert.equal(s.text, 'A 1 × 1 × 1 board has no room for a mine beside the safe first click — make it at least 2 cells.');
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
  assert.equal(last.played, false, 'nothing played yet');
  assert.deepEqual(await last.load(), DEFAULT_CHOICE);
  assert.equal(last.played, false);

  const choice = { size: 'custom', custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true };
  const saving = last.save(choice);
  assert.deepEqual(last.current, choice, 'current changes at once');
  assert.equal(last.played, true);
  await saving;

  const again = lastChoice(memoryStorage(null, backend));
  assert.deepEqual(await again.load(), choice, 'a later launch restores X, Y, Z, mines and no-guess');
  assert.equal(again.played, true);
  await assert.rejects(() => again.save({ size: 'custom', custom: { X: 0, Y: 1, Z: 1, mines: 1 }, noGuess: false }), RangeError);
  assert.deepEqual(again.current, choice, 'an invalid choice changes nothing');
});

test('a malformed stored 3D choice falls back to the default; the 2D choice is a different document', async () => {
  const storage = memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: 1, data: { size: 'custom', custom: { X: 500 }, noGuess: false } }) });
  const last = lastChoice(storage);
  assert.deepEqual(await last.load(), DEFAULT_CHOICE);
  assert.equal(last.played, false);
  const { LAST_CHOICE_DOC: doc2d } = await import('../js/classic2d/board-setup.js');
  assert.notEqual(LAST_CHOICE_DOC, doc2d, 'each mode keeps its own last board choice');
});

test('a remembered double layer choice opens on cube Beginner', async () => {
  for (const size of ['double-beginner', 'double-intermediate', 'double-expert']) {
    const data = { size, custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true };
    const last = lastChoice(memoryStorage({ [LAST_CHOICE_DOC]: JSON.stringify({ version: LAST_CHOICE_VERSION, data }) }));
    const choice = await last.load();
    assert.equal(choice.size, 'cube-beginner', size);
    assert.deepEqual(boardOf(choice), { X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }, 'the fallback opens with no-guess on');
  }
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

test('index.html offers the three cube presets, the custom board, Random, the no-guess switch and Back', () => {
  const presets = [...BOARD.matchAll(/<button type="button" class="ui-menu__item" data-preset="([\d,]+)"><span class="ui-menu__label">([^<]+)<\/span><span class="ui-menu__detail">([^<]+)<\/span><\/button>/g)];
  assert.deepEqual(presets.map((m) => m[1]), PRESETS.map(presetKey));
  assert.deepEqual(presets.map((m) => m[2]), ['Cube Beginner', 'Cube Intermediate', 'Cube Expert'], 'the preset says its family, as results and Records do');
  assert.deepEqual(presets.map((m) => m[2]), PRESETS.map(presetTitle));
  assert.deepEqual(presets.map((m) => m[3].replace(/&times;/g, '×').replace(/&middot;/g, '·')), PRESETS.map(presetLabel));
  for (const f of FAMILIES) assert.doesNotMatch(BOARD, new RegExp(`id="bc-${f.id}"|>${f.label}</h2>`), 'no family heading above the presets');
  assert.match(BOARD, /<div class="ui-menu" role="group" aria-label="Presets">\s*<button type="button" class="ui-menu__item" data-preset=/, 'the presets menu keeps an accessible name');
  assert.doesNotMatch(BOARD, /data-preset="\d+,\d+,1,\d+"/, 'no flat preset');
  assert.doesNotMatch(BOARD, /data-preset="\d+,\d+,2,\d+"|bc-double|Double layer/, 'no double layer group');
  assert.doesNotMatch(read('css/components.css'), /Double layer|bc-double/, 'no double layer group in the styles');
  for (const [f, id] of [['X', 'c-x'], ['Y', 'c-y'], ['Z', 'c-z'], ['mines', 'c-m']]) {
    assert.match(BOARD, new RegExp(`<input id="${id}" data-field="${f}" class="ui-field__input" type="number"`), f);
  }
  assert.match(BOARD, /id="c-x"[^>]*min="1" max="100"/);
  assert.match(BOARD, /<button type="button" id="c-random" class="ui-button ui-button--secondary" data-random>Random<\/button>/);
  assert.match(BOARD, /<button type="submit" id="c-start" class="ui-button ui-button--primary" data-preset="custom">Start<\/button>/);
  assert.match(BOARD, /<p id="c-info" class="ui-text ui-text--muted" data-info>/);
  const presetsSwitch = BOARD.indexOf('<label class="ui-toggle"><input type="checkbox" role="switch" id="bc-noguess" class="ui-toggle__input" data-noguess="presets">');
  assert.ok(presetsSwitch > BOARD.lastIndexOf('data-preset="1') && presetsSwitch < BOARD.indexOf('<form id="custom"'), 'the presets\' switch sits under the presets');
  const help = BOARD.indexOf(`<p id="bc-noguess-help" class="ui-text ui-text--muted">${NOGUESS_HELP_TEXT}</p>`);
  assert.equal(NOGUESS_HELP_TEXT, 'Solvable by logic alone, no 50/50 guesses. Separate records.');
  assert.ok(help > presetsSwitch && help < BOARD.indexOf('<form id="custom"'), 'one helper line under the presets\' switch, before the custom panel');
  const form = BOARD.slice(BOARD.indexOf('<form id="custom"'), BOARD.indexOf('</form>'));
  const reason = form.indexOf('data-noguess-reason');
  const toggle = form.indexOf('<label class="ui-toggle"><input type="checkbox" role="switch" id="c-noguess" class="ui-toggle__input" data-noguess="custom">');
  assert.ok(reason > 0 && toggle > reason, 'the custom board\'s switch sits in its panel, under its reason line');
  assert.match(form, /<p id="c-noguess-reason" class="ui-text ui-text--muted hidden" data-noguess-reason><\/p>/);
  const hint = form.indexOf('<p id="c-density-hint" class="ui-text ui-text--muted hidden" data-density-hint></p>');
  assert.ok(hint > toggle, 'the density hint sits under the custom board\'s switch');
  assert.match(BOARD, /id="board-choice-back" class="ui-button ui-button--secondary" data-back>Back/);
  assert.doesNotMatch(BOARD, /data-best/);
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
  assert.match(MAIN, /'board-choice': \{[^\n]*defaultFocus: '\[data-preset\]\[data-last\]'[^\n]*CHOICE_3D\.show\(LAST_CHOICE_3D\.current, \{ played: LAST_CHOICE_3D\.played, details: presetDetails\(CHOICE_ITEMS\['3d'\], RECORDS\) \}\)/);
  assert.match(MAIN, /onStart: \(choice\) => \{[^\n]*LAST_CHOICE_3D\.save\(choice\)[^\n]*MODES\.start\('3d', boardOf\(choice\)\)/);
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /3D board choice \(index\.html #board-choice\)[\s\S]*?no-guess ui-toggle[\s\S]*?Default focus: the last board choice/);
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
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const info = () => ms(() => document.getElementById('c-info').textContent);
    const sw = () => ms(() => {
      const s = document.getElementById('c-noguess');
      const r = document.getElementById('c-noguess-reason');
      return { disabled: s.disabled, checked: s.checked, reason: r.classList.contains('hidden') ? '' : r.textContent };
    });

    await page.click('#menu-entry-3d');
    assert.equal(await mode(), 'board-choice');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '6,6,6,10', 'the first preset takes the focus when none was played');
    assert.equal(await ms(() => [...document.querySelectorAll('#board-choice [data-preset] [data-last]')].filter((l) => !l.classList.contains('hidden')).length), 0,
      'nothing is "Last played" before a game');
    assert.equal(await ms(() => document.querySelectorAll('#board-choice [data-best]').length), 0, 'no best times');
    // Each preset carries one detail line, between its size line and its "Last played" line.
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#board-choice [data-preset]:not([type="submit"])')].map((b) => [...b.children].map((c) => (c.hasAttribute('data-detail') ? `detail: ${c.textContent}` : c.className)))),
      PRESETS.map((p) => ['ui-menu__label', 'ui-menu__detail', `detail: ${['4.6', '7.8', '11'][PRESETS.indexOf(p)]} % mines · ~${typicalBbbv({ mode: '3d', width: p.X, height: p.Y, depth: p.Z, mines: p.mines, noGuess: true })} 3BV · —`, 'ui-menu__detail hidden']));

    // The fields name what is out of range.
    await page.fill('#c-y', '0');
    assert.equal(await info(), 'Height must be a whole number from 1 to 100.');
    assert.ok(await ms(() => document.getElementById('c-y').hasAttribute('data-adjusted')));
    await page.fill('#c-y', '1');
    await page.fill('#c-x', '1');
    await page.fill('#c-z', '1');
    await page.fill('#c-m', '1');
    assert.match(await info(), /^A 1 × 1 × 1 board has no room for a mine/);
    await page.click('#c-start');
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

    // Random fills valid fields.
    await page.click('#c-random');
    assert.ok(await ms(() => ['c-x', 'c-y', 'c-z', 'c-m'].every((id) => /^\d+$/.test(document.getElementById(id).value))));

    // Start a custom board by keyboard; the choice is remembered and restored on return.
    await page.fill('#c-x', '4');
    await page.fill('#c-y', '5');
    await page.fill('#c-z', '6');
    await page.fill('#c-m', '11');
    await page.focus('#c-start');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'ready');
    assert.deepEqual(await ms(() => globalThis.__ms.state.settings), { X: 4, Y: 5, Z: 6, mines: 11 });
    await page.click('#ready-back');
    assert.equal(await mode(), 'board-choice');
    assert.equal(await ms(() => document.activeElement?.id), 'c-start', 'the custom board keeps the focus');
    await page.waitForFunction(() => localStorage.getItem('ms3d:doc:mode3d.lastChoice') !== null);
    assert.deepEqual(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data),
      { size: 'custom', custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true });

    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.click('#menu-entry-3d');
    assert.deepEqual(await ms(() => ['c-x', 'c-y', 'c-z', 'c-m'].map((id) => document.getElementById(id).value)), ['4', '5', '6', '11']);
    assert.equal((await sw()).checked, true, 'the no-guess switch is restored');
    assert.equal(await ms(() => document.activeElement?.id), 'c-start', 'the last choice takes the focus');

    assert.equal(await ms(() => document.getElementById('bc-noguess').checked), true, 'the presets\' switch shows the choice');

    // A preset by mouse, with no-guess switched by keyboard, above the custom limit.
    await page.fill('#c-x', '100');
    await page.fill('#c-y', '100');
    await page.fill('#c-z', '100');
    await page.focus('#bc-noguess');
    await page.keyboard.press('Space');
    assert.equal(await ms(() => document.getElementById('bc-noguess').checked), false);
    await page.click('#board-choice [data-preset="8,8,8,40"]');
    assert.equal(await mode(), 'ready');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data.size === 'cube-intermediate');
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data.noGuess), false);
    await page.click('#ready-back');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '8,8,8,40');
    assert.equal(await ms(() => document.querySelector('[data-preset="8,8,8,40"] [data-last]').classList.contains('hidden')), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- Play this board

test('both board choices hold a board code field with Play this board, wired to the shell', () => {
  const html = read('index.html');
  for (const [section, prefix] of [['<section id="board-choice"', 'bc'], ['<section id="c2d-choice"', 'c2d']]) {
    const part = html.slice(html.indexOf(section), html.indexOf('</section>\n  </section>', html.indexOf(section)));
    assert.match(part, new RegExp(`<input id="${prefix}-code" data-code-field class="ui-field__input" type="text"`));
    assert.match(part, new RegExp(`<button type="button" id="${prefix}-code-play" class="ui-button ui-button--secondary" data-code-play disabled>Play this board</button>`));
    assert.match(part, new RegExp(`<p id="${prefix}-code-info" class="ui-text ui-text--muted" data-code-info>${CODE_PROMPT}</p>`));
  }
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
      warn: document.getElementById(`${p}-code-info`).classList.contains('ui-text--warning'),
      disabled: document.getElementById(`${p}-code-play`).disabled,
    }), prefix);
    const two = encodeBoardCode({ board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, seed: 3, startCell: 40, generatorVersion: 1 });
    const three = encodeBoardCode({ board: { mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: false }, seed: 9, startCell: 129, generatorVersion: 1 });

    await page.click('#menu-entry-3d');
    assert.deepEqual(await field('bc'), { info: CODE_PROMPT, warn: false, disabled: true });
    await page.fill('#bc-code', 'nonsense');
    assert.deepEqual(await field('bc'), { info: CODE_REASONS.malformed, warn: true, disabled: true });
    await page.fill('#bc-code', two);
    assert.deepEqual(await field('bc'), { info: otherModeHint('classic-2d'), warn: true, disabled: true });
    await page.fill('#bc-code', three.toLowerCase());
    assert.equal((await field('bc')).disabled, false);
    assert.match((await field('bc')).info, /^Cube Beginner · a challenge, not eligible for bests$/);
    await page.click('#bc-code-play');
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
    await page.fill('#c2d-code', dailyGame('expert', dateText()).code);
    assert.equal((await field('c2d')).disabled, false);
    await page.press('#c2d-code', 'Enter');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'daily', 'today\'s daily opens the Daily screen');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
