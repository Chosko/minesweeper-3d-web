import { launch, shot, frames, sleep, info } from './lib.mjs';
const { browser, page } = await launch();
const active = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('data-preset') || a.tagName) + ' :: ' + (a.innerText || '').split('\n')[0] : null; });
await page.click('#menu-entry-3d'); await frames(page, 3);
console.log('board choice first visit, focus:', await active());
await page.keyboard.press('Enter'); await frames(page, 3);
console.log('after Enter: mode', await page.evaluate(() => globalThis.__ms.state.mode), 'board', await page.evaluate(() => document.getElementById('ready-board').textContent));
// go back and play Beginner via UI, then return to the choice
await page.click('#ready-back'); await frames(page, 2);
await page.click('[data-preset="6,6,6,10"]'); await frames(page, 2);
await page.click('#ready-btn'); await sleep(400);
await page.evaluate(() => { const m = globalThis.__ms; m.aimAt(m.selected()); m.click('left'); });
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
// real wheel under lock: spacing chip
const sp0 = (await info(page)).spacing;
await page.mouse.wheel(0, -100); await frames(page, 2);
const sp1 = (await info(page)).spacing;
console.log('wheel up one notch: spacing', sp0, '→', sp1, 'chip:', await page.evaluate(() => document.getElementById('chip-spacing').className + ' / ' + document.getElementById('chip-spacing').textContent));
for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -100);
await frames(page, 2);
console.log('after 26 notches: spacing', (await info(page)).spacing, 'chip:', await page.evaluate(() => document.getElementById('chip-spacing').className + ' / ' + document.getElementById('chip-spacing').textContent));
await shot(page, '91-wheel-26-notches');
await sleep(2000); await frames(page, 2);
console.log('chip after 2 s idle:', await page.evaluate(() => document.getElementById('chip-spacing').className));
// Shift + wheel under lock?
await page.keyboard.down('Shift'); await page.mouse.wheel(0, -100); await page.keyboard.up('Shift'); await frames(page, 2);
console.log('shift+wheel spacing:', (await info(page)).spacing);
// Esc → pause → Main menu → confirm → 3D choice: focus and "Last played"
await page.keyboard.press('Escape'); await sleep(500);
await page.click('#p-menu'); await frames(page, 2);
console.log('confirm shown:', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), await page.evaluate(() => document.getElementById('pause-confirm').innerText.replace(/\n+/g, ' | ')));
await shot(page, '92-menu-confirm');
await page.click('#p-confirm-yes'); await frames(page, 3);
console.log('menu focus:', await active());
await page.click('#menu-entry-3d'); await frames(page, 3);
console.log('board choice returning, focus:', await active(), 'last:', await page.evaluate(() => [...document.querySelectorAll('[data-preset][data-last]')].map((b) => b.innerText.replace(/\n/g, ' / '))));
await shot(page, '93-board-choice-returning-ui');
// keyboard: arrows on the menu
await page.keyboard.press('ArrowDown'); await frames(page, 1);
console.log('after ArrowDown focus:', await active());
// controls modal from the main menu? (menu-help)
await page.click('#board-choice-back'); await frames(page, 2);
await page.click('#menu-help'); await frames(page, 2);
await shot(page, '94-controls-modal');
await browser.close();
