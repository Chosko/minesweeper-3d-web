// The 3D game's cards in a browser, readable under the contrast contract: the pause card and its confirmation,
// the board status card while generating and its failure offer, an ended game's card, and the results layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { browserSuite } from './helpers/browser.mjs';
import { measureContrast, focusShows } from './helpers/contrast.mjs';
import { patience } from './helpers/timing.mjs';
// The page modules components.test.mjs imports, imported here too so the affected-tests mapping
// selects this file for every change that selects that one.
import '../js/ui/components.js';
import '../js/ui/kit-catalogue.js';
import '../js/settings/bindings.js';
import '../js/gamepad.js';
import '../js/ui.js';
import '../js/shell/navigation.js';

const suite = browserSuite();
// The element screenshots are artefacts for a person to look at: taken only with MS_SHOTS=1.
const SHOTS = process.env.MS_SHOTS === '1';

test('in a browser, the pause card, its confirmation, the board status card and the results layout meet the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-pause-')) : null;
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Contrast of the text inside one element, and the focus ring a keyboard focus draws there.
  const check = async (page, selector, label, minRuns = 5) => {
    await frames(page);
    if (SHOTS) await page.locator(selector).screenshot({ path: join(shots, `${label}.png`) });
    const { runs } = await page.evaluate(measureContrast);
    const own = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => e.textContent.trim().slice(0, 30)), selector);
    const mine = runs.filter((r) => own.includes(r.text));
    assert.ok(mine.length >= minRuns, `${label}: its text is measured (${mine.length})`);
    const failing = mine.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
    assert.deepEqual(failing, [], `${label}: text below the contrast contract`);
  };
  // The focused control's look once its move has settled: its transitions finished.
  const ring = async (page) => {
    await frames(page);
    await page.waitForFunction(() => document.activeElement.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: patience(1000) });
    return page.evaluate(() => {
      const el = document.activeElement;
      const s = getComputedStyle(el);
      return { id: el.id, selectable: el.matches('.ui-button, .ui-menu__item, .ui-mode-entry, .ui-option'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), transform: s.transform };
    });
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A stand-in generation worker: one that never answers, then one that fails at once.
    let worker = 'hang';
    const WORKERS = {
      hang: 'self.onmessage = () => {};',
      fail: "self.onmessage = (e) => self.postMessage({ id: e.data.id, result: { ok: false, reason: 'budget', generatorVersion: 1 } });",
    };
    await page.route('**/js/generation/worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKERS[worker] }));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // menu → 3D board choice → ready → playing → pause, as before.
    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="6,6,6,10"]');
    await page.click('#bc-play');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'ready');
    await page.evaluate(() => globalThis.__ms.forcePlay());
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'playing');
    await page.click('#hud-pause');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-resume', 'Resume takes the focus');
    assert.ok(await page.evaluate(() => document.getElementById('p-resume').classList.contains('ui-button--primary')), 'Resume is the primary action');
    await check(page, '#pause-card', 'pause');
    await page.keyboard.press('Tab');
    const f = await ring(page);
    assert.ok(focusShows(f), `pause control #${f.id} shows its focused state`);
    // A 3D game's card, its longest controls list, fits the smallest desktop window unscrolled, and a phone with no horizontal scroll.
    for (const [width, height, fits] of [[1024, 768, true], [390, 844, false]]) {
      await page.setViewportSize({ width, height });
      const box = await page.evaluate(() => { const o = document.getElementById('pause'); return { sh: o.scrollHeight, ch: o.clientHeight, sw: document.documentElement.scrollWidth, w: innerWidth }; });
      if (fits) assert.ok(box.sh <= box.ch, `the pause card fits ${width} × ${height} (${box.sh} > ${box.ch})`);
      assert.ok(box.sw <= box.w, `no horizontal scroll at ${width} × ${height}`);
    }
    await page.setViewportSize({ width: 1100, height: 900 });
    assert.deepEqual(await page.evaluate(() => ['p-resume', 'p-home', 'p-restart', 'p-menu'].map((id) => document.querySelector(`#${id} .ui-key-hint__key`)?.textContent ?? null)),
      ['Esc', null, 'F2', null], 'Resume and Restart show the keys that work on the card');
    await page.click('#p-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Main menu returns to the menu');

    // A started game's Main menu asks first: the confirmation in place of the actions, readable.
    await page.evaluate(() => {
      globalThis.__ms.modes.start('3d', { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] });
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(3);
      globalThis.__ms.click('left');
      globalThis.__ms.pause();
    });
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    await page.click('#p-menu');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-confirm-no', 'Cancel takes the focus');
    assert.equal(await page.evaluate(() => document.getElementById('pause-actions').classList.contains('hidden')), true);
    await check(page, '#pause-confirm', 'pause-confirm', 3);
    await page.click('#p-confirm-yes');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'confirmed, the game is left');

    // The board status card: the generating card with its progress line, spinner, Cancel and Play a
    // standard board, then the failure offer with its three buttons, readable. Only a
    // no-guess board is generated by the worker.
    const firstClick = () => page.evaluate(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }); globalThis.__ms.forcePlay(); });
    await firstClick();
    await page.waitForFunction(() => !document.getElementById('m3d-status').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => document.getElementById('m3d-spinner').getBoundingClientRect().width > 0), true, 'the spinner shows');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'm3d-cancel', 'Cancel takes the focus');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#m3d-wait button')].map((b) => b.textContent)),
      ['Cancel', 'Play a standard board']);
    await page.waitForFunction(() => /^candidate \d+ · \d+ s$/.test(document.getElementById('m3d-progress').textContent));
    assert.equal(await page.evaluate(() => document.getElementById('m3d-progress').classList.contains('ui-text--muted')), true, 'the progress line is muted text');
    // The second button is reachable by keyboard, and shows the focus ring.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'm3d-wait-standard', 'Play a standard board is the next control');
    const fs = await ring(page);
    assert.ok(focusShows(fs), 'Play a standard board shows its selected state');
    await check(page, '#m3d-status', 'generating', 4);
    worker = 'fail';
    await page.click('#m3d-cancel');
    assert.equal(await page.evaluate(() => document.getElementById('m3d-status').classList.contains('hidden')), true, 'Cancel closes the card');
    await firstClick();
    await page.waitForFunction(() => !document.getElementById('m3d-offer').classList.contains('hidden'));
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#m3d-offer button')].map((b) => b.textContent)),
      ['Retry', 'Play a standard board', 'Main menu']);
    await check(page, '#m3d-status', 'offer');
    await page.click('#m3d-offer-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Main menu from the offer');

    // An ended game: the pause card leads with Play again.
    await page.evaluate(() => {
      globalThis.__ms.start(3, 3, 1, 1, [0]);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
    });
    // a fixed board has no results screen: after the end delay it ends on the pause card
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: patience(2500) });
    assert.equal(await page.evaluate(() => globalThis.__ms.game.state), 'lost');
    const order = await page.evaluate(() => [...document.querySelectorAll('#pause .ui-actions button')].map((b) => [b.id, b.className]));
    assert.equal(order[0][0], 'p-restart', 'Play again comes first once the game ended');
    assert.match(order[0][1], /ui-button--primary/);
    assert.equal(await page.evaluate(() => document.getElementById('p-resume').offsetParent), null, 'an ended game has nothing to resume');
    assert.equal(await page.evaluate(() => document.querySelector('#p-restart [data-label]').textContent), 'Play again');
    assert.equal(await page.evaluate(() => document.querySelector('#p-restart .ui-key-hint__key')?.textContent), 'F2', 'its key hint stays');
    // Back on an ended game's card goes to the main menu, asking nothing.
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back leaves an ended game for the menu');

    const results = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    results.on('pageerror', (e) => errors.push(e.message));
    await results.goto(`${base}/dev/components.html`);
    await check(results, '#g-results', 'results');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
