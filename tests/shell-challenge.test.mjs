// Board codes in the shell (js/shell/challenge.js): what a code opens — today's daily, a challenge,
// a refusal or the other mode's hint —, how a daily or a challenge reaches its mode, the `#board=`
// link at start-up and on hashchange with its refusals and the started-game toast, and the hash
// removed without a history entry; the shell's wiring in js/main.js; and in a browser a link
// opening a challenge over the main menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveCode, otherModeHint, gameStart, freeStart, boardHash, createChallengeLinks, STARTED_TOAST,
} from '../js/shell/challenge.js';
import { encodeBoardCode, dailyGame, CODE_REASONS, parseBoardCode } from '../js/records/board-code.js';
import { createBoardIdentity } from '../js/records/board.js';
import { normaliseChoice } from '../js/classic2d/board-setup.js';
import { UNAVAILABLE_REASONS } from '../js/shell/menu.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const sq = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const box = (width, height, depth, mines, noGuess = false) => createBoardIdentity({ mode: '3d', width, height, depth, mines, noGuess });
const code2D = encodeBoardCode({ board: sq(9, 9, 10), seed: 77, startCell: 40, generatorVersion: 1 });
const code3D = encodeBoardCode({ board: box(8, 8, 8, 40, true), seed: 5, startCell: 292, generatorVersion: 1 });

// ---------------------------------------------------------------- what a code opens

test('a code opens a challenge in its mode; today\'s daily code opens the Daily screen; a refused one says why', () => {
  const ch = resolveCode(code2D, { today: '20261011' });
  assert.equal(ch.kind, 'challenge');
  assert.deepEqual(ch.parsed, parseBoardCode(code2D));
  const today = resolveCode(dailyGame('cube', '20261011').code, { today: '20261011' });
  assert.deepEqual([today.kind, today.id], ['daily', 'cube']);
  const past = resolveCode(dailyGame('cube', '20261010').code, { today: '20261011' });
  assert.equal(past.kind, 'challenge', 'a past day\'s board is a challenge');
  assert.equal('daily' in past.parsed, false, 'its date is dropped: it plays as a challenge');
  const pastStart = gameStart(past.parsed);
  assert.deepEqual(pastStart.choice.forced, { startCell: past.parsed.startCell, seed: past.parsed.seed, challenge: true });
  const future = resolveCode(dailyGame('expert', '20261012').code, { today: '20261011' });
  assert.equal(future.kind, 'challenge', 'a day ahead too');
  assert.deepEqual(gameStart(future.parsed).choice.fixed, { startCell: future.parsed.startCell, seed: future.parsed.seed, challenge: true });
  assert.deepEqual(resolveCode('nonsense', { today: '20261011' }), { kind: 'refused', reason: CODE_REASONS.malformed });
});

test('a board choice refuses the other mode\'s code with a hint naming the right one', () => {
  assert.deepEqual(resolveCode(code3D, { today: '20261011', mode: 'classic-2d' }), { kind: 'refused', reason: otherModeHint('3d'), otherMode: '3d' }, 'marked as the other mode\'s');
  assert.equal(otherModeHint('3d'), 'This is a 3D board code. Paste it in the 3D board choice.');
  assert.equal(resolveCode(code2D, { today: '20261011', mode: 'classic-2d' }).kind, 'challenge');
  assert.equal(resolveCode(code2D, { today: '20261011', mode: '3d' }).reason, otherModeHint('classic-2d'));
  assert.equal(otherModeHint('classic-2d'), 'This is a Classic 2D board code. Paste it in the Classic 2D board choice.');
  assert.equal(resolveCode(dailyGame('expert', '20261011').code, { today: '20261011', mode: '3d' }).kind, 'daily', 'today\'s daily opens the Daily screen from either form');
});

test('a challenge reaches its mode with its forced start and seed; a daily with its date and board; Play again is free', () => {
  const two = gameStart({ ...parseBoardCode(code2D) });
  assert.equal(two.mode, 'classic-2d');
  assert.deepEqual(two.choice.fixed, { startCell: 40, seed: 77, challenge: true });
  assert.deepEqual(normaliseChoice(two.choice), { size: 'beginner', custom: { width: 30, height: 16, mines: 99 }, noGuess: false });
  const custom = gameStart({ board: sq(20, 12, 50, true), seed: 1, startCell: 0 });
  assert.deepEqual(normaliseChoice(custom.choice), { size: 'custom', custom: { width: 20, height: 12, mines: 50 }, noGuess: true });
  const pg = { cell: 292 };
  const three = gameStart({ ...parseBoardCode(code3D), pregenerated: pg });
  assert.deepEqual(three, { mode: '3d', choice: { X: 8, Y: 8, Z: 8, mines: 40, noGuess: true, forced: { startCell: 292, seed: 5, challenge: true }, pregenerated: pg } });
  const g = dailyGame('expert', '20261011');
  const d = gameStart({ board: g.board, seed: g.seed, startCell: g.startCell, daily: g.date });
  assert.deepEqual(d.choice.fixed, { startCell: g.startCell, seed: g.seed, daily: '20261011' });
  assert.equal(d.choice.size, 'expert');
  assert.deepEqual(freeStart({ ...box(8, 8, 8, 40, true), daily: true }), { mode: '3d', choice: { X: 8, Y: 8, Z: 8, mines: 40, noGuess: true } });
  assert.equal(freeStart({ ...sq(30, 16, 99, true), daily: true }).choice.size, 'expert');
  assert.equal(freeStart({ ...sq(30, 16, 99, true), daily: true }).choice.remember, false, 'Play again after one saves no last board choice');
});

// ---------------------------------------------------------------- the link

test('the link hash: #board=<code>, URL-decoded; anything else is none', () => {
  assert.equal(boardHash(`#board=${code2D}`), code2D);
  assert.equal(boardHash('#board=b-00000000-0-1abc'), 'b-00000000-0-1abc');
  assert.equal(boardHash('#board=EN%2D20261011%2D184A'), 'EN-20261011-184A');
  assert.equal(boardHash(''), null);
  assert.equal(boardHash('#replay'), null);
  assert.equal(boardHash('#board='), null);
});

function fakeWindow(hash) {
  const replaced = [];
  const location = { hash, pathname: '/', search: '' };
  const history = {
    state: { ms3d: 1, depth: 0 }, length: 1, replaced,
    replaceState(state, title, url) { replaced.push([state, url]); location.hash = ''; },
  };
  return { location, history };
}
function links(win, over = {}) {
  const calls = [];
  const l = createChallengeLinks({
    ...win,
    today: () => '20261011',
    onDaily: (id) => calls.push(['daily', id]),
    onChallenge: (p) => calls.push(['challenge', p.board.mode, p.seed, p.startCell]),
    onRefused: (reason) => calls.push(['refused', reason]),
    toast: (t) => calls.push(['toast', t]),
    ...over,
  });
  return { l, calls };
}

test('at start-up a #board= link starts its challenge, then the hash goes with no new history entry', () => {
  const win = fakeWindow(`#board=${code2D}`);
  const { l, calls } = links(win);
  assert.equal(l.start(), true);
  assert.deepEqual(calls, [['challenge', 'classic-2d', 77, 40]]);
  assert.deepEqual(win.history.replaced, [[{ ms3d: 1, depth: 0 }, '/']], 'replaceState keeps the entry\'s state');
  assert.equal(win.history.length, 1);
  const none = links(fakeWindow(''));
  assert.equal(none.l.start(), false);
  assert.deepEqual(none.calls, []);
});

test('a link to today\'s daily opens the Daily screen; a refused code shows its reason; a mode the browser cannot run is refused', () => {
  const daily = links(fakeWindow(`#board=${dailyGame('expert', '20261011').code}`));
  daily.l.start();
  assert.deepEqual(daily.calls, [['daily', 'expert']]);
  const bad = links(fakeWindow('#board=EN-20261011-1000'));
  bad.l.start();
  assert.deepEqual(bad.calls, [['refused', CODE_REASONS.typo]]);
  const no3D = links(fakeWindow(`#board=${code3D}`), { unavailable: (mode) => (mode === '3d' ? UNAVAILABLE_REASONS.webgl2 : null) });
  no3D.l.start();
  assert.deepEqual(no3D.calls, [['refused', UNAVAILABLE_REASONS.webgl2]]);
});

test('a hashchange to #board= is followed while no game is started, and ignored with a toast during one', () => {
  const win = fakeWindow('');
  let started = false;
  const { l, calls } = links(win, { started: () => started });
  win.location.hash = `#board=${code3D}`;
  l.hashchange();
  assert.deepEqual(calls, [['challenge', '3d', 5, 292]]);
  started = true;
  win.location.hash = `#board=${code2D}`;
  l.hashchange();
  assert.deepEqual(calls.at(-1), ['toast', STARTED_TOAST]);
  assert.equal(win.location.hash, '', 'the hash is removed either way');
  assert.equal(l.hashchange(), false, 'a hashchange away from a link does nothing');
});

// ---------------------------------------------------------------- the shell's wiring

const MAIN = read('js/main.js');

test('the shell follows links once settings and records have loaded, and on hashchange', () => {
  const boot = MAIN.slice(MAIN.indexOf('await Promise.all([settingsLoaded, recordsLoaded'));
  assert.match(boot, /showMainMenu\(\);[\s\S]*LINKS\.start\(\);/);
  assert.match(MAIN, /window\.addEventListener\('hashchange', \(\) => LINKS\.hashchange\(\)\)/);
  assert.match(MAIN, /onRefused: \(reason\) => \{ showMainMenu\(\); ui\.toast\(reason, 5000\); \}/);
  assert.doesNotMatch(read('404.html'), /board=/, 'no 404.html change: /#board= is served by /');
});

test('a board choice\'s code says what it opens and names its board for the summary; both board choices play it with Play', () => {
  const check = MAIN.slice(MAIN.indexOf('function checkCode('), MAIN.indexOf('function playCode('));
  assert.ok(check.includes("if (r.kind === 'daily') return { ok: true, text: 'Today\\'s daily board — it opens the Daily screen.', label: 'Today\\'s daily board' };"));
  assert.match(check, /const label = codeBoardLine\(r\.parsed\.board\);\n  return \{ ok: true, text: `\$\{label\} · starts on the marked \$\{r\.parsed\.board\.mode === MODE_3D \? 'cube' : 'cell'\}`, label \};/);
  assert.ok(check.includes("if (r.kind === 'refused') return { ok: false, reason: r.reason, otherMode: !!r.otherMode };"), 'the other mode\'s code is told apart from a refused one');
  const index = read('index.html');
  for (const [start, end, option, binder] of [
    ['<section id="c2d-choice"', '<!-- Classic 2D board -->', /<button type="button" class="ui-option" aria-pressed="false" data-size="code" id="c2d-code-option">/, 'js/classic2d/board-choice.js'],
    ['<section id="board-choice"', '<!-- Coming soon -->', /<button type="button" class="ui-option" aria-pressed="false" data-preset="code" id="bc-code-option">/, 'js/mode3d/board-choice.js'],
  ]) {
    const choice = index.slice(index.indexOf(start), index.indexOf(end));
    assert.match(choice, option, 'Insert Board Code is a board option');
    assert.doesNotMatch(choice, /data-code-play|Play this board/, 'no button of its own: Play plays it');
    assert.match(read(binder), /if \(r\?\.ok\) code\.onPlay\(codeText\(\)\);/, 'Play plays an accepted code only');
  }
});

// ---------------------------------------------------------------- in a browser

function removeWebGL2(page) {
  return page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : get.call(this, kind, ...rest); };
  });
}

test('in a browser, a #board= link opens its Classic 2D challenge over the menu, forced and marked; Back leads to the menu', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await removeWebGL2(page);
    await page.goto(`${base}/index.html#board=${code2D}`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'classic-2d');
    assert.equal(await page.evaluate(() => location.hash), '', 'the hash is removed');
    assert.equal(await page.evaluate(() => globalThis.__ms.board2D.mark), 40, 'the start cell is marked');
    assert.deepEqual(await page.evaluate(() => globalThis.__ms.modes.state.mode), 'classic-2d');
    // A click off the mark changes nothing and says so; the mark takes the first click.
    const clickCell = async (c) => {
      const at = await page.evaluate((cell) => {
        const v = globalThis.__ms.board2D;
        const r = v.cellRect(cell);
        const box = v.canvas.getBoundingClientRect();
        return { x: box.left + r.x + r.size / 2, y: box.top + r.y + r.size / 2 };
      }, c);
      await page.mouse.click(at.x, at.y);
    };
    await clickCell(0);
    await page.waitForFunction(() => document.getElementById('toast').textContent === 'Start on the marked cell');
    assert.equal(await page.evaluate(() => globalThis.__ms.modes.state.started), false);
    await clickCell(40);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started === true);
    assert.equal(await page.evaluate(() => globalThis.__ms.modes.summary().challenge), true);
    assert.equal(await page.evaluate(() => globalThis.__ms.modes.summary().seed), 77);
    // Refused link: the menu with its reason.
    await page.evaluate(() => { location.hash = '#board=EN-20261011-1000'; });
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('Finish or leave this game'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, a refused #board= link shows the main menu with its reason', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage();
    await removeWebGL2(page);
    await page.goto(`${base}/index.html#board=EN-20261011-1000`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.getElementById('toast').classList.contains('on'));
    assert.equal(await page.evaluate(() => document.getElementById('toast').textContent), CODE_REASONS.typo);
    assert.equal(await page.evaluate(() => location.hash), '');
  } finally {
    await browser.close();
  }
});
