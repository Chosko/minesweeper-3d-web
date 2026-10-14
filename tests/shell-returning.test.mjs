// The returning-player surfaces: the preset detail line on both board choices, the main menu's
// session strip and its Play again, over a records model built here; the typical 3BV table; and a
// browser run of all of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoardIdentity, STANDARD_BOARDS, PRESETS_3D } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createRecordsModel } from '../js/records/model.js';
import { TYPICAL_BBBV, typicalBbbv, typicalBbbvKey } from '../js/records/typical-bbbv.js';
import { DEFAULT_CHOICE as DEFAULT_2D } from '../js/classic2d/board-setup.js';
import { DEFAULT_CHOICE as DEFAULT_3D } from '../js/mode3d/board-choice.js';
import {
  densityText, presetDetail, presetDetails, sessionStrip, playAgainLabel, lastBoard, returningMenu,
} from '../js/shell/returning.js';
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
  assert.equal(typicalBbbv(box(12, 12, 8, 131)), null, 'a preset whose mines change has no entry until it is measured again');
  assert.equal(typicalBbbv(box(12, 12, 9, 130)), null, 'nor one whose size changes');
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

// ---------------------------------------------------------------- the session strip and Play again

const day = (d, h, min = 0) => new Date(2026, 9, d, h, min);

test('the session strip names the last board, its best, today\'s games on it and its streak', () => {
  const now = day(13, 12);
  const m = model([
    { board: EXPERT_NG, ms: 13343, endedAt: day(12, 23, 59) }, // yesterday, local time
    { board: EXPERT_NG, ms: 15000, endedAt: day(13, 0, 1) },
    { board: EXPERT_NG, outcome: 'lost', endedAt: day(13, 9) },
    { board: EXPERT_NG, ms: 16000, endedAt: day(13, 10) },
    { board: EXPERT_NG, ms: 17000, endedAt: day(13, 11) },
    { board: EXPERT, ms: 9000, endedAt: day(13, 11, 30) }, // another board: not counted, not its best
  ]);
  assert.equal(sessionStrip(EXPERT_NG, m, now), 'Expert · no-guess · best 13.343 s · today 4 games · streak 2');
  assert.equal(sessionStrip(EXPERT, m, now), 'Expert · best 9.000 s · today 1 game · streak 1', 'singular');
  assert.equal(sessionStrip(EXPERT, m, day(14, 0, 0)), 'Expert · best 9.000 s · today 0 games · streak 1', 'a new day counts afresh');
  const lost = model([{ board: CUBE_INT, outcome: 'lost', endedAt: day(13, 9) }]);
  assert.equal(sessionStrip(CUBE_INT, lost, now), 'Cube Intermediate · best — · today 1 game · streak 0', 'no best: best —');
  assert.equal(sessionStrip(null, m, now), null, 'no last board: no strip');
});

test('Play again names the last board as the records do', () => {
  assert.equal(playAgainLabel(EXPERT_NG), 'Play again: Expert · no-guess');
  assert.equal(playAgainLabel(box(12, 12, 8, 130)), 'Play again: Cube Expert');
  assert.equal(playAgainLabel(square(20, 12, 50)), 'Play again: 20 × 12 · 50 mines');
});

test('the last board played is the last mode\'s last board choice, once it was played', () => {
  const expert = { size: 'expert', custom: { width: 30, height: 16, mines: 99 }, noGuess: true };
  const cube = { size: 'cube-intermediate', custom: { X: 10, Y: 10, Z: 10, mines: 25 }, noGuess: false };
  const choices = { 'classic-2d': { choice: expert, played: true }, '3d': { choice: cube, played: true } };
  assert.deepEqual(lastBoard('classic-2d', choices), { mode: 'classic-2d', choice: expert, board: EXPERT_NG });
  assert.deepEqual(lastBoard('3d', choices), { mode: '3d', choice: cube, board: CUBE_INT });
  const custom3d = { size: 'custom', custom: { X: 4, Y: 5, Z: 6, mines: 11 }, noGuess: true };
  assert.deepEqual(lastBoard('3d', { '3d': { choice: custom3d, played: true } }).board, box(4, 5, 6, 11, true));
  const custom2d = { size: 'custom', custom: { width: 20, height: 12, mines: 50 }, noGuess: false };
  assert.deepEqual(lastBoard('classic-2d', { 'classic-2d': { choice: custom2d, played: true } }).board, square(20, 12, 50));
  assert.equal(lastBoard(null, choices), null, 'no last mode played');
  assert.equal(lastBoard('classic-2d', { 'classic-2d': { choice: DEFAULT_2D, played: false } }), null, 'a choice never played');
  assert.equal(lastBoard('3d', { '3d': { choice: DEFAULT_3D, played: false } }), null);
  assert.equal(lastBoard('records', choices), null, 'not a mode with boards');
});

test('the menu shows the strip and Play again over the last board; without WebGL 2 a 3D board has no Play again', () => {
  const now = day(13, 12);
  const m = model([{ board: CUBE_INT_NG, ms: 30000, endedAt: day(13, 9) }]);
  const cube = { size: 'cube-intermediate', custom: { X: 10, Y: 10, Z: 10, mines: 25 }, noGuess: true };
  const last3d = lastBoard('3d', { '3d': { choice: cube, played: true } });
  assert.deepEqual(returningMenu({ last: last3d, records: m, now }), {
    strip: 'Cube Intermediate · no-guess · best 30.000 s · today 1 game · streak 1',
    again: 'Play again: Cube Intermediate · no-guess',
  });
  assert.deepEqual(returningMenu({ last: last3d, records: m, now, missing: ['webgl2'] }), {
    strip: 'Cube Intermediate · no-guess · best 30.000 s · today 1 game · streak 1',
    again: null,
  }, 'the strip still shows');
  const last2d = lastBoard('classic-2d', { 'classic-2d': { choice: { size: 'expert', noGuess: false }, played: true } });
  assert.equal(returningMenu({ last: last2d, records: m, now, missing: ['webgl2'] }).again, 'Play again: Expert', 'a Classic 2D board is unaffected');
  assert.deepEqual(returningMenu({ last: null, records: m, now }), { strip: null, again: null });
});

test('the helpers are DOM-free and read the records only through the queries they are handed', () => {
  const src = strip(read('js/shell/returning.js'));
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
  assert.doesNotMatch(src, /records\/store\.js|createRecordsStore/);
  assert.match(src, /import \{[^}]*\bformatTime\b[^}]*\} from '\.\.\/results\/view\.js'/, 'the results time format');
  assert.match(src, /import \{[^}]*\bboardLabel\b[^}]*\} from '\.\.\/records\/board\.js'/);
  for (const binder of ['js/mode3d/board-choice.js', 'js/classic2d/board-choice.js']) {
    assert.doesNotMatch(strip(read(binder)), /records\/|returning\.js/, `${binder} receives its detail text, never the store`);
  }
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const MENU = INDEX.slice(INDEX.indexOf('<section id="menu"'), INDEX.indexOf('<!-- 3D board choice -->'));

test('index.html: Play again in the menu\'s title row, the strip under the entries', () => {
  const titleRow = MENU.slice(MENU.indexOf('<div class="ui-row">'), MENU.indexOf('<div class="ui-menu"'));
  assert.match(titleRow, /<button type="button" id="menu-again" class="ui-button ui-button--primary hidden">Play again<\/button>/);
  const entries = MENU.indexOf('<div class="ui-menu"');
  const stripAt = MENU.indexOf('<p id="menu-strip" class="ui-text ui-text--muted hidden"');
  assert.ok(stripAt > MENU.indexOf('</div>', entries), 'the strip sits under the entries');
  assert.ok(stripAt < MENU.indexOf('id="menu-help"'), 'and above the footer');
});

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

test('the shell rebuilds the returning surfaces on the menu, on a recorded game and after the last mode loads, and starts Play again', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /menu: \{ defaultFocus: '\[data-entry\]\[data-last\]', show: \(\) => \{[^\n]*showReturning\(\)/, 'the menu keeps its default focus and rebuilds on show');
  assert.match(table, /'board-choice': \{[^\n]*CHOICE_3D\.show\([^\n]*details: /, 'the 3D board choice is handed its detail lines');
  assert.match(table, /'classic-2d-choice': \{[^\n]*showChoice2D\(/);
  assert.match(MAIN, /RECORDS\.onChange\(\(\) => \{[^\n]*showReturning\(\)/, 'a newly recorded game rebuilds the strip');
  assert.match(MAIN, /LAST_MODE\.load\(\)\.then\([\s\S]{0,400}showReturning\(\)/, 'and the settled last mode');
  const again = MAIN.slice(MAIN.indexOf('function playAgainFromMenu('));
  assert.match(again.slice(0, 800), /sfx\.unlock\(\)/, 'the audio is unlocked as on a board choice start');
  assert.match(again.slice(0, 800), /MODES\.start\('classic-2d', last\.choice\)/);
  assert.match(again.slice(0, 800), /MODES\.start\('3d', boardOf\(last\.choice\)\); enterPlay3D\(source\)/, 'a 3D board enters play as the results screen\'s Play again does');
  assert.match(again.slice(0, 800), /WEBGL2/, 'the one WebGL 2 flag');
  assert.doesNotMatch(again.slice(0, again.indexOf('\n}\n')), /\.save\(/, 'starting this way saves no choice');
});

test('the catalogue documents the strip, Play again and the preset detail lines', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Main menu \(index\.html #menu\)[\s\S]*?Play again[\s\S]*?session strip[\s\S]*?Default focus: the last mode played/);
  assert.match(head, /3D board choice \(index\.html #board-choice\)[\s\S]*?detail line[\s\S]*?Default focus/);
  assert.match(head, /Classic 2D board choice \(index\.html #c2d-choice\)[\s\S]*?detail line[\s\S]*?Default focus/);
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

test('in a browser, the detail lines follow the records and the switch, and the strip and Play again start the last 2D board', async (t) => {
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
    const e2d = typicalBbbv(EXPERT);
    const c3d = typicalBbbv(CUBE_INT);

    // A new player: no strip, no Play again.
    assert.equal(await shown('#menu-strip'), false);
    assert.equal(await shown('#menu-again'), false);

    // The 2D board choice: one detail line per size, under the size line and before "Last played".
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.deepEqual(await ms(() => [...document.querySelector('#c2d-choice [data-size="expert"]').children].map((c) => [c.className, c.hasAttribute('data-detail'), c.hasAttribute('data-last')])),
      [['ui-menu__label', false, false], ['ui-menu__detail', false, false], ['ui-menu__detail', true, false], ['ui-menu__detail hidden', false, true]]);
    assert.equal(await detail('#c2d-choice [data-size="expert"]'), `21 % mines · ~${e2d} 3BV · —`);
    assert.equal(await detail('#c2d-choice [data-size="beginner"]'), `12 % mines · ~${typicalBbbv(square(9, 9, 10))} 3BV · —`);
    assert.equal(await ms(() => document.getElementById('c2d-noguess').checked), true, 'no-guess on for a new player');

    // A won no-guess Expert game: its line shows the best and streak; the switch off shows the other board's.
    await recordWin(page, { board: { ...EXPERT_NG }, ms: 61234 });
    await page.click('#c2d-choice-back');
    await page.click('#menu-entry-classic-2d');
    assert.equal(await detail('#c2d-choice [data-size="expert"]'), `21 % mines · ~${e2d} 3BV · Best 61.234 s · 1 in a row`);
    await page.click('#c2d-noguess');
    assert.equal(await detail('#c2d-choice [data-size="expert"]'), `21 % mines · ~${e2d} 3BV · —`, 'the guessing twin has no game');
    await page.click('#c2d-noguess');
    assert.equal(await detail('#c2d-choice [data-size="expert"]'), `21 % mines · ~${e2d} 3BV · Best 61.234 s · 1 in a row`);

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
    assert.equal(await mode(), 'classic-2d');
    const canvas = await page.locator('#c2d-board canvas').boundingBox();
    await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.waitForFunction(() => document.getElementById('menu-entry-classic-2d').hasAttribute('data-last'));
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    await page.click('#p-menu');
    if (await shown('#p-confirm-yes')) await page.click('#p-confirm-yes'); // "It will count as a loss"
    assert.equal(await mode(), 'menu');
    assert.equal(await shown('#menu-strip'), true);
    assert.equal(await text('#menu-strip'), 'Expert · no-guess · best 61.234 s · today 2 games · streak 0');
    assert.equal(await text('#menu-again'), 'Play again: Expert · no-guess');
    assert.equal(await ms(() => document.activeElement?.id), 'menu-entry-classic-2d', 'the default focus stays the last mode played');

    // A newly recorded game rebuilds the strip on the menu.
    await recordWin(page, { board: { ...EXPERT_NG }, ms: 59000 });
    assert.equal(await text('#menu-strip'), 'Expert · no-guess · best 59.000 s · today 3 games · streak 1');

    // The Play again is in the menu's focus order, and Enter starts the last board in one step.
    await page.keyboard.press('Shift+Tab');
    assert.equal(await ms(() => document.activeElement?.id), 'menu-again');
    const savedChoice = await ms(() => localStorage.getItem('ms3d:doc:classic2d.lastChoice'));
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d', 'straight onto the closed board');
    assert.equal(await ms(() => globalThis.__ms.modes.active), 'classic-2d');
    assert.equal(await text('#hud-size'), '30 × 16 · no-guess');
    assert.equal(await ms(() => localStorage.getItem('ms3d:doc:classic2d.lastChoice')), savedChoice, 'the last choice is as it was');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, Play again starts the last 3D board: into play when the lock is granted, the ready card when it is refused', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const seed = async (page) => {
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      await page.evaluate(() => {
        localStorage.setItem('ms3d:doc:shell.lastMode', JSON.stringify({ version: 1, data: { mode: '3d' } }));
        localStorage.setItem('ms3d:doc:mode3d.lastChoice', JSON.stringify({ version: 1, data: { size: 'cube-intermediate', custom: { X: 10, Y: 10, Z: 10, mines: 25 }, noGuess: true } }));
      });
      await page.reload();
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu'
        && !document.getElementById('menu-again').classList.contains('hidden'));
    };
    const ms = (page, fn) => page.evaluate(fn);

    // Lock granted: the click is the pointer-lock gesture, and play starts with no ready card.
    const granted = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    granted.on('pageerror', (e) => errors.push(e.message));
    await granted.addInitScript(() => {
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
      Element.prototype.requestPointerLock = function requestPointerLock() {
        locked = this;
        setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
        return Promise.resolve();
      };
      document.exitPointerLock = () => { locked = null; document.dispatchEvent(new Event('pointerlockchange')); };
    });
    await seed(granted);
    assert.equal(await granted.textContent('#menu-again'), 'Play again: Cube Intermediate · no-guess');
    assert.equal(await granted.textContent('#menu-strip'), 'Cube Intermediate · no-guess · best — · today 0 games · streak 0');
    await granted.click('#menu-again');
    await granted.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    assert.deepEqual(await ms(granted, () => globalThis.__ms.state.settings), { X: 8, Y: 8, Z: 8, mines: 40 });
    assert.equal(await ms(granted, () => globalThis.__ms.state.lockless), false, 'locked play');

    // Lock refused: the ready card is the fallback, with its message.
    const refused = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    refused.on('pageerror', (e) => errors.push(e.message));
    await refused.addInitScript(() => {
      Element.prototype.requestPointerLock = function requestPointerLock() {
        setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
        return Promise.reject(new Error('blocked'));
      };
    });
    await seed(refused);
    await refused.click('#menu-again');
    await refused.waitForFunction(() => document.getElementById('ready-msg').textContent !== '');
    assert.equal(await ms(refused, () => globalThis.__ms.state.mode), 'ready');
    assert.deepEqual(await ms(refused, () => globalThis.__ms.state.settings), { X: 8, Y: 8, Z: 8, mines: 40 });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// A browser without WebGL 2: every canvas refuses a 'webgl2' context.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser without WebGL 2, a 3D last board shows the strip and no Play again', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.addInitScript(() => {
      localStorage.setItem('ms3d:doc:shell.lastMode', JSON.stringify({ version: 1, data: { mode: '3d' } }));
      localStorage.setItem('ms3d:doc:mode3d.lastChoice', JSON.stringify({ version: 1, data: { size: 'cube-expert', custom: { X: 10, Y: 10, Z: 10, mines: 25 }, noGuess: false } }));
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu'
      && !document.getElementById('menu-strip').classList.contains('hidden'));
    assert.equal(await page.textContent('#menu-strip'), 'Cube Expert · best — · today 0 games · streak 0');
    assert.equal(await page.evaluate(() => document.getElementById('menu-again').classList.contains('hidden')), true, 'hidden, not disabled');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
