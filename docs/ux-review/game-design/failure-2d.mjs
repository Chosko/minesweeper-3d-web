import { launch, shot, mode, sleep } from './lib.mjs';

const { browser, page } = await launch();
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText?.replace(/\n+/g, ' | ') ?? null, sel);

// 2D custom at the mine cap, no-guess: find a size where no-guess fails. Try the densest allowed boards.
for (const [w, h] of [[9, 9], [5, 5], [4, 4], [3, 3], [8, 8]]) {
  if ((await mode(page)) !== 'classic-2d-choice') { await page.click('#menu-entry-classic-2d'); await sleep(300); }
  await page.fill('#c2d-width', String(w)); await page.fill('#c2d-height', String(h)); await page.fill('#c2d-mines', '999'); await sleep(100);
  const info = await text('#c2d-info');
  const cap = Number((info.match(/to (\d+)/) || [])[1] || 0);
  await page.fill('#c2d-mines', String(cap)); await sleep(100);
  console.log(`\n2D ${w}x${h}: info "${info}" → cap ${cap}, now: "${await text('#c2d-info')}"`);
  if (!(await page.evaluate(() => document.getElementById('c2d-noguess').checked))) await page.click('#c2d-noguess');
  await page.click('#c2d-start'); await sleep(400);
  if ((await mode(page)) !== 'classic-2d') { console.log('  did not start:', await text('#c2d-info')); continue; }
  const box = await page.locator('#c2d-board canvas').boundingBox();
  const t1 = Date.now();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  let tGen2 = null, tFail2 = null, startedMs = null;
  for (let i = 0; i < 600; i++) {
    await sleep(50);
    const s = await page.evaluate(() => ({ hidden: document.getElementById('c2d-status').classList.contains('hidden'), title: document.getElementById('c2d-status-title').textContent, started: globalThis.__ms.modes.state.started }));
    if (!s.hidden && tGen2 === null) tGen2 = Date.now() - t1;
    if (!s.hidden && /No board/.test(s.title)) { tFail2 = Date.now() - t1; break; }
    if (s.started) { startedMs = Date.now() - t1; break; }
  }
  console.log('  generating shown after ms', tGen2, 'failure after ms', tFail2, 'started after ms', startedMs);
  if (tFail2 !== null) {
    console.log('  2D failure card:', await text('#c2d-status'));
    await shot(page, `43-2d-noguess-failure-offer-${w}x${h}`);
    await page.click('#c2d-retry'); await sleep(100);
    console.log('  after Retry, status:', await text('#c2d-status'), 'hidden', await page.evaluate(() => document.getElementById('c2d-status').classList.contains('hidden')));
    await sleep(3000);
    console.log('  after Retry +3 s, status:', await text('#c2d-status'), 'started', await page.evaluate(() => globalThis.__ms.modes.state.started), 'mode', await mode(page));
    await shot(page, `44-2d-after-retry-${w}x${h}`);
    // Play a standard board from the offer, if still offered.
    const offerVisible = await page.evaluate(() => !document.getElementById('c2d-status').classList.contains('hidden'));
    if (offerVisible) { await page.click('#c2d-standard'); await sleep(400); console.log('  after Play a standard board: started', await page.evaluate(() => globalThis.__ms.modes.state.started), 'board label on pause:', ''); }
    await page.keyboard.press('Escape'); await sleep(200);
    console.log('  pause sub:', await text('#pause-sub'));
    await page.click('#p-menu'); await sleep(200);
    if (await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'))) await page.click('#p-confirm-yes');
    await sleep(300);
    break;
  }
  await page.keyboard.press('Escape'); await sleep(200);
  await page.click('#p-menu'); await sleep(200);
  if (await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'))) await page.click('#p-confirm-yes');
  await sleep(300);
}
// Settings screen for the record.
await page.click('#menu-entry-settings'); await sleep(300);
console.log('\nSettings:', await text('#settings'));
await shot(page, '45-settings');
await browser.close();
