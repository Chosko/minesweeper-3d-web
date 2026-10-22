import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await page.waitForTimeout(800);
console.log('mode', await mode(page));
console.log('body text:\n' + await page.evaluate(() => document.body.innerText));
await shot(page, '20-c2d-beginner-fresh');
const box = await page.locator('#c2d-board canvas').first().boundingBox();
console.log('box', box);
const cell = box.width / 9;
const at = (c, r) => [box.x + (c + 0.5) * cell, box.y + (r + 0.5) * cell];
// first click centre
await page.mouse.click(...at(4, 4)); await page.waitForTimeout(1200);
console.log('after first click: started', await page.evaluate(() => globalThis.__ms.modes.state?.started), 'hud', await page.evaluate(() => document.getElementById('c2d-counters')?.innerText.replace(/\n/g,' ')));
await shot(page, '21-c2d-beginner-after-first-click');
// right click to flag somewhere, then pause
await page.mouse.click(...at(0, 0), { button: 'right' }); await page.waitForTimeout(200);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('paused mode', await mode(page));
await shot(page, '22-c2d-paused');
await page.click('#p-resume'); await page.waitForTimeout(300);
// click randomly until lost or won
let outcome = null; let n = 0;
const cells = []; for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([c, r]);
cells.sort(() => Math.random() - 0.5);
for (const [c, r] of cells) {
  await page.mouse.click(...at(c, r)); n++;
  await page.waitForTimeout(150);
  const m = await mode(page);
  const st = await page.evaluate(() => globalThis.__ms.modes.state);
  if (m !== 'classic-2d' || (st && st.finished)) { outcome = { m, st }; break; }
}
console.log('clicks', n, 'outcome', JSON.stringify(outcome));
await shot(page, '23-c2d-end-moment');
await page.waitForTimeout(400);
await shot(page, '23b-c2d-end-plus-400ms');
await page.waitForTimeout(1500);
console.log('mode after end', await mode(page));
console.log('results text:\n' + await page.evaluate(() => document.body.innerText));
console.log('focused', await page.evaluate(() => document.activeElement?.id + ' / ' + document.activeElement?.textContent?.trim().slice(0,30)));
await shot(page, '24-c2d-results');
// Can I still see the board (where the mines were)? Is the results screen full-window?
console.log('results buttons', await page.evaluate(() => [...document.querySelectorAll('#results button, [data-screen=results] button, .results button')].filter(b=>b.offsetParent).map(b => [b.id, b.textContent.trim(), b.className])));
// Esc on results
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('after Esc on results', await mode(page));
// Back to classic 2d choice: last-choice memory
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
console.log('choice focused', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.size), 'noguess', await page.evaluate(() => document.getElementById('c2d-noguess').checked));
await shot(page, '25-c2d-choice-return');
// Play again path from results: start another beginner, then results -> Play again
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await page.waitForTimeout(500);
await page.mouse.click(...at(4, 4)); await page.waitForTimeout(500);
// restart during game: confirmation?
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.click('#p-restart'); await page.waitForTimeout(300);
console.log('after Restart: confirm visible?', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), 'text:', await page.evaluate(() => document.getElementById('pause-confirm')?.innerText));
await shot(page, '26-c2d-restart-confirm');
await page.click('#p-confirm-yes'); await page.waitForTimeout(500);
console.log('after confirm restart: mode', await mode(page), 'started', await page.evaluate(() => globalThis.__ms.modes.state?.started));
// leave-page guard
page.on('dialog', async (d) => { console.log('DIALOG', d.type(), d.message()); await d.dismiss(); });
await page.mouse.click(...at(4, 4)); await page.waitForTimeout(500);
const guard = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); const r = window.dispatchEvent(e); return { defaultPrevented: e.defaultPrevented, returnValue: e.returnValue }; });
console.log('beforeunload guard', guard);
await browser.close();
