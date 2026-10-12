import { launch, shot, mode, info, boardStats, sleep } from './lib.mjs';

const { browser, page } = await launch();
await page.click('#menu-entry-3d'); await sleep(300);
console.log('focused on board choice:', await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 120)));

async function startPreset(preset, noguess) {
  if ((await mode(page)) !== 'board-choice') { await page.goto('http://127.0.0.1:8080/index.html'); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(500); await page.click('#menu-entry-3d'); await sleep(300); }
  const checked = await page.evaluate(() => document.getElementById('bc-noguess').checked);
  if (checked !== noguess) await page.click('#bc-noguess');
  await page.click(`[data-preset="${preset}"]`); await sleep(400);
  await page.evaluate(() => globalThis.__ms.forcePlay()); await sleep(300);
}

// Aim at the cell nearest the start camera (the face the player sees) and reveal; time the wait.
async function firstClick(where = 'face') {
  const idx = await page.evaluate((where) => {
    const g = globalThis.__ms.game, ms = globalThis.__ms;
    if (where === 'face') return ms.aimAt(g.idx(Math.floor(g.X / 2), Math.floor(g.Y / 2), 0));
    if (where === 'corner') return ms.aimAt(g.idx(0, 0, 0));
    return ms.selected();
  }, where);
  const t0 = Date.now();
  await page.evaluate(() => globalThis.__ms.click('left'));
  let generatingShown = false;
  const started = await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 30000 }).then(() => true).catch(() => false);
  const dt = Date.now() - t0;
  generatingShown = await page.evaluate(() => !document.getElementById('m3d-status').classList.contains('hidden'));
  return { idx, started, ms: dt, generatingShown, status: await page.evaluate(() => document.getElementById('m3d-status').innerText) };
}

for (const [label, preset] of [['Beginner', '6,6,6,10'], ['Intermediate', '8,8,8,40'], ['Expert', '12,12,8,130']]) {
  for (const ng of [true]) {
    await startPreset(preset, ng);
    const fc = await firstClick('face');
    await sleep(500);
    const st = await boardStats(page);
    console.log(`\n${label} no-guess=${ng}: first click`, fc, '\n  stats', st, '\n  info', await info(page));
    await shot(page, `20-${label}-noguess-first-click`);
    await page.evaluate(() => globalThis.__ms.key('ControlLeft', true)); await sleep(300);
    await shot(page, `21-${label}-noguess-ctrl`);
    await page.evaluate(() => globalThis.__ms.key('ControlLeft', false));
    // Step back to frame the whole box.
    await page.evaluate(() => { const ms = globalThis.__ms, g = ms.game, s = ms.state.spacing * 4; ms.moveTo(0, 0, -(g.Z / 2 * s + Math.max(g.X, g.Y) * s * 1.4)); ms.look(Math.PI, 0); });
    await sleep(400);
    await shot(page, `22-${label}-noguess-framed`);
    // Right-click on a visible number on the near face: how many flags get placed?
    const rc = await page.evaluate(() => {
      const g = globalThis.__ms.game, ms = globalThis.__ms;
      for (let j = 0; j < g.Y; j++) for (let i = 0; i < g.X; i++) {
        const c = g.idx(i, j, 0);
        if (g.pressed[c] && !g.unlinked[c] && g.number[c] > 0) {
          const sel = ms.aimAt(c);
          if (sel === c) {
            let closed = 0; const [ci, cj, ck] = g.coords(c);
            for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
              const x = ci + di, y = cj + dj, z = ck + dk; if (!(di || dj || dk)) continue;
              if (x < 0 || y < 0 || z < 0 || x >= g.X || y >= g.Y || z >= g.Z) continue;
              const d = g.idx(x, y, z); if (!g.pressed[d] && !g.flagged[d]) closed++;
            }
            const before = g.minesLeft; ms.click('right');
            return { c, number: g.number[c], closedNeighbours: closed, minesBefore: before, minesAfter: g.minesLeft };
          }
        }
      }
      return null;
    });
    console.log('  right-click on revealed number:', rc, 'HUD', (await info(page)).hud);
    await sleep(300);
    await shot(page, `23-${label}-rightclick-number`);
    if (rc) { await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('right'); }, rc.c); console.log('  after second right-click minesLeft', (await info(page)).minesLeft); }
    // Leave the game through the pause menu (abandon) to get back to the board choice.
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('#p-menu'); await sleep(200);
    console.log('  confirm text:', await page.evaluate(() => document.getElementById('pause-confirm').innerText.replace(/\n+/g, ' | ')));
    await page.click('#p-confirm-yes'); await sleep(300);
    console.log('  mode after leaving:', await mode(page));
    await page.click('#menu-entry-3d'); await sleep(300);
  }
}

// End delay measured without screenshots: standard Beginner, lose on the first mine found.
await startPreset('6,6,6,10', false);
await firstClick('face');
await sleep(200);
const lostAt = await page.evaluate(() => {
  const g = globalThis.__ms.game, ms = globalThis.__ms;
  for (let c = 0; c < g.n; c++) if (g.number[c] === -1) { const p = ms.cellCenter(c); ms.moveTo(p[0], p[1], p[2] - 4 * ms.state.spacing * g.Z); if (ms.aimAt(c) === c) { const t = performance.now(); ms.click('left'); return { c, t, phase: g.phase }; } }
  return null;
});
console.log('lost:', lostAt);
await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 15000 });
const tRes = await page.evaluate(() => performance.now());
console.log('results after ms (page clock):', tRes - lostAt.t);
console.log('results:', await page.evaluate(() => document.getElementById('results').innerText.replace(/\n+/g, ' | ')));
await browser.close();
