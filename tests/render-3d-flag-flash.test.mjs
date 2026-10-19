// A right-click on a number made visible (task 127, P-21): the cubes a flag click on a revealed
// number flags or unflags play a short flash drawn through the cubes in front of them; the HUD's
// mines figure turns the danger colour below zero; the ready card and the bindings
// say what the action does. The flash envelope is a pure function of elapsed time; the drawing,
// the tint and the copy are checked in a browser through `__ms`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserSuite } from './helpers/browser.mjs';
import { TIME_SLACK, patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
// js/render.js imports 'three' through the page's import map; Node resolves it to the vendored build.
const THREE_URL = pathToFileURL(join(ROOT, 'vendor/three/three.module.min.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : next(s, c);
}`)}`);
const {
  flashEnvelope, FLASH_S, FLASH_BRIGHT, FLASH_ALPHA, FLASH_SCALE,
} = await import('../js/render.js');
const RENDER = read('js/render.js');
const MAIN = read('js/main.js');
const body = (src, head) => src.slice(src.indexOf(head), src.indexOf('\n  }\n', src.indexOf(head)));

// ---------------------------------------------------------------- the flash envelope

test('the flash rises to its peak and is gone well under a second', () => {
  assert.ok(FLASH_S > 0.2 && FLASH_S <= 0.5, `${FLASH_S} s`);
  assert.ok(FLASH_BRIGHT > 0 && FLASH_BRIGHT <= 1 && FLASH_ALPHA > 0 && FLASH_ALPHA <= 1 && FLASH_SCALE >= 1);
  assert.deepEqual(flashEnvelope(0), { scale: 1, bright: 0, alpha: 0, done: false }, 'it starts unseen');
  const peak = flashEnvelope(FLASH_S / 2);
  assert.ok(Math.abs(peak.bright - FLASH_BRIGHT) < 1e-9 && Math.abs(peak.alpha - FLASH_ALPHA) < 1e-9 && Math.abs(peak.scale - FLASH_SCALE) < 1e-9, 'its peak halfway');
  let prev = flashEnvelope(0);
  for (let t = 0.01; t < FLASH_S / 2; t += 0.01) {
    const e = flashEnvelope(t);
    assert.ok(e.bright >= prev.bright && e.alpha >= prev.alpha, `rising at ${t}`);
    prev = e;
  }
  prev = peak;
  for (let t = FLASH_S / 2 + 0.01; t < FLASH_S; t += 0.01) {
    const e = flashEnvelope(t);
    assert.ok(e.bright <= prev.bright && e.alpha <= prev.alpha && !e.done, `falling at ${t}`);
    prev = e;
  }
  assert.deepEqual(flashEnvelope(FLASH_S), { scale: 1, bright: 0, alpha: 0, done: true }, 'gone at the end');
  assert.deepEqual(flashEnvelope(-1), flashEnvelope(0), 'no time before the start');
});

test('the flash is drawn through occluders, visits the flashing cubes only, and is dropped by setGame, the end of the game and a seek back', () => {
  assert.match(RENDER, /this\.matFlash\.defines = \{ FLASH: '' \};\n\s*this\.matFlash\.depthTest = false;/, 'no depth test: seen behind other cubes');
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /#elif defined\(FLASH\)\n\s*scale = aPulse\.x; flash = aPulse\.y; a = aPulse\.z; vis = true; sel = false;/, 'under every view mode');
  const tick = body(RENDER, '  _tickFlashes(');
  assert.match(tick, /for \(const \[i, t0\] of this\._flashes\)/, 'each frame visits the flashing cells only');
  assert.doesNotMatch(tick, /this\.n\b|< n;/, 'never the whole board');
  assert.match(RENDER, /isAnimating\(\) \{\n {4}return [^\n]*this\._flashes\.size > 0/, 'render-on-demand draws while one runs');
  assert.match(body(RENDER, '  setGame('), /this\._flashes\.clear\(\)/, 'setGame (a new game, a restart) drops them');
  assert.match(body(RENDER, '  sync('), /if \(prev === 'playing' && g\.state !== 'playing'\) this\._dropFlashes\(\)/, 'the end of the game drops them');
  assert.match(body(RENDER, '  _endEffects('), /this\._dropFlashes\(\)/);
  assert.match(body(RENDER, '  flash('), /g\.state !== 'playing'\) return/, 'only during play');
});

test('only a flag click on a revealed number flashes, with the cells whose flag it changed; the replay viewer never does', () => {
  assert.match(MAIN, /const onNumber = type === 'right' && g\.pressed\[sel\] === 1;/);
  const sounds = body(MAIN, 'function actionSounds(');
  assert.match(sounds, /if \(onNumber && \(r\.flagged \|\| r\.unflagged\)\) renderer\.flash\(Array\.from\(r\.changed\)\.filter\(\(c\) => !S\.game\.pressed\[c\]\)\);/);
  assert.match(sounds, /sfx\.flag\(r\.flagged >= r\.unflagged, r\.flagged \+ r\.unflagged\)/, 'the sound carries the count');
  assert.equal(MAIN.match(/renderer\.flash\(/g).length, 1, 'nowhere else');
  for (const file of ['js/replay/viewer.js', 'js/replay/viewer-3d.js']) assert.doesNotMatch(read(file), /\.flash\(/, `${file} plays no flash`);
});

// ---------------------------------------------------------------- in a browser

// Runs in the page: the mines figure's colour, the danger token's colour, and the figure's contrast
// against the overlay bar it sits on.
function minesColour() {
  const parse = (v) => v.match(/rgba?\(([^)]+)\)/)[1].split(/[\s,/]+/).filter(Boolean).map(Number).slice(0, 3);
  const lum = ([r, g, b]) => {
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const probe = document.createElement('i');
  probe.style.color = 'var(--color-danger)';
  document.body.appendChild(probe);
  const danger = parse(getComputedStyle(probe).color);
  probe.remove();
  const el = document.getElementById('hud-mines');
  const fg = parse(getComputedStyle(el).color);
  const bg = parse(getComputedStyle(document.querySelector('#hud .ui-overlay-bar')).backgroundColor);
  return { fg, danger, ratio: ratio(fg, bg), text: el.textContent, negative: el.classList.contains('negative') };
}

test('[slow] in a browser, a flag click on a number flashes the cubes it changed, then stops; the mines figure tints below zero; the copy says what it does', async (t) => {
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
    const flashes = () => ms(() => globalThis.__ms.renderer._flashes.size);
    const act = (cell, type) => ms(([c, k]) => {
      if (globalThis.__ms.aimAt(c) !== c) throw new Error(`cell ${c} could not be aimed at`);
      globalThis.__ms.click(k);
    }, [cell, type]);
    // How long isAnimating() stays true after `fn` runs in the page, and the longest gap between frames.
    const animation = (fn) => ms((src) => new Promise((resolve) => {
      (0, eval)(src)();
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
    }), fn.toString());

    // 4 × 3 × 1 with mines at the corners: 5 and 6 are 2s; 6's closed neighbours are 1 2 3 7 9 10 11.
    await ms(() => { globalThis.__ms.start(4, 3, 1, 4, [0, 3, 8, 11]); globalThis.__ms.forcePlay(); });
    await act(5, 'left');
    await act(6, 'left');

    // The ready card and every help surface say what a right-click on a number does.
    const readyKeys = await ms(() => document.querySelector('#ready .ready-keys').textContent.replace(/\s+/g, ' '));
    assert.match(readyKeys, /Right on a number flags all its closed cubes · Right again takes back only those/);
    const rightRow = 'Flag / unflag. On a number: flag all its closed neighbours; right-click it again to take back only those flags';
    for (const sel of ['#pause-controls', '#help .controls']) {
      assert.ok((await ms((s) => document.querySelector(s).textContent, sel)).includes(rightRow), `${sel} shows the 3D right-click row`);
    }

    await ms(() => globalThis.__ms.aimAt(6));
    await page.waitForFunction(() => !globalThis.__ms.renderer.isAnimating(), null, { timeout: patience(8000) }); // the aim's glow settles
    const light0 = await ms(minesColour);
    assert.equal(light0.negative, false);
    assert.notDeepEqual(light0.fg, light0.danger, 'four mines left: the normal colour');

    // The flag-all: its seven cubes flash, then the renderer stops asking for frames.
    const { length, gap } = await animation(() => globalThis.__ms.click('right'));
    const flashS = await ms(async () => (await import('/js/render.js')).FLASH_S);
    assert.ok(length > 0, 'isAnimating() was true, then false');
    assert.ok(length >= flashS * 1000, `not before the flash has played (${Math.round(length)} ms)`);
    // the frame slop above the flash gets the timing slack under load; the flash itself does not
    assert.ok(length <= flashS * 1000 + (2 * gap + 50) * TIME_SLACK, `but with it, give or take a frame (${Math.round(length)} ms, frames up to ${Math.round(gap)} ms apart)`);
    assert.equal(await ms(() => globalThis.__ms.renderer._flashFx.mesh.visible), false, 'no longer drawn');
    assert.equal(await ms(() => globalThis.__ms.game.minesLeft), -3);

    // The HUD tint below zero, at 4.5:1 or better on the overlay bar.
    for (const theme of ['joyful-tiles']) {
      await frames();
      const c = await ms(minesColour);
      assert.equal(c.text, '-3');
      assert.equal(c.negative, true);
      assert.deepEqual(c.fg, c.danger, `${theme}: the mines figure shows in --color-danger`);
      assert.ok(c.ratio >= 4.5, `${theme}: ${c.ratio.toFixed(2)}:1 against the overlay bar`);
    }

    // The undo flashes the same seven; a hand flag on a closed cube flashes nothing.
    await ms(() => globalThis.__ms.click('right'));
    assert.equal(await flashes(), 7, 'the undo flashes the cubes it unflagged');
    await frames();
    const back = await ms(minesColour);
    assert.equal(back.text, '4');
    assert.notDeepEqual(back.fg, back.danger, 'back above zero: the normal colour');
    await page.waitForFunction(() => globalThis.__ms.renderer._flashes.size === 0, null, { timeout: patience(3000) });
    await act(7, 'right');
    assert.equal(await ms(() => globalThis.__ms.game.flagged[7]), 1);
    assert.equal(await flashes(), 0, 'a hand flag does not flash');

    // The end of the game drops a running flash, and so does a new game.
    await act(6, 'right'); // 6's flag-all: the six cubes left
    assert.equal(await flashes(), 6);
    await act(0, 'left'); // a mine
    await frames();
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    assert.equal(await flashes(), 0, 'the loss drops the flash');
    await ms(() => { globalThis.__ms.start(4, 3, 1, 4, [0, 3, 8, 11]); globalThis.__ms.forcePlay(); });
    await act(5, 'left');
    await act(6, 'left');
    await act(6, 'right');
    assert.equal(await flashes(), 7);
    await ms(() => { globalThis.__ms.start(4, 3, 1, 4, [0, 3, 8, 11]); globalThis.__ms.forcePlay(); });
    assert.equal(await flashes(), 0, 'a new game drops it');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
