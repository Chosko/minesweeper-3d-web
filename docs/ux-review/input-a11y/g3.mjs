import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
function installFakePad() {
  const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  globalThis.__fakePad = pad;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(installFakePad);
await page.goto(URL); await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.pads.connected); await sleep(300);
const frames = (n) => page.evaluate((count) => new Promise((done) => { const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done()); step(count); }), n);
const set = (i, v) => page.evaluate(([i, v]) => { Object.assign(globalThis.__fakePad.buttons[i], { pressed: v, touched: v, value: v ? 1 : 0 }); globalThis.__fakePad.timestamp++; }, [i, v]);
const axes = (a) => page.evaluate((a) => { globalThis.__fakePad.axes = a; globalThis.__fakePad.timestamp++; }, a);
const press = async (b) => { await page.evaluate((i) => new Promise((done) => { const s = (v) => { Object.assign(globalThis.__fakePad.buttons[i], { pressed: v, touched: v, value: v ? 1 : 0 }); globalThis.__fakePad.timestamp++; }; s(true); requestAnimationFrame(() => { s(false); done(); }); }), b); await frames(2); };
const walk = async (b, n) => { const o = []; for (let i = 0; i < n; i++) { await press(b); o.push(await focused(page)); } return o.join(' → ').replace(/\n/g, ' '); };
// 1. menu stick single-frame
await page.focus('#menu-entry-classic-2d');
await page.evaluate(() => new Promise((done) => { globalThis.__fakePad.axes = [0, 1, 0, 0]; globalThis.__fakePad.timestamp++; requestAnimationFrame(() => { globalThis.__fakePad.axes = [0, 0, 0, 0]; done(); }); })); await frames(2);
log('menu: stick down 1 frame →', (await focused(page)).replace(/\n/g, ' '));
// 2. 2D choice DOWN walk and UP walk
await page.focus('#menu-entry-classic-2d'); await press(BTN.A); await sleep(300);
log('2D choice DOWN walk:', await walk(BTN.DOWN, 7));
log('2D choice UP walk:', await walk(BTN.UP, 7));
await page.focus('#c2d-choice [data-size="expert"]'); log('from Expert RIGHT:', await walk(BTN.RIGHT, 3));
await page.focus('#c2d-play'); log('from Start DOWN:', await walk(BTN.DOWN, 2)); 
await page.focus('#c2d-mines'); log('from Mines DOWN:', await walk(BTN.DOWN, 2));
await page.focus('#c2d-width'); log('from Width LEFT/DOWN:', await walk(BTN.DOWN, 2));
await press(BTN.B); await sleep(300);
// 3. Settings DOWN walk from the first control and RIGHT walk
await page.focus('#menu-entry-settings'); await press(BTN.A); await sleep(300);
log('settings DOWN walk:', await walk(BTN.DOWN, 8));
await page.focus('#set-lookSensitivity'); log('settings RIGHT walk:', await walk(BTN.RIGHT, 5));
await page.focus('#set-theme [aria-checked="true"]'); log('from Theme DOWN:', await walk(BTN.DOWN, 3));
await press(BTN.B); await sleep(300);
// 4. Win a 2x1 with keyboard so Records has bests + replays; then Records pad walk
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await sleep(300);
await page.click('#c2d-choice [data-size="custom"]'); await page.fill('#c2d-width', '2'); await page.fill('#c2d-height', '1'); await page.fill('#c2d-mines', '1'); await page.click('#c2d-play'); await sleep(600);
await page.keyboard.press('Space'); await sleep(1500); log('mode', await mode(page));
await page.focus('#r-records'); await press(BTN.A); await sleep(800); log('records focus', (await focused(page)).replace(/\n/g, ' '));
log('records DOWN walk:', await walk(BTN.DOWN, 8));
await page.focus('#records-pinned-first'); log('from Pinned first RIGHT:', await walk(BTN.RIGHT, 3));
await page.focus('#records-picker [aria-checked="true"]'); log('from picker RIGHT:', await walk(BTN.RIGHT, 2)); log('then DOWN:', await walk(BTN.DOWN, 3));
await shot(page, 'g3-01-records-walk');
await press(BTN.B); await sleep(300); log('B →', await mode(page));
// 5. Results walk with pad (play again quickly)
await page.focus('#menu-entry-classic-2d'); await press(BTN.A); await sleep(300); await page.focus('#c2d-play'); await press(BTN.A); await sleep(600);
await press(BTN.A); await sleep(1500); log('results?', await mode(page), (await focused(page)).replace(/\n/g, ' '));
log('results RIGHT walk:', await walk(BTN.RIGHT, 4)); log('results DOWN walk:', await walk(BTN.DOWN, 2));
// Watch replay with pad and drive it
await page.focus('#r-watch'); await press(BTN.A); await sleep(1500); log('replay', await mode(page), (await focused(page)).replace(/\n/g, ' '));
await press(BTN.START); await sleep(300); log('START → play btn', await page.evaluate(() => document.getElementById('rp-play').textContent));
await press(BTN.RT); log('RT → speed', await page.evaluate(() => document.querySelector('#rp-speed [aria-checked=true]').textContent));
await press(BTN.RB); await press(BTN.LB); log('replay walk RIGHT:', await walk(BTN.RIGHT, 5)); log('replay DOWN:', await walk(BTN.DOWN, 2));
await press(BTN.B); await sleep(400); log('B →', await mode(page));
await press(BTN.B); await sleep(400); log('B →', await mode(page));
// 6. 3D: held-A suppression on ready → playing; LT+RT chord with frame gaps; Y (Ctrl) chip
await page.focus('#menu-entry-3d'); await press(BTN.A); await sleep(300); await page.focus('#board-choice [data-preset="6,6,6,10"]'); await press(BTN.A); await page.focus('#bc-play'); await press(BTN.A); await sleep(800);
log('ready', await mode(page));
await set(BTN.A, true); await frames(4); const y0 = await page.evaluate(() => __ms.info().cam.y); await sleep(600); const y1 = await page.evaluate(() => __ms.info().cam.y); await set(BTN.A, false); await frames(2);
log('held A across ready→playing: mode', await mode(page), 'cam y', y0, '→', y1, '(moved up while held?', y1 > y0 + 0.01, ')');
await page.evaluate(() => __ms.aimAt(0)); await frames(2);
await press(BTN.RT); await sleep(1500); log('after RT reveal', await page.evaluate(() => JSON.stringify({ s: __ms.selected(), hud: __ms.info().hud })));
// find a revealed number to chord on: scan cells via game view
const target = await page.evaluate(() => { const g = __ms.game; const n = g.count ?? g.size ?? 216; for (let i = 0; i < 216; i++) { try { if (g.isRevealed?.(i) && (g.numberAt?.(i) ?? 0) > 0) return i; } catch { return 'err:' + Object.keys(g).join(','); } } return Object.keys(g).join(','); });
log('game view keys/target', target);
await shot(page, 'g3-02-3d-after-reveal');
// LT then RT then release RT then LT: chord?
await set(BTN.LT, true); await frames(2); await set(BTN.RT, true); await frames(2); await set(BTN.RT, false); await frames(2); await set(BTN.LT, false); await frames(3); await sleep(300);
log('LT+RT chord on nothing: hud', await page.evaluate(() => JSON.stringify(__ms.info().hud)));
await set(BTN.Y, true); await frames(3); log('Y held chips', await page.evaluate(() => [...document.querySelectorAll('#mode-chips .chip.on')].map(c => c.textContent))); await set(BTN.Y, false);
await set(BTN.RB, true); await frames(3); log('RB held chips', await page.evaluate(() => [...document.querySelectorAll('#mode-chips .chip.on')].map(c => c.textContent))); await set(BTN.RB, false);
// Start pause → X help while paused?
await press(BTN.START); await sleep(300); log('paused', await mode(page));
await press(BTN.X); await sleep(200); log('X in pause → help visible', await page.evaluate(() => !document.getElementById('help').classList.contains('hidden')));
// pad on pause: Main menu → confirm with B
await page.focus('#p-menu'); await press(BTN.A); await sleep(200); log('confirm?', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), (await focused(page)).replace(/\n/g,' '));
await press(BTN.B); await sleep(300); log('B on confirm →', await mode(page), 'confirm?', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), (await focused(page)).replace(/\n/g,' '));
log('errors', errors);
await browser.close();
