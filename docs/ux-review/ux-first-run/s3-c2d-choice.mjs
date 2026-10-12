import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
const info = () => page.evaluate(() => ({ text: document.getElementById('c2d-info')?.textContent.trim(), cls: document.getElementById('c2d-info')?.className, startDisabled: document.getElementById('c2d-start')?.disabled, w: document.getElementById('c2d-width').value, h: document.getElementById('c2d-height').value, m: document.getElementById('c2d-mines').value }));
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(500);
console.log('mode', await mode(page));
console.log(JSON.stringify(await visText(page, '#c2d-choice'), null, 1));
console.log('focused', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.size));
console.log('initial custom', await info());
await shot(page, '10-c2d-choice');
const setCustom = async (w, h, m) => { await page.fill('#c2d-width', String(w)); await page.fill('#c2d-height', String(h)); if (m !== undefined) await page.fill('#c2d-mines', String(m)); await page.waitForTimeout(150); return info(); };
console.log('1x1', await setCustom(1, 1, 1));
await shot(page, '11-c2d-custom-1x1');
console.log('1x1 m0', await setCustom(1, 1, 0));
console.log('100x100 m blank', await setCustom(100, 100, ''));
console.log('100x100 m9999', await setCustom(100, 100, 9999));
await shot(page, '11-c2d-custom-100x100-9999');
console.log('101x1', await setCustom(101, 1, 1));
console.log('0x5', await setCustom(0, 5, 1));
console.log('abc', await setCustom('abc', 5, 1));
console.log('empty w', await setCustom('', 5, 1));
console.log('5x5 m0', await setCustom(5, 5, 0));
console.log('5x5 m24', await setCustom(5, 5, 24));
console.log('5x5 m25', await setCustom(5, 5, 25));
await shot(page, '11-c2d-custom-5x5-25');
// Try start with invalid: what happens
await page.click('#c2d-start'); await page.waitForTimeout(300);
console.log('after start invalid mode', await mode(page), 'focused', await page.evaluate(() => document.activeElement?.id));
// placeholders / hints
console.log('placeholders', await page.evaluate(() => ['c2d-width','c2d-height','c2d-mines'].map(id => { const e = document.getElementById(id); return [id, e.placeholder, e.min, e.max, e.type, e.inputMode, document.querySelector(`label[for="${id}"]`)?.textContent]; })));
// no-guess switch
console.log('noguess', await page.evaluate(() => { const el = document.querySelector('#c2d-choice input[type=checkbox], #c2d-choice [role=switch]'); return el ? { id: el.id, checked: el.checked ?? el.getAttribute('aria-checked'), label: document.querySelector(`label[for="${el.id}"]`)?.textContent, title: el.title, describedBy: el.getAttribute('aria-describedby') } : 'none'; }));
console.log('all text with descriptions', await page.evaluate(() => document.getElementById('c2d-choice').innerText));
await browser.close();
