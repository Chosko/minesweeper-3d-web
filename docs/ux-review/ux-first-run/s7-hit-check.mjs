import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await page.waitForTimeout(800);
const box = await page.locator('#c2d-board canvas').first().boundingBox();
const canvasInfo = await page.evaluate(() => { const c = document.querySelector('#c2d-board canvas'); const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, cssW: r.width, cssH: r.height, dpr: devicePixelRatio, style: c.getAttribute('style'), parentStyle: c.parentElement.getAttribute('style'), parentRect: c.parentElement.getBoundingClientRect().toJSON() }; });
console.log(canvasInfo);
// hover over cell (4,4) by the drawn layout (board 9 cells of 76.4 px centred in 1248 width)
const cell = box.height / 9;
const x0 = box.x + (box.width - 9 * cell) / 2;
const cx = x0 + 4.5 * cell, cy = box.y + 4.5 * cell;
console.log('click at', cx, cy);
await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(300);
await shot(page, '27-hit-pressed-4-4');
await page.mouse.up(); await page.waitForTimeout(1000);
await shot(page, '27-hit-released-4-4');
await browser.close();
