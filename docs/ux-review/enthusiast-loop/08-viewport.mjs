// Does Expert fit on a laptop-height viewport? And the replay viewer at 1280×800 / 1366×768.
import { launch, openPage, mode, shot, sleep } from './lib.mjs';

const log = (...a) => console.log(...a);
for (const vp of [{ width: 1366, height: 650 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  const context = await launch({ fresh: false, viewport: vp });
  const page = await openPage(context);
  await page.click('#menu-entry-classic-2d');
  if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
  await page.click('#c2d-choice [data-size="expert"]'); await page.click('#c2d-play');
  await sleep(300);
  const info = await page.evaluate(async () => {
    const { boardLayout } = await import('/js/classic2d/board-view.js');
    const c = document.querySelector('#c2d-board canvas');
    const r = c.getBoundingClientRect();
    const L = boardLayout({ cols: 30, rows: 16, width: r.width, height: r.height });
    return { canvas: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }, tile: L.tile, boardW: L.boardWidth, boardH: L.boardHeight, scrolls: L.scrolls ?? (L.boardHeight > r.height || L.boardWidth > r.width) };
  });
  log(`${vp.width}×${vp.height} Expert game:`, JSON.stringify(info));
  await shot(page, `08-expert-${vp.width}x${vp.height}`);
  // leave to menu (no first click → nothing recorded)
  await page.keyboard.press('Escape');
  await page.click('#p-menu');
  await sleep(100);
  if (await mode(page) !== 'menu') { await page.click('#p-confirm-yes').catch(() => {}); }
  // replay viewer at this viewport
  await page.click('#menu-entry-records');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /2D/.test(x.innerText)); b?.click(); });
  await sleep(200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /^Expert\b/.test(x.innerText.trim()) && !/no-guess/i.test(x.innerText)); b?.click(); });
  await sleep(200);
  await page.evaluate(() => { const rows = [...document.querySelectorAll('#records-replays-body tr')]; const tr = rows.find((r) => /13\.3 s/.test(r.innerText)) ?? rows.at(-1); [...tr.querySelectorAll('button')].find((x) => /Watch/.test(x.innerText))?.click(); });
  await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: 20000 });
  await sleep(300);
  const vinfo = await page.evaluate(async () => {
    const { boardLayout } = await import('/js/classic2d/board-view.js');
    const c = document.querySelector('#replay-board canvas');
    const r = c.getBoundingClientRect();
    const L = boardLayout({ cols: 30, rows: 16, width: r.width, height: r.height });
    const ctrl = document.getElementById('replay-controls').getBoundingClientRect();
    return { canvas: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }, tile: L.tile, boardH: L.boardHeight, scrollsV: L.boardHeight > r.height, controlsTop: Math.round(ctrl.top) };
  });
  log(`${vp.width}×${vp.height} Expert replay viewer:`, JSON.stringify(vinfo));
  await page.keyboard.press('Space');
  await sleep(4000);
  await shot(page, `08-replay-${vp.width}x${vp.height}`);
  await page.keyboard.press('Escape');
  await context.close();
}
