import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('c2d-noguess').click());
await page.fill('#c2d-width', '100'); await page.fill('#c2d-height', '100'); await page.fill('#c2d-mines', '2480');
await page.click('#c2d-start'); await page.waitForTimeout(800);
const box = await page.locator('#c2d-board canvas').boundingBox();
await page.mouse.click(box.x + 200, box.y + 200);
// click more cells while generating: do they do anything?
await page.waitForTimeout(300);
await page.mouse.click(box.x + 400, box.y + 300);
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  await page.waitForTimeout(500);
  const txt = await page.evaluate(() => document.body.innerText);
  if (/No board found/.test(txt)) break;
}
console.log(`offer after ${((Date.now()-t0)/1000).toFixed(1)}s, mode=${await mode(page)}`);
await shot(page, '15-c2d-ng-failure-offer-clean');
console.log('offer text:\n' + await page.evaluate(() => document.body.innerText.split('\n').slice(0, 12).join('\n')));
console.log('focused', await page.evaluate(() => document.activeElement?.id + ' ' + document.activeElement?.textContent));
console.log('offer buttons', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && /Retry|standard/.test(b.textContent)).map(b => [b.id, b.textContent, b.className])));
// Esc on the offer?
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('after Esc on offer: mode', await mode(page), 'offer visible', await page.evaluate(() => /No board found/.test(document.body.innerText) && !!document.querySelector('#pause.hidden, #pause[hidden]')));
await shot(page, '15b-c2d-ng-offer-esc');
// Choose Play a standard board
const stdBtn = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && /standard/.test(b.textContent))?.id);
console.log('std button id', stdBtn);
if (await mode(page) === 'paused') { await page.click('#p-resume'); await page.waitForTimeout(300); }
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.offsetParent && /standard/.test(b.textContent))?.click());
await page.waitForTimeout(1500);
console.log('after standard: mode', await mode(page), 'started', await page.evaluate(() => globalThis.__ms.modes.state?.started), 'hud', await page.evaluate(() => document.querySelector('.ui-overlay-bar')?.innerText.replace(/\n/g,' ')));
await shot(page, '16-c2d-after-standard');
await browser.close();
