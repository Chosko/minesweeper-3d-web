import { test } from 'node:test';
import assert from 'node:assert/strict';

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
  assert.deepEqual(Object.keys(art.STYLES.flat.params).sort(), ['band', 'border', 'edge', 'hairline', 'press', 'radius']);
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

test('a bevel side may be a colour: the closed face draws it exactly, the sunk face turns it over through the face', async () => {
  const art = await artModule();
  const S = 64;
  const p = PALETTES.closed;
  const sides = { top: 1, right: '#5e92ec', bottom: -1, left: 0 };
  const closed = fakeContext();
  art.drawFace(closed, S, 'closed', { style: 'bevel', params: { ...art.STYLES.bevel.params, sides }, palette: p, depth: 1, px: 1 });
  assert.equal(paths(closed).slice(0, 4)[1].fill, '#5e92ec', 'the right slope in its own colour');
  const sunk = fakeContext();
  art.drawFace(sunk, S, 'sunk', { style: 'bevel', params: { ...art.STYLES.bevel.params, sides }, palette: PALETTES.sunk, depth: 1, px: 1 });
  assert.equal(paths(sunk).slice(0, 4)[1].fill, art.mix(PALETTES.sunk.face, '#5e92ec', -1), 'the sunk face mirrors it through its own face');
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

test('flat draws the closed face with a light top band and a dark bottom edge, the revealed face flush inside a hairline of constant width', async () => {
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
      assert.equal(inset, params.hairline, `${S}px at ${1 / px}x: the hairline is ${params.hairline} drawing unit (one CSS px) at every tile size`);
      // Closed and revealed differ by more than colour: the closed face carries bands, the revealed a border.
      assert.ok(!rf.some((c) => [CLOSED.bevelLight, CLOSED.bevelDark].includes(c.fill)), `${S}px: no bands on the revealed face`);
      assert.notDeepEqual(closed.calls.map((c) => c.op), revealed.calls.map((c) => c.op), `${S}px: closed and revealed are drawn differently, not just recoloured`);
    }
  }
  for (const S of SIZES) {
    const sunk = fakeContext();
    art.drawFace(sunk, S, 'sunk', { style: 'flat', palette: SUNK, px: 1 });
    assert.equal(fills(sunk)[0].fill, SUNK.face, `${S}px: the sunk face is the pressed colour`);
    assert.ok(!fills(sunk).some((c) => c.fill === SUNK.bevelLight), `${S}px: a sunk face carries no light band`);
    const shade = fills(sunk).find((c) => c.fill === SUNK.bevelDark);
    assert.deepEqual(shade.args.slice(0, 3), [0, 0, S], `${S}px: the pressed shade runs along the top`);
    assert.ok(Math.abs(shade.args[3] - S * params.press) <= 0.5, `${S}px: the pressed shade is ${params.press} of the tile, not the closed face's band`);
  }
});

test('the exploded tile takes the style\'s border as its revealed face\'s hairline: flat\'s 2 px, bevel unchanged', async () => {
  const art = await artModule();
  const flat = art.STYLES.flat.params;
  assert.equal(flat.hairline, 1, 'the revealed hairline: one drawing unit');
  assert.equal(flat.border, 2, 'the exploded border: two');
  assert.deepEqual(art.explodedParams(flat), { ...flat, hairline: flat.border });
  for (const px of [1, 0.5]) {
    const ctx = fakeContext();
    art.drawFace(ctx, 26, 'revealed', { style: 'flat', params: art.explodedParams(flat), palette: REVEALED, px });
    assert.equal(ctx.calls.filter((c) => c.op === 'moveTo').at(-1).args[1], flat.border, `at ${1 / px}x: the face sits inside a 2 px border`);
  }
  const bevel = art.STYLES.bevel.params;
  assert.equal(art.explodedParams(bevel), bevel, 'a style with no border draws the exploded face as its revealed one');
  assert.equal(art.explodedParams(undefined), undefined);
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

// ---------------------------------------------------------------- glyphs

test('the mine: a round body, eight spikes each ending in a round knob, spanning three quarters of the tile, and its highlight', async () => {
  const art = await artModule();
  for (const S of [26, 48, 256]) {
    const ctx = fakeContext();
    art.drawMineGlyph(ctx, S, { body: '#16204a', highlight: '#ffffff' });
    const centre = ctx.calls.find((c) => c.op === 'translate').args;
    assert.deepEqual(centre, [S / 2, S / 2], `${S}px: centred on the tile`);
    const arcs = ctx.calls.filter((c) => c.op === 'arc');
    const knobs = arcs.filter((c) => Math.hypot(c.args[0], c.args[1]) > S * 0.25);
    assert.equal(knobs.length, 8, `${S}px: eight knobs`);
    assert.ok(knobs.every((c) => c.fill === '#16204a'), `${S}px: the knobs in the body colour`);
    const reach = Math.max(...knobs.map((c) => Math.hypot(c.args[0], c.args[1]) + c.args[2]));
    assert.ok(Math.abs(2 * reach / S - 0.75) < 0.01, `${S}px: knob to knob, the mine spans 0.75 of the tile (${(2 * reach / S).toFixed(3)})`);
    // The atlas's 256 px tile: the glyph's box runs from 31 to 224.
    if (S === 256) assert.ok(Math.abs(S / 2 - reach - 31) <= 1 && Math.abs(S / 2 + reach - 224) <= 1.5, `256px: the box is 31-224 (${S / 2 - reach}-${S / 2 + reach})`);
    const strokes = ctx.calls.filter((c) => c.op === 'stroke');
    assert.equal(strokes.length, 8, `${S}px: eight spikes`);
    const highlight = arcs.filter((c) => c.fill === '#ffffff');
    assert.equal(highlight.length, 1, `${S}px: one highlight in its colour`);
  }
});

test('the wrong-flag cross: two butt-ended strokes in the cross colour about 0.057 of the tile wide over an outline about 0.10 wide', async () => {
  const art = await artModule();
  for (const S of [26, 48, 256]) {
    const ctx = fakeContext();
    art.drawCross(ctx, S, { outline: '#ffffff', mark: '#c62f2f' });
    const widths = ctx.calls.filter((c) => c.op === 'set:lineWidth').map((c) => c.args[0] / S);
    assert.equal(widths.length, 2, `${S}px: an outline, then the mark`);
    assert.ok(Math.abs(widths[0] - 0.10) < 0.005, `${S}px: the outline is about 0.10 of the tile (${widths[0].toFixed(3)})`);
    assert.ok(Math.abs(widths[1] - 0.057) < 0.003, `${S}px: the mark is about 0.057 of the tile (${widths[1].toFixed(3)})`);
    assert.deepEqual(ctx.calls.filter((c) => c.op === 'stroke').map((c) => c.stroke), ['#ffffff', '#c62f2f'], `${S}px: the outline, then the mark in its own colour`);
    assert.deepEqual(ctx.calls.filter((c) => c.op === 'set:lineCap').map((c) => c.args[0]), ['butt'], `${S}px: butt ends`);
  }
});

test('a number of one or two digits is set at the same height, 0.68 of the tile; a wide one is narrowed to fit', async () => {
  const art = await artModule();
  for (const n of [1, 8, 10, 26]) {
    const ctx = fakeContext();
    art.drawNumberGlyph(ctx, 256, n, { color: '#135bad', shadow: 'rgba(0,0,0,0.12)' });
    assert.match(ctx.font, new RegExp(`^800 ${256 * 0.68}px `), `${n} at 0.68 of the tile`);
  }
  const measured = fakeContext();
  art.drawNumberGlyph(measured, 20, 26, { color: '#135bad', shadow: 'rgba(0,0,0,0.12)' });
  const squeeze = measured.calls.find((c) => c.op === 'scale');
  assert.ok(squeeze.args[0] < 1, 'a glyph wider than the tile allows is narrowed');
});

test('the start-cell ring: a dashed circle inside the tile, its edge 0.22 of the tile in, in the colour and width given', async () => {
  const art = await artModule();
  for (const [S, width] of [[26, 2], [48, 2], [48, 4]]) {
    const ctx = fakeContext();
    art.drawMarkRing(ctx, S, { color: '#16204a', width });
    const arc = ctx.calls.find((c) => c.op === 'arc');
    assert.deepEqual(arc.args.slice(0, 2), [S / 2, S / 2], `${S}px: centred on the tile`);
    assert.ok(Math.abs(arc.args[2] + width / 2 - S * (0.5 - 0.22)) < 1e-9, `${S}px: the ring's outer edge is 0.22 of the tile in`);
    assert.ok(ctx.calls.find((c) => c.op === 'setLineDash').args[0].length >= 2, `${S}px: dashed`);
    assert.equal(ctx.calls.find((c) => c.op === 'stroke').stroke, '#16204a');
    assert.ok(ctx.calls.some((c) => c.op === 'set:lineWidth' && c.args[0] === width), `${S}px: ${width} wide`);
    assert.equal(ctx.calls.at(-1).op, 'restore', `${S}px: the dash ends with the ring`);
  }  for (const S of [1, 2, 3]) {
    const tiny = fakeContext();
    art.drawMarkRing(tiny, S, { color: '#16204a' });
    assert.ok(tiny.calls.find((c) => c.op === 'arc').args[2] >= 0, `${S}px: a tile too small for the ring draws no negative radius`);
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

// ---------------------------------------------------------------- outlines

const SQRT3 = Math.sqrt(3);
const SHAPED = ['hexagon', 'triangle-up', 'triangle-down'];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
// Whether a point lies inside or on a convex polygon, within eps.
function insidePolygon(points, [x, y], eps = 1e-6) {
  const n = points.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const cross = ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0)) / len;
    if (Math.abs(cross) <= eps) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}
// Whether a point lies inside any polygon, convex or not (ray casting).
function containsPoint(points, [x, y]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const centroidOf = (points) => [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];

test('the recipe names its outlines, square first, and gives each its box and corners at a tile size', async () => {
  const art = await artModule();
  assert.deepEqual([...art.OUTLINES], ['square', 'hexagon', 'triangle-up', 'triangle-down']);
  assert.ok(Object.isFrozen(art.OUTLINES));
  for (const S of [26, 60]) {
    assert.deepEqual(art.outlineBox('square', S), { width: S, height: S });
    assert.deepEqual(art.outlinePoints('square', S), [[0, 0], [S, 0], [S, S], [0, S]]);
    // A hexagon's size is across the flats, flat side up, as the geometry measures it.
    const hex = art.outlineBox('hexagon', S);
    assert.ok(near(hex.width, 2 * S / SQRT3) && hex.height === S, `${S}px: a hexagon's box is two sides wide and the size tall`);
    const hp = art.outlinePoints('hexagon', S);
    assert.equal(hp.length, 6);
    assert.ok(hp.every(([x, y]) => x >= -1e-9 && x <= hex.width + 1e-9 && y >= 0 && y <= S), `${S}px: the corners sit in the box`);
    assert.equal(hp.filter(([, y]) => y === 0).length, 2, `${S}px: a flat side on top`);
    assert.equal(hp.filter(([, y]) => y === S).length, 2, `${S}px: and one at the bottom`);
    // A triangle's size is its side; up has its apex on top, down at the bottom.
    for (const [outline, apexY, baseY] of [['triangle-up', 0, 1], ['triangle-down', 1, 0]]) {
      const box = art.outlineBox(outline, S);
      assert.ok(box.width === S && near(box.height, S * SQRT3 / 2), `${S}px: ${outline}'s box is a side wide and its height tall`);
      const tp = art.outlinePoints(outline, S);
      assert.equal(tp.length, 3);
      assert.ok(tp.some(([x, y]) => near(x, S / 2) && near(y, apexY * box.height)), `${S}px: ${outline}'s apex`);
      assert.equal(tp.filter(([, y]) => near(y, baseY * box.height)).length, 2, `${S}px: ${outline}'s base`);
    }
  }
});

test('the square outline draws exactly the face drawn with no outline, in both styles, every face and depth', async () => {
  const art = await artModule();
  for (const style of ['bevel', 'flat']) {
    for (const S of SIZES) {
      for (const px of PXS) {
        for (const face of art.FACES) {
          for (const depth of [0, 0.5, 1]) {
            for (const radius of [0, 0.15]) {
              const opts = { style, params: { radius }, palette: PALETTES[face], depth, px };
              const bare = fakeContext();
              art.drawFace(bare, S, face, opts);
              const square = fakeContext();
              art.drawFace(square, S, face, { ...opts, outline: 'square' });
              assert.deepEqual(trace(square), trace(bare), `${style} ${face} ${S}px px ${px} depth ${depth} radius ${radius}`);
            }
          }
        }
      }
    }
  }
});

test('a hexagon or triangle face is clipped to its outline before any paint, and every shape it fills lies inside the outline', async () => {
  const art = await artModule();
  for (const outline of SHAPED) {
    for (const style of ['bevel', 'flat']) {
      for (const S of [26, 48, 120]) {
        const box = art.outlineBox(outline, S);
        const corners = art.outlinePoints(outline, S);
        for (const face of art.FACES) {
          for (const depth of [0, 0.5, 1]) {
            const label = `${outline} ${style} ${face} ${S}px depth ${depth}`;
            const ctx = fakeContext();
            art.drawFace(ctx, S, face, { style, params: { radius: 0 }, palette: PALETTES[face], depth, px: 1, outline });
            const clip = ctx.calls.findIndex((c) => c.op === 'clip');
            assert.ok(clip >= 0, `${label}: clipped`);
            assert.ok(clip < ctx.calls.findIndex((c) => c.op === 'fill' || c.op === 'fillRect'), `${label}: the clip comes before any paint`);
            const clipPath = ctx.calls.slice(0, clip).filter((c) => c.op === 'moveTo' || c.op === 'lineTo').map((c) => c.args);
            assert.equal(clipPath.length, corners.length, `${label}: the clip runs round every corner`);
            clipPath.forEach((p, i) => assert.ok(near(p[0], corners[i][0], 1e-6) && near(p[1], corners[i][1], 1e-6), `${label}: corner ${i} of the outline`));
            assert.equal(ctx.calls.at(-1).op, 'restore', `${label}: the clip ends with the face`);
            for (const { points } of paths(ctx)) {
              assert.ok(points.every((p) => insidePolygon(corners, p)), `${label}: a filled shape lies inside the outline`);
            }
            for (const c of ctx.calls.filter((k) => k.op === 'fillRect')) {
              const [x, y, w, h] = c.args;
              assert.ok(x >= -1e-9 && y >= -1e-9 && x + w <= box.width + 1e-9 && y + h <= box.height + 1e-9, `${label}: a band lies in the outline's box, under its clip`);
            }
          }
        }
      }
    }
  }
});

test('a radius rounds a hexagon\'s or triangle\'s corners, as a fraction of the tile\'s height', async () => {
  const art = await artModule();
  for (const outline of SHAPED) {
    for (const style of ['bevel', 'flat']) {
      const S = 60;
      const ctx = fakeContext();
      art.drawFace(ctx, S, 'closed', { style, params: { radius: 0.06 }, palette: CLOSED, px: 1, outline });
      const clip = ctx.calls.findIndex((c) => c.op === 'clip');
      const arcs = ctx.calls.slice(0, clip).filter((c) => c.op === 'arcTo');
      assert.equal(arcs.length, art.outlinePoints(outline, S).length, `${outline} ${style}: every corner rounded`);
      const h = art.outlineBox(outline, S).height;
      assert.ok(arcs.every((c) => near(c.args[4], h * 0.06)), `${outline} ${style}: the radius is 0.06 of the tile's height`);
    }
  }
});

test('flat in an outline: the closed face\'s light top band and dark bottom edge, the sunk face\'s pressed shade, the revealed face inside its hairline', async () => {
  const art = await artModule();
  const params = art.STYLES.flat.params;
  for (const outline of SHAPED) {
    for (const S of [26, 60]) {
      const { width: W, height: H } = art.outlineBox(outline, S);
      const corners = art.outlinePoints(outline, S);
      const closed = fakeContext();
      art.drawFace(closed, S, 'closed', { style: 'flat', palette: CLOSED, px: 1, outline });
      const cf = fills(closed);
      assert.equal(cf[0].fill, CLOSED.face, `${outline} ${S}px: the closed face first`);
      const band = cf.find((c) => c.fill === CLOSED.bevelLight);
      const edge = cf.find((c) => c.fill === CLOSED.bevelDark);
      assert.deepEqual(band.args.slice(0, 3), [0, 0, W], `${outline} ${S}px: the band runs along the top`);
      assert.ok(Math.abs(band.args[3] - H * params.band) <= 1, `${outline} ${S}px: the band is ${params.band} of the height`);
      assert.ok(near(edge.args[1] + edge.args[3], H), `${outline} ${S}px: the edge sits on the bottom`);
      const sunk = fakeContext();
      art.drawFace(sunk, S, 'sunk', { style: 'flat', palette: SUNK, px: 1, outline });
      assert.equal(fills(sunk)[0].fill, SUNK.face);
      assert.deepEqual(fills(sunk).find((c) => c.fill === SUNK.bevelDark).args.slice(0, 3), [0, 0, W], `${outline} ${S}px: the pressed shade along the top`);
      const revealed = fakeContext();
      art.drawFace(revealed, S, 'revealed', { style: 'flat', palette: REVEALED, px: 1, outline });
      assert.deepEqual(fills(revealed).map((c) => c.fill), [REVEALED.rim, REVEALED.face], `${outline} ${S}px: the hairline, then the face inside it`);
      const face = paths(revealed).at(-1).points;
      // Every corner of the face sits one hairline in from the outline's edges.
      for (const p of face) {
        const d = Math.min(...corners.map(([x0, y0], i) => {
          const [x1, y1] = corners[(i + 1) % corners.length];
          return Math.abs((x1 - x0) * (p[1] - y0) - (y1 - y0) * (p[0] - x0)) / Math.hypot(x1 - x0, y1 - y0);
        }));
        assert.ok(near(d, params.hairline, 1e-6), `${outline} ${S}px: the face is a hairline in (${d})`);
      }
    }
  }
});

test('flat in an outline ignores depth, and every colour it draws is the palette\'s', async () => {
  const art = await artModule();
  for (const outline of SHAPED) {
    for (const face of art.FACES) {
      const at = (depth) => {
        const ctx = fakeContext();
        art.drawFace(ctx, 40, face, { style: 'flat', palette: PALETTES[face], depth, px: 1, outline });
        return ctx;
      };
      assert.deepEqual(trace(at(0)), trace(at(1)), `${outline} ${face}: depth 0 is depth 1`);
      const palette = Object.values(PALETTES[face]);
      for (const c of fills(at(1))) for (const colour of styleColours(c.fill)) assert.ok(palette.includes(colour), `${outline} ${face}: ${colour} is a palette entry`);
    }
  }
});

test('a bevel\'s sloped sides follow the outline\'s edges, each shaded by the way it faces; a sunk face turns them over', async () => {
  const art = await artModule();
  const S = 60;
  for (const outline of SHAPED) {
    const corners = art.outlinePoints(outline, S);
    const centre = centroidOf(corners);
    // Each edge's outward normal.
    const normals = corners.map(([x0, y0], i) => {
      const [x1, y1] = corners[(i + 1) % corners.length];
      let n = [y1 - y0, x0 - x1];
      const len = Math.hypot(...n);
      n = [n[0] / len, n[1] / len];
      const mid = [(x0 + x1) / 2 - centre[0], (y0 + y1) / 2 - centre[1]];
      return n[0] * mid[0] + n[1] * mid[1] < 0 ? [-n[0], -n[1]] : n;
    });
    for (const [face, sign] of [['closed', 1], ['sunk', -1]]) {
      const p = PALETTES[face];
      const ctx = fakeContext();
      art.drawFace(ctx, S, face, { style: 'bevel', palette: p, depth: 1, px: 1, outline });
      const slopes = paths(ctx).filter((s) => s.points.length >= 4 && typeof s.fill === 'string' && s.fill !== p.rim && s.fill !== p.face);
      assert.ok(slopes.length >= 2, `${outline} ${face}: its slopes are drawn`);
      // Each edge's slope: the one holding the point halfway across its band, in from the edge's middle.
      const H = art.outlineBox(outline, S).height;
      const band = Math.round(H / 64) + Math.round(H * art.STYLES.bevel.params.slope) / 2;
      const shadeOfEdge = normals.map(([nx, ny], i) => {
        const [x0, y0] = corners[i];
        const [x1, y1] = corners[(i + 1) % corners.length];
        const probe = [(x0 + x1) / 2 - nx * band, (y0 + y1) / 2 - ny * band];
        return slopes.find((s) => containsPoint(s.points, probe))?.fill;
      });
      normals.forEach(([nx, ny], i) => {
        const fill = shadeOfEdge[i];
        assert.ok(fill, `${outline} ${face}: edge ${i} has a slope`);
        const lit = (ny < -0.99 || (nx < -0.8 && ny < 0)) ? 1 : (ny > 0.99 || (nx > 0.8 && ny > 0)) ? -1 : 0;
        if (lit * sign > 0) assert.equal(fill, p.bevelLight, `${outline} ${face}: edge ${i} faces the light`);
        if (lit * sign < 0) assert.equal(fill, p.bevelDark, `${outline} ${face}: edge ${i} faces away`);
        // A side facing up and right, or down and left, sits between the two shades.
        if (Math.abs(nx) > 0.5 && nx * ny < 0) {
          assert.ok(fill !== p.bevelLight && fill !== p.bevelDark, `${outline} ${face}: edge ${i}, facing (${nx.toFixed(2)}, ${ny.toFixed(2)}), is a shade between (${fill})`);
        }
      });
      // Every slope lies in a band along the outline, no deeper than the edge and the slope.
      const { rim } = art.tileBands(art.outlineBox(outline, S).height, 1);
      const depthIn = rim + Math.round(art.outlineBox(outline, S).height * art.STYLES.bevel.params.slope) + 1e-6;
      for (const s of slopes) {
        for (const pt of s.points) {
          const d = Math.min(...corners.map(([x0, y0], i) => {
            const [x1, y1] = corners[(i + 1) % corners.length];
            return Math.abs((x1 - x0) * (pt[1] - y0) - (y1 - y0) * (pt[0] - x0)) / Math.hypot(x1 - x0, y1 - y0);
          }));
          assert.ok(d <= depthIn, `${outline} ${face}: a slope point lies within the band (${d} <= ${depthIn})`);
        }
      }
    }
    // Depth 0: no slope at all.
    const flat = fakeContext();
    art.drawFace(flat, S, 'closed', { style: 'bevel', palette: CLOSED, depth: 0, px: 1, outline });
    assert.ok(!fills(flat).some((c) => [CLOSED.bevelLight, CLOSED.bevelDark].includes(c.fill)), `${outline}: depth 0 draws no slope`);
    // The revealed face takes no slope at any depth.
    for (const depth of [0, 0.4, 1]) {
      const revealed = fakeContext();
      art.drawFace(revealed, S, 'revealed', { style: 'bevel', palette: REVEALED, depth, px: 1, outline });
      assert.deepEqual(fills(revealed).map((c) => styleColours(c.fill).join()), [REVEALED.rim, REVEALED.edge, [REVEALED.face, REVEALED.faceShade].join()], `${outline}: revealed at depth ${depth} is the edge and the face`);
    }
  }
});

test('the recipe keeps no glyph box of its own: a tile\'s glyph box comes from its board\'s geometry', async () => {
  const art = await artModule();
  assert.equal('glyphBox' in art, false);
  assert.equal(typeof art.inGlyphBox, 'function');
});

test('every glyph draws in a given glyph box: at its corner, a square of its smaller side centred in it', async () => {
  const art = await artModule();
  const glyphs = {
    number: (ctx, S) => art.drawNumberGlyph(ctx, S, 3, { color: '#135bad', shadow: 'rgba(0,0,0,0.12)' }),
    flag: (ctx, S) => art.drawFlagGlyph(ctx, S, { base: '#16204a', shadow: '#000000', cloth: '#c62f2f', clothShade: '#8a1f1f' }),
    mine: (ctx, S) => art.drawMineGlyph(ctx, S, { body: '#16204a', highlight: '#ffffff' }),
    cross: (ctx, S) => art.drawCross(ctx, S, { outline: '#ffffff', mark: '#c62f2f' }),
    ring: (ctx, S) => art.drawMarkRing(ctx, S, { color: '#16204a' }),
  };
  const boxes = { square: { x: 0, y: 0, width: 60, height: 60 }, hexagon: { x: 5, y: 0, width: 60, height: 60 }, triangle: { x: 12, y: 18, width: 60 / Math.sqrt(3), height: 60 / Math.sqrt(3) } };
  for (const [outline, box] of Object.entries(boxes)) {
    for (const [name, draw] of Object.entries(glyphs)) {
      const boxed = fakeContext();
      art.inGlyphBox(boxed, box, (S) => draw(boxed, S));
      assert.equal(boxed.calls[0].op, 'save', `${outline} ${name}: the box is its own state`);
      assert.deepEqual(boxed.calls[1], { op: 'translate', args: [box.x, box.y], fill: '#000000', stroke: '#000000' }, `${outline} ${name}: drawn from the box's corner`);
      assert.equal(boxed.calls.at(-1).op, 'restore');
      const plain = fakeContext();
      draw(plain, box.width);
      assert.deepEqual(trace(boxed).slice(2, -1), trace(plain), `${outline} ${name}: the glyph at the box's size`);
    }
  }
  // A box wider than tall sets its glyph in a square of its height, centred across.
  const ctx = fakeContext();
  let side;
  art.inGlyphBox(ctx, { x: 4, y: 6, width: 30, height: 20 }, (S) => { side = S; });
  assert.equal(side, 20);
  assert.deepEqual(ctx.calls[1].args, [9, 6]);
});

test('a bevel side that is a colour shades the outline\'s edges facing more its way: the closed face draws it, the sunk face turns it over', async () => {
  const art = await artModule();
  const S = 60;
  const sides = { top: 1, right: '#5e92ec', bottom: -1, left: 1 };
  for (const outline of ['hexagon', 'triangle-up']) {
    const corners = art.outlinePoints(outline, S);
    const H = art.outlineBox(outline, S).height;
    const band = Math.round(H / 64) + Math.round(H * art.STYLES.bevel.params.slope) / 2;
    // The up-right edge: from the topmost right corner down to the right.
    const i = corners.findIndex(([x0, y0], k) => {
      const [x1, y1] = corners[(k + 1) % corners.length];
      return x1 > x0 && y1 > y0 && y0 === Math.min(...corners.map((c) => c[1]));
    });
    assert.ok(i >= 0, `${outline}: an up-right edge`);
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % corners.length];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const inward = [-(y1 - y0) / len, (x1 - x0) / len];
    const probe = [(x0 + x1) / 2 + inward[0] * band, (y0 + y1) / 2 + inward[1] * band];
    for (const [face, expected] of [['closed', '#5e92ec'], ['sunk', art.mix(PALETTES.sunk.face, '#5e92ec', -1)]]) {
      const ctx = fakeContext();
      art.drawFace(ctx, S, face, { style: 'bevel', params: { sides }, palette: PALETTES[face], depth: 1, px: 1, outline });
      const slope = paths(ctx).find((s) => s.points.length >= 4 && typeof s.fill === 'string' && containsPoint(s.points, probe));
      assert.equal(slope?.fill, expected, `${outline} ${face}: the up-right edge, facing more right than up, takes the right side's colour`);
    }
  }
});
