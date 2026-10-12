// Returning player paths: persistence under a hard kill vs graceful close, the leave guard, the
// in-progress marker, theme persistence, pause integrity, keyboard play on closed cells, streaks.
import { execSync } from 'node:child_process';
import { launch, openPage, mode, shot, setSeed, centres2D, mines2D, analyse, sleep, readResults, fastPlay, PROFILE } from './lib.mjs';
import { playNF, playAgainByEnter } from './play2d.mjs';

const log = (...a) => console.log(...a);
const KEY_B = 'classic-2d:square:9x9:10:guess', KEY_E = 'classic-2d:square:30x16:99:guess';
const counters = (page, key) => page.evaluate((k) => globalThis.__ms.records.counters(k), key);

// ---------- A. hard kill vs graceful close
let context = await launch({ fresh: false });
let page = await openPage(context);
log('A. Beginner games before:', JSON.stringify(await counters(page, KEY_B)));
await page.click('#menu-entry-classic-2d');
if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
await page.click('#c2d-choice [data-size="beginner"]');
await playNF(page, { W: 9, H: 9, M: 10, seed: 101, fc: 40, noGuess: false, label: 'b1', delayMs: 120, prefix: '07' });
log('A. after b1 (in memory):', JSON.stringify(await counters(page, KEY_B)));
await sleep(500);
const pid = execSync(`pgrep -f -- "--user-data-dir=${PROFILE}" | head -1`).toString().trim();
log('A. killing browser pid', pid);
try { process.kill(Number(pid), 'SIGKILL'); } catch (e) { log('kill failed', e.message); }
await sleep(1500);
try { await context.close(); } catch {}
context = await launch({ fresh: false });
page = await openPage(context);
log('A. after hard kill + relaunch:', JSON.stringify(await counters(page, KEY_B)));
await page.click('#menu-entry-classic-2d');
await page.click('#c2d-choice [data-size="beginner"]');
await playNF(page, { W: 9, H: 9, M: 10, seed: 102, fc: 40, noGuess: false, label: 'b2', delayMs: 120, prefix: '07' });
log('A. after b2 (in memory):', JSON.stringify(await counters(page, KEY_B)));
await context.close();
context = await launch({ fresh: false });
page = await openPage(context);
log('A. after graceful close + relaunch:', JSON.stringify(await counters(page, KEY_B)));

// ---------- B. leave guard and the in-progress marker
log('B. Expert before:', JSON.stringify(await counters(page, KEY_E)), 'overall 2D:', JSON.stringify(await page.evaluate(() => globalThis.__ms.records.overall?.('classic-2d') ?? globalThis.__ms.records.counters?.('classic-2d'))));
await page.click('#menu-entry-classic-2d');
await page.click('#c2d-choice [data-size="expert"]');
await setSeed(page, 12345);
const W = 30, H = 16;
let centres = await centres2D(page, W, H);
const gen = mines2D({ width: W, height: H, mines: 99, firstClick: 225, noGuess: false, seed: 12345 });
const a = analyse({ width: W, height: H, mines: gen.mines });
await page.mouse.click(centres[225].x, centres[225].y);
await page.waitForFunction(() => globalThis.__ms.modes.state.started);
const zeros = [];
for (let id = 0; id < a.openings && zeros.length < 4; id++) zeros.push(a.openingCells[id][0]);
await fastPlay(page, centres, zeros.map((c) => ({ c, kind: 'left' })), { delayMs: 300 });
await sleep(2000);
log('B. in-progress summary:', JSON.stringify(await page.evaluate(() => { const s = globalThis.__ms.modes.summary(); return { elapsedMs: s.elapsedMs, solved: s.bbbvSolved }; })));
const dialogs = [];
page.on('dialog', async (d) => { dialogs.push({ type: d.type(), message: d.message() }); await d.accept(); });
await page.close({ runBeforeUnload: true });
await sleep(1000);
log('B. dialogs on closing the tab mid-game:', JSON.stringify(dialogs));
page = await context.newPage();
page.errors = [];
await page.goto('http://127.0.0.1:8080/index.html');
await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
await shot(page, '07-menu-after-closed-tab');
log('B. menu text:', JSON.stringify(await page.evaluate(() => document.getElementById('menu').innerText.replace(/\n+/g, ' | '))));
log('B. Expert after:', JSON.stringify(await counters(page, KEY_E)));
await page.click('#menu-entry-records');
await page.evaluate(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /2D/.test(x.innerText)); b?.click(); });
await sleep(200);
await page.evaluate(() => { const b = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /^Expert\b/.test(x.innerText.trim()) && !/no-guess/i.test(x.innerText)); b?.click(); });
await sleep(200);
log('B. Expert games now:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#records-games-body tr')].slice(0, 3).map((tr) => tr.innerText.replace(/\t/g, ' | ')))));
log('B. Expert figures:', JSON.stringify(await page.evaluate(() => document.getElementById('records-counters').innerText.replace(/\n+/g, ' | '))));
log('B. overall:', JSON.stringify(await page.evaluate(() => document.getElementById('records-overall').innerText.replace(/\n+/g, ' | '))));
await shot(page, '07-records-after-closed-tab');
await page.keyboard.press('Escape');

// ---------- C. theme persistence
await page.click('#menu-entry-settings');
await sleep(200);
await shot(page, '07-settings');
log('C. settings text (head):', JSON.stringify(await page.evaluate(() => document.getElementById('settings-body').innerText.replace(/\n+/g, ' | ').slice(0, 700))));
const themed = await page.evaluate(() => { const root = document.querySelector('[data-setting="theme"]'); const b = root && [...root.querySelectorAll('button, [role="radio"]')].find((x) => /dark/i.test(x.innerText)); if (b) { b.click(); return b.innerText; } return null; });
log('C. clicked theme:', themed);
await sleep(300);
log('C. theme attr:', await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.getAttribute('data-theme')), 'bg:', await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
await page.keyboard.press('Escape');
await sleep(200);
await shot(page, '07-menu-dark');
await context.close();
context = await launch({ fresh: false });
page = await openPage(context);
log('C. after relaunch theme attr:', await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.getAttribute('data-theme')), 'bg:', await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
await shot(page, '07-menu-dark-relaunch');
log('C. 2D choice preselected:', await page.evaluate(() => { document.getElementById('menu-entry-classic-2d').click(); return [document.querySelector('#c2d-choice [data-size][data-last]')?.dataset.size, document.getElementById('c2d-noguess').checked]; }));
await shot(page, '07-c2d-choice-dark');

// ---------- D. pause integrity on Beginner: pause 3 s mid-game
await page.click('#c2d-choice [data-size="beginner"]');
await setSeed(page, 103);
centres = await centres2D(page, 9, 9);
const g2 = mines2D({ width: 9, height: 9, mines: 10, firstClick: 40, noGuess: false, seed: 103 });
const a2 = analyse({ width: 9, height: 9, mines: g2.mines });
await page.evaluate(() => { globalThis.__tt = { }; globalThis.__ms.modes.on('started', () => { globalThis.__tt.started = performance.now(); }); });
await page.mouse.click(centres[40].x, centres[40].y);
await page.waitForFunction(() => globalThis.__ms.modes.state.started);
await sleep(1000);
await page.keyboard.press('Escape');
log('D. paused:', await mode(page), 'hud:', await page.evaluate(() => document.getElementById('hud-time').textContent));
await sleep(3000);
await page.click('#p-resume');
await sleep(200);
log('D. resumed:', await mode(page));
// finish by NF
const { nfPlan } = await import('./lib.mjs');
const plan = nfPlan(a2, 40);
await fastPlay(page, centres, plan.map((c) => ({ c, kind: 'left' })), { delayMs: 100 });
await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 15000 });
const wall = await page.evaluate(() => (performance.now() - globalThis.__tt.started) / 1000);
const res = await readResults(page);
log(`D. wall since board arrival ${wall.toFixed(2)} s (incl. ≥3 s pause); shown ${res.time}; 3BV/s ${res.rate}; pause not shown on results? text has "pause": ${/pause/i.test(res.text)}`);
await shot(page, '07-results-dark');

// ---------- E. keyboard on closed cells (Beginner, Play again)
await playAgainByEnter(page, 'E');
await setSeed(page, 104);
const g3 = mines2D({ width: 9, height: 9, mines: 10, firstClick: 0, noGuess: false, seed: 104 });
const a3 = analyse({ width: 9, height: 9, mines: g3.mines });
const sum = () => page.evaluate(() => { const s = globalThis.__ms.modes.summary?.(); return s && { solved: s.bbbvSolved, r: s.clicks.reveal, f: s.clicks.flag, c: s.clicks.chord }; });
// cursor starts at cell 0: reveal it with Space (first click by keyboard)
await page.keyboard.press('Space');
await page.waitForFunction(() => globalThis.__ms.modes.state.started);
log('E. first click by Space → started; cell 0 number', a3.num[0], JSON.stringify(await sum()));
// move to a closed safe cell: find the nearest isolated or unopened cell in row 0..8 reachable
const target = a3.isolatedCells.find((c) => c !== 0) ?? a3.openingCells.find((cells) => a3.opening[0] === -1 || cells !== a3.openingCells[a3.opening[0]])[0];
const tx = target % 9, ty = Math.floor(target / 9);
for (let i = 0; i < tx; i++) await page.keyboard.press('ArrowRight');
for (let i = 0; i < ty; i++) await page.keyboard.press('ArrowDown');
await sleep(100);
await page.keyboard.down('Space'); await sleep(120);
await page.screenshot({ path: '07-space-held-closed.png', clip: { x: centres[target].x - 70, y: centres[target].y - 70, width: 140, height: 140 } });
await page.keyboard.up('Space'); await sleep(100);
log('E. Space on closed cell', target, 'number', a3.num[target], '→', JSON.stringify(await sum()));
// F on a mine next to it
const mineNb = a3.nb(target).find((d) => a3.mine[d]);
if (mineNb !== undefined) {
  const dx = (mineNb % 9) - tx, dy = Math.floor(mineNb / 9) - ty;
  for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp');
  await page.keyboard.press('KeyF'); await sleep(80);
  log('E. F on a closed mine → counter', await page.evaluate(() => document.getElementById('hud-mines').textContent), JSON.stringify(await sum()));
  // back to target and D (chord): target's number vs flags
  for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? 'ArrowLeft' : 'ArrowRight');
  for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? 'ArrowUp' : 'ArrowDown');
  await page.keyboard.press('KeyD'); await sleep(80);
  log(`E. D on number ${a3.num[target]} with 1 flag →`, JSON.stringify(await sum()));
}
await shot(page, '07-keyboard-board');
await page.keyboard.press('Escape');
await page.click('#p-menu');
await page.click('#p-confirm-yes');
log('E. 2D overall after leaving:', JSON.stringify(await page.evaluate(() => globalThis.__ms.records.overall?.('classic-2d') ?? null)));
log('page errors:', page.errors.slice(0, 10));
await context.close();
