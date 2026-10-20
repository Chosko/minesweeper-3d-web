import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
const confirmVisible = () => page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'));
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.mouse.click(640, 400); await page.waitForTimeout(800);
console.log('mode', await mode(page), 'lock', await page.evaluate(() => !!document.pointerLockElement));
console.log('game keys', await page.evaluate(() => Object.keys(globalThis.__ms.game || {})));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('Esc before first click -> mode', await mode(page), 'lock', await page.evaluate(() => !!document.pointerLockElement));
console.log('pause card (unstarted) buttons', await page.evaluate(() => [...document.querySelectorAll('#pause .ui-actions button')].filter(b => b.offsetParent).map(b => b.textContent)));
await page.click('#p-restart'); await page.waitForTimeout(300);
console.log('restart before first click asks?', await confirmVisible(), 'mode', await mode(page));
if (await confirmVisible()) await page.click('#p-confirm-no');
await page.click('#p-menu'); await page.waitForTimeout(300);
console.log('main menu before first click asks?', await confirmVisible(), 'mode', await mode(page));
if (await confirmVisible()) { await page.click('#p-confirm-yes'); await page.waitForTimeout(300); }
console.log('mode', await mode(page));
// Memory on return
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
console.log('3D choice focus on return', await page.evaluate(() => document.activeElement?.dataset?.preset || document.activeElement?.id));
// Esc on ready card and Back on ready card
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('Esc on ready card -> mode', await mode(page));
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
const backSel = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && b.textContent.trim() === 'Back' && b.id !== 'board-choice-back')?.id);
console.log('ready back id', backSel);
await page.click('#' + backSel); await page.waitForTimeout(300);
console.log('Back on ready card -> mode', await mode(page));
// Play: click to play, first reveal, then resume from pause -> is the "Click to play" card shown again?
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.mouse.click(640, 400); await page.waitForTimeout(500);
await page.evaluate(() => { globalThis.__ms.aimAt([0, 0, 0]); globalThis.__ms.click('left'); }); await page.waitForTimeout(1500);
console.log('started', await page.evaluate(() => globalThis.__ms.modes.state.started), 'game state', await page.evaluate(() => globalThis.__ms.game.state));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await page.click('#p-resume'); await page.waitForTimeout(500);
console.log('after Resume: mode', await mode(page), 'lock', await page.evaluate(() => !!document.pointerLockElement));
console.log('body after resume:\n' + (await body()).slice(0, 400));
await shot(page, '58-3d-after-resume');
if (await mode(page) === 'ready') { await page.mouse.click(640, 400); await page.waitForTimeout(500); console.log('clicked again -> mode', await mode(page)); }
// find a mine and click it to lose
const mineIdx = await page.evaluate(() => { const g = globalThis.__ms.game; for (const k of ['mines','isMine','cells','cell']) { if (k in g) console.log('has', k); } return null; });
const probe = await page.evaluate(() => { const g = globalThis.__ms.game; const out = {}; for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g)).concat(Object.keys(g))) out[k] = typeof g[k]; return out; });
console.log('game api', JSON.stringify(probe));
await browser.close();
