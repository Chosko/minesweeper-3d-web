// 3D Cube Expert: standard and no-guess games through the UI + __ms hook, results, Play again, a loss, an abandon.
import { launch, openPage, mode, shot, setSeed, sleep, readResults } from './lib.mjs';

const context = await launch({ fresh: false });
const page = await openPage(context);
const log = (...a) => console.log(...a);
const ms = (fn, arg) => page.evaluate(fn, arg);

await page.click('#menu-entry-3d');
await shot(page, '04-3d-choice');
log('3D choice preselected:', await ms(() => document.querySelector('#board-choice [data-preset][data-last]')?.innerText.replace(/\n/g, ' | ')), 'no-guess:', await page.isChecked('#bc-noguess'));

async function enter() {
  // the ready card (click to play) → lockless play
  const m = await mode(page);
  if (m === 'ready') {
    await shot(page, '04-ready-card');
    log('ready card:', JSON.stringify(await ms(() => document.getElementById('ready')?.innerText)));
    await ms(() => globalThis.__ms.forcePlay());
  }
  log('mode:', await mode(page));
}

async function firstClick(label) {
  await ms(() => { globalThis.__t3 = { click: performance.now(), started: null }; });
  await ms(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
  if (label.startsWith('ng')) { await sleep(300); await shot(page, `04-${label}-generating`); log('status card @300ms:', JSON.stringify(await ms(() => document.getElementById('m3d-status')?.innerText)), 'hidden:', await ms(() => document.getElementById('m3d-status')?.classList.contains('hidden'))); }
  await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 180000 });
  const wait = await ms(() => performance.now() - globalThis.__t3.click);
  log(`[${label}] first click → board arrived: ${wait.toFixed(0)} ms`);
}

// Multi-pass play from several camera positions, aiming through numbers (Space held).
async function playAll({ label, delayMs = 20, lose = false }) {
  const result = await ms(async ({ delayMs, lose }) => {
    const m = globalThis.__ms, g = m.game;
    const wait = (t) => new Promise((r) => setTimeout(r, t));
    const mines = new Set([...Array(g.n).keys()].filter((c) => g.number[c] === -1));
    const safe = [...Array(g.n).keys()].filter((c) => !mines.has(c));
    const p = 4 * m.state.spacing;
    const ext = [(g.X - 1) / 2 * p, (g.Y - 1) / 2 * p, (g.Z - 1) / 2 * p];
    const far = 40;
    const cams = [[0, 0, ext[2] + far], [0, 0, -ext[2] - far], [ext[0] + far, 0, 0], [-ext[0] - far, 0, 0], [0, ext[1] + far, 0], [0, -ext[1] - far, 0]];
    m.key('Space', true);
    let clicks = 0, blocked = 0, pass = 0;
    const t0 = performance.now();
    let aimMs = 0, aims = 0;
    if (lose) {
      for (const c of safe.slice(0, 40)) { if (g.pressed[c] || g.state !== 'playing') continue; if (m.aimAt(c) === c) { m.click('left'); clicks++; await wait(delayMs); } }
      const mine = [...mines][0];
      for (const cam of cams) { m.moveTo(...cam); if (m.aimAt(mine) === mine) { m.click('left'); clicks++; break; } }
      m.key('Space', false);
      return { clicks, state: g.state, elapsed: performance.now() - t0 };
    }
    outer: for (let ci = 0; ci < 12 && g.state === 'playing'; ci++) {
      m.moveTo(...cams[ci % cams.length]);
      let progress = true;
      while (progress && g.state === 'playing') {
        progress = false; pass++;
        for (const c of safe) {
          if (g.state !== 'playing') break outer;
          if (g.pressed[c]) continue;
          const a0 = performance.now();
          const sel = m.aimAt(c);
          aimMs += performance.now() - a0; aims++;
          if (sel !== c) { blocked++; continue; }
          m.click('left'); clicks++; progress = true;
          await wait(delayMs);
        }
      }
    }
    // Fallback for cells enclosed from outside: put the camera inside a revealed neighbour and aim from there.
    if (g.state === 'playing') {
      const byCoord = new Map();
      for (let i = 0; i < g.n; i++) byCoord.set(g.coords(i).join(','), i);
      for (let round = 0; round < 3 && g.state === 'playing'; round++) {
        for (const c of safe) {
          if (g.state !== 'playing') break;
          if (g.pressed[c]) continue;
          const [x, y, z] = g.coords(c);
          let done = false;
          for (let dz = -1; dz <= 1 && !done; dz++) for (let dy = -1; dy <= 1 && !done; dy++) for (let dx = -1; dx <= 1 && !done; dx++) {
            if (!dx && !dy && !dz) continue;
            const d = byCoord.get([x + dx, y + dy, z + dz].join(','));
            if (d === undefined || !g.pressed[d]) continue;
            m.moveTo(...m.cellCenter(d));
            if (m.aimAt(c) === c) { m.click('left'); clicks++; done = true; await wait(delayMs); }
          }
        }
      }
    }
    m.key('Space', false);
    const left = safe.filter((c) => !g.pressed[c]).length;
    return { clicks, blocked, pass, left, state: g.state, elapsed: performance.now() - t0, aimAvgMs: aimMs / Math.max(1, aims) };
  }, { delayMs, lose });
  log(`[${label}] play: ${JSON.stringify(result)}`);
  return result;
}

async function finish(label) {
  const tEnd = await ms(() => performance.now());
  await sleep(300);
  await shot(page, `04-${label}-end-effect`);
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 20000 });
  const tRes = await ms(() => performance.now());
  const res = await readResults(page);
  await shot(page, `04-${label}-results`);
  log(`[${label}] RESULTS: ${JSON.stringify({ ...res, text: undefined })}`);
  log(`[${label}] end → results screen ≈ ${(tRes - tEnd).toFixed(0)} ms (includes a 300 ms wait)`);
  return res;
}

// ---- Standard Cube Expert
if (await page.isChecked('#bc-noguess')) await page.click('#bc-noguess');
await setSeed(page, 777);
await page.click('#board-choice [data-preset="12,12,8,130"]'); await page.click('#bc-play');
await sleep(500);
await enter();
await shot(page, '04-expert-closed');
log('hud:', await ms(() => [document.getElementById('hud-time').textContent, document.getElementById('hud-mines').textContent, document.getElementById('hud-size').textContent]));
await firstClick('e1');
const summary3d = () => ms(() => { const s = globalThis.__ms.modes.summary?.(); return s && { bbbv: s.bbbv, solved: s.bbbvSolved, clicks: s.clicks }; });
log('summary after first click:', JSON.stringify(await summary3d()));
await sleep(400);
await shot(page, '04-e1-after-first-click');
const r1 = await playAll({ label: 'e1' });
log('summary before end:', JSON.stringify(await summary3d()));
await finish('e1');

// Play again from results
await ms(() => { globalThis.__t3again = performance.now(); });
await page.click('#r-again');
await sleep(300);
log('after Play again: mode', await mode(page));
await enter();
await setSeed(page, 778);
await firstClick('e2');
await playAll({ label: 'e2', lose: true });
await finish('e2-loss');

// Play again → abandon by restart from pause
await page.click('#r-again');
await sleep(300);
await enter();
await setSeed(page, 779);
await firstClick('e3');
await ms(() => globalThis.__ms.pause());
await sleep(200);
log('paused mode:', await mode(page));
await shot(page, '04-3d-pause');
log('pause card:', JSON.stringify(await ms(() => document.getElementById('pause-card')?.innerText.split('\n').slice(0, 6).join(' | '))));
await page.click('#p-restart');
await sleep(100);
log('restart confirm:', JSON.stringify(await ms(() => document.getElementById('pause-confirm')?.innerText)));
await page.click('#p-confirm-yes');
await sleep(400);
log('after restart: mode', await mode(page));
await enter();
await setSeed(page, 780);
await firstClick('e4');
await playAll({ label: 'e4', delayMs: 10 });
await finish('e4');

// ---- No-guess Cube Expert
await page.click('#r-menu');
await page.click('#menu-entry-3d');
if (!(await page.isChecked('#bc-noguess'))) await page.click('#bc-noguess');
await shot(page, '04-3d-choice-noguess');
await setSeed(page, 4242);
await page.click('#board-choice [data-preset="12,12,8,130"]'); await page.click('#bc-play');
await sleep(500);
await enter();
await firstClick('ng1');
await playAll({ label: 'ng1', delayMs: 10 });
await finish('ng1');
await page.click('#r-again');
await sleep(300);
await enter();
await setSeed(page, 4243);
await firstClick('ng2');
await playAll({ label: 'ng2', delayMs: 10 });
await finish('ng2');
log('page errors:', page.errors.slice(0, 10));
await context.close();
