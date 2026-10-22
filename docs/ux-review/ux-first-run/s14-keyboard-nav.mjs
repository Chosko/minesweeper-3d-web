import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
const active = () => page.evaluate(() => { const a = document.activeElement; return `${a.tagName.toLowerCase()}#${a.id || a.dataset?.size || a.dataset?.preset || ''} "${a.textContent?.trim().slice(0,20) || a.value}"`; });
console.log('menu initial focus', await active());
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
// Enter on Classic 2D via keyboard
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('Enter on Classic 2D -> mode', await mode(page), 'focus', await active());
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
// Enter on the Beginner preset by keyboard
await page.focus('#c2d-choice [data-size="beginner"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
console.log('Enter on Beginner -> mode', await mode(page));
// Keyboard-only 2D play: arrows + space
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space'); await page.waitForTimeout(800);
console.log('after Space: started', await page.evaluate(() => globalThis.__ms.modes.state?.started));
await shot(page, '60-c2d-keyboard-first-reveal');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('pause focus', await active());
for (const k of ['ArrowDown', 'ArrowDown', 'Tab', 'Tab', 'Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('Esc on pause -> mode', await mode(page));
// pause, Main menu via keyboard, confirm via keyboard
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.focus('#p-menu'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
console.log('confirm focus', await active());
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
console.log('Esc on confirm -> mode', await mode(page), 'confirm hidden', await page.evaluate(() => document.getElementById('pause-confirm').classList.contains('hidden')));
await page.focus('#p-menu'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('Enter on confirm -> mode', await mode(page));
// 3D choice keyboard
await page.focus('#menu-entry-3d'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('3D choice focus', await active());
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab', 'Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
await page.focus('#board-choice [data-preset="6,6,6,10"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
console.log('Enter on cube Beginner -> mode', await mode(page), 'focus', await active());
await page.keyboard.press('Enter'); await page.waitForTimeout(800);
console.log('Enter on ready card -> mode', await mode(page));
await page.keyboard.press('Space'); await page.waitForTimeout(800);
console.log('Space on ready card -> mode', await mode(page));
// Settings keyboard: Tab through and Esc back; also records
await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('after Esc', await mode(page));
if (await mode(page) !== 'menu') { await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('after Esc 2', await mode(page)); }
await page.focus('#menu-entry-settings'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('settings focus', await active());
for (const k of ['Tab','Tab','Tab','Tab','ArrowRight']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('Esc from settings ->', await mode(page));
await page.focus('#menu-entry-records'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
console.log('records focus', await active());
for (const k of ['ArrowRight','ArrowDown','Tab','Tab']) { await page.keyboard.press(k); console.log(k, '->', await active()); }
await page.keyboard.press('Escape'); await page.waitForTimeout(200); console.log('Esc from records ->', await mode(page));
await browser.close();
