import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
const lock = () => page.evaluate(() => !!document.pointerLockElement);
const log = (...a) => console.log(...a);
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="custom"]');
for (const [id, v] of [['c-x', 2], ['c-y', 2], ['c-z', 2], ['c-m', 1]]) await page.fill('#' + id, String(v));
log('2x2x2 info', await page.evaluate(() => document.getElementById('c-info').textContent));
await page.click('#bc-play'); await page.waitForTimeout(800);
log('mode', await mode(page));
await page.mouse.click(640, 400); await page.waitForTimeout(500);
let won = false;
for (let attempt = 0; attempt < 30 && !won; attempt++) {
  if (await mode(page) !== 'playing') { log('attempt', attempt, 'not playing:', await mode(page)); break; }
  let st = 'playing';
  for (let i = 0; i < 8 && st === 'playing'; i++) {
    st = await page.evaluate((i) => { const g = globalThis.__ms.game; globalThis.__ms.aimAt(i); globalThis.__ms.click('left'); return g.state; }, i);
    await page.waitForTimeout(60);
  }
  log('attempt', attempt, '->', st);
  if (st === 'won') { await page.waitForTimeout(400); await shot(page, '77-3d-win-effect'); }
  await page.waitForTimeout(2800);
  if (st === 'won') { won = true; break; }
  await page.click('#r-again'); await page.waitForTimeout(800);
  log('after Play again -> mode', await mode(page), 'lock', await lock());
  if (attempt === 0) { await shot(page, '77-3d-after-play-again'); log('body after play again:\n' + (await body()).slice(0, 300)); }
  if (await mode(page) === 'ready') { await page.mouse.click(640, 400); await page.waitForTimeout(500); }
}
log('won?', won, 'mode', await mode(page));
log('win results body:\n' + await body());
await shot(page, '78-3d-win-results');
await page.click('#r-records'); await page.waitForTimeout(600);
await shot(page, '79-records-after-win');
log('records body:\n' + (await body()).slice(0, 900));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
log('Esc from records -> ', await mode(page));
await page.click('#r-menu'); await page.waitForTimeout(300);
log('Back to menu -> ', await mode(page));
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
log('3D choice on return: focus', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.preset), 'fields', await page.evaluate(() => ['c-x','c-y','c-z','c-m'].map(i => document.getElementById(i).value)));
await shot(page, '79b-3d-choice-after-custom');
await browser.close();
