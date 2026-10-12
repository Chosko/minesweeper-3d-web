// Real mouse under pointer lock: look, press-turn-release, right-click on numbers, chord.
import { launch, shot, frames, sleep, info } from './lib.mjs';

const { browser, page } = await launch();
await page.click('#menu-entry-3d');
await page.click('[data-preset="6,6,6,10"]');
await frames(page, 2);
await page.click('#ready-btn');
await sleep(500);
console.log('locked:', await page.evaluate(() => document.pointerLockElement !== null), 'mode', await page.evaluate(() => globalThis.__ms.state.mode));

// 1. does Playwright's mouse.move produce movementX under lock?
const cam0 = (await info(page)).cam;
await page.mouse.move(640, 400);
await page.mouse.move(740, 400, { steps: 5 });
await frames(page, 2);
const cam1 = (await info(page)).cam;
console.log('yaw before/after page.mouse.move 100px:', cam0.yaw, cam1.yaw);
// 2. synthetic mousemove with movementX
await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: 0, bubbles: true })));
await frames(page, 2);
const cam2 = (await info(page)).cam;
console.log('yaw after synthetic movementX=100:', cam2.yaw, 'delta deg:', ((cam2.yaw - cam1.yaw) * 180 / Math.PI).toFixed(2));
// sensitivity: 0.2 deg/px → 360 deg = 1800 px. Report.

// reset look to spawn
await page.evaluate(() => globalThis.__ms.look(Math.PI, 0));

// 3. press on one cube, turn, release on another: which gets revealed? (first click → generation)
const before = await page.evaluate(() => globalThis.__ms.selected());
await page.mouse.down({ button: 'left' });
await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: 60, bubbles: true })));
await frames(page, 2);
const during = await page.evaluate(() => globalThis.__ms.selected());
await page.mouse.up({ button: 'left' });
await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
const revealedCells = await page.evaluate(() => { const g = globalThis.__ms.game; const out = []; for (let c = 0; c < g.n; c++) if (g.pressed[c]) out.push(c); return out; });
console.log('pressed on', before, 'released on', during, 'revealed:', JSON.stringify(revealedCells));
await shot(page, '20-press-turn-release');

// 4. right-click flag on a closed cube, then on a revealed number: flags all closed neighbours
const g = await page.evaluate(() => { const g = globalThis.__ms.game; return { X: g.X, Y: g.Y, Z: g.Z, n: g.n }; });
const numberCell = revealedCells.find(() => true);
const minesBefore = await page.evaluate(() => globalThis.__ms.game.minesLeft);
await page.evaluate((c) => globalThis.__ms.aimAt(c), numberCell);
await page.mouse.down({ button: 'right' });
await page.mouse.up({ button: 'right' });
await frames(page, 2);
const after = await page.evaluate(() => { const g = globalThis.__ms.game; let f = 0; for (let c = 0; c < g.n; c++) if (g.flagged[c]) f++; return { flags: f, minesLeft: g.minesLeft, hud: document.getElementById('hud-mines').textContent, number: null }; });
console.log('right-click on number', numberCell, 'number', await page.evaluate((c) => globalThis.__ms.game.number[c], numberCell), '→', JSON.stringify(after), 'minesLeft before', minesBefore);
await shot(page, '21-right-click-on-number');
// right-click again: unflag them all
await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' });
await frames(page, 2);
console.log('second right-click →', await page.evaluate(() => { const g = globalThis.__ms.game; let f = 0; for (let c = 0; c < g.n; c++) if (g.flagged[c]) f++; return f; }), 'flags');

// 5. chord with both buttons on the number (no flags → nothing / noop)
await page.mouse.down({ button: 'left' }); await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' });
await frames(page, 2);
console.log('after chord: pressed count', await page.evaluate(() => { const g = globalThis.__ms.game; let p = 0; for (let c = 0; c < g.n; c++) if (g.pressed[c]) p++; return p; }));

// 6. look away: what does a left click on nothing do (sky)?
await page.evaluate(() => globalThis.__ms.look(Math.PI, -1.2));
console.log('selected looking at sky:', await page.evaluate(() => globalThis.__ms.selected()), 'crosshair', await page.evaluate(() => document.getElementById('crosshair').className));
await shot(page, '22-looking-at-sky');

// 7. Esc releases the lock → pause card
await page.keyboard.press('Escape');
await sleep(600);
await frames(page, 2);
console.log('after Esc: mode', await page.evaluate(() => globalThis.__ms.state.mode), 'locked', await page.evaluate(() => document.pointerLockElement !== null));
await shot(page, '23-pause-card');
console.log('pause text:', await page.evaluate(() => document.getElementById('pause-card').innerText.replace(/\n+/g, ' | ')));
// resume by clicking Resume
await page.click('#p-resume').catch(async (e) => { console.log('no #p-resume:', e.message.split('\n')[0]); console.log(await page.evaluate(() => [...document.querySelectorAll('#pause-actions button')].map((b) => b.id + ':' + b.textContent))); });
await sleep(600);
await frames(page, 2);
console.log('after Resume: mode', await page.evaluate(() => globalThis.__ms.state.mode), 'locked', await page.evaluate(() => document.pointerLockElement !== null));
await shot(page, '24-after-resume');
// H panel
await page.keyboard.press('KeyH');
await frames(page, 2);
await shot(page, '25-help-panel');
await page.keyboard.press('KeyH');
// F fullscreen headless?
await page.keyboard.press('KeyF');
await sleep(500);
console.log('fullscreen element:', await page.evaluate(() => document.fullscreenElement?.id ?? null), 'setting', await page.evaluate(() => globalThis.__ms.settings.get('fullscreen')));
await browser.close();
