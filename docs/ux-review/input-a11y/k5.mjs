import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL); await ready(page);
  if (theme === 'dark') { await page.evaluate(() => __ms.settings.set('theme', 'dark')); await sleep(500); }
  await page.click('#menu-help');
  const t0 = Date.now(); const samples = [];
  for (let i = 0; i < 12; i++) { samples.push(`${Date.now() - t0}ms:${await page.evaluate(() => getComputedStyle(document.querySelector('#controls-modal .modal-card')).opacity)}`); await sleep(400); }
  log(theme, 'modal card opacity over time', samples.join(' '), 'classes', await page.evaluate(() => document.getElementById('controls-modal').className), 'card transition', await page.evaluate(() => getComputedStyle(document.querySelector('#controls-modal .modal-card')).transition), 'modal transition', await page.evaluate(() => getComputedStyle(document.getElementById('controls-modal')).transition));
  await shot(page, `k5-modal-${theme}-5s`);
  await page.close();
}
await browser.close();
