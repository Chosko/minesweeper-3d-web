// Shared helpers for the enthusiast-loop review scripts.
import { generate } from '/home/user/minesweeper-3d-web/js/generation/generate.js';

export const DIR = '/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/enthusiast-loop';
export const URL = 'http://127.0.0.1:8080/index.html';
export const PROFILE = `${DIR}/profile`;

export async function launch({ viewport = { width: 1280, height: 800 }, fresh = false } = {}) {
  const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
  const { chromium } = pw.default ?? pw;
  if (fresh) { const fs = await import('node:fs'); fs.rmSync(PROFILE, { recursive: true, force: true }); }
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: true, viewport, deviceScaleFactor: 1,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  // Seed override: when globalThis.__forcedSeed is a number, every 1-element Uint32Array draw returns it.
  await context.addInitScript(() => {
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (a) => {
      if (a instanceof Uint32Array && a.length === 1 && typeof globalThis.__forcedSeed === 'number') { a[0] = globalThis.__forcedSeed; return a; }
      return real(a);
    };
  });
  return context;
}

export async function openPage(context) {
  const page = context.pages()[0] ?? await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`); });
  await page.goto(URL);
  await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: 30000 });
  page.errors = errors;
  return page;
}

export const mode = (page) => page.evaluate(() => globalThis.__ms.state.mode);
export const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png` });
export const setSeed = (page, seed) => page.evaluate((s) => { globalThis.__forcedSeed = s; }, seed);

/** Cell centres (page coordinates) of the Classic 2D board canvas. */
export async function centres2D(page, cols, rows) {
  return page.evaluate(async ({ cols, rows }) => {
    const { boardLayout } = await import('/js/classic2d/board-view.js');
    const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
    const L = boardLayout({ cols, rows, width: r.width, height: r.height });
    return Array.from({ length: cols * rows }, (_, c) => ({
      x: r.left + L.offsetX + ((c % cols) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / cols) + 0.5) * L.tile,
    }));
  }, { cols, rows });
}

/** Mines of the square board the game will build for (seed, firstClick). Computed in Node. */
export function mines2D({ width, height, mines, firstClick, noGuess, seed }) {
  const t0 = performance.now();
  const r = generate({ graph: { kind: 'square', width, height }, mineCount: mines, firstClick, noGuess, seed });
  return { ok: r.ok, mines: r.ok ? [...r.mines] : null, reason: r.reason, ms: performance.now() - t0, attempts: r.attempts };
}

/** Board analysis: numbers, openings and 3BV, computed independently of the game's engine. */
export function analyse({ width, height, mines }) {
  const n = width * height, mine = new Uint8Array(n), num = new Int8Array(n);
  for (const m of mines) mine[m] = 1;
  const nb = (c) => {
    const x = c % width, y = Math.floor(c / width), out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const X = x + dx, Y = y + dy;
      if (X >= 0 && X < width && Y >= 0 && Y < height) out.push(Y * width + X);
    }
    return out;
  };
  for (let c = 0; c < n; c++) num[c] = mine[c] ? -1 : nb(c).filter((d) => mine[d]).length;
  const opening = new Int32Array(n).fill(-1); // opening id per cell (zeros and the numbers around them)
  let openings = 0;
  const openingCells = [];
  for (let c = 0; c < n; c++) {
    if (num[c] !== 0 || opening[c] !== -1) continue;
    const id = openings++, stack = [c], cells = [];
    opening[c] = id;
    while (stack.length) {
      const k = stack.pop(); cells.push(k);
      for (const d of nb(k)) {
        if (opening[d] === -1 && num[d] >= 0) { opening[d] = id; if (num[d] === 0) stack.push(d); }
      }
    }
    openingCells.push(cells);
  }
  let isolated = 0; const isolatedCells = [];
  for (let c = 0; c < n; c++) if (num[c] > 0 && opening[c] === -1) { isolated++; isolatedCells.push(c); }
  return { n, mine, num, nb, opening, openings, openingCells, isolated, isolatedCells, bbbv: openings + isolated };
}

/** The cells to left-click for a 100%-efficiency NF win: one zero per opening, then every isolated number. */
export function nfPlan(a, firstClick) {
  const plan = [];
  const seen = new Set();
  if (a.num[firstClick] === 0) seen.add(a.opening[firstClick]);
  for (let id = 0; id < a.openings; id++) {
    if (seen.has(id)) continue;
    const zero = a.openingCells[id].find((c) => a.num[c] === 0);
    plan.push(zero);
  }
  for (const c of a.isolatedCells) if (c !== firstClick) plan.push(c);
  return plan;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readResults(page) {
  return page.evaluate(() => {
    const t = (id) => document.getElementById(id)?.textContent.trim();
    const v = (id) => document.querySelector(`#${id} .ui-stat__value`)?.textContent.trim();
    const d = (id) => document.querySelector(`#${id} .ui-stat__detail`)?.textContent.trim();
    const vis = (id) => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; };
    return {
      title: t('results-title'), board: t('results-board'), time: v('rs-time'), bbbv: v('rs-bbbv'), bbbvSolved: vis('rs-bbbvSolved') ? v('rs-bbbvSolved') : null,
      rate: v('rs-bbbvPerSecond'), efficiency: v('rs-efficiency'), bestsShown: vis('results-bests'),
      bestTime: v('rb-time'), bestTimeDetail: d('rb-time'), bestRate: v('rb-bbbvPerSecond'), bestRateDetail: d('rb-bbbvPerSecond'),
      bestEff: v('rb-efficiency'), bestEffDetail: d('rb-efficiency'), note: t('results-note'), noteVisible: vis('results-note'),
      watch: vis('r-watch'), focus: document.activeElement?.id, text: document.getElementById('results').innerText,
    };
  });
}

/**
 * Fast in-page play: dispatches the DOM mouse events the board listens to (mousedown on the canvas,
 * mouseup bubbling to window), `delayMs` apart. actions: [{ c, kind: 'left' | 'right' | 'chord' | 'middle' }].
 */
export async function fastPlay(page, centres, actions, { delayMs = 70 } = {}) {
  return page.evaluate(async ({ centres, actions, delayMs }) => {
    const canvas = document.querySelector('#c2d-board canvas');
    const fire = (type, x, y, button) => canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, buttons: button === 0 ? 1 : button === 2 ? 2 : 4 }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let done = 0;
    for (const a of actions) {
      if (globalThis.__ms.state.mode !== 'classic-2d') break;
      const { x, y } = centres[a.c];
      fire('mousemove', x, y, 0);
      if (a.kind === 'left') { fire('mousedown', x, y, 0); fire('mouseup', x, y, 0); }
      else if (a.kind === 'middle') { fire('mousedown', x, y, 1); fire('mouseup', x, y, 1); }
      else if (a.kind === 'right') { fire('mousedown', x, y, 2); fire('mouseup', x, y, 2); }
      else if (a.kind === 'chord') { fire('mousedown', x, y, 0); fire('mousedown', x, y, 2); fire('mouseup', x, y, 0); fire('mouseup', x, y, 2); }
      done++;
      await wait(delayMs);
    }
    return done;
  }, { centres, actions, delayMs });
}
