// The returning player's surface: the board's bests on both board choices, over a records model built
// here; that the main menu keeps no Play again and no session strip and the
// board options no detail line; and a browser run of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoardIdentity } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createRecordsModel } from '../js/records/model.js';
import * as RETURNING from '../js/shell/returning.js';

const { boardBests, NO_BEST } = RETURNING;
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

// ---------------------------------------------------------------- the board's bests

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
  const cube = model([{ board: CUBE_INT_NG, ms: 71902, endedAt: new Date(2026, 9, 11, 12) }]);
  assert.deepEqual(rows(boardBests(CUBE_INT_NG, cube)).map((r) => r.slice(2)), [['71.902 s', '11 Oct 2026'], ['0.28', '11 Oct 2026'], ['100.0%', '11 Oct 2026']], 'a 3D board alike');
  assert.deepEqual(rows(boardBests(CUBE_INT, cube)), none);
});

// ---------------------------------------------------------------- no Play again, no session strip

test('the main menu keeps no Play again and no session strip, nor a board option a detail line: returning.js has the bests alone', () => {
  assert.deepEqual(Object.keys(RETURNING).sort(), ['NO_BEST', 'boardBests']);
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
    assert.doesNotMatch(strip(read(binder)), /records\/|returning\.js/, `${binder} receives its bests as text, never the store`);
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
    for (const m of html.matchAll(/<div class="ui-switchrow"><span class="ui-switchrow__text"><label class="ui-switchrow__label" for="([\w-]+)">([^<]+)<\/label>(<span class="ui-switchrow__help" id="[\w-]+-help">([^<]+)<\/span>)?<\/span><input type="checkbox" role="switch" id="\1"[^>]*data-noguess[^>]*><\/div>/g)) {
      switches++;
      const [, id, raw, , help] = m;
      const label = raw.replace(/&middot;/g, '·');
      const said = [label, help ?? ''].join(' ').match(/separate records/gi)?.length ?? 0;
      assert.equal(said, 1, `#${id} says it once`);
      assert.equal(label, 'No-guess', `#${id}: its label names it, its helper line says the rest`);
    }
  }
  assert.equal(switches, 3, 'the 2D switch and both 3D switches');
});

test('the shell hands both board choices their bests, redrawn on the records\' change notification, and no detail lines', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /'board-choice': \{[^\n]*showChoice3D\(/);
  assert.match(table, /'classic-2d-choice': \{[^\n]*showChoice2D\(/);
  assert.doesNotMatch(MAIN, /presetDetails|CHOICE_ITEMS|details: /, 'no detail lines on the options');
  assert.match(MAIN, /bests: \(identity\) => boardBests\(identity, RECORDS\)/, 'read through the store\'s queries');
  assert.match(MAIN, /bests: \(board\) => boardBests\(identity3D\(board\), RECORDS\)/);
  assert.match(MAIN, /RECORDS\.onChange\(\(\) => \{ CHOICE_2D\.refresh\(\); CHOICE_3D\.refresh\(\); \}\)/, 'and its change notification');
});

test('the catalogue documents both board choices\' bests, and no Play again or session strip on the main menu', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  const menu = head.slice(head.indexOf('Main menu (index.html #menu)'), head.indexOf('3D board choice (index.html #board-choice)'));
  assert.doesNotMatch(menu, /Play again|session strip/);
  assert.match(head, /Classic 2D board choice \(index\.html #c2d-choice\)[\s\S]*?bests[\s\S]*?Default focus/);
  const three = head.slice(head.indexOf('3D board choice (index.html #board-choice)'));
  assert.doesNotMatch(three.slice(0, three.indexOf('Default focus')), /detail line|typical 3BV|streak/, 'no detail line on a 3D option');
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

test('in a browser, both board choices\' bests follow the records and the switch, and the menu opens on the last mode, whose board choice opens on the last board', async (t) => {
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

    // The 3D board choice too, following its presets' switch, with no detail line on an option.
    const best3d = () => ms(() => document.querySelector('#bc-best-time .ui-stat__value').textContent);
    await page.click('#c2d-choice-back');
    await page.click('#menu-entry-3d');
    assert.equal(await ms(() => document.querySelectorAll('#board-choice [data-detail]').length), 0);
    await page.click('#board-choice [data-preset="8,8,8,40"]');
    assert.equal(await best3d(), '—');
    await recordWin(page, { board: { ...CUBE_INT_NG }, ms: 45000 });
    assert.equal(await best3d(), '45.000 s');
    await page.click('#bc-noguess');
    assert.equal(await best3d(), '—', 'the guessing twin has no game');
    assert.equal(await text('label[for="c-noguess"]'), 'No-guess');
    await page.click('#board-choice-back');

    // Play an Expert no-guess game to its first click, then leave it: the last board played.
    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="expert"]');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d');
    const canvas = await page.locator('#c2d-board canvas').first().boundingBox();
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
    assert.equal(await text('#c2d-size'), '30 × 16 · 99 mines · no-guess');
    assert.equal(await ms(() => localStorage.getItem('ms3d:doc:classic2d.lastChoice')), savedChoice, 'the last choice is as it was');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
