import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const active = () => page.evaluate(() => { const a = document.activeElement; return `${a.tagName.toLowerCase()}#${a.id || a.dataset?.size || a.dataset?.preset || ''} "${(a.textContent?.trim() || a.value || '').slice(0,20)}"`; });
// 2D keyboard first reveal
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
await page.keyboard.press('Enter'); await page.waitForTimeout(800);   // Beginner focused by default
console.log('mode after Enter Enter', await mode(page), 'started', await page.evaluate(() => globalThis.__ms.modes.state?.started), 'focus', await active());
await shot(page, '61-c2d-after-enter-enter');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
await page.keyboard.press('Space'); await page.waitForTimeout(800);
console.log('after Space: started', await page.evaluate(() => globalThis.__ms.modes.state?.started), 'focus', await active());
await page.keyboard.press('Enter'); await page.waitForTimeout(800);
console.log('after Enter: started', await page.evaluate(() => globalThis.__ms.modes.state?.started));
await shot(page, '61-c2d-keyboard-reveal');
// Go back to menu
await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.focus('#p-menu'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
if (!(await page.evaluate(() => document.getElementById('pause-confirm').classList.contains('hidden')))) { await page.focus('#p-confirm-yes'); await page.keyboard.press('Enter'); }
await page.waitForTimeout(300); console.log('mode', await mode(page));
// 3D choice keyboard
await page.focus('#menu-entry-3d'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('3D choice focus', await active());
for (const k of ['ArrowDown', 'ArrowRight', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
await page.focus('#board-choice [data-preset="6,6,6,10"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
console.log('Enter on cube Beginner -> mode', await mode(page), 'focus', await active());
await page.keyboard.press('Enter'); await page.waitForTimeout(800);
console.log('Enter on ready card -> mode', await mode(page), 'lock', await page.evaluate(() => !!document.pointerLockElement));
if (await mode(page) !== 'playing') { await page.keyboard.press('Space'); await page.waitForTimeout(800); console.log('Space on ready card -> mode', await mode(page)); }
await page.keyboard.press('Escape'); await page.waitForTimeout(300); console.log('after Esc', await mode(page));
await page.focus('#p-menu'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('mode', await mode(page), 'confirm?', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')));
if (await mode(page) !== 'menu') { await page.focus('#p-confirm-yes'); await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
console.log('mode', await mode(page));
// Settings keyboard
await page.focus('#menu-entry-settings'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('settings focus', await active());
for (const k of ['Tab','Tab','Tab','Tab','ArrowRight', 'ArrowDown']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
console.log('settings scrollable?', await page.evaluate(() => { const s = document.getElementById('settings'); const c = s.querySelector('.ui-card') || s; return { sh: c.scrollHeight, ch: c.clientHeight, docSh: document.documentElement.scrollHeight, inner: innerHeight }; }));
await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('Esc from settings ->', await mode(page));
// Records keyboard
await page.focus('#menu-entry-records'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('records focus', await active());
for (const k of ['ArrowRight','ArrowDown','Tab','Tab','Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('Esc from records ->', await mode(page));
await browser.close();
