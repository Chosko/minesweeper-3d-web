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
// Gradients record their stops; measureText answers a glyph box; getTransform
// answers the scale last set, so the painter can find the device pixel.
function fakeContext() {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt' };
  let scale = 1;
  const special = {
    createLinearGradient: (...args) => {
      const gradient = { args, stops: [], addColorStop: (offset, colour) => gradient.stops.push(colour) };
      calls.push({ op: 'createLinearGradient', args, gradient });
      return gradient;
    },
    measureText: (text) => {
      calls.push({ op: 'measureText', args: [text] });
      return { width: 10 * String(text).length, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 0 };
    },
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 }),
    setTransform: (...args) => {
      scale = args[0];
      calls.push({ op: 'setTransform', args });
    },
  };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in special) return special[prop];
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
// A style is a colour string or a gradient, which stands for its stops.
const styleColours = (style) => (style && typeof style === 'object' ? style.stops : [style]);
const filledWith = (ctx) => new Set(ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect' || c.op === 'fillText').flatMap((c) => styleColours(c.fill)));
const strokedWith = (ctx) => new Set(ctx.calls.filter((c) => c.op === 'stroke' || c.op === 'strokeRect' || c.op === 'strokeText').flatMap((c) => styleColours(c.stroke)));
const colours = (ctx) => new Set([...filledWith(ctx), ...strokedWith(ctx)]);
// The ops of a recording, with each style replaced by its colours, for comparing two recordings.
const trace = (ctx) => ctx.calls.map((c) => [c.op, JSON.stringify(c.args), styleColours(c.fill).join(), styleColours(c.stroke).join()].join('|'));

const artModule = () => import('../js/tile-art.js');

// The palettes a state's drawing takes, from token names (without --color-).
const RAISED = { rim: 'tile-rim', bevelLight: 'tile-bevel-light', bevelDark: 'tile-bevel-dark', faceShade: 'tile-face-shade', gloss: 'tile-gloss', glossFade: 'tile-gloss-fade' };
const SUNKEN = { rim: 'tile-rim', bevelLight: 'tile-bevel-light', bevelDark: 'tile-bevel-dark', face: 'tile-pressed' };
const REVEALED = { rim: 'tile-revealed-rim', edge: 'tile-revealed-edge', faceShade: 'tile-revealed-shade' };
const EXPLODED = { rim: 'tile-revealed-rim', edge: 'tile-exploded-edge', face: 'tile-exploded', faceShade: 'tile-exploded-shade' };
const MINE = { body: 'tile-mine-glyph', highlight: 'tile-mine-highlight' };
const FLAG = { base: 'tile-mine-glyph', shadow: 'tile-flag-shadow', cloth: 'tile-flag', clothShade: 'tile-flag-shade' };
const CROSS = { outline: 'tile-wrong-flag-outline', mark: 'tile-wrong-flag-mark' };
const resolve = (t, names) => Object.fromEntries(Object.entries(names).map(([k, n]) => [k, t(`--color-${n}`)]));

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

test('each state paints with its own tile tokens, in both themes, at its position', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const paint = (state, number) => {
      const ctx = fakeContext();
      paintTileWith(t, ctx, 10, 20, 32, state, number);
      return ctx;
    };
    const raised = Object.values(RAISED);
    const revealed = Object.values(REVEALED);
    const expect = {
      closed: [...raised, 'tile-closed'],
      pressed: Object.values(SUNKEN),
      revealed: [...revealed, 'tile-revealed'],
      flagged: [...raised, 'tile-flagged', ...Object.values(FLAG)],
      mine: [...revealed, 'tile-mine', ...Object.values(MINE)],
      exploded: [...Object.values(EXPLODED), ...Object.values(MINE)],
      'wrong-flag': [...revealed, 'tile-wrong-flag', ...Object.values(FLAG), ...Object.values(CROSS)],
    };
    for (const [state, names] of Object.entries(expect)) {
      const ctx = paint(state, 0);
      const used = colours(ctx);
      for (const n of names) assert.ok(used.has(t(`--color-${n}`)), `${name}: ${state} uses --color-${n}`);
      assert.ok(!used.has(FALLBACK_COLOR), `${name}: ${state} reads only declared tokens`);
      // The tile is drawn at its position: translated there, its first fill covering the tile.
      const at = ctx.calls.findIndex((c) => c.op === 'translate');
      assert.deepEqual(ctx.calls[at].args, [10, 20], `${name}: ${state} is drawn at the tile's position`);
      const first = ctx.calls.find((c) => c.op === 'fillRect');
      assert.deepEqual(first.args, [0, 0, 32, 32], `${name}: ${state}'s rim covers the tile`);
      assert.equal(ctx.calls.filter((c) => c.op === 'save').length, ctx.calls.filter((c) => c.op === 'restore').length, `${name}: ${state} restores the context`);
    }
  }
});

test('each state draws through the shared tile recipe with its own tokens', async () => {
  const { paintTileWith } = await skinModule();
  const art = await artModule();
  const src = readFileSync(join(ROOT, 'js/classic2d/tile-skin.js'), 'utf8');
  assert.match(src, /from '\.\.\/tile-art\.js'/, 'the skin imports the shared recipe');
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const c = (n) => t(`--color-${n}`);
    const recipes = {
      closed: (ctx, s, px) => art.drawRaisedFace(ctx, s, { ...resolve(t, RAISED), face: c('tile-closed') }, px),
      pressed: (ctx, s, px) => art.drawSunkenFace(ctx, s, resolve(t, SUNKEN), px),
      flagged: (ctx, s, px) => {
        art.drawRaisedFace(ctx, s, { ...resolve(t, RAISED), face: c('tile-flagged') }, px);
        art.drawFlagGlyph(ctx, s, resolve(t, FLAG));
      },
      mine: (ctx, s, px) => {
        art.drawRevealedFace(ctx, s, { ...resolve(t, REVEALED), face: c('tile-mine') }, px);
        art.drawMineGlyph(ctx, s, resolve(t, MINE));
      },
      exploded: (ctx, s, px) => {
        art.drawRevealedFace(ctx, s, resolve(t, EXPLODED), px);
        art.drawMineGlyph(ctx, s, resolve(t, MINE));
      },
      'wrong-flag': (ctx, s, px) => {
        art.drawRevealedFace(ctx, s, { ...resolve(t, REVEALED), face: c('tile-wrong-flag') }, px);
        art.drawFlagGlyph(ctx, s, resolve(t, FLAG));
        art.drawCross(ctx, s, resolve(t, CROSS));
      },
    };
    for (let n = 0; n <= 8; n++) {
      recipes[`revealed-${n}`] = (ctx, s, px) => {
        art.drawRevealedFace(ctx, s, { ...resolve(t, REVEALED), face: c('tile-revealed') }, px);
        if (n > 0) art.drawNumberGlyph(ctx, s, n, { color: c(`number-${n}`), shadow: c('tile-number-shadow') });
      };
    }
    for (const ratio of [1, 2]) {
      for (const [key, recipe] of Object.entries(recipes)) {
        const [state, number] = key.startsWith('revealed-') ? ['revealed', Number(key.slice(9))] : [key, 0];
        const skin = fakeContext();
        skin.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintTileWith(t, skin, 4, 8, 26, state, number);
        const direct = fakeContext();
        direct.setTransform(ratio, 0, 0, ratio, 0, 0);
        recipe(direct, 26, 1 / ratio);
        // The skin's own save / translate / restore around the recipe aside, the drawing is the recipe's.
        const drawing = (ctx) => trace(ctx).filter((op) => !/^(save|restore|translate)\|/.test(op));
        assert.deepEqual(drawing(skin), drawing(direct), `${name} at ratio ${ratio}: ${key} is the shared recipe with its tokens`);
      }
    }
  }
});

test('closed and flagged tiles are the raised cube face: rim, light top-left and dark bottom-right bevel, shaded face, gloss', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    for (const state of ['closed', 'flagged']) {
      const ctx = fakeContext();
      paintTileWith(t, ctx, 0, 0, 32, state, 0);
      const fills = ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect');
      assert.equal(fills[0].fill, t('--color-tile-rim'), `${name}: ${state} starts with its rim`);
      assert.equal(fills[1].fill, t('--color-tile-bevel-light'), `${name}: ${state}'s top-left bevel is lit`);
      assert.equal(fills[2].fill, t('--color-tile-bevel-dark'), `${name}: ${state}'s bottom-right bevel is dark`);
      const face = fills[3].fill;
      assert.equal(typeof face, 'object', `${name}: ${state}'s face is shaded`);
      assert.deepEqual(face.stops, [t(`--color-tile-${state}`), t('--color-tile-face-shade')]);
      assert.deepEqual(fills[4].fill.stops, [t('--color-tile-gloss'), t('--color-tile-gloss-fade')], `${name}: ${state} carries the gloss`);
    }
  }
});

test('the pressed tile is the cube face sunk in: bevel inverted, no gloss, face in --color-tile-pressed', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const ctx = fakeContext();
    paintTileWith(t, ctx, 0, 0, 32, 'pressed', 0);
    const fills = ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect');
    assert.deepEqual(fills.map((c) => c.fill), [
      t('--color-tile-rim'), t('--color-tile-bevel-dark'), t('--color-tile-bevel-light'), t('--color-tile-pressed'),
    ], `${name}: rim, dark top-left, lit bottom-right, flat face`);
    assert.ok(!ctx.calls.some((c) => c.op === 'createLinearGradient'), `${name}: no gloss or face shading`);
  }
});

test('closed and revealed tiles differ by relief and border, not by colour alone, in both themes', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const closed = fakeContext();
    paintTileWith(t, closed, 0, 0, 32, 'closed', 0);
    const revealed = fakeContext();
    paintTileWith(t, revealed, 0, 0, 32, 'revealed', 0);
    for (const bevel of ['--color-tile-bevel-light', '--color-tile-bevel-dark']) {
      assert.ok(colours(closed).has(t(bevel)), `${name}: the closed tile carries ${bevel}`);
    }
    assert.ok(!closed.calls.some((c) => c.op === 'fill' && c.fill === t('--color-tile-revealed-edge')), `${name}: the closed tile has no flat edge`);
    const fills = revealed.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect');
    assert.deepEqual(fills.slice(0, 2).map((c) => c.fill), [t('--color-tile-revealed-rim'), t('--color-tile-revealed-edge')], `${name}: the revealed tile is rim and flat edge`);
    assert.deepEqual(fills[2].fill.stops, [t('--color-tile-revealed'), t('--color-tile-revealed-shade')], `${name}: then its shaded face`);
    assert.ok(!revealed.calls.some((c) => c.op === 'fill' && c.args.length === 0 && [t('--color-tile-bevel-light'), t('--color-tile-bevel-dark')].includes(c.fill)), `${name}: no bevel on the revealed tile`);
  }
});

test('a revealed number is the 3D glyph in its own number colour, with a darker outline of its hue and a soft shadow; zero draws no glyph', async () => {
  const { paintTileWith } = await skinModule();
  const { shade, NUMBER_OUTLINE } = await artModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    for (let n = 1; n <= 8; n++) {
      const ctx = fakeContext();
      paintTileWith(t, ctx, 0, 0, 26, 'revealed', n);
      const text = ctx.calls.filter((c) => c.op === 'fillText');
      assert.deepEqual(text.map((c) => c.args[0]), [String(n), String(n)], `${name}: a shadow and the glyph for ${n}`);
      assert.equal(text[0].fill, t('--color-tile-number-shadow'), `${name}: ${n}'s shadow`);
      assert.equal(text[1].fill, t(`--color-number-${n}`), `${name}: ${n} uses --color-number-${n}`);
      const outline = ctx.calls.filter((c) => c.op === 'strokeText');
      assert.equal(outline.length, 1, `${name}: ${n} is outlined`);
      assert.equal(outline[0].stroke, shade(t(`--color-number-${n}`), NUMBER_OUTLINE), `${name}: ${n}'s outline is its own hue, darker`);
      assert.match(ctx.font, /^800 /, `${name}: ${n} is set in the heavy weight`);
    }
    const empty = fakeContext();
    paintTileWith(t, empty, 0, 0, 24, 'revealed', 0);
    assert.equal(empty.calls.filter((c) => c.op === 'fillText' || c.op === 'strokeText').length, 0, `${name}: revealed empty has no glyph`);
  }
});

test('the wrong flag is the 3D flag under the 3D cross on the revealed face, and no mine', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, map] of Object.entries(THEMES)) {
    const t = tokenFrom(map);
    const ctx = fakeContext();
    paintTileWith(t, ctx, 0, 0, 32, 'wrong-flag', 0);
    const clothAt = ctx.calls.findIndex((c) => c.op === 'fill' && typeof c.fill === 'object' && c.fill.stops.includes(t('--color-tile-flag')));
    assert.ok(clothAt > 0, `${name}: the flag's cloth is drawn`);
    const strokes = ctx.calls.map((c, i) => [c, i]).filter(([c]) => c.op === 'stroke');
    assert.deepEqual(strokes.map(([c]) => c.stroke), [t('--color-tile-wrong-flag-outline'), t('--color-tile-wrong-flag-mark')], `${name}: the cross, outlined`);
    assert.ok(strokes.every(([, i]) => i > clothAt), `${name}: the cross is over the flag`);
    assert.ok(!ctx.calls.some((c) => c.op === 'arc'), `${name}: no mine on a wrong flag`);
  }
});

test('the recipe scales with the tile, and every rim, border and bevel band is at least one device pixel', async () => {
  const { tileBands } = await artModule();
  const { paintTileWith, MIN_TILE_SIZE } = await skinModule();
  const t = tokenFrom(LIGHT);
  for (const size of [...new Set([26, MIN_TILE_SIZE])]) {
    for (const ratio of [1, 2]) {
      const px = 1 / ratio;
      const b = tileBands(size, px);
      for (const [band, width] of Object.entries({ rim: b.rim, bevel: b.bevel, edge: b.edge - b.rim })) {
        assert.ok(width >= px, `${size}px at ratio ${ratio}: the ${band} band is ${width * ratio} device px`);
        assert.ok(Number.isInteger(Math.round(width * ratio * 1e9) / 1e9), `${size}px at ratio ${ratio}: the ${band} band is whole device pixels`);
      }
      const ctx = fakeContext();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintTileWith(t, ctx, 0, 0, size, 'closed', 0);
      assert.deepEqual(ctx.calls.find((c) => c.op === 'moveTo').args, [b.rim, b.rim], `${size}px at ratio ${ratio}: the bevel starts inside the rim`);
      const face = ctx.calls.find((c) => c.op === 'fillRect' && c.args[0] > 0);
      assert.equal(face.args[0], b.rim + b.bevel, `${size}px at ratio ${ratio}: the face starts inside the bevel`);
    }
  }
  // At the 3D atlas's size the bands are the cube face's own proportions.
  assert.deepEqual(tileBands(256), { rim: 4, bevel: 256 * 0.075, edge: 12 });
  const big = tileBands(512, 1);
  assert.deepEqual([big.rim, big.edge], [8, 24], 'the proportions scale with the tile');
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
    const glyph = (c) => c.calls.filter((call) => call.op === 'fillText').at(-1).fill;
    assert.equal(glyph(ctx), LIGHT.get('--color-number-4'));
    values.set('--color-number-4', '#123456');
    const again = fakeContext();
    paintTile(again, 0, 0, 16, 'revealed', 4);
    assert.equal(glyph(again), '#123456', 'values are read at paint time, not copied');
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

test('MIN_TILE_SIZE is the shared floor, 26 px (decision 10 of docs/UX_REVIEW.md)', async () => {
  const { MIN_TILE_SIZE } = await skinModule();
  assert.ok(Number.isInteger(MIN_TILE_SIZE) && MIN_TILE_SIZE > 0);
  assert.equal(MIN_TILE_SIZE, 26);
});

test('the tile skin is DOM-free at import and holds no copy of a token value', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/tile-skin.js'), 'utf8');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no literal colours');
  assert.doesNotMatch(src, /rgba?\(/, 'no literal translucent colours');
  assert.doesNotMatch(src, /^(?!\s*\/\/).*\bthree\b/im, 'independent of three.js');
});

test('the shared tile recipe is three-free and token-free: every colour is an argument', async () => {
  const src = readFileSync(join(ROOT, 'js/tile-art.js'), 'utf8');
  const imports = [...src.matchAll(/^\s*import\b[^;]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, [], 'it imports nothing: neither three.js nor the token reader');
  assert.doesNotMatch(src, /--color-|getPropertyValue|msTheme|data-theme|document\.|window\./, 'it reads no token and touches no DOM');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'it holds no colour of its own');
  const art = await artModule();
  for (const fn of ['drawRaisedFace', 'drawSunkenFace', 'drawRevealedFace', 'drawNumberGlyph', 'drawMineGlyph', 'drawFlagGlyph', 'drawCross', 'tileBands', 'shade']) {
    assert.equal(typeof art[fn], 'function', `tile-art exports ${fn}`);
  }
  const textures = readFileSync(join(ROOT, 'js/textures.js'), 'utf8');
  assert.match(textures, /from '\.\/tile-art\.js'/, 'the 3D atlas draws through it');
  for (const copy of [/function roundRect/, /function shade/, /createLinearGradient/, /fillText/, /arcTo/]) {
    assert.doesNotMatch(textures, copy, `the atlas keeps no copy of the recipe (${copy})`);
  }
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

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

// The measurement behind MIN_TILE_SIZE: an Expert board (30 × 16) fitted, in
// the Classic 2D screen's framed panel, to a window 1024px wide with --space-4
// (16px) margins — the panel's 1px border and 8px inside it on every side, and
// the overlay readouts on its top edge with 8px between them and the board.
const EXPERT = { cols: 30, rows: 16 };
const NARROWEST = 1024;
const MARGIN = 16;
const INSET = 9;
const GAP = 8;

// Runs in the page: draws every state and number at `size` CSS pixels and
// `ratio` device pixels each, in one row, and reports per tile how many device
// pixels carry one of its glyph's colours.
async function drawAllStates([size, ratio]) {
  const { createTileSkin, TILE_STATES } = await import('/js/classic2d/tile-skin.js');
  const { token } = await import('/js/tokens.js');
  const tiles = [];
  for (const s of TILE_STATES) if (s !== 'revealed') tiles.push([s, 0]);
  for (let n = 0; n <= 8; n++) tiles.push(['revealed', n]);
  const glyph = {
    flagged: ['tile-flag', 'tile-flag-shade', 'tile-mine-glyph'],
    mine: ['tile-mine-glyph'],
    exploded: ['tile-mine-glyph'],
    'wrong-flag': ['tile-wrong-flag-mark', 'tile-flag', 'tile-flag-shade'],
  };
  const gap = 1;
  let canvas = document.getElementById('tile-skin-shot');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'tile-skin-shot';
    Object.assign(canvas.style, { position: 'fixed', left: '0', top: '0', zIndex: 9999 });
    document.body.append(canvas);
  }
  const width = tiles.length * (size + gap) + gap;
  const height = size + 2 * gap;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = token('color-board-gap');
  ctx.fillRect(0, 0, width, height);
  const skin = createTileSkin({ redraw: () => {} });
  tiles.forEach(([s, n], i) => skin.drawTile(ctx, gap + i * (size + gap), gap, size, s, n, ratio));
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.trim().slice(i, i + 2), 16));
  const out = tiles.map(([s, n], i) => {
    const names = s === 'revealed' ? (n ? [`number-${n}`] : []) : (glyph[s] ?? []);
    const wanted = names.map((name) => parse(token(`color-${name}`)));
    const data = ctx.getImageData((gap + i * (size + gap)) * ratio, gap * ratio, size * ratio, size * ratio).data;
    let hits = 0;
    for (let p = 0; p < data.length; p += 4) {
      if (wanted.some(([r, g, b]) => Math.abs(data[p] - r) + Math.abs(data[p + 1] - g) + Math.abs(data[p + 2] - b) < 40)) hits++;
    }
    return { state: s, number: n, glyph: names.join('+') || null, hits };
  });
  skin.dispose();
  return out;
}

test('in a browser, Expert fits a 1024px wide window at MIN_TILE_SIZE or more, and every state is legible at 26 px and at it, at pixel ratios 1 and 2, in both themes', async (t) => {
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
    const page = await browser.newPage({ viewport: { width: NARROWEST, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.evaluate(() => globalThis.__ms.modes.start('classic-2d', { size: 'expert', noGuess: false }));
    const bar = await page.evaluate(() => document.querySelector('#hud .ui-overlay-bar').getBoundingClientRect().height);
    assert.ok(bar > 0, 'the readouts on the panel\'s edge are measured');
    const across = Math.floor((NARROWEST - 2 * MARGIN - 2 * INSET) / EXPERT.cols);
    assert.ok(across >= MIN_TILE_SIZE, `Expert's width fits 1024px at ${across}px`);
    const tallest = 2 * MARGIN + 2 * INSET + Math.ceil(bar) + GAP + EXPERT.rows * MIN_TILE_SIZE;
    await page.setViewportSize({ width: NARROWEST, height: tallest });
    await page.waitForFunction((min) => globalThis.__ms.board2D.layout.tile === min, MIN_TILE_SIZE);
    assert.equal(await page.evaluate(() => globalThis.__ms.board2D.layout.scrolls), false, `Expert fits 1024 × ${tallest} at the floor`);
    await page.setViewportSize({ width: NARROWEST, height: tallest - 1 });
    await page.waitForFunction(() => globalThis.__ms.board2D.layout.scrolls);
    await page.goto(`http://127.0.0.1:${server.address().port}/dev/components.html`);

    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      for (const size of [...new Set([26, MIN_TILE_SIZE])]) {
        for (const ratio of [1, 2]) {
          const tiles = await page.evaluate(drawAllStates, [size, ratio]);
          const shot = await page.locator('#tile-skin-shot').screenshot({ path: join(shots, `tile-skin-${theme}-${size}px-x${ratio}.png`) });
          assert.ok(shot.length > 500, `${theme} ${size}px x${ratio}: screenshot taken`);
          const area = size * size * ratio * ratio;
          for (const tile of tiles) {
            if (!tile.glyph) continue;
            assert.ok(tile.hits >= area * 0.04, `${theme} ${size}px x${ratio}: ${tile.state} ${tile.number} glyph shows (${tile.hits} device px of ${area})`);
          }
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(shots, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- browser: the 3D atlas is unchanged

// Digests of every 3D atlas layer drawLayer produces (closed, flag, mine,
// exploded mine, numbers 0–26, wrong flag), recorded in chromium from the
// atlas's own drawing before it moved into js/tile-art.js. Text and
// anti-aliasing depend on the browser's fonts and rasteriser, so the digests
// are compared only where a probe drawing digests as it did when they were
// recorded.
const ATLAS_PROBE = 'a871f8ab541fd5b0';
const ATLAS_DIGESTS = [
  '674addaa9bae3f91', '4023e83ce200a222', 'ab4ff4521cb2c417', '8446f7d2ecd428d4', '857e9aa854fc52cc', '2a129179ade8e835',
  '478fc8df8805ce9e', '399232159fbb3796', '5aca736f8823de99', '117f1cb61a997299', '3ce3df2b3b538399', '6969054b281d25cb',
  'c7670f4bd88731dc', 'bc2049273dfeba6c', '75e9db4f6875169f', 'fb56ac7c2be08fb1', '7b90d31777874ec9', '770676e2c4d74d3e',
  '2dc756cbc0647880', '8eb5febdab75aee4', 'aa293de64779b27d', '106a8e704ccec9d7', 'c9d9eb7cf848ec96', 'b4396643dde93ecd',
  'f6709327d218d606', '90f8bb4213c4fb13', '924feffd8af56d2f', '1b55e0796a4c880a', '831e6f2ab3479c02', '8ed7483accb73413',
  '829812793902708d', 'cf44b4bf09dd1e16',
];

// Runs in the page: digests the probe and every atlas layer.
async function atlasDigests() {
  const hex = async (data) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
    .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const probe = document.createElement('canvas');
  probe.width = 256;
  probe.height = 96;
  const p = probe.getContext('2d', { willReadFrequently: true });
  const g = p.createLinearGradient(0, 0, 256, 96);
  g.addColorStop(0, '#6fa3f7');
  g.addColorStop(1, '#21407a');
  p.fillStyle = g;
  p.fillRect(0, 0, 256, 96);
  p.font = '800 54px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  p.lineJoin = 'round';
  p.lineWidth = 3.3;
  p.strokeStyle = '#123456';
  p.strokeText('0123456789', 6, 70);
  p.fillStyle = 'rgba(255,59,48,0.9)';
  p.fillText('0123456789', 6, 70);
  p.beginPath();
  p.arc(230, 24, 13.7, 0, Math.PI * 2);
  p.moveTo(200, 80);
  p.arcTo(250, 80, 250, 90, 7.5);
  p.lineTo(200, 90);
  p.fill();
  const tex = await import('/js/textures.js');
  const canvas = document.createElement('canvas');
  canvas.width = tex.TILE;
  canvas.height = tex.TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const layers = [];
  for (let l = 0; l < tex.LAYERS; l++) {
    tex.drawLayer(ctx, l);
    layers.push(await hex(ctx.getImageData(0, 0, tex.TILE, tex.TILE).data));
  }
  return { probe: await hex(p.getImageData(0, 0, 256, 96).data), layers };
}

test('in a browser, every 3D atlas layer is pixel-identical to the drawing before the shared recipe', async (t) => {
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
  const server = await serve();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // index.html maps the bare `three` import js/textures.js makes.
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html?still-backdrop`);
    const { probe, layers } = await page.evaluate(atlasDigests);
    assert.equal(layers.length, ATLAS_DIGESTS.length, 'one digest per atlas layer');
    if (probe !== ATLAS_PROBE) {
      t.skip(`this browser rasterises the probe differently (${probe}) from the one the digests were recorded in`);
      return;
    }
    layers.forEach((digest, layer) => assert.equal(digest, ATLAS_DIGESTS[layer], `atlas layer ${layer} is unchanged`));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
