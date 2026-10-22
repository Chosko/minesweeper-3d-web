import { chromium, devices, URL, DIR, ARGS, sleep, log } from './helpers.mjs';
const browser = await chromium.launch({ args: ARGS });
async function run(devName, tag, landscape) {
  const d = devices[devName]; const vp = landscape ? { width: d.viewport.height, height: d.viewport.width } : d.viewport;
  const ctx = await browser.newContext({ ...d, viewport: vp, hasTouch: true });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL); await page.waitForFunction(() => globalThis.__ms !== undefined); await sleep(500);
  const shot = async (n) => { await page.screenshot({ path: `${DIR}/${tag}-${n}.png`, timeout: 90000 }); };
  const mode = () => page.evaluate(() => __ms.state.mode);
  const small = () => page.evaluate(() => [...document.querySelectorAll('button, input, a, [role=radio]')].filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) }; }).filter(o => o.w < 44 || o.h < 44));
  const overflow = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  const fonts = () => page.evaluate(() => { const s = new Map(); document.querySelectorAll('*').forEach(e => { if (e.offsetParent === null || !e.innerText?.trim() || e.children.length) return; const f = parseFloat(getComputedStyle(e).fontSize); if (f < 13) s.set(f, (s.get(f)||0)+1); }); return [...s]; });
  log(`\n### ${tag} ${vp.width}x${vp.height} dpr${d.deviceScaleFactor}`);
  log('touch note visible', await page.evaluate(() => !document.getElementById('touch-note').classList.contains('hidden')), 'text', await page.evaluate(() => document.getElementById('touch-note').textContent));
  log('menu overflow', await overflow(), 'small targets', JSON.stringify(await small()), 'small fonts', JSON.stringify(await fonts()));
  await shot('01-menu');
  await page.tap('#menu-entry-classic-2d'); await sleep(400); log('tap Classic 2D →', await mode());
  log('choice overflow', await overflow(), 'small targets', JSON.stringify(await small()));
  await shot('02-c2d-choice');
  // custom field tap -> keyboard type
  await page.tap('#c2d-choice [data-size="custom"]'); await page.tap('#c2d-width'); await page.keyboard.press('Control+a'); await page.keyboard.type('8'); log('width typed', await page.evaluate(() => document.getElementById('c2d-width').value));
  await page.tap('#c2d-noguess'); log('noguess after tap', await page.evaluate(() => document.getElementById('c2d-noguess').checked)); await page.tap('#c2d-noguess');
  await page.tap('#c2d-choice [data-size="beginner"]'); await page.tap('#c2d-play'); await sleep(600); log('tap Beginner →', await mode());
  await shot('03-c2d-board');
  log('board', await page.evaluate(() => { const c = document.querySelector('#c2d-board canvas'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), tile: Math.round(r.width / 9) }; }));
  const hud = () => page.evaluate(() => ({ t: document.getElementById(document.getElementById('c2d-time').offsetParent ? 'c2d-time' : 'hud-time').textContent, m: document.getElementById(document.getElementById('c2d-mines-left').offsetParent ? 'c2d-mines-left' : 'hud-mines').textContent, st: __ms.modes.state }));
  // tap a cell
  const box = await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const tile = box.w / 9;
  await page.touchscreen.tap(box.x + tile * 4.5, box.y + tile * 4.5); await sleep(1200); log('after tap centre', await hud());
  await shot('04-c2d-tapped');
  // long press to flag?
  const cdp = await ctx.newCDPSession(page);
  const lp = async (x, y, ms) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const before = await hud(); await lp(box.x + tile * 0.5, box.y + tile * 0.5, 700); await sleep(500); log('long press 700ms: before', before.m, 'after', await hud());
  await shot('05-c2d-longpress');
  // two-finger tap?
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + tile * 8.5, y: box.y + tile * 0.5 }, { x: box.x + tile * 8.5, y: box.y + tile * 0.5 + 30 }] }); await sleep(80); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300); log('two-finger tap', await hud());
  // pause tap
  await page.tap('#c2d-pause'); await sleep(400); log('tap Pause →', await mode());
  log('pause overflow', await overflow(), 'small', JSON.stringify(await small()));
  await shot('06-pause');
  await page.tap('#p-menu'); await sleep(300); if (await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden'))) await page.tap('#p-confirm-yes'); await sleep(500); log('→', await mode());
  // Expert board: scroll/pan
  await page.tap('#menu-entry-classic-2d'); await sleep(300); await page.tap('#c2d-choice [data-size="expert"]'); await page.tap('#c2d-play'); await sleep(600);
  log('expert board', await page.evaluate(() => { const c = document.querySelector('#c2d-board canvas'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), tile: Math.round(r.width / 30), scrolls: r.width > innerWidth }; }));
  await shot('07-expert');
  // swipe
  const b2 = await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 - i * 20, y: 400 }] }); await sleep(30); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
  log('after swipe: board rect', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; }), await hud());
  await shot('08-expert-swiped');
  await page.tap('#c2d-pause'); await sleep(300); await page.tap('#p-menu'); await sleep(300); const confirm = await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')); if (confirm) await page.tap('#p-confirm-yes'); await sleep(500); log('→', await mode());
  // 3D
  await page.tap('#menu-entry-3d'); await sleep(400); log('tap 3D →', await mode()); log('3d choice overflow', await overflow(), 'small', JSON.stringify(await small()));
  await shot('09-3d-choice');
  await page.tap('#board-choice [data-preset="6,6,6,10"]'); await page.tap('#bc-play'); await sleep(800); log('tap Beginner →', await mode(), 'ready msg', await page.evaluate(() => document.getElementById('ready-msg').textContent));
  await shot('10-3d-ready');
  await page.tap('#ready-btn'); await sleep(1200); log('tap Click to play →', await mode(), 'msg', await page.evaluate(() => document.getElementById('ready-msg').textContent));
  await shot('11-3d-after-tap');
  if (await mode() === 'playing') {
    log('PHONE IS IN 3D PLAY. lockless', await page.evaluate(() => document.body.classList.contains('lockless')), 'hud-pause visible', await page.evaluate(() => document.getElementById('hud-pause').offsetParent !== null), 'small', JSON.stringify(await small()));
    // try touch drag on the scene: does the camera move?
    const cam0 = await page.evaluate(() => JSON.stringify(__ms.info().cam));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 400 }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200 + i * 20, y: 400 }] }); await sleep(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
    log('cam before', cam0, 'after touch drag', await page.evaluate(() => JSON.stringify(__ms.info().cam)));
    await page.touchscreen.tap(vp.width / 2, vp.height / 2); await sleep(800); log('tap centre of scene →', await hud());
    await shot('11b-3d-playing-phone');
    let tapped = 'ok'; try { await page.tap('#hud-pause', { timeout: 5000 }); } catch (e) { tapped = 'FAILED: ' + e.message.split('\n').find(l => l.includes('intercepts')) ; }
    await sleep(400); log('tap Pause →', tapped, await mode(), 'top element at pause btn', await page.evaluate(() => { const r = document.getElementById('hud-pause').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e ? e.tagName + '#' + e.id : null; }), 'locked', await page.evaluate(() => !!document.pointerLockElement));
    if (await mode() === 'playing') { await page.evaluate(() => __ms.pause()); await sleep(400); }
    await shot('11c-3d-pause-phone');
    await page.tap('#p-menu'); await sleep(300); const c = await page.evaluate(() => !document.getElementById('pause-confirm').classList.contains('hidden')); if (c) await page.tap('#p-confirm-yes'); await sleep(500); log('→', await mode());
  } else { await page.tap('#ready-back'); await sleep(400); log('tap Back →', await mode()); await page.tap('#board-choice-back'); await sleep(300); }
  // records & settings
  await page.tap('#menu-entry-records'); await sleep(500); log('records', await mode(), 'overflow', await overflow(), 'small', JSON.stringify(await small()));
  await shot('12-records');
  await page.tap('#records-back'); await sleep(300);
  await page.tap('#menu-entry-settings'); await sleep(500); log('settings', await mode(), 'overflow', await overflow(), 'small', JSON.stringify(await small()));
  await shot('13-settings');
  await page.tap('#settings-back'); await sleep(300);
  log('errors', errors);
  await ctx.close();
}
await run('iPhone 13', 'ip-l', true);
await run('iPad Pro 11', 'ipad-p', false);
await run('iPad Pro 11', 'ipad-l', true);
await browser.close();
