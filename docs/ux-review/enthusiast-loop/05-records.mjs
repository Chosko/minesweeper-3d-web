// The Records screen: switch, picker, figures, chart, recent games paging, replay library, pin/unpin.
import { launch, openPage, mode, shot, sleep } from './lib.mjs';

const context = await launch({ fresh: false });
const page = await openPage(context);
const log = (...a) => console.log(...a);
const ms = (fn, arg) => page.evaluate(fn, arg);
const text = (sel) => ms((s) => document.querySelector(s)?.innerText, sel);

await page.click('#menu-entry-records');
log('mode', await mode(page));
await shot(page, '05-records-open');
log('opened on (last played):', await text('#records-board'));
await ms(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /2D/.test(x.innerText)); b?.click(); });
await sleep(300);
await shot(page, '05-records-2d');
log('opened on board:', await text('#records-board'), '| mode switch:', JSON.stringify(await text('#records-mode')));
log('picker:', JSON.stringify(await ms(() => [...document.querySelectorAll('#records-picker [role="radio"], #records-picker button')].map((b) => `${b.innerText.replace(/\n/g, ' ')}${b.getAttribute('aria-checked') === 'true' ? ' [on]' : ''}`))));
log('figures:', JSON.stringify(await text('#records-figures')));
log('overall:', JSON.stringify(await text('#records-overall')));
log('history title:', JSON.stringify(await text('#records-history-title')), 'chart alt/aria:', await ms(() => { const c = document.getElementById('records-chart'); return { tag: c?.tagName, label: c?.getAttribute('aria-label'), role: c?.getAttribute('role'), text: c?.innerText?.slice(0, 300), w: c?.getBoundingClientRect().width, h: c?.getBoundingClientRect().height }; }));
log('games list:', JSON.stringify(await text('#records-games')));
log('page label:', JSON.stringify(await text('#records-page')));
log('replays:', JSON.stringify(await text('#records-replays')));
log('note:', JSON.stringify(await text('#records-note')));
// Full page scroll shots
const h = await ms(() => document.getElementById('records').scrollHeight);
log('records screen scroll height', h);
await page.screenshot({ path: '05-records-full.png', fullPage: true });
// scroll within the records screen (it may be its own scroll container)
await ms(() => { const r = document.getElementById('records'); r.scrollTop = 600; window.scrollTo(0, 600); });
await sleep(200);
await shot(page, '05-records-scrolled-1');
await ms(() => { const r = document.getElementById('records'); r.scrollTop = 1400; window.scrollTo(0, 1400); });
await sleep(200);
await shot(page, '05-records-scrolled-2');
await ms(() => { const r = document.getElementById('records'); r.scrollTop = 0; window.scrollTo(0, 0); });

// Recent games paging
const next = await ms(() => { const b = document.getElementById('records-next'); return b && { disabled: b.disabled, text: b.innerText }; });
log('next button', JSON.stringify(next));

// Pick Expert · no-guess in 2D
const picked = await ms(() => { const b = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /Expert/.test(x.innerText) && /no-guess/i.test(x.innerText)); if (b) { b.click(); return b.innerText; } return null; });
log('picked', JSON.stringify(picked), '→ board', await text('#records-board'));
await sleep(200);
await shot(page, '05-records-expert-noguess');
log('figures ng:', JSON.stringify(await text('#records-figures')));
log('replays ng:', JSON.stringify(await text('#records-replays')));

// Back to Expert standard; pin and unpin the newest replay; pinned-first filter
await ms(() => { const b = [...document.querySelectorAll('#records-picker button, #records-picker [role="radio"]')].find((x) => /^Expert\b/.test(x.innerText.trim()) && !/no-guess/i.test(x.innerText)); b?.click(); });
await sleep(200);
const rows = await ms(() => [...document.querySelectorAll('#records-replays-body tr')].map((tr) => tr.innerText.replace(/\t/g, ' | ')));
log('replay rows (Expert):', JSON.stringify(rows, null, 1));
const pinBtn = await ms(() => { const b = [...document.querySelectorAll('#records-replays-body button')].find((x) => /^Pin$/.test(x.innerText.trim())); if (b) { b.click(); return true; } return false; });
log('clicked Pin:', pinBtn);
await sleep(200);
log('rows after pin:', JSON.stringify(await ms(() => [...document.querySelectorAll('#records-replays-body tr')].slice(0, 4).map((tr) => tr.innerText.replace(/\t/g, ' | ')))));
log('pinned-first control:', JSON.stringify(await ms(() => { const e = document.getElementById('records-pinned-first'); return e && { tag: e.tagName, checked: e.checked ?? e.getAttribute('aria-checked'), text: e.innerText || e.parentElement?.innerText }; })));
await shot(page, '05-records-after-pin');
// games list rows: Watch markers?
log('games rows:', JSON.stringify(await ms(() => [...document.querySelectorAll('#records-games-body tr')].map((tr) => tr.innerText.replace(/\t/g, ' | ')))));
log('bests Watch buttons:', JSON.stringify(await ms(() => [...document.querySelectorAll('#records-bests button')].map((b) => b.innerText))));
// next page
await ms(() => document.getElementById('records-next')?.click());
await sleep(200);
log('after next: page label', JSON.stringify(await text('#records-page')), 'rows', await ms(() => document.querySelectorAll('#records-games-body tr').length));
await shot(page, '05-records-page2');

// 3D switch
await ms(() => { const b = [...document.querySelectorAll('#records-mode button, #records-mode [role="radio"]')].find((x) => /3D/.test(x.innerText)); b?.click(); });
await sleep(300);
await shot(page, '05-records-3d');
log('3D board:', await text('#records-board'));
log('3D picker:', JSON.stringify(await ms(() => [...document.querySelectorAll('#records-picker [role="radio"], #records-picker button')].map((b) => `${b.innerText.replace(/\n/g, ' ')}${b.getAttribute('aria-checked') === 'true' ? ' [on]' : ''}`))));
log('3D figures:', JSON.stringify(await text('#records-figures')));
log('3D overall:', JSON.stringify(await text('#records-overall')));
log('3D games:', JSON.stringify(await text('#records-games')));
log('3D replays:', JSON.stringify(await text('#records-replays')));
await ms(() => { const r = document.getElementById('records'); r.scrollTop = 700; window.scrollTo(0, 700); });
await sleep(200);
await shot(page, '05-records-3d-scrolled');

// Keyboard: Esc back
await page.keyboard.press('Escape');
log('after Esc:', await mode(page));
// Storage footprint
log('storage:', JSON.stringify(await ms(async () => { const est = await navigator.storage?.estimate?.(); const ls = Object.keys(localStorage).map((k) => `${k}:${localStorage.getItem(k).length}`); return { usage: est?.usage, quota: est?.quota, ls }; })));
log('page errors:', page.errors.slice(0, 10));
await context.close();
