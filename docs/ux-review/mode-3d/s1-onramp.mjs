import { launch, shot, frames, sleep, info, forcePlay, firstClick, boardOnScreen, mines, hold } from './lib.mjs';

const { browser, page } = await launch();
await shot(page, '01-menu');
await page.click('#menu-entry-3d');
await frames(page, 3);
await shot(page, '02-board-choice');

// pick Cube Beginner through the real button
await page.click('[data-preset="6,6,6,10"]'); await page.click('#bc-play');
await frames(page, 3);
console.log('mode after preset click:', await page.evaluate(() => globalThis.__ms.state.mode));
await shot(page, '03-ready-card');
console.log('ready text:', await page.evaluate(() => document.getElementById('ready').innerText));

// real click on the ready card: does pointer lock engage?
await page.click('#ready-btn');
await sleep(800);
await frames(page, 3);
console.log('mode after ready click:', await page.evaluate(() => globalThis.__ms.state.mode), 'lock:', await page.evaluate(() => document.pointerLockElement !== null), 'msg:', await page.evaluate(() => document.getElementById('ready-msg').textContent));
await shot(page, '04-after-ready-click');

// lockless play
if (await page.evaluate(() => globalThis.__ms.state.mode) !== 'playing') await forcePlay(page);
await shot(page, '05-spawn-view');
console.log('spawn info:', JSON.stringify(await info(page)));
console.log('board on screen at spawn:', JSON.stringify(await boardOnScreen(page)));
console.log('hud text:', await page.evaluate(() => document.getElementById('hud').innerText.replace(/\n+/g, ' | ')));
console.log('hint strip visible:', await page.evaluate(() => !document.getElementById('hint-strip').classList.contains('hidden')));
console.log('crosshair class:', await page.evaluate(() => document.getElementById('crosshair').className));
console.log('selected at spawn:', await page.evaluate(() => globalThis.__ms.selected()));

// what's aimed at spawn? try the real centre pick
// first click in the middle of the front face
const front = await page.evaluate(() => { const g = globalThis.__ms.game; return 2 + g.X * (2 + g.Y * 0); });
await page.evaluate((c) => globalThis.__ms.aimAt(c), front);
await shot(page, '06-aimed-front');
console.log('crosshair class aimed:', await page.evaluate(() => document.getElementById('crosshair').className));
await firstClick(page, front);
await shot(page, '07-after-first-click');
console.log('after first click:', JSON.stringify(await info(page)));
const ms = await mines(page);
console.log('mines:', ms.join(','));
// which cells got revealed
const revealed = await page.evaluate(() => { const g = globalThis.__ms.game; const out = []; for (let c = 0; c < g.n; c++) if (g.pressed[c]) out.push([c, g.number[c]]); return out; });
console.log('revealed after first click:', JSON.stringify(revealed));

// fly forward 1s with W (50 u/s)
await hold(page, 'KeyW', 1000);
console.log('after W 1s:', JSON.stringify((await info(page)).cam));
await shot(page, '08-after-W-1s');
await hold(page, 'KeyW', 1000);
console.log('after W 2s:', JSON.stringify((await info(page)).cam));
await shot(page, '09-after-W-2s');
// look around from inside
await page.evaluate(() => globalThis.__ms.look(Math.PI / 2, 0.3));
await shot(page, '10-inside-look-right');
await page.evaluate(() => globalThis.__ms.look(Math.PI, 0));
await shot(page, '11-inside-look-fwd');
await browser.close();
