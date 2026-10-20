import { chromium, shot, mode, DIR } from './lib.mjs';
const args = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// 1. pointer lock denied
{
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { Element.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('denied', 'SecurityError')); }; });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8080/index.html'); await page.waitForFunction(() => globalThis.__ms !== undefined); await page.waitForTimeout(1000);
  await page.click('#menu-entry-3d'); await page.waitForTimeout(300);
  await page.click('#board-choice [data-preset="6,6,6,10"]'); await page.click('#bc-play'); await page.waitForTimeout(800);
  await page.mouse.click(640, 400); await page.waitForTimeout(1500);
  console.log('lock denied: mode', await mode(page), 'lock', await page.evaluate(() => !!document.pointerLockElement));
  console.log('body:\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 500));
  await shot(page, '42-pointerlock-denied');
  await page.mouse.click(640, 400); await page.waitForTimeout(1000);
  console.log('second click: mode', await mode(page));
  await shot(page, '42b-pointerlock-denied-2nd');
  await browser.close();
}
// 2. no WebGL
{
  const browser = await chromium.launch({ args });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { if (/webgl/.test(t)) return null; return orig.call(this, t, ...r); }; });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8080/index.html'); await page.waitForTimeout(3000);
  console.log('no webgl: has __ms', await page.evaluate(() => globalThis.__ms !== undefined));
  console.log('body:\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 600));
  await shot(page, '43-no-webgl');
  try { await page.click('#menu-entry-classic-2d', { timeout: 5000 }); await page.waitForTimeout(300); console.log('2D choice reachable without WebGL: mode', await page.evaluate(() => globalThis.__ms?.state.mode)); } catch (e) { console.log('2D not reachable:', e.message.split('\n')[0]); }
  await shot(page, '43b-no-webgl-2d');
  await browser.close();
}
