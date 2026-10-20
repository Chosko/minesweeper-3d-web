import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-records'); await page.waitForTimeout(600);
console.log('mode', await mode(page));
console.log('records text:\n' + await page.evaluate(() => document.body.innerText));
console.log('focused', await page.evaluate(() => document.activeElement?.id + ' / ' + document.activeElement?.textContent?.trim().slice(0,30)));
await shot(page, '40-records-empty');
// switch to 3D
await page.evaluate(() => [...document.querySelectorAll('#records button')].find(b => b.textContent.trim() === '3D')?.click()); await page.waitForTimeout(400);
await shot(page, '40-records-empty-3d');
console.log('records 3d text:\n' + await page.evaluate(() => document.body.innerText));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('after esc', await mode(page));
await browser.close();
// storage failure: block IndexedDB and localStorage
const { chromium } = await import('./lib.mjs');
const b2 = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b2.newContext({ viewport: { width: 1280, height: 800 } });
await ctx.addInitScript(() => {
  try { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } }); } catch (e) {}
  try { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); } catch (e) {}
});
const p2 = await ctx.newPage();
p2.on('pageerror', (e) => console.log('PAGEERROR', e.message));
p2.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
await p2.goto('http://127.0.0.1:8080/index.html');
await p2.waitForTimeout(3000);
console.log('blocked storage: has __ms', await p2.evaluate(() => globalThis.__ms !== undefined));
console.log('blocked storage body text:\n' + await p2.evaluate(() => document.body.innerText));
await shot(p2, '41-storage-blocked-menu');
try {
  await p2.click('#menu-entry-records'); await p2.waitForTimeout(600);
  console.log('records with blocked storage:\n' + await p2.evaluate(() => document.body.innerText));
  await shot(p2, '41-storage-blocked-records');
  await p2.keyboard.press('Escape');
  await p2.click('#menu-entry-classic-2d'); await p2.waitForTimeout(300);
  await p2.click('#c2d-choice [data-size="beginner"]'); await p2.click('#c2d-play'); await p2.waitForTimeout(600);
  const box = await p2.locator('#c2d-board canvas').boundingBox();
  await p2.mouse.click(box.x + box.width/2, box.y + box.height/2); await p2.waitForTimeout(1500);
  console.log('game with blocked storage:\n' + await p2.evaluate(() => document.body.innerText));
  await shot(p2, '41-storage-blocked-game');
} catch (e) { console.log('ERR', e.message); }
await b2.close();
