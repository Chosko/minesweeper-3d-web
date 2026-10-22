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
const hold = async (b, ms) => { await set(b, true); await sleep(ms); await set(b, false); await frames(2); };
log('menu', await mode(page), 'focus', await focused(page), 'pad-nav', await page.evaluate(() => document.body.classList.contains('pad-nav')));
await shot(page, 'g-01-menu');
await press(BTN.DOWN); log('DOWN →', await focused(page));
await shot(page, 'g-02-menu-padfocus');
// hold DOWN for auto-repeat
await hold(BTN.DOWN, 900); log('hold DOWN 900ms →', await focused(page));
await press(BTN.UP); await press(BTN.UP); await press(BTN.UP); log('UPx3 →', await focused(page));
// left stick navigation
await axes([0, 1, 0, 0]); await frames(3); await axes([0, 0, 0, 0]); await frames(2); log('stick down →', await focused(page));
// B on menu does? 
await press(BTN.B); log('B on menu →', await mode(page), await focused(page));
// Settings: navigate with pad; slider
await page.focus('#menu-entry-settings'); await press(BTN.A); await sleep(300); log('settings', await mode(page), 'focus', await focused(page));
await press(BTN.RIGHT); await press(BTN.RIGHT); log('slider after RIGHTx2', await page.evaluate(() => document.getElementById('set-lookSensitivity').value));
await press(BTN.DOWN); log('DOWN →', await focused(page)); await press(BTN.A); log('A on toggle → checked', await page.evaluate(() => document.getElementById('set-invertY').checked));
await press(BTN.DOWN); await press(BTN.DOWN); log('DOWNx2 →', await focused(page)); await press(BTN.RIGHT); log('RIGHT on segmented →', await focused(page), await page.evaluate(() => document.querySelector('#set-renderResolution [aria-checked=true]')?.textContent));
await shot(page, 'g-03-settings-pad');
await press(BTN.B); await sleep(300); log('B →', await mode(page), 'focus', await focused(page));
// 3D board choice: custom fields LB/RB
await page.focus('#menu-entry-3d'); await press(BTN.A); await sleep(300); log('3D choice', await mode(page), 'focus', await focused(page));
for (let i = 0; i < 3; i++) await press(BTN.DOWN); log('DOWNx3 →', await focused(page));
await press(BTN.A); log('A on noguess → checked', await page.evaluate(() => document.getElementById('bc-noguess').checked));
await press(BTN.A);
await press(BTN.DOWN); log('DOWN →', await focused(page));
await press(BTN.RB); await press(BTN.RB); log('RBx2 → value', await page.evaluate(() => document.getElementById('c-x').value));
await press(BTN.LB); log('LB → value', await page.evaluate(() => document.getElementById('c-x').value));
await hold(BTN.RB, 900); log('hold RB 900ms → value', await page.evaluate(() => document.getElementById('c-x').value));
await press(BTN.RIGHT); log('RIGHT →', await focused(page));
await press(BTN.DOWN); log('DOWN →', await focused(page));
await shot(page, 'g-04-custom-pad');
await press(BTN.B); await sleep(200); log('B →', await mode(page));
// Start cube beginner
await page.focus('#menu-entry-3d'); await press(BTN.A); await sleep(300);
await page.focus('#board-choice [data-preset="6,6,6,10"]'); await press(BTN.A); await page.focus('#bc-play'); await press(BTN.A); await sleep(800);
log('ready', await mode(page), 'focus', await focused(page));
await shot(page, 'g-05-ready-pad');
log('ready-pad text', await page.evaluate(() => document.getElementById('ready-pad').innerText.replace(/\n+/g,' | ')));
await press(BTN.A); await sleep(800); log('A on ready →', await mode(page), 'lockless', await page.evaluate(() => document.body.classList.contains('lockless')));
await shot(page, 'g-06-playing-pad');
// X help panel
await press(BTN.X); await sleep(300); log('help visible', await page.evaluate(() => !document.getElementById('help').classList.contains('hidden')));
await shot(page, 'g-07-help-xbox');
log('help pad text', await page.evaluate(() => document.querySelector('#help .ui-controls').innerText.replace(/\n+/g,' | ')));
await press(BTN.X);
// right stick look
const cam0 = await page.evaluate(() => JSON.stringify(__ms.info().cam));
await axes([0, 0, 0.6, 0]); await sleep(500); await axes([0,0,0,0]); await frames(2);
log('cam before', cam0, 'after right stick', await page.evaluate(() => JSON.stringify(__ms.info().cam)));
// small deflection (dead zone)
await axes([0, 0, 0.1, 0]); await sleep(400); await axes([0,0,0,0]); await frames(2);
log('after 0.1 deflection', await page.evaluate(() => JSON.stringify(__ms.info().cam)));
// left stick fly
await axes([0, -1, 0, 0]); await sleep(800); await axes([0,0,0,0]); await frames(2);
log('after left stick fwd', await page.evaluate(() => JSON.stringify(__ms.info().cam)));
// aim and RT reveal (press, check not yet, release)
await page.evaluate(() => __ms.aimAt(0)); await frames(2);
await set(BTN.RT, true); await page.evaluate(() => { globalThis.__fakePad.buttons[7].value = 1; }); await frames(3);
log('RT held: info', await page.evaluate(() => JSON.stringify(__ms.info())));
await set(BTN.RT, false); await sleep(1500);
log('RT released: info', await page.evaluate(() => JSON.stringify(__ms.info())));
await shot(page, 'g-08-after-rt');
// LT flag on another cube
const idx = await page.evaluate(() => { const r = __ms.aimAt(1); return r; }); log('aim idx', idx);
await hold(BTN.LT, 200); await sleep(300); log('after LT: mines hud', await page.evaluate(() => document.getElementById('hud-mines').textContent));
// view modes LB/RB/Y chips
await set(BTN.LB, true); await frames(3); log('LB held chips', await page.evaluate(() => [...document.querySelectorAll('#mode-chips .chip')].filter(c => getComputedStyle(c).opacity !== '0' && c.classList.contains('on')).map(c => c.textContent)));
await shot(page, 'g-09-lb-held'); await set(BTN.LB, false);
// D-pad spacing
await press(BTN.UP); await frames(2); log('spacing chip', await page.evaluate(() => (document.getElementById('hud-tools').innerText.match(/spacing \S+/) || [''])[0]));
// Start pause
await press(BTN.START); await sleep(400); log('START →', await mode(page), 'focus', await focused(page));
await shot(page, 'g-10-pause-pad');
await press(BTN.START); await sleep(600); log('START again →', await mode(page));
await press(BTN.BACK); await sleep(400); log('BACK →', await mode(page), 'focus', await focused(page));
await press(BTN.B); await sleep(600); log('B in pause →', await mode(page));
// held button suppression: hold A, pause via START, release A (A on Resume?)
await press(BTN.START); await sleep(300); log('paused', await mode(page), await focused(page));
await set(BTN.A, true); await frames(3); log('A held on Resume → mode', await mode(page)); await set(BTN.A, false); await frames(3); log('A released →', await mode(page));
// disconnect pauses
await page.evaluate(() => { globalThis.__fakePad.connected = false; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null, null, null, null] }); }); await sleep(600);
log('after disconnect →', await mode(page), 'note', await page.evaluate(() => document.getElementById('pause-note').textContent), 'toast', await page.evaluate(() => document.getElementById('toast').textContent));
await shot(page, 'g-11-disconnect');
// reconnect as PlayStation pad and view help labels
await page.evaluate(() => { const pad = globalThis.__fakePad; pad.id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'; pad.connected = true; Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] }); }); await sleep(600);
log('reconnected', await page.evaluate(() => __ms.pads.connected), 'mode', await mode(page), 'focus', await focused(page));
await shot(page, 'g-12-reconnected');
await press(BTN.A); await sleep(600); log('A → ', await mode(page));
if (await mode(page) !== 'playing') { await press(BTN.START); await sleep(600); log('START →', await mode(page)); }
await press(BTN.X); await sleep(300); log('help pad text PS', await page.evaluate(() => document.querySelector('#help .ui-controls').innerText.replace(/\n+/g,' | ')));
await shot(page, 'g-13-help-ps');
await press(BTN.X);
// rumble: check vibrationActuator usage
log('vibration used?', await page.evaluate(() => typeof globalThis.__fakePad.vibrationActuator));
log('errors', errors);
await browser.close();
