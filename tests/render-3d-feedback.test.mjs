// 3D small feedback in the renderer (task 126, P-29 and P-35): Ctrl draws hidden cells as ghosts at
// GHOST_ALPHA in the transparent pass instead of opaque, and a number the player could see plays a
// short "solved" pulse — brighter and larger, then fading out — after the engine hides it. The pulse
// envelope is a pure function of elapsed time; the drawing is checked in a browser through `__ms`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
// js/render.js imports 'three' through the page's import map; Node resolves it to the vendored build.
const THREE_URL = pathToFileURL(join(ROOT, 'vendor/three/three.module.min.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : next(s, c);
}`)}`);
const {
  GHOST_ALPHA, pulseEnvelope, PULSE_GLOW_S, PULSE_FADE_S, PULSE_SCALE, PULSE_BRIGHT,
} = await import('../js/render.js');
const RENDER = read('js/render.js');
const TOTAL = PULSE_GLOW_S + PULSE_FADE_S;

// ---------------------------------------------------------------- the ghosts

test('Ctrl ghosts are one named alpha, 0.25, used by the shader for hidden cells under Ctrl', () => {
  assert.equal(GHOST_ALPHA, 0.25);
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /else if \(kind == 4\) \{[^\n]*uCtrl > 0\.5[^\n]*a = \$\{GHOST_ALPHA\}/, 'a hidden cell under Ctrl takes the ghost alpha');
  assert.match(vert, /bool want = uPass < 0\.5 \? a > 0\.99 : \(a < 0\.99/, 'so it is drawn in a transparent pass');
});

test('the opaque list leaves hidden cells to the transparent pass under Ctrl, and the sort takes them', () => {
  const opaque = RENDER.slice(RENDER.indexOf('  _rebuildOpaque() {'), RENDER.indexOf('  _applyShiftOpaque() {'));
  assert.doesNotMatch(opaque, /kd === K_HIDDEN && \(ctrl \|\|/, 'hidden cells are no longer opaque under Ctrl');
  const trans = RENDER.slice(RENDER.indexOf('  _updateTransparent() {'), RENDER.indexOf('  /** Advances time-based effects'));
  assert.match(trans, /if \(!shift && !space && !ctrl\)/, 'the transparent pass runs while Ctrl is held');
  assert.match(trans, /ctrl && kd === K_HIDDEN/, 'and sorts the hidden cells back-to-front with the rest');
  const toggles = RENDER.slice(RENDER.indexOf('  setToggles('), RENDER.indexOf('  setSpacing('));
  assert.match(toggles, /t\.ctrl !== ctrl/, 'a Ctrl change re-sorts the transparent list');
});

// ---------------------------------------------------------------- the pulse envelope

test('the pulse envelope rises, then fades out to nothing in under half a second', () => {
  assert.ok(TOTAL < 0.5, `${TOTAL} s in all`);
  assert.ok(PULSE_GLOW_S >= 0.2 && PULSE_GLOW_S <= 0.3, 'the pulse itself lasts 0.2 to 0.3 s');
  assert.ok(Math.abs(PULSE_FADE_S - 0.2) < 1e-9, 'the fade about 0.2 s');
  assert.ok(PULSE_SCALE > 1 && PULSE_BRIGHT > 0, 'it grows and brightens');
  assert.deepEqual(pulseEnvelope(0), { scale: 1, bright: 0, alpha: 1, done: false }, 'it starts as the cube was');
  const peak = pulseEnvelope(PULSE_GLOW_S / 2);
  assert.ok(Math.abs(peak.scale - PULSE_SCALE) < 1e-9 && Math.abs(peak.bright - PULSE_BRIGHT) < 1e-9, 'its peak');
  assert.equal(peak.alpha, 1);
  let prev = pulseEnvelope(0);
  for (let t = 0.01; t <= PULSE_GLOW_S / 2; t += 0.01) {
    const e = pulseEnvelope(t);
    assert.ok(e.scale >= prev.scale && e.bright >= prev.bright, `rising at ${t}`);
    prev = e;
  }
  prev = pulseEnvelope(PULSE_GLOW_S);
  assert.equal(prev.alpha, 1, 'whole until the fade');
  for (let t = PULSE_GLOW_S + 0.01; t < TOTAL; t += 0.01) {
    const e = pulseEnvelope(t);
    assert.ok(e.alpha < prev.alpha && e.alpha > 0, `fading at ${t}`);
    assert.equal(e.done, false);
    prev = e;
  }
  assert.deepEqual(pulseEnvelope(TOTAL), { scale: 1, bright: 0, alpha: 0, done: true }, 'gone at the end');
  assert.equal(pulseEnvelope(5).done, true);
  assert.deepEqual(pulseEnvelope(-1), pulseEnvelope(0), 'no time before the start');
});

test('pulses start when a visible number hides, end with the game\'s loss or a seek, and keep the effects ticking', () => {
  const sync = RENDER.slice(RENDER.indexOf('  sync('), RENDER.indexOf('  /**\n   * Opaque instance list.'));
  assert.match(sync, /was === K_NUMBER/, 'only a number the player could see');
  assert.match(sync, /this\._pulses\.delete\(i\)/, 'a cell shown again drops its pulse');
  assert.match(sync, /if \(seek\) this\._dropPulses\(\)/, 'a seek drops every pulse');
  assert.match(sync, /g\.state === 'lost'\) \{ this\._dropPulses\(\); this\._beginLoss\(dirty\)/, 'a loss drops them for its wave');
  assert.match(RENDER, /isAnimating\(\) \{\n {4}return [^\n]*this\._pulses\.size > 0/, 'render-on-demand draws while one runs');
  const tick = RENDER.slice(RENDER.indexOf('  _tickPulses('), RENDER.indexOf('\n  }\n', RENDER.indexOf('  _tickPulses(')));
  assert.match(tick, /for \(const \[i, t0\] of this\._pulses\)/, 'each frame visits the pulsing cells only');
  assert.doesNotMatch(tick, /this\.n\b|< n;/, 'never the whole board');
});

// ---------------------------------------------------------------- the target rectangle

test('the renderer draws into a target rectangle: viewport, scissor and camera aspect from it, re-applied on resize', () => {
  const target = RENDER.slice(RENDER.indexOf('  setTarget('), RENDER.indexOf('  setGame('));
  assert.match(target, /if \(!rect\) this\._target = null/, 'null is the full window');
  assert.match(target, /this\.resize\(\)/, 'a new target is applied at once');
  const resize = target.slice(target.indexOf('  resize() {'));
  assert.match(resize, /setViewport\(/, 'the viewport is the rectangle');
  assert.match(resize, /setScissor\(/, 'and nothing is drawn outside it');
  assert.match(resize, /setScissorTest\(true\)/);
  assert.match(resize, /setScissorTest\(false\)/, 'the full window draws without a scissor');
  assert.match(resize, /camera\.aspect = t\.width \/ Math\.max\(1, t\.height\)/, 'the camera takes the rectangle\'s aspect');
  const pr = RENDER.slice(RENDER.indexOf('  setPixelRatio('), RENDER.indexOf('  resize() {'));
  assert.match(pr, /this\.resize\(\)/, 'a pixel-ratio change re-applies it');
  const render = RENDER.slice(RENDER.indexOf('  render() {'));
  assert.match(render, /if \(this\._target\) \{[^}]*setScissorTest\(false\)[^}]*setClearAlpha\(0\)[^}]*clear\(\)/, 'a frame first clears the whole canvas to transparent, so the page shows outside the rectangle');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, Ctrl draws hidden cells as transparent ghosts and a hidden number pulses, then stops drawing', async (t) => {
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
    const stats = async () => { await frames(); return ms(() => ({ ...globalThis.__ms.renderer.stats })); };
    const pulses = () => ms(() => globalThis.__ms.renderer._pulses.size);
    const act = (cell, type) => ms(([c, k]) => {
      if (globalThis.__ms.aimAt(c) !== c) throw new Error(`cell ${c} could not be aimed at`);
      globalThis.__ms.click(k);
    }, [cell, type]);

    // A row of six: mines at 0 and 3; 1 and 2 show a 1. Flagging 0 solves 1, which hides.
    await ms(() => { globalThis.__ms.start(6, 1, 1, 2, [0, 3]); globalThis.__ms.forcePlay(); });
    await act(1, 'left');
    await act(2, 'left');
    await ms(() => globalThis.__ms.aimAt(0));
    await page.waitForFunction(() => !globalThis.__ms.renderer.isAnimating(), null, { timeout: 8000 }); // the aim's glow settles
    const plain = await stats();
    assert.deepEqual([plain.opaque, plain.trans], [6, 0], 'every cube opaque, nothing transparent');

    // The flag hides the 1: a pulse runs, then the renderer stops asking for frames.
    // Polled every frame: how long isAnimating() stays true, and the longest gap between two frames.
    const { length, gap } = await ms(() => new Promise((resolve) => {
      globalThis.__ms.click('right');
      const t0 = performance.now();
      let seen = false, last = t0, gap = 0;
      const poll = () => {
        const now = performance.now();
        gap = Math.max(gap, now - last); last = now;
        if (globalThis.__ms.renderer.isAnimating()) seen = true;
        else if (seen) { resolve({ length: now - t0, gap }); return; }
        if (now - t0 > 5000) { resolve({ length: -1, gap }); return; }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }));
    const { glow, fade } = await ms(async () => {
      const m = await import('/js/render.js');
      return { glow: m.PULSE_GLOW_S, fade: m.PULSE_FADE_S };
    });
    assert.ok(length > 0, 'isAnimating() was true, then false');
    assert.ok(length >= (glow + fade) * 1000, `not before the pulse has played (${Math.round(length)} ms)`);
    assert.ok(length <= (glow + fade) * 1000 + 2 * gap + 50, `but with it, give or take a frame (${Math.round(length)} ms, frames up to ${Math.round(gap)} ms apart)`);
    assert.equal(await ms(() => globalThis.__ms.game.unlinked[1]), 1, 'the engine hid the cell at once');
    assert.notEqual(await ms(() => globalThis.__ms.aimAt(1)), 1, 'and picking passes through it');
    await ms(() => globalThis.__ms.aimAt(0));
    const hidden = await stats();
    assert.deepEqual([hidden.opaque, hidden.trans], [5, 0], 'the hidden 1 is not drawn');

    // Ctrl: the hidden 1 counts in the transparent pass, not the opaque one; releasing it hides it again.
    await ms(() => globalThis.__ms.key('ControlLeft'));
    const ghosts = await stats();
    assert.deepEqual([ghosts.opaque, ghosts.trans], [5, 1], 'a ghost in the transparent pass');
    await ms(() => globalThis.__ms.key('ShiftLeft'));
    const shifted = await stats();
    assert.deepEqual([shifted.opaque, shifted.trans], [1, 6], 'with Shift too the ghost stays in the transparent pass');
    assert.notEqual(await ms(() => globalThis.__ms.aimAt(1)), 1, 'hidden cells stay unpickable under Ctrl');
    await ms(() => globalThis.__ms.aimAt(0));
    await ms(() => globalThis.__ms.key('ShiftLeft', false));
    await ms(() => globalThis.__ms.key('ControlLeft', false));
    const released = await stats();
    assert.deepEqual([released.opaque, released.trans], [5, 0], 'released: hidden again');

    // Unflagging during the pulse ends it at once, and the 1 is drawn as before.
    await act(0, 'right'); // unflag: the 1 shows again
    await frames();
    await act(0, 'right'); // flag: the 1 hides and pulses
    await frames();
    assert.equal(await pulses(), 1, 'a pulse runs');
    await act(0, 'right'); // unflag during the pulse
    await frames();
    assert.equal(await pulses(), 0, 'the pulse is dropped');
    assert.equal(await ms(() => globalThis.__ms.renderer.meshPulse.visible), false, 'and no longer drawn');
    const shown = await stats();
    assert.deepEqual([shown.opaque, shown.trans], [6, 0], 'the 1 is drawn normally');

    // A loss during a pulse drops it; the loss wave proceeds.
    await act(0, 'right');
    await frames();
    assert.equal(await pulses(), 1);
    await act(3, 'left');
    await frames();
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    assert.equal(await pulses(), 0, 'the loss drops the pulse');
    assert.equal(await ms(() => globalThis.__ms.renderer._eff?.type), 'loss', 'its wave runs');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
