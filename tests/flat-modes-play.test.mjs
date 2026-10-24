// Hexagon and Triangle played on the Classic 2D flow: the game window's title naming the mode, and in
// a browser a Hexagon and a Triangle game on fixed boards played to a win and a loss — by mouse,
// keyboard and touch — in the Classic 2D game window, through the end effect to the shared results
// screen, whose Play again, Records and Main menu work as after a Classic 2D game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardTitle2D } from '../js/ui.js';
import { createBoardIdentity } from '../js/records/board.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const suite = browserSuite();

test('the game window\'s title leads with the open mode\'s name, then the board', () => {
  const id = (over) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false, ...over });
  assert.equal(boardTitle2D({ identity: id({}) }), 'Classic 2D · Beginner');
  assert.equal(boardTitle2D({ identity: id({ mode: 'hexagon', grid: 'hex', mines: 13 }) }), 'Hexagon · Beginner');
  assert.equal(boardTitle2D({ identity: id({ mode: 'triangle', grid: 'tri', width: 13, height: 7, mines: 8 }) }), 'Triangle · Beginner');
  assert.equal(boardTitle2D({ identity: id({ mode: 'triangle', grid: 'tri', width: 12, height: 7, mines: 9 }) }), 'Triangle · Custom');
});

// A browser without WebGL 2: the menu screens keep no 3D backdrop redrawing under software rendering.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}
// A fixed board: every board seed the session draws is 12345.
function fixSeed() {
  const real = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
}

const MODES = {
  hexagon: { prefix: 'hex', name: 'Hexagon', kind: 'hex', width: 9, height: 9 },
  triangle: { prefix: 'tri', name: 'Triangle', kind: 'tri', width: 13, height: 7 },
};

// The page's helpers for one flat game: start it from the menu, find a cell's centre on the page from
// the board view's layout and the grid's geometry, read the game, and wait for its end.
function helpers(page, { tap = null } = {}) {
  const ms = (fn, arg) => page.evaluate(fn, arg);
  const click = (sel) => (tap ? page.tap(sel) : page.click(sel));
  let board = null; // the open mode's grid: { kind, width, height }
  return {
    ms,
    get board() { return board; },
    async start(id) {
      const { prefix, kind, width, height } = MODES[id];
      board = { kind, width, height };
      await click(`#menu-entry-${id}`);
      await page.waitForFunction((s) => globalThis.__ms.state.mode === s, `${id}-choice`);
      await ms((p) => { const s = document.getElementById(`${p}-noguess`); if (s.checked) s.click(); }, prefix); // the switch sits in the closed panel
      await click(`#${prefix}-choice [data-size="beginner"]`);
      await click(`#${prefix}-play`);
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
      assert.equal(await ms(() => globalThis.__ms.modes.active), id, `${id} is the active mode`);
    },
    /** Cell c's centre in page coordinates, scrolled into view first. */
    centre: (c) => ms(async ([cell, b]) => {
      const { createGeometry } = await import('/js/geometry/index.js');
      const v = globalThis.__ms.board2D;
      v.ensureVisible(cell);
      const geometry = createGeometry(b.kind, b.width, b.height);
      const L = v.layout;
      const r = v.canvas.getBoundingClientRect();
      const p = geometry.centre(cell, L.tile, L.gap ?? 0);
      const s = v.scroll;
      return { x: r.left + L.offsetX - s.x + p.x, y: r.top + L.offsetY - s.y + p.y };
    }, [c, board]),
    state: (c) => ms((cell) => globalThis.__ms.game2D.cellState(cell), c),
    mines: () => ms(() => Array.from(globalThis.__ms.game2D.snapshot().mines)),
    closedSafe: () => ms((count) => {
      const g = globalThis.__ms.game2D;
      const mines = new Set(Array.from(g.snapshot().mines));
      const out = [];
      for (let c = 0; c < count; c++) if (!mines.has(c) && g.cellState(c) === 'closed') out.push(c);
      return out;
    }, board.width * board.height),
    effect: () => ms(() => {
      const e = globalThis.__ms.board2D?.effect;
      return e ? { kind: e.kind, origin: e.origin } : null;
    }),
    results: async () => {
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000) });
      return ms(() => ({ title: document.getElementById('results-title').textContent, board: document.getElementById('results-board').textContent }));
    },
  };
}

// The arrow keys that move the board cursor from `from` to `to` by the grid's geometry: a shortest
// path over the geometry's cursor neighbours, found in the page.
const cursorPath = (page, board, from, to) => page.evaluate(async ([a, b, { kind, width, height }]) => {
  const { createGeometry } = await import('/js/geometry/index.js');
  const geometry = createGeometry(kind, width, height);
  const KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const back = new Map([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const c = queue.shift();
    if (c === b) break;
    for (const dir of Object.keys(KEYS)) {
      const n = geometry.neighbour(c, dir);
      if (n >= 0 && !back.has(n)) { back.set(n, [c, KEYS[dir]]); queue.push(n); }
    }
  }
  const keys = [];
  for (let c = b; back.get(c); c = back.get(c)[0]) keys.unshift(back.get(c)[1]);
  return keys;
}, [from, to, board]);

test('in a browser, Hexagon and Triangle Beginner boards are won and lost by mouse and keyboard in the Classic 2D window, then the results screen', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(fixSeed);
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const h = helpers(page);
    const { ms } = h;
    const mouseOn = async (c) => { const p = await h.centre(c); await page.mouse.click(p.x, p.y); };
    // The cursor, shown by a first arrow press, walks to `c` by the grid's geometry and Space reveals it.
    const keyTo = async (c) => {
      if ((await ms(() => globalThis.__ms.board2D.cursor)) < 0) await page.keyboard.press('ArrowRight');
      const from = await ms(() => globalThis.__ms.board2D.cursor);
      for (const key of await cursorPath(page, h.board, from, c)) await page.keyboard.press(key);
      assert.equal(await ms(() => globalThis.__ms.board2D.cursor), c, `the cursor reached cell ${c}`);
      await page.keyboard.press('Space');
    };
    const started = () => page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: patience(5000) });

    // ---- Hexagon, won by mouse
    await h.start('hexagon');
    const window2D = await ms(() => ({
      title: document.getElementById('c2d-title').textContent,
      figures: document.getElementById('c2d').dataset.figures ?? null,
      pause: !!document.getElementById('c2d-pause'),
    }));
    assert.equal(window2D.title, 'Hexagon · Beginner', 'the foot line leads with the mode and difficulty');
    assert.equal(window2D.figures, null, 'the live figures panel is closed by default');
    assert.ok(window2D.pause, 'Pause in the title bar');
    const first = 40;
    await mouseOn(first);
    await started();
    assert.equal(await h.state(first), 'revealed', 'the first click is safe');
    for (const c of await h.closedSafe()) {
      if (await h.effect()) break;
      if ((await h.state(c)) === 'closed') await mouseOn(c);
    }
    assert.equal((await h.effect())?.kind, 'win', 'the win wave and confetti play on the board');
    let shown = await h.results();
    assert.deepEqual(shown, { title: 'You won!', board: 'Hexagon · Beginner' }, 'the board line leads with the mode\'s name');

    // ---- Play again: a fresh Hexagon game, lost by keyboard
    await page.click('#r-again');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    assert.equal(await ms(() => globalThis.__ms.modes.active), 'hexagon', 'Play again plays Hexagon again');
    assert.equal(await ms(() => globalThis.__ms.modes.state.started), false);
    await keyTo(first);
    await started();
    assert.equal(await h.state(first), 'revealed');
    const mine = (await h.mines())[0];
    await keyTo(mine);
    const lost = await h.effect();
    assert.deepEqual(lost, { kind: 'loss', origin: mine }, 'the loss wave spreads from the exploded tile');
    shown = await h.results();
    assert.equal(shown.title, 'Game over');
    assert.equal(shown.board, 'Hexagon · Beginner');

    // ---- Records opens the records screen; Main menu, then Triangle won by keyboard
    await page.click('#r-records');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'records');
    await page.goBack();
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
    await page.click('#r-menu');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu');
    await h.start('triangle');
    assert.equal(await ms(() => document.getElementById('c2d-title').textContent), 'Triangle · Beginner');
    const firstTri = 6 + 13 * 3;
    await keyTo(firstTri);
    await started();
    assert.equal(await h.state(firstTri), 'revealed', 'the first reveal is safe');
    for (const c of await h.closedSafe()) {
      if (await h.effect()) break;
      if ((await h.state(c)) === 'closed') await keyTo(c);
    }
    assert.equal((await h.effect())?.kind, 'win');
    shown = await h.results();
    assert.deepEqual(shown, { title: 'You won!', board: 'Triangle · Beginner' });

    // ---- Play again: Triangle lost by mouse
    await page.click('#r-again');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    assert.equal(await ms(() => globalThis.__ms.modes.active), 'triangle');
    await mouseOn(firstTri);
    await started();
    const triMine = (await h.mines())[0];
    await mouseOn(triMine);
    assert.deepEqual(await h.effect(), { kind: 'loss', origin: triMine });
    shown = await h.results();
    assert.deepEqual(shown, { title: 'Game over', board: 'Triangle · Beginner' });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

// Touches through the DevTools protocol, so a finger can be held (as tests/classic2d-touch.test.mjs).
function fingers(cdp) {
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  return {
    start: (points) => send('touchStart', points),
    end: () => send('touchEnd', []),
    tap: ([x, y]) => cdp.send('Input.synthesizeTapGesture', { x, y, duration: 50, tapCount: 1, gestureSourceType: 'touch' }),
  };
}
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

test('in a browser with touch on a phone, a Triangle board is won with a long-press flag and a Hexagon board lost by taps', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const context = await browser.newContext(PHONE);
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(fixSeed);
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const h = helpers(page, { tap: true });
    const f = fingers(await context.newCDPSession(page));
    const tapOn = async (c) => { const p = await h.centre(c); await f.tap([p.x, p.y]); };
    const started = () => page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: patience(5000) });

    // ---- Triangle, won by touch. The first-use hint strip shows from the start on a touch-only
    // device, as in Classic 2D; dismissed here, it stays dismissed for Hexagon, the record shared.
    const strip = () => h.ms(() => !document.getElementById('hint-strip').classList.contains('hidden'));
    await h.start('triangle');
    await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'), null, { timeout: patience(2000) });
    await page.tap('#hint-strip-close');
    assert.equal(await strip(), false);
    const firstTri = 6 + 13 * 3;
    await tapOn(firstTri);
    await started();
    assert.equal(await h.state(firstTri), 'revealed', 'the first tap reveals, safe');
    const closedMine = [];
    for (const m of await h.mines()) if ((await h.state(m)) === 'closed') closedMine.push(m);
    assert.ok(closedMine.length > 0, 'a closed mine to flag');
    const p = await h.centre(closedMine[0]);
    await f.start([[p.x, p.y]]);
    await page.waitForFunction((c) => globalThis.__ms.game2D.cellState(c) === 'flagged', closedMine[0], { timeout: patience(2000) });
    await f.end();
    assert.equal(await h.state(closedMine[0]), 'flagged', 'a long-press flags');
    for (const c of await h.closedSafe()) {
      if (await h.effect()) break;
      if ((await h.state(c)) !== 'closed') continue;
      await tapOn(c);
      await page.waitForFunction((cell) => globalThis.__ms.game2D.cellState(cell) !== 'closed' || !!globalThis.__ms.board2D.effect, c, { timeout: patience(2000) });
    }
    assert.equal((await h.effect())?.kind, 'win');
    assert.deepEqual(await h.results(), { title: 'You won!', board: 'Triangle · Beginner' });

    // ---- Main menu, Hexagon lost by touch
    await page.tap('#r-menu');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu');
    await h.start('hexagon');
    assert.equal(await strip(), false, 'the strip dismissed in Triangle stays dismissed in Hexagon');
    await tapOn(40);
    await started();
    const mine = (await h.mines())[0];
    await tapOn(mine);
    await page.waitForFunction(() => !!globalThis.__ms.board2D.effect || globalThis.__ms.state.mode === 'results', null, { timeout: patience(2000) });
    assert.deepEqual(await h.results(), { title: 'Game over', board: 'Hexagon · Beginner' });
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
