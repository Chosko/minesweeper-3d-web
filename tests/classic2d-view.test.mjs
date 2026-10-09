// Classic 2D board view (js/classic2d/board-view.js): the fit rule and layout, hit-testing in a
// fitted and a scrolled board, per-cell redraw from the engine's change lists through the tile
// skin, full repaints on resize, pixel-ratio and theme change, scrolling and panning, the hidden
// board while paused, and in a browser the board drawn in both themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  fitTileSize, boardLayout, cellAtLayout, createBoardView, PAN_MODIFIER, BOARD_BACKGROUND,
} from '../js/classic2d/board-view.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- fakes ----------

function fakeContext() {
  const calls = [];
  const state = { fillStyle: '#000000' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      return (...args) => { calls.push({ op: prop, args, fill: target.fillStyle }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function fakeCanvas() {
  const ctx = fakeContext();
  return { width: 0, height: 0, style: {}, ctx, getContext: () => ctx };
}

// A skin recording every tile it draws, and the redraw callback the view hands it.
function fakeSkinFactory() {
  const out = { draws: [], redraw: null, disposed: false };
  out.createSkin = ({ redraw }) => {
    out.redraw = redraw;
    return {
      drawTile(ctx, x, y, size, state, number, ratio) { out.draws.push({ x, y, size, state, number, ratio }); },
      dispose() { out.disposed = true; },
    };
  };
  return out;
}

function tokenMap(map) {
  return (name) => map[name.startsWith('--') ? name : `--${name}`] ?? '#ff00ff';
}

const REF = { profile: REFERENCE_PROFILE };
// 9 × 9 with mines on the right column: revealing (0, 0) floods the left part of the board.
function beginnerGame() {
  const grid = createSquareGrid(9, 9);
  const mines = [];
  for (let row = 0; row < 9; row++) mines.push(grid.index(8, row));
  mines.push(grid.index(7, 0));
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines, dimensions: { width: 9, height: 9 } });
  return { grid, game };
}

function makeView({ cols = 9, rows = 9, width = 600, height = 500, pixelRatio = 1, token } = {}) {
  const grid = createSquareGrid(cols, rows);
  const canvas = fakeCanvas();
  const skin = fakeSkinFactory();
  const tokens = { light: { '--color-board-frame': '#111111' }, dark: { '--color-board-frame': '#222222' } };
  let theme = 'light';
  const view = createBoardView({
    canvas, grid, createSkin: skin.createSkin,
    token: token ?? ((name) => tokenMap(tokens[theme])(name)),
  });
  view.resize(width, height, pixelRatio);
  return { grid, canvas, skin, view, setTheme: (t) => { theme = t; } };
}

const backgroundFills = (canvas) => canvas.ctx.calls.filter((c) => c.op === 'fillRect');

// ---------- fit rule and layout ----------

test('the tile is the largest whole size that fits the board, never below MIN_TILE_SIZE', () => {
  // The available area below the 64px overlay bar with 16px margins, in a 1366×768 window.
  const area = { width: 1366 - 32, height: 768 - 64 - 48 };
  assert.equal(fitTileSize(30, 16, area.width, area.height), MIN_TILE_SIZE, 'Expert gets the minimum');
  assert.equal(fitTileSize(9, 9, area.width, area.height), Math.floor(656 / 9));
  assert.equal(fitTileSize(16, 16, area.width, area.height), 41);
  assert.equal(fitTileSize(100, 100, area.width, area.height), MIN_TILE_SIZE, 'clamped to the minimum');
  assert.equal(fitTileSize(4, 2, 100, 100), MIN_TILE_SIZE);
  assert.equal(fitTileSize(2, 1, 1000, 1000), 500);
  assert.equal(fitTileSize(2, 1, 1000, 1000, 600), 600, 'an explicit minimum');
  for (const [c, r] of [[9, 9], [16, 16], [30, 16], [7, 3]]) {
    const t = fitTileSize(c, r, 1001, 777);
    assert.ok(Number.isInteger(t) && t >= MIN_TILE_SIZE);
    assert.ok(t === MIN_TILE_SIZE || (t * c <= 1001 && t * r <= 777), 'a fitted board fits');
  }
});

test('a fitted board is centred with nothing to scroll; a larger one starts at the edge and scrolls', () => {
  const fits = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  assert.equal(fits.tile, 55);
  assert.deepEqual([fits.boardWidth, fits.boardHeight], [495, 495]);
  assert.deepEqual([fits.offsetX, fits.offsetY], [52, 2]);
  assert.deepEqual([fits.maxScrollX, fits.maxScrollY, fits.scrolls], [0, 0, false]);

  const big = boardLayout({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(big.tile, MIN_TILE_SIZE);
  assert.deepEqual([big.offsetX, big.offsetY], [0, 0]);
  assert.deepEqual([big.maxScrollX, big.maxScrollY, big.scrolls], [4100 - 1334, 4100 - 656, true]);

  const wide = boardLayout({ cols: 100, rows: 2, width: 1334, height: 656 });
  assert.equal(wide.maxScrollY, 0, 'only the axis that overflows scrolls');
  assert.equal(wide.offsetY, Math.floor((656 - 82) / 2), 'and the other stays centred');
  assert.ok(wide.maxScrollX > 0);
});

// ---------- hit-testing ----------

test('cellAt maps a position to its cell, and to -1 outside the board', () => {
  const layout = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  const at = (x, y, scroll = { x: 0, y: 0 }) => cellAtLayout(layout, scroll, 9, 9, x, y);
  assert.equal(at(52, 2), 0, 'top-left corner of the first tile');
  assert.equal(at(52 + 54.9, 2 + 54.9), 0);
  assert.equal(at(52 + 55, 2), 1, 'the next tile starts on its edge');
  assert.equal(at(52 + 3 * 55 + 10, 2 + 4 * 55 + 10), 3 + 9 * 4);
  assert.equal(at(52 + 495 - 1, 2 + 495 - 1), 80, 'last tile');
  assert.equal(at(51, 10), -1, 'left of the board');
  assert.equal(at(52 + 495, 10), -1, 'right of the board');
  assert.equal(at(60, 1), -1, 'above the board');
  assert.equal(at(60, 2 + 495), -1, 'below the board');
  assert.equal(at(NaN, 10), -1);
});

test('cellAt follows the scroll position in a scrolled board', () => {
  const { view, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(view.cellAt(0, 0), 0);
  view.scrollTo(41 * 10 + 5, 41 * 3);
  assert.deepEqual(view.scroll, { x: 415, y: 123 });
  assert.equal(view.cellAt(0, 0), grid.index(10, 3));
  assert.equal(view.cellAt(36, 0), grid.index(11, 3), 'the partly hidden tile ends 36px in');
  assert.equal(view.cellAt(1333, 655), grid.index(Math.floor((415 + 1333) / 41), Math.floor((123 + 655) / 41)));
  view.scrollTo(1e9, 1e9);
  assert.equal(view.cellAt(1333, 655), grid.index(99, 99), 'the far corner at the end of the scroll');
  assert.equal(view.cellAt(1334, 10), -1, 'past the canvas');
});

test('cellRect gives a cell\'s tile in canvas coordinates, scroll included', () => {
  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  view.scrollTo(100, 50);
  assert.deepEqual(view.cellRect(0), { x: -100, y: -50, size: 41 });
  assert.deepEqual(view.cellRect(101), { x: 41 - 100, y: 41 - 50, size: 41 });
});

// ---------- painting ----------

test('the canvas takes the area at the device pixel ratio, and a game paints every cell once', () => {
  const { view, canvas, skin, setTheme } = makeView({ width: 600, height: 500, pixelRatio: 1.5 });
  assert.deepEqual([canvas.width, canvas.height], [900, 750]);
  assert.deepEqual([canvas.style.width, canvas.style.height], ['600px', '500px']);
  const { game } = beginnerGame();
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setGame(game);
  assert.equal(skin.draws.length, 81);
  const first = skin.draws[0];
  assert.deepEqual(first, { x: 52, y: 2, size: 55, state: 'closed', number: -1, ratio: 1.5 });
  const last = skin.draws[80];
  assert.deepEqual([last.x, last.y], [52 + 8 * 55, 2 + 8 * 55]);
  const transform = canvas.ctx.calls.find((c) => c.op === 'setTransform');
  assert.deepEqual(transform.args, [1.5, 0, 0, 1.5, 0, 0]);
  const bg = backgroundFills(canvas)[0];
  assert.equal(bg.fill, '#111111', 'the background is the board token');
  assert.deepEqual(bg.args, [0, 0, 600, 500]);
  setTheme('dark');
  skin.redraw();
  assert.equal(backgroundFills(canvas).at(-1).fill, '#222222', 'read again after a theme change');
});

test('the background is drawn from a design token, never a literal colour', () => {
  assert.equal(BOARD_BACKGROUND, '--color-board-frame');
  const src = readFileSync(join(ROOT, 'js/classic2d/board-view.js'), 'utf8');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no literal colours');
  assert.doesNotMatch(src, /\brgba?\(/, 'no literal colours');
  const css = readFileSync(join(ROOT, 'css/tokens.css'), 'utf8');
  assert.match(css, new RegExp(`${BOARD_BACKGROUND}:`), 'the token exists');
});

test('after an action only the changed cells are repainted, in the engine\'s state', () => {
  const { view, skin } = makeView();
  const { game, grid } = beginnerGame();
  view.setGame(game);
  skin.draws.length = 0;
  const f = game.toggleFlag(grid.index(8, 8));
  view.update(f.changed);
  assert.deepEqual(skin.draws.map((d) => [d.state, d.x, d.y]), [['flagged', 52 + 8 * 55, 2 + 8 * 55]]);
  skin.draws.length = 0;
  const r = game.reveal(grid.index(0, 0));
  const changed = [...r.changed];
  assert.ok(changed.length > 1 && changed.length < 81);
  view.update(r.changed);
  assert.equal(skin.draws.length, changed.length);
  const layout = view.layout;
  changed.forEach((c, i) => {
    const d = skin.draws[i];
    const [col, row] = grid.colRow(c);
    assert.deepEqual([d.x, d.y], [layout.offsetX + col * layout.tile, layout.offsetY + row * layout.tile]);
    assert.equal(d.state, game.cellState(c));
    assert.equal(d.number, game.cellNumber(c));
  });
  skin.draws.length = 0;
  view.update([]);
  assert.equal(skin.draws.length, 0, 'nothing changed, nothing drawn');
});

test('resize, a pixel-ratio change and a theme change repaint the whole board', () => {
  const { view, skin } = makeView();
  view.setGame(beginnerGame().game);
  skin.draws.length = 0;
  view.resize(700, 500, 1);
  assert.equal(skin.draws.length, 81, 'resize');
  assert.equal(skin.draws[0].size, 55);
  skin.draws.length = 0;
  view.resize(700, 500, 2);
  assert.equal(skin.draws.length, 81, 'pixel ratio');
  assert.ok(skin.draws.every((d) => d.ratio === 2));
  skin.draws.length = 0;
  skin.redraw();
  assert.equal(skin.draws.length, 81, 'theme change through the skin\'s redraw callback');
  skin.draws.length = 0;
  view.resize(700, 500, 2);
  assert.equal(skin.draws.length, 0, 'the same size and ratio change nothing');
});

test('a scrolled board paints only the tiles in view', () => {
  const { view, skin, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines: [grid.index(99, 99)], dimensions: { width: 100, height: 100 } });
  view.setGame(game);
  const cols = Math.ceil(1334 / 41) + 1;
  assert.ok(skin.draws.length <= cols * (Math.ceil(656 / 41) + 1) && skin.draws.length > 500);
  skin.draws.length = 0;
  view.scrollTo(20, 0);
  assert.ok(skin.draws.length > 500, 'scrolling repaints');
  skin.draws.length = 0;
  const r = game.reveal(grid.index(0, 0));
  assert.ok(r.changed.length > 9000, 'the flood opens nearly the whole board');
  view.update(r.changed);
  assert.ok(skin.draws.length < 1000, 'only visible changed cells are drawn');
  assert.ok(skin.draws.every((d) => d.x > -41 && d.x < 1334 && d.y > -41 && d.y < 656));
});

// ---------- scrolling and panning ----------

test('scrolling is clamped, and a board that fits never scrolls', () => {
  const small = makeView();
  small.view.scrollTo(100, 100);
  assert.deepEqual(small.view.scroll, { x: 0, y: 0 });
  assert.equal(small.view.wheel({ deltaX: 0, deltaY: 120, deltaMode: 0 }), false, 'the wheel is not taken');

  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  view.scrollTo(-50, -5);
  assert.deepEqual(view.scroll, { x: 0, y: 0 });
  view.scrollBy(30, 40);
  assert.deepEqual(view.scroll, { x: 30, y: 40 });
  view.scrollTo(1e6, 1e6);
  assert.deepEqual(view.scroll, { x: 4100 - 1334, y: 4100 - 656 });
  view.resize(2000, 2000, 1);
  assert.deepEqual(view.scroll, { x: 4100 - 2000, y: 4100 - 2000 }, 're-clamped on resize');
});

test('the wheel scrolls a large board: vertical, horizontal, shift for horizontal, lines and pages', () => {
  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(view.wheel({ deltaX: 0, deltaY: 100, deltaMode: 0 }), true);
  assert.deepEqual(view.scroll, { x: 0, y: 100 });
  view.wheel({ deltaX: 30, deltaY: 0, deltaMode: 0 });
  assert.deepEqual(view.scroll, { x: 30, y: 100 });
  view.wheel({ deltaX: 0, deltaY: 50, deltaMode: 0, shiftKey: true });
  assert.deepEqual(view.scroll, { x: 80, y: 100 }, 'shift turns a vertical wheel horizontal');
  view.wheel({ deltaX: 0, deltaY: 2, deltaMode: 1 });
  assert.deepEqual(view.scroll, { x: 80, y: 100 + 2 * 41 }, 'a line is a tile');
  view.wheel({ deltaX: 0, deltaY: -1, deltaMode: 2 });
  assert.deepEqual(view.scroll, { x: 80, y: 0 }, 'a page is the view');
});

test('dragging with the pan modifier moves the board with the pointer', () => {
  assert.equal(PAN_MODIFIER, 'shiftKey');
  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  view.scrollTo(500, 500);
  view.pan(40, -25);
  assert.deepEqual(view.scroll, { x: 460, y: 525 }, 'the board follows the pointer');
});

test('ensureVisible scrolls just enough to show a cell, for the keyboard and controller cursor', () => {
  const { view, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(view.ensureVisible(grid.index(5, 5)), false, 'already in view');
  assert.equal(view.ensureVisible(grid.index(40, 0)), true);
  assert.deepEqual(view.scroll, { x: 41 * 41 - 1334, y: 0 }, 'the cell lands on the right edge');
  view.ensureVisible(grid.index(0, 30));
  assert.deepEqual(view.scroll, { x: 0, y: 31 * 41 - 656 }, 'left edge, bottom edge');
  view.ensureVisible(grid.index(0, 2));
  assert.deepEqual(view.scroll, { x: 0, y: 2 * 41 }, 'top edge');
  for (const c of [grid.index(99, 99), grid.index(57, 3), 0]) {
    view.ensureVisible(c);
    const r = view.cellRect(c);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + 41 <= 1334 && r.y + 41 <= 656);
  }
  assert.equal(view.ensureVisible(-1), false);
});

// ---------- hidden while paused ----------

test('a hidden board paints the background only, and comes back whole', () => {
  const { view, skin, canvas, grid } = makeView();
  const { game } = beginnerGame();
  view.setGame(game);
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setHidden(true);
  assert.equal(view.hidden, true);
  assert.equal(skin.draws.length, 0, 'no tile shows');
  assert.equal(backgroundFills(canvas).length, 1, 'the background covers the board');
  view.update(game.reveal(grid.index(0, 0)).changed);
  skin.redraw();
  view.resize(620, 500, 1);
  assert.equal(skin.draws.length, 0, 'nothing is drawn while hidden');
  view.setHidden(false);
  assert.equal(skin.draws.length, 81, 'showing repaints every cell');
  assert.equal(skin.draws[0].state, game.cellState(0));
});

test('a view without a game paints the background only, and dispose releases the skin', () => {
  const { view, skin } = makeView();
  view.repaint();
  assert.equal(skin.draws.length, 0);
  assert.equal(view.cellAt(60, 10), 0, 'hit-testing needs no game');
  view.dispose();
  assert.equal(skin.disposed, true);
});

test('the view needs a grid and a canvas', () => {
  assert.throws(() => createBoardView({ canvas: fakeCanvas() }), TypeError);
  assert.throws(() => createBoardView({ grid: createSquareGrid(2, 2) }), TypeError);
});

test('the module is DOM-free at import and independent of three.js', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/board-view.js'), 'utf8');
  assert.doesNotMatch(src, /^(?!\s*\/\/).*\bthree\b/im);
  assert.equal(typeof globalThis.document, 'undefined', 'imported above without a DOM');
});

// ---------------------------------------------------------------- browser

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

// Runs in the page: mounts a board view in the area below the overlay bar (64px) with 16px
// margins, plays a deterministic game on it and reports the layout and the colours under a few
// tiles. Mines run down the last column; revealing the top-left cell floods the rest.
async function mountBoard({ cols, rows, scroll }) {
  const { mountBoardView } = await import('/js/classic2d/board-view.js');
  const { createSquareGrid } = await import('/js/engine/square-grid.js');
  const { createGameWithMines } = await import('/js/engine/rules.js');
  const { token } = await import('/js/tokens.js');
  globalThis.__view?.destroy();
  let host = document.getElementById('board-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'board-host';
    Object.assign(host.style, { position: 'fixed', left: '16px', right: '16px', top: '96px', bottom: '16px', zIndex: 9999 });
    document.body.append(host);
  }
  const grid = createSquareGrid(cols, rows);
  const mines = [];
  for (let row = 0; row < rows; row += 2) mines.push(grid.index(cols - 1, row));
  const game = createGameWithMines({ graph: grid.graph, profile: 'minesweeper-online', mines, dimensions: { width: cols, height: rows } });
  const view = mountBoardView({ container: host, grid });
  globalThis.__view = view;
  view.setGame(game);
  view.update(game.reveal(0).changed);
  view.update(game.toggleFlag(grid.index(cols - 1, 0)).changed);
  if (scroll) view.scrollTo(scroll.x, scroll.y);
  const ctx = view.canvas.getContext('2d');
  const dpr = view.pixelRatio;
  const rgb = (x, y) => [...ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data.slice(0, 3)];
  const hex = (name) => { const v = token(name).trim(); return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  const centre = (c) => { const r = view.cellRect(c); return rgb(r.x + r.size / 2, r.y + r.size / 2); };
  const revealedZero = grid.index(0, rows - 1);
  return {
    layout: view.layout,
    scroll: view.scroll,
    canvas: { width: view.canvas.width, height: view.canvas.height },
    background: { want: hex('--color-board-frame'), got: rgb(1, 1) },
    revealed: { want: hex('--color-tile-revealed'), got: centre(revealedZero), cell: revealedZero, state: game.cellState(revealedZero) },
    closed: { want: hex('--color-tile-closed'), got: centre(grid.index(cols - 1, 1)) },
    topLeftCell: view.cellAt(1, 1),
    middle: (() => {
      const c = view.cellAt(view.layout.width / 2, view.layout.height / 2);
      return { state: game.cellState(c), number: game.cellNumber(c), got: centre(c) };
    })(),
  };
}

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);

test('in a browser, Beginner and Expert in both themes and a large scrolled custom board are drawn correctly', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-classic2d-view-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/dev/components.html`);
    // The host stands where the board sits in play: below the 64px bar, 16px from every edge.
    const area = { width: 1366 - 32, height: 768 - 96 - 16 };

    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      for (const [name, cols, rows] of [['beginner', 9, 9], ['expert', 30, 16]]) {
        const r = await page.evaluate(mountBoard, { cols, rows });
        const tile = Math.max(41, Math.floor(Math.min(area.width / cols, area.height / rows)));
        assert.equal(r.layout.tile, tile, `${theme} ${name}: tile ${tile}`);
        if (name === 'expert') assert.equal(r.layout.tile, 41, 'Expert gets the minimum tile');
        assert.equal(r.layout.scrolls, false, `${theme} ${name}: fits without scrolling`);
        assert.deepEqual(r.canvas, area, `${theme} ${name}: canvas fills the area`);
        assert.equal(r.revealed.state, 'revealed');
        assert.ok(near(r.revealed.got, r.revealed.want), `${theme} ${name}: revealed tile ${r.revealed.got} ~ ${r.revealed.want}`);
        assert.ok(near(r.closed.got, r.closed.want), `${theme} ${name}: closed tile ${r.closed.got} ~ ${r.closed.want}`);
        if (name === 'beginner') {
          assert.ok(near(r.background.got, r.background.want), `${theme}: background ${r.background.got} ~ ${r.background.want}`);
          assert.equal(r.topLeftCell, -1, 'the corner of a centred board is no cell');
        }
        const shot = await page.locator('#board-host').screenshot({ path: join(shots, `classic2d-${name}-${theme}.png`) });
        assert.ok(shot.length > 1000, `${theme} ${name}: screenshot taken`);
      }
    }

    // A theme change repaints through the skin's redraw callback.
    await page.evaluate(() => globalThis.msTheme.setTheme('light'));
    await page.evaluate(mountBoard, { cols: 9, rows: 9 });
    await page.evaluate(() => globalThis.msTheme.setTheme('dark'));
    const after = await page.evaluate(async () => {
      const { token } = await import('/js/tokens.js');
      const v = globalThis.__view;
      const r = v.cellRect(8 * 9);
      const d = v.canvas.getContext('2d').getImageData(Math.round(r.x + r.size / 2), Math.round(r.y + r.size / 2), 1, 1).data;
      const want = token('--color-tile-revealed').trim();
      return { got: [d[0], d[1], d[2]], want: [1, 3, 5].map((i) => parseInt(want.slice(i, i + 2), 16)) };
    });
    assert.ok(near(after.got, after.want), `repainted in the dark theme ${after.got} ~ ${after.want}`);

    // A large custom board keeps the minimum tile and scrolls by wheel, shift-drag and cursor follow.
    await page.evaluate(() => globalThis.msTheme.setTheme('light'));
    const big = await page.evaluate(mountBoard, { cols: 100, rows: 100, scroll: { x: 600, y: 900 } });
    assert.equal(big.layout.tile, 41);
    assert.equal(big.layout.scrolls, true);
    assert.deepEqual(big.scroll, { x: 600, y: 900 });
    assert.equal(big.topLeftCell, Math.floor(901 / 41) * 100 + Math.floor(601 / 41));
    assert.deepEqual([big.middle.state, big.middle.number], ['revealed', 0]);
    assert.ok(near(big.middle.got, big.revealed.want), `scrolled board drawn: ${big.middle.got} ~ ${big.revealed.want}`);
    const box = await page.locator('#board-host').boundingBox();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.wheel(0, 200);
    await page.waitForFunction(() => globalThis.__view.scroll.y === 1100);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 260, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    assert.deepEqual(await page.evaluate(() => globalThis.__view.scroll), { x: 650, y: 1140 }, 'shift-drag pans');
    const sample = await page.evaluate(() => {
      const v = globalThis.__view;
      v.ensureVisible(99 * 100 + 50);
      const r = v.cellRect(99 * 100 + 50);
      const d = v.canvas.getContext('2d').getImageData(Math.round(r.x + r.size / 2), Math.round(r.y + r.size / 2), 1, 1).data;
      return { rect: r, got: [d[0], d[1], d[2]], height: v.canvas.height };
    });
    assert.ok(sample.rect.y + 41 <= sample.height && sample.rect.y >= 0, 'the cursor cell is brought into view');
    assert.ok(near(sample.got, big.revealed.want), `bottom-row revealed tile drawn after scrolling ${sample.got}`);
    const shot = await page.locator('#board-host').screenshot({ path: join(shots, 'classic2d-custom-100x100-scrolled.png') });
    assert.ok(shot.length > 1000);

    // Resizing the window refits the board.
    await page.evaluate(mountBoard, { cols: 9, rows: 9 });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForFunction(() => globalThis.__view.layout.tile === Math.max(41, Math.floor(Math.min(768 / 9, 488 / 9))));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    rmSync(shots, { recursive: true, force: true });
  }
});
