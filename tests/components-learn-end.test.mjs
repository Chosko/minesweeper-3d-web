// The Learn 3D end cards in a browser, a lost lesson and a won one, at the 3D scene's card sizes: readable on
// their surface and never wider than the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSuite } from './helpers/browser.mjs';
import { checkCard } from './helpers/contrast.mjs';
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

// The 3D scene's card sizes (J-Ready-xl, -m, -p, -ls): the large and small desktop sizes and a phone held
// either way.
const SIZES = [
  ['xl', { viewport: { width: 1920, height: 1080 } }],
  ['m', { viewport: { width: 1024, height: 768 } }],
  ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ['ls', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }],
];

for (const [size, device] of SIZES) {
  test(`in a browser, the Learn 3D end cards at ${size} fit the window without a sideways scroll and meet the contrast contract`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    const context = await browser.newContext(device);
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined);
      const ms = (fn, arg) => page.evaluate(fn, arg);
      // The Learn 3D end cards: a lost lesson, then a won one.
      for (const won of [false, true]) {
        await ms(() => { globalThis.__ms.learn(); globalThis.__ms.forcePlay(); });
        await ms(() => globalThis.__ms.state.play.reveal(globalThis.__ms.learnBoard.startCell));
        await page.waitForFunction(() => globalThis.__ms.state.started);
        await ms((w) => {
          const g = globalThis.__ms.game;
          const mines = [...globalThis.__ms.learnBoard.minePositions];
          if (!w) globalThis.__ms.state.play.reveal(mines[0]);
          else for (let c = 0; c < g.n; c++) if (!mines.includes(c) && !g.pressed[c]) globalThis.__ms.state.play.reveal(c);
        }, won);
        await page.waitForFunction(() => globalThis.__ms.state.mode === 'learn-end', null, { timeout: patience(7500) });
        assert.equal(await ms(() => document.getElementById('learn-end-primary-label').textContent), won ? 'Play Cube Intro' : 'Try again');
        await checkCard(page, '#learn-end .ui-card', `learn-end-${won ? 'won' : 'lost'}-${size}`);
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
