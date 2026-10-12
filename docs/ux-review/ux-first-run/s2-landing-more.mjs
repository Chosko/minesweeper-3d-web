import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
for (const vp of [{width:1920,height:1080},{width:1024,height:768}]) {
  await page.setViewportSize(vp); await page.waitForTimeout(800);
  await shot(page, `01-landing-${vp.width}`);
}
await page.setViewportSize({width:1280,height:800}); await page.waitForTimeout(500);
// Controls panel from the menu
await page.click('#menu-help'); await page.waitForTimeout(500);
console.log('after Controls, mode', await mode(page));
console.log(JSON.stringify(await visText(page, 'body'), null, 1));
await shot(page, '02-menu-controls-panel');
await page.keyboard.press('Escape'); await page.waitForTimeout(300);
console.log('after Esc, mode', await mode(page), 'help visible?', await page.evaluate(() => { const h = document.getElementById('help'); return h && getComputedStyle(h).display !== 'none' && !h.classList.contains('hidden'); }));
// sound toggle
await page.click('#menu-sound'); await page.waitForTimeout(200);
console.log('sound button text', await page.evaluate(() => document.getElementById('menu-sound').textContent));
await page.click('#menu-sound');
// Settings
await page.click('#menu-entry-settings'); await page.waitForTimeout(500);
console.log('settings mode', await mode(page));
console.log(JSON.stringify(await visText(page, 'body'), null, 1));
await shot(page, '03-settings');
const dark = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Dark'));
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim()==='Dark').click());
await page.waitForTimeout(500);
await shot(page, '03-settings-dark');
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
console.log('after Esc from settings, mode', await mode(page));
await shot(page, '01-landing-dark');
await browser.close();
