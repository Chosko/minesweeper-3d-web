import { launch, URL, ready, focused, mode, shot, sleep, log } from './helpers.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
let ctxMenu = 0; await page.exposeFunction('__ctx', () => ctxMenu++);
await page.goto(URL); await ready(page);
await page.evaluate(() => document.addEventListener('contextmenu', (e) => { if (!e.defaultPrevented) __ctx(); }));
await page.click('#menu-entry-classic-2d'); await sleep(300); await page.click('#c2d-choice [data-size="beginner"]'); await page.click('#c2d-play'); await sleep(500);
const box = await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const tile = box.w / 9; const at = (c, r) => [box.x + tile * (c + 0.5), box.y + tile * (r + 0.5)];
const hud = () => page.evaluate(() => ({ t: document.getElementById('c2d-time').textContent, m: document.getElementById('c2d-mines-left').textContent, started: __ms.modes.state.started, mode: __ms.state.mode }));
log('cursor on board', await page.evaluate(() => getComputedStyle(document.querySelector('#c2d-board canvas')).cursor));
// press without release: nothing revealed?
await page.mouse.move(...at(4, 4)); await page.mouse.down(); await sleep(200); log('left pressed (not released)', await hud());
await shot(page, 'm-01-pressed');
// drag off board and release = cancel
await page.mouse.move(box.x - 60, box.y + 100, { steps: 5 }); await page.mouse.up(); await sleep(400); log('released off-board', await hud());
// press then drag to another cell then release
await page.mouse.move(...at(4, 4)); await page.mouse.down(); await page.mouse.move(...at(5, 4), { steps: 4 }); await page.mouse.up(); await sleep(1200); log('press at (4,4), release at (5,4)', await hud());
await shot(page, 'm-02-after-first');
// right click: flag on press; context menu suppressed?
await page.mouse.move(...at(0, 0)); await page.mouse.down({ button: 'right' }); await sleep(100); log('right pressed (flag on press?)', await hud()); await page.mouse.up({ button: 'right' }); await sleep(100);
log('context menus not prevented so far:', ctxMenu);
await page.mouse.click(...at(0, 0), { button: 'right' }); await sleep(100); log('right click again (unflag)', await hud());
// middle click reveals
await page.mouse.click(...at(8, 8), { button: 'middle' }); await sleep(500); log('middle click', await hud());
// double click hazard: dblclick a revealed number -> chord on release each time?
await page.mouse.dblclick(...at(5, 4)); await sleep(300); log('dblclick', await hud());
// chord both buttons: press L then R on a number, release L
await page.mouse.move(...at(5, 4)); await page.mouse.down(); await page.mouse.down({ button: 'right' }); await sleep(100);
await shot(page, 'm-03-chord-pressed');
await page.mouse.up(); await page.mouse.up({ button: 'right' }); await sleep(300); log('chord', await hud());
// Right-click outside the canvas: context menu appears?
await page.mouse.click(1200, 400, { button: 'right' }); await sleep(100); log('context menu outside board count', ctxMenu);
// wheel on a small board does what? (page scroll?)
await page.mouse.move(...at(4, 4)); await page.mouse.wheel(0, 300); await sleep(200); log('scrollY after wheel', await page.evaluate(() => scrollY));
await shot(page, 'm-04-after-mouse');
await page.click('#c2d-pause'); await sleep(300);
log('pause cursor on overlay', await page.evaluate(() => getComputedStyle(document.getElementById('p-resume')).cursor));
await page.click('#p-menu'); await sleep(200); await page.click('#p-confirm-yes'); await sleep(400);
// large custom board 100x100 for scrolling with wheel and shift-drag
await page.click('#menu-entry-classic-2d'); await sleep(300);
await page.click('#c2d-choice [data-size="custom"]'); await page.fill('#c2d-width', '60'); await page.fill('#c2d-height', '60'); await page.fill('#c2d-mines', '10'); await page.click('#c2d-play'); await sleep(800);
log('60x60 layout', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), tile: Math.round(r.width / 60), x: Math.round(r.x), y: Math.round(r.y) }; }));
await shot(page, 'm-05-60x60');
await page.mouse.move(640, 440); await page.mouse.wheel(0, 500); await sleep(300);
log('after wheel 500', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }), 'pageScrollY', await page.evaluate(() => scrollY));
await page.keyboard.down('Shift'); await page.mouse.wheel(0, 500); await page.keyboard.up('Shift'); await sleep(300);
log('after shift+wheel', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }));
// plain drag (no shift) on a big board: does it pan or press?
await page.mouse.move(640, 440); await page.mouse.down(); await page.mouse.move(400, 300, { steps: 8 }); await page.mouse.up(); await sleep(500);
log('after plain drag', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }), await hud());
await page.keyboard.down('Shift'); await page.mouse.move(640, 440); await page.mouse.down(); await page.mouse.move(400, 300, { steps: 8 }); await page.mouse.up(); await page.keyboard.up('Shift'); await sleep(300);
log('after shift-drag', await page.evaluate(() => { const r = document.querySelector('#c2d-board canvas').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; }), 'cursor', await page.evaluate(() => getComputedStyle(document.querySelector('#c2d-board canvas')).cursor));
await shot(page, 'm-06-60x60-scrolled');
// keyboard cursor ensureVisible: press ArrowDown many times
for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowDown'); await sleep(300);
await shot(page, 'm-07-60x60-cursor-scrolled');
log('errors', errors);
await browser.close();
