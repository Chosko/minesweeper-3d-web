import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
await page.click('#c2d-choice [data-size="custom"]'); await page.fill('#c2d-width', '2'); await page.fill('#c2d-height', '1'); await page.fill('#c2d-mines', '1');
await page.click('#c2d-play'); await page.waitForTimeout(800);
console.log('2x1 mode', await mode(page), 'hud', await page.evaluate(() => document.getElementById('c2d-counters')?.innerText.replace(/\n/g,' ')));
await shot(page, '90-c2d-2x1-board');
const box = await page.locator('#c2d-board canvas').first().boundingBox();
await page.mouse.click(box.x + box.width / 4, box.y + box.height / 2); await page.waitForTimeout(2500);
console.log('after click mode', await mode(page));
console.log('body:\n' + await body());
await shot(page, '91-c2d-2x1-win-results');
await page.click('#r-records'); await page.waitForTimeout(600);
console.log('records body:\n' + await body());
await shot(page, '92-records-after-2x1-win');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
// a 2x2 with 1 mine for a few quick games to populate history; then Expert win not feasible.
// Return to choice: memory should be custom 2x1
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
console.log('choice focus', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.size), 'fields', await page.evaluate(() => [document.getElementById('c2d-width').value, document.getElementById('c2d-height').value, document.getElementById('c2d-mines').value]));
await shot(page, '93-c2d-choice-after-custom');
// Play again from results of custom board: goes straight to a new board?
await page.click('#c2d-play'); await page.waitForTimeout(600);
const b2 = await page.locator('#c2d-board canvas').first().boundingBox();
await page.mouse.click(b2.x + b2.width / 4, b2.y + b2.height / 2); await page.waitForTimeout(2500);
console.log('mode', await mode(page));
await page.click('#r-again'); await page.waitForTimeout(800);
console.log('Play again -> mode', await mode(page), 'hud', await page.evaluate(() => document.getElementById('c2d-counters')?.innerText.replace(/\n/g,' ')));
// Esc on results -> menu; Back to menu button
await browser.close();
