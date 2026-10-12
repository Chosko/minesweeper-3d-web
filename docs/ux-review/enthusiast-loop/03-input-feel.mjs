// Input feel on Classic 2D Expert with the real (Playwright) mouse and keyboard.
import { launch, openPage, mode, shot, setSeed, centres2D, mines2D, analyse, sleep } from './lib.mjs';

const W = 30, H = 16, M = 99;
const context = await launch({ fresh: false });
const page = await openPage(context);
await page.click('#menu-entry-classic-2d');
if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
await page.click('#c2d-choice [data-size="expert"]');
const seed = 12345, fc = 7 * W + 15;
await setSeed(page, seed);
const centres = await centres2D(page, W, H);
const gen = mines2D({ width: W, height: H, mines: M, firstClick: fc, noGuess: false, seed });
const a = analyse({ width: W, height: H, mines: gen.mines });
const sum = () => page.evaluate(() => { const s = globalThis.__ms.modes.summary?.(); return s && { solved: s.bbbvSolved, r: s.clicks.reveal, f: s.clicks.flag, c: s.clicks.chord }; });
const hud = () => page.evaluate(() => ({ time: document.getElementById('hud-time').textContent, mines: document.getElementById('hud-mines').textContent }));
const clip = (c, r = 2) => ({ x: centres[c].x - (r + 0.5) * 41, y: centres[c].y - (r + 0.5) * 41, width: (2 * r + 1) * 41, height: (2 * r + 1) * 41 });
const tile = centres[1].x - centres[0].x;
console.log('tile px', tile);

// Cursor at start: where is the focus ring?
await page.screenshot({ path: `${process.env.DIR ?? '.'}/03-closed-cursor.png`, clip: { x: 0, y: 90, width: 300, height: 200 } });

// 1. The first click, with the real mouse: time from release to the opening drawn.
await page.mouse.click(centres[fc].x, centres[fc].y);
await page.waitForFunction(() => globalThis.__ms.modes.state.started);
console.log('after first click', JSON.stringify(await sum()), await hud());
// open an opening
const zero = a.openingCells[0].find((c) => a.num[c] === 0 && a.nb(c).every((d) => a.num[d] !== -1));
await page.mouse.click(centres[zero].x, centres[zero].y);
await sleep(200);
console.log('after opening click', JSON.stringify(await sum()));

// 2. Press feedback: left held on a closed unflagged cell
const closedSafe = a.isolatedCells.find((c) => c % W > 3 && c % W < W - 3 && Math.floor(c / W) > 3 && Math.floor(c / W) < H - 3);
await page.mouse.move(centres[closedSafe].x, centres[closedSafe].y);
await page.mouse.down();
await sleep(150);
await page.screenshot({ path: `03-press-closed.png`, clip: clip(closedSafe) });
// drag off to a neighbouring closed cell: the press moves; then off the board: cancel
const neighbourClosed = a.nb(closedSafe).find((d) => a.num[d] !== -1 && a.opening[d] === -1) ?? a.nb(closedSafe)[0];
await page.mouse.move(centres[neighbourClosed].x, centres[neighbourClosed].y, { steps: 3 });
await sleep(150);
await page.screenshot({ path: `03-press-dragged.png`, clip: clip(closedSafe) });
await page.mouse.move(5, 400, { steps: 3 }); // off the board (left margin)
await sleep(100);
await page.mouse.up();
await sleep(100);
console.log('after press, drag to neighbour, release off board (expect no click counted)', JSON.stringify(await sum()));

// 3. Flag on press: right button down, read the counter before release
await page.mouse.move(centres[gen.mines[5]].x, centres[gen.mines[5]].y);
await page.mouse.down({ button: 'right' });
await sleep(60);
const duringRight = await hud();
await page.mouse.up({ button: 'right' });
console.log('mines counter while right held (expect 98 → flag on press):', duringRight.mines, 'after release:', (await hud()).mines, JSON.stringify(await sum()));

// 4. Left + right chord on a number on the opening's border, with its mines flagged
const border = [];
for (const z of a.openingCells[0]) for (const d of a.nb(z)) if (a.num[d] > 0 && !border.includes(d)) border.push(d);
const q = border.find((c) => a.nb(c).some((d) => a.num[d] >= 0 && a.opening[d] !== 0 && !a.isolatedCells.includes(d) ? false : (a.num[d] >= 0 && a.opening[d] !== 0)) && a.nb(c).filter((d) => a.mine[d]).length >= 1);
const qMines = a.nb(q).filter((d) => a.mine[d]);
const qSafeClosed = a.nb(q).filter((d) => a.num[d] >= 0 && a.opening[d] !== 0);
console.log('chord target q', q, 'number', a.num[q], 'mines', qMines.length, 'closed safe neighbours', qSafeClosed);
// left held on the number BEFORE flags: pressed preview of closed neighbours (reference: shows even when count mismatches)
await page.mouse.move(centres[q].x, centres[q].y);
await page.mouse.down();
await sleep(120);
await page.screenshot({ path: `03-press-number-preview.png`, clip: clip(q) });
await page.mouse.up();
console.log('left click on number with no flags (expect wasted chord):', JSON.stringify(await sum()));
for (const m of qMines) await page.mouse.click(centres[m].x, centres[m].y, { button: 'right' });
console.log('after flags', JSON.stringify(await sum()), (await hud()).mines);
await page.mouse.move(centres[q].x, centres[q].y);
await page.mouse.down({ button: 'left' });
await page.mouse.down({ button: 'right' });
await sleep(120);
await page.screenshot({ path: `03-chord-preview.png`, clip: clip(q) });
await page.mouse.up({ button: 'left' });
await sleep(80);
const afterLeftUp = await sum();
console.log('left+right, after LEFT release (expect chord fired, right still held):', JSON.stringify(afterLeftUp));
// 1.5-click: keep right held, press and release left on another satisfied number? Use the same q (now wasted) to see if a chord fires again
await page.mouse.down({ button: 'left' });
await page.mouse.up({ button: 'left' });
await sleep(80);
console.log('right still held, left pressed+released again on q (1.5-click; expect another chord, wasted):', JSON.stringify(await sum()));
await page.mouse.up({ button: 'right' });
await sleep(50);
console.log('after right release (expect no flag toggled):', JSON.stringify(await sum()), (await hud()).mines);

// 5. Middle button: on a closed cell reveals, on a number chords
const closed2 = a.isolatedCells.find((c) => c !== closedSafe && c % W > 3 && c % W < W - 3 && Math.floor(c / W) > 3 && Math.floor(c / W) < H - 3);
await page.mouse.click(centres[closed2].x, centres[closed2].y, { button: 'middle' });
await sleep(80);
console.log('middle click on closed cell (expect reveal +1):', JSON.stringify(await sum()));
await page.mouse.click(centres[q].x, centres[q].y, { button: 'middle' });
await sleep(80);
console.log('middle click on number (expect chord +1):', JSON.stringify(await sum()));

// 6. Right press on a revealed number: nothing, no click
await page.mouse.click(centres[q].x, centres[q].y, { button: 'right' });
await sleep(80);
console.log('right click on revealed number (expect no click):', JSON.stringify(await sum()), (await hud()).mines);

// 7. Left press on a flagged cell: nothing shows, nothing on release
await page.mouse.move(centres[qMines[0]].x, centres[qMines[0]].y);
await page.mouse.down();
await sleep(100);
await page.screenshot({ path: `03-press-flagged.png`, clip: clip(qMines[0]) });
await page.mouse.up();
console.log('left click on a flagged cell (expect no click):', JSON.stringify(await sum()));

// 8. Right press while left held on a closed cell toggles a flag (reference)
await page.mouse.move(centres[gen.mines[7]].x, centres[gen.mines[7]].y);
await page.mouse.down({ button: 'left' });
await sleep(50);
await page.mouse.down({ button: 'right' });
await sleep(50);
const m1 = (await hud()).mines;
await page.mouse.up({ button: 'right' });
await page.mouse.up({ button: 'left' });
await sleep(50);
console.log('right pressed while left held on a closed mine: counter during', m1, 'after', (await hud()).mines, JSON.stringify(await sum()));

// 9. Keyboard: arrows, Space, F, D
const before = await sum();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await sleep(50);
await page.screenshot({ path: `03-cursor-moved.png`, clip: { x: 0, y: 90, width: 300, height: 200 } });
// cursor should be at cell 2 (row 0); is it safe?
console.log('cell 2 is', a.num[2] === -1 ? 'a mine' : `safe (${a.num[2]})`, 'cell 3 is', a.num[3] === -1 ? 'a mine' : `safe (${a.num[3]})`);
await page.keyboard.press('KeyF');
await sleep(50);
console.log('F on cursor cell → counter', (await hud()).mines, JSON.stringify(await sum()));
await page.keyboard.press('KeyF');
await page.keyboard.press('ArrowRight');
await page.keyboard.down('Space');
await sleep(120);
await page.screenshot({ path: `03-space-held.png`, clip: { x: 0, y: 90, width: 300, height: 200 } });
await page.keyboard.up('Space');
await sleep(80);
console.log('Space released on cursor cell:', JSON.stringify(await sum()), 'mode', await mode(page));
if (await mode(page) === 'classic-2d') {
  await page.keyboard.press('KeyD');
  await sleep(80);
  console.log('D on cursor cell:', JSON.stringify(await sum()));
}
await shot(page, '03-board-after-input-tests');
// Pause mid-game: allowed? timer frozen? then resume
await page.keyboard.press('Escape');
await sleep(100);
console.log('Esc → mode', await mode(page));
await shot(page, '03-pause-card');
console.log('pause card text:', JSON.stringify(await page.evaluate(() => document.getElementById('pause-card')?.innerText)));
await page.click('#p-restart');
await sleep(100);
await shot(page, '03-restart-confirm');
console.log('restart confirm text:', JSON.stringify(await page.evaluate(() => document.getElementById('pause-confirm')?.innerText)));
await page.click('#p-confirm-no');
await page.click('#p-menu');
await sleep(100);
console.log('menu confirm text:', JSON.stringify(await page.evaluate(() => document.getElementById('pause-confirm')?.innerText)));
await page.click('#p-confirm-yes');
console.log('mode after leaving:', await mode(page));
console.log('page errors:', page.errors);
await context.close();
