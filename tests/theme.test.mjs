import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { createTokenReader, FALLBACK_COLOR } from '../js/tokens.js';
import { SCENE_TOKENS, parseRgb, scenePalette, bindScenePalette } from '../js/shell/scene-palette.js';
import { THEMES, DEFAULT_THEME_ID, registerTheme, themeById } from '../js/themes/registry.js';
import { createThemeApplier, themeIdFor, START_FALLBACK, SWITCH_FAILED } from '../js/themes/applier.js';
import { SETTINGS_VERSION } from '../js/settings/store.js';
import { FIXTURE_THEME } from './fixtures/themes/fixture-theme.js';
import { browserSuite } from './helpers/browser.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const THEME_SRC = read('../js/theme.js');
const THEME_ID = 'joyful-tiles';
const FIXTURE_ID = FIXTURE_THEME.id;
const SCOPE = `:root[data-theme="${THEME_ID}"]`;
const THEME_CSS = read('../themes/joyful-tiles/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
const FIXTURE_CSS = read('./fixtures/themes/fixture-dusk/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
const suite = browserSuite({ args: [] });

registerTheme(FIXTURE_THEME);

// ---------- stubs ----------
function stubRoot(log = []) {
  const attrs = new Map();
  return {
    attrs,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => { attrs.set(k, String(v)); if (k === 'data-theme') log.push(`flip ${v}`); },
  };
}

function stubStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null) };
}

const settingsDoc = (theme, version = 1) => ({ 'ms3d:doc:settings': JSON.stringify({ version, data: { theme } }) });

// A document whose <link> elements load or fail on the next turn: a stylesheet whose href contains
// one of `fail` fails. `log` records each load, flip, removal and notification in order.
function fakeDoc({ fail = [], failFonts = false } = {}) {
  const log = [];
  const root = stubRoot(log);
  const head = {
    children: [],
    appendChild(el) {
      el.parentNode = head;
      head.children.push(el);
      const failed = fail.some((f) => el.href.includes(f));
      setTimeout(() => {
        log.push(`${failed ? 'error' : 'load'} ${el.getAttribute('data-theme-sheet')}`);
        if (!failed) el.sheet = {};
        for (const l of el.listeners[failed ? 'error' : 'load']) l({ type: failed ? 'error' : 'load' });
      });
      return el;
    },
    removeChild(el) {
      head.children.splice(head.children.indexOf(el), 1);
      el.parentNode = null;
      log.push(`remove ${el.getAttribute('data-theme-sheet')}`);
      return el;
    },
  };
  function createElement(tag) {
    const attrs = new Map();
    const el = {
      tagName: tag.toUpperCase(),
      rel: '',
      href: '',
      sheet: null,
      parentNode: null,
      listeners: { load: [], error: [] },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      addEventListener: (type, fn) => el.listeners[type]?.push(fn),
      remove: () => { if (el.parentNode) el.parentNode.removeChild(el); },
    };
    return el;
  }
  const fonts = {
    load: async (spec) => {
      log.push(`font ${spec}`);
      if (failFonts) throw new Error('font failed');
      return [];
    },
  };
  const sheets = () => head.children.map((l) => l.getAttribute('data-theme-sheet'));
  return { doc: { documentElement: root, head, createElement, fonts }, root, log, sheets };
}

// Runs js/theme.js the way the browser does: a classic script against a global that carries
// `document` (and `localStorage` when given).
function loadThemeScript({ fake = fakeDoc(), storage } = {}) {
  const ctx = vm.createContext({ document: fake.doc, ...(storage === undefined ? {} : { localStorage: storage }) });
  vm.runInContext(THEME_SRC, ctx);
  return { boot: ctx.msThemeBoot, prePaint: ctx.msThemePrePaint, ...fake };
}

// A board-module importer that records each import and fails for the paths in `fail`.
function importer(log, fail = []) {
  return async (url) => {
    log.push(`import ${url}`);
    if (fail.some((f) => url.includes(f))) throw new Error(`cannot import ${url}`);
    return { BOARD: { from: url } };
  };
}

const BASE = 'https://example.test/';

function applierOf({ fake = fakeDoc(), storage, failImports = [], stylesheets } = {}) {
  let boot;
  if (stylesheets) {
    const ctx = vm.createContext({ document: fake.doc });
    vm.runInContext(THEME_SRC, ctx);
    fake.doc.head.children.length = 0;
    fake.log.length = 0;
    boot = ctx.msThemePrePaint.boot({ doc: fake.doc, storage, stylesheets });
  } else {
    boot = loadThemeScript({ fake, storage }).boot;
  }
  const notices = [];
  const errors = [];
  const applier = createThemeApplier({
    doc: fake.doc, boot, base: BASE, importModule: importer(fake.log, failImports), onError: (e) => errors.push(e),
  });
  return { applier, notices, errors, notice: (t) => notices.push(t), ...fake };
}

// The theme's token block: the declarations of its scoped :root rule.
function tokenBlock(css = THEME_CSS, id = THEME_ID) {
  const esc = `:root[data-theme="${id}"]`.replace(/[[\]"().:]/g, '\\$&');
  const m = css.match(new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `the ${id} stylesheet opens with its token block`);
  const decls = new Map();
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i > 0 && d.slice(0, i).trim().startsWith('--')) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return decls;
}
const TOKENS = tokenBlock();
const FIXTURE_TOKENS = tokenBlock(FIXTURE_CSS, FIXTURE_ID);
// Computed-style stub backed by each theme's token block, applied while the root carries its id.
const sheetStyle = (el) => ({
  getPropertyValue: (p) => {
    const id = el.getAttribute('data-theme');
    const block = id === THEME_ID ? TOKENS : id === FIXTURE_ID ? FIXTURE_TOKENS : new Map();
    return block.get(p) ?? '';
  },
});

// A theme-change source for the token reader and the scene palette.
function emitter() {
  const listeners = new Set();
  return {
    onThemeChange: (l) => { listeners.add(l); return () => listeners.delete(l); },
    emit: (id) => { for (const l of [...listeners]) l(id, {}); },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 5));

// ---------- the pre-paint script ----------
test('the pre-paint script maps the stored theme: absent or unknown → the default, light or dark → Joyful tiles', () => {
  const cases = [
    [undefined, THEME_ID, 'no storage'],
    [stubStorage(), THEME_ID, 'no settings document'],
    [stubStorage(settingsDoc('sepia')), THEME_ID, 'an unknown id'],
    [stubStorage(settingsDoc('light')), THEME_ID, 'light'],
    [stubStorage(settingsDoc('dark')), THEME_ID, 'dark'],
    [stubStorage(settingsDoc(THEME_ID)), THEME_ID, 'a registered id'],
    [stubStorage({ 'ms3d:doc:settings': '{nope' }), THEME_ID, 'corrupt text'],
    [{ getItem() { throw new Error('blocked'); } }, THEME_ID, 'blocked storage'],
  ];
  for (const [storage, want, label] of cases) {
    const { root, boot, sheets } = loadThemeScript({ storage });
    assert.equal(root.getAttribute('data-theme'), want, label);
    assert.equal(boot.id, want, label);
    assert.deepEqual(sheets(), [want], `${label}: its stylesheet is inserted`);
  }
});

test('the pre-paint script reads the settings document at the store\'s version and at version 1, before its format step runs', () => {
  const { prePaint } = loadThemeScript();
  assert.equal(SETTINGS_VERSION, 2);
  assert.equal(prePaint.readStoredTheme(stubStorage(settingsDoc(FIXTURE_ID, SETTINGS_VERSION))), FIXTURE_ID, 'the store\'s version');
  assert.equal(prePaint.readStoredTheme(stubStorage(settingsDoc('dark', 1))), 'dark', 'version 1, mapped afterwards');
  assert.equal(prePaint.readStoredTheme(stubStorage(settingsDoc(FIXTURE_ID, SETTINGS_VERSION + 1))), null, 'a newer document reads as none');
  const fake = fakeDoc();
  const boot = prePaint.boot({
    doc: fake.doc,
    storage: stubStorage(settingsDoc(FIXTURE_ID, SETTINGS_VERSION)),
    stylesheets: { [THEME_ID]: 'themes/joyful-tiles/theme.css', [FIXTURE_ID]: FIXTURE_THEME.stylesheet },
  });
  boot.ready.catch(() => {});
  assert.equal(boot.id, FIXTURE_ID, 'a registered id saved at the store\'s version starts in that theme');
});

test('the pre-paint mapping keeps a registered id and maps the rest, as the run-time applier does', () => {
  const { prePaint } = loadThemeScript();
  const stylesheets = { [THEME_ID]: 'a.css', [FIXTURE_ID]: 'b.css' };
  for (const [stored, want] of [[FIXTURE_ID, FIXTURE_ID], [THEME_ID, THEME_ID], ['light', THEME_ID], ['dark', THEME_ID], ['sepia', THEME_ID], [null, THEME_ID], [42, THEME_ID]]) {
    assert.equal(prePaint.themeIdOf(stored, stylesheets), want, String(stored));
  }
  for (const [value, want] of [[FIXTURE_ID, FIXTURE_ID], ['light', THEME_ID], ['dark', THEME_ID], ['sepia', THEME_ID], [undefined, THEME_ID]]) {
    assert.equal(themeIdFor(value), want, `applier: ${String(value)}`);
  }
});

test('the stylesheet is inserted synchronously as a render-blocking link with the root attribute set', () => {
  const { root, doc, boot } = loadThemeScript({ storage: stubStorage(settingsDoc('dark')) });
  assert.equal(doc.head.children.length, 1, 'inserted while the script runs, before anything paints');
  const [link] = doc.head.children;
  assert.equal(link.rel, 'stylesheet');
  assert.equal(link.getAttribute('blocking'), 'render');
  assert.equal(link.getAttribute('data-theme-sheet'), THEME_ID);
  assert.equal(link.href, 'themes/joyful-tiles/theme.css');
  assert.equal(root.getAttribute('data-theme'), THEME_ID);
  assert.equal(boot.link, link);
});

test('the pre-paint table mirrors the registry: every theme\'s id and stylesheet, and the default', () => {
  const { prePaint } = loadThemeScript();
  assert.deepEqual({ ...prePaint.STYLESHEETS }, Object.fromEntries(THEMES.map((t) => [t.id, t.stylesheet])));
  assert.equal(prePaint.DEFAULT_THEME, DEFAULT_THEME_ID);
});

test('a non-default theme whose stylesheet fails at start-up falls back to the default before the module graph runs', async () => {
  const fake = fakeDoc({ fail: ['fixture'] });
  const { applier, notices, notice, root, sheets } = applierOf({
    fake, storage: stubStorage(settingsDoc(FIXTURE_ID)), stylesheets: { [THEME_ID]: 'themes/joyful-tiles/theme.css', [FIXTURE_ID]: FIXTURE_THEME.stylesheet },
  });
  assert.equal(root.getAttribute('data-theme'), FIXTURE_ID, 'the stored theme is tried first');
  const handed = [];
  applier.onThemeChange((id, board) => handed.push([id, board]));
  assert.equal(await applier.start({ notice }), THEME_ID);
  assert.equal(root.getAttribute('data-theme'), THEME_ID);
  assert.deepEqual(sheets(), [THEME_ID], 'the failed stylesheet is gone');
  assert.deepEqual(notices, [START_FALLBACK], 'the player is told once');
  assert.deepEqual(handed.map(([id]) => id), [THEME_ID]);
  await applier.setTheme(FIXTURE_ID);
  assert.deepEqual(notices, [START_FALLBACK], 'the stored value applied at load is not retried or told again');
  assert.equal(applier.current(), THEME_ID);
});

test('a non-default theme whose board module fails at start-up falls back to the default and tells the player once', async () => {
  const { applier, notices, notice, root, sheets } = applierOf({
    storage: stubStorage(settingsDoc(FIXTURE_ID)),
    stylesheets: { [THEME_ID]: 'themes/joyful-tiles/theme.css', [FIXTURE_ID]: FIXTURE_THEME.stylesheet },
    failImports: ['fixture-dusk/board.js'],
  });
  assert.equal(await applier.start({ notice }), THEME_ID);
  assert.equal(root.getAttribute('data-theme'), THEME_ID);
  assert.deepEqual(sheets(), [THEME_ID]);
  assert.deepEqual(notices, [START_FALLBACK]);
});

test('the default theme failing to load rejects start-up, for the fatal card', async () => {
  for (const opts of [{ fake: fakeDoc({ fail: ['joyful-tiles'] }) }, { failImports: ['joyful-tiles/board.js'] }]) {
    const { applier, notice } = applierOf(opts);
    await assert.rejects(applier.start({ notice }));
  }
  const main = read('../js/main.js');
  assert.match(main, /\.start\(\{[^}]*notice[^}]*\}\)\.catch\(\(\) => showFatal\(\)\)/, 'main.js shows the fatal card when start-up rejects');
  const cloneCard = "document.body.append(document.getElementById('fatal-card').content.cloneNode(true))";
  assert.ok(main.slice(main.indexOf('function showFatal')).startsWith(`function showFatal() {\n  ${cloneCard};`), 'showFatal clones the fatal card');
  const html = read('../index.html');
  assert.match(html, /<template id="fatal-card"><div class="fatal">/, 'one fatal card, in the page');
  assert.ok(html.includes(`onerror="${cloneCard}"`), 'the module graph failing to load shows the same card');
});

// ---------- the run-time applier ----------
test('start-up imports the active theme\'s board module and fonts and hands the module to subscribers', async () => {
  const { applier, log } = applierOf();
  const handed = [];
  applier.onThemeChange((id, board) => handed.push([id, board]));
  assert.equal(await applier.start(), THEME_ID);
  assert.ok(log.includes(`import ${BASE}themes/joyful-tiles/board.js`));
  assert.ok(log.some((l) => l.startsWith('font ') && l.includes('"Rubik"')), 'the theme\'s fonts are loaded');
  assert.equal(handed.length, 1);
  assert.equal(handed[0][0], THEME_ID);
  assert.equal(handed[0][1], applier.board());
  assert.equal(applier.current(), THEME_ID);
});

test('a switch loads the stylesheet, imports the board module and loads its fonts, then flips, removes the old sheet and notifies', async () => {
  const { applier, log, root, sheets } = applierOf();
  await applier.start();
  log.length = 0;
  const handed = [];
  applier.onThemeChange((id, board) => { log.push(`notify ${id}`); handed.push(board); });
  const pending = applier.setTheme(FIXTURE_ID);
  assert.equal(root.getAttribute('data-theme'), THEME_ID, 'nothing flips before the files are ready');
  assert.equal(await pending, FIXTURE_ID);
  assert.deepEqual(log, [
    `load ${FIXTURE_ID}`,
    `import ${BASE}${FIXTURE_THEME.boardModule}`,
    `flip ${FIXTURE_ID}`,
    `remove ${THEME_ID}`,
    `notify ${FIXTURE_ID}`,
  ]);
  assert.deepEqual(sheets(), [FIXTURE_ID]);
  assert.equal(applier.current(), FIXTURE_ID);
  assert.deepEqual(handed[0], { BOARD: { from: `${BASE}${FIXTURE_THEME.boardModule}` } });
  assert.equal(applier.board(), handed[0]);
  log.length = 0;
  assert.equal(await applier.setTheme(THEME_ID), THEME_ID);
  assert.equal(log.indexOf(`flip ${THEME_ID}`) > log.findIndex((l) => l.startsWith('font ')), true, 'the fonts load before the flip');
  assert.deepEqual(log.slice(-2), [`remove ${FIXTURE_ID}`, `notify ${THEME_ID}`]);
});

test('setTheme of the active theme, light, dark or an unknown id changes nothing', async () => {
  const { applier, log, sheets } = applierOf();
  await applier.start();
  log.length = 0;
  let calls = 0;
  applier.onThemeChange(() => calls++);
  for (const value of [THEME_ID, 'light', 'dark', 'sepia', undefined]) assert.equal(await applier.setTheme(value), THEME_ID);
  assert.deepEqual(log, []);
  assert.equal(calls, 0);
  assert.deepEqual(sheets(), [THEME_ID]);
});

test('a switch whose stylesheet, board module or fonts fail rejects with the previous theme active and tells the player once', async () => {
  for (const [label, opts] of [
    ['stylesheet', { fake: fakeDoc({ fail: ['fixture-dusk/theme.css'] }) }],
    ['board module', { failImports: ['fixture-dusk/board.js'] }],
  ]) {
    const { applier, notices, notice, root, sheets } = applierOf(opts);
    await applier.start({ notice });
    let calls = 0;
    applier.onThemeChange(() => calls++);
    await assert.rejects(applier.setTheme(FIXTURE_ID), label);
    assert.equal(root.getAttribute('data-theme'), THEME_ID, label);
    assert.equal(applier.current(), THEME_ID, label);
    assert.deepEqual(sheets(), [THEME_ID], `${label}: the new stylesheet is removed`);
    assert.deepEqual(notices, [SWITCH_FAILED], label);
    assert.equal(calls, 0, `${label}: no change is announced`);
  }
  // fonts: switching back to Joyful tiles, whose fonts fail
  const fake = fakeDoc();
  const { applier, notices, notice, root, sheets } = applierOf({ fake });
  await applier.start({ notice });
  await applier.setTheme(FIXTURE_ID);
  fake.doc.fonts.load = async () => { throw new Error('font failed'); };
  await assert.rejects(applier.setTheme(THEME_ID));
  assert.equal(root.getAttribute('data-theme'), FIXTURE_ID);
  assert.deepEqual(sheets(), [FIXTURE_ID]);
  assert.deepEqual(notices, [SWITCH_FAILED]);
});

test('a listener that throws does not stop the others', async () => {
  const { applier, errors } = applierOf();
  await applier.start();
  const seen = [];
  applier.onThemeChange(() => { throw new Error('boom'); });
  const off = applier.onThemeChange((id) => seen.push(id));
  await applier.setTheme(FIXTURE_ID);
  assert.deepEqual(seen, [FIXTURE_ID]);
  assert.equal(errors.length, 1);
  off();
  await applier.setTheme(THEME_ID);
  assert.deepEqual(seen, [FIXTURE_ID], 'unsubscribed');
});

test('switches requested together apply in order, each after the previous one settles', async () => {
  const { applier } = applierOf();
  await applier.start();
  const seen = [];
  applier.onThemeChange((id) => seen.push(id));
  await Promise.all([applier.setTheme(FIXTURE_ID), applier.setTheme(THEME_ID), applier.setTheme(FIXTURE_ID)]);
  assert.deepEqual(seen, [FIXTURE_ID, THEME_ID, FIXTURE_ID]);
  assert.equal(applier.current(), FIXTURE_ID);
});

test('the token reader follows a switch: its values are the new theme\'s and its listeners hear the change', async () => {
  const { applier, root } = applierOf();
  await applier.start();
  const r = createTokenReader({ root, getStyle: sheetStyle, theme: applier });
  assert.equal(r.token('--color-ink'), TOKENS.get('--color-ink'));
  const seen = [];
  r.onThemeChange((id) => seen.push([id, r.token('--color-ink')]));
  await applier.setTheme(FIXTURE_ID);
  assert.deepEqual(seen, [[FIXTURE_ID, FIXTURE_TOKENS.get('--color-ink')]]);
});

test('index.html and the gallery run the pre-paint script after the base stylesheets and link no theme stylesheet', () => {
  for (const [file, prefix, sheets] of [
    ['../index.html', '', ['css/tokens.css', 'css/components.css', 'css/style.css']],
    ['../dev/components.html', '../', ['css/tokens.css', 'css/components.css']],
  ]) {
    const html = read(file);
    const tag = html.match(new RegExp(`<script\\b[^>]*\\bsrc="${prefix.replace(/\./g, '\\.')}js/theme\\.js"[^>]*>`));
    assert.ok(tag, `${file} loads js/theme.js`);
    assert.doesNotMatch(tag[0], /\b(type="module"|defer|async)\b/, `${file}: a classic, blocking script`);
    const at = html.indexOf(tag[0]);
    assert.ok(at < html.indexOf('</head>'), `${file}: in the head`);
    for (const s of sheets) {
      const i = html.indexOf(`<link rel="stylesheet" href="${prefix}${s}">`);
      assert.ok(i >= 0 && i < at, `${file}: ${s} comes before the theme, which the script inserts after it`);
    }
    assert.doesNotMatch(html, /themes\/[\w-]+\/theme\.css/, `${file}: no static theme stylesheet`);
    assert.doesNotMatch(html.match(/<html\b[^>]*>/)[0], /data-theme/, `${file}: no fixed root attribute`);
    if (file === '../index.html') {
      assert.ok(at < html.indexOf('type="importmap"'), 'before the import map');
      assert.ok(at < html.indexOf('src="js/main.js"'), 'before the module graph');
    }
  }
});

test('js/main.js, the settings applier and the gallery use the new applier; nothing reads globalThis.msTheme', () => {
  const main = read('../js/main.js');
  assert.match(main, /import\s*\{[^}]*\bthemeApplier\b[^}]*\}\s*from\s*'\.\/themes\/applier\.js'/);
  assert.match(main, /applySettings\(SETTINGS, \{\s*theme: THEME,/);
  for (const f of ['../js/main.js', '../js/tokens.js', '../js/settings/appliers.js', '../js/classic2d/tile-skin.js', '../dev/components.html']) {
    assert.doesNotMatch(read(f), /msTheme\b/, `${f} no longer reads globalThis.msTheme`);
  }
});

// ---------- in a browser ----------
test('in a browser, a switch between Joyful tiles and the fixture theme never shows two themes or no stylesheet', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    const start = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      sheets: [...document.querySelectorAll('link[data-theme-sheet]')].map((l) => [l.dataset.themeSheet, l.getAttribute('blocking'), !!l.sheet]),
      ink: getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim(),
    }));
    assert.deepEqual(start.sheets, [[THEME_ID, 'render', true]], 'the pre-paint script inserted the render-blocking stylesheet');
    assert.equal(start.theme, THEME_ID);
    assert.equal(start.ink, TOKENS.get('--color-ink'));

    const result = await page.evaluate(async (fixturePath) => {
      const { registerTheme } = await import('/js/themes/registry.js');
      const { FIXTURE_THEME } = await import(fixturePath);
      const { themeApplier } = await import('/js/themes/applier.js');
      registerTheme(FIXTURE_THEME);
      const applier = themeApplier();
      await applier.start();
      const root = document.documentElement;
      const snapshots = [];
      const snap = (why) => snapshots.push({
        why,
        theme: root.getAttribute('data-theme'),
        loaded: [...document.querySelectorAll('link[data-theme-sheet]')].filter((l) => l.sheet).map((l) => l.dataset.themeSheet),
        ink: getComputedStyle(root).getPropertyValue('--color-ink').trim(),
      });
      const observer = new MutationObserver(() => snap('mutation'));
      observer.observe(root, { attributes: true, attributeFilter: ['data-theme'], childList: true, subtree: true });
      let sampling = true;
      const frame = () => { snap('frame'); if (sampling) requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      const handed = [];
      applier.onThemeChange((id, board) => { snap('notify'); handed.push([id, board.BOARD ?? null]); });
      const ids = [await applier.setTheme(FIXTURE_THEME.id), await applier.setTheme('joyful-tiles'), await applier.setTheme(FIXTURE_THEME.id)];
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      sampling = false;
      observer.disconnect();
      return { ids, snapshots, handed, final: root.getAttribute('data-theme'), sheets: [...document.querySelectorAll('link[data-theme-sheet]')].map((l) => l.dataset.themeSheet) };
    }, '/tests/fixtures/themes/fixture-theme.js');

    assert.deepEqual(result.ids, [FIXTURE_ID, THEME_ID, FIXTURE_ID]);
    assert.equal(result.final, FIXTURE_ID);
    assert.deepEqual(result.sheets, [FIXTURE_ID], 'the old stylesheet is removed');
    assert.deepEqual(result.handed.map(([id]) => id), [FIXTURE_ID, THEME_ID, FIXTURE_ID]);
    assert.deepEqual(result.handed[0][1], { fixture: FIXTURE_ID }, 'the fixture\'s board module is handed on');
    assert.ok(result.snapshots.length > 3);
    for (const s of result.snapshots) {
      assert.ok([THEME_ID, FIXTURE_ID].includes(s.theme), `${s.why}: one theme on the root (${s.theme})`);
      assert.ok(s.loaded.includes(s.theme), `${s.why}: the root's theme has its stylesheet loaded (${s.theme}: ${s.loaded})`);
      const want = s.theme === THEME_ID ? TOKENS.get('--color-ink') : FIXTURE_TOKENS.get('--color-ink');
      assert.equal(s.ink, want, `${s.why}: the page is styled by ${s.theme}`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the default theme failing to load shows the fatal card', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.route('**/themes/joyful-tiles/theme.css', (route) => route.abort());
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForSelector('.fatal', { timeout: 30000 });
    assert.match(await page.textContent('.fatal'), /Cannot start Minesweeper 3D/);
  } finally {
    await browser.close();
  }
});

// ---------- light and dark are gone ----------
function files(dir, ext) {
  return readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return files(`${dir}${e.name}/`, ext);
    return ext.some((x) => e.name.endsWith(x)) ? [`${dir}${e.name}`] : [];
  });
}

test('no light or dark rule remains anywhere, and the gallery has no light/dark switch', () => {
  const sources = [...files('../css/', ['.css']), ...files('../themes/', ['.css']), '../index.html', '../dev/components.html', '../404.html'];
  for (const f of sources) {
    const src = read(f);
    assert.doesNotMatch(src, /data-theme\s*=\s*"?(dark|light)\b/, `${f}: no light or dark rule`);
    assert.doesNotMatch(src, /prefers-color-scheme/, `${f}: no system light/dark rule`);
  }
  const gallery = read('../dev/components.html');
  assert.doesNotMatch(gallery, /theme-switch|data-value="(light|dark)"|>(Light|Dark)</, 'no light/dark segmented switch');
  assert.doesNotMatch(gallery, /[?&]theme=(light|dark)\b/, 'no ?theme=light or ?theme=dark');
});

// ---------- the theme stylesheet ----------
// The stylesheet's top-level blocks: [prelude, body], at-rules included.
function blocks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) open = i; depth++; }
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) { out.push([css.slice(start, open).trim(), css.slice(open + 1, i)]); start = i + 1; }
    }
  }
  return out;
}
// Split a selector list on its top-level commas (not those inside :is(), :not(), :has()).
function selectors(list) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

test('every rule of the theme stylesheet is scoped to the theme id', () => {
  const unscoped = [];
  const visit = (css) => {
    for (const [prelude, body] of blocks(css)) {
      if (/^@(font-face|keyframes)\b/.test(prelude)) continue;
      if (/^@(media|container|supports)\b/.test(prelude)) { visit(body); continue; }
      assert.ok(!prelude.startsWith('@'), `no other at-rule (${prelude})`);
      for (const sel of selectors(prelude)) if (!sel.startsWith(SCOPE)) unscoped.push(sel);
    }
  };
  visit(THEME_CSS);
  assert.deepEqual(unscoped, [], 'unscoped selectors');
  assert.ok(blocks(THEME_CSS).length > 50, 'the stylesheet styles the kit and the screens');
});

test('the theme stylesheet never overrides the base reduced-motion rule', () => {
  assert.doesNotMatch(THEME_CSS, /prefers-reduced-motion/, 'no prefers-reduced-motion rule');
  for (const m of THEME_CSS.matchAll(/(?:^|[;{\s])((?:-webkit-)?(?:animation|transition)[\w-]*)\s*:([^;}]*)/g)) {
    assert.doesNotMatch(m[2], /!important/, `${m[1]}:${m[2]} is not !important`);
  }
});

test('the theme declares Rubik and JetBrains Mono from its own font files only', () => {
  const faces = blocks(THEME_CSS).filter(([p]) => p.startsWith('@font-face')).map(([, b]) => b);
  const families = new Set(faces.map((b) => b.match(/font-family:\s*"([^"]+)"/)[1]));
  assert.deepEqual([...families].sort(), ['JetBrains Mono', 'Rubik']);
  const own = new Set(readdirSync(new URL('../themes/joyful-tiles/fonts/', import.meta.url)).filter((f) => f.endsWith('.woff2')));
  for (const b of faces) {
    const urls = [...b.matchAll(/url\("?([^")]+)"?\)/g)].map((m) => m[1]);
    assert.ok(urls.length > 0, 'each face names its file');
    for (const u of urls) {
      assert.match(u, /^fonts\/[\w.-]+\.woff2$/, `${u} is a file of the theme's folder`);
      assert.ok(own.has(u.slice('fonts/'.length)), `${u} exists`);
    }
  }
  assert.match(TOKENS.get('--font-family-sans'), /^"Rubik"/);
  assert.match(TOKENS.get('--font-family-mono'), /^"JetBrains Mono"/);
});

// ---------- token reader ----------
function reader(opts = {}) {
  const { root } = loadThemeScript();
  const theme = emitter();
  const logs = [];
  const r = createTokenReader({ root, getStyle: sheetStyle, theme, dev: true, log: (m) => logs.push(m), ...opts });
  return { r, theme, logs };
}

test('token(name) returns the active theme\'s value', () => {
  const { r } = reader();
  assert.equal(r.token('--color-ink'), TOKENS.get('--color-ink'));
  assert.equal(r.token('color-ink'), TOKENS.get('--color-ink'));
  assert.equal(r.token('--color-surface-raised'), TOKENS.get('--color-surface-raised'));
});

test('onThemeChange forwards the applier\'s change notification; unsubscribe stops it', () => {
  const { r, theme } = reader();
  const seen = [];
  const off = r.onThemeChange((t) => seen.push(t));
  theme.emit(THEME_ID);
  assert.deepEqual(seen, [THEME_ID]);
  off();
  theme.emit(THEME_ID);
  assert.equal(seen.length, 1);
});

test('an unknown token returns a visible fallback colour and logs once in development', () => {
  const { r, logs } = reader();
  assert.equal(r.token('--color-nope'), FALLBACK_COLOR);
  assert.equal(r.token('color-nope'), FALLBACK_COLOR);
  assert.equal(r.token('--color-other'), FALLBACK_COLOR);
  assert.equal(r.token(undefined), FALLBACK_COLOR);
  assert.equal(logs.length, 3);
  assert.match(logs[0], /--color-nope/);
});

test('an unknown token logs nothing outside development', () => {
  const { r, logs } = reader({ dev: false });
  assert.equal(r.token('--color-nope'), FALLBACK_COLOR);
  assert.equal(logs.length, 0);
});

test('js/tokens.js holds no second copy of the token values', () => {
  const src = read('../js/tokens.js');
  for (const name of ['--color-ink', '--color-accent', '--color-ground', '--color-scene-horizon']) {
    assert.ok(!src.includes(TOKENS.get(name)), `tokens.js does not contain ${TOKENS.get(name)}`);
  }
});

test('the 3D renderer never subscribes to theme changes: the shell hands it the scene palette', () => {
  for (const f of ['../js/render.js', '../js/textures.js', '../js/tile-art.js']) {
    assert.doesNotMatch(read(f), /onThemeChange|msTheme|tokens\.js|scene-palette/, f);
  }
});

// ---------- the 3D scene palette (js/shell/scene-palette.js) ----------
const rgbOf = (name) => parseRgb(TOKENS.get(name));

test('parseRgb reads hex and rgb() token values as 0–255 channels', () => {
  assert.deepEqual(parseRgb('#0f1a2e'), [15, 26, 46]);
  assert.deepEqual(parseRgb(' #fff '), [255, 255, 255]);
  assert.deepEqual(parseRgb('rgb(200, 225, 255)'), [200, 225, 255]);
  assert.deepEqual(parseRgb('rgba(20,35,63,0.5)'), [20, 35, 63]);
  assert.deepEqual(parseRgb(FALLBACK_COLOR), [255, 0, 255], 'the visible fallback colour stays visible');
  assert.deepEqual(parseRgb('nonsense'), [255, 0, 255], 'an unreadable value shows as the fallback colour');
});

test('the scene palette names the sky\'s three stops, each declared by the theme stylesheet', () => {
  assert.deepEqual(Object.keys(SCENE_TOKENS), ['horizon', 'zenith', 'nadir']);
  for (const name of Object.values(SCENE_TOKENS)) assert.ok(TOKENS.has(name), `the theme declares ${name}`);
});

test('scenePalette reads the active theme\'s sky through the token reader', () => {
  const { r } = reader();
  assert.deepEqual(scenePalette(r.token), {
    horizon: rgbOf(SCENE_TOKENS.horizon), zenith: rgbOf(SCENE_TOKENS.zenith), nadir: rgbOf(SCENE_TOKENS.nadir),
  });
  assert.deepEqual(scenePalette(r.token).horizon, [0x2b, 0x3f, 0x8a], 'Joyful tiles\' horizon');
});

test('the shell hands the renderer the active theme\'s sky at start-up and on every theme change', () => {
  const { r, theme } = reader();
  const set = [];
  let redraws = 0;
  const renderer = { setScenePalette: (p) => set.push(p) };
  const off = bindScenePalette({ token: r.token, onThemeChange: r.onThemeChange, renderer, onApplied: () => redraws++ });
  assert.equal(set.length, 1, 'set once at start-up');
  assert.deepEqual(set[0].zenith, rgbOf(SCENE_TOKENS.zenith));
  assert.equal(redraws, 1, 'a redraw is requested at start-up');
  theme.emit(THEME_ID);
  assert.equal(set.length, 2, 'set again on a theme change');
  assert.equal(redraws, 2, 'a redraw is requested on the theme change');
  off();
  theme.emit(THEME_ID);
  assert.equal(set.length, 2, 'unsubscribed');
});

test('js/main.js binds the scene palette to the renderer through the token reader and requests a redraw', () => {
  const main = read('../js/main.js');
  assert.match(main, /import\s*\{[^}]*\btoken\b[^}]*\bonThemeChange\b[^}]*\}\s*from\s*'\.\/tokens\.js'/, 'main.js imports the token reader');
  assert.match(main, /import\s*\{[^}]*\bbindScenePalette\b[^}]*\}\s*from\s*'\.\/shell\/scene-palette\.js'/);
  assert.match(main, /bindScenePalette\(\{[^}]*token[^}]*onThemeChange[^}]*renderer[^}]*onApplied:\s*\(\)\s*=>\s*\{?\s*needRender\s*=\s*true/,
    'the shell binds the renderer and requests a redraw on every palette change');
});

test('the renderer draws the sky, fog and clear colour from the palette it is handed, not from constants', () => {
  const src = read('../js/render.js');
  assert.match(src, /setScenePalette\(/, 'the renderer exposes a palette setter');
  assert.doesNotMatch(src, /setClearColor\(0x/, 'no constant clear colour');
  const sky = src.slice(src.indexOf('const SKY_GLSL'), src.indexOf('const VERT'));
  assert.doesNotMatch(sky, /vec3\(\s*\d/, 'the sky gradient carries no constant colour');
  assert.match(sky, /uniform vec3 uSkyHorizon[\s\S]*uniform vec3 uSkyZenith[\s\S]*uniform vec3 uSkyNadir/);
  assert.match(src, /rgb = mix\(rgb, skyColor\(vDirY\), f\)/, 'the fog still fades toward the sky colour');
});

test('only the sky is themed: the tiles, numbers, selection outline and effects keep one look', () => {
  assert.doesNotMatch(read('../js/textures.js'), /setScenePalette|uSky|scene-palette/, 'the tile atlas is not themed');
  assert.doesNotMatch(read('../js/tile-art.js'), /setScenePalette|uSky|scene-palette/, 'the recipe the atlas draws through is not themed');
  const src = read('../js/render.js');
  const at = src.indexOf('\n  setScenePalette(');
  assert.ok(at >= 0, 'the renderer defines setScenePalette');
  const setter = src.slice(at, src.indexOf('\n  }\n', at));
  assert.doesNotMatch(setter, /uTiles|uSelGlow|uEff|createTileTexture|confUniforms/, 'the palette setter touches only the sky');
});
