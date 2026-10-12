import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-3d'); await page.waitForTimeout(400);
const info = () => page.evaluate(() => ({ text: document.getElementById('c-info')?.textContent.trim(), cls: document.getElementById('c-info')?.className, x: document.getElementById('c-x').value, y: document.getElementById('c-y').value, z: document.getElementById('c-z').value, m: document.getElementById('c-m').value, ng: { checked: document.getElementById('c-noguess').checked, disabled: document.getElementById('c-noguess').disabled, label: document.querySelector('label[for="c-noguess"]')?.innerText, reason: document.getElementById('c-noguess').closest('.ui-switch, label, div')?.parentElement?.innerText.replace(/\n/g,' | ') } }));
const set = async (x, y, z, m) => { for (const [id, v] of [['c-x', x], ['c-y', y], ['c-z', z], ['c-m', m]]) if (v !== undefined) await page.fill('#' + id, String(v)); await page.waitForTimeout(150); return info(); };
console.log('initial', await info());
console.log('1x1x1 m1', await set(1, 1, 1, 1));
console.log('1x1x1 m0', await set(1, 1, 1, 0));
await shot(page, '31-3d-custom-1x1x1');
console.log('100x100x100 m blank', await set(100, 100, 100, ''));
console.log('100x100x100 m999999', await set(100, 100, 100, 999999));
console.log('100x100x100 m999998', await set(100, 100, 100, 999998));
console.log('101', await set(101, 10, 10, 10));
console.log('0', await set(0, 10, 10, 10));
console.log('side 2: 5x2x5', await set(5, 2, 5, 10));
await shot(page, '32-3d-custom-side2');
console.log('>8000: 21x20x20', await set(21, 20, 20, 10));
await shot(page, '32-3d-custom-over8000');
console.log('8000: 20x20x20', await set(20, 20, 20, 10));
// click the disabled switch
await page.evaluate(() => document.getElementById('c-noguess').click());
console.log('after click ng on 20^3', await info());
console.log('>8000 with ng on: 21x20x20', await set(21, 20, 20, 10));
console.log('back to 20^3', await set(20, 20, 20, 10));
// Random
for (let i = 0; i < 4; i++) { await page.click('#c-random'); await page.waitForTimeout(150); console.log('random', i, await info()); }
await shot(page, '33-3d-custom-random');
// Start invalid
await set(5, 5, 5, 125);
await page.click('#c-start'); await page.waitForTimeout(300);
console.log('after start invalid', await mode(page), 'focused', await page.evaluate(() => document.activeElement?.id));
// preset no-guess switch label text and whether it carries any explanation
console.log('bc-noguess block text', await page.evaluate(() => document.getElementById('bc-noguess').closest('.ui-card, section, fieldset, div').innerText.replace(/\n/g,' | ').slice(0,300)));
// Large no-guess custom: 20x20x20 with max mines?  what is the limit for 8000 cells
console.log('20^3 max', await set(20, 20, 20, 7999));
await page.evaluate(() => { const e = document.getElementById('c-noguess'); if (!e.checked) e.click(); });
console.log('20^3 ng on 7999', await info());
await page.click('#c-start'); await page.waitForTimeout(1000);
console.log('after start 20^3 ng mode', await mode(page));
console.log('body:\n' + await page.evaluate(() => document.body.innerText));
await shot(page, '34-3d-ready-card-20cubed');
await browser.close();
