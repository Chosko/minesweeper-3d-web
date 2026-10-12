import { launch, shot, mode, info, boardStats, sleep } from './lib.mjs';

const { browser, context, page } = await launch();
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.innerText?.replace(/\n+/g, ' | ') ?? null, sel);

async function start3DCustom(x, y, z, m, noguess) {
  if ((await mode(page)) !== 'board-choice') { if ((await mode(page)) !== 'menu') { await page.goto('http://127.0.0.1:8080/index.html'); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(500); } await page.click('#menu-entry-3d'); await sleep(300); }
  await page.fill('#c-x', String(x)); await page.fill('#c-y', String(y)); await page.fill('#c-z', String(z)); await page.fill('#c-m', String(m));
  const checked = await page.evaluate(() => document.getElementById('c-noguess').checked);
  if (checked !== noguess) await page.click('#c-noguess');
  await page.click('#c-start'); await sleep(400);
  await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(300);
}
async function firstClick() {
  await page.evaluate(() => { const g = globalThis.__ms.game; globalThis.__ms.aimAt(g.idx(Math.floor(g.X / 2), Math.floor(g.Y / 2), 0)); globalThis.__ms.click('left'); });
  await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 30000 });
  await sleep(200);
}
// Reveal every safe closed cell by aiming from outside along an axis, with Space held so revealed
// numbers do not block the ray. Returns the number of reveal clicks made.
async function sweep() {
  return page.evaluate(() => {
    const ms = globalThis.__ms, g = ms.game, s = ms.state.spacing * 4;
    ms.key('Space', true);
    let clicks = 0, progress = true, rounds = 0;
    while (progress && g.phase === 'playing' && rounds < 20) {
      progress = false; rounds++;
      for (let c = 0; c < g.n; c++) {
        if (g.phase !== 'playing') break;
        if (g.number[c] === -1 || g.pressed[c] || g.flagged[c]) continue;
        const p = ms.cellCenter(c);
        const far = Math.max(g.X, g.Y, g.Z) * s * 2;
        const dirs = [[far, 0, 0], [-far, 0, 0], [0, far, 0], [0, -far, 0], [0, 0, far], [0, 0, -far]];
        for (const d of dirs) {
          ms.moveTo(p[0] + d[0], p[1] + d[1], p[2] + d[2]);
          if (ms.aimAt(c) === c) { ms.click('left'); clicks++; progress = true; break; }
        }
      }
    }
    ms.key('Space', false);
    return { clicks, rounds, phase: g.phase };
  });
}
async function waitResults(label) {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 20000 });
  const t1 = await page.evaluate(() => performance.now());
  console.log(`${label}: results after ${Math.round(t1 - t0)} ms (page clock, from sweep end)`);
  console.log(`${label}: ${await text('#results')}`);
}

// Game 1: 4x4x4, 3 mines, no-guess. Flags before the first reveal, then the first reveal, then a win.
await start3DCustom(4, 4, 4, 3, true);
console.log('before first reveal: HUD', (await info(page)).hud, 'time', (await info(page)).time);
await page.evaluate(() => { const g = globalThis.__ms.game; globalThis.__ms.aimAt(g.idx(0, 0, 0)); globalThis.__ms.click('right'); });
console.log('after pre-flag: HUD', (await info(page)).hud, 'minesLeft', (await info(page)).minesLeft, 'stats', await boardStats(page));
// Chord before the first reveal does nothing; left click on the flagged cell does nothing.
await page.evaluate(() => { globalThis.__ms.click('chord'); globalThis.__ms.click('left'); });
console.log('after chord/left on pre-flag: started?', await page.evaluate(() => globalThis.__ms.modes.state.started), 'time', (await info(page)).time);
await firstClick();
console.log('after first reveal: flags kept?', (await boardStats(page)).flags, 'HUD', (await info(page)).hud, 'time', (await info(page)).time);
// Unflag that pre-flag (it may be a wrong flag) and sweep to a win.
await page.evaluate(() => { const g = globalThis.__ms.game; globalThis.__ms.aimAt(g.idx(0, 0, 0)); globalThis.__ms.click('right'); });
await sleep(1500);
const sw1 = await sweep();
console.log('sweep 1:', sw1, await boardStats(page));
await waitResults('win 1');
await shot(page, '50-results-win-first');

// Game 2: Play again, win faster.
await page.click('#r-again'); await sleep(300);
console.log('after Play again: mode', await mode(page), 'HUD', (await info(page)).hud);
await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(200);
await firstClick();
const sw2 = await sweep();
console.log('sweep 2:', sw2);
await waitResults('win 2');
await shot(page, '51-results-win-second');

// Game 3: Play again, lose.
await page.click('#r-again'); await sleep(300);
await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(200);
await firstClick();
await page.evaluate(() => { const ms = globalThis.__ms, g = ms.game, s = ms.state.spacing * 4; ms.key('Space', true); for (let c = 0; c < g.n; c++) if (g.number[c] === -1) { const p = ms.cellCenter(c); const far = g.Z * s * 2; for (const d of [[0, 0, -far], [0, 0, far], [far, 0, 0], [-far, 0, 0], [0, far, 0], [0, -far, 0]]) { ms.moveTo(p[0] + d[0], p[1] + d[1], p[2] + d[2]); if (ms.aimAt(c) === c) { ms.click('left'); break; } } if (g.phase !== 'playing') break; } ms.key('Space', false); });
console.log('after mine click phase:', (await boardStats(page)).phase);
await waitResults('loss');
await shot(page, '52-results-loss-after-wins');

// Game 4: Play again, first click, then reload the page (the tab closed on a game).
await page.click('#r-again'); await sleep(300);
await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(200);
await firstClick();
await sleep(1200);
const beforeReload = await page.evaluate(() => globalThis.__ms.records.counters ? null : null);
await page.reload(); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(800);
console.log('after reload mode:', await mode(page));
// Records screen.
await page.click('#menu-entry-records'); await sleep(500);
console.log('Records (opens on last board):', await text('#records'));
await shot(page, '53-records-3d');
// Switch to 2D.
await page.evaluate(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role=tab], #records-mode input')]; const t = b.find((e) => /2D/.test(e.textContent || e.value || '')); t && t.click(); });
await sleep(300);
console.log('Records 2D:', await text('#records'));
await shot(page, '54-records-2d-empty');
await page.keyboard.press('Escape'); await sleep(300);

// 2D win: custom 2 x 2 with 0 mines, if allowed; else 3 x 3 with 1 mine.
await page.click('#menu-entry-classic-2d'); await sleep(300);
await page.fill('#c2d-width', '2'); await page.fill('#c2d-height', '2'); await page.fill('#c2d-mines', '0'); await sleep(100);
console.log('2D 2x2/0 info:', await text('#c2d-info'));
await page.click('#c2d-start'); await sleep(400);
console.log('2D mode:', await mode(page));
if ((await mode(page)) === 'classic-2d') {
  const box = await page.locator('#c2d-board canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 4, box.y + box.height / 4);
  await waitResults('2D win');
  await shot(page, '55-2d-results-win');
  await page.click('#r-records'); await sleep(500);
  console.log('Records from results:', await text('#records'));
  await shot(page, '56-records-after-2d-win');
  await page.keyboard.press('Escape'); await sleep(300);
}

// 3D: chord test on a satisfied number, and the HUD when flags exceed mines (flag-all on numbers).
await page.goto('http://127.0.0.1:8080/index.html'); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(500);
await page.click('#menu-entry-3d'); await sleep(300);
await start3DCustom(6, 6, 6, 10, true);
await firstClick();
const chordTest = await page.evaluate(() => {
  const ms = globalThis.__ms, g = ms.game, s = ms.state.spacing * 4;
  // Find a visible number whose mines are all its closed neighbours... simpler: flag the true mines around a number, then chord it.
  for (let c = 0; c < g.n; c++) {
    if (!g.pressed[c] || g.unlinked[c] || g.number[c] <= 0) continue;
    const [ci, cj, ck] = g.coords(c); const mines = [], closed = [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!(di || dj || dk)) continue; const x = ci + di, y = cj + dj, z = ck + dk;
      if (x < 0 || y < 0 || z < 0 || x >= g.X || y >= g.Y || z >= g.Z) continue;
      const d = g.idx(x, y, z); if (g.number[d] === -1) mines.push(d); else if (!g.pressed[d]) closed.push(d);
    }
    if (closed.length === 0) continue;
    const far = g.Z * s * 2;
    const aim = (d) => { const p = ms.cellCenter(d); for (const v of [[0, 0, -far], [0, 0, far], [far, 0, 0], [-far, 0, 0], [0, far, 0], [0, -far, 0]]) { ms.moveTo(p[0] + v[0], p[1] + v[1], p[2] + v[2]); if (ms.aimAt(d) === d) return true; } return false; };
    ms.key('Space', true);
    let flagged = 0; for (const m of mines) if (!g.flagged[m] && aim(m)) { ms.click('right'); flagged++; }
    ms.key('Space', false);
    if (flagged !== mines.filter((m) => g.flagged[m]).length) continue;
    if (!aim(c)) continue;
    const before = closed.filter((d) => !g.pressed[d]).length;
    ms.click('chord');
    const after = closed.filter((d) => !g.pressed[d]).length;
    return { c, number: g.number[c], mines: mines.length, closedBefore: before, closedAfter: after, phase: g.phase, hiddenNow: !!g.unlinked[c] };
  }
  return null;
});
console.log('3D chord test:', chordTest);
// Flag-all on several numbers until the HUD mine count goes negative.
const over = await page.evaluate(() => {
  const ms = globalThis.__ms, g = ms.game, s = ms.state.spacing * 4; const far = g.Z * s * 2; let n = 0;
  for (let c = 0; c < g.n && g.minesLeft > -5; c++) {
    if (!g.pressed[c] || g.unlinked[c] || g.number[c] <= 0) continue;
    const p = ms.cellCenter(c); let ok = false;
    for (const v of [[0, 0, -far], [0, 0, far], [far, 0, 0], [-far, 0, 0], [0, far, 0], [0, -far, 0]]) { ms.moveTo(p[0] + v[0], p[1] + v[1], p[2] + v[2]); if (ms.aimAt(c) === c) { ok = true; break; } }
    if (ok) { ms.click('right'); n++; }
  }
  return { rightClicks: n, minesLeft: g.minesLeft };
});
await sleep(400);
console.log('flag-all spam:', over, 'HUD', (await info(page)).hud, await boardStats(page));
await shot(page, '57-3d-negative-mines');
await browser.close();
