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
const hud = () => page.evaluate(() => ({ t: document.getElementById('hud-time').textContent, m: document.getElementById('hud-mines').textContent, mode: __ms.state.mode, st: __ms.modes.state }));
// 2D with pad: menu A → choice → custom fields → beginner
await press(BTN.A); await sleep(300); log('2D choice', await mode(page), 'focus', await focused(page));
await press(BTN.DOWN); await press(BTN.DOWN); await press(BTN.DOWN); log('DOWNx3 →', await focused(page));
await press(BTN.RB); log('RB → width', await page.evaluate(() => document.getElementById('c2d-width').value));
await press(BTN.LB); await press(BTN.DOWN); log('DOWN →', await focused(page));
await press(BTN.DOWN); log('DOWN →', await focused(page));
await press(BTN.A); log('A → noguess', await page.evaluate(() => document.getElementById('c2d-noguess').checked)); await press(BTN.A);
await press(BTN.UP); await press(BTN.UP); await press(BTN.UP); await press(BTN.UP); await press(BTN.UP); log('UPx5 →', await focused(page));
await press(BTN.A); await sleep(800); log('A on beginner →', await hud(), 'focus', await focused(page));
await shot(page, 'g2-01-2d-pad');
await press(BTN.RIGHT); await press(BTN.DOWN); await press(BTN.A); await sleep(1200); log('after A →', await hud());
await shot(page, 'g2-02-2d-pad-reveal');
// stick moves cursor
await axes([1, 0, 0, 0]); await frames(3); await axes([0,0,0,0]); await frames(2);
await press(BTN.X); await sleep(200); log('X → flag', await hud());
await press(BTN.X); await sleep(200);
await press(BTN.LT); await sleep(200); log('LT → flag', await hud()); await press(BTN.LT);
await press(BTN.Y); await sleep(200); log('Y chord', await hud());
// LT+RT chord
await set(BTN.LT, true); await set(BTN.RT, true); await frames(3); await set(BTN.RT, false); await set(BTN.LT, false); await frames(2); log('LT+RT', await hud());
// hold D-pad auto-repeat
await hold(BTN.RIGHT, 800);
await shot(page, 'g2-03-2d-pad-cursor');
await press(BTN.START); await sleep(400); log('START →', await mode(page), await focused(page));
await press(BTN.B); await sleep(400); log('B →', await mode(page));
await press(BTN.BACK); await sleep(400); log('BACK →', await mode(page)); await press(BTN.B); await sleep(400);
// RT reveal: on press or release?
await press(BTN.RIGHT); await set(BTN.RT, true); await frames(3); const h1 = await hud(); await set(BTN.RT, false); await sleep(400); const h2 = await hud(); log('RT press', h1, 'release', h2);
// Lose quickly: reveal row by row
let ended = false, n = 0;
outer: for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  for (let i = 0; i < 9; i++) { await press(BTN.LEFT); await press(BTN.UP); }
  for (let i = 0; i < r; i++) await press(BTN.DOWN);
  for (let i = 0; i < c; i++) await press(BTN.RIGHT);
  await press(BTN.A); n++; await sleep(60);
  if (await mode(page) !== 'classic-2d') { ended = true; break outer; }
}
await sleep(1500);
log('ended', ended, n, await mode(page), 'focus', await focused(page));
await shot(page, 'g2-04-results-pad');
// held-button test: hold A right when results appear? Instead: press B on results
await press(BTN.B); await sleep(400); log('B on results →', await mode(page), await focused(page));
// Records with pad
await page.focus('#menu-entry-records'); await press(BTN.A); await sleep(600); log('records', await mode(page), 'focus', await focused(page));
await press(BTN.RIGHT); log('RIGHT →', await focused(page), await page.evaluate(() => document.querySelector('#records-picker [aria-checked=true]')?.textContent));
await press(BTN.DOWN); log('DOWN →', await focused(page));
await press(BTN.DOWN); log('DOWN →', await focused(page));
await press(BTN.DOWN); log('DOWN →', await focused(page));
await press(BTN.DOWN); log('DOWN →', await focused(page));
await shot(page, 'g2-05-records-pad');
await press(BTN.B); await sleep(400); log('B →', await mode(page));
log('errors', errors);
await browser.close();
