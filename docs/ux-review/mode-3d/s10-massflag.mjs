import { launch, frames, forcePlay, shot } from './lib.mjs';
const { browser, page } = await launch({ width: 960, height: 600 });
const idx = (i, j, k) => i + 6 * (j + 6 * k);
const minesXYZ = [[1, 1, 4], [4, 1, 4], [2, 4, 4], [4, 4, 5], [0, 3, 5], [3, 2, 5], [5, 5, 3], [1, 5, 5], [5, 0, 4], [2, 2, 3]];
await page.evaluate((m) => globalThis.__ms.start(6, 6, 6, 10, m), minesXYZ.map(([i, j, k]) => idx(i, j, k)));
await forcePlay(page);
await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx(0, 0, 0));
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
const r = await page.evaluate(() => {
  const m = globalThis.__ms, g = m.game;
  // find a revealed number whose closed neighbours outnumber its value
  const nb = (c) => { const [i, j, k] = g.coords(c); const out = []; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) { if (!di && !dj && !dk) continue; const x = i + di, y = j + dj, z = k + dk; if (x < 0 || y < 0 || z < 0 || x >= g.X || y >= g.Y || z >= g.Z) continue; out.push(x + g.X * (y + g.Y * z)); } return out; };
  let pick = -1, closed = 0;
  for (let c = 0; c < g.n; c++) if (g.pressed[c] && g.number[c] > 0) { const cl = nb(c).filter((n) => !g.pressed[n]).length; if (cl > g.number[c] + 2 && cl > closed) { pick = c; closed = cl; } }
  const p = m.cellCenter(pick); m.moveTo(p[0], p[1], p[2] - 1); m.look(Math.PI, 0);
  const sel = m.selected();
  const before = g.minesLeft;
  m.click('right');
  let flags = 0; for (let c = 0; c < g.n; c++) if (g.flagged[c]) flags++;
  return { pick, sel, number: g.number[pick], closedNeighbours: closed, flagsPlaced: flags, minesLeftBefore: before, minesLeftAfter: g.minesLeft, hud: document.getElementById('hud-mines').textContent };
});
console.log(JSON.stringify(r));
await page.evaluate(() => { globalThis.__ms.moveTo(2, 12, -46); globalThis.__ms.look(Math.PI, 0.25); });
await shot(page, '95-mass-flag-result');
await browser.close();
