import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(URL); await ready(page);
const info = () => page.evaluate(() => ({ mode: __ms.state.mode, hud: { t: document.getElementById('hud-time').textContent, m: document.getElementById('hud-mines').textContent }, modeState: __ms.modes.state }));
// Keyboard: menu → Classic 2D → Beginner
await page.keyboard.press('Enter'); await sleep(200); await page.keyboard.press('Enter'); await sleep(600);
log('in 2D', await info(), 'focus', await focused(page));
// Does arrow key move in menus? test later. Now: arrows move cursor, Space reveals
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await sleep(100);
await page.keyboard.press('Space'); await sleep(1200);
log('after first Space', await info());
await shot(page, 'k-04-c2d-first-reveal');
// F flags a cell, D chord
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(50);
await page.keyboard.press('f'); await sleep(200); log('after F', await info());
await page.keyboard.press('f'); await sleep(200); log('after F again (unflag)', await info());
await page.keyboard.press('d'); await sleep(200);
// Esc → pause
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc', await mode(page), 'focus', await focused(page));
await shot(page, 'k-05-c2d-paused');
const order = [];
for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); order.push(await focused(page)); }
log('TAB ORDER pause:\n ' + order.join('\n '));
// Esc again resumes?
await page.keyboard.press('Escape'); await sleep(400);
log('after 2nd Esc', await mode(page), 'focus', await focused(page));
// Hold arrow auto repeat
await page.keyboard.down('ArrowDown'); await sleep(900); await page.keyboard.up('ArrowDown');
// Play until end: reveal cells row by row
let n = 0;
outer: for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    await page.keyboard.press('Space'); await sleep(80); n++;
    const m = await mode(page); if (m !== 'classic-2d') { log('game ended after', n, 'presses ->', m); break outer; }
    await page.keyboard.press('ArrowRight'); await sleep(20);
  }
  await page.keyboard.press('ArrowDown'); for (let c = 0; c < 9; c++) await page.keyboard.press('ArrowLeft');
}
await sleep(1500);
log('end mode', await mode(page), 'focus', await focused(page));
await shot(page, 'k-06-results');
log('results title', await page.evaluate(() => document.getElementById('results-title').textContent));
const ro = [];
for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); ro.push(await focused(page)); }
log('TAB ORDER results:\n ' + ro.join('\n '));
// Does Esc from results go to menu?
// Go Watch replay via focusing
await page.focus('#r-watch'); await page.keyboard.press('Enter'); await sleep(1200);
log('replay mode', await mode(page), 'focus', await focused(page));
await shot(page, 'k-07-replay');
await page.keyboard.press('Space'); await sleep(1500); log('replay playing? pos', await page.evaluate(() => ({ pos: document.getElementById('rp-position').textContent, play: document.getElementById('rp-play').textContent, end: document.getElementById('replay-end').textContent })));
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await sleep(200);
await page.keyboard.press('='); await sleep(100);
log('replay after keys', await page.evaluate(() => ({ pos: document.getElementById('rp-position').textContent, speed: document.querySelector('#rp-speed [aria-checked="true"]').textContent })));
await page.keyboard.press('End'); await sleep(500);
await shot(page, 'k-08-replay-end');
log('replay end text', await page.evaluate(() => document.getElementById('replay-end').textContent));
await page.keyboard.press('Escape'); await sleep(500);
log('after Esc from replay', await mode(page), 'focus', await focused(page));
// Records via keyboard
await page.focus('#r-records'); await page.keyboard.press('Enter'); await sleep(800);
log('records', await mode(page), 'focus', await focused(page));
await shot(page, 'k-09-records');
const rr = [];
for (let i = 0; i < 20; i++) { await page.keyboard.press('Tab'); rr.push(await focused(page)); }
log('TAB ORDER records:\n ' + rr.join('\n '));
// arrow on picker (radiogroup)?
await page.focus('#records-mode [aria-checked="true"]'); await page.keyboard.press('ArrowRight'); await sleep(300);
log('records mode after ArrowRight', await page.evaluate(() => document.querySelector('#records-mode [aria-checked="true"]').textContent), 'focus', await focused(page));
log('chart aria', await page.evaluate(() => document.getElementById('records-chart').getAttribute('aria-label')));
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc from records', await mode(page), 'focus', await focused(page));
// settings
await page.focus('#menu-entry-settings'); await page.keyboard.press('Enter'); await sleep(500);
log('settings', await mode(page), 'focus', await focused(page));
await shot(page, 'k-10-settings');
const so = [];
for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); so.push(await focused(page)); }
log('TAB ORDER settings:\n ' + so.join('\n '));
log('settings body text', await page.evaluate(() => document.getElementById('settings-body').innerText));
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc from settings', await mode(page), 'focus', await focused(page));
// Controls modal on menu
await page.focus('#menu-help'); await page.keyboard.press('Enter'); await sleep(400);
log('controls modal open?', await page.evaluate(() => !document.getElementById('controls-modal').classList.contains('hidden')), 'focus', await focused(page));
await shot(page, 'k-11-controls-modal');
const co = []; for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); co.push(await focused(page)); }
log('TAB in modal:\n ' + co.join('\n '));
await page.keyboard.press('Escape'); await sleep(300);
log('modal closed?', await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), 'focus', await focused(page));
log('errors', errors);
await browser.close();
