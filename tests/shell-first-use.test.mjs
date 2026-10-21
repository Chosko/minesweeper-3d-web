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
import { hintStripHtml, hintText, readyRows } from '../js/settings/bindings.js';
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

test('a Learn 3D game counts toward no window; its win marks the rules block seen, its loss does not', async () => {
  const backend = createMemoryBackend();
  const first = createFirstUse({ storage: createStorage({ backend }), records: records(0, 0) });
  await first.load();
  first.gameStarted('3d', { learn: true });
  first.gameStarted('3d', { learn: true });
  first.gameStarted('3d', { learn: true });
  assert.equal(first.inFirstGames('3d'), true, 'still the first game');
  first.gameFinished('3d', { learn: true, won: false });
  assert.equal(first.rules3D, true, 'a loss marks nothing');
  await settle();
  assert.equal(docOf(backend).games['3d'], 0);
  assert.equal(docOf(backend).finished3D, false);
  first.gameFinished('3d', { learn: true, won: true });
  assert.equal(first.rules3D, false, 'the win: the "How 3D works" block and the ready card\'s Learn 3D line stop showing');
  await settle();
  assert.equal(docOf(backend).finished3D, true);
});

test('Learn 3D\'s second prompt marks the auto-hide toast shown; storage failure never blocks it', async () => {
  const first = createFirstUse({ storage: createStorage({ backend: createMemoryBackend() }), records: records(0, 0) });
  await first.load();
  assert.equal(first.once('autoHideToast'), true, 'the shell marks it at prompt 2 through once()');
  assert.equal(first.shown('autoHideToast'), true);
  const broken = { register() {}, load: () => Promise.reject(new Error('no storage')), save: () => { throw new Error('no storage'); } };
  const off = createFirstUse({ storage: broken, records: records(0, 0) });
  await off.load();
  off.gameStarted('3d', { learn: true });
  off.gameFinished('3d', { learn: true, won: true });
  assert.equal(off.rules3D, false, 'kept for the session');
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

test('the scroll hint reads "Drag to pan · pinch to zoom" on a coarse-only device; the keyboard and controller texts are unchanged', () => {
  assert.equal(hintText('scrollHint', 'touch'), 'Drag to pan · pinch to zoom');
  assert.equal(hintText('scrollHint', 'keyboard'), 'Wheel scrolls · Shift+wheel sideways');
  assert.equal(hintText('scrollHint', 'controller'), 'Wheel scrolls · Shift+wheel sideways');
  const ui = read('js/ui.js');
  assert.match(ui, /scroll \? hintText\('scrollHint', this\._bindDevice\(this\._mode\), this\._glyphs\)/,
    'the clipped-board hint takes the touch text where the help surfaces take the touch rows');
  assert.match(ui, /_bindDevice\(mode\) \{\n    return this\._touch && this\._device === 'keyboard' \? 'touch' : this\._device;/,
    'on a coarse-only device (setTouch3D), unless a controller is in use');
  assert.match(read('js/main.js'), /ui\.setTouch3D\(COARSE_ONLY\)/);
  assert.match(read('js/classic2d/touch-input.js'), /onPan: \(dx, dy\) => \{ if \(view\.pan\(dx, dy\)\) onUserScroll\(\); \}/,
    'a touch pan of a clipped board retires it as a wheel scroll does');
});

test('on a coarse-only device each mode\'s hint strip reads its touch wording, unless a controller is in use', () => {
  assert.equal(text(hintStripHtml('classic-2d', 'touch')), 'Tap reveal · Long-press flag · Tap a number to chord');
  assert.equal(text(hintStripHtml('3d', 'touch')), 'Tap reveal · Long-press flag · Two-finger tap chord');
  for (const mode of ['classic-2d', '3d']) assert.doesNotMatch(hintStripHtml(mode, 'touch', GLYPHS.xbox), /<kbd/, `${mode}: no key or pad glyph`);
  const ui = read('js/ui.js');
  assert.match(ui, /: hintStripHtml\(this\._mode, this\._bindDevice\(this\._mode\), this\._glyphs\)/,
    'the mode\'s strip takes the device the bindings lists take: touch on a coarse-only device, the controller while it is in use');
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

test('on a touch-only device the Classic 2D strip shows from the start of the game, still in the first games and until dismissed', () => {
  const base = { mode: 'classic-2d', screen: 'classic-2d', eligible: true, used: false, dismissed: false };
  assert.equal(stripShown({ ...base, touchOnly: true }), true, 'touch-only: shown before any input');
  assert.equal(stripShown({ ...base, touchOnly: false }), false, 'a fine pointer: not before a key or the controller');
  assert.equal(stripShown({ ...base, touchOnly: true, used: true }), true);
  assert.equal(stripShown({ ...base, touchOnly: true, eligible: false }), false, 'touch-only: past the first three games');
  assert.equal(stripShown({ ...base, touchOnly: true, dismissed: true }), false, 'touch-only: dismissed for good');
  assert.equal(stripShown({ ...base, touchOnly: true, screen: 'results' }), false, 'touch-only: only on its board');
  assert.equal(stripShown({ ...base, touchOnly: true, mode: '3d', screen: 'ready' }), false, 'the 3D strip is unchanged');
});

// A key or button strip's items, [input, action] each: the whole input in one key box, then its action.
const stripItems = (html) => [...html.matchAll(/<span class="kbd-hint"><kbd>([^<]*)<\/kbd> ([^<]*)<\/span>/g)].map(([, input, action]) => [input, action]);

test('the strips\' words come from the bindings source, every input in a key box with no separators, with the controller\'s glyphs while it is the active device', () => {
  assert.deepEqual(stripItems(hintStripHtml('classic-2d', 'keyboard')), [['Arrows', 'move'], ['Space', 'reveal'], ['F', 'flag'], ['D', 'chord']]);
  assert.deepEqual(stripItems(hintStripHtml('3d', 'keyboard')), [['Left', 'reveal'], ['Right', 'flag'], ['Hold Space', 'aim through'], ['Hold Shift', 'neighbours']]);
  const pad2d = hintStripHtml('classic-2d', 'controller', GLYPHS.playstation);
  assert.deepEqual(stripItems(pad2d), [['D-pad', 'move'], ['✕', 'reveal'], ['□', 'flag'], ['△', 'chord']]);
  assert.doesNotMatch(pad2d, /Space|Arrows/, 'no keyboard names on the controller strip');
  assert.deepEqual(stripItems(hintStripHtml('3d', 'controller', GLYPHS.xbox)), [['RT', 'reveal'], ['LT', 'flag'], ['Hold RB', 'aim through'], ['Hold LB', 'neighbours']]);
  for (const mode of ['classic-2d', '3d']) {
    for (const device of ['keyboard', 'controller']) {
      const html = hintStripHtml(mode, device, GLYPHS.xbox);
      assert.equal(html.replace(/<span class="kbd-hint"><kbd>[^<]*<\/kbd> [^<]*<\/span>/g, '').trim(), '', `${mode}, ${device}: nothing but key boxes and their actions`);
      assert.doesNotMatch(html, /&middot;|·|•|&bull;/, `${mode}, ${device}: no separator`);
    }
  }
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

test('on a coarse-only device the auto-hide toast and the aim hint name the touch toolbar\'s buttons, not keys', () => {
  assert.equal(hintText('autoHide', 'touch', GLYPHS.xbox), 'Solved cubes hide. Tap the Ctrl button to see them.');
  assert.equal(hintText('aimHint', 'touch', GLYPHS.xbox), 'Tap the Space button to aim through numbers.');
  // Both are drawn for the device the help surfaces speak for: touch unless a controller is in use.
  const ui = read('js/ui.js');
  assert.match(ui, /hint\(name\) \{\s*return hintText\(name, this\._bindDevice\(this\._mode\), this\._glyphs\);/);
  assert.match(MAIN, /ui\.toast\(ui\.hint\('autoHide'\), 4000, \{ firstUse: true \}\)/);
  assert.match(MAIN, /ui\.toast\(ui\.hint\('aimHint'\), 4000, \{ firstUse: true \}\)/);
  assert.doesNotMatch(MAIN, /hintText\(/, 'the shell never picks a hint\'s device itself');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const UI = read('js/ui.js');

test('the ready card holds the "How 3D works" block and the view modes\' row', () => {
  const ready = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<!-- Controls modal'));
  const rules = ready.slice(ready.indexOf('id="ready-rules"'), ready.indexOf('id="ready-keys"'));
  assert.match(rules, /class="ui-panel ui-panel--muted[^"]*"/, 'a muted panel');
  assert.match(rules, /<div class="ui-section-label"><h3 class="ui-section-label__text" id="ready-rules-title">How 3D works<\/h3><\/div>/, 'under its section label');
  assert.match(text(ready), /A number counts the mines among the 26 cubes around it/);
  assert.match(text(ready), /Empty and solved cubes hide themselves; hold Ctrl to show them/);
  assert.match(text(ready), /The first click is always safe/);
  assert.deepEqual(readyRows('keyboard').find(([input]) => input.includes('[Space]')), ['[Shift] · [Space] · [Ctrl]', 'view modes'], 'Shift, Space and Ctrl as the view modes');
  assert.match(MAIN, /FIRST_USE\.rules3D/, 'the block shows until a 3D game is finished');
});

test('on a coarse-only device the "How 3D works" block names the toolbar\'s Ctrl button and the ready card\'s Back shows no key hint', () => {
  const ready = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<!-- Controls modal'));
  const keys = ready.match(/<span class="ready-rules-keys">([\s\S]*?)<\/span>\n/);
  const touch = ready.match(/<span class="ready-rules-touch">([\s\S]*?)<\/span>\n/);
  assert.ok(keys && touch, 'the hidden-cubes line in a keyboard and a touch form');
  assert.equal(text(keys[1]), 'Empty and solved cubes hide themselves; hold Ctrl to show them.');
  assert.equal(text(touch[1]), 'Empty and solved cubes hide themselves; hold the Ctrl button to show them.');
  assert.doesNotMatch(keys[1] + touch[1], /<kbd|<b>/, 'Ctrl as plain text, no key cap');
  const css = read('css/style.css');
  assert.match(css, /\.ready-rules-touch, \.ready--touch \.ready-rules-keys \{ display: none; \}/, 'the keyboard line on a mouse, keyboard or controller');
  assert.match(css, /\.ready--touch \.ready-rules-touch \{ display: inline; \}/, 'the touch line on touch');
  assert.match(INDEX, /id="ready-back"[^>]*>Back <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button>/, 'Back holds the back key hint, which the kit hides on touch');
  assert.match(UI, /'ready', 'learn-end', 'ctx-lost'[^\]]*\]\) showKeyHints\(/, 'the ready card\'s key hint follows the device');
  assert.match(UI, /this\.el\.ready\.classList\.toggle\('ready--touch', this\._touch\)/, 'the touch class sits on the whole ready overlay');
});

test('the 3D hint strip replaces the "H controls" pill and its localStorage flag', () => {
  assert.doesNotMatch(INDEX, /id="hint-h"/);
  assert.doesNotMatch(UI + MAIN, /hintH|ms3d\.hintH\.done|LS_HINT_DONE/);
  assert.match(INDEX, /<div id="hint-strip" class="hud-panel hidden"[^>]*><span id="hint-strip-step" class="hint-step hidden"><\/span><span id="hint-strip-text"><\/span><button type="button" id="hint-strip-close" class="hint-close" aria-label="Dismiss hint">/);
});

test('the shell counts games and finishes from the mode host, and keeps the first-use document in platform storage', () => {
  assert.match(MAIN, /createFirstUse\(\{ storage, records: RECORDS \}\)/);
  assert.match(MAIN, /MODES\.on\('started', \(\{ mode \}\) => \{[^\n]*FIRST_USE\.gameStarted\(mode, learnGame\(\)\)/);
  assert.match(MAIN, /MODES\.on\('finished', \(\{ mode \}\) => FIRST_USE\.gameFinished\(mode, learnGame\(\)\)\)/);
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
    assert.match(await ms(() => document.getElementById('ready-rules').innerText), /hold Ctrl to show them/, 'with a mouse and keyboard the rules name the Ctrl key');
    assert.doesNotMatch(await ms(() => document.getElementById('ready-rules').innerText), /tap Ctrl/);
    assert.equal(await ms(() => document.querySelector('#ready-back .ui-key-hint__key')?.textContent), 'Esc', 'the Esc key hint in the ready card\'s Back');
    await ms(() => globalThis.__ms.forcePlay());
    assert.ok(await shown('hint-strip'), 'the 3D strip from the start of play');
    assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), 'Left reveal Right flag Hold Space aim through Hold Shift neighbours');
    assert.equal(await ms(() => document.getElementById('hint-strip').parentElement.id), 'hud', 'the 3D strip over the scene, in the HUD');
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

    // The board's place and tile, and the strip's box against its board column.
    const geometry = () => ms(() => {
      const box = (el) => el.getBoundingClientRect().toJSON();
      const el = document.getElementById('hint-strip');
      const close = document.getElementById('hint-strip-close');
      const css = getComputedStyle(el);
      return {
        stage: box(document.getElementById('c2d-stage')), tile: globalThis.__ms.board2D.layout.tile, main: box(document.getElementById('c2d-main')), strip: box(el),
        parent: el.parentElement.id, position: css.position, font: [css.fontSize, css.fontWeight], padding: css.padding, gap: css.columnGap,
        close: [close.getBoundingClientRect().width, close.getBoundingClientRect().height, !!close.querySelector('svg path[d]'), close.textContent.trim()],
        boxes: [...el.querySelectorAll('#hint-strip-text kbd')].map((k) => k.textContent),
      };
    });

    await page.mouse.move(10, 10); // the keyboard and mouse are the active device
    await start2D();
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'classic-2d');
    assert.equal(await shown('hint-strip'), false, 'not before a key or the controller is used');
    await frames(2);
    const before = await geometry();
    await page.keyboard.press('ArrowRight');
    assert.ok(await shown('hint-strip'));
    assert.equal(await strip(), 'Arrows move Space reveal F flag D chord');
    await frames(2);
    const after = await geometry();
    assert.deepEqual([after.stage, after.tile], [before.stage, before.tile], 'the board keeps its place and size with the strip shown');
    assert.equal(after.parent, 'c2d-stage', 'the strip sits in the board area');
    assert.equal(after.position, 'absolute');
    assert.ok(Math.abs(after.stage.bottom - after.strip.bottom - 10) <= 0.5 && after.strip.top >= after.stage.top, `over the board, 10 px above its foot (${after.stage.bottom - after.strip.bottom})`);
    assert.ok(Math.abs((after.strip.left + after.strip.right) / 2 - (after.stage.left + after.stage.right) / 2) <= 1, 'centred on the board');
    assert.deepEqual([after.font, after.padding, after.gap], [['15px', '700'], '7px 8px 7px 18px', '14px'], 'its type, padding and gap');
    assert.deepEqual(after.close, [30, 30, true, ''], 'a 30 px close button with a stroked X');
    assert.deepEqual(after.boxes, ['Arrows', 'Space', 'F', 'D'], 'every input a key box');
    // The controller: the strip names its inputs while it is the active device.
    await tap(15); // D-pad right
    assert.equal(await strip(), 'D-pad move ✕ reveal □ flag △ chord');
    assert.deepEqual((await geometry()).boxes, ['D-pad', '✕', '□', '△'], 'the D-pad in a key box too');
    await page.mouse.move(40, 40);
    await frames(1);
    assert.equal(await strip(), 'Arrows move Space reveal F flag D chord', 'back to the keyboard and mouse');
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
