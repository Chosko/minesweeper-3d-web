import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
const lock = () => page.evaluate(() => !!document.pointerLockElement);
const confirmVisible = () => page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'));
const log = (...a) => console.log(...a);
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.mouse.click(640, 400); await page.waitForTimeout(600);
// A1: pause before first click, Restart -> what state?
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#p-restart'); await page.waitForTimeout(600);
log('A1 restart unstarted -> mode', await mode(page), 'lock', await lock(), 'ready card visible', await page.evaluate(() => { const r = document.getElementById('ready'); return r && !r.classList.contains('hidden') && getComputedStyle(r).display !== 'none'; }));
await shot(page, '70-3d-after-restart-unstarted');
log('body:\n' + (await body()).slice(0, 300));
// what does a click do now?
await page.mouse.click(640, 400); await page.waitForTimeout(800);
log('A1 click after -> mode', await mode(page), 'lock', await lock(), 'started', await page.evaluate(() => globalThis.__ms.modes.state.started), 'game state', await page.evaluate(() => globalThis.__ms.game.state));
await shot(page, '70b-3d-click-after-restart');
// A2: Resume after pause in a started game
if (!(await page.evaluate(() => globalThis.__ms.modes.state.started))) { await page.evaluate(() => { globalThis.__ms.aimAt([0,0,0]); globalThis.__ms.click('left'); }); await page.waitForTimeout(1200); }
log('started now', await page.evaluate(() => globalThis.__ms.modes.state.started));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#p-resume'); await page.waitForTimeout(600);
log('A2 resume -> mode', await mode(page), 'lock', await lock());
log('body:\n' + (await body()).slice(0, 300));
await shot(page, '71-3d-after-resume');
if (await mode(page) !== 'playing') { await page.mouse.click(640, 400); await page.waitForTimeout(600); log('click -> mode', await mode(page), 'lock', await lock()); }
// A3: leave-page guard
const guard = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
log('A3 beforeunload prevented in 3D', guard);
// A4: lose by clicking cubes until lost
let n = 0; const N = await page.evaluate(() => globalThis.__ms.game.n);
const order = [...Array(N).keys()].sort(() => Math.random() - 0.5);
for (const idx of order) {
  const st = await page.evaluate((i) => { const g = globalThis.__ms.game; if (g.state !== 'playing') return g.state; globalThis.__ms.aimAt(i); globalThis.__ms.click('left'); return g.state; }, idx);
  n++;
  if (st !== 'playing') { log('ended after', n, 'clicks:', st); break; }
  if (n > 150) break;
}
await page.waitForTimeout(300);
await shot(page, '72-3d-end-effect-300ms');
log('mode +300ms', await mode(page));
await page.waitForTimeout(2500);
log('mode +2.8s', await mode(page));
log('results body:\n' + await body());
await shot(page, '73-3d-results');
log('results focus', await page.evaluate(() => document.activeElement?.id));
// A5: Watch replay
await page.click('#r-watch'); await page.waitForTimeout(1500);
log('replay mode', await mode(page));
log('replay body:\n' + (await body()).slice(0, 600));
await shot(page, '74-3d-replay');
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
log('Esc from replay -> mode', await mode(page));
// A6: Records from results
if (await mode(page) === 'results') { await page.click('#r-records'); await page.waitForTimeout(600); }
log('records mode', await mode(page));
log('records body:\n' + await body());
await shot(page, '75-records-after-3d-loss');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
log('Esc from records -> mode', await mode(page));
// A7: menu "Last played" badges
log('menu badges', await page.evaluate(() => [...document.querySelectorAll('#menu button')].map(b => { const badge = [...b.querySelectorAll('*')].find(e => /Last played/.test(e.textContent) && e.children.length === 0); return [b.id, badge ? getComputedStyle(badge).display + '/' + getComputedStyle(badge).visibility : 'none']; })));
await shot(page, '76-menu-returning');
// A8: Play again loop until a win on 2x2x2 with 1 mine
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="custom"]');
for (const [id, v] of [['c-x', 2], ['c-y', 2], ['c-z', 2], ['c-m', 1]]) await page.fill('#' + id, String(v));
log('2x2x2 info', await page.evaluate(() => document.getElementById('c-info').textContent));
await page.click('#bc-play'); await page.waitForTimeout(800);
log('mode', await mode(page));
await page.mouse.click(640, 400); await page.waitForTimeout(500);
let won = false;
for (let attempt = 0; attempt < 25 && !won; attempt++) {
  if (await mode(page) !== 'playing') { log('attempt', attempt, 'not playing:', await mode(page)); break; }
  let st = 'playing';
  for (let i = 0; i < 8 && st === 'playing'; i++) {
    st = await page.evaluate((i) => { const g = globalThis.__ms.game; globalThis.__ms.aimAt(i); globalThis.__ms.click('left'); return g.state; }, i);
    await page.waitForTimeout(80);
  }
  log('attempt', attempt, '->', st);
  await page.waitForTimeout(2800);
  if (st === 'won') { won = true; break; }
  log('after loss mode', await mode(page));
  await page.click('#r-again'); await page.waitForTimeout(800);
  log('after Play again -> mode', await mode(page), 'lock', await lock());
  if (attempt === 0) await shot(page, '77-3d-after-play-again');
  if (await mode(page) === 'ready') { await page.mouse.click(640, 400); await page.waitForTimeout(500); }
}
log('won?', won, 'mode', await mode(page));
log('win results body:\n' + await body());
await shot(page, '78-3d-win-results');
await page.click('#r-records'); await page.waitForTimeout(600);
await shot(page, '79-records-after-win');
log('records body:\n' + await body());
await browser.close();
