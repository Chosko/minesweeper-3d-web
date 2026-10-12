// No-guess Expert: generation wait, the generating card, three games, Play again loop.
import { launch, openPage, mode, shot } from './lib.mjs';
import { playNF, playAgainByEnter } from './play2d.mjs';

const W = 30;
const context = await launch({ fresh: false });
const page = await openPage(context);
console.log('menu entries:', await page.evaluate(() => [...document.querySelectorAll('#menu [data-entry]')].map((e) => e.innerText.replace(/\n/g, ' | '))));
await page.click('#menu-entry-classic-2d');
console.log('preselected:', await page.evaluate(() => document.querySelector('#c2d-choice [data-size][data-last]')?.dataset.size), 'no-guess checked:', await page.isChecked('#c2d-noguess'));
if (!(await page.isChecked('#c2d-noguess'))) await page.click('#c2d-noguess');
await shot(page, '02-c2d-choice-noguess');
await page.click('#c2d-choice [data-size="expert"]');
console.log('hud:', await page.evaluate(() => [document.getElementById('hud-time').textContent, document.getElementById('hud-mines').textContent, document.getElementById('hud-size').textContent]));
const seeds = [2024, 55555, 8080];
for (let i = 0; i < seeds.length; i++) {
  const r = await playNF(page, { seed: seeds[i], fc: 7 * W + 15, noGuess: true, label: `ng${i + 1}`, delayMs: 60 + 15 * i, prefix: '02' });
  if (!r) { console.log('no-guess generation failed for seed', seeds[i]); await shot(page, `02-ng${i + 1}-failure`); console.log(await page.evaluate(() => document.getElementById('c2d-status')?.innerText)); break; }
  if (i < seeds.length - 1) await playAgainByEnter(page, `ng${i + 1}→${i + 2}`);
}
// A no-guess game at a seed whose generation is slow? Measure a few seeds in Node only (no play) to see the spread.
import { mines2D } from './lib.mjs';
const spread = [];
for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) { const g = mines2D({ width: 30, height: 16, mines: 99, firstClick: 7 * W + 15, noGuess: true, seed: s }); spread.push(`${s}:${g.ok ? g.ms.toFixed(0) + 'ms' : 'FAIL ' + g.reason}`); }
console.log('no-guess Expert generation time in Node by seed:', spread.join('  '));
const corner = [];
for (const s of [1, 2, 3, 4]) { const g = mines2D({ width: 30, height: 16, mines: 99, firstClick: 0, noGuess: true, seed: s }); corner.push(`${s}:${g.ok ? g.ms.toFixed(0) + 'ms' : 'FAIL ' + g.reason}`); }
console.log('no-guess Expert generation, corner first click:', corner.join('  '));
console.log('page errors:', page.errors);
await context.close();
