import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSuite } from './helpers/browser.mjs';

const suite = browserSuite({ args: [], pages: { '/tile-art-blank.html': '<!doctype html><meta charset="utf-8"><title>tile art</title><body></body>' } });

const artModule = () => import('../js/tile-art.js');

// ---------- a fake Canvas 2D context: records every call with the fill style in force ----------
function fakeContext() {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '', textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt' };
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
  };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in special) return special[prop];
      if (prop in target) return target[prop];
      return (...args) => calls.push({ op: prop, args, fill: target.fillStyle, stroke: target.strokeStyle });
    },
    set(target, prop, value) {
      target[prop] = value;
      calls.push({ op: `set:${String(prop)}`, args: [value] });
      return true;
    },
  });
}
const styleColours = (style) => (style && typeof style === 'object' ? style.stops : [style]);
const trace = (ctx) => ctx.calls.map((c) => [c.op, JSON.stringify(c.args), styleColours(c.fill).join()].join('|'));
const fills = (ctx) => ctx.calls.filter((c) => c.op === 'fill' || c.op === 'fillRect');
// Each filled path: its fill style and the points of the path before it.
function paths(ctx) {
  const out = [];
  let points = [];
  for (const c of ctx.calls) {
    if (c.op === 'beginPath') points = [];
    else if (c.op === 'moveTo' || c.op === 'lineTo') points.push(c.args);
    else if (c.op === 'fill') out.push({ fill: c.fill, points });
  }
  return out;
}

// Palettes in the shape the callers pass.
const CLOSED = { rim: '#21407a', bevelLight: '#9cc4ff', bevelDark: '#2b5cb8', face: '#6fa3f7', faceShade: '#3f78e0', gloss: 'rgba(255,255,255,0.35)', glossFade: 'rgba(255,255,255,0)' };
const SUNK = { rim: '#21407a', bevelLight: '#9cc4ff', bevelDark: '#2b5cb8', face: '#c9dbf7' };
const REVEALED = { rim: '#8f9bb0', edge: '#c4cfdd', face: '#eef3fa', faceShade: '#e0e4ea' };
const PALETTES = { closed: CLOSED, sunk: SUNK, revealed: REVEALED };

// ---------- the drawing the tiles had before the recipe grew styles, kept verbatim as the reference ----------
const legacySnap = (v, px) => (px ? Math.max(px, Math.round(v / px) * px) : v);
function legacyBands(size, px) {
  const rim = legacySnap(size / 64, px);
  const bevel = legacySnap(size * 0.075, px);
  const edge = px ? Math.max(rim + px, legacySnap(size * (3 / 64), px)) : size * (3 / 64);
  return { rim, bevel, edge };
}
function legacyRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function legacyBevelled(ctx, S, r, b, rim, topLeft, bottomRight) {
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = topLeft;
  ctx.beginPath(); ctx.moveTo(r, r); ctx.lineTo(S - r, r); ctx.lineTo(S - r - b, r + b); ctx.lineTo(r + b, r + b); ctx.lineTo(r + b, S - r - b); ctx.lineTo(r, S - r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = bottomRight;
  ctx.beginPath(); ctx.moveTo(S - r, S - r); ctx.lineTo(r, S - r); ctx.lineTo(r + b, S - r - b); ctx.lineTo(S - r - b, S - r - b); ctx.lineTo(S - r - b, r + b); ctx.lineTo(S - r, r); ctx.closePath(); ctx.fill();
}
const LEGACY = {
  closed(ctx, S, p, px) {
    const { rim: r, bevel: b } = legacyBands(S, px);
    legacyBevelled(ctx, S, r, b, p.rim, p.bevelLight, p.bevelDark);
    const g = ctx.createLinearGradient(0, r + b, 0, S - r - b);
    g.addColorStop(0, p.face);
    g.addColorStop(1, p.faceShade);
    ctx.fillStyle = g;
    ctx.fillRect(r + b, r + b, S - 2 * r - 2 * b, S - 2 * r - 2 * b);
    const o = S * (3 / 128);
    const gl = ctx.createLinearGradient(0, r + b, 0, S * 0.55);
    gl.addColorStop(0, p.gloss);
    gl.addColorStop(1, p.glossFade);
    ctx.fillStyle = gl;
    legacyRoundRect(ctx, r + b + o, r + b + o, S - 2 * r - 2 * b - 2 * o, S * 0.32, S * (7 / 128));
    ctx.fill();
  },
  sunk(ctx, S, p, px) {
    const { rim: r, bevel: b } = legacyBands(S, px);
    legacyBevelled(ctx, S, r, b, p.rim, p.bevelDark, p.bevelLight);
    ctx.fillStyle = p.face;
    ctx.fillRect(r + b, r + b, S - 2 * r - 2 * b, S - 2 * r - 2 * b);
  },
  revealed(ctx, S, p, px) {
    const { rim: r, edge: e } = legacyBands(S, px);
    ctx.fillStyle = p.rim;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.edge;
    ctx.fillRect(r, r, S - 2 * r, S - 2 * r);
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, p.face);
    g.addColorStop(1, p.faceShade);
    ctx.fillStyle = g;
    ctx.fillRect(e, e, S - 2 * e, S - 2 * e);
  },
};

const SIZES = [26, 32, 48, 256];
const PXS = [undefined, 1, 0.5];

// ---------------------------------------------------------------- the style table and the entry point

test('the recipe exports a style table, bevel first, and one draw entry point for every face', async () => {
  const art = await artModule();
  assert.deepEqual(Object.keys(art.STYLES), ['bevel', 'flat'], 'bevel is the first shipped style, then flat');
  assert.deepEqual([...art.FACES], ['closed', 'sunk', 'revealed']);
  assert.equal(typeof art.drawFace, 'function');
  for (const [name, style] of Object.entries(art.STYLES)) {
    assert.ok(Object.isFrozen(style.params), `${name}: its parameters are frozen`);
    for (const face of art.FACES) assert.equal(typeof style[face], 'function', `${name} draws the ${face} face`);
  }
  assert.deepEqual(Object.keys(art.STYLES.bevel.params).sort(), ['edge', 'radius', 'revealedEdge', 'sides', 'slope']);
  assert.deepEqual(Object.keys(art.STYLES.bevel.params.sides).sort(), ['bottom', 'left', 'right', 'top']);
  assert.deepEqual(Object.keys(art.STYLES.flat.params).sort(), ['band', 'edge', 'hairline', 'radius']);
});

test('mix blends two hex colours, exactly the first at 0 and the second at 1', async () => {
  const { mix } = await artModule();
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#102030', '#305070', 0.25), '#182c40');
});

// ---------------------------------------------------------------- bevel

test('bevel with its own parameters draws exactly the cube face the tiles had: closed at depth 1, sunk and revealed', async () => {
  const art = await artModule();
  for (const S of SIZES) {
    for (const px of PXS) {
      for (const face of art.FACES) {
        const ours = fakeContext();
        art.drawFace(ours, S, face, { style: 'bevel', params: art.STYLES.bevel.params, palette: PALETTES[face], depth: 1, px });
        const before = fakeContext();
        LEGACY[face](before, S, PALETTES[face], px);
        assert.deepEqual(trace(ours), trace(before), `${S}px, px ${px}: the ${face} face is unchanged`);
      }
    }
  }
  // The named face functions the callers used stay the bevel at depth 1.
  for (const [fn, face] of [['drawRaisedFace', 'closed'], ['drawSunkenFace', 'sunk'], ['drawRevealedFace', 'revealed']]) {
    const named = fakeContext();
    art[fn](named, 40, PALETTES[face], 0.5);
    const before = fakeContext();
    LEGACY[face](before, 40, PALETTES[face], 0.5);
    assert.deepEqual(trace(named), trace(before), `${fn} is the bevel ${face} face`);
  }
  // Defaults: no style, no parameters and no depth draw the same.
  const bare = fakeContext();
  art.drawFace(bare, 64, 'closed', { palette: CLOSED });
  const before = fakeContext();
  LEGACY.closed(before, 64, CLOSED);
  assert.deepEqual(trace(bare), trace(before));
});

test('bevel lights each of its four sides with its own shade', async () => {
  const art = await artModule();
  const S = 64;
  const sides = { top: 1, right: -0.5, bottom: -1, left: 0.5 };
  for (const [face, sign] of [['closed', 1], ['sunk', -1]]) {
    const p = PALETTES[face];
    const ctx = fakeContext();
    art.drawFace(ctx, S, face, { style: 'bevel', params: { ...art.STYLES.bevel.params, sides }, palette: p, depth: 1, px: 1 });
    const shadeOf = (s) => {
      const v = s * sign;
      if (v >= 1) return p.bevelLight;
      if (v <= -1) return p.bevelDark;
      return art.mix(p.face, v > 0 ? p.bevelLight : p.bevelDark, Math.abs(v));
    };
    const slopes = paths(ctx).slice(0, 4);
    assert.deepEqual(slopes.map((s) => s.fill), ['top', 'right', 'bottom', 'left'].map((k) => shadeOf(sides[k])), `${face}: top, right, bottom and left in their own shades`);
    const { rim: r } = art.tileBands(S, 1);
    const b = Math.round(S * art.STYLES.bevel.params.slope);
    const inside = {
      top: ([, y]) => y <= r + b,
      right: ([x]) => x >= S - r - b,
      bottom: ([, y]) => y >= S - r - b,
      left: ([x]) => x <= r + b,
    };
    ['top', 'right', 'bottom', 'left'].forEach((side, i) => {
      assert.ok(slopes[i].points.length >= 4 && slopes[i].points.every(inside[side]), `${face}: the ${side} slope lies along the ${side} edge`);
    });
  }
  // Four equal shades are one ring under the face.
  const ring = fakeContext();
  art.drawFace(ring, S, 'closed', { style: 'bevel', params: { sides: { top: 1, right: 1, bottom: 1, left: 1 } }, palette: CLOSED });
  assert.ok(fills(ring).some((c) => c.fill === CLOSED.bevelLight), 'the ring is drawn in its shade');
  assert.ok(!fills(ring).some((c) => c.fill === CLOSED.bevelDark), 'no side is dark');
});

test('bevel raises closed faces by depth, from flat at 0 to fully raised at 1; revealed faces take no slope at any depth', async () => {
  const art = await artModule();
  const S = 64;
  const faceInset = (ctx) => fills(ctx).find((c) => c.op === 'fillRect' && c.args[0] > 0).args[0];
  const slopeFills = (ctx) => fills(ctx).filter((c) => c.op === 'fill' && [CLOSED.bevelLight, CLOSED.bevelDark].includes(c.fill));
  const draw = (face, depth) => {
    const ctx = fakeContext();
    art.drawFace(ctx, S, face, { style: 'bevel', palette: PALETTES[face], depth, px: 1 });
    return ctx;
  };
  const { rim } = art.tileBands(S, 1);
  for (const face of ['closed', 'sunk']) {
    const flat = draw(face, 0);
    assert.equal(slopeFills(flat).length, 0, `${face} at depth 0 has no slope`);
    assert.equal(faceInset(flat), rim, `${face} at depth 0: the face meets the edge`);
    const half = draw(face, 0.5);
    const full = draw(face, 1);
    assert.equal(slopeFills(half).length, 2, `${face} at depth 0.5 has its slope`);
    assert.ok(faceInset(half) > rim && faceInset(half) < faceInset(full), `${face}: the slope narrows with depth (${faceInset(half)} between ${rim} and ${faceInset(full)})`);
    assert.deepEqual(trace(draw(face, 7)), trace(full), `${face}: depth above 1 is fully raised`);
    assert.deepEqual(trace(draw(face, -1)), trace(flat), `${face}: depth below 0 is flat`);
  }
  for (const depth of [0, 0.3, 1]) {
    const revealed = draw('revealed', depth);
    assert.deepEqual(trace(revealed), trace(draw('revealed', 1)), `revealed at depth ${depth} is unchanged`);
    assert.ok(!fills(revealed).some((c) => [CLOSED.bevelLight, CLOSED.bevelDark].includes(c.fill)), 'no slope on a revealed face');
  }
});

test('a corner radius clips either style to a rounded tile that scales with its size', async () => {
  const art = await artModule();
  for (const style of ['bevel', 'flat']) {
    for (const S of [26, 48, 96]) {
      for (const face of art.FACES) {
        const ctx = fakeContext();
        art.drawFace(ctx, S, face, { style, params: { radius: 0.2 }, palette: PALETTES[face], depth: 1, px: 1 });
        const clip = ctx.calls.findIndex((c) => c.op === 'clip');
        assert.ok(clip >= 0, `${style} ${face} at ${S}px is clipped`);
        const arcs = ctx.calls.slice(0, clip).filter((c) => c.op === 'arcTo');
        assert.equal(arcs.length, 4, `${style} ${face}: four rounded corners`);
        assert.ok(arcs.every((c) => c.args[4] === S * 0.2), `${style} ${face} at ${S}px: the radius is a fifth of the tile`);
        assert.ok(clip < ctx.calls.findIndex((c) => c.op === 'fill' || c.op === 'fillRect'), `${style} ${face}: the clip comes before any paint`);
        assert.equal(ctx.calls.at(-1).op, 'restore', `${style} ${face}: the clip ends with the face`);
      }
    }
    const square = fakeContext();
    art.drawFace(square, 48, 'closed', { style, params: { radius: 0 }, palette: CLOSED, px: 1 });
    assert.ok(!square.calls.some((c) => c.op === 'clip'), `${style}: radius 0 is a square tile, unclipped`);
  }
});

// ---------------------------------------------------------------- flat

test('flat draws the closed face with a light top band and a dark bottom edge, the revealed face flush inside a hairline', async () => {
  const art = await artModule();
  const params = art.STYLES.flat.params;
  for (const S of SIZES) {
    for (const px of [1, 0.5]) {
      const closed = fakeContext();
      art.drawFace(closed, S, 'closed', { style: 'flat', palette: CLOSED, px });
      const cf = fills(closed);
      assert.equal(cf[0].fill, CLOSED.face, `${S}px: the closed face first`);
      const band = cf.find((c) => c.fill === CLOSED.bevelLight);
      const edge = cf.find((c) => c.fill === CLOSED.bevelDark);
      assert.ok(band && edge, `${S}px: a top band and a bottom edge`);
      assert.deepEqual(band.args.slice(0, 2), [0, 0], `${S}px: the band runs along the top`);
      assert.ok(band.args[3] >= px && Math.abs(band.args[3] - S * params.band) <= px, `${S}px: the band is ${params.band} of the tile, at least a device pixel`);
      assert.equal(edge.args[1] + edge.args[3], S, `${S}px: the edge sits on the bottom`);
      assert.ok(edge.args[3] >= px && Math.abs(edge.args[3] - S * params.edge) <= px, `${S}px: the edge is ${params.edge} of the tile`);

      const revealed = fakeContext();
      art.drawFace(revealed, S, 'revealed', { style: 'flat', palette: REVEALED, px });
      const rf = fills(revealed);
      assert.deepEqual(rf.map((c) => c.fill), [REVEALED.rim, REVEALED.face], `${S}px: the hairline, then the face flush inside it`);
      const inset = revealed.calls.filter((c) => c.op === 'moveTo').at(-1).args[1];
      assert.ok(inset >= px && Math.abs(inset - S * params.hairline) <= px, `${S}px: the hairline is ${params.hairline} of the tile, at least a device pixel`);
      // Closed and revealed differ by more than colour: the closed face carries bands, the revealed a border.
      assert.ok(!rf.some((c) => [CLOSED.bevelLight, CLOSED.bevelDark].includes(c.fill)), `${S}px: no bands on the revealed face`);
      assert.notDeepEqual(closed.calls.map((c) => c.op), revealed.calls.map((c) => c.op), `${S}px: closed and revealed are drawn differently, not just recoloured`);
    }
  }
  const sunk = fakeContext();
  art.drawFace(sunk, 48, 'sunk', { style: 'flat', palette: SUNK, px: 1 });
  assert.equal(fills(sunk)[0].fill, SUNK.face, 'the sunk face is the pressed colour');
  assert.ok(!fills(sunk).some((c) => c.fill === SUNK.bevelLight), 'a sunk face carries no light band');
});

test('flat ignores depth: every depth draws the same face', async () => {
  const art = await artModule();
  for (const face of art.FACES) {
    for (const radius of [0, 0.15]) {
      const at = (depth) => {
        const ctx = fakeContext();
        art.drawFace(ctx, 40, face, { style: 'flat', params: { radius }, palette: PALETTES[face], depth, px: 1 });
        return trace(ctx);
      };
      assert.deepEqual(at(0), at(1), `flat ${face}, radius ${radius}: depth 0 is depth 1`);
      assert.deepEqual(at(0.4), at(1), `flat ${face}, radius ${radius}: depth 0.4 is depth 1`);
    }
  }
});

// ---------------------------------------------------------------- unknown style

test('an unknown style draws the first shipped style and reports the error once', async (t) => {
  const art = await artModule();
  const logged = [];
  t.mock.method(console, 'error', (...args) => logged.push(args.join(' ')));
  for (const face of art.FACES) {
    const ours = fakeContext();
    art.drawFace(ours, 48, face, { style: 'sparkle', params: { band: 0.5, radius: 0.3 }, palette: PALETTES[face], depth: 1, px: 1 });
    const first = fakeContext();
    art.drawFace(first, 48, face, { style: 'bevel', palette: PALETTES[face], depth: 1, px: 1 });
    assert.deepEqual(trace(ours), trace(first), `sparkle ${face} is drawn as bevel with its own parameters`);
  }
  assert.equal(logged.length, 1, 'the unknown style is reported once');
  assert.match(logged[0], /sparkle/);
  art.drawFace(fakeContext(), 48, 'closed', { style: 'glitter', palette: CLOSED });
  assert.equal(logged.length, 2, 'another unknown style is reported in its turn');
});

// ---------------------------------------------------------------- browser: legibility at the minimum tile size

// Runs in the page: draws every tile state in `style` at `size` CSS pixels and
// `ratio` device pixels and reports, per tile, the device pixels carrying its
// glyph's colour and a digest of its face.
async function sampleStates([style, size, ratio, palette]) {
  const art = await import('/js/tile-art.js');
  const states = [
    ['closed', 'closed', null], ['sunk', 'sunk', null], ['revealed', 'revealed', null],
    ['flag', 'closed', 'flag'], ['mine', 'revealed', 'mine'], ['exploded', 'exploded', 'mine'], ['wrong-flag', 'revealed', 'wrong-flag'],
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`number-${n}`, 'revealed', n]),
  ];
  const canvas = document.createElement('canvas');
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return states.map(([name, face, glyph]) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const faceName = face === 'exploded' ? 'revealed' : face;
    art.drawFace(ctx, size, faceName, { style, palette: palette[face], depth: 1, px: 1 / ratio });
    let wanted = [];
    if (glyph === 'flag') { art.drawFlagGlyph(ctx, size, palette.flag); wanted = [palette.flag.cloth, palette.flag.clothShade, palette.flag.base]; }
    if (glyph === 'mine') { art.drawMineGlyph(ctx, size, palette.mine); wanted = [palette.mine.body]; }
    if (glyph === 'wrong-flag') { art.drawFlagGlyph(ctx, size, palette.flag); art.drawCross(ctx, size, palette.cross); wanted = [palette.cross.mark]; }
    if (typeof glyph === 'number') { art.drawNumberGlyph(ctx, size, glyph, { color: palette.numbers[glyph - 1], shadow: palette.numberShadow }); wanted = [palette.numbers[glyph - 1]]; }
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rgb = wanted.map(parse);
    let hits = 0;
    let sum = 0;
    for (let p = 0; p < data.length; p += 4) {
      sum = (sum * 31 + data[p] + data[p + 1] * 7 + data[p + 2] * 13) % 1000000007;
      if (rgb.some(([r, g, b]) => Math.abs(data[p] - r) + Math.abs(data[p + 1] - g) + Math.abs(data[p + 2] - b) < 40)) hits++;
    }
    return { name, glyph: glyph !== null, hits, digest: sum };
  });
}

const LEGIBILITY_PALETTE = {
  ground: '#5a6478',
  closed: CLOSED,
  sunk: SUNK,
  revealed: REVEALED,
  exploded: { rim: '#8f9bb0', edge: '#b3261e', face: '#ff5a4f', faceShade: '#f0554a' },
  flag: { base: '#1b1b1b', shadow: 'rgba(0,0,0,0.25)', cloth: '#ff3b30', clothShade: '#c4161c' },
  mine: { body: '#1b1b1b', highlight: 'rgba(255,255,255,0.85)' },
  cross: { outline: 'rgba(255,255,255,0.95)', mark: '#d50000' },
  numbers: ['#1565c0', '#2e7d32', '#d32f2f', '#1a237e', '#8d1c1c', '#00838f', '#212121', '#5c5c5c'],
  numberShadow: 'rgba(0,0,0,0.12)',
};

test('in a browser, every face and glyph of both styles stays legible at MIN_TILE_SIZE, at pixel ratios 1 and 2', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const { MIN_TILE_SIZE } = await import('../js/classic2d/tile-skin.js');
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/tile-art-blank.html`);
    for (const style of ['bevel', 'flat']) {
      for (const ratio of [1, 2]) {
        const tiles = await page.evaluate(sampleStates, [style, MIN_TILE_SIZE, ratio, LEGIBILITY_PALETTE]);
        const area = MIN_TILE_SIZE * MIN_TILE_SIZE * ratio * ratio;
        for (const tile of tiles.filter((x) => x.glyph)) {
          assert.ok(tile.hits >= area * 0.04, `${style} x${ratio}: the ${tile.name} glyph shows (${tile.hits} device px of ${area})`);
        }
        const faces = Object.fromEntries(tiles.filter((x) => !x.glyph).map((x) => [x.name, x.digest]));
        assert.equal(new Set(Object.values(faces)).size, 3, `${style} x${ratio}: closed, sunk and revealed faces are told apart`);
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
