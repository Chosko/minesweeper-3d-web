// The returning player's surface: the preset detail line on the 3D board choice and the board's bests
// on the Classic 2D one, over a records model built here; the typical 3BV table; that the main menu keeps no Play again and no session strip; and
// a browser run of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoardIdentity, STANDARD_BOARDS, PRESETS_3D } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createRecordsModel } from '../js/records/model.js';
import { TYPICAL_BBBV, typicalBbbv, typicalBbbvKey } from '../js/records/typical-bbbv.js';
import * as RETURNING from '../js/shell/returning.js';

const { densityText, presetDetail, presetDetails, boardBests, NO_BEST } = RETURNING;
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const square = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const box = (width, height, depth, mines, noGuess = false) => createBoardIdentity({ mode: '3d', width, height, depth, mines, noGuess });
const EXPERT = square(30, 16, 99);
const EXPERT_NG = square(30, 16, 99, true);
const CUBE_INT = box(8, 8, 8, 40);
const CUBE_INT_NG = box(8, 8, 8, 40, true);

let nextId = 1;
/** A summary through the real builder, ended at `endedAt` (a Date). */
function game({ board = EXPERT, outcome = 'won', ms = 13343, endedAt = new Date(2026, 9, 12, 12, 0) } = {}) {
  const engine = { bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 15, clicks: { reveal: { effective: 20, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } } };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  return buildSummary({ engine, elapsedMs: ms, board, seed: 7, generatorVersion: 1, endedAt, id: `g-${nextId++}` });
}
function model(games) {
  const m = createRecordsModel();
  for (const g of games) m.record(game(g));
  return m;
}

// ---------------------------------------------------------------- typical 3BV

test('every named board has a typical 3BV, keyed by its size and mines, the same with and without no-guess', () => {
  for (const { width, height, mines } of STANDARD_BOARDS) {
    for (const noGuess of [false, true]) {
      const v = typicalBbbv(square(width, height, mines, noGuess));
      assert.ok(Number.isInteger(v) && v > 0, `${width} × ${height} · ${mines} has a typical 3BV`);
    }
  }
  for (const { width, height, depth, mines } of PRESETS_3D) {
    for (const noGuess of [false, true]) {
      const v = typicalBbbv(box(width, height, depth, mines, noGuess));
      assert.ok(Number.isInteger(v) && v > 0, `${width} × ${height} × ${depth} · ${mines} has a typical 3BV`);
    }
  }
  assert.equal(Object.keys(TYPICAL_BBBV).length, STANDARD_BOARDS.length + PRESETS_3D.length, 'one entry per named board, nothing else');
  assert.equal(typicalBbbvKey(EXPERT), '30x16:99');
  assert.equal(typicalBbbvKey(CUBE_INT), '8x8x8:40');
  assert.equal(typicalBbbv(square(20, 12, 50)), null, 'a custom board has none');
  assert.equal(typicalBbbv(box(10, 10, 10, 101)), null, 'a preset whose mines change has no entry until it is measured again');
  assert.equal(typicalBbbv(box(10, 10, 11, 100)), null, 'nor one whose size changes');
  assert.equal(typicalBbbv(box(12, 12, 8, 130)), null, 'the former Cube Expert is no named board');
  assert.ok(Object.isFrozen(TYPICAL_BBBV));
});

test('the typical 3BV table is measured: its head comment names the script, which generates through the worker\'s generate', () => {
  const head = read('js/records/typical-bbbv.js').match(/^(\/\/.*\n)+/)[0];
  assert.match(head, /dev\/measure-typical-bbbv\.mjs/);
  const script = read('dev/measure-typical-bbbv.mjs');
  assert.match(script, /import \{[^}]*\bgenerate\b[^}]*\} from '\.\.\/js\/generation\/generate\.js'/);
  assert.match(script, /STANDARD_BOARDS/);
  assert.match(script, /PRESETS_3D/);
  assert.match(script, /noGuess: true/, 'no-guess on, the board choices\' default');
});

// ---------------------------------------------------------------- the preset detail line

test('density is mines ÷ cells as a whole percent, with one decimal below 10 %', () => {
  assert.equal(densityText(square(9, 9, 10)), '12 % mines');
  assert.equal(densityText(square(16, 16, 40)), '16 % mines');
  assert.equal(densityText(EXPERT), '21 % mines');
  assert.equal(densityText(box(6, 6, 6, 10)), '4.6 % mines');
  assert.equal(densityText(CUBE_INT), '7.8 % mines');
  assert.equal(densityText(box(12, 12, 8, 130)), '11 % mines');
  assert.equal(densityText(square(10, 10, 5)), '5.0 % mines');
  assert.equal(densityText(square(50, 50, 249)), '10 % mines', '9.96 % rounds up to a whole 10 %');
  assert.equal(densityText(square(10, 10, 10)), '10 % mines');
});

test('the preset detail line: density, typical 3BV, then the best and streak, or a dash', () => {
  const bbbv = typicalBbbv(CUBE_INT);
  assert.equal(presetDetail(CUBE_INT, model([])), `7.8 % mines · ~${bbbv} 3BV · —`, 'no won game: a dash');
  assert.equal(presetDetail(CUBE_INT, model([{ board: CUBE_INT, outcome: 'lost' }])), `7.8 % mines · ~${bbbv} 3BV · —`, 'a lost game sets no best');
  const won = model([{ board: CUBE_INT, ms: 48213 }, { board: CUBE_INT, ms: 50000 }, { board: CUBE_INT, ms: 49000 }]);
  assert.equal(presetDetail(CUBE_INT, won), `7.8 % mines · ~${bbbv} 3BV · Best 48.213 s · 3 in a row`);
  const broken = model([{ board: CUBE_INT, ms: 48213 }, { board: CUBE_INT, outcome: 'abandoned' }]);
  assert.equal(presetDetail(CUBE_INT, broken), `7.8 % mines · ~${bbbv} 3BV · Best 48.213 s`, 'no streak: the best alone (an abandoned game ends it)');
  assert.equal(presetDetail(square(20, 12, 50), model([])), '21 % mines · —', 'no typical 3BV: that part is left out');
});

test('a board and its no-guess twin are read separately', () => {
  const m = model([{ board: EXPERT_NG, ms: 13343 }, { board: EXPERT_NG, ms: 14000 }, { board: EXPERT, ms: 99999, outcome: 'lost' }]);
  const bbbv = typicalBbbv(EXPERT);
  assert.equal(presetDetail(EXPERT_NG, m), `21 % mines · ~${bbbv} 3BV · Best 13.343 s · 2 in a row`);
  assert.equal(presetDetail(EXPERT, m), `21 % mines · ~${bbbv} 3BV · —`);
  const details = presetDetails({ expert: { mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99 } }, m);
  assert.deepEqual(details, { expert: { guess: presetDetail(EXPERT, m), noGuess: presetDetail(EXPERT_NG, m) } }, 'one line per switch state, per item');
});

// ---------------------------------------------------------------- the Classic 2D board's bests

test('the board\'s bests: time, 3BV/s and efficiency in the results formats, each with its date, or a dash and no best yet', () => {
  assert.equal(NO_BEST, 'no best yet');
  const none = [['time', 'Time', '—', 'no best yet'], ['bbbvPerSecond', '3BV/s', '—', 'no best yet'], ['efficiency', 'Efficiency', '—', 'no best yet']];
  const rows = (b) => b.map(({ stat, label, value, note }) => [stat, label, value, note]);
  assert.deepEqual(rows(boardBests(EXPERT, model([]))), none);
  assert.deepEqual(rows(boardBests(EXPERT, model([{ board: EXPERT, outcome: 'lost' }]))), none, 'a lost game sets no best');
  const m = model([
    { board: EXPERT, ms: 50000, endedAt: new Date(2026, 9, 2, 12) },
    { board: EXPERT, ms: 40000, endedAt: new Date(2026, 9, 9, 12) },
  ]);
  assert.deepEqual(rows(boardBests(EXPERT, m)), [
    ['time', 'Time', '40.000 s', '9 Oct 2026'], ['bbbvPerSecond', '3BV/s', '0.50', '9 Oct 2026'], ['efficiency', 'Efficiency', '100.0%', '2 Oct 2026'],
  ], 'each best with the date it was set');
  assert.deepEqual(rows(boardBests(EXPERT_NG, m)), none, 'the no-guess twin is another board');
});

// ---------------------------------------------------------------- no Play again, no session strip

test('the main menu keeps no Play again and no session strip: returning.js has no menu surfaces and the shell none', () => {
  assert.deepEqual(Object.keys(RETURNING).sort(), ['CHOICE_ITEMS', 'NO_BEST', 'boardBests', 'densityText', 'presetDetail', 'presetDetails']);
  const index = read('index.html');
  const menu = index.slice(index.indexOf('<section id="menu"'), index.indexOf('<!-- 3D board choice -->'));
  assert.doesNotMatch(menu, /menu-again|menu-strip|Play again/);
  const main = read('js/main.js');
  assert.doesNotMatch(main, /playAgainFromMenu|showReturning|returningMenu|lastBoard\(|onMenuPlayAgain/);
  assert.doesNotMatch(read('js/ui.js'), /setReturning|menu-again|menu-strip|onMenuPlayAgain/);
});

test('the helpers are DOM-free and read the records only through the queries they are handed', () => {
  const src = strip(read('js/shell/returning.js'));
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
  assert.doesNotMatch(src, /records\/store\.js|createRecordsStore/);
  assert.match(src, /import \{[^}]*\bformatTime\b[^}]*\} from '\.\.\/results\/view\.js'/, 'the results time format');
  for (const binder of ['js/mode3d/board-choice.js', 'js/classic2d/board-choice.js']) {
    assert.doesNotMatch(strip(read(binder)), /records\/|returning\.js/, `${binder} receives its detail text, never the store`);
  }
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const MENU = INDEX.slice(INDEX.indexOf('<section id="menu"'), INDEX.indexOf('<!-- 3D board choice -->'));

test('each no-guess switch says once that no-guess boards keep separate records', () => {
  const sections = [
    INDEX.slice(INDEX.indexOf('<section id="c2d-choice"'), INDEX.indexOf('<!-- Classic 2D board -->')),
    INDEX.slice(INDEX.indexOf('<section id="board-choice"'), INDEX.indexOf('<!-- Coming soon -->')),
  ];
  let switches = 0;
  for (const html of sections) {
    for (const m of html.matchAll(/<label class="ui-toggle"><input type="checkbox" role="switch" id="([\w-]+)"[^>]*data-noguess[^>]*><span class="ui-toggle__label">([^<]+)<\/span><\/label>(\s*<p id="[\w-]+-help"[^>]*>([^<]+)<\/p>)?/g)) {
      switches++;
      const [, id, raw, , help] = m;
      const label = raw.replace(/&middot;/g, '·');
      const said = [label, help ?? ''].join(' ').match(/separate records/gi)?.length ?? 0;
      assert.equal(said, 1, `#${id} says it once`);
      if (!help) assert.equal(label, 'No-guess board · separate records', `#${id} has no helper line: its label says it`);
    }
  }
  assert.equal(switches, 3, 'the 2D switch and both 3D switches');
});

test('the shell hands the 3D board choice its detail lines and the Classic 2D one its bests, redrawn on the records\' change notification', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /'board-choice': \{[^\n]*CHOICE_3D\.show\([^\n]*details: /, 'the 3D board choice is handed its detail lines');
  assert.match(table, /'classic-2d-choice': \{[^\n]*showChoice2D\(/);
  assert.doesNotMatch(MAIN, /presetDetails\(CHOICE_ITEMS\['classic-2d'\]/, 'no detail lines on the Classic 2D options');
  assert.match(MAIN, /bests: \(identity\) => boardBests\(identity, RECORDS\)/, 'read through the store\'s queries');
  assert.match(MAIN, /RECORDS\.onChange\(\(\) => CHOICE_2D\.refresh\(\)\)/, 'and its change notification');
});

test('the catalogue documents the preset detail lines, and no Play again or session strip on the main menu', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  const menu = head.slice(head.indexOf('Main menu (index.html #menu)'), head.indexOf('3D board choice (index.html #board-choice)'));
  assert.doesNotMatch(menu, /Play again|session strip/);
  assert.match(head, /3D board choice \(index\.html #board-choice\)[\s\S]*?detail line[\s\S]*?Default focus/);
  assert.match(head, /Classic 2D board choice \(index\.html #c2d-choice\)[\s\S]*?bests[\s\S]*?Default focus/);
});

// ---------------------------------------------------------------- browser

/** Records a won game on `board` through the page's records store. */
function recordWin(page, { board, ms }) {
  return page.evaluate(async ({ board: b, ms: elapsed }) => {
    const { buildSummary } = await import('/js/records/summary.js');
    const engine = { outcome: 'won', bbbv: 20, bbbvSolved: 20, clicks: { reveal: { effective: 20, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } } };
    globalThis.__ms.records.record(buildSummary({ engine, elapsedMs: elapsed, board: b, seed: 1, generatorVersion: 1, endedAt: new Date(), id: `w-${Math.random()}` }));
  }, { board, ms });
}

test('in a browser, the detail lines and the bests follow the records and the switch, and the menu opens on the last mode, whose board choice opens on the last board', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const shown = (sel) => ms((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, sel);
    const text = (sel) => ms((s) => document.querySelector(s).textContent, sel);
    const detail = (item) => ms((s) => document.querySelector(`${s} [data-detail]`).textContent, item);
    const c3d = typicalBbbv(CUBE_INT);

    // The 2D board choice: the chosen board's bests, no detail line on an option.
    const best = () => ms(() => document.querySelector('#c2d-best-time .ui-stat__value').textContent);
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.equal(await ms(() => document.querySelectorAll('#c2d-choice [data-detail]').length), 0);
    await page.click('#c2d-choice [data-size="expert"]');
    assert.equal(await best(), '—');
    assert.equal(await ms(() => document.getElementById('c2d-noguess').checked), true, 'no-guess on for a new player');

    // A won no-guess Expert game shows as the board's best; the switch off shows the other board's.
    await recordWin(page, { board: { ...EXPERT_NG }, ms: 61234 });
    assert.equal(await best(), '61.234 s');
    await page.click('#c2d-noguess');
    assert.equal(await best(), '—', 'the guessing twin has no game');
    await page.click('#c2d-noguess');
    assert.equal(await best(), '61.234 s');

    // The 3D board choice too, following its presets' switch.
    await page.click('#c2d-choice-back');
    await page.click('#menu-entry-3d');
    assert.equal(await detail('#board-choice [data-preset="8,8,8,40"]'), `7.8 % mines · ~${c3d} 3BV · —`);
    await recordWin(page, { board: { ...CUBE_INT_NG }, ms: 45000 });
    await page.click('#board-choice-back');
    await page.click('#menu-entry-3d');
    assert.equal(await detail('#board-choice [data-preset="8,8,8,40"]'), `7.8 % mines · ~${c3d} 3BV · Best 45.000 s · 1 in a row`);
    await page.click('#bc-noguess');
    assert.equal(await detail('#board-choice [data-preset="8,8,8,40"]'), `7.8 % mines · ~${c3d} 3BV · —`);
    assert.equal(await text('#c-noguess + .ui-toggle__label'), 'No-guess board · separate records');
    await page.click('#board-choice-back');

    // Play an Expert no-guess game to its first click, then leave it: the last board played.
    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="expert"]');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d');
    const canvas = await page.locator('#c2d-board canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForFunction(() => document.getElementById('menu-entry-classic-2d').hasAttribute('data-last'));
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    await page.click('#p-menu');
    if (await shown('#p-confirm-yes')) await page.click('#p-confirm-yes'); // "It will count as a loss"
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => document.activeElement?.id), 'menu-entry-classic-2d', 'the menu opens on the last mode played');
    assert.equal(await shown('#menu-entry-classic-2d .ui-chip[data-last]'), true, 'with its Last played chip');

    // Enter, then Enter: the board choice opens on the last board, so it starts again.
    const savedChoice = await ms(() => localStorage.getItem('ms3d:doc:classic2d.lastChoice'));
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.equal(await ms(() => document.activeElement?.dataset.size), 'expert', 'the last board is selected');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d', 'onto the closed board');
    assert.equal(await ms(() => globalThis.__ms.modes.active), 'classic-2d');
    assert.equal(await text('#hud-size'), '30 × 16 · no-guess');
    assert.equal(await ms(() => localStorage.getItem('ms3d:doc:classic2d.lastChoice')), savedChoice, 'the last choice is as it was');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
