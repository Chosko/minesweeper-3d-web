// Fixed Beginner board: view modes, depth reading, spacing, picking size at distance.
import { launch, shot, frames, sleep, info, forcePlay, boardOnScreen } from './lib.mjs';

const { browser, page } = await launch();
const idx = (i, j, k) => i + 6 * (j + 6 * k);
const minesXYZ = [[1, 1, 4], [4, 1, 4], [2, 4, 4], [4, 4, 5], [0, 3, 5], [3, 2, 5], [5, 5, 3], [1, 5, 5], [5, 0, 4], [2, 2, 3]];
const mines = minesXYZ.map(([i, j, k]) => idx(i, j, k));
await page.evaluate((m) => globalThis.__ms.start(6, 6, 6, 10, m), mines);
await forcePlay(page);
await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx(0, 0, 0));
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
await page.evaluate(() => globalThis.__ms.look(Math.PI, 0));
const summary = await page.evaluate(() => { const g = globalThis.__ms.game; let p = 0, h = 0, nums = {}; for (let c = 0; c < g.n; c++) { if (g.pressed[c]) p++; if (g.unlinked[c]) h++; if (g.pressed[c] && g.number[c] > 0) nums[g.number[c]] = (nums[g.number[c]] || 0) + 1; } return { pressed: p, hidden: h, nums }; });
console.log('after corner click:', JSON.stringify(summary));
await shot(page, '40-fixed-spawn-normal');
console.log('selected at spawn:', await page.evaluate(() => globalThis.__ms.selected()));

// aim at a number in the middle
const target = await page.evaluate(() => { const g = globalThis.__ms.game; for (let c = 0; c < g.n; c++) { const [i, j, k] = g.coords(c); if (g.pressed[c] && g.number[c] > 0 && i >= 2 && i <= 3 && j >= 2 && j <= 3) return c; } return -1; });
const sel = await page.evaluate((c) => globalThis.__ms.aimAt(c), target);
console.log('aim at number', target, '→ selected', sel, 'number', await page.evaluate((c) => globalThis.__ms.game.number[c], target));
await shot(page, '41-aim-number');
for (const [code, name] of [['ShiftLeft', 'shift'], ['Space', 'space'], ['ControlLeft', 'ctrl']]) {
  await page.evaluate((c) => globalThis.__ms.key(c, true), code);
  await frames(page, 2);
  console.log(name, 'controls:', await page.evaluate(() => { const c = globalThis.__ms.controls; return [c.shift, c.space, c.ctrl]; }), 'selected:', await page.evaluate(() => globalThis.__ms.selected()), 'chips:', await page.evaluate(() => [...document.querySelectorAll('#mode-chips .chip.on')].map((e) => e.textContent)));
  await shot(page, `42-mode-${name}`);
  await page.evaluate((c) => globalThis.__ms.key(c, false), code);
}
// spacing
for (const s of [2, 4, 10]) {
  await page.evaluate((s) => globalThis.__ms.wheel((s - globalThis.__ms.state.spacing) / 0.04), s);
  await frames(page, 2);
  console.log('spacing', (await info(page)).spacing, 'onScreen', JSON.stringify(await boardOnScreen(page)), 'chip', await page.evaluate(() => document.getElementById('chip-spacing').className + ' ' + document.getElementById('chip-spacing').textContent));
  await shot(page, `43-spacing-${s}`);
}
// spacing chip fades? wait
await sleep(2500); await frames(page, 2);
console.log('spacing chip after 2.5 s:', await page.evaluate(() => document.getElementById('chip-spacing').className));
// back to 1.1 and look from inside between cubes at spacing 2
await page.evaluate(() => globalThis.__ms.wheel((2 - globalThis.__ms.state.spacing) / 0.04));
// stand in the gap between columns i=2 and i=3 (x = 0 at even dims... centres at (i-2.5)*8 → i=2: -4, i=3: 4; gap centre x=0) in front of the board, looking in
await page.evaluate(() => { globalThis.__ms.moveTo(0, 0, -30); globalThis.__ms.look(Math.PI, 0); });
await shot(page, '44-gap-view-spacing2');
await page.evaluate(() => { globalThis.__ms.moveTo(0, 0, 0); globalThis.__ms.look(Math.PI, 0); });
await shot(page, '45-inside-gap-spacing2');
await page.evaluate(() => { globalThis.__ms.look(Math.PI / 2, 0); });
await shot(page, '46-inside-gap-look-side');
// default spacing inside a cube: what is picked?
await page.evaluate(() => { globalThis.__ms.wheel((1.1 - globalThis.__ms.state.spacing) / 0.04); globalThis.__ms.moveTo(-4.4 * 2.5 + 4.4 * 4, 4.4 * 0.5, 4.4 * 0.5); globalThis.__ms.look(Math.PI, 0); });
console.log('inside a cube at default spacing: selected', await page.evaluate(() => globalThis.__ms.selected()), 'cam', JSON.stringify((await info(page)).cam));
await shot(page, '47-inside-cube-default');

// picking size at distance on Expert: projected size of a front cube at spawn
await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 12, Y: 12, Z: 8, mines: 130 }); globalThis.__ms.forcePlay(); });
await frames(page, 3);
const px = await page.evaluate(() => {
  const m = globalThis.__ms, T = m.THREE, cam = m.renderer.camera, g = m.game, p = 4 * m.state.spacing;
  const c = [(5 - (g.X - 1) / 2) * p, (5 - (g.Y - 1) / 2) * p, (0 - (g.Z - 1) / 2) * p];
  const a = new T.Vector3(c[0] - 2, c[1] - 2, c[2] - 2).project(cam), b = new T.Vector3(c[0] + 2, c[1] + 2, c[2] - 2).project(cam);
  return { w: Math.abs(b.x - a.x) / 2 * innerWidth, h: Math.abs(b.y - a.y) / 2 * innerHeight, cam: m.info().cam, sel: m.selected() };
});
console.log('Expert spawn front cube px:', JSON.stringify(px), 'onScreen', JSON.stringify(await boardOnScreen(page)));
await shot(page, '48-expert-spawn');
await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 8, Y: 8, Z: 8, mines: 40 }); globalThis.__ms.forcePlay(); });
await frames(page, 3);
console.log('Intermediate spawn onScreen', JSON.stringify(await boardOnScreen(page)));
await shot(page, '49-intermediate-spawn');
// a big custom board: 20x20x20 spawn and fps
await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 20, Y: 20, Z: 20, mines: 400 }); globalThis.__ms.forcePlay(); });
await frames(page, 10);
console.log('20^3 spawn', JSON.stringify(await boardOnScreen(page)), 'fps', (await info(page)).fps);
await shot(page, '50-20cubed-spawn');
await browser.close();
