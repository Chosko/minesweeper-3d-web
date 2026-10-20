import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
const lock = () => page.evaluate(() => !!document.pointerLockElement);
const log = (...a) => console.log(...a);
// Esc / Back on the ready card
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
log('Esc on ready card -> mode', await mode(page));
if (await mode(page) !== 'board-choice') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); log('-> ', await mode(page)); }
if (await mode(page) === 'menu') { await page.click('#menu-entry-3d'); await page.waitForTimeout(300); }
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
const backId = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Back' && b.id !== 'board-choice-back')?.id);
await page.click('#' + backId); await page.waitForTimeout(300);
log('Back (' + backId + ') on ready card -> mode', await mode(page));
// 3x3x3 with 1 mine
await page.click('#board-choice [data-preset="custom"]');
for (const [id, v] of [['c-x', 3], ['c-y', 3], ['c-z', 3], ['c-m', 1]]) await page.fill('#' + id, String(v));
await page.click('#bc-play'); await page.waitForTimeout(800);
await page.mouse.click(640, 400); await page.waitForTimeout(500);
log('mode', await mode(page), 'lock', await lock());
let won = false;
for (let attempt = 0; attempt < 12 && !won; attempt++) {
  let st = 'playing';
  const n = await page.evaluate(() => globalThis.__ms.game.n);
  for (let i = 0; i < n && st === 'playing'; i++) {
    const r = await page.evaluate((i) => { const g = globalThis.__ms.game; const sel = globalThis.__ms.aimAt(i); globalThis.__ms.click('left'); return { sel, st: g.state, left: g.minesLeft }; }, i);
    st = r.st;
    if (attempt === 0 && i < 4) log('  i', i, JSON.stringify(r));
    await page.waitForTimeout(60);
  }
  log('attempt', attempt, '->', st, 'mode', await mode(page));
  if (st === 'won') { await page.waitForTimeout(350); await shot(page, '77-3d-win-effect'); }
  else if (st === 'lost') { await page.waitForTimeout(350); if (attempt === 0) await shot(page, '72b-3d-loss-effect'); }
  await page.waitForTimeout(2800);
  log('  mode after wait', await mode(page));
  if (st === 'won') { won = true; break; }
  if (await mode(page) !== 'results') { log('stuck; body:\n' + (await body()).slice(0, 300)); break; }
  await page.click('#r-again'); await page.waitForTimeout(800);
  log('  Play again -> mode', await mode(page), 'lock', await lock());
  if (attempt === 0) { await shot(page, '77-3d-after-play-again'); }
  if (await mode(page) === 'ready') { await page.mouse.click(640, 400); await page.waitForTimeout(500); }
}
log('won?', won, 'mode', await mode(page));
log('win results body:\n' + await body());
await shot(page, '78-3d-win-results');
await page.click('#r-menu'); await page.waitForTimeout(300);
log('Back to menu -> ', await mode(page));
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
log('3D choice on return: focus', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.preset), 'fields', await page.evaluate(() => ['c-x','c-y','c-z','c-m'].map(i => document.getElementById(i).value)));
await shot(page, '79b-3d-choice-after-custom');
await page.click('#menu-entry-records').catch(() => {});
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.click('#menu-entry-records'); await page.waitForTimeout(500);
await shot(page, '79-records-after-win');
log('records body:\n' + (await body()).slice(0, 700));
await browser.close();
