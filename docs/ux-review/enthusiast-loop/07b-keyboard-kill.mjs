// E. keyboard play on closed cells; F. does the won replay survive a kill; G. kill after a longer wait.
import { execSync } from 'node:child_process';
import { launch, openPage, mode, shot, setSeed, centres2D, mines2D, analyse, sleep, readResults, PROFILE } from './lib.mjs';
import { playNF } from './play2d.mjs';

const log = (...a) => console.log(...a);
const KEY_B = 'classic-2d:square:9x9:10:guess';
const counters = (page, key) => page.evaluate((k) => globalThis.__ms.records.counters(k), key);

let context = await launch({ fresh: false });
let page = await openPage(context);
log('F. Beginner replays in the library (after the earlier kill):', JSON.stringify(await page.evaluate(() => { document.getElementById('menu-entry-records').click(); const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /2D/.test(x.innerText)); b?.click(); const p = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /^Beginner$/.test(x.innerText.trim())); p?.click(); return [...document.querySelectorAll('#records-replays-body tr')].map((tr) => tr.innerText.replace(/\t/g, ' | ')); })));
log('F. Beginner games list:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#records-games-body tr')].map((tr) => tr.innerText.replace(/\t/g, ' | ')))));
await page.keyboard.press('Escape');

// ---- E. keyboard on closed cells
await page.click('#menu-entry-classic-2d');
if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play');
await setSeed(page, 104);
const centres = await centres2D(page, 9, 9);
const g3 = mines2D({ width: 9, height: 9, mines: 10, firstClick: 0, noGuess: false, seed: 104 });
const a3 = analyse({ width: 9, height: 9, mines: g3.mines });
const sum = () => page.evaluate(() => { const s = globalThis.__ms.modes.summary?.(); return s && { solved: s.bbbvSolved, r: s.clicks.reveal, f: s.clicks.flag, c: s.clicks.chord }; });
const hud = () => page.evaluate(() => document.getElementById('hud-mines').textContent);
log('E. focus before keys:', await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName));
await page.keyboard.press('Space');
await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 5000 }).catch(() => log('E. Space did not start the game'));
log('E. first click by Space → started?', await page.evaluate(() => globalThis.__ms.modes.state.started), 'cell 0 number', a3.num[0], JSON.stringify(await sum()));
let cx = 0, cy = 0;
const goTo = async (c) => { const tx = c % 9, ty = Math.floor(c / 9); const dx = tx - cx, dy = ty - cy; for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? 'ArrowRight' : 'ArrowLeft'); for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? 'ArrowDown' : 'ArrowUp'); cx = tx; cy = ty; await sleep(60); };
// a closed safe number cell not in cell 0's opening
const target = a3.isolatedCells.find((c) => c !== 0 && !(a3.num[0] === 0 && a3.nb(0).includes(c))) ?? a3.openingCells.find((cells, id) => id !== a3.opening[0])?.[0];
await goTo(target);
await page.keyboard.down('Space'); await sleep(120);
await page.screenshot({ path: '07b-space-held-closed.png', clip: { x: centres[target].x - 70, y: centres[target].y - 70, width: 140, height: 140 } });
await page.keyboard.up('Space'); await sleep(100);
log('E. Space on closed cell', target, 'number', a3.num[target], '→', JSON.stringify(await sum()));
const mineNb = a3.nb(target).find((d) => a3.mine[d]);
if (mineNb !== undefined) {
  await goTo(mineNb);
  await page.keyboard.press('KeyF'); await sleep(80);
  log('E. F on a closed mine → counter', await hud(), JSON.stringify(await sum()));
  await goTo(target);
  await page.keyboard.press('KeyD'); await sleep(80);
  log(`E. D on number ${a3.num[target]} with 1 flag of ${a3.nb(target).filter((d) => a3.mine[d]).length} →`, JSON.stringify(await sum()));
  // flag the rest, then D again: effective chord
  for (const m of a3.nb(target).filter((d) => a3.mine[d] && d !== mineNb)) { await goTo(m); await page.keyboard.press('KeyF'); await sleep(60); }
  await goTo(target);
  await page.keyboard.down('KeyD'); await sleep(120);
  await page.screenshot({ path: '07b-d-held.png', clip: { x: centres[target].x - 70, y: centres[target].y - 70, width: 140, height: 140 } });
  await page.keyboard.up('KeyD'); await sleep(100);
  log('E. D with all flags →', JSON.stringify(await sum()), 'mode', await mode(page));
}
await shot(page, '07b-keyboard-board');
if (await mode(page) === 'classic-2d') { await page.keyboard.press('Escape'); await page.click('#p-menu'); await page.click('#p-confirm-yes'); }
else if (await mode(page) === 'results') { await page.click('#r-menu'); }
log('E. mode', await mode(page));

// ---- G. kill 6 s after a win
await page.click('#menu-entry-classic-2d');
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play');
const before = await counters(page, KEY_B);
await playNF(page, { W: 9, H: 9, M: 10, seed: 105, fc: 40, noGuess: false, label: 'b3', delayMs: 120, prefix: '07b' });
const mem = await counters(page, KEY_B);
await sleep(6000);
const pid = execSync(`pgrep -f -- "--user-data-dir=${PROFILE}" | head -1`).toString().trim();
try { process.kill(Number(pid), 'SIGKILL'); } catch (e) { log('kill failed', e.message); }
await sleep(1500);
try { await context.close(); } catch {}
context = await launch({ fresh: false });
page = await openPage(context);
log('G. before', JSON.stringify(before), 'in memory after win', JSON.stringify(mem), 'after kill 6 s later + relaunch', JSON.stringify(await counters(page, KEY_B)));
// ---- H. kill 20 s after a win, with the page idle on the results screen
await page.click('#menu-entry-classic-2d');
await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play');
await playNF(page, { W: 9, H: 9, M: 10, seed: 106, fc: 40, noGuess: false, label: 'b4', delayMs: 120, prefix: '07b' });
const mem2 = await counters(page, KEY_B);
await sleep(20000);
const pid2 = execSync(`pgrep -f -- "--user-data-dir=${PROFILE}" | head -1`).toString().trim();
try { process.kill(Number(pid2), 'SIGKILL'); } catch (e) { log('kill failed', e.message); }
await sleep(1500);
try { await context.close(); } catch {}
context = await launch({ fresh: false });
page = await openPage(context);
log('H. in memory after win', JSON.stringify(mem2), 'after kill 20 s later + relaunch', JSON.stringify(await counters(page, KEY_B)));
log('page errors:', page.errors.slice(0, 10));
await context.close();
