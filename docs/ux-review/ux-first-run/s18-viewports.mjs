import { launch, shot, mode } from './lib.mjs';
const { browser, page } = await launch();
// F: eager click right after the preset (no wait)
for (let i = 0; i < 4; i++) {
  await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(200);
  await page.click('#c2d-choice [data-size="beginner"]');
  await page.mouse.click(640, 440); await page.waitForTimeout(1500);
  const px = await page.evaluate(() => { const c = document.querySelector('#c2d-board canvas'); const r = c.getBoundingClientRect(); return [...c.getContext('2d').getImageData(Math.round(640 - r.left), Math.round(440 - r.top), 1, 1).data]; });
  const started = await page.evaluate(() => globalThis.__ms.modes.state.started);
  console.log(`eager ${i}: started=${started} pixel=${px}`);
  if (i === 0) await shot(page, '80-eager-click');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.click('#p-menu'); await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.getElementById('pause-confirm').classList.contains('hidden')))) await page.click('#p-confirm-yes');
  await page.waitForTimeout(300);
}
// C: 2D Expert at viewports + dark
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(200);
await page.click('#c2d-choice [data-size="expert"]'); await page.waitForTimeout(600);
for (const vp of [{width:1920,height:1080},{width:1024,height:768},{width:1280,height:800}]) { await page.setViewportSize(vp); await page.waitForTimeout(600); await shot(page, `81-c2d-expert-${vp.width}`); }
await page.evaluate(() => globalThis.__ms.settings.set ? globalThis.__ms.settings.set('theme', 'dark') : null).catch(e => console.log('settings.set err', e.message));
console.log('settings api', await page.evaluate(() => Object.keys(globalThis.__ms.settings)));
await page.waitForTimeout(400);
console.log('theme now', await page.evaluate(() => document.documentElement.dataset.theme));
await shot(page, '82-c2d-expert-dark');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await shot(page, '82-c2d-paused-dark');
await page.click('#p-menu'); await page.waitForTimeout(300);
await shot(page, '82-c2d-paused-dark-confirm');
if (!(await page.evaluate(() => document.getElementById('pause-confirm').classList.contains('hidden')))) await page.click('#p-confirm-yes');
await page.waitForTimeout(300);
await page.click('#menu-entry-classic-2d'); await page.waitForTimeout(300);
await shot(page, '83-c2d-choice-dark');
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
await shot(page, '83-3d-choice-dark');
await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.waitForTimeout(800);
await shot(page, '84-3d-ready-dark');
await page.mouse.click(640, 400); await page.waitForTimeout(500);
await page.evaluate(() => { globalThis.__ms.aimAt([2,2,0]); globalThis.__ms.click('left'); }); await page.waitForTimeout(1200);
await shot(page, '84-3d-playing-dark');
for (const vp of [{width:1920,height:1080},{width:1024,height:768}]) { await page.setViewportSize(vp); await page.waitForTimeout(800); await shot(page, `85-3d-playing-${vp.width}`); }
await page.setViewportSize({width:1280,height:800});
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
await shot(page, '86-3d-paused-dark');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('Esc on pause resumes? mode', await mode(page));
await browser.close();
