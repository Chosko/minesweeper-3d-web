// The 3D game's cards in a browser, readable under the contrast contract: the pause card and its confirmation,
// the board status card while generating and its failure offer, and an ended game's card. The results
// layout's contrast is the gallery's, in tests/components.test.mjs.
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

test('in a browser, the pause card, its confirmation and the board status card meet the contrast contract', async (t) => {
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
    // A game in progress on the same board, its first click beside a mine so it goes on.
    await page.evaluate(() => {
      globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10, minePositions: [1, 50, 80, 100, 120, 140, 160, 180, 200, 215] });
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
    });
    assert.equal(await page.evaluate(() => globalThis.__ms.state.started), true, 'the game is in progress');
    await page.click('#hud-pause');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-resume', 'Resume takes the focus');
    assert.ok(await page.evaluate(() => ['ui-button--primary', 'ui-button--go'].every((c) => document.getElementById('p-resume').classList.contains(c))), 'Resume is the green primary action');
    assert.ok(await page.evaluate(() => document.getElementById('p-restart').classList.contains('ui-button--secondary')), 'Restart beside it is a secondary button');
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
    // The card at each artboard's size: its width and padding, two equal columns on a desktop, one on a phone.
    const layout = () => page.evaluate(() => {
      const card = document.getElementById('pause-card');
      const s = getComputedStyle(card);
      const first = card.querySelector('.ui-column').getBoundingClientRect();
      const list = document.getElementById('pause-list').getBoundingClientRect();
      return { width: Math.round(card.getBoundingClientRect().width), padding: s.padding, side: list.left >= first.right, firstW: Math.round(first.width), listW: Math.round(list.width) };
    });
    for (const [width, height, cardW] of [[1920, 1080, 920], [1366, 768, 880], [1024, 768, 860]]) {
      await page.setViewportSize({ width, height });
      const l = await layout();
      assert.equal(l.width, cardW, `the card is ${cardW} wide at ${width} × ${height}`);
      assert.equal(l.padding, '26px 28px', `its padding at ${width} × ${height}`);
      assert.ok(l.side && Math.abs(l.firstW - l.listW) <= 1, `two equal columns at ${width} × ${height} (${l.firstW}, ${l.listW})`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await layout();
    assert.equal(phone.padding, '18px', 'its padding on a phone');
    assert.equal(phone.side, false, 'one column on a phone');
    // The title block: the title, the full board line in bold, the status line in the mono face.
    await page.setViewportSize({ width: 1920, height: 1080 });
    const head = await page.evaluate(() => ['pause-title', 'pause-board', 'pause-sub'].map((id) => {
      const s = getComputedStyle(document.getElementById(id));
      return { size: s.fontSize, weight: s.fontWeight, family: s.fontFamily, top: s.marginTop, text: document.getElementById(id).textContent };
    }));
    assert.deepEqual([head[0].size, head[0].weight], ['34px', '800'], 'Paused, 34 px heavy');
    assert.deepEqual([head[1].size, head[1].weight, head[1].top], ['15px', '700', '6px'], 'the board line, 15 px bold, 6 px under the title');
    assert.equal(head[1].text, '3D · Cube Intro · 6 × 6 × 6 · 10 mines', 'the full board line: mode, board, size and mines');
    assert.deepEqual([head[2].size, head[2].top], ['15px', '4px'], 'the status line, 15 px, 4 px under the board line');
    assert.match(head[2].family, /JetBrains Mono/, 'the status line in the mono face');
    // Each action leads with its icon: play, cube, restart, arrow left.
    assert.deepEqual(await page.evaluate(() => ['p-resume', 'p-home', 'p-restart', 'p-menu'].map((id) => document.querySelector(`#${id} > .ui-icon`)?.dataset.icon ?? null)),
      ['play', 'cube', 'restart', 'arrow-left']);
    // Sound and Invert look Y as switch rows: the label on the left, the switch at the row's right edge.
    assert.deepEqual(await page.evaluate(() => ['p-sound', 'p-invert'].map((id) => {
      const input = document.getElementById(id);
      const row = input.closest('.ui-switchrow').getBoundingClientRect();
      const label = document.querySelector(`label[for="${id}"]`).getBoundingClientRect();
      return label.left < input.getBoundingClientRect().left && Math.abs(row.right - input.getBoundingClientRect().right) <= 1;
    })), [true, true]);
    await page.setViewportSize({ width: 1100, height: 900 });
    assert.deepEqual(await page.evaluate(() => ['p-resume', 'p-home', 'p-restart', 'p-menu'].map((id) => document.querySelector(`#${id} .ui-key-hint__key`)?.textContent ?? null)),
      ['Esc', null, 'F2', null], 'Resume and Restart show the keys that work on the card');
    await page.click('#p-menu');
    await page.click('#p-confirm-yes');
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
    assert.match(order[0][1], /ui-button--primary ui-button--go/, 'the green primary action');
    assert.equal(await page.evaluate(() => document.getElementById('p-resume').offsetParent), null, 'an ended game has nothing to resume');
    assert.equal(await page.evaluate(() => document.querySelector('#p-restart [data-label]').textContent), 'Play again');
    assert.equal(await page.evaluate(() => document.querySelector('#p-restart .ui-key-hint__key')?.textContent), 'F2', 'its key hint stays');
    assert.equal(await page.evaluate(() => document.getElementById('pause-sub').textContent), 'No game in progress: the game is over.', 'the status line: the game is over');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-restart', 'Play again takes the focus');
    // Back on an ended game's card goes to the main menu, asking nothing.
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back leaves an ended game for the menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
