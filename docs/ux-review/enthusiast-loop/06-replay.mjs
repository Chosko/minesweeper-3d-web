// The replay viewer: a 2D replay from the library, a 3D replay, controls, overlay, end line, failure wording.
import { launch, openPage, mode, shot, sleep } from './lib.mjs';

const context = await launch({ fresh: false });
const page = await openPage(context);
const log = (...a) => console.log(...a);
const ms = (fn, arg) => page.evaluate(fn, arg);
const state = () => ms(() => { const s = globalThis.__ms.replayViewer.state; return { status: s.status, time: Math.round(s.time), duration: s.duration, playing: s.playing, speed: s.speed, ended: s.ended, figures: s.figures, end: s.end, message: s.message }; });
const overlay = () => ms(() => ({ clock: document.getElementById('rp-clock').textContent, mines: document.getElementById('rp-mines').textContent, bbbv: document.getElementById('rp-bbbv').textContent, rate: document.getElementById('rp-rate').textContent, pos: document.getElementById('rp-position')?.textContent, end: document.getElementById('replay-end')?.innerText, speed: document.getElementById('rp-speed')?.innerText.replace(/\n/g, ' ') }));

await page.click('#menu-entry-records');
await ms(() => { const b = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /^Expert\b/.test(x.innerText.trim()) && !/no-guess/i.test(x.innerText)); b?.click(); });
await sleep(200);
// Watch the oldest Expert replay (the first game, 13.3 s, NF) — pick the last row
const watched = await ms(() => { const rows = [...document.querySelectorAll('#records-replays-body tr')]; const tr = rows.at(-1); const b = [...tr.querySelectorAll('button')].find((x) => /Watch/.test(x.innerText)); const t = tr.innerText.replace(/\t/g, ' | '); b?.click(); return t; });
log('watching:', watched);
await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status !== 'loading' && globalThis.__ms.state.mode === 'replay', null, { timeout: 20000 });
await sleep(300);
log('viewer state at open:', JSON.stringify(await state()));
log('overlay at open:', JSON.stringify(await overlay()));
log('focus:', await ms(() => document.activeElement?.id));
log('controls text:', JSON.stringify(await ms(() => document.getElementById('replay-controls')?.innerText)));
await shot(page, '06-2d-open');
await page.keyboard.press('Space');
await sleep(2500);
log('after 2.5 s playing:', JSON.stringify(await state()), JSON.stringify(await overlay()));
await shot(page, '06-2d-playing');
await page.keyboard.press('KeyK');
await sleep(100);
log('after K (pause):', JSON.stringify(await state()));
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
await sleep(100);
log('after 3× →:', JSON.stringify(await state()));
await page.keyboard.press('ArrowLeft');
await sleep(100);
log('after ←:', JSON.stringify(await state()));
await page.keyboard.press('Equal'); await page.keyboard.press('Equal');
log('after = =:', JSON.stringify(await state()), JSON.stringify(await overlay()));
await page.keyboard.press('Minus'); await page.keyboard.press('Minus'); await page.keyboard.press('Minus'); await page.keyboard.press('Minus');
log('after − ×4:', (await state()).speed);
await page.keyboard.press('End');
await sleep(300);
log('after End:', JSON.stringify(await state()), JSON.stringify(await overlay()));
await shot(page, '06-2d-end');
await page.keyboard.press('Space'); // play again from start
await sleep(400);
log('Space at end → restart?', JSON.stringify(await state()));
await page.keyboard.press('Home');
await sleep(100);
log('after Home:', JSON.stringify(await state()));
// seek bar: set to 50%
await ms(() => { const s = document.getElementById('rp-seek'); s.value = Math.round((s.max - s.min) / 2); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
await sleep(300);
log('after seek 50%:', JSON.stringify(await state()), JSON.stringify(await overlay()));
await shot(page, '06-2d-seek-half');
// pointer element
log('pointer element:', JSON.stringify(await ms(() => { const p = document.querySelector('.replay-pointer'); return p && { visible: getComputedStyle(p).display !== 'none', rect: p.getBoundingClientRect().toJSON() }; })));
// Speed 4× playback at the end of replay: watch time to finish
await page.keyboard.press('Escape');
await sleep(200);
log('after Esc:', await mode(page));

// 3D replay from the library
await ms(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /3D/.test(x.innerText)); b?.click(); });
await sleep(300);
const watched3 = await ms(() => { const rows = [...document.querySelectorAll('#records-replays-body tr')]; const tr = rows.find((r) => /Won/i.test(r.innerText)) ?? rows[0]; const b = [...tr.querySelectorAll('button')].find((x) => /Watch/.test(x.innerText)); const t = tr.innerText.replace(/\t/g, ' | '); b?.click(); return t; });
log('watching 3D:', watched3);
await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status !== 'loading' && globalThis.__ms.state.mode === 'replay', null, { timeout: 30000 });
await sleep(500);
log('3D viewer state:', JSON.stringify(await state()));
await shot(page, '06-3d-open');
await page.keyboard.press('Equal'); await page.keyboard.press('Equal');
await page.keyboard.press('Space');
for (let i = 1; i <= 4; i++) { await sleep(1500); await shot(page, `06-3d-playing-${i}`); log(`3D t+${i * 1.5}s:`, JSON.stringify(await state()), JSON.stringify(await overlay())); }
await page.keyboard.press('End');
await sleep(500);
await shot(page, '06-3d-end');
log('3D end:', JSON.stringify(await overlay()));
await page.keyboard.press('Escape');
await sleep(200);
log('after Esc:', await mode(page));

// Failure wording: a missing replay id
await ms(() => globalThis.__ms.watch({ replayId: 'does-not-exist', returnTo: { screen: 'records' } }));
await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'failed', null, { timeout: 10000 });
await sleep(200);
log('failure message:', JSON.stringify(await ms(() => document.getElementById('replay-message')?.innerText)));
await shot(page, '06-failure');
await page.keyboard.press('Escape');
log('after Esc:', await mode(page));
// From the results screen: Watch replay after a game — covered by r-watch visibility; check Back returns to results
log('page errors:', page.errors.slice(0, 10));
await context.close();
