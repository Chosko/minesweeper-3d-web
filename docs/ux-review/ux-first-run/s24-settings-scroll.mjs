import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-settings'); await page.waitForTimeout(400);
const info = await page.evaluate(() => { const b = document.getElementById('settings-back'); const r = b.getBoundingClientRect(); const scroller = (() => { let e = b; while (e && e !== document.body) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) return e.id || e.className; e = e.parentElement; } return 'document'; })(); return { backTop: r.top, inner: innerHeight, scroller, docScroll: document.documentElement.scrollHeight }; });
console.log('settings back button', info);
await page.evaluate(() => { const b = document.getElementById('settings-back'); b.scrollIntoView(); });
await page.waitForTimeout(300);
await shot(page, '03b-settings-bottom');
// check for description text near the no-guess switches and the custom mines field in 2D (title attrs)
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
console.log('c2d-noguess attrs', await page.evaluate(() => { const e = document.getElementById('c2d-noguess'); return { title: e.title, aria: e.getAttribute('aria-describedby'), labelHtml: e.closest('label')?.outerHTML.slice(0, 300) }; }));
// What does the theme switch look like at the main menu level? none. OK
// 2D: large custom (100x100) board fits? and mines counter cap
await page.click('#c2d-choice [data-size="custom"]'); await page.fill('#c2d-width', '100'); await page.fill('#c2d-height', '100'); await page.fill('#c2d-mines', '2480');
await page.click('#c2d-play'); await page.waitForTimeout(800);
console.log('100x100 canvas', await page.evaluate(() => { const c = document.querySelector('#c2d-board canvas'); const p = c.parentElement; return { cw: c.width, ch: c.height, scrollW: p.scrollWidth, scrollH: p.scrollHeight, clientW: p.clientWidth, overflow: getComputedStyle(p).overflow, hudMines: document.getElementById('c2d-mines-left').textContent, scrollbar: p.offsetWidth - p.clientWidth }; }));
await page.mouse.move(640, 440); await page.mouse.wheel(0, 600); await page.waitForTimeout(400);
await shot(page, '17-c2d-100x100-scrolled');
await browser.close();
