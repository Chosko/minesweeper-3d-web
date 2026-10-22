// Edge behaviours: flying far, Ctrl+W, leave guard, hint persistence, generating card, timer start.
import { launch, shot, frames, sleep, info, forcePlay } from './lib.mjs';

const { browser, page } = await launch();
await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }); });
await forcePlay(page);
// timer start precision: time right at started
const t = await page.evaluate(async () => {
  const m = globalThis.__ms; m.aimAt(0);
  const t0 = performance.now(); m.click('left');
  while (!m.state.started) await new Promise((r) => setTimeout(r, 5));
  return { genMs: Math.round(performance.now() - t0), elapsedAtStart: m.state.play.elapsedMs() };
});
console.log('generation ms and timer at start:', JSON.stringify(t));

// fly far away: 1500 units back
await page.evaluate(() => { globalThis.__ms.moveTo(0, 30, -1500); globalThis.__ms.look(Math.PI, 0); });
await shot(page, '80-far-1500');
await page.evaluate(() => { globalThis.__ms.moveTo(0, 30, -400); globalThis.__ms.look(Math.PI, 0.05); });
await shot(page, '81-far-400');
// looking straight down from above at the board
await page.evaluate(() => { globalThis.__ms.moveTo(0, 120, 0); globalThis.__ms.look(Math.PI, Math.PI / 2); });
await shot(page, '82-top-down');
// behind the board (yaw 0 looks -Z)
await page.evaluate(() => { globalThis.__ms.moveTo(0, 10, 60); globalThis.__ms.look(0, 0.1); });
await shot(page, '83-from-behind');
// look with pitch clamp: up
await page.evaluate(() => { globalThis.__ms.moveTo(2, 12, -46); globalThis.__ms.look(Math.PI, -Math.PI / 2); });
await shot(page, '84-look-straight-up');

// W while looking straight down: how does the forward quirk feel (should move along -forward incl. vertical)
await page.evaluate(() => { globalThis.__ms.moveTo(0, 60, -60); globalThis.__ms.look(Math.PI, Math.PI / 2); });
const c0 = (await info(page)).cam;
await page.evaluate(() => globalThis.__ms.key('KeyW', true)); await sleep(500); await page.evaluate(() => globalThis.__ms.key('KeyW', false));
const c1 = (await info(page)).cam;
console.log('W while looking straight down moved:', JSON.stringify({ dx: c1.x - c0.x, dy: c1.y - c0.y, dz: c1.z - c0.z }));
// W at pitch 45°: compare speeds
await page.evaluate(() => { globalThis.__ms.moveTo(0, 60, -60); globalThis.__ms.look(Math.PI, Math.PI / 4); });
const d0 = (await info(page)).cam;
await page.evaluate(() => globalThis.__ms.key('KeyW', true)); await sleep(500); await page.evaluate(() => globalThis.__ms.key('KeyW', false));
const d1 = (await info(page)).cam;
console.log('W at pitch 45 moved:', JSON.stringify({ dx: d1.x - d0.x, dy: d1.y - d0.y, dz: d1.z - d0.z, speed: Math.hypot(d1.x - d0.x, d1.y - d0.y, d1.z - d0.z) * 2 }));
// A (strafe) at pitch 45: horizontal?
const e0 = (await info(page)).cam;
await page.evaluate(() => globalThis.__ms.key('KeyA', true)); await sleep(500); await page.evaluate(() => globalThis.__ms.key('KeyA', false));
const e1 = (await info(page)).cam;
console.log('A at pitch 45 moved:', JSON.stringify({ dx: e1.x - e0.x, dy: e1.y - e0.y, dz: e1.z - e0.z }));

// Ctrl+W: is keydown default-prevented?
const cw = await page.evaluate(() => {
  const ev = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', ctrlKey: true, cancelable: true, bubbles: true });
  window.dispatchEvent(ev); document.dispatchEvent(ev);
  return ev.defaultPrevented;
});
console.log('Ctrl+W keydown defaultPrevented:', cw);
// leave guard
const guard = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return { prevented: e.defaultPrevented, rv: e.returnValue }; });
console.log('beforeunload guard during a started game:', JSON.stringify(guard));

// hint persistence: dismiss, then a new game
await page.click('#hint-strip-close').catch((e) => console.log('hint close:', e.message.split('\n')[0]));
await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }); });
await forcePlay(page);
console.log('hint visible after dismiss + new game:', await page.evaluate(() => !document.getElementById('hint-strip').classList.contains('hidden')));

// no-guess on the real board choice UI: toggle on, start Beginner; is the choice remembered? ready card wording
await page.evaluate(() => globalThis.__ms.pause());
await page.click('#p-menu'); await frames(page, 2);
await page.click('#p-confirm-yes').catch(() => {});
await frames(page, 3);
console.log('mode after Main menu:', await page.evaluate(() => globalThis.__ms.state.mode));
await page.click('#menu-entry-3d'); await frames(page, 2);
await shot(page, '85-board-choice-returning');
console.log('board choice last-played:', await page.evaluate(() => [...document.querySelectorAll('[data-preset][data-last]')].map((b) => b.innerText.replace(/\n/g, ' / '))));
await page.click('#bc-noguess');
await page.click('[data-preset="6,6,6,10"]'); await page.click('#bc-play');
await frames(page, 3);
console.log('ready card text with no-guess:', await page.evaluate(() => document.getElementById('ready-board').textContent), 'hud size:', await page.evaluate(() => document.getElementById('hud-title').getAttribute('title')));
await shot(page, '86-ready-noguess');
// ready Back → where?
await page.click('#ready-back'); await frames(page, 2);
console.log('after ready Back:', await page.evaluate(() => globalThis.__ms.state.mode));
// a game paused before the first click: pause card text
await page.click('[data-preset="6,6,6,10"]'); await page.click('#bc-play'); await frames(page, 2);
await forcePlay(page);
await page.evaluate(() => globalThis.__ms.pause()); await frames(page, 2);
console.log('pause before first click:', await page.evaluate(() => document.getElementById('pause-card').innerText.split('\n').slice(0, 3).join(' | ')));
// Records screen 3D
await page.click('#p-menu'); await frames(page, 2);
await page.click('#menu-entry-records'); await frames(page, 3);
await shot(page, '87-records-3d');
console.log('records text:', await page.evaluate(() => document.getElementById('records').innerText.replace(/\n+/g, ' | ').slice(0, 600)));
await browser.close();
