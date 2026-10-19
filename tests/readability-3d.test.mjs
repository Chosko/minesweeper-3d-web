// 3D readability (task 141, P-23). Iteration 1: the aimed-cell readout beside the crosshair, which
// counts the aimed number's unopened and flagged neighbours. Iteration 3: under Shift, the aimed
// neighbourhood drawn over the faded cubes. Iteration 4: under Space, numbers dimmed by their depth.
// The pure functions are checked directly, the drawing in a browser through `__ms`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aimReadout, readoutText, spaceAlpha, boxDepth, SPACE_NEAR_ALPHA, SPACE_FLOOR_ALPHA, SPACE_FALLOFF,
} from '../js/readability.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/**
 * A hand-built 3D state view: X × Y × Z, every cell closed unless listed. `cells` maps an index to
 * 'n<d>' (a revealed number d), 'f' (a flag) or 'h' (hidden: revealed and unlinked).
 */
function view(X, Y, Z, cells = {}, state = 'playing') {
  const n = X * Y * Z;
  const v = {
    X, Y, Z, n, state,
    idx: (i, j, k) => i + X * (j + Y * k),
    coords: (c) => [c % X, Math.floor(c / X) % Y, Math.floor(c / (X * Y))],
    number: new Int8Array(n), pressed: new Uint8Array(n), flagged: new Uint8Array(n), unlinked: new Uint8Array(n),
    version: 0,
  };
  for (const [c, s] of Object.entries(cells)) {
    if (s === 'f') v.flagged[c] = 1;
    else if (s === 'h') { v.pressed[c] = 1; v.unlinked[c] = 1; }
    else { v.pressed[c] = 1; v.number[c] = Number(s.slice(1)); }
  }
  return v;
}

// ---------------------------------------------------------------- the readout's counts

test('an inner cell counts all 26 neighbours, an edge cell 11 and a corner cell 7', () => {
  const inner = view(3, 3, 3, { 13: 'n2' });
  assert.deepEqual(aimReadout(inner, 13), { number: 2, closed: 26, flags: 0 });
  const edge = view(3, 3, 3, { 1: 'n1' }); // (1, 0, 0): on the box's edge
  assert.equal(aimReadout(edge, 1).closed, 11);
  const corner = view(3, 3, 3, { 0: 'n3' });
  assert.equal(aimReadout(corner, 0).closed, 7);
  const face = view(3, 3, 3, { 4: 'n1' }); // (1, 1, 0): on a face
  assert.equal(aimReadout(face, 4).closed, 17);
});

test('flags count apart from closed cells; revealed and hidden neighbours count as neither', () => {
  // corner 0 of a 2 × 2 × 2 box: neighbours 1..7
  const v = view(2, 2, 2, { 0: 'n2', 1: 'f', 2: 'n1', 3: 'h', 4: 'h' });
  assert.deepEqual(aimReadout(v, 0), { number: 2, closed: 3, flags: 1 });
});

test('an over-flagged number counts its flags as they are', () => {
  const over = view(2, 2, 2, { 0: 'n1', 1: 'f', 2: 'f' });
  assert.deepEqual(aimReadout(over, 0), { number: 1, closed: 5, flags: 2 });
});

test('no readout off a revealed number, nor once the game is over', () => {
  const v = view(2, 2, 2, { 0: 'n1', 1: 'f', 2: 'n0', 3: 'h' });
  assert.equal(aimReadout(v, -1), null, 'no cell aimed');
  assert.equal(aimReadout(v, 7), null, 'a closed cell');
  assert.equal(aimReadout(v, 1), null, 'a flag');
  assert.equal(aimReadout(v, 2), null, 'a zero');
  assert.equal(aimReadout(v, 3), null, 'a hidden cell');
  assert.notEqual(aimReadout(v, 0), null);
  assert.equal(aimReadout(view(2, 2, 2, { 0: 'n1' }, 'lost'), 0), null, 'a lost game shows every cell pressed');
  assert.equal(aimReadout(view(2, 2, 2, { 0: 'n1' }, 'won'), 0), null);
});

// ---------------------------------------------------------------- the readout's text

test('the text is "cubes 6 - flags 1": every unrevealed neighbour, flags included, then the flags only when there are any', () => {
  assert.equal(readoutText({ number: 2, closed: 5, flags: 1 }), 'cubes 6 - flags 1', 'the cube count includes the flags');
  assert.equal(readoutText({ number: 3, closed: 4, flags: 2 }), 'cubes 6 - flags 2');
  assert.equal(readoutText({ number: 1, closed: 7, flags: 0 }), 'cubes 7', 'no flag part at zero');
  assert.equal(readoutText(null), '', 'nothing to read: empty');
});

test('the readout module is DOM-free and adds nothing to the engine', () => {
  const src = read('js/readability.js');
  assert.doesNotMatch(src, /\b(document|window|import\s)/);
  assert.doesNotMatch(read('js/engine/state-view-3d.js'), /readout|readability/);
});

test('the readout is styled from tokens, with no literal colour', () => {
  const css = read('css/style.css');
  const rules = css.match(/#aim-readout[^{]*\{[^}]*\}/g) ?? []; // the box and its icons
  assert.ok(rules.length > 0, 'it has a style');
  for (const r of rules) assert.doesNotMatch(r, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, r);
  assert.match(css, /#hud\.hud--2d[^{]*#aim-readout/, 'hidden in Classic 2D');
  const html = read('index.html');
  const markup = html.slice(html.indexOf('<div id="aim-readout"'), html.indexOf('</div>', html.indexOf('<div id="aim-readout"')));
  assert.match(markup, /^<div id="aim-readout"[^>]*><svg class="aim-icon aim-icon--cube"[^]*<span id="aim-cubes">[^]*<span id="aim-flag-part"[^>]*> - <svg class="aim-icon aim-icon--flag"[^]*<span id="aim-flags">/,
    'the cube icon and its count, then " - ", the flag icon and its count');
  assert.doesNotMatch(markup, /Nearby/, 'no label');
  assert.doesNotMatch(markup, /fill="#|stroke="#/, 'the icons take their colour from the stylesheet');
});

// ---------------------------------------------------------------- Shift: the neighbourhood over the faded cubes

test('under Shift with a cell aimed, the faded cubes draw first and the neighbourhood over them, the canvas kept opaque', () => {
  const RENDER = read('js/render.js');
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /if \(kind <= 1\) \{ if \(uShift > 0\.5 && !near\) a = 0\.2; \}/, 'the neighbourhood\'s closed and flagged cubes stay solid');
  assert.match(vert, /bool want = uPass < 0\.5 \? a > 0\.99 : \(a < 0\.99 && \(uPass < 1\.5 \? \(!emphOn \|\| near\) : \(emphOn && !near\)\)\);/,
    'the faded cubes in the back pass, the neighbourhood\'s transparent ones in the front pass');
  assert.match(RENDER, /this\.matTransBack\.transparent = false;/, 'the back pass sits in the opaque list, so it really draws before the opaque cubes');
  assert.match(RENDER, /this\.matTransBack\.blendSrcAlpha = THREE\.OneFactor;\n\s*this\.matTransBack\.blendDstAlpha = THREE\.OneMinusSrcAlphaFactor;/, 'and keeps the canvas opaque');
  assert.match(RENDER, /this\.meshTransBack\.renderOrder = -1;\n\s*this\.meshOpaque\.renderOrder = 0;\n\s*this\.meshTrans\.renderOrder = 1;/, 'back pass, opaque, front pass');
  assert.match(vert, /bool emphOn = uShift > 0\.5 && uHasSel > 0\.5 && uPlaying > 0\.5;/, 'never while the end effects run');
  const fn = (head) => RENDER.slice(RENDER.indexOf(head), RENDER.indexOf('\n  }\n', RENDER.indexOf(head)));
  for (const head of ['  setGame(', '  sync(']) assert.match(fn(head), /this\.uniforms\.uPlaying\.value = \w+\.state === 'playing' \? 1 : 0;/, `${head.trim()} keeps it in step with the game`);
});

// ---------------------------------------------------------------- Space: numbers dimmed by depth

test('under Space a number\'s alpha falls with its lattice depth: the nearest at SPACE_NEAR_ALPHA, never below SPACE_FLOOR_ALPHA', () => {
  assert.ok(SPACE_NEAR_ALPHA > SPACE_FLOOR_ALPHA && SPACE_NEAR_ALPHA < 0.99, 'the nearest still see-through, so the crosshair passes them');
  assert.ok(SPACE_FLOOR_ALPHA > 0, 'the farthest still drawn');
  assert.ok(SPACE_FALLOFF > 0);
  assert.equal(spaceAlpha(0), SPACE_NEAR_ALPHA, 'the nearest numbers');
  assert.equal(spaceAlpha(-3), SPACE_NEAR_ALPHA, 'nothing nearer than the nearest');
  assert.ok(Math.abs(spaceAlpha(1e6) - SPACE_FLOOR_ALPHA) < 1e-9, 'the floor far away');
  let prev = spaceAlpha(0);
  for (let d = 0.25; d <= 40; d += 0.25) {
    const a = spaceAlpha(d);
    assert.ok(a <= prev + 1e-12, `does not increase (${d})`);
    assert.ok(a >= SPACE_FLOOR_ALPHA - 1e-12, `not below the floor (${d})`);
    prev = a;
  }
  assert.ok(spaceAlpha(1) - spaceAlpha(2) > 0.05, 'two numbers a layer apart in one column read apart');
});

test('the depth is counted from the box\'s nearest face: zero at the face, the box in lattice units', () => {
  const box = { X: 4, Y: 3, Z: 2 }; // centres at -1.5..1.5, -1..1, -0.5..0.5; faces half a cell beyond
  assert.equal(boxDepth([0, 0, 0], box), 0, 'inside the box');
  assert.ok(Math.abs(boxDepth([0, 0, -6], box) - 5) < 1e-9, 'in front of the front face, 5 cells out');
  assert.ok(Math.abs(boxDepth([5, 0, 0], box) - 3) < 1e-9, 'beside the side face');
  assert.ok(Math.abs(boxDepth([5, 4, 0], box) - Math.hypot(3, 2.5)) < 1e-9, 'off an edge');
});

test('the shader dims Space\'s numbers with the same curve and constants', () => {
  const RENDER = read('js/render.js');
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /\$\{glslFloat\(SPACE_FLOOR_ALPHA\)\}/);
  assert.match(vert, /\$\{glslFloat\(SPACE_NEAR_ALPHA\)\}/);
  assert.match(vert, /\$\{glslFloat\(SPACE_FALLOFF\)\}/);
  assert.match(vert, /else if \(kind == 2\) \{ if \(uSpace > 0\.5\) a = spaceAlpha\(depth\); else if \(uShift > 0\.5 && !sel\) a = 0\.2; \}/);
  const fn = (head) => RENDER.slice(RENDER.indexOf(head), RENDER.indexOf('\n  }\n', RENDER.indexOf(head)));
  assert.match(fn('  render('), /uBoxDepth\.value = boxDepth\(/, 'the box depth from the pure function, once a frame');
  assert.doesNotMatch(read('js/picking.js'), /spaceAlpha|boxDepth/, 'Space\'s pick rule does not change');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, the readout shows on an aimed number and hides off it, while paused, in the end delay and in Classic 2D', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const frames = () => ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // What the player sees: the element's text, icons as their labels, while it shows, '' while hidden; and what info() reports.
    const shown = async () => {
      await frames();
      return ms(() => {
        const el = document.getElementById('aim-readout');
        const visible = !el.classList.contains('hidden') && el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        // each icon reads as its label, a hidden part as nothing: what the player sees, in words
        const words = (n) => (n.nodeType === 3 ? n.textContent : n.classList.contains('hidden') ? '' : n.nodeName.toLowerCase() === 'svg' ? n.getAttribute('aria-label') : [...n.childNodes].map(words).join(''));
        return { seen: visible ? words(el).replace(/\s+/g, ' ').trim() : '', info: globalThis.__ms.info().readout };
      });
    };
    const act = (cell, type) => ms(([c, k]) => {
      if (globalThis.__ms.aimAt(c) !== c) throw new Error(`cell ${c} could not be aimed at`);
      globalThis.__ms.click(k);
    }, [cell, type]);

    // 4 × 3 × 1 with mines at the corners: 5 and 6 are 2s with eight neighbours each.
    await ms(() => { globalThis.__ms.start(4, 3, 1, 4, [0, 3, 8, 11]); globalThis.__ms.forcePlay(); });
    await ms(() => globalThis.__ms.aimAt(5));
    assert.deepEqual(await shown(), { seen: '', info: '' }, 'before the first reveal: hidden');
    await act(5, 'left');
    await act(6, 'left');
    await ms(() => globalThis.__ms.aimAt(5));
    assert.equal(await ms(() => globalThis.__ms.settings.get('aimReadout')), true, 'on by default');
    assert.deepEqual(await shown(), { seen: 'cubes 7', info: 'cubes 7' }, 'on an aimed number, with no flag part at zero');
    await act(0, 'right');
    await ms(() => globalThis.__ms.aimAt(5));
    assert.equal((await shown()).seen, 'cubes 7 - flags 1', 'it follows the board; the flag still counts as a cube');
    await ms(() => globalThis.__ms.aimAt(1));
    assert.equal((await shown()).seen, '', 'off a number: hidden');
    await ms(() => globalThis.__ms.aimAt(0));
    assert.equal((await shown()).seen, '', 'on a flag: hidden');
    await ms(() => globalThis.__ms.aimAt(6));
    assert.equal((await shown()).seen, 'cubes 7');
    await ms(() => globalThis.__ms.settings.set('aimReadout', false));
    assert.deepEqual(await shown(), { seen: '', info: '' }, 'turned off: hidden at once');
    await ms(() => globalThis.__ms.settings.set('aimReadout', true));

    // the crosshair stays clear: the readout's nearest point lies beyond the off-screen arrow's ring
    const clear = await ms(() => {
      const r = document.getElementById('aim-readout').getBoundingClientRect();
      const c = document.getElementById('crosshair').getBoundingClientRect();
      const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
      const dx = Math.max(r.left - cx, 0, cx - r.right), dy = Math.max(r.top - cy, 0, cy - r.bottom);
      return { distance: Math.hypot(dx, dy), ring: 46 }; // #crosshair-arrow svg: its tip 46 px from the crosshair's centre
    });
    assert.ok(clear.distance > clear.ring, `the readout leaves the crosshair and its arrow ring clear (${clear.distance.toFixed(1)} px > ${clear.ring} px)`);

    // paused: hidden; resumed: back
    await ms(() => globalThis.__ms.pause());
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    assert.deepEqual(await shown(), { seen: '', info: '' }, 'paused: hidden');
    await ms(() => globalThis.__ms.forcePlay());
    assert.equal((await shown()).seen, 'cubes 7', 'back on resume');

    // the end delay: hidden
    await act(3, 'left'); // a mine
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    await ms(() => globalThis.__ms.aimAt(6));
    assert.deepEqual(await shown(), { seen: '', info: '' }, 'the end delay: hidden');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: 5000 });

    // Classic 2D: hidden
    await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'beginner', custom: { width: 9, height: 9, mines: 10 }, noGuess: false }));
    await frames();
    assert.deepEqual(await shown(), { seen: '', info: '' }, 'Classic 2D: hidden');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
