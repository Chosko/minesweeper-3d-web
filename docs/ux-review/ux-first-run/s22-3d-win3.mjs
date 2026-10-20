import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
const lock = () => page.evaluate(() => !!document.pointerLockElement);
const log = (...a) => console.log(...a);
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.waitForTimeout(800);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
log('Esc on ready card -> mode', await mode(page));
while (await mode(page) !== 'menu') { await page.keyboard.press('Escape'); await page.waitForTimeout(300); log('  Esc ->', await mode(page)); }
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.waitForTimeout(800);
const backId = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Back' && b.id !== 'board-choice-back')?.id);
await page.click('#' + backId); await page.waitForTimeout(300);
log('Back (' + backId + ') on ready card -> mode', await mode(page));
await page.click('#board-choice [data-preset="custom"]');
for (const [id, v] of [['c-x', 2], ['c-y', 2], ['c-z', 2], ['c-m', 1]]) await page.fill('#' + id, String(v));
await page.click('#bc-play'); await page.waitForTimeout(800);
await page.mouse.click(640, 400); await page.waitForTimeout(500);
log('mode', await mode(page), 'lock', await lock());
log('numbers before click', await page.evaluate(() => { const g = globalThis.__ms.game; const out = []; for (let i = 0; i < g.n; i++) { try { out.push(g.number[i]); } catch (e) { out.push('err'); } } return out; }));
let won = false;
for (let attempt = 0; attempt < 6 && !won; attempt++) {
  // first click, then wait for the board
  await page.evaluate(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
  await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 60000 });
  const nums = await page.evaluate(() => { const g = globalThis.__ms.game; const out = []; for (let i = 0; i < g.n; i++) out.push(g.number[i]); return out; });
  if (attempt === 0) log('numbers after first click', nums);
  const mine = nums.indexOf(-1);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(400);
  let st = 'playing';
  for (let i = 1; i < 8 && st === 'playing'; i++) {
    if (i === mine) continue;
    st = await page.evaluate((i) => { const g = globalThis.__ms.game; const sel = globalThis.__ms.aimAt(i); globalThis.__ms.mouseDown('left'); return sel; }, i).then(async (sel) => { await page.waitForTimeout(80); return page.evaluate(() => { globalThis.__ms.mouseUp('left'); return globalThis.__ms.game.state; }); });
    if (attempt === 0) log('   click', i, '->', st, 'revealed?', await page.evaluate((i) => globalThis.__ms.game.phase ? globalThis.__ms.game.phase[i] : null, i));
    await page.waitForTimeout(250);
  }
  log('attempt', attempt, 'mine guess', mine, '->', st);
  if (st === 'won') { await page.waitForTimeout(300); await shot(page, '77-3d-win-effect'); won = true; }
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 20000 }).catch(() => {});
  log('  mode', await mode(page));
  if (won) break;
  await page.click('#r-again'); await page.waitForTimeout(800);
  log('  Play again -> mode', await mode(page), 'lock', await lock());
  if (attempt === 0) { await shot(page, '77-3d-after-play-again'); log('  body:\n' + (await body()).slice(0, 250)); }
  if (await mode(page) === 'ready') { await page.mouse.click(640, 400); await page.waitForTimeout(400); }
}
log('won?', won, 'mode', await mode(page));
log('win results body:\n' + await body());
await shot(page, '78-3d-win-results');
await page.click('#r-records'); await page.waitForTimeout(600);
await shot(page, '79-records-after-win');
log('records body:\n' + (await body()).slice(0, 600));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#r-menu'); await page.waitForTimeout(300);
log('Back to menu -> ', await mode(page));
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
log('3D choice on return: focus', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.preset), 'fields', await page.evaluate(() => ['c-x','c-y','c-z','c-m'].map(i => document.getElementById(i).value)));
await shot(page, '79b-3d-choice-after-custom');
await browser.close();
