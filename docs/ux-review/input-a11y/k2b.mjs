import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(URL); await ready(page);
const tabs = async (n) => { const o = []; for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); o.push(await focused(page)); } return o; };
// menu → Classic 2D → custom 2x1x1 by keyboard
await page.keyboard.press('Enter'); await sleep(300);
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); // width
log('focus', await focused(page));
await page.keyboard.press('Control+a'); await page.keyboard.type('2');
await page.keyboard.press('Tab'); await page.keyboard.press('Control+a'); await page.keyboard.type('1');
await page.keyboard.press('Tab'); await page.keyboard.press('Control+a'); await page.keyboard.type('1');
log('info text', await page.evaluate(() => document.getElementById('c2d-info').textContent));
// ArrowUp on a number field steps? test
await page.keyboard.press('ArrowUp'); log('mines after ArrowUp', await page.evaluate(() => document.getElementById('c2d-mines').value), 'info', await page.evaluate(() => document.getElementById('c2d-info').textContent));
await page.keyboard.press('ArrowDown');
await shot(page, 'k-12-custom-2x1');
await page.keyboard.press('Enter'); await sleep(600); // submit from field
log('after Enter in field', await mode(page), 'focus', await focused(page));
await shot(page, 'k-13-2x1-board');
await page.keyboard.press('Space'); await sleep(1500);
log('after Space', await mode(page), 'focus', await focused(page), 'title', await page.evaluate(() => document.getElementById('results-title').textContent));
await shot(page, 'k-14-results-win');
log('TAB results:\n ' + (await tabs(6)).join('\n '));
log('results text', await page.evaluate(() => document.querySelector('#results .ui-card').innerText.replace(/\n+/g,' | ')));
// Esc on results?
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc on results', await mode(page), 'focus', await focused(page));
// come back: menu → records → ... Actually go play again quickly: Classic 2D → custom preselected?
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await sleep(300);
log('choice focus (last choice custom?)', await focused(page));
await shot(page, 'k-15-choice-returning');
await page.keyboard.press('Enter'); await sleep(600); log('mode', await mode(page));
await page.keyboard.press('Space'); await sleep(1500); log('mode', await mode(page), 'focus', await focused(page));
// Watch replay by keyboard
await page.keyboard.press('Tab'); log('focus', await focused(page)); await page.keyboard.press('Enter'); await sleep(1500);
log('replay', await mode(page), 'focus', await focused(page));
await shot(page, 'k-16-replay');
log('TAB replay:\n ' + (await tabs(10)).join('\n '));
await page.focus('#rp-play');
await page.keyboard.press('Home');
await page.keyboard.press('Space'); await sleep(2500);
log('replay state', await page.evaluate(() => ({ pos: document.getElementById('rp-position').textContent, play: document.getElementById('rp-play').textContent, end: document.getElementById('replay-end').textContent, clock: document.getElementById('rp-clock').textContent })));
await page.keyboard.press('='); await page.keyboard.press('=');
log('speed', await page.evaluate(() => document.querySelector('#rp-speed [aria-checked="true"]').textContent));
await page.keyboard.press('Home'); await sleep(100); await page.keyboard.press('ArrowRight'); await sleep(200);
log('after Home, →', await page.evaluate(() => ({ pos: document.getElementById('rp-position').textContent, end: document.getElementById('replay-end').textContent })));
await shot(page, 'k-17-replay-end');
await page.keyboard.press('Escape'); await sleep(500);
log('after Esc from replay', await mode(page), 'focus', await focused(page));
// Records from results
await page.focus('#r-records'); await page.keyboard.press('Enter'); await sleep(800);
log('records', await mode(page), 'focus', await focused(page));
await shot(page, 'k-18-records');
log('TAB records:\n ' + (await tabs(24)).join('\n '));
await page.focus('#records-mode [aria-checked="true"]'); await page.keyboard.press('ArrowRight'); await sleep(300);
log('records mode after ArrowRight:', await page.evaluate(() => document.querySelector('#records-mode [aria-checked="true"]').textContent), 'focus', await focused(page));
await page.keyboard.press('ArrowLeft'); await sleep(300);
log('picker options', await page.evaluate(() => [...document.querySelectorAll('#records-picker [role=radio]')].map(b => b.textContent + (b.getAttribute('aria-checked')==='true'?'*':'')).join(', ')));
log('chart aria', await page.evaluate(() => document.getElementById('records-chart').getAttribute('aria-label')));
log('records games rows', await page.evaluate(() => document.getElementById('records-games').innerText.replace(/\n+/g,' | ')));
log('replays rows', await page.evaluate(() => document.getElementById('records-replays-table').innerText.replace(/\n+/g,' | ')));
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc from records', await mode(page), 'focus', await focused(page));
await page.keyboard.press('Escape'); await sleep(400);
log('after 2nd Esc', await mode(page), 'focus', await focused(page));
// Settings
await page.focus('#menu-entry-settings'); await page.keyboard.press('Enter'); await sleep(500);
log('settings', await mode(page), 'focus', await focused(page));
await shot(page, 'k-19-settings');
log('TAB settings:\n ' + (await tabs(14)).join('\n '));
log('settings html snippet', await page.evaluate(() => document.getElementById('settings-body').innerHTML.slice(-600)));
// Theme toggle by keyboard: focus Dark radio and press Enter
await page.focus('#set-theme [data-value="dark"]'); await page.keyboard.press('Enter'); await sleep(400);
log('theme', await page.evaluate(() => document.documentElement.dataset.theme || getComputedStyle(document.body).backgroundColor));
await shot(page, 'k-20-settings-dark');
await page.keyboard.press('Escape'); await sleep(400);
log('after Esc from settings', await mode(page), 'focus', await focused(page));
await shot(page, 'k-21-menu-dark');
// Controls modal on menu
await page.focus('#menu-help'); await page.keyboard.press('Enter'); await sleep(400);
log('controls modal open?', await page.evaluate(() => !document.getElementById('controls-modal').classList.contains('hidden')), 'focus', await focused(page));
await shot(page, 'k-22-controls-modal-dark');
log('TAB in modal:\n ' + (await tabs(5)).join('\n '));
log('modal text', await page.evaluate(() => document.getElementById('controls-body').innerText.replace(/\n+/g,' | ')));
await page.keyboard.press('Escape'); await sleep(300);
log('modal closed?', await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), 'focus', await focused(page));
// Loss on beginner: 2D → beginner → exhaustive reveal
await page.focus('#menu-entry-classic-2d'); await page.keyboard.press('Enter'); await sleep(300);
await page.focus('#c2d-choice [data-size="beginner"]'); await page.keyboard.press('Enter'); await sleep(600);
let presses = 0; let ended = false;
outer: for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  for (let i = 0; i < 9; i++) { await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp'); }
  for (let i = 0; i < r; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < c; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); presses++; await sleep(60);
  if (await mode(page) !== 'classic-2d') { ended = true; break outer; }
}
await sleep(1500);
log('loss: ended', ended, 'after', presses, 'mode', await mode(page), 'focus', await focused(page), 'title', await page.evaluate(() => document.getElementById('results-title').textContent));
await shot(page, 'k-23-results-loss-dark');
log('results text', await page.evaluate(() => document.querySelector('#results .ui-card').innerText.replace(/\n+/g,' | ')));
log('errors', errors);
await browser.close();
