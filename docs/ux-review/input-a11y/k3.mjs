import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(URL); await ready(page);
const tabs = async (n) => { const o = []; for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); o.push(await focused(page)); } return o; };
await page.focus('#menu-entry-3d'); await page.keyboard.press('Enter'); await sleep(300);
log('3D choice', await mode(page), 'focus', await focused(page));
await shot(page, 'k3-01-board-choice');
log('TAB 3D choice:\n ' + (await tabs(14)).join('\n '));
// arrows in menu? press ArrowDown while on a preset
await page.focus('#board-choice [data-preset="6,6,6,10"]'); await page.keyboard.press('ArrowDown'); log('after ArrowDown on preset', await focused(page));
await page.focus('#board-choice [data-preset="6,6,6,10"]'); await page.keyboard.press('Enter'); await sleep(800);
log('after Enter on Beginner', await mode(page), 'focus', await focused(page));
await shot(page, 'k3-02-ready');
log('ready text', await page.evaluate(() => document.getElementById('ready').innerText.replace(/\n+/g,' | ')));
log('TAB ready:\n ' + (await tabs(4)).join('\n '));
await page.focus('#ready-btn'); await page.keyboard.press('Enter'); await sleep(1200);
log('after Enter on Click to play', await mode(page), 'focus', await focused(page), 'locked', await page.evaluate(() => !!document.pointerLockElement), 'msg', await page.evaluate(() => document.getElementById('ready-msg').textContent));
await shot(page, 'k3-03-after-enter');
if (await mode(page) === 'ready') { await page.click('#ready-btn'); await sleep(1200);
log('after mouse click on Click to play', await mode(page), 'locked', await page.evaluate(() => !!document.pointerLockElement), 'msg', await page.evaluate(() => document.getElementById('ready-msg').textContent));
await shot(page, 'k3-04-after-click'); }
if (await mode(page) !== 'playing') { await page.evaluate(() => __ms.forcePlay()); await sleep(800); log('forcePlay →', await mode(page)); }
await shot(page, 'k3-05-playing');
log('info', await page.evaluate(() => JSON.stringify(__ms.info())));
// Keyboard-only: fly W for 1s; can any cube be aimed? selected()
log('selected before', await page.evaluate(() => __ms.selected()));
await page.keyboard.down('w'); await sleep(1500); await page.keyboard.up('w'); await sleep(300);
log('cam after W', await page.evaluate(() => JSON.stringify(__ms.info().cam)), 'selected', await page.evaluate(() => __ms.selected()));
await shot(page, 'k3-06-after-w');
// any key to look? try arrows
await page.keyboard.down('ArrowLeft'); await sleep(600); await page.keyboard.up('ArrowLeft');
log('cam after ArrowLeft', await page.evaluate(() => JSON.stringify(__ms.info().cam)));
// H help
await page.keyboard.press('h'); await sleep(300);
log('help visible', await page.evaluate(() => !document.getElementById('help').classList.contains('hidden')));
await shot(page, 'k3-07-help');
log('help text', await page.evaluate(() => document.getElementById('help').innerText.replace(/\n+/g,' | ')));
await page.keyboard.press('h'); await sleep(100);
await page.keyboard.press('m'); await sleep(200); log('sound hud', await page.evaluate(() => document.getElementById('hud-sound').textContent), 'toast', await page.evaluate(() => document.getElementById('toast').textContent));
await page.keyboard.press('m');
// F fullscreen: observe
await page.keyboard.press('f'); await sleep(400); log('fullscreen el', await page.evaluate(() => !!document.fullscreenElement), 'toast', await page.evaluate(() => document.getElementById('toast').textContent));
// Esc → pause (lockless so Esc pauses directly)
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc', await mode(page), 'focus', await focused(page));
await shot(page, 'k3-08-pause3d');
log('pause text', await page.evaluate(() => document.getElementById('pause-card').innerText.replace(/\n+/g,' | ')));
log('TAB pause:\n ' + (await tabs(9)).join('\n '));
// Resume with Enter on Resume
await page.focus('#p-resume'); await page.keyboard.press('Enter'); await sleep(800);
log('after Resume', await mode(page), 'focus', await focused(page), 'locked', await page.evaluate(() => !!document.pointerLockElement));
await shot(page, 'k3-09-after-resume');
// Pause-resume with Esc
await page.keyboard.press('Escape'); await sleep(400); log('Esc →', await mode(page));
await page.keyboard.press('Escape'); await sleep(800); log('Esc again →', await mode(page), 'focus', await focused(page));
// 1024x768 font size check later. Mouse: aim at a cube using __ms.aimAt, then click left reveals (test release semantics)
await page.evaluate(() => __ms.forcePlay()); await sleep(500);
const sel = await page.evaluate(() => { __ms.aimAt(0); return __ms.selected(); });
log('aimed idx', sel);
await page.evaluate(() => __ms.mouseDown(0)); await sleep(100);
log('after mousedown, revealed?', await page.evaluate(() => JSON.stringify(__ms.info())));
await page.evaluate(() => __ms.mouseUp(0)); await sleep(1500);
log('after mouseup', await page.evaluate(() => JSON.stringify(__ms.info())));
await shot(page, 'k3-10-after-reveal');
// Pause card menu → confirm dialog
await page.keyboard.press('Escape'); await sleep(300);
await page.focus('#p-menu'); await page.keyboard.press('Enter'); await sleep(300);
log('confirm shown', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), 'focus', await focused(page));
await shot(page, 'k3-11-confirm');
await page.keyboard.press('Escape'); await sleep(300);
log('after Esc on confirm', await mode(page), 'confirm shown', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), 'focus', await focused(page));
log('errors', errors);
await browser.close();
