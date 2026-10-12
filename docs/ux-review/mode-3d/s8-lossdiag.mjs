import { launch, shot, frames, sleep, forcePlay } from './lib.mjs';
const { browser, page } = await launch({ width: 640, height: 400 });
const idx = (i, j, k) => i + 6 * (j + 6 * k);
const minesXYZ = [[1, 1, 4], [4, 1, 4], [2, 4, 4], [4, 4, 5], [0, 3, 5], [3, 2, 5], [5, 5, 3], [1, 5, 5], [5, 0, 4], [2, 2, 3]];
const mines = minesXYZ.map(([i, j, k]) => idx(i, j, k));
await page.evaluate((m) => globalThis.__ms.start(6, 6, 6, 10, m), mines);
await forcePlay(page);
await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx(0, 0, 0));
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
await page.evaluate(() => globalThis.__ms.look(Math.PI, 0));
const log = await page.evaluate(async (c) => {
  const m = globalThis.__ms; m.key('Space', true); const s = m.aimAt(c);
  const t0 = performance.now(); m.click('left'); m.key('Space', false);
  const out = [{ sel: s }];
  for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 100)); out.push({ t: Math.round(performance.now() - t0), mode: m.state.mode, state: m.game.state, flash: getComputedStyle(document.getElementById('flash')).opacity, anim: m.renderer.isAnimating(), fps: Math.round(m.fps) }); if (m.state.mode === 'results') break; }
  return out;
}, idx(2, 2, 3));
console.log(JSON.stringify(log));
await shot(page, '90-after-loss');
console.log('mode now', await page.evaluate(() => globalThis.__ms.state.mode), 'modes.state', JSON.stringify(await page.evaluate(() => globalThis.__ms.modes.state)));
await browser.close();
