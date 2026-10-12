import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type()==='error') errors.push('console: '+m.text()); });
await page.goto(URL); await ready(page);
log('mode', await mode(page), 'focus', await focused(page));
await shot(page, 'k-01-menu');
// Tab order on menu
const order = [];
for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); order.push(await focused(page)); }
log('TAB ORDER menu:\n ' + order.join('\n '));
// shift-tab back to start
// __ms surface
log('__ms keys', await page.evaluate(() => Object.keys(Object.getOwnPropertyDescriptors(globalThis.__ms))));
log('modes keys', await page.evaluate(() => Object.keys(globalThis.__ms.modes)));
// focus first entry and press Enter
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await sleep(300);
log('after Enter mode', await mode(page), 'focus', await focused(page));
await shot(page, 'k-02-c2d-choice');
const order2 = [];
for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); order2.push(await focused(page)); }
log('TAB ORDER c2d choice:\n ' + order2.join('\n '));
// Esc goes back?
await page.keyboard.press('Escape'); await sleep(300);
log('after Esc mode', await mode(page), 'focus', await focused(page));
// Enter again, pick beginner via keyboard
await page.keyboard.press('Enter'); await sleep(300);
log('focus on choice', await focused(page));
await page.keyboard.press('Enter'); await sleep(800);
log('after Enter on preset: mode', await mode(page), 'focus', await focused(page));
await shot(page, 'k-03-c2d-board');
log('errors', errors);
await browser.close();
