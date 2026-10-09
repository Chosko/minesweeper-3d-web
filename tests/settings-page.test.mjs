import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createSettingsStore } from '../js/settings/store.js';
import { SCHEMA, SETTING_KEYS } from '../js/settings/schema.js';
import { GLYPHS } from '../js/gamepad.js';
import { CURSOR_KEYS } from '../js/classic2d/cursor-input.js';
import {
  BINDING_MODES, BINDING_DEVICES, BINDINGS, bindingRows, bindingsListHtml,
} from '../js/settings/bindings.js';
import {
  SETTINGS_SECTIONS, SETTING_LABELS, settingControl, settingControlHtml, settingsPageHtml, bindingsSectionHtml,
  bindSettingControls,
} from '../js/settings/page.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

async function loadedStore(data) {
  const storage = createStorage({ backend: createMemoryBackend() });
  const store = createSettingsStore({ storage, legacy: { get: () => null } });
  await store.load();
  for (const [k, v] of Object.entries(data ?? {})) await store.set(k, v);
  return store;
}

// ---------------------------------------------------------------- the bindings source

test('the bindings source lists each mode\'s bindings for each input device', () => {
  assert.deepEqual(BINDING_MODES.map((m) => m.id), ['classic-2d', '3d']);
  assert.deepEqual(BINDING_DEVICES.map((d) => d.id), ['keyboard', 'controller']);
  for (const mode of BINDING_MODES) {
    for (const device of BINDING_DEVICES) {
      const rows = bindingRows(mode.id, device.id);
      assert.ok(rows.length >= 4, `${mode.id} / ${device.id} has its bindings`);
      for (const row of rows) {
        assert.equal(row.length, 2, 'each row is [input, action]');
        assert.ok(row[0] && row[1], 'neither half is empty');
      }
    }
  }
  assert.equal(bindingRows('3d', 'keyboard'), BINDINGS['3d'].keyboard);
  assert.throws(() => bindingRows('records', 'keyboard'), /unknown/);
  assert.throws(() => bindingRows('3d', 'touch'), /unknown/);
});

test('the Classic 2D keyboard bindings name every key the cursor input acts on', () => {
  const text = bindingRows('classic-2d', 'keyboard').map((r) => r[0]).join(' ');
  const names = { Space: 'Space', Enter: 'Enter', KeyF: 'F', KeyD: 'D' };
  for (const [code, name] of Object.entries(names)) {
    assert.ok(code in CURSOR_KEYS, `${code} is a cursor key`);
    assert.ok(text.includes(`[${name}]`), `the bindings show ${name}`);
  }
});

test('bindingsListHtml renders keys as <kbd>, controller buttons as the pad\'s glyphs, and escapes text', () => {
  const html = bindingsListHtml([['[W][A] then Left & right', 'Fly <fast>'], ['{rt} / {lt}', 'Reveal with {a}']], GLYPHS.playstation);
  assert.equal(html,
    '<dt><kbd>W</kbd><kbd>A</kbd> then Left &amp; right</dt><dd>Fly &lt;fast&gt;</dd>'
    + '<dt><kbd class="pad">R2</kbd> / <kbd class="pad">L2</kbd></dt><dd>Reveal with <kbd class="pad">✕</kbd></dd>');
  assert.match(bindingsListHtml([['{a}', 'x']]), /<kbd class="pad">A<\/kbd>/, 'generic glyphs by default');
});

test('the in-game help reads the same bindings source', () => {
  const index = read('index.html');
  const help = index.slice(index.indexOf('<aside id="help"'), index.indexOf('</aside>'));
  assert.match(help, /<dl class="controls"><\/dl>/, 'the help list is filled from the bindings source, not written in the markup');
  const ui = read('js/ui.js');
  assert.match(ui, /from '\.\/settings\/bindings\.js'/);
  assert.match(ui, /bindingRows\('3d', 'keyboard'\)/, 'the help panel shows the 3D keyboard bindings');
  assert.match(ui, /bindingRows\('3d', 'controller'\)/, 'the controller help shows the 3D controller bindings');
});

// ---------------------------------------------------------------- the page, generated from the schema

test('the page has the controls, graphics, theme and audio sections, holding every setting once', () => {
  assert.deepEqual(SETTINGS_SECTIONS.map((s) => s.title), ['Controls', 'Graphics', 'Theme', 'Audio']);
  assert.deepEqual(SETTINGS_SECTIONS.map((s) => s.settings), [
    ['lookSensitivity', 'invertY'], ['fullscreen', 'renderResolution'], ['theme'], ['volume', 'muted'],
  ]);
  assert.deepEqual(SETTINGS_SECTIONS.flatMap((s) => s.settings).sort(), [...SETTING_KEYS].sort(), 'every schema entry has its control');
  for (const key of SETTING_KEYS) assert.ok(SETTING_LABELS[key], `${key} has a label`);
});

test('each control\'s kind and range come from its schema entry', () => {
  const sens = settingControl('lookSensitivity');
  assert.equal(sens.kind, 'slider');
  assert.deepEqual([sens.min, sens.max, sens.scale], [SCHEMA.lookSensitivity.min, SCHEMA.lookSensitivity.max, 1]);
  const vol = settingControl('volume');
  assert.equal(vol.kind, 'slider');
  assert.deepEqual([vol.min, vol.max, vol.scale, vol.format], [0, 100, 100, 'percent'], 'volume shows as a percentage');
  for (const key of ['invertY', 'fullscreen', 'muted']) assert.equal(settingControl(key).kind, 'toggle');
  assert.equal(settingControl('theme').kind, 'segmented');
  assert.deepEqual(settingControl('theme').options, [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]);
  assert.deepEqual(settingControl('renderResolution').options.map((o) => o.value), SCHEMA.renderResolution.values);
  assert.deepEqual(settingControl('renderResolution').options.map((o) => o.label), ['Auto', 'Sharp', 'Fast']);
  assert.throws(() => settingControl('nope'), /unknown/);
});

test('the page markup is kit components only, one bound control per setting', () => {
  const html = settingsPageHtml();
  for (const key of SETTING_KEYS) {
    assert.equal([...html.matchAll(new RegExp(`data-setting="${key}"`, 'g'))].length, 1, `${key} appears once`);
    assert.ok(html.includes(settingControlHtml(key)), `${key} uses its generated control`);
  }
  assert.match(settingControlHtml('lookSensitivity'),
    /^<div class="ui-slider" data-setting="lookSensitivity"><label class="ui-slider__label" for="set-lookSensitivity">[^<]+<\/label><output class="ui-slider__value" id="set-lookSensitivity-val" for="set-lookSensitivity">1\.00×<\/output><input type="range" id="set-lookSensitivity" class="ui-slider__input" min="0\.25" max="3" step="0\.05" value="1" data-format="multiplier"><\/div>$/);
  assert.match(settingControlHtml('volume'), /min="0" max="100" step="1" value="70" data-format="percent" data-scale="100"/);
  assert.match(settingControlHtml('invertY'),
    /^<label class="ui-toggle" data-setting="invertY"><input type="checkbox" role="switch" id="set-invertY" class="ui-toggle__input"><span class="ui-toggle__label">[^<]+<\/span><\/label>$/);
  const theme = settingControlHtml('theme');
  assert.match(theme, /<div class="ui-segmented" role="radiogroup" aria-labelledby="set-theme-label" data-setting="theme" id="set-theme">/);
  assert.match(theme, /<button type="button" role="radio" aria-checked="true" class="ui-segmented__option" data-value="light">Light<\/button>/);
  assert.match(theme, /<button type="button" role="radio" aria-checked="false" class="ui-segmented__option" data-value="dark">Dark<\/button>/);
  const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-'), `kit class only, got ${c}`);
  for (const s of SETTINGS_SECTIONS) assert.match(html, new RegExp(`<h3 class="ui-heading" id="set-sec-${s.id}">${s.title}</h3>`));
});

test('the bindings section shows each mode per input device with the pad\'s glyphs', () => {
  const html = bindingsSectionHtml(GLYPHS.xbox);
  for (const mode of BINDING_MODES) {
    for (const device of BINDING_DEVICES) {
      assert.ok(html.includes(`${mode.label} · ${device.label}`), `${mode.label} / ${device.label} heading`);
      assert.ok(html.includes(bindingsListHtml(bindingRows(mode.id, device.id), GLYPHS.xbox)), `${mode.id} / ${device.id} list`);
    }
  }
  assert.ok(bindingsSectionHtml(GLYPHS.playstation).includes('<kbd class="pad">R2</kbd>'), 'the glyphs follow the controller');
});

// ---------------------------------------------------------------- binding to the store, on fakes

class FakeEl {
  constructor(attrs = {}, children = []) {
    this.attrs = { ...attrs };
    this.listeners = {};
    this.children = children;
    this.textContent = '';
    this.value = attrs.value ?? '';
    this.checked = false;
    this.disabled = false;
    this.tabIndex = 0;
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] ?? []).filter((x) => x !== f); }
  fire(t, ev = {}) { for (const f of this.listeners[t] ?? []) f({ type: t, target: this, preventDefault() {}, ...ev }); }
  dispatchEvent() { return true; }
  focus() {}
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const cls = sel.replace(/^\./, '');
    const all = [];
    const walk = (e) => { for (const c of e.children) { if ((c.attrs.class ?? '').split(' ').includes(cls)) all.push(c); walk(c); } };
    walk(this);
    return all;
  }
}

const slider = (key, attrs) => {
  const input = new FakeEl({ class: 'ui-slider__input', ...attrs });
  const output = new FakeEl({ class: 'ui-slider__value' });
  return { root: new FakeEl({ class: 'ui-slider', 'data-setting': key }, [input, output]), input, output };
};
const toggle = (key) => {
  const input = new FakeEl({ class: 'ui-toggle__input', type: 'checkbox' });
  return { root: new FakeEl({ class: 'ui-toggle', 'data-setting': key }, [input]), input };
};
const segmented = (key, values) => {
  const options = values.map((v) => new FakeEl({ class: 'ui-segmented__option', 'data-value': v, 'aria-checked': 'false' }));
  return { root: new FakeEl({ class: 'ui-segmented', 'data-setting': key }, options), options };
};

test('bound controls show the store\'s values, also the loaded ones', async () => {
  const store = await loadedStore({ lookSensitivity: 1.5, invertY: true, volume: 0.25, theme: 'dark' });
  const sens = slider('lookSensitivity', { step: '0.05', 'data-format': 'multiplier' });
  const vol = slider('volume', { step: '1', max: '100', 'data-format': 'percent', 'data-scale': '100' });
  const inv = toggle('invertY');
  const theme = segmented('theme', ['light', 'dark']);
  bindSettingControls([sens.root, vol.root, inv.root, theme.root], store);
  assert.equal(sens.input.value, '1.5');
  assert.equal(sens.output.textContent, '1.50×');
  assert.equal(vol.input.value, '25');
  assert.equal(vol.output.textContent, '25%');
  assert.equal(inv.input.checked, true);
  assert.deepEqual(theme.options.map((o) => [o.attrs['aria-checked'], o.tabIndex]), [['false', -1], ['true', 0]]);

  // A change made elsewhere (the pause card, F, M) shows at once.
  await store.set('volume', 0.5);
  await store.set('theme', 'light');
  await store.set('invertY', false);
  assert.equal(vol.input.value, '50');
  assert.equal(vol.output.textContent, '50%');
  assert.deepEqual(theme.options.map((o) => o.attrs['aria-checked']), ['true', 'false']);
  assert.equal(inv.input.checked, false);
});

test('a bound control writes the store at once, and reports the player\'s change', async () => {
  const store = await loadedStore();
  const changed = [];
  const sens = slider('lookSensitivity', { step: '0.05', 'data-format': 'multiplier' });
  const vol = slider('volume', { step: '1', max: '100', 'data-format': 'percent', 'data-scale': '100' });
  const full = toggle('fullscreen');
  const res = segmented('renderResolution', ['auto', 'sharp', 'fast']);
  const unbind = bindSettingControls([sens.root, vol.root, full.root, res.root], store, { onUserChange: (k) => changed.push(k) });

  sens.input.value = '2.25';
  sens.input.fire('input');
  assert.equal(store.get('lookSensitivity'), 2.25);
  assert.equal(sens.output.textContent, '2.25×');
  vol.input.value = '33';
  vol.input.fire('input');
  assert.equal(store.get('volume'), 0.33);
  full.input.checked = true;
  full.input.fire('change');
  assert.equal(store.get('fullscreen'), true);
  res.options[2].fire('click');
  assert.equal(store.get('renderResolution'), 'fast');
  assert.deepEqual(changed, ['lookSensitivity', 'volume', 'fullscreen', 'renderResolution']);

  unbind();
  vol.input.value = '90';
  vol.input.fire('input');
  assert.equal(store.get('volume'), 0.33, 'unbind stops writes');
  await store.set('volume', 0.8);
  await tick();
  assert.equal(vol.input.value, '90', 'and stops following the store');
});

test('bindSettingControls refuses a control for an unknown setting', async () => {
  const store = await loadedStore();
  assert.throws(() => bindSettingControls([toggle('nope').root], store), /unknown/);
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('index.html holds the Settings page as a kit card with a Back button, filled from the schema', () => {
  const page = between(INDEX, '<!-- Settings -->', '<!-- Pause / end menu -->');
  assert.match(page, /<section id="settings" class="overlay hidden" aria-label="Settings">/);
  assert.match(page, /class="ui-card ui-screen ui-screen--wide" aria-labelledby="settings-title"/);
  assert.match(page, /<div id="settings-body"><\/div>/, 'the controls are generated, not written in the markup');
  assert.match(page, /<button type="button" id="settings-back" class="ui-button ui-button--primary">Back<\/button>/);
  assert.match(read('js/ui.js'), /settingsPageHtml\(\)/);
});

test('the pause card\'s sensitivity, invert Y and volume, and the menu\'s volume, are bound to the store', () => {
  const pause = between(INDEX, '<section id="pause"', '<noscript>');
  assert.match(pause, /<div class="ui-slider" data-setting="lookSensitivity">/);
  assert.match(pause, /<label class="ui-toggle" data-setting="invertY">/);
  assert.match(pause, /<div class="ui-slider" data-setting="volume">/);
  assert.match(between(INDEX, '<section id="menu"', '<!-- 3D board choice -->'), /<div class="ui-slider" data-setting="volume">/);
  assert.match(MAIN, /bindSettingControls\(document\.querySelectorAll\('\[data-setting\]'\), SETTINGS/);
  assert.doesNotMatch(MAIN, /onLookSettings|initVolume/, 'no second path between those controls and the store');
  assert.doesNotMatch(read('js/ui.js'), /onLookSettings|initVolume|setLook\(/);
});

test('the main menu\'s Settings entry routes to the page, which declares its focus, Back and controller layer', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /\n\s+settings: \{ defaultFocus: '#set-lookSensitivity', show: /, 'the router has the settings screen');
  assert.doesNotMatch(table.match(/\n\s+settings: \{[^\n]*/)[0], /back:/, 'Back returns to the screen it was opened from');
  assert.match(MAIN, /settings: 'settings'/, 'the controller reaches the page');
  assert.match(MAIN, /BACKDROP_SCREENS = new Set\(\[[^\]]*'settings'/, 'the backdrop shows behind the page');
});

test('the catalogue documents the Settings page', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Settings page \(index\.html #settings\)[\s\S]*?Default focus: the look sensitivity slider/);
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

test('in a browser: Settings from the menu, Dark chosen, and Dark applied before the menu shows after a reload', async (t) => {
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
    // The theme on the root at the moment the main menu enters the document.
    await page.addInitScript(() => {
      new MutationObserver((_, obs) => {
        if (!document.getElementById('menu')) return;
        globalThis.__themeAtMenu = document.documentElement.getAttribute('data-theme');
        obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const theme = () => ms(() => document.documentElement.getAttribute('data-theme'));
    const setting = (key) => ms((k) => globalThis.__ms.settings.get(k), key);

    assert.equal(await theme(), 'light');
    await page.click('#menu-entry-settings');
    assert.equal(await mode(), 'settings');
    assert.equal(await active(), 'set-lookSensitivity', 'the declared default focus');
    assert.ok(await ms(() => !document.getElementById('settings').classList.contains('hidden')));
    assert.ok(await ms(() => document.getElementById('menu').classList.contains('hidden')));
    const headings = await ms(() => [...document.querySelectorAll('#settings-body h3')].map((h) => h.textContent));
    assert.deepEqual(headings.slice(0, 4), ['Controls', 'Graphics', 'Theme', 'Audio']);
    assert.ok(await ms(() => document.querySelectorAll('#settings-body dl.controls').length) >= 4, 'the bindings lists');

    // Mouse: Dark applies at once.
    await page.click('#set-theme [data-value="dark"]');
    assert.equal(await theme(), 'dark');
    assert.equal(await setting('theme'), 'dark');

    // Keyboard: arrows on the slider and the segmented choice, Space on a toggle.
    await page.focus('#set-lookSensitivity');
    await page.keyboard.press('ArrowRight');
    assert.equal(await setting('lookSensitivity'), 1.05);
    await page.focus('#set-renderResolution [data-value="auto"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await setting('renderResolution'), 'sharp');
    await page.focus('#set-muted');
    await page.keyboard.press('Space');
    assert.equal(await setting('muted'), true);
    assert.equal(await ms(() => document.getElementById('p-invert').checked), false);
    await page.focus('#set-invertY');
    await page.keyboard.press('Space');
    assert.equal(await setting('invertY'), true);
    assert.equal(await ms(() => document.getElementById('p-invert').checked), true, 'the pause card shows the same value');

    // Esc is Back: the menu it was opened from.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    // The Back button too.
    await page.click('#menu-entry-settings');
    await page.click('#settings-back');
    assert.equal(await mode(), 'menu');

    // The pause card's shortcuts read and write the same store.
    await ms(() => { globalThis.__ms.start(9, 9, 1, 10); globalThis.__ms.forcePlay(); globalThis.__ms.pause(); });
    assert.equal(await mode(), 'paused');
    assert.equal(await ms(() => document.getElementById('p-sens').value), '1.05');
    await ms(() => { const s = document.getElementById('p-vol'); s.value = '40'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await setting('volume'), 0.4);
    assert.equal(await ms(() => document.getElementById('menu-vol').value), '40');
    await ms(() => globalThis.__ms.pauser.toMenu());

    // Reload: Dark is on the root before the menu is in the document.
    await page.waitForTimeout(50); // the saves settle
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await ms(() => globalThis.__themeAtMenu), 'dark', 'Dark before the menu shows');
    assert.equal(await theme(), 'dark');
    assert.equal(await setting('theme'), 'dark');
    assert.equal(await mode(), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('in a browser, the Settings page is operable by controller', async (t) => {
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
    // A fake standard-mapping controller whose buttons the test presses.
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || document.activeElement?.getAttribute('data-value') || '');
    // The game polls the pad first thing in each animation frame, so a press held through one frame
    // is seen exactly once, short of the auto-repeat delay.
    const frames = (count) => ms((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
    const tap = async (button) => {
      await ms((b) => globalThis.__pad.press(b, true), button);
      await frames(1);
      await ms((b) => globalThis.__pad.press(b, false), button);
      await frames(2);
    };
    const BTN = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

    await ms(() => document.getElementById('menu-entry-settings').focus());
    await tap(BTN.A);
    assert.equal(await mode(), 'settings');
    assert.equal(await active(), 'set-lookSensitivity');
    await tap(BTN.RIGHT);
    assert.equal(await ms(() => globalThis.__ms.settings.get('lookSensitivity')), 1.05, 'left/right steps the slider');
    await tap(BTN.DOWN);
    assert.equal(await active(), 'set-invertY');
    await tap(BTN.A);
    assert.equal(await ms(() => globalThis.__ms.settings.get('invertY')), true, 'A switches the toggle');
    await tap(BTN.B);
    assert.equal(await mode(), 'menu', 'B is Back');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
