import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
for (let i = 0; i < 4; i++) {
  if (await mode(page) !== 'menu') { await page.keyboard.press('Escape'); await page.waitForTimeout(200); if (await mode(page) === 'paused') { await page.click('#p-menu'); await page.waitForTimeout(200); const c = await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')); if (c) await page.click('#p-confirm-yes'); } }
  await page.waitForTimeout(300);
  await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
  await page.click('#c2d-choice [data-size="beginner"]'); await page.waitForTimeout(800);
  const box = await page.locator('#c2d-board canvas').boundingBox();
  const cell = box.height / 9; const x0 = box.x + (box.width - 9 * cell) / 2;
  const col = 2 + i, row = 1 + i;
  const cx = x0 + (col + 0.5) * cell, cy = box.y + (row + 0.5) * cell;
  await page.mouse.click(cx, cy); await page.waitForTimeout(1200);
  // sample pixel colour at the clicked cell centre to tell closed (blue) from revealed (light)
  const px = await page.evaluate(({x, y}) => { const c = document.querySelector('#c2d-board canvas'); const r = c.getBoundingClientRect(); const d = c.getContext('2d').getImageData(Math.round(x - r.left), Math.round(y - r.top), 1, 1).data; return [...d]; }, {x: cx, y: cy});
  console.log(`run ${i}: clicked cell (${col},${row}) at ${cx.toFixed(0)},${cy.toFixed(0)} pixel=${px}`);
  await shot(page, `28-repro-${i}`);
}
await browser.close();
