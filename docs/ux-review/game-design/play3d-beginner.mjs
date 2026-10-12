import { launch, shot, mode, info, boardStats, sleep } from './lib.mjs';

const { browser, page } = await launch();
await shot(page, '01-menu');
await page.click('#menu-entry-3d');
await sleep(300);
console.log('mode after 3D:', await mode(page));
console.log('noguess default (presets):', await page.evaluate(() => document.getElementById('bc-noguess').checked));
console.log('noguess default (custom):', await page.evaluate(() => document.getElementById('c-noguess').checked));
console.log('custom defaults:', await page.evaluate(() => ['c-x','c-y','c-z','c-m'].map((id) => document.getElementById(id).value).join(',')), await page.evaluate(() => document.getElementById('c-info').textContent));
await shot(page, '02-3d-board-choice');

// Cube Beginner, no-guess OFF (default)
await page.click('[data-preset="6,6,6,10"]');
await sleep(500);
console.log('mode after preset:', await mode(page));
console.log('ready text:', await page.evaluate(() => document.getElementById('ready').innerText));
await shot(page, '03-ready');
await page.evaluate(() => globalThis.__ms.forcePlay());
await sleep(800);
console.log('mode playing:', await mode(page), await info(page));
await shot(page, '04-closed-box');

// Aim at the face-centre cell that the start camera sees, and reveal.
const idx = await page.evaluate(() => { const g = globalThis.__ms.game; return globalThis.__ms.aimAt(g.idx(3, 3, g.Z - 1)); });
console.log('aimed at', idx);
const t0 = Date.now();
await page.evaluate(() => globalThis.__ms.click('left'));
await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: 15000 });
console.log('first reveal applied in ms', Date.now() - t0);
await sleep(600);
console.log('after first click:', await boardStats(page), await info(page));
await shot(page, '05-after-first-click');

// Try view modes.
await page.evaluate(() => globalThis.__ms.key('ShiftLeft', true)); await sleep(500); await shot(page, '06-shift-mode'); await page.evaluate(() => globalThis.__ms.key('ShiftLeft', false));
await page.evaluate(() => globalThis.__ms.key('Space', true)); await sleep(500); await shot(page, '07-space-mode'); await page.evaluate(() => globalThis.__ms.key('Space', false));
await page.evaluate(() => globalThis.__ms.key('ControlLeft', true)); await sleep(500); await shot(page, '08-ctrl-mode'); await page.evaluate(() => globalThis.__ms.key('ControlLeft', false));
// Spacing.
await page.evaluate(() => globalThis.__ms.wheel(10)); await sleep(500); console.log('spacing after wheel +10:', (await info(page)).spacing); await shot(page, '09-spacing-wide');
await page.evaluate(() => globalThis.__ms.wheel(-10)); await sleep(300);

// Fly inside: move the camera into the centre of the box and look around.
await page.evaluate(() => { const c = globalThis.__ms.cellCenter(globalThis.__ms.game.idx(3, 3, 3)); globalThis.__ms.moveTo(c[0] + 2, c[1] + 2, c[2] + 2); globalThis.__ms.look(0.7, -0.3); });
await sleep(600);
await shot(page, '10-inside-box');
await page.evaluate(() => globalThis.__ms.key('ShiftLeft', true)); await sleep(500); await shot(page, '11-inside-shift'); await page.evaluate(() => globalThis.__ms.key('ShiftLeft', false));

// Right-click on a revealed number: how many flags does it place?
const rc = await page.evaluate(() => {
  const g = globalThis.__ms.game; const ms = globalThis.__ms;
  // find a visible number with closed neighbours, aim at it from outside.
  for (let c = 0; c < g.n; c++) {
    if (g.pressed[c] && !g.unlinked[c] && g.number[c] > 0) {
      const [i, j, k] = g.coords(c);
      const p = ms.cellCenter(c);
      ms.moveTo(p[0], p[1], p[2] + 6 * 4 * ms.state.spacing);
      const sel = ms.aimAt(c);
      if (sel === c) { const before = g.minesLeft; ms.click('right'); return { c, i, j, k, number: g.number[c], minesBefore: before, minesAfter: g.minesLeft }; }
    }
  }
  return null;
});
console.log('right-click on revealed number:', rc, await boardStats(page));
await sleep(500);
await shot(page, '12-rightclick-flag-all');
// Undo it (right-click again unflags all)
if (rc) { await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('right'); }, rc.c); console.log('after second right-click:', await boardStats(page)); }

// Pause.
await page.keyboard.press('Escape'); await sleep(400);
console.log('mode after Esc:', await mode(page), await page.evaluate(() => document.getElementById('pause').innerText.replace(/\n+/g, ' | ')));
await shot(page, '13-pause');
await page.click('#p-resume'); await sleep(300);
console.log('mode after resume:', await mode(page));

// Lose on purpose: aim at a mine cube and reveal; time the end delay to the results screen.
const mineIdx = await page.evaluate(() => {
  const g = globalThis.__ms.game; const ms = globalThis.__ms;
  for (let c = 0; c < g.n; c++) if (g.number[c] === -1 && !g.flagged[c]) {
    const p = ms.cellCenter(c);
    // approach from outside along +z
    ms.moveTo(p[0], p[1], 4 * ms.state.spacing * g.Z);
    const sel = ms.aimAt(c); if (sel === c) return c;
  }
  return -1;
});
console.log('mine aimed:', mineIdx);
await page.evaluate(() => globalThis.__ms.forcePlay());
const tLose = Date.now();
await page.evaluate(() => globalThis.__ms.click('left'));
await sleep(300);
await shot(page, '14-loss-effect');
await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 10000 });
console.log('results shown after ms:', Date.now() - tLose);
await sleep(300);
console.log('results text:', await page.evaluate(() => document.getElementById('results').innerText.replace(/\n+/g, ' | ')));
await shot(page, '15-results-loss');

// Play again: how fast to a new board?
const tAgain = Date.now();
await page.click('#r-again'); await sleep(300);
console.log('after Play again mode:', await mode(page), 'ms', Date.now() - tAgain);
await shot(page, '16-play-again');
await browser.close();
