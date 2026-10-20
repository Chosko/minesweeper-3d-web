// The main menu and the screens it opens in a browser, readable under the contrast contract: the menu with its
// focus walk and previews, Settings, the replay viewer, Records, Daily, both board choices
// and the placeholder; the __ms hook's surface and the menu scene's sky.
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

// The debug hook's surface, pinned so the screen rebuild leaves it unchanged.
const MS_HOOK = ['state', 'game', 'renderer', 'camera', 'fps', 'frameStats', 'spawnPose', 'THREE', 'start', 'learn', 'learnBoard', 'learnPrompts', 'forcePlay',
  'controls', 'pads', 'pause', 'cellCenter', 'moveTo', 'look', 'aimAt', 'mouseDown', 'mouseUp', 'click', 'key', 'wheel',
  'selected', 'pickBrute', 'pickWith', 'info', 'modes', 'pauser', 'settings', 'records', 'replayViewer', 'replays', 'board2D', 'game2D', 'watch', 'daily'];

test('in a browser, the menu and the screens it opens meet the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-screens-')) : null;
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
    assert.deepEqual(await page.evaluate(() => Object.keys(globalThis.__ms)), MS_HOOK, 'the __ms hook is unchanged');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    await check(page, '#menu', 'menu');
    // Keyboard focus shows its focused state on every control of the menu, in tab order.
    const menuControls = await page.evaluate(() => [...document.querySelectorAll('#menu button, #menu input, #menu a[href]')]
      .filter((e) => e.getBoundingClientRect().width > 0).length);
    // The menu opens with its default target focused: start the Tab walk from the menu layer's top instead.
    await page.mouse.click(2, 2);
    for (let i = 0; i < menuControls; i++) {
      await page.keyboard.press('Tab');
      const f = await ring(page);
      assert.ok(focusShows(f), `menu control #${f.id || i} shows its focused state (${f.style} ${f.width} ${f.transform})`);
    }

    // Each preview of the menu, readable: the cards' names and notes on the panel, the daily board's tag.
    for (const id of ['hexagon', 'records', 'quit', 'daily']) {
      await page.focus(`#menu-entry-${id}`);
      await check(page, '#menu-preview', `menu-preview-${id}`, 1);
    }

    // The Settings page in its frame, readable.
    await page.click('#menu-entry-settings');
    await check(page, '#settings-frame', 'settings');
    // The replay viewer in its frame: the figures, the board area and the controls, readable.
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    await check(page, '#replay-frame', 'replay');
    await page.evaluate(() => globalThis.__ms.replayViewer.command('end'));
    await check(page, '#replay-controls', 'replay-end');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The Records screen over a won and a lost game: its frame, figures, muted overall row and the outcome chips in
    // the games table, then the Leaderboards tab's coming-soon panel.
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const board = { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false };
      for (const [id, outcome, endedAt] of [['c1', 'won', '2026-10-08T12:00:00.000Z'], ['c2', 'lost', '2026-10-09T12:00:00.000Z']]) {
        globalThis.__ms.records.record({ id, board, outcome, elapsedMs: 40000, bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 5, clicks,
          bbbvPerSecond: 0.5, efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      }
    });
    await page.click('#menu-entry-records');
    await check(page, '#records', 'records');
    await page.click('#records-tab-leaderboards');
    await check(page, '#records-leaderboards', 'records-leaderboards', 2);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The Daily screen: its mode options with their chips and board lines, the selected mode's state, code chip and
    // bottom bar, then a coming-soon mode's card, readable.
    await page.click('#menu-entry-daily');
    await check(page, '#daily', 'daily');
    await page.click('#daily-entry-hexagon');
    await check(page, '#daily', 'daily-coming-soon');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The Classic 2D board choice in each of its selections, readable, its options showing their focused state.
    await page.click('#menu-entry-classic-2d');
    await check(page, '#c2d-choice', 'c2d-choice');
    await page.keyboard.press('ArrowDown');
    const opt = await ring(page);
    assert.ok(opt.selectable && focusShows(opt), `a board option shows its focused state (${opt.style} ${opt.transform})`);
    await page.click('#c2d-choice [data-size="custom"]');
    await page.fill('#c2d-mines', '999');
    await check(page, '#c2d-choice', 'c2d-choice-custom');
    await page.click('#c2d-choice [data-size="code"]');
    await page.fill('#c2d-code', 'nonsense');
    await check(page, '#c2d-choice', 'c2d-choice-code');
    await page.click('#c2d-choice-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The placeholder in its frame, readable: Back focused, its key hint and the head's beside it.
    await page.click('#menu-entry-hexagon');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'coming-soon');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'coming-soon-back');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#coming-soon .ui-key-hint__key')].map((k) => k.textContent)), ['Esc', 'Esc']);
    await check(page, '#coming-soon', 'coming-soon', 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll');
    await page.click('#coming-soon-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'the head\'s Main menu goes back');

    // The menu's demo board: the shell hands the renderer the theme's sky.
    const sky = await page.evaluate(() => globalThis.__ms.renderer.scenePalette);
    assert.deepEqual(sky.horizon, [0x2b, 0x3f, 0x8a], 'Joyful tiles\' sky');
    // The menu screens sit on the scene with no hard-coded tint.
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('menu')).backgroundColor), 'rgba(0, 0, 0, 0)');

    // The 3D board choice in each of its selections, readable, Learn 3D's option showing its focused state.
    await page.click('#menu-entry-3d');
    await check(page, '#board-choice', 'board-choice');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    const learnOpt = await ring(page);
    assert.equal(learnOpt.id, 'bc-learn');
    assert.ok(learnOpt.selectable && focusShows(learnOpt), `Learn 3D shows its focused state (${learnOpt.style} ${learnOpt.transform})`);
    await page.click('#bc-learn');
    await check(page, '#board-choice', 'board-choice-learn');
    await page.click('#board-choice [data-preset="custom"]');
    await page.fill('#c-y', '2');
    await page.fill('#c-m', '9999');
    await check(page, '#board-choice', 'board-choice-custom');
    await page.click('#board-choice [data-preset="code"]');
    await page.fill('#bc-code', 'nonsense');
    await check(page, '#board-choice', 'board-choice-code');
    await page.click('#board-choice-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
