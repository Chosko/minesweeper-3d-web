// Focus containment in overlays (js/main.js through js/shell/navigation.js inertSections / tabWrap):
// in a browser, Tab and Shift+Tab never leave the open overlay — the Controls modal, the pause card,
// the pause confirmation, the results card and the replay viewer over a finished Classic 2D board —
// with `inert` and again with `inert` removed from the page's prototype (the Tab wrap); a faked
// controller's D-pad never leaves the confirmation; and each overlay's focus restore on close.
// Skipped when Playwright or Chromium is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSuite } from './helpers/browser.mjs';

const suite = browserSuite();
const BTN = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/**
 * A page with a faked standard controller (`__pad.press(button, on)`), a fixed board seed (12345) and
 * the shell loaded; `inert: false` removes `inert` from the page's prototype before the shell starts.
 */
async function open(browser, base, { inert }) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((keepInert) => {
    if (!keepInert) delete HTMLElement.prototype.inert;
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    navigator.getGamepads = () => [pad];
    globalThis.__pad = { press(i, on) { Object.assign(buttons[i], { pressed: on, touched: on, value: on ? 1 : 0 }); pad.timestamp++; } };
  }, inert);
  await page.goto(`${base}/index.html?still-backdrop`);
  await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
  assert.equal(await page.evaluate(() => 'inert' in HTMLElement.prototype), inert);
  const ms = (fn, arg) => page.evaluate(fn, arg);
  const frames = (count) => ms((k) => new Promise((r) => { const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
  const tap = async (button) => {
    await ms((b) => globalThis.__pad.press(b, true), button);
    await frames(1);
    await ms((b) => globalThis.__pad.press(b, false), button);
    await frames(2);
  };
  const mode = () => ms(() => globalThis.__ms.state.mode);
  const focused = () => ms(() => document.activeElement?.id || null);
  const isInert = (id) => ms((i) => document.getElementById(i).inert === true, id);
  /** The overlay's Tab stops, in DOM order: what the browser's own Tab order visits. */
  const stops = (sel) => ms((s) => [...document.querySelector(s).querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]')]
    .filter((e) => e.tabIndex >= 0 && !e.disabled && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden').length, sel);
  /**
   * Tab (or Shift+Tab) more times than the overlay has stops; every focus must be one of its stops.
   * Returns how many distinct stops were visited.
   */
  const tabWalk = async (sel, shift, never = []) => {
    const n = await stops(sel);
    assert.ok(n > 0, `${sel} has controls`);
    const seen = new Set();
    for (let i = 0; i < n + 3; i++) {
      await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
      const at = await ms(([s, bad]) => {
        const e = document.activeElement;
        const list = [...document.querySelector(s).querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex]')]
          .filter((x) => x.tabIndex >= 0 && !x.disabled && x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden');
        return { index: list.indexOf(e), id: e?.id || e?.tagName, page: !!e && e !== document.body, bad: bad.some((b) => e?.matches(b)) };
      }, [sel, never]);
      // With inert, Tab past either end passes through the browser's own controls (the page's body
      // is focused) and comes back to the overlay: the browser's order, untouched. The Tab wrap
      // never lets focus out at all.
      if (inert && !at.page) continue;
      assert.ok(at.index >= 0, `${shift ? 'Shift+Tab' : 'Tab'} ${i + 1} left ${sel} for ${at.id}`);
      assert.equal(at.bad, false, `${at.id} is never reached`);
      seen.add(at.index);
    }
    assert.equal(seen.size, n, `${shift ? 'Shift+Tab' : 'Tab'} visits every control of ${sel}`);
  };
  return { page, errors, ms, frames, tap, mode, focused, isInert, tabWalk };
}

for (const inert of [true, false]) {
  const how = inert ? 'with inert' : 'without inert (the Tab wrap)';

  test(`in a browser ${how}, focus stays inside the Controls modal, the pause card and its confirmation, and is restored on close`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    try {
      const { page, errors, ms, frames, tap, mode, focused, isInert, tabWalk } = await open(browser, base, { inert });

      // The Controls modal over the Settings page: the page behind it is inert; Tab never reaches it.
      await page.click('#menu-entry-settings');
      assert.equal(await mode(), 'settings');
      await page.click('#set-controls');
      assert.equal(await focused(), 'controls-close');
      if (inert) assert.equal(await isInert('settings'), true, 'the Settings page is inert behind the Controls modal');
      assert.equal(await isInert('toast'), false, 'the toast stays live');
      await tabWalk('#controls-modal', false);
      await tabWalk('#controls-modal', true);
      // Every way out focuses the page's Controls action, and the page is live again.
      await page.keyboard.press('Escape');
      assert.equal(await focused(), 'set-controls', 'Esc');
      assert.equal(await isInert('settings'), false, 'the page is live again');
      assert.equal(await mode(), 'settings', 'Esc closed the modal only');
      await page.click('#set-controls');
      await page.click('#controls-close');
      assert.equal(await focused(), 'set-controls', 'the close button');
      await page.click('#set-controls');
      await page.mouse.click(4, 4);
      assert.equal(await ms(() => document.getElementById('controls-modal').classList.contains('hidden')), true);
      assert.equal(await focused(), 'set-controls', 'a backdrop click');
      await page.click('#set-controls');
      await frames(2);
      await tap(BTN.B);
      assert.equal(await ms(() => document.getElementById('controls-modal').classList.contains('hidden')), true);
      assert.equal(await focused(), 'set-controls', 'the controller');

      // The pause card of a started 3D game: the overlay bar (its Pause button) and the boards are inert.
      await ms(() => {
        globalThis.__ms.modes.start('3d', { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] });
        globalThis.__ms.forcePlay();
        globalThis.__ms.aimAt(3);
        globalThis.__ms.click('left');
        globalThis.__ms.pause();
      });
      assert.equal(await mode(), 'paused');
      assert.equal(await focused(), 'p-resume');
      if (inert) for (const id of ['hud', 'c2d', 'menu', 'scene']) assert.equal(await isInert(id), true, `#${id} is inert behind the pause card`);
      assert.equal(await isInert('pause'), false);
      await tabWalk('#pause', false, ['#hud-pause']);
      await tabWalk('#pause', true, ['#hud-pause']);

      // The confirmation contains the pause card: the Look sensitivity slider is never reached.
      await ms(() => document.getElementById('p-menu').click());
      assert.match(await ms(() => document.getElementById('pause-confirm').textContent), /count as a loss/);
      assert.equal(await focused(), 'p-confirm-no');
      assert.equal(await ms(() => document.getElementById('p-sens').getBoundingClientRect().width > 0), true, 'the slider shows under the confirmation');
      if (inert) assert.equal(await ms(() => !!document.getElementById('p-sens').closest('[inert]')), true, 'the slider is inert');
      await tabWalk('#pause-confirm', false, ['#p-sens', '#hud-pause']);
      await tabWalk('#pause-confirm', true, ['#p-sens', '#hud-pause']);
      // The D-pad walk stays inside the confirmation too.
      await ms(() => document.getElementById('p-confirm-no').focus());
      for (const d of [BTN.DOWN, BTN.DOWN, BTN.DOWN, BTN.UP, BTN.UP, BTN.UP, BTN.UP, BTN.RIGHT, BTN.RIGHT, BTN.LEFT, BTN.LEFT, BTN.DOWN]) {
        await tap(d);
        const at = await ms(() => ({ id: document.activeElement?.id, inside: document.getElementById('pause-confirm').contains(document.activeElement) }));
        assert.equal(at.inside, true, `the D-pad left the confirmation for ${at.id}`);
      }
      // Back cancels it: the pause card's default is focused, the slider is live again.
      await tap(BTN.B);
      assert.equal(await ms(() => document.getElementById('pause-confirm').classList.contains('hidden')), true);
      assert.equal(await focused(), 'p-resume', 'the controller\'s Back refocuses Resume');
      assert.equal(await ms(() => !!document.getElementById('p-sens').closest('[inert]')), false);
      await ms(() => document.getElementById('p-menu').click());
      await page.keyboard.press('Escape');
      assert.equal(await focused(), 'p-resume', 'Esc refocuses Resume');
      await ms(() => document.getElementById('p-menu').click());
      await page.click('#p-confirm-no');
      assert.equal(await focused(), 'p-resume', 'Cancel refocuses Resume');
      assert.equal(await mode(), 'paused');

      // Resuming lifts the containment: nothing is left inert on the board.
      await ms(() => globalThis.__ms.pauser.resume('pad'));
      assert.equal(await mode(), 'playing');
      for (const id of ['hud', 'c2d', 'menu', 'pause', 'scene']) assert.equal(await isInert(id), false, `#${id} is live in play`);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

  test(`in a browser ${how}, focus stays inside the results card and the replay viewer over a finished Classic 2D board`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    try {
      const { page, errors, ms, mode, focused, isInert, tabWalk } = await open(browser, base, { inert });

      // Win a fixed Beginner board.
      await page.click('#menu-entry-classic-2d');
      if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
      await page.click('#c2d-choice [data-size="beginner"]');
      const centres = await ms(() => {
        const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
        const L = globalThis.__ms.board2D.layout;
        return Array.from({ length: 81 }, (_, c) => ({
          x: r.left + L.offsetX + ((c % 9) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / 9) + 0.5) * L.tile,
        }));
      });
      const first = 40;
      const mines = await ms(async (fc) => {
        const { generate } = await import('/js/generation/generate.js');
        return [...generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: fc, noGuess: false, seed: 12345 }).mines];
      }, first);
      await page.mouse.click(centres[first].x, centres[first].y);
      await page.waitForFunction(() => globalThis.__ms.modes.state.started);
      for (let c = 0; c < 81 && (await mode()) === 'classic-2d'; c++) {
        if (!mines.includes(c)) await page.mouse.click(centres[c].x, centres[c].y);
      }
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');

      // The results card: the overlay bar and the board layer are inert; Tab never reaches the HUD.
      assert.equal(await focused(), 'r-again');
      if (inert) for (const id of ['hud', 'c2d']) assert.equal(await isInert(id), true, `#${id} is inert behind the results card`);
      await tabWalk('#results', false, ['#hud-pause']);
      await tabWalk('#results', true, ['#hud-pause']);

      // The replay viewer over the board: the board layer and its HUD are inert.
      await page.click('#r-watch');
      assert.equal(await mode(), 'replay');
      await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
      if (inert) for (const id of ['hud', 'c2d', 'results']) assert.equal(await isInert(id), true, `#${id} is inert behind the replay viewer`);
      assert.equal(await isInert('replay'), false);
      await tabWalk('#replay', false, ['#hud-pause']);
      await tabWalk('#replay', true, ['#hud-pause']);

      // Back to the results screen focuses Play again, with the results card live again.
      await page.click('#rp-back');
      assert.equal(await mode(), 'results');
      assert.equal(await focused(), 'r-again');
      assert.equal(await isInert('results'), false);
      await tabWalk('#results', false, ['#hud-pause']);

      // The menu: nothing is inert.
      await page.click('#r-menu');
      assert.equal(await mode(), 'menu');
      for (const id of ['menu', 'hud', 'c2d', 'results', 'replay']) assert.equal(await isInert(id), false, `#${id} is live on the menu`);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
