import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { FALLBACK_COLOR } from '../js/tokens.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';
import { BOARD as FIXTURE } from './fixtures/themes/fixture-dusk/board.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const suite = browserSuite({ args: [] });

// The board modules the skin is tested with: Joyful tiles' (the flat style, with a gap and a corner
// radius) and the fixture theme's (the bevel style, neither), every colour unlike the other's.
const BOARDS = { 'joyful-tiles': JOYFUL, 'fixture-dusk': FIXTURE };

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
const skinModule = () => import('../js/classic2d/tile-skin.js');

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

// A board art hand-off of its own, holding `initial` (a theme id) when given.
async function fakeArt(initial = 'joyful-tiles') {
  const { createBoardArt } = await skinModule();
  const art = createBoardArt();
  if (initial) art.set(initial, BOARDS[initial]);
  return art;
}

async function makeSkin(mod, { art, redraw = () => {} } = {}) {
  const canvases = fakeCanvasFactory();
  const handOff = art ?? await fakeArt();
  const skin = mod.createTileSkin({ art: handOff, createCanvas: canvases.createCanvas, redraw });
  return { skin, canvases, art: handOff };
}

// ---------------------------------------------------------------- state dispatch

test('the visual states are the engine cell states plus pressed', async () => {
  const { TILE_STATES } = await skinModule();
  const { CELL } = await import('../js/engine/rules.js');
  for (const s of Object.values(CELL)) assert.ok(TILE_STATES.includes(s), `${s} is a tile state`);
  assert.ok(TILE_STATES.includes('pressed'));
  assert.equal(TILE_STATES.length, Object.values(CELL).length + 1);
});

// Every colour a state draws with, from its board module.
function stateColours(b) {
  const p = b.palette;
  const f = p.faces2d;
  const face = (x) => Object.values(x);
  return {
    closed: face(f.closed),
    pressed: face(f.sunk),
    revealed: face(f.revealed),
    flagged: [...face(f.closed), ...Object.values(p.flag)],
    mine: [...face(f.revealed), ...Object.values(p.mine)],
    exploded: [...face(f.exploded), ...Object.values(p.mine)],
    'wrong-flag': [...face(f.revealed), ...Object.values(p.flag), ...Object.values(p.cross)],
  };
}

test('each state paints from its board module\'s palette, in each theme, at its position', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, b] of Object.entries(BOARDS)) {
    for (const [state, wanted] of Object.entries(stateColours(b))) {
      const ctx = fakeContext();
      paintTileWith(b, ctx, 10, 20, 32, state, 0);
      const used = colours(ctx);
      // The flat style's face draws no bevel slopes: every colour it does draw is the module's.
      for (const c of used) assert.ok(wanted.includes(c), `${name}: ${state} draws ${c}, a colour of its module`);
      assert.ok(used.has(b.palette.faces2d[{ closed: 'closed', flagged: 'closed', pressed: 'sunk', exploded: 'exploded' }[state] ?? 'revealed'].face), `${name}: ${state} draws its face`);
      assert.ok(!used.has(FALLBACK_COLOR), `${name}: ${state} is no placeholder`);
      const at = ctx.calls.findIndex((c) => c.op === 'translate');
      assert.deepEqual(ctx.calls[at].args, [10, 20], `${name}: ${state} is drawn at the tile's position`);
      assert.equal(ctx.calls.filter((c) => c.op === 'save').length, ctx.calls.filter((c) => c.op === 'restore').length, `${name}: ${state} restores the context`);
    }
  }
});

test('each state draws through the shared tile recipe in the module\'s Classic 2D style, palette and number font', async () => {
  const { paintTileWith } = await skinModule();
  const art = await artModule();
  const src = readFileSync(join(ROOT, 'js/classic2d/tile-skin.js'), 'utf8');
  assert.match(src, /from '\.\.\/tile-art\.js'/, 'the skin imports the shared recipe');
  for (const [name, b] of Object.entries(BOARDS)) {
    const { faces2d: f, flag, mine, cross, numberShadow } = b.palette;
    const face = (ctx, s, px, which, palette) => art.drawFace(ctx, s, which, { style: b.style2d.name, params: b.style2d.params, palette, px });
    const recipes = {
      closed: (ctx, s, px) => face(ctx, s, px, 'closed', f.closed),
      pressed: (ctx, s, px) => face(ctx, s, px, 'sunk', f.sunk),
      flagged: (ctx, s, px) => { face(ctx, s, px, 'closed', f.closed); art.drawFlagGlyph(ctx, s, flag); },
      mine: (ctx, s, px) => { face(ctx, s, px, 'revealed', f.revealed); art.drawMineGlyph(ctx, s, mine); },
      exploded: (ctx, s, px) => { face(ctx, s, px, 'revealed', f.exploded); art.drawMineGlyph(ctx, s, mine); },
      'wrong-flag': (ctx, s, px) => {
        face(ctx, s, px, 'revealed', f.revealed);
        art.drawFlagGlyph(ctx, s, flag);
        art.drawCross(ctx, s, cross);
      },
    };
    for (let n = 0; n <= 8; n++) {
      recipes[`revealed-${n}`] = (ctx, s, px) => {
        face(ctx, s, px, 'revealed', f.revealed);
        if (n > 0) art.drawNumberGlyph(ctx, s, n, { color: b.numbers[n], shadow: numberShadow, font: b.font });
      };
    }
    for (const ratio of [1, 2]) {
      for (const [key, recipe] of Object.entries(recipes)) {
        const [state, number] = key.startsWith('revealed-') ? ['revealed', Number(key.slice(9))] : [key, 0];
        const skin = fakeContext();
        skin.setTransform(ratio, 0, 0, ratio, 0, 0);
        paintTileWith(b, skin, 4, 8, 26, state, number);
        const direct = fakeContext();
        direct.setTransform(ratio, 0, 0, ratio, 0, 0);
        recipe(direct, 26, 1 / ratio);
        // The skin's own save / translate / restore around the recipe aside, the drawing is the recipe's.
        const drawing = (ctx) => trace(ctx).filter((op) => !/^(save|restore|translate)\|/.test(op));
        assert.deepEqual(drawing(skin), drawing(direct), `${name} at ratio ${ratio}: ${key} is the shared recipe with its module`);
      }
    }
  }
});

test('under Joyful tiles the tiles are the flat style with its corner radius: a light top band and dark bottom edge on the closed face, the revealed face flush inside a hairline', async () => {
  const { paintTileWith } = await skinModule();
  const f = JOYFUL.palette.faces2d;
  assert.equal(JOYFUL.style2d.name, 'flat');
  for (const state of ['closed', 'flagged']) {
    const ctx = fakeContext();
    paintTileWith(JOYFUL, ctx, 0, 0, 48, state, 0);
    assert.ok(ctx.calls.some((c) => c.op === 'clip'), `${state}: drawn inside the rounded tile`);
    const arcs = ctx.calls.filter((c) => c.op === 'arcTo').slice(0, 4); // the clip's corners, before any glyph
    assert.ok(arcs.length === 4 && arcs.every((c) => Math.abs(c.args[4] - 48 * JOYFUL.style2d.params.radius) < 1e-9), `${state}: corners rounded by the module's radius`);
    const fills = ctx.calls.filter((c) => c.op === 'fillRect').map((c) => [c.fill, ...c.args]);
    assert.deepEqual(fills.slice(0, 3), [
      [f.closed.face, 0, 0, 48, 48],
      [f.closed.bevelLight, 0, 0, 48, Math.round(48 * JOYFUL.style2d.params.band)],
      [f.closed.bevelDark, 0, 48 - Math.round(48 * JOYFUL.style2d.params.edge), 48, Math.round(48 * JOYFUL.style2d.params.edge)],
    ], `${state}: the face, its top band, its bottom edge`);
  }
  const open = fakeContext();
  paintTileWith(JOYFUL, open, 0, 0, 48, 'revealed', 0);
  const fills = open.calls.filter((c) => c.op === 'fillRect' || c.op === 'fill').map((c) => c.fill);
  assert.deepEqual(fills, [f.revealed.rim, f.revealed.face], 'the revealed face: its hairline, then the face inside it');
  assert.ok(!colours(open).has(f.closed.bevelLight) && !colours(open).has(f.closed.bevelDark), 'no relief on the revealed face');
});

test('a theme with no gap and no radius draws its tiles square, as the recipe\'s bevel draws them', async () => {
  const { paintTileWith } = await skinModule();
  const ctx = fakeContext();
  paintTileWith(FIXTURE, ctx, 0, 0, 32, 'closed', 0);
  assert.ok(!ctx.calls.some((c) => c.op === 'clip' || c.op === 'arcTo'), 'no rounded clip');
  const fills = ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect');
  assert.equal(fills[0].fill, FIXTURE.palette.faces2d.closed.rim, 'the rim first');
  assert.deepEqual(fills[0].args, [0, 0, 32, 32], 'covering the whole tile');
});

test('a revealed number is the glyph in the module\'s number colour and font, outlined in its own hue, over the module\'s shadow; zero draws no glyph', async () => {
  const { paintTileWith } = await skinModule();
  const { shade, NUMBER_OUTLINE, NUMBER_FONT } = await artModule();
  for (const [name, b] of Object.entries(BOARDS)) {
    for (let n = 1; n <= 8; n++) {
      const ctx = fakeContext();
      paintTileWith(b, ctx, 0, 0, 26, 'revealed', n);
      const text = ctx.calls.filter((c) => c.op === 'fillText');
      assert.deepEqual(text.map((c) => c.args[0]), [String(n), String(n)], `${name}: a shadow and the glyph for ${n}`);
      assert.equal(text[0].fill, b.palette.numberShadow, `${name}: ${n}'s shadow`);
      assert.equal(text[1].fill, b.numbers[n], `${name}: ${n} in the module's number colour`);
      const outline = ctx.calls.filter((c) => c.op === 'strokeText');
      assert.equal(outline[0].stroke, shade(b.numbers[n], NUMBER_OUTLINE), `${name}: ${n}'s outline is its own hue, darker`);
      assert.equal(ctx.font, `${b.font.weight} ${26 * 0.68}px "${b.font.family}", ${NUMBER_FONT}`, `${name}: ${n} in the module's number font`);
    }
    const empty = fakeContext();
    paintTileWith(b, empty, 0, 0, 24, 'revealed', 0);
    assert.equal(empty.calls.filter((c) => c.op === 'fillText' || c.op === 'strokeText').length, 0, `${name}: revealed empty has no glyph`);
  }
});

test('the wrong flag is the flag under the cross on the revealed face, and no mine', async () => {
  const { paintTileWith } = await skinModule();
  for (const [name, b] of Object.entries(BOARDS)) {
    const ctx = fakeContext();
    paintTileWith(b, ctx, 0, 0, 32, 'wrong-flag', 0);
    const clothAt = ctx.calls.findIndex((c) => c.op === 'fill' && typeof c.fill === 'object' && c.fill.stops.includes(b.palette.flag.cloth));
    assert.ok(clothAt > 0, `${name}: the flag's cloth is drawn`);
    const strokes = ctx.calls.map((c, i) => [c, i]).filter(([c]) => c.op === 'stroke');
    assert.deepEqual(strokes.map(([c]) => c.stroke), [b.palette.cross.outline, b.palette.cross.mark], `${name}: the cross, outlined`);
    assert.ok(strokes.every(([, i]) => i > clothAt), `${name}: the cross is over the flag`);
    assert.ok(!ctx.calls.some((c) => c.op === 'arc'), `${name}: no mine on a wrong flag`);
  }
});

test('every band a style draws is whole device pixels, never thinner than one, at the minimum tile', async () => {
  const { paintTileWith, MIN_TILE_SIZE } = await skinModule();
  for (const ratio of [1, 2]) {
    const px = 1 / ratio;
    const ctx = fakeContext();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintTileWith(JOYFUL, ctx, 0, 0, MIN_TILE_SIZE, 'closed', 0);
    const [, band, edge] = ctx.calls.filter((c) => c.op === 'fillRect');
    for (const [what, width] of [['top band', band.args[3]], ['bottom edge', edge.args[3]]]) {
      assert.ok(width >= px, `ratio ${ratio}: the ${what} is ${width * ratio} device px`);
      assert.ok(Number.isInteger(Math.round(width * ratio * 1e9) / 1e9), `ratio ${ratio}: the ${what} is whole device pixels`);
    }
  }
});

test('an unknown state, a revealed number outside 0–8, or no board module paints the visibly wrong placeholder', async () => {
  const { paintTileWith } = await skinModule();
  for (const [board, state, number] of [[JOYFUL, 'bogus', 0], [JOYFUL, undefined, 0], [JOYFUL, 'revealed', 9], [JOYFUL, 'revealed', -1], [null, 'closed', 0]]) {
    const ctx = fakeContext();
    paintTileWith(board, ctx, 5, 5, 20, state, number);
    assert.ok(filledWith(ctx).has(FALLBACK_COLOR), `${String(state)}/${number} paints the placeholder colour`);
    assert.ok(ctx.calls.some((c) => c.op === 'fillRect' && c.args.join() === '5,5,20,20'), 'the placeholder fills the whole tile');
  }
});

// ---------------------------------------------------------------- the tile cache

test('the cache pre-renders every state and number once, and a redraw is only image copies', async () => {
  const mod = await skinModule();
  const { skin, canvases } = await makeSkin(mod);
  const board = fakeContext();
  skin.drawTile(board, 0, 0, 30, 'closed', 0, 1);
  const prerendered = canvases.made.length;
  const depths = 3 * (mod.DEPTH_STEPS.length - 1); // closed, pressed and flagged at each step short of 1
  assert.equal(prerendered, mod.TILE_STATES.length - 1 + 9 + 1 + depths,
    'one image per non-revealed state, per revealed 0–8, per raised state at each depth step, and the placeholder');
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
  const { skin, canvases, art } = await makeSkin(mod);
  const board = fakeContext();
  const per = canvases.made.length;
  skin.drawTile(board, 0, 0, 24, 'closed', 0, 1);
  const one = canvases.made.length;
  assert.ok(one > per);
  assert.equal(skin.cacheKey(), '24|1|joyful-tiles');

  skin.drawTile(board, 0, 0, 24, 'closed', 0, 1);
  assert.equal(canvases.made.length, one, 'same key, no rebuild');

  skin.drawTile(board, 0, 0, 32, 'closed', 0, 1);
  assert.equal(canvases.made.length, one * 2, 'size change rebuilds');
  assert.equal(skin.cacheKey(), '32|1|joyful-tiles');

  skin.drawTile(board, 0, 0, 32, 'closed', 0, 2);
  assert.equal(canvases.made.length, one * 3, 'pixel-ratio change rebuilds');
  assert.deepEqual([canvases.made.at(-1).width, canvases.made.at(-1).height], [64, 64], 'images are rendered at device pixels');
  const scaled = canvases.made.at(-1).ctx.calls.find((c) => c.op === 'setTransform' || c.op === 'scale');
  assert.ok(scaled, 'the offscreen context is scaled to the pixel ratio');
  assert.equal(board.calls.at(-1).args.slice(1).join(), '0,0,32,32', 'copied at CSS-pixel size');

  art.set('fixture-dusk', FIXTURE);
  skin.drawTile(board, 0, 0, 32, 'closed', 0, 2);
  assert.equal(canvases.made.length, one * 4, 'theme change rebuilds');
  assert.equal(skin.cacheKey(), '32|2|fixture-dusk');
  const fixtureClosed = canvases.made.find((c) => colours(c.ctx).has(FIXTURE.palette.faces2d.closed.face));
  assert.ok(fixtureClosed, 'the rebuilt images use the new theme\'s board module');
  assert.equal(skin.board(), FIXTURE, 'the skin holds the board module it was handed');
});

test('a theme change drops the cache and asks the renderer for a redraw; dispose unsubscribes', async () => {
  const mod = await skinModule();
  const art = await fakeArt('joyful-tiles');
  const redraws = [];
  const { skin, canvases } = await makeSkin(mod, { art, redraw: () => redraws.push(skin.cacheKey()) });
  skin.drawTile(fakeContext(), 0, 0, 20, 'flagged', 0, 1);
  art.set('fixture-dusk', FIXTURE);
  assert.equal(redraws.length, 1, 'redraw requested once');
  assert.equal(redraws[0], null, 'the cache is already dropped when the redraw runs');
  const made = canvases.made.length;
  skin.drawTile(fakeContext(), 0, 0, 20, 'flagged', 0, 1);
  assert.ok(canvases.made.length > made, 'the next draw re-renders');
  skin.dispose();
  art.set('joyful-tiles', JOYFUL);
  assert.equal(redraws.length, 1, 'dispose unsubscribes');
  assert.equal(skin.cacheKey(), null);
});

test('until a board module is handed over the skin draws and caches nothing; the hand-off redraws', async () => {
  const mod = await skinModule();
  const art = await fakeArt(null);
  let redraws = 0;
  const { skin, canvases } = await makeSkin(mod, { art, redraw: () => { redraws++; } });
  const board = fakeContext();
  skin.drawTile(board, 0, 0, 30, 'closed', 0, 1);
  assert.equal(skin.board(), null);
  assert.equal(canvases.made.length, 0, 'nothing cached');
  assert.equal(board.calls.length, 0, 'nothing drawn');
  art.set('joyful-tiles', JOYFUL);
  assert.equal(redraws, 1, 'the hand-off asks for a redraw');
  skin.drawTile(board, 0, 0, 30, 'closed', 0, 1);
  assert.ok(canvases.made.length > 0 && board.calls.at(-1).op === 'drawImage', 'then it draws');
});

test('the page\'s board art hand-off keeps the last module handed to it and tells each subscriber', async () => {
  const { BOARD_ART, createBoardArt } = await skinModule();
  assert.equal(typeof BOARD_ART.current, 'function');
  const art = createBoardArt();
  assert.equal(art.current(), null, 'nothing until the shell hands a module over');
  const heard = [];
  const off = art.onChange((next) => heard.push(next.id));
  art.set('joyful-tiles', JOYFUL);
  assert.deepEqual(art.current(), { id: 'joyful-tiles', board: JOYFUL });
  off();
  art.set('fixture-dusk', FIXTURE);
  assert.deepEqual(heard, ['joyful-tiles'], 'an unsubscribed listener hears nothing more');
});

// ---------------------------------------------------------------- the shell's hand-off

function fakeApplier(id = null, mod = null) {
  const listeners = [];
  let current = id;
  let board = mod;
  return {
    current: () => current,
    board: () => board,
    onThemeChange(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    emit(nextId, nextMod) { current = nextId; board = nextMod; for (const fn of [...listeners]) fn(nextId, nextMod); },
    listeners,
  };
}
function fakeFonts() {
  const loads = [];
  return {
    loads,
    load(spec) {
      let resolve;
      const p = new Promise((r) => { resolve = r; });
      loads.push({ spec, resolve: () => resolve([]) });
      return p;
    },
  };
}
const settle = () => new Promise((r) => setImmediate(r));

test('the shell hands the board module over at start-up and on every theme change, only once its number font has loaded', async () => {
  const { createBoardArt } = await skinModule();
  const { bindBoardArt, numberFontSpec } = await import('../js/shell/board-art.js');
  const art = createBoardArt();
  const applier = fakeApplier();
  const fonts = fakeFonts();
  const off = bindBoardArt({ applier, fonts, art });
  assert.equal(art.current(), null, 'nothing before start-up');

  applier.emit('joyful-tiles', { BOARD: JOYFUL });
  assert.deepEqual(fonts.loads.map((l) => l.spec), [numberFontSpec(JOYFUL.font)], 'the number font is loaded first');
  assert.equal(numberFontSpec(JOYFUL.font), '800 1em "Rubik"');
  await settle();
  assert.equal(art.current(), null, 'no tile is drawn in a fallback font: nothing is handed over before the font loads');
  fonts.loads[0].resolve();
  await settle();
  assert.deepEqual(art.current(), { id: 'joyful-tiles', board: JOYFUL }, 'handed over once it has');

  // A switch that another overtakes before its font loads is never handed over.
  applier.emit('fixture-dusk', { BOARD: FIXTURE });
  applier.emit('joyful-tiles', { BOARD: JOYFUL });
  fonts.loads[2].resolve();
  await settle();
  fonts.loads[1].resolve();
  await settle();
  assert.equal(art.current().id, 'joyful-tiles', 'the latest theme wins');

  off();
  assert.equal(applier.listeners.length, 0, 'the unsubscribe stops the hand-off');
});

test('a hand-off bound after start-up hands the active module over at once', async () => {
  const { createBoardArt } = await skinModule();
  const { bindBoardArt } = await import('../js/shell/board-art.js');
  const art = createBoardArt();
  const fonts = fakeFonts();
  bindBoardArt({ applier: fakeApplier('fixture-dusk', { BOARD: FIXTURE }), fonts, art });
  fonts.loads[0].resolve();
  await settle();
  assert.equal(art.current().board, FIXTURE);
});

test('the shell binds the hand-off before the theme applier starts', () => {
  const main = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  const bind = main.indexOf('bindBoardArt({');
  assert.ok(bind > 0, 'js/main.js binds the board art hand-off');
  assert.ok(bind < main.indexOf('THEME.start('), 'before start-up, so start-up\'s module is handed over');
});

// ---------------------------------------------------------------- minimum tile size

test('MIN_TILE_SIZE is the shared floor, 26 px (decision 10 of docs/UX_REVIEW.md)', async () => {
  const { MIN_TILE_SIZE } = await skinModule();
  assert.ok(Number.isInteger(MIN_TILE_SIZE) && MIN_TILE_SIZE > 0);
  assert.equal(MIN_TILE_SIZE, 26);
});

test('the tile skin is DOM-free at import and holds no palette of its own', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/tile-skin.js'), 'utf8');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no literal colours');
  assert.doesNotMatch(src, /rgba?\(/, 'no literal translucent colours');
  assert.doesNotMatch(src, /--color-|\btoken\(/, 'no token read: every colour is the board module\'s');
  assert.doesNotMatch(src, /^(?!\s*\/\/).*\bthree\b/im, 'independent of three.js');
});

test('the tile skin, the board view and the replay 2D viewer never import a theme or read a stylesheet', () => {
  for (const file of ['js/classic2d/tile-skin.js', 'js/classic2d/board-view.js', 'js/replay/viewer-2d.js']) {
    const src = readFileSync(join(ROOT, file), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    const imports = [...src.matchAll(/\bimport\b[^;]*?from\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);
    for (const path of imports) assert.doesNotMatch(path, /(^|\/)themes\//, `${file} imports ${path}`);
    assert.doesNotMatch(src, /getComputedStyle|styleSheets|cssRules|getPropertyValue|data-theme|\.css['"]/, `${file} reads no stylesheet`);
  }
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

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

// An Expert board (30 × 16) in the Classic 2D window at the narrowest desktop width, in its framed
// panel: the panel's 1px border and 8px inside it on every side of the board.
const EXPERT = { cols: 30, rows: 16 };
const NARROWEST = 1024;
const INSET = 9;

// Runs in the page: draws every state and number at `size` CSS pixels and `ratio` device pixels
// each, in one row, from the board module at `module` (handed over as theme `id`), and reports per
// tile how many device pixels carry one of its glyph's colours.
async function drawAllStates([size, ratio, id, module]) {
  const { createTileSkin, createBoardArt, TILE_STATES } = await import('/js/classic2d/tile-skin.js');
  const { BOARD } = await import(module);
  await document.fonts.load(`${BOARD.font.weight} 1em "${BOARD.font.family}"`);
  const art = createBoardArt();
  art.set(id, BOARD);
  const tiles = [];
  for (const s of TILE_STATES) if (s !== 'revealed') tiles.push([s, 0]);
  for (let n = 0; n <= 8; n++) tiles.push(['revealed', n]);
  const { flag, mine, cross } = BOARD.palette;
  const glyph = {
    flagged: [flag.cloth, flag.clothShade, flag.base],
    mine: [mine.body],
    exploded: [mine.body],
    'wrong-flag': [cross.mark, flag.cloth, flag.clothShade],
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
  ctx.fillStyle = BOARD.palette.boardGround;
  ctx.fillRect(0, 0, width, height);
  const skin = createTileSkin({ art, redraw: () => {} });
  tiles.forEach(([s, n], i) => skin.drawTile(ctx, gap + i * (size + gap), gap, size, s, n, ratio));
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.trim().slice(i, i + 2), 16));
  const out = tiles.map(([s, n], i) => {
    const wanted = (s === 'revealed' ? (n ? [BOARD.numbers[n]] : []) : (glyph[s] ?? [])).map(parse);
    const data = ctx.getImageData((gap + i * (size + gap)) * ratio, gap * ratio, size * ratio, size * ratio).data;
    let hits = 0;
    for (let p = 0; p < data.length; p += 4) {
      if (wanted.some(([r, g, b]) => Math.abs(data[p] - r) + Math.abs(data[p + 1] - g) + Math.abs(data[p + 2] - b) < 40)) hits++;
    }
    return { state: s, number: n, glyph: wanted.length > 0, hits };
  });
  skin.dispose();
  return out;
}

// The largest whole tile at which `n` tiles and the gaps between them fit `room`, with a module's gap.
const span = (n, tile, gap) => n * tile + (n - 1) * Math.round(tile * gap);
const fitWith = (n, room, gap) => {
  let tile = Math.floor(room / n);
  while (tile > 1 && span(n, tile, gap) > room) tile--;
  return tile;
};

test('in a browser, Expert at 1024 px wide keeps the fit rule on the tile and gap in the game window\'s board area, never below MIN_TILE_SIZE, and every state of every board module is legible at 48 px, 26 px and at it, at pixel ratios 1 and 2', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const { MIN_TILE_SIZE } = await skinModule();
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-tile-skin-'));
  try {
    const page = await browser.newPage({ viewport: { width: NARROWEST, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.evaluate(() => globalThis.__ms.modes.start('classic-2d', { size: 'expert', noGuess: false }));
    await page.waitForFunction(() => globalThis.__ms.board2D?.layout);
    // The fit rule in the board area the window's chrome leaves: the largest whole tile, never below the floor.
    for (const height of [768, 1100]) {
      await page.setViewportSize({ width: NARROWEST, height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const { area, layout } = await page.evaluate(() => {
        const r = document.getElementById('c2d-board').getBoundingClientRect();
        return { area: { width: r.width, height: r.height }, layout: { ...globalThis.__ms.board2D.layout } };
      });
      assert.ok(area.width > 0 && area.height > 0, 'the board area is measured');
      const gap = JOYFUL.style2d.params.gap;
      const fit = Math.min(fitWith(EXPERT.cols, area.width - 2 * INSET, gap), fitWith(EXPERT.rows, area.height - 2 * INSET, gap));
      assert.equal(layout.tile, Math.max(MIN_TILE_SIZE, Math.min(48, fit)), `1024 × ${height}: the fit rule's tile`);
      assert.equal(layout.scrolls, fit < MIN_TILE_SIZE, `1024 × ${height}: Expert scrolls only below the floor`);
    }
    await page.goto(`${base}/dev/components.html`);

    const modules = { 'joyful-tiles': '/themes/joyful-tiles/board.js', 'fixture-dusk': '/tests/fixtures/themes/fixture-dusk/board.js' };
    for (const [theme, module] of Object.entries(modules)) {
      for (const size of [...new Set([48, 26, MIN_TILE_SIZE])]) {
        for (const ratio of [1, 2]) {
          const tiles = await page.evaluate(drawAllStates, [size, ratio, theme, module]);
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
    rmSync(shots, { recursive: true, force: true });
  }
});
