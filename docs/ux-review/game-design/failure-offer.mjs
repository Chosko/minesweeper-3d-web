import { launch, shot, mode, sleep } from './lib.mjs';

const { browser, page } = await launch();
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText?.replace(/\n+/g, ' | ') ?? null, sel);

// 3D custom board, dense, no-guess: 5 x 5 x 5 with 90 mines (72 %).
await page.click('#menu-entry-3d'); await sleep(300);
await page.click('#board-choice [data-preset="custom"]');
await page.fill('#c-x', '5'); await page.fill('#c-y', '5'); await page.fill('#c-z', '5'); await page.fill('#c-m', '90');
console.log('custom info:', await text('#c-info'), '| reason:', await text('#c-noguess-reason'), '| custom noguess disabled?', await page.evaluate(() => document.getElementById('c-noguess').disabled));
await page.click('#c-noguess');
// Also check what the 2-side and >8000 limit say.
await page.fill('#c-z', '2'); await sleep(100);
console.log('side 2 reason:', await text('#c-noguess-reason'), 'disabled', await page.evaluate(() => document.getElementById('c-noguess').disabled));
await page.fill('#c-x', '30'); await page.fill('#c-y', '30'); await page.fill('#c-z', '30'); await sleep(100);
console.log('27000 cells reason:', await text('#c-noguess-reason'), 'disabled', await page.evaluate(() => document.getElementById('c-noguess').disabled), 'info', await text('#c-info'));
await shot(page, '40-3d-custom-noguess-disabled');
await page.fill('#c-x', '5'); await page.fill('#c-y', '5'); await page.fill('#c-z', '5'); await page.fill('#c-m', '90'); await sleep(100);
console.log('5x5x5/90 reason:', await text('#c-noguess-reason'), 'checked', await page.evaluate(() => document.getElementById('c-noguess').checked));
await page.click('#bc-play'); await sleep(400);
console.log('mode:', await mode(page), 'ready:', await text('#ready-board'));
await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(300);
await page.evaluate(() => globalThis.__ms.aimAt(globalThis.__ms.game.idx(2, 2, 0)));
const t0 = Date.now();
await page.evaluate(() => globalThis.__ms.click('left'));
// Poll the status card.
let seenGenerating = false, seenFailure = false, tGen = null, tFail = null;
for (let i = 0; i < 400; i++) {
  await sleep(50);
  const s = await page.evaluate(() => ({ hidden: document.getElementById('m3d-status').classList.contains('hidden'), title: document.getElementById('m3d-status-title').textContent, offerHidden: document.getElementById('m3d-offer').classList.contains('hidden'), started: globalThis.__ms.modes.state.started }));
  if (!s.hidden && !seenGenerating) { seenGenerating = true; tGen = Date.now() - t0; }
  if (!s.hidden && /No board/.test(s.title) && !seenFailure) { seenFailure = true; tFail = Date.now() - t0; break; }
  if (s.started) { console.log('started instead after ms', Date.now() - t0); break; }
}
console.log('3D dense no-guess: generating shown after ms', tGen, 'failure after ms', tFail);
console.log('3D failure card:', await text('#m3d-status'));
await shot(page, '41-3d-noguess-failure-offer');
// Take "Play a standard board".
await page.click('#m3d-standard'); await sleep(500);
console.log('after standard: started?', await page.evaluate(() => globalThis.__ms.modes.state), 'status hidden', await page.evaluate(() => document.getElementById('m3d-status').classList.contains('hidden')));
await shot(page, '42-3d-after-standard-offer');
// Was a flag placed before the first reveal kept? (test on a fresh Beginner)
await page.keyboard.press('Escape'); await sleep(200); await page.click('#p-menu'); await sleep(200);
const confirmVisible = await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'));
if (confirmVisible) await page.click('#p-confirm-yes');
await sleep(300);

// 2D custom dense no-guess: 9 x 9 with 60 mines.
await page.click('#menu-entry-classic-2d'); await sleep(300);
await page.fill('#c2d-width', '9'); await page.fill('#c2d-height', '9'); await page.fill('#c2d-mines', '60');
console.log('2D custom info:', await text('#c2d-info'));
if (!(await page.evaluate(() => document.getElementById('c2d-noguess').checked))) await page.click('#c2d-noguess');
await page.click('#c2d-start'); await sleep(400);
console.log('2D mode:', await mode(page));
const box = await page.locator('#c2d-board canvas').boundingBox();
const t1 = Date.now();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
let tGen2 = null, tFail2 = null;
for (let i = 0; i < 400; i++) {
  await sleep(50);
  const s = await page.evaluate(() => ({ hidden: document.getElementById('c2d-status').classList.contains('hidden'), title: document.getElementById('c2d-status-title').textContent, started: globalThis.__ms.modes.state.started }));
  if (!s.hidden && tGen2 === null) tGen2 = Date.now() - t1;
  if (!s.hidden && /No board/.test(s.title)) { tFail2 = Date.now() - t1; break; }
  if (s.started) { console.log('2D started instead after ms', Date.now() - t1); break; }
}
console.log('2D dense no-guess: generating shown after ms', tGen2, 'failure after ms', tFail2);
console.log('2D failure card:', await text('#c2d-status'));
await shot(page, '43-2d-noguess-failure-offer');
await page.click('#c2d-retry'); await sleep(300);
console.log('after Retry, status:', await text('#c2d-status'), 'hidden', await page.evaluate(() => document.getElementById('c2d-status').classList.contains('hidden')));
await sleep(1500);
console.log('after Retry +1.5 s, status:', await text('#c2d-status'), 'started', await page.evaluate(() => globalThis.__ms.modes.state.started));
await shot(page, '44-2d-after-retry');
await browser.close();
