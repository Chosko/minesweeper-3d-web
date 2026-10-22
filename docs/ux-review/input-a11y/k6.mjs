import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL); await ready(page);
await page.click('#menu-entry-classic-2d'); await sleep(300); await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await sleep(500);
await page.keyboard.press('h'); await sleep(300);
log('2D: H → help visible', await page.evaluate(() => !document.getElementById('help').classList.contains('hidden')), 'help text', await page.evaluate(() => document.getElementById('help').innerText.replace(/\n+/g, ' | ').slice(0, 200)));
await shot(page, 'k6-2d-h');
await page.keyboard.press('m'); await sleep(200); log('2D: M → toast', await page.evaluate(() => document.getElementById('toast').textContent), 'muted', await page.evaluate(() => __ms.settings.get ? __ms.settings.get('muted') : 'n/a'));
await page.keyboard.press('Escape'); await sleep(300);
log('2D pause: any 2D key hint?', await page.evaluate(() => /Arrow|Space|Enter|\bF\b|\bD\b/.test(document.getElementById('pause-card').innerText) ? document.getElementById('pause-card').innerText.match(/.*(Arrow|Enter).*/g) : 'none'));
// Timer: can it be hidden? Settings keys
log('settings keys', await page.evaluate(() => Object.keys(__ms.settings.all ? __ms.settings.all() : (__ms.settings.values || {}))));
await browser.close();
