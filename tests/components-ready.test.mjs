// The cards a 3D game shows over its scene in a browser (J-Ready-xl, -m, -p, -ls and J-Ready-states): the ready
// card, its lock states and the context-lost card, readable on their surface and never wider than the window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSuite } from './helpers/browser.mjs';
import { checkCard } from './helpers/contrast.mjs';
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
  test(`in a browser, the 3D ready card, its lock states and the context-lost card at ${size} fit the window without a sideways scroll and meet the contrast contract`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    const context = await browser.newContext(device);
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // Every pointer-lock request refused, so the lock states show.
      await page.addInitScript(() => {
        Element.prototype.requestPointerLock = function requestPointerLock() {
          setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
          return Promise.reject(new Error('blocked'));
        };
      });
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined);
      const ms = (fn, arg) => page.evaluate(fn, arg);
      const touch = !!device.hasTouch;
      await ms(() => globalThis.__ms.modes.start('3d', { X: 8, Y: 8, Z: 8, mines: 40 }));
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
      assert.equal(await ms(() => document.querySelector('#ready-btn .ready-title').textContent), touch ? 'Tap to play' : 'Click to play');
      assert.equal(await ms(() => !document.getElementById('ready-rules').classList.contains('hidden')), true, 'the first-use card');
      await checkCard(page, '#ready .ui-card', `ready-${size}`);
      if (!touch) {
        await ms(() => document.getElementById('ready-btn').click());
        await page.waitForFunction(() => document.getElementById('ready-msg').textContent !== '');
        await page.waitForTimeout(50); // both signals of the refusal have arrived
        await checkCard(page, '#ready .ui-card', `ready-refused-${size}`);
        await ms(() => document.getElementById('ready-btn').click());
        await page.waitForFunction(() => !document.getElementById('ready-blocked').classList.contains('hidden'));
        await checkCard(page, '#ready .ui-card', `ready-blocked-${size}`);
      }

      // The context-lost card: the canvas does not come back.
      await ms(() => { globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }); globalThis.__ms.forcePlay(); });
      await ms(() => globalThis.__ms.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'ctxlost');
      await checkCard(page, '#ctx-lost .ui-card', `ctx-lost-${size}`);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
