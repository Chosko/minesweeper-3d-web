import { launch, shot, mode, info, sleep } from './lib.mjs';

const { browser, page } = await launch();
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText?.replace(/\n+/g, ' | ') ?? null, sel);

await page.click('#menu-entry-3d'); await sleep(300);
if (!(await page.evaluate(() => document.getElementById('bc-noguess').checked))) await page.click('#bc-noguess');
await page.click('[data-preset="6,6,6,10"]'); await sleep(400);
await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(300);
await page.evaluate(() => { const g = globalThis.__ms.game; globalThis.__ms.aimAt(g.idx(3, 3, 0)); globalThis.__ms.click('left'); });
await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 30000 });
await sleep(1500);
// A couple of flags, then a mine.
await page.evaluate(() => { const ms = globalThis.__ms, g = ms.game, s = ms.state.spacing * 4, far = g.Z * s * 2; ms.key('Space', true); let flagged = 0; for (let c = 0; c < g.n && flagged < 2; c++) if (g.number[c] === -1) { const p = ms.cellCenter(c); for (const d of [[0, 0, -far], [0, 0, far], [far, 0, 0], [-far, 0, 0], [0, far, 0], [0, -far, 0]]) { ms.moveTo(p[0] + d[0], p[1] + d[1], p[2] + d[2]); if (ms.aimAt(c) === c) { ms.click('right'); flagged++; break; } } } for (let c = 0; c < g.n; c++) if (g.number[c] === -1 && !g.flagged[c]) { const p = ms.cellCenter(c); for (const d of [[0, 0, -far], [0, 0, far], [far, 0, 0], [-far, 0, 0], [0, far, 0], [0, -far, 0]]) { ms.moveTo(p[0] + d[0], p[1] + d[1], p[2] + d[2]); if (ms.aimAt(c) === c) { ms.click('left'); break; } } if (g.phase !== 'playing') break; } ms.key('Space', false); });
await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 20000 });
console.log('results:', await text('#results'));
await page.click('#r-watch'); await sleep(1500);
console.log('mode:', await mode(page));
console.log('replay screen text:', await page.evaluate(() => document.getElementById('replay')?.innerText?.replace(/\n+/g, ' | ') ?? document.body.innerText.slice(0, 600)));
await shot(page, '60-replay-viewer-3d-start');
await page.keyboard.press('End'); await sleep(1500);
await shot(page, '61-replay-viewer-3d-end');
console.log('replay end text:', await page.evaluate(() => document.getElementById('replay')?.innerText?.replace(/\n+/g, ' | ')));
await page.keyboard.press('Escape'); await sleep(400);
console.log('back to:', await mode(page));
// Play again from results: which screen?
await page.click('#r-again'); await sleep(400);
console.log('after Play again (3D):', await mode(page), 'ready visible:', await page.evaluate(() => !document.getElementById('ready').classList.contains('hidden')));
await shot(page, '62-3d-play-again-screen');
await browser.close();
