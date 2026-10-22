import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const hud = () => page.evaluate(() => document.getElementById('c2d-counters')?.innerText.replace(/\n/g,' '));
for (let i = 0; i < 4; i++) {
  await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
  await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await page.waitForTimeout(800);
  console.log(`run ${i} fresh hud: ${await hud()}`);
  await page.mouse.click(637, 440); await page.waitForTimeout(1200);
  const px = await page.evaluate(({x, y}) => { const c = document.querySelector('#c2d-board canvas'); const r = c.getBoundingClientRect(); return [...c.getContext('2d').getImageData(Math.round(x - r.left), Math.round(y - r.top), 1, 1).data]; }, {x: 637, y: 440});
  console.log(`run ${i}: after click hud: ${await hud()} pixel=${px}`);
  await shot(page, `29-repro2-${i}`);
  await page.waitForTimeout(2000);
  console.log(`run ${i}: +2s hud: ${await hud()}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  console.log(`run ${i}: pause card: ${await page.evaluate(() => document.querySelector('#pause')?.innerText.split('\n').slice(0,3).join(' | '))}`);
  await page.click('#p-menu'); await page.waitForTimeout(200);
  if (await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'))) await page.click('#p-confirm-yes');
  await page.waitForTimeout(300);
  console.log(`run ${i}: back at ${await mode(page)}`);
}
await browser.close();
