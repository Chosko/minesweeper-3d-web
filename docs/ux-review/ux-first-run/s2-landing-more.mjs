import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
for (const vp of [{width:1920,height:1080},{width:1024,height:768}]) {
  await page.setViewportSize(vp); await page.waitForTimeout(800);
  await shot(page, `01-landing-${vp.width}`);
}
await page.setViewportSize({width:1280,height:800}); await page.waitForTimeout(500);
// Settings
await page.click('#menu-entry-settings'); await page.waitForTimeout(500);
console.log('settings mode', await mode(page));
console.log(JSON.stringify(await visText(page, 'body'), null, 1));
await shot(page, '03-settings');
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
console.log('after Esc from settings, mode', await mode(page));
await browser.close();
