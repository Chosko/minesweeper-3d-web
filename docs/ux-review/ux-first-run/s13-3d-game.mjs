import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
const body = () => page.evaluate(() => document.body.innerText);
let clicks = 0;
await page.click('#menu-entry-3d'); clicks++; await page.waitForTimeout(400);
await page.click('#board-choice [data-preset="6,6,6,10"]'); clicks++; await page.click('#bc-play'); clicks++; await page.waitForTimeout(1200);
console.log('mode', await mode(page), 'clicks so far', clicks);
console.log('ready body:\n' + await body());
console.log('focused', await page.evaluate(() => document.activeElement?.id + ' / ' + document.activeElement?.textContent?.trim().slice(0,30)));
await shot(page, '50-3d-ready');
for (const vp of [{width:1920,height:1080},{width:1024,height:768}]) { await page.setViewportSize(vp); await page.waitForTimeout(800); await shot(page, `50-3d-ready-${vp.width}`); }
await page.setViewportSize({width:1280,height:800}); await page.waitForTimeout(500);
// Click "Click to play" with a real mouse click; what happens headless?
const readyBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('button, [role=button], .ui-card')].find(e => /Click to play/.test(e.textContent) && e.offsetParent); return b ? { id: b.id, tag: b.tagName, cls: b.className } : null; });
console.log('ready btn', readyBtn);
const errs = [];
page.on('console', (m) => errs.push(m.text()));
await page.mouse.click(640, 400); clicks++; await page.waitForTimeout(1500);
console.log('after clicking the card: mode', await mode(page), 'pointerLock', await page.evaluate(() => !!document.pointerLockElement));
console.log('body after click:\n' + (await body()).slice(0, 500));
await shot(page, '51-3d-after-click-to-play');
// Enter via forcePlay if needed
if (await mode(page) !== 'playing') { await page.evaluate(() => globalThis.__ms.forcePlay()); await page.waitForTimeout(500); console.log('forcePlay -> mode', await mode(page)); }
await shot(page, '52-3d-playing');
console.log('playing body:\n' + await body());
// H panel
await page.keyboard.press('h'); await page.waitForTimeout(400);
console.log('after H: help visible', await page.evaluate(() => { const h = document.getElementById('help') || document.getElementById('controls'); return h ? !h.classList.contains('hidden') && getComputedStyle(h).display !== 'none' : 'no #help'; }));
console.log('body with H:\n' + await body());
await shot(page, '53-3d-help-panel');
await page.keyboard.press('h'); await page.waitForTimeout(200);
// move/aim and reveal a safe cell by picking a cell and clicking
const info0 = await page.evaluate(() => globalThis.__ms.info());
console.log('info', JSON.stringify(info0).slice(0, 400));
await page.evaluate(() => { globalThis.__ms.aimAt([0, 0, 0]); });
await page.waitForTimeout(200);
console.log('selected', await page.evaluate(() => globalThis.__ms.selected()));
await page.evaluate(() => globalThis.__ms.click('left')); await page.waitForTimeout(1500);
console.log('after first reveal: body:\n' + await body());
await shot(page, '54-3d-after-first-reveal');
// Esc -> pause
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
console.log('mode after Esc', await mode(page));
console.log('pause body:\n' + await body());
await shot(page, '55-3d-paused');
// Restart -> confirm?
await page.click('#p-restart'); await page.waitForTimeout(300);
console.log('restart confirm visible', await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')), await page.evaluate(() => document.getElementById('pause-confirm')?.innerText.replace(/\n/g,' | ')));
await shot(page, '56-3d-restart-confirm');
await page.click('#p-confirm-no'); await page.waitForTimeout(200);
console.log('after cancel: mode', await mode(page));
await page.click('#p-menu'); await page.waitForTimeout(300);
console.log('menu confirm', await page.evaluate(() => document.getElementById('pause-confirm')?.innerText.replace(/\n/g,' | ')), 'focused', await page.evaluate(() => document.activeElement?.id));
await shot(page, '57-3d-menu-confirm');
await page.click('#p-confirm-yes'); await page.waitForTimeout(500);
console.log('after confirm: mode', await mode(page));
// Return to 3D choice: memory
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
console.log('3d choice focused on return', await page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.preset));
// Esc from ready card (before playing) → where?
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('Esc on ready card -> mode', await mode(page));
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
await page.click('#ready-back, button:has-text("Back")').catch(e => console.log('back click err', e.message)); await page.waitForTimeout(300);
console.log('Back on ready card -> mode', await mode(page));
await browser.close();
