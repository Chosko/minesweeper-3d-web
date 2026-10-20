import { chromium, URL, DIR, ARGS, sleep, log } from './helpers.mjs';
const browser = await chromium.launch({ args: ARGS });
// 1024x768 font sizes
{
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  await page.goto(URL); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(400);
  const fonts = () => page.evaluate(() => { const out = {}; document.querySelectorAll('*').forEach(e => { if (e.offsetParent === null || !e.innerText?.trim() || e.children.length > 2) return; const f = Math.round(parseFloat(getComputedStyle(e).fontSize)); if (f <= 13) { const k = `${f}px`; (out[k] ||= []).push(e.innerText.trim().slice(0, 25)); } }); return out; });
  log('1024x768 menu small fonts', JSON.stringify(await fonts()));
  await page.screenshot({ path: `${DIR}/z-01-menu-1024.png`, timeout: 90000 });
  await page.click('#menu-entry-classic-2d'); await sleep(300); log('c2d choice small fonts', JSON.stringify(await fonts()));
  await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await sleep(500); log('2D board small fonts', JSON.stringify(await fonts()));
  await page.screenshot({ path: `${DIR}/z-02-2d-1024.png`, timeout: 90000 });
  await page.click('#hud-pause'); await sleep(300); log('pause small fonts', JSON.stringify(await fonts()));
  await page.close();
}
// 200% zoom: 640x400 CSS px at dpr 2 (same as 1280x800 window zoomed 200%)
{
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(400);
  const overflow = () => page.evaluate(() => ({ docScrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, cardH: Math.round(document.querySelector('.overlay:not(.hidden) .ui-card')?.getBoundingClientRect().height || 0), overlayScroll: (() => { const o = document.querySelector('.overlay:not(.hidden)'); return o ? { sh: o.scrollHeight, ch: o.clientHeight, oy: getComputedStyle(o).overflowY } : null; })() }));
  log('zoom200 menu', JSON.stringify(await overflow()));
  await page.screenshot({ path: `${DIR}/z-03-menu-zoom200.png`, timeout: 90000 });
  // can the last button be reached by scrolling the overlay?
  await page.evaluate(() => document.querySelector('#menu .ui-link').scrollIntoView()); await sleep(200);
  await page.screenshot({ path: `${DIR}/z-04-menu-zoom200-scrolled.png`, timeout: 90000 });
  await page.click('#menu-entry-classic-2d'); await sleep(300); log('zoom200 c2d choice', JSON.stringify(await overflow()));
  await page.screenshot({ path: `${DIR}/z-05-c2d-choice-zoom200.png`, timeout: 90000 });
  await page.evaluate(() => document.getElementById('c2d-choice-back').scrollIntoView()); await sleep(200);
  await page.screenshot({ path: `${DIR}/z-06-c2d-choice-zoom200-bottom.png`, timeout: 90000 });
  await page.click('#c2d-choice [data-size="expert"]'); await page.click('#c2d-play'); await sleep(600);
  log('zoom200 expert board', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), tile: Math.round(r.width / 30) }; }));
  await page.screenshot({ path: `${DIR}/z-07-expert-zoom200.png`, timeout: 90000 });
  await page.click('#hud-pause'); await sleep(300); log('zoom200 pause', JSON.stringify(await overflow()));
  await page.screenshot({ path: `${DIR}/z-08-pause-zoom200.png`, timeout: 90000 });
  await page.click('#p-menu'); await sleep(200); await page.click('#p-confirm-yes').catch(()=>{}); await sleep(300);
  await page.click('#menu-entry-records'); await sleep(400); log('zoom200 records', JSON.stringify(await overflow()));
  await page.screenshot({ path: `${DIR}/z-09-records-zoom200.png`, timeout: 90000 });
  await page.click('#records-back'); await sleep(300);
  await page.click('#menu-entry-settings'); await sleep(400); log('zoom200 settings', JSON.stringify(await overflow()));
  await page.screenshot({ path: `${DIR}/z-10-settings-zoom200.png`, timeout: 90000 });
  await ctx.close();
}
// forced colors + reduced motion
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, forcedColors: 'active', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(URL); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(400);
  await page.screenshot({ path: `${DIR}/z-11-menu-forced-colors.png`, timeout: 90000 });
  await page.click('#menu-entry-classic-2d'); await sleep(300);
  await page.screenshot({ path: `${DIR}/z-12-choice-forced-colors.png`, timeout: 90000 });
  await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await sleep(500);
  await page.mouse.click(640, 440); await sleep(800);
  await page.screenshot({ path: `${DIR}/z-13-2d-forced-colors.png`, timeout: 90000 });
  log('reduced motion matches', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'forced', await page.evaluate(() => matchMedia('(forced-colors: active)').matches));
  await ctx.close();
}
// dark theme contrast samples: menu + 2D board + pause in dark
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => { try { localStorage.setItem('ms3d.settings', JSON.stringify({ theme: 'dark' })); } catch {} });
  await page.goto(URL); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(400);
  log('theme', await page.evaluate(() => document.documentElement.getAttribute('data-theme')));
  if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark') { await page.evaluate(() => __ms.settings.set('theme', 'dark')); await sleep(300); }
  await page.click('#menu-entry-classic-2d'); await sleep(300); await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await sleep(500);
  await page.mouse.click(640, 440); await sleep(800);
  await page.screenshot({ path: `${DIR}/z-14-2d-dark.png`, timeout: 90000 });
  await page.click('#hud-pause'); await sleep(300);
  await page.screenshot({ path: `${DIR}/z-15-pause-dark.png`, timeout: 90000 });
  await page.close();
}
await browser.close();
