import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
const info = () => page.evaluate(() => ({ text: document.getElementById('c2d-info')?.textContent.trim(), cls: document.getElementById('c2d-info')?.className, w: document.getElementById('c2d-width').value, h: document.getElementById('c2d-height').value, m: document.getElementById('c2d-mines').value }));
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(500);
const setCustom = async (w, h, m) => { await page.fill('#c2d-width', String(w)); await page.fill('#c2d-height', String(h)); if (m !== undefined) await page.fill('#c2d-mines', String(m)); await page.waitForTimeout(150); return info(); };
console.log('empty w', await setCustom('', 5, 1));
console.log('5x5 m0', await setCustom(5, 5, 0));
console.log('5x5 m24', await setCustom(5, 5, 24));
console.log('5x5 m25', await setCustom(5, 5, 25));
await shot(page, '11-c2d-custom-5x5-25');
await page.click('#c2d-start'); await page.waitForTimeout(300);
console.log('after start invalid mode', await mode(page), 'focused', await page.evaluate(() => document.activeElement?.id));
console.log('placeholders', await page.evaluate(() => ['c2d-width','c2d-height','c2d-mines'].map(id => { const e = document.getElementById(id); return [id, e.placeholder, e.min, e.max, e.type, e.inputMode]; })));
console.log('noguess', await page.evaluate(() => { const el = document.querySelector('#c2d-choice input[type=checkbox], #c2d-choice [role=switch]'); return el ? { id: el.id, tag: el.tagName, checked: el.checked ?? el.getAttribute('aria-checked'), label: document.querySelector(`label[for="${el.id}"]`)?.textContent, title: el.title, describedBy: el.getAttribute('aria-describedby') } : 'none'; }));
console.log('innerText:\n' + await page.evaluate(() => document.getElementById('c2d-choice').innerText));
// Does the mines value auto-adjust when size shrinks? set 30x16x99 then 5x5
await setCustom(30, 16, 99);
await page.fill('#c2d-width', '5'); await page.fill('#c2d-height', '5'); await page.waitForTimeout(150);
console.log('after shrink to 5x5 (mines left at 99?)', await info());
// typing 9 then 99 in width (progressive typing)
await page.fill('#c2d-width', ''); await page.type('#c2d-width', '9'); await page.waitForTimeout(100); console.log('typed 9', await info());
await page.type('#c2d-width', '9'); await page.waitForTimeout(100); console.log('typed 99', await info());
// Toggle no guess
await page.evaluate(() => { const el = document.querySelector('#c2d-choice input[type=checkbox], #c2d-choice [role=switch]'); el.click(); });
await page.waitForTimeout(200);
console.log('noguess after click', await page.evaluate(() => { const el = document.querySelector('#c2d-choice input[type=checkbox], #c2d-choice [role=switch]'); return el.checked ?? el.getAttribute('aria-checked'); }));
await shot(page, '12-c2d-choice-noguess-on');
// Large no-guess custom: 100x100 with 2480 mines
await setCustom(100, 100, 2480);
await page.click('#c2d-start'); await page.waitForTimeout(800);
console.log('after start 100x100 ng mode', await mode(page));
console.log('innerText body (before click):\n' + await page.evaluate(() => document.body.innerText));
await shot(page, '13-c2d-100x100-ng-before-click');
// click the middle cell
const box = await page.locator('#c2d-board canvas').boundingBox();
console.log('canvas box', box);
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.waitForTimeout(600);
console.log('mode after first click', await mode(page));
console.log('innerText body (generating?):\n' + await page.evaluate(() => document.body.innerText));
await shot(page, '14-c2d-100x100-ng-generating');
// Try to cancel with Esc while generating
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('after Esc during generating mode', await mode(page));
await shot(page, '14b-c2d-generating-esc');
console.log('innerText body:\n' + await page.evaluate(() => document.body.innerText));
// wait for the outcome (up to 60 s)
const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 90000) {
  await page.waitForTimeout(1000);
  const txt = await page.evaluate(() => document.body.innerText);
  const m = await mode(page);
  const started = await page.evaluate(() => globalThis.__ms.modes.state?.started);
  if (txt !== last) { console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s] mode=${m} started=${started}\n` + txt.slice(0, 600)); last = txt; }
  if (/try again|standard/i.test(txt)) { await shot(page, '15-c2d-ng-failure-offer'); break; }
  if (started) { await shot(page, '15-c2d-ng-started'); break; }
}
await browser.close();
