import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await page.waitForTimeout(800);
const t0 = Date.now();
await page.mouse.click(637, 440);
const t1 = Date.now();
console.log('click took', t1 - t0, 'ms');
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => ({ hud: document.getElementById('c2d-time').textContent, now: Date.now(), pnow: performance.now(), hidden: document.hidden, vis: document.visibilityState }));
  console.log(`wall +${((Date.now() - t1)/1000).toFixed(2)}s hud=${r.hud} hidden=${r.hidden}`);
}
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('wall at pause', ((Date.now() - t1)/1000).toFixed(2), 'pause card', await page.evaluate(() => document.querySelector('#pause')?.innerText.split('\n').slice(0,3).join(' | ')));
await browser.close();
