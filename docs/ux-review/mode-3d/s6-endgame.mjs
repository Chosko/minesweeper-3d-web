// Loss and win end effects, results, replay, themes and viewports.
import { launch, shot, frames, sleep, info, forcePlay, DIR } from './lib.mjs';
import { writePng } from './png.mjs';

const { browser, page } = await launch({ width: 640, height: 400 });
const idx = (i, j, k) => i + 6 * (j + 6 * k);
const minesXYZ = [[1, 1, 4], [4, 1, 4], [2, 4, 4], [4, 4, 5], [0, 3, 5], [3, 2, 5], [5, 5, 3], [1, 5, 5], [5, 0, 4], [2, 2, 3]];
const mines = minesXYZ.map(([i, j, k]) => idx(i, j, k));

async function startFixed() {
  // a real generated Beginner board (a fixed board is a debug board and ends on the pause card)
  await page.evaluate(() => globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }));
  await forcePlay(page);
  await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx(0, 0, 0));
  await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
  await page.evaluate(() => globalThis.__ms.look(Math.PI, 0));
  await frames(page, 2);
  // warm up readPixels
  await page.evaluate(() => { const c = document.getElementById('scene'), gl = c.getContext('webgl2'); const px = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, px); });
}
// raw frames read from the WebGL canvas (DOM overlays excluded) at offsets after `act` runs in-page
async function captureFrames(prefix, act, offsets) {
  const data = await page.evaluate(async ({ act, offsets }) => {
    const m = globalThis.__ms, canvas = document.getElementById('scene');
    const gl = canvas.getContext('webgl2');
    const t0 = performance.now();
    (new Function('m', act))(m);
    const out = [];
    for (const off of offsets) {
      while (performance.now() - t0 < off) await new Promise((r) => requestAnimationFrame(r));
      m.renderer.render();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = ''; for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
      out.push({ off, at: Math.round(performance.now() - t0), w, h, b64: btoa(s), mode: m.state.mode, state: m.game.state, flash: getComputedStyle(document.getElementById('flash')).opacity, hud: document.getElementById('hud-time').textContent + '/' + document.getElementById('hud-mines').textContent });
    }
    return out;
  }, { act, offsets });
  for (const f of data) { writePng(`${DIR}/${prefix}-${f.off}ms.png`, Buffer.from(f.b64, 'base64'), f.w, f.h); console.log(prefix, f.off, 'at', f.at, 'mode', f.mode, f.state, 'flash', f.flash, 'hud', f.hud); }
}

// ---- LOSS: aim through numbers (Space) at the closed mine (2,2,3) and click
await startFixed();
const mineCell = await page.evaluate(() => { const g = globalThis.__ms.game; return [...Array(g.n).keys()].find((c) => g.number[c] === -1); });
const selSpace = await page.evaluate((c) => { const m = globalThis.__ms; m.key('Space', true); const p = m.cellCenter(c); m.moveTo(p[0], p[1] + 2, p[2] - 25); const s = m.aimAt(c); return s; }, mineCell);
console.log('aim at mine with Space →', selSpace, '(want', mineCell, ')');
await captureFrames('60-loss', 'm.click("left"); m.key("Space", false);', [30, 250, 500, 750, 950]);
await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 8000 });
await page.setViewportSize({ width: 1280, height: 800 });
await shot(page, '61-results-loss');
console.log('results text:', await page.evaluate(() => document.getElementById('results').innerText.replace(/\n+/g, ' | ')));
// Watch replay
await page.click('#r-watch');
await sleep(800); await frames(page, 3);
console.log('replay mode:', await page.evaluate(() => globalThis.__ms.state.mode), 'text:', await page.evaluate(() => document.getElementById('replay').innerText.replace(/\n+/g, ' | ')));
await shot(page, '62-replay-start');
await page.click('#rp-play');
await sleep(1500); await frames(page, 2);
await shot(page, '63-replay-playing');
await sleep(3000); await frames(page, 2);
await shot(page, '64-replay-later');
console.log('replay text later:', await page.evaluate(() => document.getElementById('replay').innerText.replace(/\n+/g, ' | ')));
await page.keyboard.press('Escape');
await frames(page, 3);
console.log('after Esc from replay:', await page.evaluate(() => globalThis.__ms.state.mode));

// ---- WIN
await page.click('#r-again');
await sleep(500);
console.log('after Play again:', await page.evaluate(() => globalThis.__ms.state.mode));
await shot(page, '65-play-again-ready');
if (await page.evaluate(() => globalThis.__ms.state.mode) !== 'playing') await forcePlay(page);
await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx(0, 0, 0));
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
const realMines = await page.evaluate(() => { const g = globalThis.__ms.game; return [...Array(g.n).keys()].filter((c) => g.number[c] === -1); });
console.log('mines on play-again board:', realMines.length);
await page.setViewportSize({ width: 640, height: 400 });
await page.evaluate(() => {
  const m = globalThis.__ms, g = m.game;
  const safe = [...Array(g.n).keys()].filter((c) => g.number[c] !== -1 && !g.pressed[c]);
  globalThis.__last = safe.pop();
  m.key('Space', true);
  for (const c of safe) { if (g.state !== 'playing') break; if (g.pressed[c]) continue; const p = m.cellCenter(c); m.moveTo(p[0], p[1], p[2] - 6); m.aimAt(c); m.click('left'); }
  m.key('Space', false);
  m.moveTo(2, 12, -46); m.look(Math.PI, 0.25);
});
console.log('before last click: state', await page.evaluate(() => globalThis.__ms.game.state), 'left', await page.evaluate(() => { const g = globalThis.__ms.game; return [...Array(g.n).keys()].filter((c) => g.number[c] !== -1 && !g.pressed[c]).length; }));
await shot(page, '66-win-before-last');
await captureFrames('66-win', 'm.key("Space", true); const p = m.cellCenter(globalThis.__last); m.moveTo(p[0], p[1], p[2] - 6); m.aimAt(globalThis.__last); m.click("left"); m.key("Space", false); m.moveTo(2, 12, -46); m.look(Math.PI, 0.25);', [30, 300, 600, 900]);
await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 8000 });
await page.setViewportSize({ width: 1280, height: 800 });
await shot(page, '67-results-win');
console.log('results win text:', await page.evaluate(() => document.getElementById('results').innerText.replace(/\n+/g, ' | ')));

await frames(page, 2);
await shot(page, '68-results-win');
await page.click('#r-again'); await sleep(400);
if (await page.evaluate(() => globalThis.__ms.state.mode) !== 'playing') { await shot(page, '69-ready'); await forcePlay(page); }
await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx(0, 0, 0));
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
await page.evaluate(() => { globalThis.__ms.look(Math.PI, 0.2); globalThis.__ms.key('ShiftLeft', true); globalThis.__ms.key('Space', true); });
await page.keyboard.press('KeyH');
await frames(page, 3);
await shot(page, '70-ingame-hud-help-chips');
await page.evaluate(() => { globalThis.__ms.key('ShiftLeft', false); globalThis.__ms.key('Space', false); });
await page.keyboard.press('KeyH');
await page.evaluate(() => globalThis.__ms.pause());
await frames(page, 3);
await shot(page, '71-pause');
await page.click('#p-restart');
await frames(page, 3);
await shot(page, '72-restart-confirm');
console.log('confirm text:', await page.evaluate(() => document.getElementById('pause-confirm')?.innerText.replace(/\n+/g, ' | ')));
await page.click('#p-confirm-no');

// ---- viewports
for (const vp of [{ width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
  await page.setViewportSize(vp);
  await page.click('#p-resume').catch(() => {});
  await sleep(300);
  if (await page.evaluate(() => globalThis.__ms.state.mode) === 'ready') await shot(page, `73-ready-${vp.width}`);
  if (await page.evaluate(() => globalThis.__ms.state.mode) !== 'playing') await forcePlay(page);
  await page.evaluate(() => { globalThis.__ms.look(Math.PI, 0.2); globalThis.__ms.key('ControlLeft', true); });
  await page.keyboard.press('KeyH');
  await frames(page, 3);
  await shot(page, `74-ingame-${vp.width}`);
  await page.keyboard.press('KeyH');
  await page.evaluate(() => globalThis.__ms.key('ControlLeft', false));
  await page.evaluate(() => globalThis.__ms.pause());
  await frames(page, 2);
}
await browser.close();
