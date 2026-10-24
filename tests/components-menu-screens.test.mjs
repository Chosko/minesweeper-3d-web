// The main menu and the screens it opens in a browser, readable under the contrast contract: the menu with its
// focus walk and previews, Settings, the replay viewer, Records, Daily, every board choice
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
      return { id: el.id, selectable: el.matches('.ui-button, .ui-menu__item, .ui-play-tile, .ui-small-entry, .ui-option'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), transform: s.transform };
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

    // Every main menu button readable selected too: its full colour under its label.
    for (const id of ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily', 'records', 'settings']) {
      await page.focus(`#menu-entry-${id}`);
      await page.waitForFunction((x) => document.getElementById(`menu-entry-${x}`).getAnimations().every((a) => a.playState !== 'running'), id, { timeout: patience(1000) });
      await check(page, `#menu-entry-${id}`, `menu-selected-${id}`, 1);
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

    // Hexagon and Triangle: each its own board choice in the Classic 2D one's composition, readable — its name
    // heading the body, its boards, Beginner with no-guess on and no Last played chip by default, the panel
    // closed and Play alone in the foot; Custom and Insert Board Code open the panel on their own, and the
    // panel's pin is the one every mode shares.
    for (const [entry, prefix, name, beginner] of [['hexagon', 'hex', 'Hexagon', '9 × 9 · 13 mines'], ['triangle', 'tri', 'Triangle', '13 × 7 · 8 mines']]) {
      await page.click(`#menu-entry-${entry}`);
      assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), `${entry}-choice`);
      const screen = await page.evaluate((p) => {
        const root = document.getElementById(`${p}-choice`);
        return {
          title: document.getElementById(`${p}-choice-title`).textContent,
          focus: document.activeElement.dataset.size,
          beginner: root.querySelector('[data-size="beginner"] .ui-option__size').textContent,
          noGuess: document.getElementById(`${p}-noguess`).checked,
          chips: root.querySelectorAll('.ui-chip').length,
          open: document.getElementById(`${p}-choice-panel`).dataset.open,
          foot: [...root.querySelectorAll(`#${p}-choice-frame > .ui-frame__foot button`)].map((b) => b.id),
          others: ['c2d-choice', 'hex-choice', 'tri-choice', 'board-choice'].filter((id) => id !== `${p}-choice` && !document.getElementById(id).classList.contains('hidden')),
        };
      }, prefix);
      assert.deepEqual(screen, { title: name, focus: 'beginner', beginner, noGuess: true, chips: 0, open: 'false', foot: [`${prefix}-play`], others: [] }, `${name}: its board choice by default`);
      await check(page, `#${prefix}-choice`, `${prefix}-choice`);
      for (const size of ['custom', 'code']) {
        await page.click(`#${prefix}-choice [data-size="${size}"]`);
        assert.equal(await page.evaluate((p) => document.getElementById(`${p}-choice-panel`).dataset.open, prefix), 'true', `${name}: ${size} opens the panel`);
      }
      await page.click(`#${prefix}-choice [data-size="custom"]`);
      await check(page, `#${prefix}-choice`, `${prefix}-choice-custom`);
      await page.click(`#${prefix}-choice [data-size="beginner"]`);
      await page.click(`#${prefix}-panel-toggle`);
      assert.equal(await page.evaluate((p) => document.getElementById(`${p}-choice-panel`).dataset.open, prefix), 'true', `${name}: pinned open`);
      await page.click(`#${prefix}-choice-back`);
      assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
      await page.click('#menu-entry-classic-2d');
      assert.equal(await page.evaluate(() => document.getElementById('c2d-panel-toggle').getAttribute('aria-pressed')), 'true', `${name}'s pin pins Classic 2D's panel too`);
      await page.click('#c2d-panel-toggle');
      await page.click('#c2d-choice-back');
    }

    // The placeholder in its frame, readable: Back focused with its key hint; the title bar's Back its arrow alone.
    await page.click('#menu-entry-surface');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'coming-soon');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'coming-soon-back');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#coming-soon .ui-key-hint__key')].map((k) => k.closest('button').id)), ['coming-soon-back']);
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

test('in a browser, the title bar: the logo drawn letter by letter in its colours, the window buttons press and do nothing on the web, the arrow keys and Tab reach each of them, a phone shows only Back and the logo', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    // Every title bar's logo is drawn: MINESWEEPER and 3D, a colour per letter, the first a light blue, 3D yellow.
    const logo = await page.evaluate(() => {
      const logos = [...document.querySelectorAll('.ui-frame__logo')];
      const letters = (l) => [...l.querySelectorAll('.ui-logo__letter')];
      const first = letters(document.getElementById('menu-title'));
      return {
        drawn: logos.every((l) => letters(l).map((x) => x.textContent).join('') === 'MINESWEEPER3D'),
        count: logos.length,
        colours: first.slice(0, 7).map((x) => getComputedStyle(x).color),
        three: getComputedStyle(first[11]).color,
        outline: getComputedStyle(first[0]).textShadow.includes('rgb(255, 255, 255)'),
        name: document.getElementById('menu-title').getAttribute('aria-label'),
      };
    });
    assert.ok(logo.drawn && logo.count >= 9, `every title bar's logo drawn (${logo.count})`);
    assert.deepEqual(logo.colours, ['rgb(111, 159, 247)', 'rgb(255, 107, 107)', 'rgb(73, 198, 184)', 'rgb(160, 132, 245)', 'rgb(95, 208, 126)', 'rgb(255, 154, 60)', 'rgb(111, 159, 247)'],
      'blue, coral, teal, violet, green, orange, repeating');
    assert.equal(logo.three, 'rgb(255, 201, 60)', '3D yellow');
    assert.ok(logo.outline, 'a white outline');
    assert.equal(logo.name, 'Minesweeper 3D');

    // The board choice's title bar: Back, then the arrow keys walk right to Minimise, Fullscreen and Quit.
    await page.click('#menu-entry-classic-2d');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d-choice');
    const mode = 'classic-2d-choice';
    await page.focus('#c2d-choice-back');
    const walked = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      walked.push(await page.evaluate(() => document.activeElement.dataset.window ?? document.activeElement.id));
    }
    assert.deepEqual(walked, ['minimise', 'fullscreen', 'quit'], 'the arrow keys, as the D-pad, reach every window button');
    await page.focus('#c2d-choice-back');
    const tabbed = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      tabbed.push(await page.evaluate(() => document.activeElement.dataset.window ?? document.activeElement.id));
    }
    assert.deepEqual(tabbed, ['minimise', 'fullscreen', 'quit'], 'Tab reaches them in order');
    // On the web each presses and does nothing: no action, no message, no confirmation, no lock.
    for (const name of ['minimise', 'fullscreen', 'quit']) {
      await page.click(`#c2d-choice-frame [data-window="${name}"]`);
      const after = await page.evaluate((n) => ({
        mode: globalThis.__ms.state.mode, toast: document.getElementById('toast').classList.contains('on'),
        fullscreen: document.fullscreenElement !== null, disabled: document.querySelector(`#c2d-choice-frame [data-window="${n}"]`).disabled,
        confirm: !document.getElementById('pause').classList.contains('hidden'),
      }), name);
      assert.deepEqual(after, { mode, toast: false, fullscreen: false, disabled: false, confirm: false }, `${name} does nothing on the web`);
    }
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#c2d-choice-frame .ui-frame__head .ui-button')].map((b) => {
      const r = b.getBoundingClientRect();
      return [b.dataset.window ?? b.id, Math.round(r.width), Math.round(r.height), b.getAttribute('title')];
    }));
    assert.deepEqual(sizes, [['c2d-choice-back', 38, 38, 'Back'], ['minimise', 38, 38, 'Minimise'], ['fullscreen', 38, 38, 'Fullscreen'], ['quit', 38, 38, 'Quit']], '38 px squares, each with its tooltip');
    // A phone shows only Back and the logo.
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(() => ({
      buttons: [...document.querySelectorAll('#c2d-choice-frame [data-window]')].map((b) => b.getClientRects().length),
      back: document.getElementById('c2d-choice-back').getClientRects().length,
      logo: document.querySelector('#c2d-choice-frame .ui-frame__logo').getBoundingClientRect().width > 0,
    }));
    assert.deepEqual(phone, { buttons: [0, 0, 0], back: 1, logo: true }, 'Back and the logo only');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back still returns to the menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
