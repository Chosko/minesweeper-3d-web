import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { createTokenReader, FALLBACK_COLOR } from '../js/tokens.js';
import { SCENE_TOKENS, parseRgb, scenePalette, bindScenePalette } from '../js/shell/scene-palette.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const THEME_SRC = read('../js/theme.js');
const THEME_ID = 'joyful-tiles';
const SCOPE = `:root[data-theme="${THEME_ID}"]`;
const THEME_CSS = read('../themes/joyful-tiles/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');

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
function loadThemeScript(root = stubRoot(), extra = {}) {
  const ctx = vm.createContext({ document: { documentElement: root }, ...extra });
  vm.runInContext(THEME_SRC, ctx);
  return { theme: ctx.msTheme, root };
}

// The theme's token block: the declarations of its scoped :root rule.
function tokenBlock() {
  const esc = SCOPE.replace(/[[\]"().:]/g, '\\$&');
  const m = THEME_CSS.match(new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, 'theme.css opens with its token block');
  const decls = new Map();
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i > 0 && d.slice(0, i).trim().startsWith('--')) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return decls;
}
const TOKENS = tokenBlock();
// Computed-style stub backed by the theme's token block, applied while the root carries its id.
const sheetStyle = (el) => ({
  getPropertyValue: (p) => (el.getAttribute('data-theme') === THEME_ID ? TOKENS.get(p) ?? '' : ''),
});

// A theme-change source for the token reader and the scene palette.
function emitter() {
  const listeners = new Set();
  return {
    onChange: (l) => { listeners.add(l); return () => listeners.delete(l); },
    emit: (id) => { for (const l of [...listeners]) l(id); },
  };
}

// ---------- the interim applier ----------
test('the applier script sets Joyful tiles on the root before first paint', () => {
  const { theme, root } = loadThemeScript();
  assert.equal(root.getAttribute('data-theme'), THEME_ID);
  assert.equal(theme.current(), THEME_ID);
});

test('whatever is stored, the root carries Joyful tiles', () => {
  for (const stored of ['dark', 'light', 'sepia', '', null]) {
    const doc = JSON.stringify({ version: 1, data: { theme: stored } });
    const { root } = loadThemeScript(stubRoot(), { localStorage: stubStorage({ 'ms3d:doc:settings': doc }) });
    assert.equal(root.getAttribute('data-theme'), THEME_ID, String(stored));
  }
});

test('setTheme changes nothing: the stored theme setting no longer changes the look', () => {
  const { theme, root } = loadThemeScript();
  const seen = [];
  const off = theme.onChange((t) => seen.push(t));
  for (const value of ['dark', 'light', 'sepia', undefined, 42]) {
    assert.doesNotThrow(() => theme.setTheme(value));
    assert.equal(root.getAttribute('data-theme'), THEME_ID, String(value));
  }
  assert.deepEqual(seen, [], 'no change is announced');
  assert.equal(typeof off, 'function');
  off();
});

test('js/theme.js reads no stored value and knows no light or dark', () => {
  assert.doesNotMatch(THEME_SRC, /localStorage|readStored/, 'nothing stored is read');
  assert.doesNotMatch(THEME_SRC, /'(light|dark)'/, 'no light or dark theme');
});

test('index.html runs the applier as a classic script, then loads the base stylesheets, then the theme stylesheet', () => {
  const html = read('../index.html');
  const tag = html.match(/<script\b[^>]*\bsrc="js\/theme\.js"[^>]*>/);
  assert.ok(tag, 'index.html loads js/theme.js');
  assert.doesNotMatch(tag[0], /\b(type="module"|defer|async)\b/);
  const at = html.indexOf(tag[0]);
  const sheets = ['css/tokens.css', 'css/components.css', 'css/style.css', 'themes/joyful-tiles/theme.css']
    .map((href) => html.indexOf(`<link rel="stylesheet" href="${href}">`));
  for (const s of sheets) assert.ok(s > at, 'every stylesheet is linked after the applier');
  assert.deepEqual([...sheets].sort((a, b) => a - b), sheets, 'tokens, kit, shell, then the theme');
  assert.ok(at < html.indexOf('type="importmap"'), 'before the import map');
  assert.ok(at < html.indexOf('src="js/main.js"'), 'before the module graph');
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
  assert.doesNotMatch(gallery, /searchParams|URLSearchParams|[?&]theme=/, 'no ?theme= handling');
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
