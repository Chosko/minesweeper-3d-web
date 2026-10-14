// First-use hints: the shell.firstUse document (load, save, seeding from the records, failure), the
// three-game window of the hint strips, the 2D strip's first-key trigger, dismissal, the "How 3D
// works" block on the ready card, the one-time auto-hide toast and aim hint, and their wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import {
  FIRST_USE_DOC, FIRST_USE_VERSION, FIRST_GAMES, AIM_DWELL_MS,
  createFirstUse, stripShown, createDwell, aimHintCell, hidCube,
} from '../js/shell/first-use.js';
import { GLYPHS } from '../js/gamepad.js';
import { hintStripHtml, hintText } from '../js/settings/bindings.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&middot;/g, '·');

// A records store's per-mode game counters, as the first use is seeded from them.
const records = (games2d, games3d) => ({ overall: (mode) => ({ games: mode === '3d' ? games3d : games2d, wins: 0, currentStreak: 0, longestStreak: 0 }) });
const stored = (data) => createMemoryBackend({ initial: { [FIRST_USE_DOC]: JSON.stringify({ version: FIRST_USE_VERSION, data }) } });
const docOf = (backend) => JSON.parse(backend.documents.get(FIRST_USE_DOC)).data;
const settle = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- the first-use document

test('the first-use document is shell.firstUse, version 1, registered with the storage', () => {
  assert.equal(FIRST_USE_DOC, 'shell.firstUse');
  assert.equal(FIRST_USE_VERSION, 1);
  assert.equal(FIRST_GAMES, 3);
  const storage = createStorage({ backend: createMemoryBackend() });
  createFirstUse({ storage, records: records(0, 0) });
  assert.throws(() => storage.register(FIRST_USE_DOC, 1), /already registered/);
});

test('before it loads, and on a first launch with no records, every hint behaves as on first use', async () => {
  const backend = createMemoryBackend();
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  for (const f of [first]) {
    assert.equal(f.inFirstGames('classic-2d'), true);
    assert.equal(f.inFirstGames('3d'), true);
    assert.equal(f.rules3D, true, 'the 3D rules block shows');
    assert.equal(f.dismissed('3d'), false);
    assert.equal(f.shown('autoHideToast'), false);
    assert.equal(f.shown('aimHint'), false);
  }
  await first.load();
  assert.equal(first.rules3D, true);
  assert.deepEqual(docOf(backend), {
    games: { 'classic-2d': 0, '3d': 0 }, finished3D: false, autoHideToast: false, aimHint: false, scrollHint: false,
    dismissed: { 'classic-2d': false, '3d': false },
  }, 'the document is created at once');
});

test('when the document is first created it is seeded from the records\' per-mode game counters', async () => {
  const backend = createMemoryBackend();
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(2, 1) });
  await first.load();
  assert.deepEqual(docOf(backend).games, { 'classic-2d': 2, '3d': 1 });
  assert.equal(docOf(backend).finished3D, true, 'any recorded 3D game counts as the finished one');
  assert.equal(first.rules3D, false, 'a returning player is not taught again');
  assert.equal(first.inFirstGames('classic-2d'), true, 'two recorded games: the third is still in the window');
  assert.equal(first.inFirstGames('3d'), true);

  const veteran = createFirstUse({ storage: createStorage({ backend: createMemoryBackend() }), records: records(40, 12) });
  await veteran.load();
  assert.equal(veteran.inFirstGames('classic-2d'), false);
  assert.equal(veteran.inFirstGames('3d'), false);
});

test('a stored document is read back, not seeded again; a malformed one is seeded afresh', async () => {
  const data = { games: { 'classic-2d': 1, '3d': 4 }, finished3D: false, autoHideToast: true, aimHint: false, dismissed: { 'classic-2d': true, '3d': false } };
  const first = createFirstUse({ storage: createStorage({ backend: stored(data) }), records: records(30, 30) });
  await first.load();
  assert.equal(first.inFirstGames('classic-2d'), true);
  assert.equal(first.inFirstGames('3d'), false);
  assert.equal(first.rules3D, true, 'the stored document wins over the records');
  assert.equal(first.shown('autoHideToast'), true);
  assert.equal(first.dismissed('classic-2d'), true);

  for (const bad of [null, 'x', { games: { '3d': 'two' } }, { ...data, dismissed: null }, { ...data, aimHint: 1 }]) {
    const backend = stored(bad);
    const f = createFirstUse({ storage: createStorage({ backend }), records: records(0, 2) });
    await f.load();
    assert.equal(f.rules3D, false, `${JSON.stringify(bad)} is seeded from the records`);
    assert.equal(docOf(backend).games['3d'], 2);
  }
});

test('a game counts toward the three when the mode reports game started; a finished 3D game ends the rules block', async () => {
  const backend = createMemoryBackend();
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await first.load();
  for (let i = 0; i < FIRST_GAMES; i++) {
    assert.equal(first.inFirstGames('3d'), true, `game ${i + 1} is in the window`);
    first.gameStarted('3d');
  }
  assert.equal(first.inFirstGames('3d'), false, 'the fourth game is not');
  assert.equal(first.inFirstGames('classic-2d'), true, 'each mode counts its own games');
  await settle();
  assert.equal(docOf(backend).games['3d'], 3);

  first.gameFinished('classic-2d');
  assert.equal(first.rules3D, true, 'a Classic 2D game does not teach 3D');
  first.gameFinished('3d');
  assert.equal(first.rules3D, false);
  await settle();
  assert.equal(docOf(backend).finished3D, true);
});

test('the toast and the aim hint show once, and never again on that browser', async () => {
  const backend = createMemoryBackend();
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await first.load();
  assert.equal(first.once('autoHideToast'), true);
  assert.equal(first.once('autoHideToast'), false);
  assert.equal(first.once('aimHint'), true);
  assert.equal(first.once('aimHint'), false);
  assert.throws(() => first.once('somethingElse'), /unknown/);
  await settle();
  const again = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await again.load();
  assert.equal(again.once('autoHideToast'), false, 'remembered across launches');
  assert.equal(again.once('aimHint'), false);
});

test('the Classic 2D scroll hint is a one-time hint of the same document; one stored before it reads as not yet seen', async () => {
  const before = { games: { 'classic-2d': 2, '3d': 0 }, finished3D: false, autoHideToast: true, aimHint: false, dismissed: { 'classic-2d': false, '3d': false } };
  const backend = stored(before);
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await first.load();
  assert.equal(first.inFirstGames('classic-2d'), true, 'the stored document is read, not seeded again');
  assert.equal(first.shown('scrollHint'), false);
  assert.equal(first.once('scrollHint'), true, 'dismissed, or the board scrolled');
  assert.equal(first.once('scrollHint'), false);
  await settle();
  assert.equal(docOf(backend).scrollHint, true);
  const again = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await again.load();
  assert.equal(again.shown('scrollHint'), true, 'never again on that browser');
  const bad = createFirstUse({ storage: createStorage({ backend: stored({ ...before, scrollHint: 'yes' }) }), records: records(5, 0) });
  await bad.load();
  assert.equal(bad.inFirstGames('classic-2d'), false, 'a malformed value is seeded afresh');
  assert.equal(hintText('scrollHint', 'keyboard'), 'Wheel scrolls · Shift+wheel sideways');
});

test('dismissing a mode\'s strip hides it for good in that mode only', async () => {
  const backend = createMemoryBackend();
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await first.load();
  first.dismiss('classic-2d');
  assert.equal(first.dismissed('classic-2d'), true);
  assert.equal(first.dismissed('3d'), false);
  await settle();
  assert.deepEqual(docOf(backend).dismissed, { 'classic-2d': true, '3d': false });
  assert.throws(() => first.dismiss('records'), /unknown mode/);
});

test('storage failure never blocks play: the hints behave as on first use for that session', async () => {
  // Nothing persists: loads find nothing, saves fail.
  const off = createFirstUse({ storage: createStorage({ backend: createMemoryBackend({ available: false }) }), records: records(0, 0) });
  await off.load();
  assert.equal(off.rules3D, true);
  off.gameStarted('3d');
  assert.equal(off.once('autoHideToast'), true, 'kept for the session');
  assert.equal(off.once('autoHideToast'), false);
  // A backend that throws on every call.
  const broken = { read() { throw new Error('read'); }, write() { throw new Error('write'); }, keepAside() { throw new Error('aside'); }, available: () => false };
  const f = createFirstUse({ storage: createStorage({ backend: broken }), records: records(0, 0) });
  await f.load();
  assert.equal(f.inFirstGames('3d'), true);
  f.dismiss('3d');
  assert.equal(f.dismissed('3d'), true);
  // Records that cannot answer: every hint as on first use.
  const g = createFirstUse({ storage: createStorage({ backend: createMemoryBackend() }), records: { overall() { throw new Error('no records'); } } });
  await g.load();
  assert.equal(g.rules3D, true);
  assert.equal(g.inFirstGames('classic-2d'), true);
});

// ---------------------------------------------------------------- the hint strips

test('the strips: 3D from the start of play, Classic 2D once a key or the controller was used, both in the first games and until dismissed', () => {
  const base = { eligible: true, used: false, dismissed: false };
  assert.equal(stripShown({ ...base, mode: '3d', screen: 'playing' }), true, '3D: from the start of play');
  assert.equal(stripShown({ ...base, mode: '3d', screen: 'ready' }), false, 'not over the ready card');
  assert.equal(stripShown({ ...base, mode: '3d', screen: 'paused' }), false);
  assert.equal(stripShown({ ...base, mode: '3d', screen: 'replay' }), false, 'never in the replay viewer');
  assert.equal(stripShown({ ...base, mode: '3d', screen: 'playing', eligible: false }), false, 'past the first three games');
  assert.equal(stripShown({ ...base, mode: '3d', screen: 'playing', dismissed: true }), false, 'dismissed for good');
  assert.equal(stripShown({ ...base, mode: 'classic-2d', screen: 'classic-2d' }), false, '2D: not before a key or the controller');
  assert.equal(stripShown({ ...base, mode: 'classic-2d', screen: 'classic-2d', used: true }), true);
  assert.equal(stripShown({ ...base, mode: 'classic-2d', screen: 'results', used: true }), false);
  assert.equal(stripShown({ ...base, mode: 'classic-2d', screen: 'classic-2d', used: true, dismissed: true }), false);
  assert.equal(stripShown({ ...base, mode: 'classic-2d', screen: 'classic-2d', used: true, eligible: false }), false);
});

test('the strips\' words come from the bindings source, with the controller\'s glyphs while it is the active device', () => {
  assert.equal(text(hintStripHtml('classic-2d', 'keyboard')), 'Arrows move · Space reveal · F flag · D chord');
  assert.equal(text(hintStripHtml('3d', 'keyboard')), 'Left reveal · Right flag · Hold Space aim through · Hold Shift neighbours');
  const pad2d = hintStripHtml('classic-2d', 'controller', GLYPHS.playstation);
  assert.match(pad2d, /<kbd class="pad">✕<\/kbd> reveal/);
  assert.match(pad2d, /<kbd class="pad">□<\/kbd> flag/);
  assert.match(pad2d, /<kbd class="pad">△<\/kbd> chord/);
  assert.doesNotMatch(pad2d, /Space|Arrows/, 'no keyboard names on the controller strip');
  const pad3d = text(hintStripHtml('3d', 'controller', GLYPHS.xbox));
  assert.equal(pad3d, 'RT reveal · LT flag · Hold RB aim through · Hold LB neighbours');
  assert.match(read('js/shell/first-use.js') + read('js/ui.js'), /hintStripHtml\(/, 'the strip is drawn from the bindings source');
});

// ---------------------------------------------------------------- the one-time hints

test('the first auto-hide: a changed cell that is now hidden, never at a loss', () => {
  const view = { state: 'playing', unlinked: Uint8Array.of(0, 0, 1, 0) };
  assert.equal(hidCube(view, Int32Array.of(0, 1)), false);
  assert.equal(hidCube(view, Int32Array.of(1, 2)), true);
  assert.equal(hidCube({ ...view, state: 'lost' }, Int32Array.of(2)), false);
  assert.equal(hidCube(view, undefined), false);
  assert.equal(hintText('autoHide', 'keyboard'), 'Solved cubes hide. Hold Ctrl to see them.');
  assert.equal(hintText('autoHide', 'controller', GLYPHS.xbox), 'Solved cubes hide. Hold Y to see them.');
});

test('the aim hint: the crosshair rests about a second on a revealed number with a closed cube behind it', () => {
  // cells: 0 a revealed number, 1 a revealed zero, 2 closed, 3 a revealed number
  const view = { pressed: Uint8Array.of(1, 1, 0, 1), number: Int8Array.of(2, 0, 1, 3) };
  assert.equal(aimHintCell(view, 0, 2), 0, 'a number with a closed cube behind it');
  assert.equal(aimHintCell(view, 0, -1), null, 'nothing behind it');
  assert.equal(aimHintCell(view, 0, 3), null, 'only revealed cells behind it');
  assert.equal(aimHintCell(view, 1, 2), null, 'not a number');
  assert.equal(aimHintCell(view, 2, 2), null, 'a closed cube is aimed at already');
  assert.equal(aimHintCell(view, -1, 2), null);

  assert.ok(AIM_DWELL_MS >= 800 && AIM_DWELL_MS <= 1200, 'about one second');
  const dwell = createDwell(1000);
  assert.equal(dwell.update(5, 0), false);
  assert.equal(dwell.update(5, 999), false);
  assert.equal(dwell.update(5, 1000), true, 'rested a second on the same number');
  assert.equal(dwell.update(6, 1500), false, 'another cell starts over');
  assert.equal(dwell.update(null, 2000), false);
  assert.equal(dwell.update(6, 2100), false, 'leaving it starts over');
  assert.equal(dwell.update(6, 3100), true);
  assert.equal(hintText('aimHint', 'keyboard'), 'Hold Space to aim through numbers.');
  assert.equal(hintText('aimHint', 'controller', GLYPHS.playstation), 'Hold R1 to aim through numbers.');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const UI = read('js/ui.js');

test('the ready card holds the "How 3D works" block and the Space and Shift line', () => {
  const ready = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<!-- Controls modal'));
  const rules = ready.slice(ready.indexOf('id="ready-rules"'), ready.indexOf('</span>\n', ready.indexOf('id="ready-rules"')));
  assert.match(rules, /How 3D works/);
  assert.match(text(ready), /A number counts the mines among the 26 cubes around it/);
  assert.match(text(ready), /Empty and solved cubes hide themselves; hold Ctrl to show them/);
  assert.match(text(ready), /The first click is always safe/);
  assert.match(text(ready), /Hold Space to aim through numbers, Shift to see a number's neighbours/);
  assert.doesNotMatch(ready, /view modes/);
  assert.match(MAIN, /FIRST_USE\.rules3D/, 'the block shows until a 3D game is finished');
});

test('the 3D hint strip replaces the "H controls" pill and its localStorage flag', () => {
  assert.doesNotMatch(INDEX, /id="hint-h"/);
  assert.doesNotMatch(UI + MAIN, /hintH|ms3d\.hintH\.done|LS_HINT_DONE/);
  assert.match(INDEX, /<div id="hint-strip" class="hud-panel hidden"[^>]*><span id="hint-strip-text"><\/span><button type="button" id="hint-strip-close" class="hint-close" aria-label="Dismiss hint">/);
});

test('the shell counts games and finishes from the mode host, and keeps the first-use document in platform storage', () => {
  assert.match(MAIN, /createFirstUse\(\{ storage, records: RECORDS \}\)/);
  assert.match(MAIN, /MODES\.on\('started', \(\{ mode \}\) => \{[^\n]*FIRST_USE\.gameStarted\(mode\)/);
  assert.match(MAIN, /MODES\.on\('finished', \(\{ mode \}\) => FIRST_USE\.gameFinished\(mode\)\)/);
  assert.match(MAIN, /FIRST_USE\.once\('autoHideToast'\)/);
  assert.match(MAIN, /FIRST_USE\.once\('aimHint'\)/);
  assert.match(read('js/shell/first-use.js'), /^\/\/ /, 'the module documents itself');
  assert.doesNotMatch(read('js/shell/first-use.js'), /document\.|window\.|localStorage/, 'DOM-free');
});

// ---------------------------------------------------------------- browser

test('in a browser: the rules block until a finished 3D game, the one-time toast, the 3D strip and its dismissal, kept across a reload', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const shown = (id) => ms((i) => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
    const toast = () => ms(() => { const t = document.getElementById('toast'); return t.classList.contains('on') ? t.textContent : ''; });

    // A row of seven, mines at 3 and 6: a reveal at cell 0 opens 0..2 and hides the zeros 0 and 1;
    // revealing 4 and 5 then wins.
    const start = () => ms(() => { globalThis.__ms.start(7, 1, 1, 2, [3, 6]); });
    await start();
    assert.equal(await mode(), 'ready');
    assert.ok(await shown('ready-rules'), 'the "How 3D works" block on a first launch');
    await ms(() => globalThis.__ms.forcePlay());
    assert.ok(await shown('hint-strip'), 'the 3D strip from the start of play');
    assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), 'Left reveal · Right flag · Hold Space aim through · Hold Shift neighbours');
    assert.equal(await shown('hint-h'), false);

    // An abandoned game does not count as finished.
    await ms(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    await page.waitForFunction(() => globalThis.__ms.state.started);
    assert.equal(await toast(), 'Solved cubes hide. Hold Ctrl to see them.', 'the first auto-hide');
    await start(); // replaces the started game: abandoned
    assert.ok(await shown('ready-rules'), 'still shown after an abandoned game');

    // The toast shows once: a second game's first hide says nothing.
    await ms(() => document.getElementById('toast').classList.remove('on'));
    await ms(() => { globalThis.__ms.forcePlay(); globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    await page.waitForFunction(() => globalThis.__ms.state.started);
    await ms(() => { for (const c of [4, 5]) { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); } });
    await page.waitForFunction(() => globalThis.__ms.game.state === 'won');
    assert.equal(await toast(), '', 'never again');
    // The fixed board's finished game ends on the pause card after the end delay.
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: 10000 });
    await start();
    assert.equal(await shown('ready-rules'), false, 'gone after one finished 3D game');

    // The help panel does not dismiss the strip: it steps aside while the panel is open.
    await ms(() => globalThis.__ms.forcePlay());
    assert.ok(await shown('hint-strip'), 'the third game is still in the window');
    await page.keyboard.press('KeyH');
    assert.ok(await shown('help'));
    assert.equal(await shown('hint-strip'), false);
    await page.keyboard.press('KeyH');
    assert.ok(await shown('hint-strip'), 'back once the panel closes, not dismissed');
    // Dismissing the 3D strip hides it for good.
    await ms(() => document.getElementById('hint-strip-close').click());
    assert.equal(await shown('hint-strip'), false);

    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.firstUse') ?? 'null')?.data?.dismissed?.['3d'] === true,
      null, { timeout: patience(5000) }); // the saves settle
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await start();
    assert.equal(await shown('ready-rules'), false, 'remembered across a reload');
    await ms(() => globalThis.__ms.forcePlay());
    assert.equal(await shown('hint-strip'), false, 'the dismissal is remembered');
    assert.equal(await ms(() => localStorage.getItem('ms3d.hintH.done')), null, 'the old flag is not written');
    const doc = await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.firstUse')));
    assert.equal(doc.version, 1);
    assert.equal(doc.data.finished3D, true);
    assert.equal(doc.data.autoHideToast, true);
    assert.equal(doc.data.dismissed['3d'], true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser: the Classic 2D strip appears at the first key, in pad glyphs for the controller, and dismissing it hides it for good', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const shown = (id) => ms((i) => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
    const strip = () => ms(() => document.getElementById('hint-strip-text').textContent);
    const frames = (count) => ms((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
    const tap = async (button) => {
      await ms((b) => globalThis.__pad.press(b, true), button);
      await frames(1);
      await ms((b) => globalThis.__pad.press(b, false), button);
      await frames(2);
    };
    const start2D = () => ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'beginner', custom: { width: 9, height: 9, mines: 10 }, noGuess: false }));

    await page.mouse.move(10, 10); // the keyboard and mouse are the active device
    await start2D();
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'classic-2d');
    assert.equal(await shown('hint-strip'), false, 'not before a key or the controller is used');
    await page.keyboard.press('ArrowRight');
    assert.ok(await shown('hint-strip'));
    assert.equal(await strip(), 'Arrows move · Space reveal · F flag · D chord');
    // The controller: the strip names its inputs while it is the active device.
    await tap(15); // D-pad right
    assert.match(await strip(), /✕ reveal · □ flag · △ chord/);
    await page.mouse.move(40, 40);
    await frames(1);
    assert.equal(await strip(), 'Arrows move · Space reveal · F flag · D chord', 'back to the keyboard and mouse');
    // A second game: the strip waits for that game's own first key.
    await start2D();
    assert.equal(await shown('hint-strip'), false, 'not carried over from the previous game');
    await page.keyboard.press('ArrowLeft');
    assert.ok(await shown('hint-strip'));

    await page.click('#hint-strip-close');
    assert.equal(await shown('hint-strip'), false);
    await start2D();
    await page.keyboard.press('ArrowDown');
    assert.equal(await shown('hint-strip'), false, 'dismissed for good in Classic 2D');
    // The 3D strip is not dismissed with it.
    await ms(() => { globalThis.__ms.start(9, 9, 1, 10); globalThis.__ms.forcePlay(); });
    assert.ok(await shown('hint-strip'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
