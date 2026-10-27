// The game windows against the available area at the desktop host: a Classic 2D, Hexagon or Triangle window
// laid out in a work area larger than the window takes the board extent a browser window of the work area's size
// gives it, and 3D play, its ready card and the 3D overlay fill the available area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSuite } from './helpers/browser.mjs';

const suite = browserSuite();

const WORK_AREA = { width: 1920, height: 1040 };
const SMALL_WINDOW = { width: 1000, height: 700 };

// A desktop host for the page: the bridge the platform layer looks for, inert, and a work area of `area`.
const desktopHost = (area) => {
  Object.defineProperty(Screen.prototype, 'availWidth', { configurable: true, get: () => area.width });
  Object.defineProperty(Screen.prototype, 'availHeight', { configurable: true, get: () => area.height });
  Object.defineProperty(Screen.prototype, 'width', { configurable: true, get: () => area.width });
  Object.defineProperty(Screen.prototype, 'height', { configurable: true, get: () => area.height + 40 });
  const off = () => () => {};
  globalThis.ms3dHost = {
    steam: { state: () => new Promise(() => {}) },
    quit: { handshake: () => Promise.resolve() },
    window: { minimise: async () => {}, toggleFullscreen: async () => {}, setContentSize: async () => {} },
    events: { steamStateChanged: off, overlayActivated: off, flushRequested: off, fullscreenChanged: off },
  };
};
const noWebGL = () => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) { return type === 'webgl2' ? null : get.call(this, type, ...rest); };
};

/** A page at `viewport`, on the desktop host with a work area of `area` when given, at the menu. */
async function openPage(browser, base, viewport, area) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (area) await page.addInitScript(desktopHost, area);
  return { context, page, errors, ready: async (init) => {
    if (init) await page.addInitScript(init);
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
  } };
}

/** Starts the flat mode `mode` on `board` and returns its game window once the board area holds still. */
async function flatWindow(page, mode, board) {
  await page.evaluate(async ([m, b]) => {
    const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
    while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
    await document.fonts.ready;
    globalThis.__ms.modes.start(m, b);
  }, [mode, board]);
  const settle = () => page.waitForFunction(() => {
    const now = JSON.stringify([document.getElementById('c2d-stage').getBoundingClientRect(), globalThis.__ms.board2D?.layout]);
    const same = globalThis.__lastStage === now;
    globalThis.__lastStage = now;
    return same && !!globalThis.__ms.board2D;
  }, null, { polling: 'raf' });
  await settle();
  // The first-use hint strips dismissed, one after the other.
  for (let i = 0; i < 4 && await page.evaluate(() => !document.getElementById('hint-strip').classList.contains('hidden')); i++) {
    await page.evaluate(() => document.getElementById('hint-strip-close').click());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  await settle();
  return page.evaluate(() => {
    const size = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
    const { tile, scrolls } = globalThis.__ms.board2D.layout;
    return { stage: size(document.getElementById('c2d-stage')), frame: size(document.getElementById('c2d-frame')), tile, scrolls: !!scrolls };
  });
}

const FLAT = [
  ['classic-2d', { size: 'expert', noGuess: false }],
  ['hexagon', { size: 'expert', noGuess: false }],
  ['triangle', { size: 'expert', noGuess: false }],
];

test('in a browser, on the desktop host a game window laid out in a work area larger than the window gets the board extent a browser window of the work area\'s size gives it', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const [mode, board] of FLAT) {
      const web = await openPage(browser, base, WORK_AREA, null);
      await web.ready(noWebGL);
      const want = await flatWindow(web.page, mode, board);
      assert.deepEqual(web.errors, []);
      await web.context.close();

      const desk = await openPage(browser, base, SMALL_WINDOW, WORK_AREA);
      await desk.ready(noWebGL);
      assert.deepEqual(await desk.page.evaluate(() => { const r = document.documentElement.getBoundingClientRect(); return [r.width, r.height]; }), [WORK_AREA.width, WORK_AREA.height], 'the root area is the work area');
      const got = await flatWindow(desk.page, mode, board);
      assert.deepEqual(got, want, `${mode}: the board, its tile and its window as in a browser window of the work area's size, not the ${SMALL_WINDOW.width} × ${SMALL_WINDOW.height} window's`);
      assert.ok(got.stage[0] > SMALL_WINDOW.width || got.stage[1] > SMALL_WINDOW.height || got.frame[0] > SMALL_WINDOW.width || got.frame[1] > SMALL_WINDOW.height, `${mode}: the window larger than the small window it would have fitted (${got.frame})`);
      assert.deepEqual(desk.errors, []);
      await desk.context.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, on the desktop host 3D play, its ready card, the 3D overlay and the Learn 3D layout fill the available area, not the window', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const desk = await openPage(browser, base, SMALL_WINDOW, WORK_AREA);
    await desk.ready();
    const { page } = desk;
    const box = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }, sel);
    await page.evaluate(() => globalThis.__ms.modes.start('3d', { X: 8, Y: 8, Z: 8, mines: 40 }));
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.deepEqual(await box('#ready'), [0, 0, WORK_AREA.width, WORK_AREA.height], 'the ready layer covers the work area');
    assert.equal(await page.evaluate(() => document.querySelector('#ready > .ready-body').offsetWidth), 640, 'the ready card at the desktop step\'s width');
    await page.evaluate(() => globalThis.__ms.forcePlay());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.deepEqual(await box('#hud'), [0, 0, WORK_AREA.width, WORK_AREA.height], 'the 3D overlay covers the work area');
    const counters = await box('#hud-counters');
    assert.ok(Math.abs(counters[0] + counters[2] / 2 - WORK_AREA.width / 2) <= 1, `the counters centred across the work area (${counters})`);
    assert.deepEqual(desk.errors, []);
    await desk.context.close();

    // Learn 3D's own layout over the same work area.
    const learn = await openPage(browser, base, SMALL_WINDOW, WORK_AREA);
    await learn.ready();
    await learn.page.evaluate(() => { globalThis.__ms.learn(); globalThis.__ms.forcePlay(); });
    await learn.page.waitForFunction(() => globalThis.__ms.state.mode === 'playing' && document.getElementById('hud').classList.contains('hud--learn'));
    await learn.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const hud = await learn.page.evaluate(() => { const r = document.getElementById('hud').getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; });
    assert.deepEqual(hud, [0, 0, WORK_AREA.width, WORK_AREA.height], 'the Learn 3D layout covers the work area');
    assert.deepEqual(learn.errors, []);
    await learn.context.close();
  } finally {
    await browser.close();
  }
});
