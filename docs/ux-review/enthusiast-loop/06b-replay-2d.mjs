// The 2D replay viewer, from the Records library and from the results screen.
import { launch, openPage, mode, shot, sleep } from './lib.mjs';

const context = await launch({ fresh: false });
const page = await openPage(context);
const log = (...a) => console.log(...a);
const ms = (fn, arg) => page.evaluate(fn, arg);
const state = () => ms(() => { const s = globalThis.__ms.replayViewer.state; return { status: s.status, time: Math.round(s.time), duration: s.duration, playing: s.playing, speed: s.speed, ended: s.ended, figures: s.figures, end: s.end }; });
const pointer = () => ms(() => { const p = document.querySelector('.replay-pointer'); if (!p) return null; const r = p.getBoundingClientRect(); const cs = getComputedStyle(p); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), display: cs.display, opacity: cs.opacity, visibility: cs.visibility }; });

await page.click('#menu-entry-records');
await ms(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /2D/.test(x.innerText)); b?.click(); });
await sleep(200);
await ms(() => { const b = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /^Expert\b/.test(x.innerText.trim()) && !/no-guess/i.test(x.innerText)); b?.click(); });
await sleep(200);
log('rows:', JSON.stringify(await ms(() => [...document.querySelectorAll('#records-replays-body tr')].map((tr) => tr.innerText.replace(/\t/g, ' | ')))));
// Watch the 13.3 s won game (the NF 182-3BV game)
const watched = await ms(() => { const rows = [...document.querySelectorAll('#records-replays-body tr')]; const tr = rows.find((r) => /13\.3 s/.test(r.innerText)) ?? rows.at(-1); const b = [...tr.querySelectorAll('button')].find((x) => /Watch/.test(x.innerText)); const t = tr.innerText.replace(/\t/g, ' | '); b?.click(); return t; });
log('watching:', watched);
await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status !== 'loading' && globalThis.__ms.state.mode === 'replay', null, { timeout: 20000 });
await sleep(300);
log('open:', JSON.stringify(await state()), 'pointer:', JSON.stringify(await pointer()));
await shot(page, '06b-2d-open');
log('screen text:', JSON.stringify(await ms(() => document.getElementById('replay').innerText.replace(/\n+/g, ' | '))));
await page.keyboard.press('Space');
await sleep(3000);
log('t≈3s:', JSON.stringify(await state()), 'pointer:', JSON.stringify(await pointer()));
await shot(page, '06b-2d-playing-a');
await sleep(3000);
log('t≈6s:', JSON.stringify(await state()), 'pointer:', JSON.stringify(await pointer()));
await shot(page, '06b-2d-playing-b');
await page.keyboard.press('Space');
// clip around the pointer
const p = await pointer();
if (p) await page.screenshot({ path: '06b-2d-pointer-zoom.png', clip: { x: Math.max(0, p.x - 80), y: Math.max(0, p.y - 80), width: 200, height: 200 } });
await page.keyboard.press('End');
await sleep(300);
await shot(page, '06b-2d-end');
log('end:', JSON.stringify(await state()), JSON.stringify(await ms(() => ({ end: document.getElementById('replay-end')?.innerText, pos: document.getElementById('rp-seek')?.getAttribute('aria-valuetext') }))));
// Controller/keyboard: Back
await page.keyboard.press('Escape');
await sleep(200);
log('after Esc:', await mode(page), 'records board:', await ms(() => document.getElementById('records-board')?.innerText));

// The abandoned replay (5.8 s): how does it end?
const w2 = await ms(() => { const rows = [...document.querySelectorAll('#records-replays-body tr')]; const tr = rows.find((r) => /Abandoned/.test(r.innerText)); if (!tr) return null; const b = [...tr.querySelectorAll('button')].find((x) => /Watch/.test(x.innerText)); b?.click(); return tr.innerText.replace(/\t/g, ' | '); });
log('watching abandoned:', w2);
if (w2) {
  await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status !== 'loading' && globalThis.__ms.state.mode === 'replay', null, { timeout: 20000 });
  await page.keyboard.press('End');
  await sleep(300);
  await shot(page, '06b-2d-abandoned-end');
  log('abandoned end:', JSON.stringify(await state()));
  await page.keyboard.press('Escape');
}
// Watch replay from the results screen → Back returns to results
await page.keyboard.press('Escape');
await sleep(100);
log('mode:', await mode(page));
log('page errors:', page.errors.slice(0, 10));
await context.close();
