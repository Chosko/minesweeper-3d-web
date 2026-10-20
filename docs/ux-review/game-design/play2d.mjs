import { launch, shot, mode, sleep } from './lib.mjs';

const { browser, page } = await launch();
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText?.replace(/\n+/g, ' | ') ?? null, sel);
const hud = () => page.evaluate(() => [document.getElementById('hud-time').textContent, document.getElementById('hud-mines').textContent]);
const started = () => page.evaluate(() => globalThis.__ms.modes.state);

await page.click('#menu-entry-classic-2d'); await sleep(300);
console.log('2D choice focused:', await page.evaluate(() => document.activeElement?.dataset?.size), 'noguess default:', await page.evaluate(() => document.getElementById('c2d-noguess').checked));
await shot(page, '30-2d-choice');

async function startBoard(size, noguess) {
  if ((await mode(page)) !== 'classic-2d-choice') { await page.click('#menu-entry-classic-2d'); await sleep(300); }
  const checked = await page.evaluate(() => document.getElementById('c2d-noguess').checked);
  if (checked !== noguess) await page.click('#c2d-noguess');
  await page.click(`#c2d-choice [data-size="${size}"]`); await page.click('#c2d-play'); await sleep(500);
  const box = await page.locator('#c2d-board canvas').boundingBox();
  return box;
}
function cellXY(box, w, h, col, row) { const t = box.width / w; return [box.x + t * (col + 0.5), box.y + (box.height / h) * (row + 0.5)]; }

for (const [size, w, h] of [['beginner', 9, 9], ['intermediate', 16, 16], ['expert', 30, 16]]) {
  for (const ng of [false, true]) {
    const box = await startBoard(size, ng);
    console.log(`\n2D ${size} noguess=${ng}: canvas ${Math.round(box.width)}x${Math.round(box.height)}, tile ${(box.width / w).toFixed(1)} px, HUD`, await hud());
    const [x, y] = cellXY(box, w, h, Math.floor(w / 2), Math.floor(h / 2));
    const t0 = Date.now();
    await page.mouse.click(x, y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 20000 });
    const dt = Date.now() - t0;
    await sleep(400);
    console.log('  started after ms', dt, 'status card hidden:', await page.evaluate(() => document.getElementById('c2d-status').classList.contains('hidden')), 'HUD', await hud());
    await shot(page, `31-2d-${size}-${ng ? 'noguess' : 'standard'}-first-click`);
    // Leave through pause → main menu (abandon).
    await page.keyboard.press('Escape'); await sleep(200);
    if (size === 'beginner' && !ng) { await shot(page, '32-2d-pause'); console.log('  pause card:', await text('#pause')); }
    await page.click('#p-menu'); await sleep(200);
    await page.click('#p-confirm-yes'); await sleep(300);
  }
}

// Standard Beginner: chord test and a loss on the results screen. Right-click flags on press.
{
  const box = await startBoard('beginner', true);
  const [x, y] = cellXY(box, 9, 9, 4, 4);
  await page.mouse.click(x, y);
  await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 20000 });
  await sleep(300);
  await shot(page, '33-2d-beginner-noguess-opened');
  // Flag a cell at a corner (likely closed), then unflag; check HUD mine count.
  const [cx, cy] = cellXY(box, 9, 9, 0, 0);
  await page.mouse.click(cx, cy, { button: 'right' }); await sleep(150);
  console.log('after right-click corner HUD', await hud());
  await page.mouse.click(cx, cy, { button: 'right' }); await sleep(150);
  console.log('after second right-click HUD', await hud());
  // Left+right chord on the first-click cell (a zero: nothing happens). Press feedback screenshot while held.
  await page.mouse.move(x, y); await page.mouse.down({ button: 'left' }); await page.mouse.down({ button: 'right' }); await sleep(150);
  await shot(page, '34-2d-chord-held');
  await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' });
  // Restart from pause: confirm wording.
  await page.keyboard.press('Escape'); await sleep(200);
  await page.click('#p-restart'); await sleep(200);
  console.log('restart confirm:', await text('#pause-confirm'));
  await shot(page, '35-2d-restart-confirm');
  await page.click('#p-confirm-yes'); await sleep(400);
  console.log('after restart mode:', await mode(page), 'state', await started(), 'HUD', await hud());
  // Reveal cells left to right along the top row until something explodes, to reach a loss screen.
  const box2 = await page.locator('#c2d-board canvas').boundingBox();
  let lost = false;
  for (let r = 0; r < 9 && !lost; r++) for (let c = 0; c < 9 && !lost; c++) {
    const [px, py] = cellXY(box2, 9, 9, c, r);
    await page.mouse.click(px, py); await sleep(60);
    lost = await page.evaluate(() => globalThis.__ms.modes.state.finished);
  }
  const t1 = Date.now();
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 10000 });
  console.log('2D results shown ms after finish detection', Date.now() - t1);
  console.log('2D loss results:', await text('#results'));
  await shot(page, '36-2d-loss-results');
  await page.click('#r-again'); await sleep(400);
  console.log('after Play again:', await mode(page), 'HUD', await hud());
  await shot(page, '37-2d-play-again');
}
await browser.close();
