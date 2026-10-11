// Watch replay (replay-playback): the results screen's Watch replay action — its presence rules in
// the results flow and the screen's content, the route it opens with the finished game's own replay
// and the results screen to return to, the #r-watch markup and its wiring in js/main.js — and in a
// browser a fixed Beginner board won through the real shell, watched from the results screen by
// mouse, keyboard and controller, then watched again from the Records screen's library view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resultsContent, createResultsView } from '../js/results/view.js';
import { createResultsFlow, RESULTS_SCREEN } from '../js/results/flow.js';
import { REPLAY_SCREEN } from '../js/records/replay-list.js';
import { createRouter } from '../js/shell/router.js';
import { createBoardIdentity } from '../js/records/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const summary = (over = {}) => ({
  id: 'g1', board: { ...BEGINNER }, outcome: 'won', elapsedMs: 47380, bbbv: 12, bbbvSolved: 12,
  clicks: { reveal: { effective: 14, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
  bbbvPerSecond: 12 / 47.38, efficiency: (100 * 12) / 14, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});
const sealed = () => ({ blob: new Uint8Array([1, 2, 3]), listing: { id: 'g1' } });
const fakeRecords = () => ({ record: () => null, available: () => true });
function fakeRouter(screens = ['results', 'records', REPLAY_SCREEN]) {
  const routes = [];
  return { routes, has: (n) => screens.includes(n), go: (n, o) => routes.push([n, o?.data]) };
}
const flowOver = ({ router = fakeRouter(), replays = null } = {}) => createResultsFlow({ records: fakeRecords(), replays, router, restart() {}, goMenu() {} });

// ---------------------------------------------------------------- presence rules

test('a finished game with its replay offers Watch replay', () => {
  const data = flowOver().finished(summary(), 'classic-2d', sealed());
  assert.equal(data.watch, true);
  assert.equal(resultsContent(data).watch, true);
});

test('a game whose replay was dropped shows no Watch replay', () => {
  const router = fakeRouter();
  const flow = flowOver({ router });
  const data = flow.finished(summary(), 'classic-2d', null);
  assert.equal(data.watch, false);
  assert.equal(resultsContent(data).watch, false);
  assert.equal(flowOver().finished(summary(), 'classic-2d').watch, false, 'no replay handed over');
  assert.equal(flowOver().finished(summary(), 'classic-2d', {}).watch, false, 'a replay without its blob');
  flow.watch();
  assert.deepEqual(router.routes.map(([n]) => n), ['results'], 'Watch does nothing without a replay');
});

test('without the replay viewer\'s route there is no Watch replay', () => {
  const router = fakeRouter(['results', 'records']);
  const flow = flowOver({ router });
  assert.equal(flow.finished(summary(), 'classic-2d', sealed()).watch, false);
  flow.watch();
  assert.deepEqual(router.routes.map(([n]) => n), ['results']);
});

test('the content carries no Watch replay unless it is offered', () => {
  assert.equal(resultsContent({ summary: summary() }).watch, false);
  assert.equal(resultsContent({ summary: summary(), watch: true }).watch, true);
});

test('Watch replay plays the finished game\'s own replay, saved or not, and returns to the results screen', async () => {
  const router = fakeRouter();
  const replays = { load: () => Promise.resolve(), add: () => Promise.reject(new Error('not saved')) };
  const flow = flowOver({ router, replays });
  const replay = sealed();
  const errors = console.error;
  console.error = () => {};
  try {
    flow.finished(summary(), 'classic-2d', replay);
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    console.error = errors;
  }
  flow.watch();
  const [screen, data] = router.routes.at(-1);
  assert.equal(screen, REPLAY_SCREEN);
  assert.equal(data.replay, replay, 'the replay from the hand-off, not the library');
  assert.equal(data.replayId, undefined);
  assert.deepEqual(data.returnTo, { screen: RESULTS_SCREEN });
});

test('Back from the viewer returns to the results screen, shown again from the flow', () => {
  const shown = [];
  let flow;
  const router = createRouter({
    screens: {
      menu: { show() {} },
      results: { show: (d) => shown.push(d ?? flow.current) },
      [REPLAY_SCREEN]: { show: (d) => shown.push(d), back: () => router.go(shown.at(-1).returnTo.screen, { data: shown.at(-1).returnTo.data }) },
    },
  });
  flow = createResultsFlow({ records: fakeRecords(), router, restart() {}, goMenu() {} });
  router.go('menu');
  const data = flow.finished(summary(), 'classic-2d', sealed());
  flow.watch();
  assert.equal(router.current, REPLAY_SCREEN);
  assert.equal(router.back('key'), true);
  assert.equal(router.current, 'results');
  assert.equal(shown.at(-1), data, 'the same results again');
  assert.deepEqual(router.stack, ['menu'], 'Back unwound to the results screen, not stacked it again');
});

// ---------------------------------------------------------------- the view

function fakeRoot() {
  const els = {};
  const el = (id) => {
    if (els[id]) return els[id];
    const classes = new Set(id === 'r-watch' ? ['hidden'] : []);
    const listeners = {};
    const kids = {};
    const node = {
      id, textContent: '', listeners,
      classList: {
        toggle: (c, on) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); },
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      toggleAttribute() {},
      querySelector: (sel) => (kids[sel] ??= el(`${id} ${sel}`)),
    };
    els[id] = node;
    return node;
  };
  return { el, querySelector: (sel) => el(sel.replace(/^#/, '')), classList: el('root').classList };
}

test('the view shows Watch replay only when the content offers it, and calls back on it', () => {
  const root = fakeRoot();
  const asked = [];
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {}, onWatch: () => asked.push('watch') });
  view.show(resultsContent({ summary: summary(), watch: true }));
  assert.equal(root.el('r-watch').classList.contains('hidden'), false);
  root.el('r-watch').listeners.click();
  assert.deepEqual(asked, ['watch']);
  view.show(resultsContent({ summary: summary(), watch: false }));
  assert.equal(root.el('r-watch').classList.contains('hidden'), true);
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RESULTS_HTML = INDEX.slice(INDEX.indexOf('<section id="results"'), INDEX.indexOf('<!-- /Results -->'));

test('Watch replay sits beside Play again, a kit button hidden until offered', () => {
  const buttons = [...RESULTS_HTML.matchAll(/<button type="button" id="(r-[a-z]+)" class="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(buttons.slice(0, 2), [
    ['r-again', 'ui-button ui-button--primary', 'Play again'],
    ['r-watch', 'ui-button ui-button--secondary hidden', 'Watch replay'],
  ]);
});

test('the shell wires Watch replay to the flow and registers the viewer under the route it opens', () => {
  assert.match(MAIN, /onWatch: \(\) => RESULTS\.watch\(\)/);
  assert.match(MAIN, /\[REPLAY_SCREEN\]: \{/);
  assert.equal(REPLAY_SCREEN, 'replay');
});

// ---------------------------------------------------------------- in a browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
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

test('in a browser, a just-won 2D game is watched from the results screen and again from the Records screen', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fixed board: every board seed the session draws is 12345. A fake standard controller,
    // idle until pressed, for the controller's turn.
    await page.addInitScript(() => {
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
      const pad = {
        id: 'Fake pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        axes: [0, 0, 0, 0],
      };
      globalThis.__fakePad = pad;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const frames = (n) => page.evaluate((count) => new Promise((done) => {
      const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
      step(count);
    }), n);
    // Holds a controller button for exactly one poll, then waits two frames (as tests/shell-menu.test.mjs).
    const press = async (b) => {
      await page.evaluate((i) => new Promise((done) => {
        const set = (v) => {
          Object.assign(globalThis.__fakePad.buttons[i], { pressed: v, touched: v, value: v ? 1 : 0 });
          globalThis.__fakePad.timestamp++;
        };
        set(true);
        requestAnimationFrame(() => { set(false); done(); });
      }), b);
      await frames(2);
    };
    const PAD = { A: 0, B: 1, RIGHT: 15 };
    const viewer = () => page.evaluate(() => globalThis.__ms.replayViewer.state.status);
    const visible = (id) => page.evaluate((i) => {
      const el = document.getElementById(i);
      return !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0;
    }, id);

    await page.click('#menu-entry-classic-2d');
    if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
    await page.click('#c2d-choice [data-size="beginner"]');
    const centres = await page.evaluate(async () => {
      const { boardLayout } = await import('/js/classic2d/board-view.js');
      const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const L = boardLayout({ cols: 9, rows: 9, width: r.width, height: r.height });
      return Array.from({ length: 81 }, (_, c) => ({
        x: r.left + L.offsetX + ((c % 9) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / 9) + 0.5) * L.tile,
      }));
    });
    const first = 40;
    const mines = await page.evaluate(async (fc) => {
      const { generate } = await import('/js/generation/generate.js');
      const r = generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: fc, noGuess: false, seed: 12345 });
      return [...r.mines];
    }, first);
    await page.mouse.click(centres[first].x, centres[first].y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    for (let c = 0; c < 81 && (await mode()) === 'classic-2d'; c++) {
      if (mines.includes(c)) continue;
      await page.mouse.click(centres[c].x, centres[c].y);
    }
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');

    // Watch replay shows beside Play again; the mouse opens the viewer on the game just played.
    assert.equal(await visible('r-watch'), true, 'Watch replay is offered');
    await page.click('#r-watch');
    assert.equal(await mode(), 'replay');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    const played = await page.evaluate(() => globalThis.__ms.replayViewer.state);
    assert.equal(played.time, 0, 'it starts at the beginning');
    assert.ok(played.duration > 0);
    await page.keyboard.press('End');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended);
    assert.match(await page.evaluate(() => document.getElementById('replay-end').textContent), /won/i);

    // Back returns to the results screen of the same game.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'results');
    assert.equal(await viewer(), 'closed');
    assert.equal(await page.evaluate(() => document.getElementById('results-title').textContent), 'You won!');
    assert.equal(await visible('r-watch'), true);
    assert.equal(await visible('c2d'), true, 'the finished board is still behind the results screen');

    // The keyboard reaches it too: Tab from Play again, Enter.
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-again');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-watch');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'replay');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    await page.click('#rp-back');
    assert.equal(await mode(), 'results');

    // And the controller: right from Play again, A opens the viewer, B comes back.
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-again');
    await press(PAD.RIGHT);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-watch');
    await press(PAD.A);
    assert.equal(await mode(), 'replay');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    await press(PAD.B);
    assert.equal(await mode(), 'results');

    // From the Records screen's library view: Watch on the kept replay, on the best and on the
    // recent game opens the viewer by id; Back returns to Records on the same board.
    await page.click('#r-records');
    assert.equal(await mode(), 'records');
    const id = await page.evaluate(() => document.querySelector('#records-replays-body button[data-act="watch"]')?.dataset.id);
    assert.ok(id, 'the game\'s replay is kept and offers Watch');
    for (const selector of [`#records-replays-body button[data-act="watch"][data-id="${id}"]`, `#rec-time [data-watch="${id}"]`, `#records-games-body [data-watch="${id}"]`]) {
      await page.click(selector);
      assert.equal(await mode(), 'replay', selector);
      await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
      await page.keyboard.press('Escape');
      assert.equal(await mode(), 'records', selector);
      assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Beginner', 'on the same board');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
