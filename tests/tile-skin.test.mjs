import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FALLBACK_COLOR } from '../js/tokens.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'css/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// ---------- token maps parsed from the sheet, per theme ----------
function block(selector) {
  const at = CSS.indexOf(selector + ' {');
  assert.ok(at >= 0, `${selector} block present`);
  return CSS.slice(at, CSS.indexOf('}', at));
}
function tokensOf(text) {
  const map = new Map();
  for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}
const LIGHT = tokensOf(block(':root'));
const DARK = new Map([...LIGHT, ...tokensOf(block(':root[data-theme="dark"]'))]);
const THEMES = { light: LIGHT, dark: DARK };

const tokenFrom = (map) => (name) => {
  const key = name.startsWith('--') ? name : `--${name}`;
  return map.get(key) ?? FALLBACK_COLOR;
};

// ---------- a fake Canvas 2D context: records every call with the fill/stroke style in force ----------
function fakeContext() {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic' };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      return (...args) => {
        calls.push({ op: prop, args, fill: target.fillStyle, stroke: target.strokeStyle });
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      calls.push({ op: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });
  return ctx;
}
const filledWith = (ctx) => new Set(ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect' || c.op === 'fillText').map((c) => c.fill));
const strokedWith = (ctx) => new Set(ctx.calls.filter((c) => c.op === 'stroke' || c.op === 'strokeRect').map((c) => c.stroke));
const colours = (ctx) => new Set([...filledWith(ctx), ...strokedWith(ctx)]);

function fakeCanvasFactory() {
  const made = [];
  const createCanvas = (w, h) => {
    const canvas = { width: w, height: h, ctx: fakeContext() };
    canvas.getContext = () => canvas.ctx;
    made.push(canvas);
    return canvas;
  };
  return { made, createCanvas };
}

function fakeTheme(initial = 'light') {
  const listeners = new Set();
  let current = initial;
  return {
    current: () => current,
    onThemeChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    set(next) {
      current = next;
      for (const fn of [...listeners]) fn(next);
    },
    listeners,
  };
}

const skinModule = () => import('../js/classic2d/tile-skin.js');

function makeSkin(mod, { theme = fakeTheme(), redraw = () => {} } = {}) {
  const canvases = fakeCanvasFactory();
  const skin = mod.createTileSkin({
    token: (name) => tokenFrom(THEMES[theme.current()])(name),
    onThemeChange: theme.onThemeChange,
    currentTheme: theme.current,
    createCanvas: canvases.createCanvas,
    redraw,
  });
  return { skin, canvases, theme };
}

// ---------------------------------------------------------------- state dispatch

test('the visual states are the engine cell states plus pressed', async () => {
  const { TILE_STATES } = await skinModule();
  const { CELL } = await import('../js/engine/rules.js');
  for (const s of Object.values(CELL)) assert.ok(TILE_STATES.includes(s), `${s} is a tile state`);
  assert.ok(TILE_STATES.includes('pressed'));
  assert.equal(TILE_STATES.length, Object.values(CELL).length + 1);
});

test('each state paints with its own tile tokens, in both themes', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const paint = (state, number) => {
      const ctx = fakeContext();
      paintTileWith(t, ctx, 10, 20, 32, state, number);
      return ctx;
    };
    const expect = {
      closed: ['tile-closed', 'tile-edge'],
      pressed: ['tile-pressed'],
      revealed: ['tile-revealed'],
      flagged: ['tile-flagged', 'tile-edge', 'tile-flag'],
      mine: ['tile-mine', 'tile-mine-glyph'],
      exploded: ['tile-exploded', 'tile-mine-glyph'],
      'wrong-flag': ['tile-wrong-flag', 'tile-mine-glyph', 'tile-wrong-flag-mark'],
    };
    for (const [state, names] of Object.entries(expect)) {
      const used = colours(paint(state, 0));
      for (const n of names) assert.ok(used.has(t(`--color-${n}`)), `${name}: ${state} uses --color-${n}`);
      assert.ok(!used.has(FALLBACK_COLOR), `${name}: ${state} reads only declared tokens`);
    }
    // The tile is painted at its position and size.
    const rects = paint('closed', 0).calls.filter((c) => c.op === 'fillRect');
    assert.deepEqual(rects[0].args, [10, 20, 32, 32], `${name}: closed fill covers the tile`);
  }
});

test('a revealed number is drawn as its digit in its own number colour; zero draws no glyph', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    for (let n = 1; n <= 8; n++) {
      const ctx = fakeContext();
      paintTileWith(t, ctx, 0, 0, 24, 'revealed', n);
      const text = ctx.calls.filter((c) => c.op === 'fillText');
      assert.equal(text.length, 1, `${name}: one glyph for ${n}`);
      assert.equal(text[0].args[0], String(n));
      assert.equal(text[0].fill, t(`--color-number-${n}`), `${name}: ${n} uses --color-number-${n}`);
    }
    const empty = fakeContext();
    paintTileWith(t, empty, 0, 0, 24, 'revealed', 0);
    assert.equal(empty.calls.filter((c) => c.op === 'fillText').length, 0, `${name}: revealed empty has no glyph`);
    assert.deepEqual([...filledWith(empty)], [t('--color-tile-revealed')]);
  }
});

test('closed and revealed tiles differ by an edge, not by colour alone, in both themes', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const closed = fakeContext();
    paintTileWith(t, closed, 0, 0, 32, 'closed', 0);
    const revealed = fakeContext();
    paintTileWith(t, revealed, 0, 0, 32, 'revealed', 0);
    const edge = t('--color-tile-edge');
    assert.ok(colours(closed).has(edge), `${name}: the closed tile has its edge`);
    assert.ok(!colours(revealed).has(edge), `${name}: the revealed tile has no raised edge`);
    assert.ok(closed.calls.length > revealed.calls.length, `${name}: the edge is extra drawing, not a different fill`);
  }
});

test('the tile is drawn plainly: no gradients, shadows or patterns', async () => {
  const { paintTileWith, TILE_STATES } = await skinModule();
  const t = tokenFrom(LIGHT);
  for (const state of TILE_STATES) {
    const ctx = fakeContext();
    paintTileWith(t, ctx, 0, 0, 32, state, 3);
    const ops = new Set(ctx.calls.map((c) => c.op));
    for (const banned of ['createLinearGradient', 'createRadialGradient', 'createPattern', 'set:shadowBlur', 'set:shadowColor', 'drawImage']) {
      assert.ok(!ops.has(banned), `${state} does not use ${banned}`);
    }
  }
});

test('an unknown state, or a revealed number outside 0–8, paints the visibly wrong placeholder', async () => {
  const { paintTileWith } = await skinModule();
  const t = tokenFrom(LIGHT);
  for (const [state, number] of [['bogus', 0], [undefined, 0], ['revealed', 9], ['revealed', -1]]) {
    const ctx = fakeContext();
    paintTileWith(t, ctx, 5, 5, 20, state, number);
    assert.ok(filledWith(ctx).has(FALLBACK_COLOR), `${String(state)}/${number} paints the placeholder colour`);
    assert.ok(ctx.calls.some((c) => c.op === 'fillRect' && c.args.join() === '5,5,20,20'), 'the placeholder fills the whole tile');
  }
});

test('paintTile reads the tile tokens through the token reader', async () => {
  const values = new Map(LIGHT);
  const saved = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle, msTheme: globalThis.msTheme };
  globalThis.document = { documentElement: {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: (p) => values.get(p) ?? '' });
  globalThis.msTheme = { current: () => 'light', onChange: () => () => {} };
  try {
    const { paintTile } = await skinModule();
    const ctx = fakeContext();
    paintTile(ctx, 0, 0, 16, 'revealed', 4);
    assert.equal(ctx.calls.find((c) => c.op === 'fillText').fill, LIGHT.get('--color-number-4'));
    values.set('--color-number-4', '#123456');
    const again = fakeContext();
    paintTile(again, 0, 0, 16, 'revealed', 4);
    assert.equal(again.calls.find((c) => c.op === 'fillText').fill, '#123456', 'values are read at paint time, not copied');
  } finally {
    Object.assign(globalThis, saved);
  }
});

// ---------------------------------------------------------------- the tile cache

test('the cache pre-renders every state and number once, and a redraw is only image copies', async () => {
  const mod = await skinModule();
  const { skin, canvases } = makeSkin(mod);
  const board = fakeContext();
  skin.drawTile(board, 0, 0, 30, 'closed', 0, 1);
  const prerendered = canvases.made.length;
  assert.equal(prerendered, mod.TILE_STATES.length - 1 + 9 + 1, 'one image per non-revealed state, per revealed 0–8, and the placeholder');
  for (const c of canvases.made) assert.deepEqual([c.width, c.height], [30, 30]);
  const before = board.calls.length;
  for (const state of mod.TILE_STATES) for (let n = 0; n <= 8; n++) skin.drawTile(board, n * 30, 0, 30, state, n, 1);
  skin.drawTile(board, 0, 30, 30, 'bogus', 0, 1);
  const redraw = board.calls.slice(before - 1);
  assert.ok(redraw.every((c) => c.op === 'drawImage'), 'a full redraw is a sequence of image copies');
  assert.equal(canvases.made.length, prerendered, 'nothing re-rendered while the key holds');
  const copy = board.calls.at(-2);
  assert.deepEqual(copy.args.slice(1), [8 * 30, 0, 30, 30], 'copied at the tile position and size');
});

test('the cache is keyed by tile size, pixel ratio and theme', async () => {
  const mod = await skinModule();
  const theme = fakeTheme('light');
  const { skin, canvases } = makeSkin(mod, { theme });
  const board = fakeContext();
  const per = canvases.made.length;
  skin.drawTile(board, 0, 0, 24, 'closed', 0, 1);
  const one = canvases.made.length;
  assert.ok(one > per);
  assert.equal(skin.cacheKey(), '24|1|light');

  skin.drawTile(board, 0, 0, 24, 'closed', 0, 1);
  assert.equal(canvases.made.length, one, 'same key, no rebuild');

  skin.drawTile(board, 0, 0, 32, 'closed', 0, 1);
  assert.equal(canvases.made.length, one * 2, 'size change rebuilds');
  assert.equal(skin.cacheKey(), '32|1|light');

  skin.drawTile(board, 0, 0, 32, 'closed', 0, 2);
  assert.equal(canvases.made.length, one * 3, 'pixel-ratio change rebuilds');
  assert.deepEqual([canvases.made.at(-1).width, canvases.made.at(-1).height], [64, 64], 'images are rendered at device pixels');
  const scaled = canvases.made.at(-1).ctx.calls.find((c) => c.op === 'setTransform' || c.op === 'scale');
  assert.ok(scaled, 'the offscreen context is scaled to the pixel ratio');
  assert.equal(board.calls.at(-1).args.slice(1).join(), '0,0,32,32', 'copied at CSS-pixel size');

  theme.set('dark');
  skin.drawTile(board, 0, 0, 32, 'closed', 0, 2);
  assert.equal(canvases.made.length, one * 4, 'theme change rebuilds');
  assert.equal(skin.cacheKey(), '32|2|dark');
  const darkClosed = canvases.made.find((c) => colours(c.ctx).has(DARK.get('--color-tile-closed')));
  assert.ok(darkClosed, 'the rebuilt images use the dark tokens');
});

test('a theme change drops the cache and asks the renderer for a redraw; dispose unsubscribes', async () => {
  const mod = await skinModule();
  const theme = fakeTheme('light');
  const redraws = [];
  const { skin, canvases } = makeSkin(mod, { theme, redraw: () => redraws.push(skin.cacheKey()) });
  skin.drawTile(fakeContext(), 0, 0, 20, 'flagged', 0, 1);
  assert.equal(theme.listeners.size, 1, 'subscribed to theme changes');
  theme.set('dark');
  assert.equal(redraws.length, 1, 'redraw requested once');
  assert.equal(redraws[0], null, 'the cache is already dropped when the redraw runs');
  const made = canvases.made.length;
  skin.drawTile(fakeContext(), 0, 0, 20, 'flagged', 0, 1);
  assert.ok(canvases.made.length > made, 'the next draw re-renders');
  skin.dispose();
  assert.equal(theme.listeners.size, 0, 'dispose unsubscribes');
  assert.equal(skin.cacheKey(), null);
});

// ---------------------------------------------------------------- minimum tile size

test('MIN_TILE_SIZE is the shared minimum, a positive integer', async () => {
  const { MIN_TILE_SIZE } = await skinModule();
  assert.ok(Number.isInteger(MIN_TILE_SIZE) && MIN_TILE_SIZE > 0);
});

test('the tile skin is DOM-free at import and holds no copy of a token value', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/tile-skin.js'), 'utf8');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no literal colours');
  assert.doesNotMatch(src, /^(?!\s*\/\/).*\bthree\b/im, 'independent of three.js');
});

// ---------------------------------------------------------------- browser: measurement and legibility

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

// The measurement behind MIN_TILE_SIZE: an Expert board (30 × 16) fitted to
// the window below the in-game overlay bar, with --space-4 (16px) between the
// window edges, the bar and the board.
const EXPERT = { cols: 30, rows: 16 };
const WINDOWS = [{ width: 1366, height: 768 }, { width: 1280, height: 800 }];
const MARGIN = 16;

// Runs in the page: draws every state and number at `size`, one row per
// state, and reports per tile how many pixels carry the glyph colour.
async function drawAllStates(size) {
  const { createTileSkin, TILE_STATES } = await import('/js/classic2d/tile-skin.js');
  const { token } = await import('/js/tokens.js');
  const tiles = [];
  for (const s of TILE_STATES) if (s !== 'revealed') tiles.push([s, 0]);
  for (let n = 0; n <= 8; n++) tiles.push(['revealed', n]);
  const glyph = {
    flagged: 'tile-flag', mine: 'tile-mine-glyph', exploded: 'tile-mine-glyph', 'wrong-flag': 'tile-wrong-flag-mark',
  };
  const gap = 1;
  let canvas = document.getElementById('tile-skin-shot');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'tile-skin-shot';
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: 9999 });
    document.body.append(canvas);
  }
  canvas.width = tiles.length * (size + gap) + gap;
  canvas.height = size + 2 * gap;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = token('color-board-gap');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const skin = createTileSkin({ redraw: () => {} });
  tiles.forEach(([s, n], i) => skin.drawTile(ctx, gap + i * (size + gap), gap, size, s, n, 1));
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.trim().slice(i, i + 2), 16));
  const out = tiles.map(([s, n], i) => {
    const name = s === 'revealed' ? (n ? `number-${n}` : null) : glyph[s];
    const data = ctx.getImageData(gap + i * (size + gap), gap, size, size).data;
    let hits = 0;
    if (name) {
      const [r, g, b] = parse(token(`color-${name}`));
      for (let p = 0; p < data.length; p += 4) {
        if (Math.abs(data[p] - r) + Math.abs(data[p + 1] - g) + Math.abs(data[p + 2] - b) < 40) hits++;
      }
    }
    return { state: s, number: n, glyph: name, hits };
  });
  skin.dispose();
  return out;
}

test('in a browser, MIN_TILE_SIZE is the Expert tile size at 1366×768 and 1280×800, and every state is legible at it in both themes', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const { MIN_TILE_SIZE } = await skinModule();
  const server = await serve();
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-tile-skin-'));
  try {
    const page = await browser.newPage({ viewport: WINDOWS[0], deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/dev/components.html`);
    const fitted = [];
    for (const win of WINDOWS) {
      await page.setViewportSize(win);
      const bar = await page.evaluate(() => document.querySelector('.ui-overlay-bar').getBoundingClientRect().height);
      assert.ok(bar > 0, 'the overlay bar is measured');
      const w = (win.width - 2 * MARGIN) / EXPERT.cols;
      const h = (win.height - bar - 3 * MARGIN) / EXPERT.rows;
      fitted.push(Math.floor(Math.min(w, h)));
    }
    assert.equal(MIN_TILE_SIZE, Math.min(...fitted), `Expert fits at ${fitted.join(' and ')}px`);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      const tiles = await page.evaluate(drawAllStates, MIN_TILE_SIZE);
      const shot = await page.locator('#tile-skin-shot').screenshot({ path: join(shots, `tile-skin-${theme}-${MIN_TILE_SIZE}px.png`) });
      assert.ok(shot.length > 500, `${theme}: screenshot taken`);
      const area = MIN_TILE_SIZE * MIN_TILE_SIZE;
      for (const tile of tiles) {
        if (!tile.glyph) continue;
        assert.ok(tile.hits >= area * 0.04, `${theme}: ${tile.state} ${tile.number} glyph shows (${tile.hits} px of ${area})`);
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(shots, { recursive: true, force: true });
  }
});
