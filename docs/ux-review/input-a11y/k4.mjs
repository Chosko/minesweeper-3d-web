import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL); await ready(page);
  if (theme === 'dark') { await page.evaluate(() => __ms.settings.set('theme', 'dark')); await sleep(300); }
  await page.focus('#menu-help'); await page.keyboard.press('Enter'); await sleep(1200);
  log(theme, 'modal open', await page.evaluate(() => !document.getElementById('controls-modal').classList.contains('hidden')), 'card rect', await page.evaluate(() => JSON.stringify(document.querySelector('#controls-modal .modal-card').getBoundingClientRect())), 'opacity', await page.evaluate(() => getComputedStyle(document.querySelector('#controls-modal .modal-card')).opacity), 'modal style', await page.evaluate(() => { const m = document.getElementById('controls-modal'); const s = getComputedStyle(m); return { op: s.opacity, bg: s.backgroundColor, display: s.display, z: s.zIndex, anim: s.animationName, transition: s.transition }; }));
  await shot(page, `k4-modal-${theme}`);
  log(theme, 'inert on menu?', await page.evaluate(() => document.getElementById('menu').inert), 'aria-hidden', await page.evaluate(() => document.getElementById('menu').getAttribute('aria-hidden')));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.close();
}
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL); await ready(page);
// landmarks and headings
log('landmarks', await page.evaluate(() => [...document.querySelectorAll('main, nav, header, [role=main], [role=dialog], [role=alertdialog], h1, h2, h3')].filter(e => e.offsetParent !== null).map(e => `${e.tagName.toLowerCase()}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''}:${(e.textContent || '').trim().slice(0, 20)}`)));
log('hidden overlays use', await page.evaluate(() => getComputedStyle(document.getElementById('settings')).display));
log('canvas label', await page.evaluate(() => document.getElementById('scene').getAttribute('aria-label')), 'canvas role', await page.evaluate(() => document.getElementById('scene').getAttribute('role')));
// Go 2D: board canvas semantics
await page.click('#menu-entry-classic-2d'); await sleep(300); await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await sleep(500);
log('2D board canvas', await page.evaluate(() => { const c = document.querySelector('#c2d-board canvas'); return { role: c.getAttribute('role'), label: c.getAttribute('aria-label'), tabindex: c.getAttribute('tabindex'), text: c.textContent }; }));
log('hud aria-live', await page.evaluate(() => document.getElementById('hud').getAttribute('aria-live')), 'hud-time label', await page.evaluate(() => document.getElementById('hud-time').closest('[role=group]').getAttribute('aria-labelledby')));
log('2D visible kbd hints', await page.evaluate(() => [...document.querySelectorAll('#hud kbd, #hud .kbd-hint')].filter(e => e.offsetParent !== null).map(e => e.textContent)));
// first reveal with mouse, then Esc → pause card text: 3D controls?
await page.mouse.click(640, 440); await sleep(600);
await page.keyboard.press('Escape'); await sleep(300);
log('pause dl text', await page.evaluate(() => document.querySelector('#pause dl.controls').innerText.replace(/\n+/g, ' | ')));
log('pause hidden-but-focusable behind', await page.evaluate(() => { const b = document.getElementById('hud-pause'); const r = b.getBoundingClientRect(); return { visible: r.width > 0, inert: b.closest('[inert]') !== null, hudAriaHidden: document.getElementById('hud').getAttribute('aria-hidden') }; }));
// beforeunload guard presence during a game
log('beforeunload guard', await page.evaluate(() => new Promise((r) => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); r(e.defaultPrevented || e.returnValue !== true && e.returnValue !== undefined && e.returnValue !== ''); })));
// Esc with confirm
await page.focus('#p-menu'); await page.keyboard.press('Enter'); await sleep(200); log('confirm focus', await focused(page));
await page.keyboard.press('Tab'); log('Tab in confirm →', await focused(page)); await page.keyboard.press('Tab'); log('Tab →', await focused(page));
await page.keyboard.press('Escape'); await sleep(200); log('Esc on confirm → mode', await mode(page), 'focus', await focused(page));
await page.focus('#p-menu'); await page.keyboard.press('Enter'); await sleep(200); await page.focus('#p-confirm-yes'); await page.keyboard.press('Enter'); await sleep(600);
log('after confirm →', await mode(page), 'focus', await focused(page));
// Results Esc → menu, and focus restore from Records back to results
await page.click('#menu-entry-classic-2d'); await sleep(300); await page.click('#c2d-choice [data-size="custom"]'); await page.fill('#c2d-width', '2'); await page.fill('#c2d-height', '1'); await page.fill('#c2d-mines', '1'); await page.click('#c2d-play'); await sleep(600);
await page.keyboard.press('Space'); await sleep(1500); log('results', await mode(page), 'live regions', await page.evaluate(() => [...document.querySelectorAll('[aria-live], [role=status], [role=alert]')].filter(e => e.offsetParent !== null).map(e => `${e.id}:${e.textContent.trim().slice(0,30)}`)));
await page.focus('#r-records'); await page.keyboard.press('Enter'); await sleep(600); await page.keyboard.press('Escape'); await sleep(400);
log('Records → Esc → ', await mode(page), 'focus restored to', await focused(page));
// Shift+Tab at the first control of results: where does it go?
await page.focus('#r-again'); await page.keyboard.press('Shift+Tab'); log('Shift+Tab from Play again →', await focused(page));
// Keyboard: can the 3D ready card be backed out of with Esc, and does F fullscreen toggle use a key that 2D uses for flag?
await page.keyboard.press('Escape'); await sleep(300); await page.focus('#menu-entry-3d'); await page.keyboard.press('Enter'); await sleep(300); await page.keyboard.press('Enter'); await sleep(600);
log('ready', await mode(page)); await page.keyboard.press('Escape'); await sleep(300); log('Esc on ready →', await mode(page), 'focus', await focused(page));
await browser.close();
