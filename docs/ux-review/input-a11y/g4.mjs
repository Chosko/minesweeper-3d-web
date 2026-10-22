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
const press = async (b) => { await page.evaluate((i) => new Promise((done) => { const s = (v) => { Object.assign(globalThis.__fakePad.buttons[i], { pressed: v, touched: v, value: v ? 1 : 0 }); globalThis.__fakePad.timestamp++; }; s(true); requestAnimationFrame(() => { s(false); done(); }); }), b); await frames(2); };
const f = async () => (await focused(page)).replace(/\n/g, ' ');
// 2D beginner with pad: reveal, then test chord press feedback (LT then RT held) on the revealed cell
await press(BTN.A); await sleep(300); await press(BTN.A); await page.focus('#c2d-play'); await press(BTN.A); await sleep(600); log('2D', await mode(page));
await press(BTN.RIGHT); await press(BTN.RIGHT); await press(BTN.RIGHT); await press(BTN.DOWN); await press(BTN.DOWN); await press(BTN.DOWN);
await press(BTN.A); await sleep(1200); log('after A', await page.evaluate(() => document.getElementById('c2d-time').textContent));
await shot(page, 'g4-01-2d-revealed');
await set(BTN.LT, true); await frames(2); await set(BTN.RT, true); await frames(3);
await shot(page, 'g4-02-2d-lt-rt-held');
await set(BTN.RT, false); await frames(2); await set(BTN.LT, false); await frames(3); await sleep(200);
log('after LT+RT: mines', await page.evaluate(() => document.getElementById('c2d-mines-left').textContent));
await set(BTN.Y, true); await frames(3); await shot(page, 'g4-03-2d-y-held'); await set(BTN.Y, false); await frames(2);
// Hold A on a cell: pressed feedback until release?
await press(BTN.LEFT); await set(BTN.A, true); await frames(3); await shot(page, 'g4-04-2d-a-held'); const t1 = await page.evaluate(() => document.getElementById('c2d-mines-left').textContent); await set(BTN.A, false); await sleep(300);
// Leave via Start → Main menu → confirm with A
await press(BTN.START); await sleep(300); await page.focus('#p-menu'); await press(BTN.A); await sleep(200); log('confirm focus', await f()); await page.focus('#p-confirm-yes'); await press(BTN.A); await sleep(500); log('→', await mode(page), await f());
// win a 2x1 (keyboard fill) then replay with pad
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await sleep(300);
await page.click('#c2d-choice [data-size="custom"]'); await page.fill('#c2d-width', '2'); await page.fill('#c2d-height', '1'); await page.fill('#c2d-mines', '1'); await page.click('#c2d-play'); await sleep(600);
await page.keyboard.press('Space'); await sleep(1800); log('results', await mode(page), await f());
await press(BTN.RIGHT); log('RIGHT →', await f()); await press(BTN.A); await sleep(1500); log('replay', await mode(page), 'focus', await f());
const rp = () => page.evaluate(() => ({ play: document.getElementById('rp-play').textContent, pos: document.getElementById('rp-seek').getAttribute('aria-valuetext'), speed: document.querySelector('#rp-speed [aria-checked=true]').textContent, end: document.getElementById('replay-end').textContent }));
log('replay initial', await rp());
await press(BTN.START); await sleep(300); log('START →', await rp());
await press(BTN.Y); await sleep(300); log('Y →', await rp());
await press(BTN.RT); log('RT →', await rp()); await press(BTN.RT); log('RT →', await rp()); await press(BTN.LT); log('LT →', await rp());
await press(BTN.RB); log('RB →', await rp()); await press(BTN.LB); log('LB →', await rp());
log('replay DOWN walk:', [await (async () => { await press(BTN.DOWN); return f(); })(), await (async () => { await press(BTN.DOWN); return f(); })()].join(' → '));
log('replay RIGHT walk:', [await (async () => { await press(BTN.RIGHT); return f(); })(), await (async () => { await press(BTN.RIGHT); return f(); })(), await (async () => { await press(BTN.RIGHT); return f(); })()].join(' → '));
await shot(page, 'g4-05-replay-pad');
await press(BTN.B); await sleep(400); log('B →', await mode(page), await f());
// 3D pause card with pad: text shows keyboard controls?
await press(BTN.B); await sleep(300); await page.focus('#menu-entry-3d'); await press(BTN.A); await sleep(300); await page.focus('#board-choice [data-preset="6,6,6,10"]'); await press(BTN.A); await page.focus('#bc-play'); await press(BTN.A); await sleep(800); await press(BTN.A); await sleep(600);
log('3D playing', await mode(page), 'hud tools text', await page.evaluate(() => document.querySelector('.hud-tools').innerText.replace(/\n+/g, ' | ')), 'hint strip', await page.evaluate(() => document.getElementById('hint-strip').innerText.replace(/\n+/g, ' ')), 'hint visible', await page.evaluate(() => !document.getElementById('hint-strip').classList.contains('hidden')));
await press(BTN.START); await sleep(300); log('pause dl', await page.evaluate(() => document.getElementById('pause-controls').innerText.replace(/\n+/g, ' | ')));
log('errors', errors);
await browser.close();
