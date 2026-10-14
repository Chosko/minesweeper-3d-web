// Mode-aware help: the one bindings component per mode × device, the active device, the pause card's
// mode-dependent controls and look settings, the main menu's Controls panel and its tabs, H and M in
// Classic 2D, the HUD strip, Space as tap-toggle as well as hold, and " · no-guess" on the ready
// card, the overlay bar's readout and the pause card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GLYPHS } from '../js/gamepad.js';
import {
  BINDING_MODES, BINDING_DEVICES, bindingRows, bindingsListHtml, bindingsHtml, hudStripHtml, helpFootHtml,
  createActiveDevice,
} from '../js/settings/bindings.js';
import { TapToggle, SPACE_TAP_MS } from '../js/input.js';
import { boardLine3D, boardLine2D } from '../js/ui.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const text = (html) => html.replace(/<[^>]+>/g, '');

// ---------------------------------------------------------------- the bindings component

test('the bindings component shows the rows of a given mode for a given device, the controller in its glyphs', () => {
  for (const mode of BINDING_MODES) {
    for (const device of BINDING_DEVICES) {
      for (const family of ['xbox', 'playstation']) {
        const html = bindingsHtml(mode.id, device.id, GLYPHS[family]);
        assert.equal(html, bindingsListHtml(bindingRows(mode.id, device.id), GLYPHS[family]), `${mode.id} × ${device.id} is the bindings source's rows`);
      }
    }
  }
  assert.match(bindingsHtml('classic-2d', 'keyboard'), /Move the cursor/);
  assert.doesNotMatch(bindingsHtml('classic-2d', 'keyboard'), /Look around|Fly/, 'no 3D row in Classic 2D');
  assert.match(bindingsHtml('3d', 'keyboard'), /Look around/);
  assert.match(bindingsHtml('3d', 'controller', GLYPHS.playstation), /<kbd class="pad">R2<\/kbd>/);
  assert.match(bindingsHtml('classic-2d', 'controller', GLYPHS.xbox), /<kbd class="pad">A<\/kbd>/);
  assert.doesNotMatch(bindingsHtml('3d', 'controller', GLYPHS.xbox), /<kbd>[WASD]<\/kbd>/, 'no keyboard row on the controller list');
});

test('H and M are listed in both modes; F only in 3D, where it is fullscreen', () => {
  const keys2d = bindingRows('classic-2d', 'keyboard').map((r) => r.join(' ')).join('\n');
  const keys3d = bindingRows('3d', 'keyboard').map((r) => r.join(' ')).join('\n');
  assert.match(keys2d, /\[H\][^\n]*Help/);
  assert.match(keys2d, /\[M\][^\n]*sound/);
  assert.match(keys3d, /\[H\][^\n]*Help/);
  assert.match(keys3d, /\[M\][^\n]*sound/);
  assert.match(keys3d, /\[F\][^\n]*[Ff]ullscreen/);
  assert.doesNotMatch(keys2d, /[Ff]ullscreen/);
  assert.match(keys3d, /tap \[Space\]|\[Space\][^\n]*tap/, 'the Space row names the tap');
});

test('the HUD strip lists only the keys the mode binds, and the controller\'s buttons while it is the active device', () => {
  const strip3d = text(hudStripHtml('3d', 'keyboard', GLYPHS.generic, { muted: false }));
  assert.match(strip3d, /H help/);
  assert.match(strip3d, /M sound on/);
  assert.match(strip3d, /F fullscreen/);
  assert.match(strip3d, /Esc menu/);
  assert.match(text(hudStripHtml('3d', 'keyboard', GLYPHS.generic, { muted: true })), /M sound off/);
  const strip2d = text(hudStripHtml('classic-2d', 'keyboard', GLYPHS.generic, { muted: false }));
  assert.match(strip2d, /H help/);
  assert.match(strip2d, /M sound on/);
  assert.match(strip2d, /Esc menu/);
  assert.doesNotMatch(strip2d, /fullscreen|\bF\b/, 'F flags in Classic 2D, so it is not listed');
  const pad3d = hudStripHtml('3d', 'controller', GLYPHS.xbox, { muted: false });
  assert.match(pad3d, /<kbd class="pad">X<\/kbd> help/);
  assert.match(pad3d, /<kbd class="pad">Menu<\/kbd> menu/);
  assert.doesNotMatch(text(pad3d), /Esc|fullscreen|sound/, 'only what the controller binds');
  const pad2d = text(hudStripHtml('classic-2d', 'controller', GLYPHS.playstation, { muted: false }));
  assert.match(pad2d, /Options menu/);
  assert.doesNotMatch(pad2d, /help|sound|Esc/);
});

test('the H panel\'s foot line names the release rule only in 3D', () => {
  assert.match(text(helpFootHtml('3d', 'keyboard')), /Actions fire when the mouse button is released\. H hides this panel\./);
  assert.match(text(helpFootHtml('3d', 'controller', GLYPHS.xbox)), /released\. X hides this panel\./);
  assert.equal(text(helpFootHtml('classic-2d', 'keyboard')), 'H hides this panel.');
  assert.doesNotMatch(helpFootHtml('classic-2d', 'controller', GLYPHS.xbox), /released/);
});

// ---------------------------------------------------------------- the active device

test('the active device is the controller while the last input came from a connected controller', () => {
  const seen = [];
  const device = createActiveDevice({ onChange: (d) => seen.push(d) });
  assert.equal(device.current, 'keyboard');
  device.input('pad');
  assert.equal(device.current, 'keyboard', 'no controller connected');
  device.connected(true);
  assert.equal(device.current, 'keyboard', 'connecting alone changes nothing');
  device.input('pad');
  assert.equal(device.current, 'controller');
  device.input('pad');
  device.input('keyboard');
  assert.equal(device.current, 'keyboard');
  device.input('pad');
  device.input('pointer');
  assert.equal(device.current, 'keyboard', 'the mouse too');
  device.input('pad');
  device.connected(false);
  assert.equal(device.current, 'keyboard', 'a disconnect leaves the keyboard and mouse');
  assert.deepEqual(seen, ['controller', 'keyboard', 'controller', 'keyboard', 'controller', 'keyboard'], 'every change is reported once');
  assert.throws(() => device.input('touch'), /unknown input/);
});

// ---------------------------------------------------------------- Space: tap-toggle and hold

test('Space: a short tap turns aim-through on until the next tap; a hold works as before and ends with the release', () => {
  assert.ok(SPACE_TAP_MS >= 150 && SPACE_TAP_MS <= 300);
  const t = new TapToggle(200);
  assert.equal(t.on, false);
  t.down(0, true); t.up(120);
  assert.equal(t.on, true, 'a tap turns it on');
  t.down(1000, true);
  assert.equal(t.on, true, 'still on while Space is down again');
  t.up(1080);
  assert.equal(t.on, false, 'the next tap turns it off');
  t.down(2000, true); t.up(2600);
  assert.equal(t.on, false, 'a hold leaves nothing on after the release');
  t.down(3000, true); t.up(3100);
  assert.equal(t.on, true);
  t.down(4000, true); t.up(4900);
  assert.equal(t.on, false, 'a hold while it is on ends it with the release');
  t.down(5000, false); t.up(5050);
  assert.equal(t.on, false, 'a tap outside play (the ready card) turns nothing on');
  t.up(5100);
  assert.equal(t.on, false, 'a release without a press does nothing');
  t.down(6000, true); t.up(6050);
  t.reset();
  assert.equal(t.on, false, 'dropped, never fired, when input is released');
});

test('the keyboard Input feeds Space through the tap toggle; the controller\'s hold button is unchanged', () => {
  const src = read('js/input.js');
  assert.match(src, /get space\(\) \{ return this\.keys\.has\('Space'\) \|\| this\.spaceToggle\.on; \}/);
  assert.match(src, /releaseAll\(\) \{[^}]*this\.spaceToggle\.reset\(\)/);
  assert.match(read('js/main.js'), /controls\.pad\.space = held\(BTN\.RB\);/, 'the controller keeps its hold');
});

// ---------------------------------------------------------------- " · no-guess"

test('a no-guess board says so on its board line', () => {
  assert.equal(boardLine3D({ X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }), '6 × 6 × 6 · no-guess');
  assert.equal(boardLine3D({ X: 6, Y: 6, Z: 6, mines: 10, noGuess: false }), '6 × 6 × 6');
  assert.equal(boardLine3D({ X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }, { mines: true }), '6 × 6 × 6 · 10 mines · no-guess');
  assert.equal(boardLine3D({ X: 2, Y: 2, Z: 1, mines: 1 }, { mines: true }), '2 × 2 × 1 · 1 mine');
  assert.equal(boardLine2D({ width: 30, height: 16, noGuess: true }), '30 × 16 · no-guess');
  assert.equal(boardLine2D({ width: 9, height: 9, noGuess: false }), '9 × 9');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const UI = read('js/ui.js');
const between = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start)));

test('the pause card, the Controls panel and the H panel have no hard-coded bindings list', () => {
  const pause = between(INDEX, '<section id="pause"', '<noscript>');
  assert.match(pause, /<dl id="pause-controls" class="controls compact"><\/dl>/);
  assert.doesNotMatch(pause, /<dt>/, 'the 3D list is gone from the markup');
  assert.match(pause, /<p id="pause-board" class="ui-text ui-text--muted">/, 'the pause card names the board');
  const modal = between(INDEX, '<section id="controls-modal"', '</section>');
  assert.match(modal, /<div id="controls-tabs" class="ui-segmented" role="radiogroup" aria-label="Mode">/);
  assert.match(modal, /data-value="classic-2d">Classic 2D<\/button>/);
  assert.match(modal, /data-value="3d"[^>]*>3D<\/button>/);
  assert.match(modal, /<dl id="controls-body" class="controls"><\/dl>/);
  assert.doesNotMatch(modal + INDEX, /id="modal-pad"|id="help-pad"/);
  const help = between(INDEX, '<aside id="help"', '</aside>');
  assert.match(help, /<dl class="controls"><\/dl>/);
  assert.match(help, /<p id="help-foot" class="help-foot"><\/p>/);
  assert.doesNotMatch(UI, /cloneNode/, 'the Controls panel is not a copy of the help list');
  assert.doesNotMatch(UI, /bindingRows\('3d', 'keyboard'\)/, 'no surface is fixed to the 3D keyboard rows');
  assert.match(UI, /bindingsHtml\(/);
});

test('the HUD strip is generated and shows in Classic 2D; the hint strip shows there too', () => {
  assert.match(INDEX, /<div id="hud-tools" class="hud-panel hud-tools"><\/div>/);
  const style = read('css/style.css');
  const hidden2d = style.match(/#hud\.hud--2d[^{]*\{[^}]*display: none/)[0];
  assert.doesNotMatch(hidden2d, /hud-tools|hint-strip/);
  assert.match(UI, /hudStripHtml\(/);
});

test('H and M work on the Classic 2D board; F stays the 3D fullscreen key', () => {
  const onKey = between(MAIN, 'onKey: (code, e) => {', 'onLockChange');
  assert.match(onKey, /'classic-2d'/);
  assert.match(onKey, /KeyH/);
  assert.match(onKey, /KeyM/);
  assert.match(onKey, /KeyF'[^\n]*MODES\.active === '3d'|MODES\.active === '3d'[^\n]*KeyF/, 'F toggles fullscreen only in 3D');
});

test('the pause card is fed by the active mode and device; its look settings show only in 3D', () => {
  assert.match(MAIN, /mode: MODES\.active/);
  assert.match(UI, /'lookSensitivity', 'invertY'/);
});

test('none of the help panel, the HUD strip and the hint strip shows in the replay viewer', () => {
  assert.match(MAIN, /\[REPLAY_SCREEN\]: \{[^\n]*show: \(d = \{\}\) => \{ ui\.showReplay\(\); REPLAY_VIEWER\.show\(d\); \}/);
  const showReplay = between(UI, 'showReplay() {', '\n  }');
  for (const part of ['hud', 'help', 'HintStrip', 'toast']) assert.match(showReplay, new RegExp(part), `showReplay hides the ${part}`);
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
async function launch(t) {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return null; }
  try {
    return await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return null;
  }
}

test('in a browser: the Controls panel tabs, H, M and the HUD strip in Classic 2D, and each mode\'s pause card', async (t) => {
  const browser = await launch(t);
  if (!browser) return;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const shown = (id) => ms((i) => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
    const textOf = (sel) => ms((s) => document.querySelector(s).textContent, sel);

    // The main menu's Controls panel: Classic 2D and 3D tabs.
    await page.click('#menu-help');
    assert.ok(await shown('controls-modal'));
    assert.match(await textOf('#controls-body'), /Move the cursor/, 'Classic 2D first');
    assert.match(await textOf('#controls-body'), /Help/, 'H is named');
    await page.click('#controls-tabs [data-value="3d"]');
    assert.match(await textOf('#controls-body'), /Look around/);
    assert.doesNotMatch(await textOf('#controls-body'), /Move the cursor/);
    await page.keyboard.press('Escape');
    assert.equal(await shown('controls-modal'), false);

    // Classic 2D: the HUD strip with only its keys, H opens the 2D help, M toggles sound.
    await page.click('#menu-entry-classic-2d');
    await page.uncheck('#c2d-noguess'); // a standard board: no-guess is on by default
    await page.click('#c2d-choice [data-size="beginner"]');
    assert.equal(await mode(), 'classic-2d');
    assert.ok(await shown('hud-tools'), 'the HUD strip shows in Classic 2D');
    const strip = await textOf('#hud-tools');
    assert.match(strip, /H help/);
    assert.match(strip, /M sound on/);
    assert.doesNotMatch(strip, /fullscreen/);
    assert.equal(await textOf('#hud-size'), '9 × 9');
    await page.keyboard.press('KeyH');
    assert.ok(await shown('help'));
    assert.match(await textOf('#help .controls'), /Move the cursor/);
    assert.doesNotMatch(await textOf('#help-foot'), /released/);
    await page.keyboard.press('KeyH');
    assert.equal(await shown('help'), false);
    await page.keyboard.press('KeyM');
    assert.equal(await ms(() => globalThis.__ms.settings.get('muted')), true);
    assert.match(await textOf('#hud-tools'), /M sound off/);
    await page.keyboard.press('KeyM');
    assert.equal(await ms(() => document.fullscreenElement), null);

    // The Classic 2D pause card: the 2D rows, the board, volume but no look settings.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    assert.match(await textOf('#pause-controls'), /Move the cursor/);
    assert.doesNotMatch(await textOf('#pause-controls'), /Look around/);
    assert.equal(await textOf('#pause-board'), '9 × 9');
    assert.equal(await shown('p-sens'), false, 'no look sensitivity in Classic 2D');
    assert.equal(await shown('p-invert'), false, 'no invert Y in Classic 2D');
    assert.ok(await shown('p-vol'), 'volume in both modes');
    assert.ok(await shown('p-sound'));
    await ms(() => globalThis.__ms.pauser.toMenu());

    // A no-guess Classic 2D board says so on the readout and the pause card.
    await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'beginner', custom: { width: 9, height: 9, mines: 10 }, noGuess: true }));
    assert.equal(await textOf('#hud-size'), '9 × 9 · no-guess');
    await page.keyboard.press('Escape');
    assert.equal(await textOf('#pause-board'), '9 × 9 · no-guess');
    await ms(() => globalThis.__ms.pauser.toMenu());

    // 3D, no-guess: the ready card, the readout and the pause card; the 3D rows and the look settings.
    await ms(() => globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }));
    assert.equal(await mode(), 'ready');
    assert.equal(await textOf('#ready-board'), '6 × 6 × 6 · 10 mines · no-guess');
    assert.equal(await textOf('#hud-size'), '6 × 6 × 6 · no-guess');
    assert.match(await textOf('#hud-tools'), /F fullscreen/);
    await ms(() => { globalThis.__ms.forcePlay(); globalThis.__ms.pause(); });
    assert.equal(await mode(), 'paused');
    assert.equal(await textOf('#pause-board'), '6 × 6 × 6 · no-guess');
    assert.match(await textOf('#pause-controls'), /Look around/);
    assert.ok(await shown('p-sens'), 'look sensitivity on a 3D game\'s pause card');
    assert.ok(await shown('p-invert'));
    await page.keyboard.press('KeyH');
    assert.match(await textOf('#help .controls'), /Look around/);
    assert.match(await textOf('#help-foot'), /Actions fire when the mouse button is released/);
    await page.keyboard.press('KeyH');
    await ms(() => globalThis.__ms.pauser.toMenu());
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('in a browser: the controller as the active device redraws every shown surface in its glyphs', async (t) => {
  const browser = await launch(t);
  if (!browser) return;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const textOf = (sel) => ms((s) => document.querySelector(s).textContent, sel);
    const htmlOf = (sel) => ms((s) => document.querySelector(s).innerHTML, sel);
    const frames = (count) => ms((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
    const tap = async (button) => {
      await ms((b) => globalThis.__pad.press(b, true), button);
      await frames(1);
      await ms((b) => globalThis.__pad.press(b, false), button);
      await frames(2);
    };
    const BTN = { X: 2, START: 9, DOWN: 13 };

    await page.mouse.move(5, 5);
    await ms(() => { globalThis.__ms.start(9, 9, 1, 10); globalThis.__ms.forcePlay(); });
    assert.match(await textOf('#hud-tools'), /H help/, 'the keyboard and mouse first');
    await tap(BTN.DOWN); // spacing: a controller input in play
    assert.match(await htmlOf('#hud-tools'), /<kbd class="pad">X<\/kbd> help/);
    assert.match(await htmlOf('#hud-tools'), /<kbd class="pad">Menu<\/kbd> menu/);
    assert.doesNotMatch(await textOf('#hud-tools'), /Esc|fullscreen/);
    assert.match(await htmlOf('#hint-strip-text'), /<kbd class="pad">RT<\/kbd> reveal/);
    await tap(BTN.X);
    assert.match(await textOf('#help .controls'), /Fly \/ look around/, 'the H panel shows the controller rows');
    await tap(BTN.X);
    await tap(BTN.START);
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    assert.match(await textOf('#pause-controls'), /Fly \/ look around/, 'the pause card shows the controller rows');
    // The keyboard and mouse again: every shown surface follows.
    await page.mouse.move(50, 50);
    await frames(1);
    assert.match(await textOf('#pause-controls'), /Look around/);
    assert.doesNotMatch(await textOf('#pause-controls'), /Fly \/ look around/);
    assert.match(await textOf('#hud-tools'), /H help/);
    await ms(() => globalThis.__ms.pauser.toMenu());
    // The main menu's Controls panel follows the device too.
    await ms(() => document.getElementById('menu-help').click());
    assert.doesNotMatch(await textOf('#controls-body'), /D-pad/);
    await tap(BTN.DOWN);
    assert.match(await textOf('#controls-body'), /D-pad/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('in a browser: a Space tap keeps aim-through on until the next tap; a hold ends with its release', async (t) => {
  const browser = await launch(t);
  if (!browser) return;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const space = () => ms(() => globalThis.__ms.controls.space);
    // A tap: the press and the release in one task, so a slow frame cannot stretch it into a hold.
    const tapSpace = () => ms(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    });
    await ms(() => { globalThis.__ms.start(9, 9, 1, 10); globalThis.__ms.forcePlay(); });
    await tapSpace();
    assert.equal(await space(), true, 'a tap turns aim-through on');
    await page.waitForTimeout(300);
    assert.equal(await space(), true, 'and keeps it on');
    await page.waitForFunction(() => document.getElementById('chip-space').classList.contains('on'), null, { timeout: 5000 });
    await tapSpace();
    assert.equal(await space(), false, 'the next tap turns it off');
    await page.keyboard.down('Space');
    assert.equal(await space(), true, 'held');
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    assert.equal(await space(), false, 'a hold ends with the release');
    await tapSpace();
    assert.equal(await space(), true);
    await ms(() => globalThis.__ms.pause());
    assert.equal(await space(), false, 'pausing drops it');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
