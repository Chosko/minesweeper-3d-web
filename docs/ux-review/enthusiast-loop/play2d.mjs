// Reusable Classic 2D game driver over lib.mjs (hooks, one NF game, Play again).
import { mode, shot, setSeed, centres2D, mines2D, analyse, nfPlan, sleep, readResults, fastPlay } from './lib.mjs';

const log = (...a) => console.log(...a);

export async function hooks(page) {
  await page.evaluate(() => {
    globalThis.__t = { downs: [], ups: [], started: null, startedEvent: null, results: null, board: null, finished: null };
    if (!globalThis.__hooked) {
      globalThis.__hooked = true;
      document.addEventListener('mousedown', () => globalThis.__t.downs.push(performance.now()), true);
      document.addEventListener('mouseup', () => globalThis.__t.ups.push(performance.now()), true);
      globalThis.__ms.pauser.attach('finished', () => { globalThis.__t.finished = performance.now(); });
      try { globalThis.__ms.modes.on('started', () => { globalThis.__t.startedEvent = performance.now(); }); } catch (e) { globalThis.__t.onErr = String(e); }
      const poll = () => {
        const m = globalThis.__ms, t = globalThis.__t;
        if (t.started === null && m.modes.state.started) t.started = performance.now();
        if (t.results === null && m.state.mode === 'results') t.results = performance.now();
        if (t.board === null && m.state.mode === 'classic-2d' && document.querySelector('#c2d-board canvas')) t.board = performance.now();
        requestAnimationFrame(poll);
      };
      poll();
    }
  });
}
export const timings = (page) => page.evaluate(() => ({ ...globalThis.__t }));

/** One Classic 2D game on a W×H board with M mines, NF plan, won unless lose; returns results. */
export async function playNF(page, { W = 30, H = 16, M = 99, seed, fc, noGuess, extra = 'none', lose = false, label, delayMs = 70, prefix = '01' }) {
  await hooks(page);
  await setSeed(page, seed);
  const centres = await centres2D(page, W, H);
  const t0 = Date.now();
  const gen = mines2D({ width: W, height: H, mines: M, firstClick: fc, noGuess, seed });
  log(`[${label}] node generate: ok=${gen.ok} ${gen.ms.toFixed(0)} ms reason=${gen.reason ?? ''}`);
  if (!gen.ok) return null;
  const a = analyse({ width: W, height: H, mines: gen.mines });
  log(`[${label}] 3BV=${a.bbbv} openings=${a.openings} isolated=${a.isolated} first-click number=${a.num[fc]}`);
  await page.mouse.click(centres[fc].x, centres[fc].y);
  if (noGuess) { await sleep(250); await shot(page, `${prefix}-${label}-generating`); log(`[${label}] status card @250ms:`, JSON.stringify(await page.evaluate(() => document.getElementById('c2d-status')?.innerText)), 'hidden:', await page.evaluate(() => document.getElementById('c2d-status')?.classList.contains('hidden'))); }
  await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 180000 });
  const tStart = await timings(page);
  log(`[${label}] first click → board arrived: ${((tStart.startedEvent ?? tStart.started) - tStart.ups[0]).toFixed(0)} ms (page clock)`);
  const plan = nfPlan(a, fc);
  const actions = [];
  const my = { reveal: 1, flag: 0, chord: 0, wasted: 0 };
  if (lose) {
    for (const c of plan.slice(0, 3)) { actions.push({ c, kind: 'left' }); my.reveal++; }
    actions.push({ c: gen.mines[0], kind: 'left' }); my.reveal++;
  } else {
    let last = null;
    if (extra === 'chord') last = plan.pop();
    for (const c of plan) { actions.push({ c, kind: 'left' }); my.reveal++; }
    if (extra === 'wasted') {
      const lastAct = actions.pop();
      const zero = plan.find((c) => a.num[c] === 0);
      const revealedNum = a.nb(zero).find((c) => a.num[c] > 0) ?? a.openingCells[a.opening[zero]].flatMap((z) => a.nb(z)).find((c) => a.num[c] > 0);
      actions.push({ c: revealedNum, kind: 'left' }, { c: gen.mines[0], kind: 'right' }, { c: gen.mines[0], kind: 'right' }, lastAct);
      my.chord++; my.wasted++; my.flag += 2; my.wasted++;
    }
    if (extra === 'chord') {
      const q = a.nb(last).find((d) => a.num[d] > 0);
      const mineNbs = a.nb(q).filter((d) => a.mine[d]);
      for (const m of mineNbs) { actions.push({ c: m, kind: 'right' }); my.flag++; }
      actions.push({ c: q, kind: 'chord' }); my.chord++;
    }
  }
  const done = await fastPlay(page, centres, actions, { delayMs });
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 20000 });
  const t = await timings(page);
  const res = await readResults(page);
  await shot(page, `${prefix}-${label}-results`);
  const lastUp = t.ups.at(-1);
  const total = my.reveal + my.flag + my.chord;
  log(`[${label}] RESULTS: ${JSON.stringify({ ...res, text: undefined })}`);
  log(`[${label}] my count: clicks=${total} (${JSON.stringify(my)}); expected 3BV=${a.bbbv}, expected efficiency=${lose ? '-' : Math.round((100 * a.bbbv) / total)}%`);
  log(`[${label}] timer: last release − board arrival = ${((lastUp - (t.startedEvent ?? t.started)) / 1000).toFixed(3)} s; last − first release = ${((lastUp - t.ups[0]) / 1000).toFixed(3)} s; shown "${res.time}"`);
  log(`[${label}] dead time: last release → results screen ${(t.results - lastUp).toFixed(0)} ms; wall ${Date.now() - t0} ms; dispatched ${done}/${actions.length}`);
  return { res, a, total, gen };
}

export async function playAgainByEnter(page, label) {
  await page.evaluate(() => { globalThis.__t.board = null; globalThis.__t.again = performance.now(); });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d' && document.querySelector('#c2d-board canvas'), null, { timeout: 10000 });
  const t = await timings(page);
  log(`[${label}] Play again (Enter) → closed board shown: ${(t.board - t.again).toFixed(0)} ms`);
}
