// The Classic 2D Expert grind loop: standard and no-guess, several games in one persistent profile.
import { launch, openPage, mode, shot, setSeed, centres2D, mines2D, analyse, nfPlan, sleep, readResults, fastPlay } from './lib.mjs';

const W = 30, H = 16, M = 99;
const log = (...a) => console.log(...a);
const context = await launch({ fresh: true });
const page = await openPage(context);
await shot(page, '01-menu-first-launch');

async function hooks() {
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
const timings = () => page.evaluate(() => ({ ...globalThis.__t }));
const summary = () => page.evaluate(() => globalThis.__ms.modes.summary?.());

async function playNF({ seed, fc, noGuess, extra = 'none', lose = false, label, delayMs = 70 }) {
  await hooks();
  await setSeed(page, seed);
  const centres = await centres2D(page, W, H);
  const t0 = Date.now();
  const gen = mines2D({ width: W, height: H, mines: M, firstClick: fc, noGuess, seed });
  log(`[${label}] node generate: ok=${gen.ok} ${gen.ms.toFixed(0)} ms attempts=${gen.attempts ?? '?'} reason=${gen.reason ?? ''}`);
  if (!gen.ok) return null;
  const a = analyse({ width: W, height: H, mines: gen.mines });
  log(`[${label}] 3BV=${a.bbbv} openings=${a.openings} isolated=${a.isolated} first-click number=${a.num[fc]} first click in opening=${a.opening[fc] !== -1}`);
  // The first click with the real mouse.
  await page.mouse.click(centres[fc].x, centres[fc].y);
  if (noGuess) { await sleep(250); await shot(page, `01-${label}-generating`); log(`[${label}] status card:`, await page.evaluate(() => document.getElementById('c2d-status')?.innerText)); }
  await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 180000 });
  const tStart = await timings();
  log(`[${label}] first click → board arrived: ${(tStart.started - tStart.ups[0]).toFixed(0)} ms (rAF poll), ${((tStart.startedEvent ?? NaN) - tStart.ups[0]).toFixed(0)} ms (started event) ${tStart.onErr ?? ''}`);
  const plan = nfPlan(a, fc);
  const actions = [];
  let my = { reveal: 1, flag: 0, chord: 0, wasted: 0 };
  if (lose) {
    for (const c of plan.slice(0, 3)) { actions.push({ c, kind: 'left' }); my.reveal++; }
    actions.push({ c: gen.mines[0], kind: 'left' }); my.reveal++;
  } else {
    let last = null;
    if (extra === 'chord') last = plan.pop();
    for (const c of plan) { actions.push({ c, kind: 'left' }); my.reveal++; }
    if (extra === 'wasted') {
      // a left click on a revealed number with no flags around: wasted chord; flag + unflag a closed mine
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
      log(`[${label}] final chord on cell ${q} (number ${a.num[q]}) after ${mineNbs.length} flags; opens ${last}`);
    }
  }
  const done = await fastPlay(page, centres, actions, { delayMs });
  log(`[${label}] dispatched ${done}/${actions.length} actions`);
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 20000 });
  const t = await timings();
  const res = await readResults(page);
  await shot(page, `01-${label}-results`);
  const lastUp = t.ups.at(-1);
  const total = my.reveal + my.flag + my.chord;
  const expectedEff = lose ? null : Math.round((100 * a.bbbv) / total);
  log(`[${label}] RESULTS: ${JSON.stringify(res)}`);
  log(`[${label}] my count: clicks=${total} (reveal ${my.reveal}, flag ${my.flag}, chord ${my.chord}, wasted ${my.wasted}); expected 3BV=${a.bbbv}, expected efficiency=${expectedEff}%`);
  log(`[${label}] timer: last release − board arrival(event) = ${((lastUp - (t.startedEvent ?? t.started)) / 1000).toFixed(3)} s; last release − first release = ${((lastUp - t.ups[0]) / 1000).toFixed(3)} s; shown "${res.time}"`);
  log(`[${label}] dead time: last release → finished ${(t.finished - lastUp).toFixed(0)} ms → results screen ${(t.results - lastUp).toFixed(0)} ms; wall ${Date.now() - t0} ms`);
  return { res, a, total };
}

async function playAgainByEnter(label) {
  await page.evaluate(() => { globalThis.__t.board = null; globalThis.__t.again = performance.now(); });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d' && document.querySelector('#c2d-board canvas'), null, { timeout: 10000 });
  const t = await timings();
  log(`[${label}] Play again (Enter) → closed board shown: ${(t.board - t.again).toFixed(0)} ms, focus=${await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)}`);
}

// ---- Standard Expert
await page.click('#menu-entry-classic-2d');
await shot(page, '01-c2d-choice-first');
if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
await page.click('#c2d-choice [data-size="expert"]'); await page.click('#c2d-play');
log('mode after Expert:', await mode(page));
await shot(page, '01-expert-closed');
log('hud:', await page.evaluate(() => [document.getElementById('c2d-time').textContent, document.getElementById('c2d-mines-left').textContent, document.getElementById('c2d-size').textContent]));

await playNF({ seed: 12345, fc: 7 * W + 15, noGuess: false, label: 'std1' });
await playAgainByEnter('std1→2');
await playNF({ seed: 777, fc: 7 * W + 15, noGuess: false, extra: 'wasted', label: 'std2', delayMs: 90 });
await playAgainByEnter('std2→3');
await playNF({ seed: 4242, fc: 8 * W + 14, noGuess: false, extra: 'chord', label: 'std3', delayMs: 60 });
await playAgainByEnter('std3→4');
await playNF({ seed: 999, fc: 7 * W + 15, noGuess: false, lose: true, label: 'std4-loss' });
await page.click('#r-again');
await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
await playNF({ seed: 31337, fc: 7 * W + 15, noGuess: false, label: 'std5', delayMs: 80 });

// ---- No-guess Expert
await page.click('#r-menu');
log('mode after Back to menu:', await mode(page));
await shot(page, '01-menu-returning');
await page.click('#menu-entry-classic-2d');
await shot(page, '01-c2d-choice-returning');
if (!(await page.isChecked('#c2d-noguess'))) await page.click('#c2d-noguess');
await page.click('#c2d-choice [data-size="expert"]'); await page.click('#c2d-play');
for (const [i, seed] of [[0, 2024], [1, 55555], [2, 8080]].entries()) {
  const r = await playNF({ seed, fc: 7 * W + 15, noGuess: true, label: `ng${i + 1}`, delayMs: 60 + 15 * i });
  if (!r) { log('no-guess generation failed for seed', seed); await shot(page, `01-ng${i + 1}-failure`); log(await page.evaluate(() => document.getElementById('c2d-status')?.innerText)); break; }
  if (i < 2) await playAgainByEnter(`ng${i + 1}→${i + 2}`);
}
log('page errors:', page.errors);
await context.close();
