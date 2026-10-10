// The 3D board choice (js/mode3d/board-choice.js): the six presets, the validated custom board,
// the Random fill, the no-guess switch and its cell-count limit, the last 3D board choice kept
// through the shell's last-board-choice mechanism (js/shell/menu.js), and the screen's markup and
// wiring in index.html and js/main.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PRESETS, FAMILIES, BOARD_SIZES, DEFAULT_CHOICE, DIM_MIN, DIM_MAX, NOGUESS_CELL_LIMIT, LAST_CHOICE_DOC, LAST_CHOICE_VERSION,
  presetKey, presetByKey, presetLabel, validateCustom, customStatus, noGuessAvailable, noGuessReason, normaliseChoice,
  readChoice, boardOf, randomBoard,
} from '../js/mode3d/board-choice.js';
import { createLastBoardChoice } from '../js/shell/menu.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

// ---------------------------------------------------------------- presets

test('the 3D board choice offers the six double layer and cube presets, and no flat preset', () => {
  const rows = PRESETS.map((p) => [p.id, p.family, p.name, p.X, p.Y, p.Z, p.mines]);
  assert.deepEqual(rows, [
    ['double-beginner', 'double', 'Beginner', 8, 8, 2, 10],
    ['double-intermediate', 'double', 'Intermediate', 14, 14, 2, 60],
    ['double-expert', 'double', 'Expert', 25, 16, 2, 130],
    ['cube-beginner', 'cube', 'Beginner', 6, 6, 6, 10],
    ['cube-intermediate', 'cube', 'Intermediate', 8, 8, 8, 40],
    ['cube-expert', 'cube', 'Expert', 12, 12, 8, 130],
  ]);
  assert.ok(PRESETS.every((p) => p.Z > 1), 'the flat 3D presets are gone');
  assert.deepEqual(FAMILIES.map((f) => f.id), ['double', 'cube']);
  assert.deepEqual(BOARD_SIZES, [...PRESETS.map((p) => p.id), 'custom']);
  assert.ok(Object.isFrozen(PRESETS) && PRESETS.every(Object.isFrozen));
  assert.equal(presetKey(PRESETS[3]), '6,6,6,10');
  assert.equal(presetByKey('12,12,8,130').id, 'cube-expert');
  assert.equal(presetByKey('9,9,1,10'), null, 'a flat preset is no preset');
  assert.equal(presetLabel(PRESETS[2]), '25 × 16 × 2 · 130 mines');
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
  assert.equal(noGuessAvailable({ size: 'custom', custom: { X: 1, Y: 1, Z: 2, mines: 1 }, noGuess: true }), true);
  const over = { size: 'custom', custom: { X: 100, Y: 100, Z: 100, mines: 1 }, noGuess: true };
  assert.equal(noGuessAvailable(over), false, 'above the limit');
  assert.equal(noGuessAvailable(custom(2)), true);
  assert.equal(noGuessReason(), `No-guess is available up to ${NOGUESS_CELL_LIMIT.toLocaleString('en-US')} cells`);
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
  assert.deepEqual(DEFAULT_CHOICE, { size: 'double-beginner', custom: { X: 10, Y: 10, Z: 10, mines: 25 }, noGuess: false });
  assert.equal(normaliseChoice(DEFAULT_CHOICE).size, 'double-beginner');
  assert.equal(normaliseChoice(null), null);
  assert.equal(normaliseChoice({ size: 'flat-beginner', custom: DEFAULT_CHOICE.custom, noGuess: false }), null);
  assert.equal(normaliseChoice({ size: 'custom', custom: { X: 0, Y: 1, Z: 1, mines: 1 }, noGuess: false }), null);
  assert.equal(normaliseChoice({ size: 'cube-expert', custom: DEFAULT_CHOICE.custom, noGuess: 'yes' }), null);
  assert.deepEqual(normaliseChoice({ size: 'cube-expert', noGuess: true }),
    { size: 'cube-expert', custom: DEFAULT_CHOICE.custom, noGuess: true }, 'a preset without custom fields takes the default');
  const big = { X: 100, Y: 100, Z: 100, mines: 10 };
  assert.equal(normaliseChoice({ size: 'custom', custom: big, noGuess: true }).noGuess, false, 'no no-guess above the limit');
  assert.equal(normaliseChoice({ size: 'double-expert', custom: big, noGuess: true }).noGuess, true, 'a preset keeps it');

  assert.deepEqual(boardOf({ size: 'double-intermediate', custom: big, noGuess: true }), { X: 14, Y: 14, Z: 2, mines: 60, noGuess: true });
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

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const UI_SRC = strip(read('js/ui.js'));
const BOARD = INDEX.slice(INDEX.indexOf('<section id="board-choice"'), INDEX.indexOf('<!-- Coming soon -->'));

test('index.html offers the six presets by family, the custom board, Random, the no-guess switch and Back', () => {
  const presets = [...BOARD.matchAll(/<button type="button" class="ui-menu__item" data-preset="([\d,]+)"><span class="ui-menu__label">([^<]+)<\/span><span class="ui-menu__detail">([^<]+)<\/span><\/button>/g)];
  assert.deepEqual(presets.map((m) => m[1]), PRESETS.map(presetKey));
  assert.deepEqual(presets.map((m) => m[2]), PRESETS.map((p) => p.name));
  assert.deepEqual(presets.map((m) => m[3].replace(/&times;/g, '×').replace(/&middot;/g, '·')), PRESETS.map(presetLabel));
  for (const f of FAMILIES) assert.match(BOARD, new RegExp(`<h2 class="ui-heading" id="bc-${f.id}">${f.label}</h2>`));
  assert.doesNotMatch(BOARD, /data-preset="\d+,\d+,1,\d+"/, 'no flat preset');
  for (const [f, id] of [['X', 'c-x'], ['Y', 'c-y'], ['Z', 'c-z'], ['mines', 'c-m']]) {
    assert.match(BOARD, new RegExp(`<input id="${id}" data-field="${f}" class="ui-field__input" type="number"`), f);
  }
  assert.match(BOARD, /id="c-x"[^>]*min="1" max="100"/);
  assert.match(BOARD, /<button type="button" id="c-random" class="ui-button ui-button--secondary" data-random>Random<\/button>/);
  assert.match(BOARD, /<button type="submit" id="c-start" class="ui-button ui-button--primary" data-preset="custom">Start<\/button>/);
  assert.match(BOARD, /<p id="c-info" class="ui-text ui-text--muted" data-info>/);
  const presetsSwitch = BOARD.indexOf('<label class="ui-toggle"><input type="checkbox" role="switch" id="bc-noguess" class="ui-toggle__input" data-noguess="presets">');
  assert.ok(presetsSwitch > BOARD.lastIndexOf('data-preset="1') && presetsSwitch < BOARD.indexOf('<form id="custom"'), 'the presets\' switch sits under the presets');
  const form = BOARD.slice(BOARD.indexOf('<form id="custom"'), BOARD.indexOf('</form>'));
  const reason = form.indexOf('data-noguess-reason');
  const toggle = form.indexOf('<label class="ui-toggle"><input type="checkbox" role="switch" id="c-noguess" class="ui-toggle__input" data-noguess="custom">');
  assert.ok(reason > 0 && toggle > reason, 'the custom board\'s switch sits in its panel, under its reason line');
  assert.match(form, /<p id="c-noguess-reason" class="ui-text ui-text--muted hidden" data-noguess-reason><\/p>/);
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
  assert.match(MAIN, /'board-choice': \{[^\n]*defaultFocus: '\[data-preset\]\[data-last\]'[^\n]*CHOICE_3D\.show\(LAST_CHOICE_3D\.current, \{ played: LAST_CHOICE_3D\.played \}\)/);
  assert.match(MAIN, /onStart: \(choice\) => \{[^\n]*LAST_CHOICE_3D\.save\(choice\)[^\n]*MODES\.start\('3d', boardOf\(choice\)\)/);
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /3D board choice \(index\.html #board-choice\)[\s\S]*?no-guess ui-toggle[\s\S]*?Default focus: the last board choice/);
});

// ---------------------------------------------------------------- browser

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

test('in a browser, the custom board validates, the switch follows the limit and the choice is restored', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
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
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '8,8,2,10', 'the first preset takes the focus when none was played');
    assert.equal(await ms(() => [...document.querySelectorAll('#board-choice [data-preset] [data-last]')].filter((l) => !l.classList.contains('hidden')).length), 0,
      'nothing is "Last played" before a game');
    assert.equal(await ms(() => document.querySelectorAll('#board-choice [data-best]').length), 0, 'no best times');

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
    await page.fill('#c-x', '2');
    await page.fill('#c-y', '2');
    await page.fill('#c-z', '2');
    await page.fill('#c-m', '3');
    assert.deepEqual(await sw(), { disabled: false, checked: false, reason: '' });
    await page.check('#c-noguess');
    await page.fill('#c-x', '100');
    await page.fill('#c-y', '100');
    assert.deepEqual(await sw(), { disabled: true, checked: false, reason: `No-guess is available up to ${NOGUESS_CELL_LIMIT.toLocaleString('en-US')} cells` });
    assert.equal(await ms(() => document.getElementById('bc-noguess').disabled), false, 'the presets keep their switch above the limit');
    await page.fill('#c-x', '2');
    await page.fill('#c-y', '2');
    assert.equal((await sw()).checked, true, 'the custom board\'s choice comes back at or below the limit');

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
    await page.click('#board-choice [data-preset="14,14,2,60"]');
    assert.equal(await mode(), 'ready');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data.size === 'double-intermediate');
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:mode3d.lastChoice')).data.noGuess), false);
    await page.click('#ready-back');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '14,14,2,60');
    assert.equal(await ms(() => document.querySelector('[data-preset="14,14,2,60"] [data-last]').classList.contains('hidden')), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
