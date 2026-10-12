import { launch, shot, mode, visText } from './lib.mjs';
const { browser, page } = await launch();
console.log('mode', await mode(page));
console.log('title', await page.title());
console.log(JSON.stringify(await visText(page, 'body'), null, 1));
console.log('focused', await page.evaluate(() => document.activeElement?.id + ' ' + document.activeElement?.textContent?.trim()));
await shot(page, '01-landing-1280');
// theme: find a switch
const themeCtl = await page.evaluate(() => [...document.querySelectorAll('button, input, select')].filter(e => /theme|light|dark/i.test(e.id + e.textContent + (e.getAttribute('aria-label')||''))).map(e => e.tagName + '#' + e.id + ' ' + e.textContent.trim()));
console.log('theme controls', themeCtl);
console.log('html data-theme', await page.evaluate(() => document.documentElement.dataset.theme + ' / ' + document.documentElement.className));
await browser.close();
