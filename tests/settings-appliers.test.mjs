import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBrowserBackend } from '../js/platform/browser-backend.js';
import { createSettingsStore, SETTINGS_DOC, SETTINGS_VERSION } from '../js/settings/store.js';
import {
  pixelRatioFor, applyTheme, applyAudio, applyLook, applyResolution, applyFullscreen, applySettings,
} from '../js/settings/appliers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

function storeOf(data) {
  const initial = data === undefined ? {} : { [SETTINGS_DOC]: JSON.stringify({ version: SETTINGS_VERSION, data }) };
  const storage = createStorage({ backend: createMemoryBackend({ initial }) });
  return createSettingsStore({ storage, legacy: { get: () => null } });
}

// ---------------------------------------------------------------- render resolution

test('Auto keeps the adaptive cap, Sharp uses the full device pixel ratio, Fast uses 1', () => {
  assert.equal(pixelRatioFor('auto', 3, 1000), 2);
  assert.equal(pixelRatioFor('auto', 1.25, 1000), 1.25);
  assert.equal(pixelRatioFor('auto', 3, 21 ** 3), 1.5);
  assert.equal(pixelRatioFor('auto', 3, 51 ** 3), 1);
  assert.equal(pixelRatioFor('sharp', 3, 1000), 3);
  assert.equal(pixelRatioFor('sharp', 3, 51 ** 3), 3);
  assert.equal(pixelRatioFor('fast', 3, 1000), 1);
  assert.equal(pixelRatioFor('fast', 0.5, 1000), 1);
  assert.equal(pixelRatioFor('auto', 0, 1000), 1, 'a missing device pixel ratio counts as 1');
});

test('the resolution applier fires with the loaded value and on every change', async () => {
  const store = storeOf({ renderResolution: 'sharp' });
  const seen = [];
  applyResolution(store, (r) => seen.push(r));
  await store.load();
  assert.deepEqual(seen, ['sharp']);
  await store.set('renderResolution', 'fast');
  assert.deepEqual(seen, ['sharp', 'fast']);
});

// ---------------------------------------------------------------- theme, audio, look

test('the theme value drives setTheme, at load and on change', async () => {
  const store = storeOf({ theme: 'dark' });
  const calls = [];
  applyTheme(store, { setTheme: (t) => calls.push(t) });
  await store.load();
  await store.set('theme', 'light');
  assert.deepEqual(calls, ['dark', 'light']);
});

test('volume and mute drive the sound module', async () => {
  const store = storeOf({ volume: 0.4, muted: true });
  const calls = [];
  applyAudio(store, { setVolume: (v) => calls.push(['volume', v]), setMuted: (m) => calls.push(['muted', m]) });
  await store.load();
  assert.deepEqual(calls, [['volume', 0.4], ['muted', true]]);
  await store.set('muted', false);
  await store.set('volume', 1);
  assert.deepEqual(calls.slice(2), [['muted', false], ['volume', 1]]);
});

test('look sensitivity and invert Y drive the 3D camera', async () => {
  const store = storeOf({ lookSensitivity: 2.5, invertY: true });
  const cam = { sensitivity: 1, invertY: false };
  applyLook(store, cam);
  await store.load();
  assert.deepEqual(cam, { sensitivity: 2.5, invertY: true });
  await store.set('invertY', false);
  await store.set('lookSensitivity', 0.5);
  assert.deepEqual(cam, { sensitivity: 0.5, invertY: false });
});

test('an unsubscribe stops an applier', async () => {
  const store = storeOf();
  const cam = { sensitivity: 1, invertY: false };
  const off = applyLook(store, cam);
  await store.load();
  off();
  await store.set('lookSensitivity', 2);
  assert.equal(cam.sensitivity, 1);
});

// ---------------------------------------------------------------- fullscreen

function fakeDocument() {
  const listeners = new Set();
  const doc = {
    fullscreenElement: null,
    addEventListener(type, fn) { if (type === 'fullscreenchange') listeners.add(fn); },
    removeEventListener(type, fn) { if (type === 'fullscreenchange') listeners.delete(fn); },
    // The browser changing state on its own (Esc, or a request that went through).
    browser(on) { doc.fullscreenElement = on ? {} : null; for (const fn of [...listeners]) fn(); },
    listeners,
  };
  return doc;
}

test('setting fullscreen requests it, synchronously, and clearing it exits', async () => {
  const store = storeOf();
  const doc = fakeDocument();
  const calls = [];
  applyFullscreen(store, {
    doc,
    enter: () => { calls.push('enter'); doc.browser(true); return Promise.resolve(); },
    exit: () => { calls.push('exit'); doc.browser(false); return Promise.resolve(); },
  });
  await store.load();
  assert.deepEqual(calls, [], 'the default (off) asks nothing of the browser');
  store.set('fullscreen', true);
  assert.deepEqual(calls, ['enter'], 'the request runs inside the gesture that set it');
  await tick();
  assert.equal(store.get('fullscreen'), true);
  store.set('fullscreen', false);
  assert.deepEqual(calls, ['enter', 'exit']);
  await tick();
  assert.equal(store.get('fullscreen'), false);
});

test('when the browser leaves fullscreen on its own, the store follows', async () => {
  const store = storeOf();
  const doc = fakeDocument();
  const calls = [];
  applyFullscreen(store, { doc, enter: () => { calls.push('enter'); doc.browser(true); }, exit: () => calls.push('exit') });
  await store.load();
  store.set('fullscreen', true);
  doc.browser(false); // the player pressed Esc
  await tick();
  assert.equal(store.get('fullscreen'), false);
  assert.deepEqual(calls, ['enter'], 'following the browser never calls back into it');
});

test('a refused request leaves the store at the browser state', async () => {
  const store = storeOf({ fullscreen: true }); // no user gesture at start-up: the browser refuses
  const doc = fakeDocument();
  let asked = 0;
  applyFullscreen(store, { doc, enter: () => { asked++; return Promise.reject(new Error('no gesture')); }, exit: () => {} });
  await store.load();
  assert.equal(asked, 1);
  await tick();
  assert.equal(store.get('fullscreen'), false);

  const store2 = storeOf();
  applyFullscreen(store2, { doc: fakeDocument(), enter: () => { throw new Error('unsupported'); }, exit: () => {} });
  await store2.load();
  store2.set('fullscreen', true);
  await tick();
  assert.equal(store2.get('fullscreen'), false);
});

test('the fullscreen unsubscribe removes the browser listener', async () => {
  const store = storeOf();
  const doc = fakeDocument();
  const off = applyFullscreen(store, { doc, enter: () => {}, exit: () => {} });
  assert.equal(doc.listeners.size, 1);
  off();
  assert.equal(doc.listeners.size, 0);
});

// ---------------------------------------------------------------- all together

test('applySettings wires every owner given and unsubscribes them all', async () => {
  const store = storeOf({ theme: 'dark', volume: 0.2, lookSensitivity: 2, renderResolution: 'fast' });
  const themes = [];
  const sfx = { volume: null, muted: null, setVolume(v) { this.volume = v; }, setMuted(m) { this.muted = m; } };
  const camera = { sensitivity: 1, invertY: false };
  const resolutions = [];
  const doc = fakeDocument();
  const off = applySettings(store, {
    theme: { setTheme: (t) => themes.push(t) },
    sfx,
    camera,
    resolution: (r) => resolutions.push(r),
    fullscreen: { doc, enter: () => {}, exit: () => {} },
  });
  await store.load();
  assert.deepEqual(themes, ['dark']);
  assert.equal(sfx.volume, 0.2);
  assert.equal(sfx.muted, false);
  assert.equal(camera.sensitivity, 2);
  assert.deepEqual(resolutions, ['fast']);
  off();
  await store.set('theme', 'light');
  assert.deepEqual(themes, ['dark']);
  assert.equal(doc.listeners.size, 0);

  // An owner left out is not wired.
  const lone = storeOf();
  assert.doesNotThrow(() => applySettings(lone, { camera: { sensitivity: 1, invertY: false } }));
});

test('the appliers module is DOM-free and the store knows none of the appliers', () => {
  const src = read('js/settings/appliers.js');
  assert.doesNotMatch(src, /\b(document|window|localStorage)\./);
  const store = read('js/settings/store.js');
  assert.doesNotMatch(store, /from '[^']*(appliers|theme|audio|render|ui|main)\.js'|msTheme|document\./);
});

// ---------------------------------------------------------------- theme start-up getter

function stubRoot() {
  const attrs = new Map();
  return { getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)) };
}
function fakeWebStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
// Runs js/theme.js as the browser does, against a global carrying `document` and `localStorage`.
function startTheme(localStorage) {
  const root = stubRoot();
  const ctx = vm.createContext({ document: { documentElement: root }, localStorage });
  vm.runInContext(read('js/theme.js'), ctx);
  return root.getAttribute('data-theme');
}

test('the theme applier starts from the settings document the store saved', async () => {
  const web = fakeWebStorage();
  const storage = createStorage({ backend: createBrowserBackend({ getStorage: () => web }) });
  const store = createSettingsStore({ storage, legacy: { get: () => null } });
  await store.load();
  assert.equal(startTheme(web), 'light');
  await store.set('theme', 'dark');
  assert.equal(startTheme(web), 'dark', 'the first paint already shows the saved theme');
  await store.set('theme', 'light');
  assert.equal(startTheme(web), 'light');
});

test('the theme start-up getter falls back to Light on anything unusable', () => {
  const doc = (version, data) => ({ 'ms3d:doc:settings': JSON.stringify({ version, data }) });
  assert.equal(startTheme(undefined), 'light', 'no storage');
  assert.equal(startTheme({ getItem() { throw new Error('blocked'); } }), 'light', 'blocked storage');
  assert.equal(startTheme(fakeWebStorage({ 'ms3d:doc:settings': '{nope' })), 'light', 'corrupt text');
  assert.equal(startTheme(fakeWebStorage(doc(SETTINGS_VERSION, { theme: 'sepia' }))), 'light', 'unknown theme');
  assert.equal(startTheme(fakeWebStorage(doc(SETTINGS_VERSION, null))), 'light', 'no data');
  assert.equal(startTheme(fakeWebStorage(doc(SETTINGS_VERSION + 1, { theme: 'dark' }))), 'light',
    'a newer document the store refuses gives the default theme here too');
});

// ---------------------------------------------------------------- retired keys

test('the sound module keeps no localStorage keys of its own', async () => {
  const src = read('js/audio.js');
  assert.doesNotMatch(src, /localStorage|ms3d\./);
  const { Sfx } = await import('../js/audio.js');
  const sfx = new Sfx();
  assert.equal(sfx.muted, false);
  assert.equal(sfx.getVolume(), 0.7);
  sfx.setVolume(0.3);
  assert.equal(sfx.getVolume(), 0.3);
  sfx.setMuted(true);
  assert.equal(sfx.muted, true);
  sfx.setMuted(false);
  sfx.setVolume(0.7);
});

test('the look settings loader and its keys are retired from the UI module', () => {
  const src = read('js/ui.js');
  assert.doesNotMatch(src, /loadLookSettings|ms3d\.lookSens|ms3d\.invertY/);
  assert.doesNotMatch(read('js/main.js'), /loadLookSettings/);
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

test('in a browser, a theme change and a resolution change apply at once', async (t) => {
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
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 3 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const theme = () => ms(() => document.documentElement.getAttribute('data-theme'));
    const ratio = () => ms(() => globalThis.__ms.renderer.renderer.getPixelRatio());

    assert.equal(await ms(() => globalThis.__ms.state.mode), 'menu');
    assert.equal(await theme(), 'light');
    assert.equal(await ratio(), 2, 'Auto caps the 3x screen at 2 on the small backdrop board');

    // Each change is visible on the very next read, with no reload and no frame awaited.
    assert.equal(await ms(() => { globalThis.__ms.settings.set('theme', 'dark'); return document.documentElement.getAttribute('data-theme'); }), 'dark');
    assert.equal(await ms(() => { globalThis.__ms.settings.set('renderResolution', 'sharp'); return globalThis.__ms.renderer.renderer.getPixelRatio(); }), 3);
    assert.equal(await ms(() => { globalThis.__ms.settings.set('renderResolution', 'fast'); return globalThis.__ms.renderer.renderer.getPixelRatio(); }), 1);
    const canvasWidth = await ms(() => document.querySelector('canvas').width);
    assert.equal(canvasWidth, 900, 'the drawing buffer follows the new ratio');

    // The saved theme is on the root before any module runs.
    await page.waitForFunction(() => { // the saves have landed
      const doc = JSON.parse(localStorage.getItem('ms3d:doc:settings') ?? 'null');
      return doc?.data?.theme === 'dark' && doc?.data?.renderResolution === 'fast';
    });
    await page.route('**/js/main.js', (route) => route.abort());
    await page.reload();
    assert.equal(await theme(), 'dark', 'the start-up getter reads the saved theme');
    await page.unroute('**/js/main.js');
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await theme(), 'dark');
    assert.equal(await ratio(), 1, 'the saved resolution applies at start-up');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
