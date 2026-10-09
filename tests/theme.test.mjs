import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createTokenReader, FALLBACK_COLOR } from '../js/tokens.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const THEME_SRC = read('../js/theme.js');
const CSS = read('../css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

// ---------- stubs ----------
function stubRoot() {
  const attrs = new Map();
  return {
    attrs,
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => attrs.set(k, String(v)),
  };
}

function stubStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null) };
}

// Runs js/theme.js the way the browser does: a classic script against a
// global that carries `document`.
function loadThemeScript(root = stubRoot()) {
  const ctx = vm.createContext({ document: { documentElement: root } });
  vm.runInContext(THEME_SRC, ctx);
  return { theme: ctx.msTheme, root };
}

// Computed-style stub backed by the real token sheet: :root values, with the
// dark block layered on top when the root carries data-theme="dark".
function block(selector) {
  const re = new RegExp(`(^|\\})\\s*${selector.replace(/[[\]"().]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const decls = new Map();
  for (const d of CSS.match(re)[2].split(';')) {
    const i = d.indexOf(':');
    if (i > 0 && d.slice(0, i).trim().startsWith('--')) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return decls;
}
const LIGHT = block(':root');
const DARK = new Map([...LIGHT, ...block(':root[data-theme="dark"]')]);
const sheetStyle = (el) => ({
  getPropertyValue: (p) => ((el.getAttribute('data-theme') === 'dark' ? DARK : LIGHT).get(p) ?? ''),
});

// ---------- theme applier ----------
test('the applier script applies Light before first paint with no stored value', () => {
  const { theme, root } = loadThemeScript();
  assert.equal(root.getAttribute('data-theme'), 'light');
  assert.equal(theme.current(), 'light');
});

test('the stored theme is read through a synchronous getter, falling back to Light', () => {
  const { theme } = loadThemeScript();
  const cases = [
    [{ 'ms3d.theme': 'dark' }, 'dark'],
    [{ 'ms3d.theme': 'light' }, 'light'],
    [{}, 'light'],
    [{ 'ms3d.theme': 'DARK' }, 'light'],
    [{ 'ms3d.theme': 'sepia' }, 'light'],
    [{ 'ms3d.theme': '' }, 'light'],
  ];
  for (const [init, want] of cases) {
    const root = stubRoot();
    const storage = stubStorage(init);
    const applier = theme.createThemeApplier({ root, readStored: () => storage.getItem('ms3d.theme') });
    applier.apply();
    assert.equal(root.getAttribute('data-theme'), want, JSON.stringify(init));
    assert.equal(applier.current(), want);
  }
});

test('a getter that throws falls back to Light', () => {
  const { theme } = loadThemeScript();
  const root = stubRoot();
  const applier = theme.createThemeApplier({ root, readStored: () => { throw new Error('blocked'); } });
  applier.apply();
  assert.equal(root.getAttribute('data-theme'), 'light');
});

test('setTheme sets the attribute; an unknown value is Light, never thrown', () => {
  const { theme, root } = loadThemeScript();
  theme.setTheme('dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
  for (const bad of ['sepia', undefined, null, 42, {}]) {
    theme.setTheme('dark');
    assert.doesNotThrow(() => theme.setTheme(bad));
    assert.equal(root.getAttribute('data-theme'), 'light', String(bad));
  }
});

test('setTheme notifies listeners after the attribute changes; unsubscribe stops it', () => {
  const { theme, root } = loadThemeScript();
  const seen = [];
  const off = theme.onChange((t) => seen.push([t, root.getAttribute('data-theme')]));
  theme.setTheme('dark');
  theme.setTheme('dark'); // no change, no notification
  theme.setTheme('nope'); // falls back to light: a change
  assert.deepEqual(seen, [['dark', 'dark'], ['light', 'light']]);
  off();
  theme.setTheme('dark');
  assert.equal(seen.length, 2);
});

test('a throwing listener does not stop the others', () => {
  const { theme } = loadThemeScript();
  const errors = [];
  const applier = theme.createThemeApplier({ root: stubRoot(), onError: (e) => errors.push(e) });
  let called = false;
  applier.onChange(() => { throw new Error('boom'); });
  applier.onChange(() => { called = true; });
  applier.setTheme('dark');
  assert.equal(called, true);
  assert.equal(errors.length, 1);
});

test('index.html runs the applier as a classic script before the stylesheets and module graph', () => {
  const html = read('../index.html');
  const tag = html.match(/<script\b[^>]*\bsrc="js\/theme\.js"[^>]*>/);
  assert.ok(tag, 'index.html loads js/theme.js');
  assert.doesNotMatch(tag[0], /\b(type="module"|defer|async)\b/);
  const at = html.indexOf(tag[0]);
  assert.ok(at < html.indexOf('css/tokens.css'), 'before the token sheet');
  assert.ok(at < html.indexOf('type="importmap"'), 'before the import map');
  assert.ok(at < html.indexOf('src="js/main.js"'), 'before the module graph');
});

// ---------- token reader ----------
function reader(opts = {}) {
  const { theme, root } = loadThemeScript();
  const logs = [];
  const r = createTokenReader({ root, getStyle: sheetStyle, theme, dev: true, log: (m) => logs.push(m), ...opts });
  return { r, theme, logs };
}

test('token(name) returns the token sheet value for the active theme', () => {
  const { r, theme } = reader();
  assert.equal(r.token('--color-ink'), LIGHT.get('--color-ink'));
  assert.equal(r.token('color-ink'), LIGHT.get('--color-ink'));
  theme.setTheme('dark');
  assert.equal(r.token('--color-ink'), DARK.get('--color-ink'));
  assert.notEqual(LIGHT.get('--color-ink'), DARK.get('--color-ink'));
  assert.equal(r.token('--space-2'), LIGHT.get('--space-2'));
});

test('onThemeChange fires after the attribute changes, with values already switched', () => {
  const { r, theme } = reader();
  const seen = [];
  const off = r.onThemeChange((t) => seen.push([t, r.token('--color-surface-raised')]));
  theme.setTheme('dark');
  assert.deepEqual(seen, [['dark', DARK.get('--color-surface-raised')]]);
  off();
  theme.setTheme('light');
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
  for (const v of [LIGHT.get('--color-ink'), LIGHT.get('--color-accent'), DARK.get('--color-backdrop')]) {
    assert.ok(!src.includes(v), `tokens.js does not contain ${v}`);
  }
});

test('the 3D renderer never subscribes to theme changes', () => {
  for (const f of ['../js/render.js', '../js/textures.js']) {
    assert.doesNotMatch(read(f), /onThemeChange|msTheme|tokens\.js/, f);
  }
});
