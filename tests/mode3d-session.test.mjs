// The 3D game session (js/mode3d/session.js): the 3D game on the shared engine (create3DGame) and
// the session from a closed box to a result over a fake generation client and a fake clock — the
// first reveal's board request, the "generating" state, flags before the first reveal, the timer,
// the no-guess failure, pause, restart and leave. Plus the generator's box graph description, the
// old best times left alone, and one Playwright game on a preset through the worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createSession, create3DGame, SESSION_STATE, FAILURE_OFFERS, GENERATING_DELAY_MS,
} from '../js/mode3d/session.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { PHASE } from '../js/engine/rules.js';
import { generate, boardGraph } from '../js/generation/generate.js';
import { handleMessage } from '../js/generation/worker.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { PRESETS, boardOf, DEFAULT_CHOICE } from '../js/mode3d/board-choice.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

// ---------- fakes ----------

function fakeClock(start = 1000) {
  let t = start;
  let nextHandle = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const h = nextHandle++; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout(h) { timers.delete(h); },
    advance(ms) {
      t += ms;
      for (const [h, timer] of [...timers]) {
        if (timer.at <= t) { timers.delete(h); timer.fn(); }
      }
    },
  };
}

// A generation client whose requests wait until the test answers them, the way the worker would.
function fakeClient() {
  const requests = [];
  let inFlight = null;
  const client = {
    requests,
    cancels: 0,
    request(req) {
      if (inFlight) client.cancel();
      return new Promise((resolve, reject) => {
        inFlight = { req, resolve, reject };
        requests.push(inFlight);
      });
    },
    cancel() {
      client.cancels += 1;
      const p = inFlight;
      inFlight = null;
      p?.resolve({ ok: false, cancelled: true, reason: 'cancelled' });
    },
    /** Answer the newest request with the generator's own result. */
    answer(result) {
      const p = requests.at(-1);
      if (inFlight === p) inFlight = null;
      p.resolve(result ?? handleMessage({ id: 1, request: p.req }).result);
    },
    fail(error) {
      const p = requests.at(-1);
      if (inFlight === p) inFlight = null;
      p.reject(error);
    },
  };
  return client;
}

const BOARD = { X: 4, Y: 4, Z: 2, mines: 6, noGuess: false };
// 5 x 1 x 1 with mines at both ends: cells 1 and 3 show a 1, cell 2 is a zero
const ROW = { X: 5, Y: 1, Z: 1, mines: 2, noGuess: false };
const ROW_BOARD = Object.freeze({ ok: true, mines: Int32Array.of(0, 4), seed: 41, generatorVersion: GENERATOR_VERSION });

function sessionOf(board = BOARD, over = {}) {
  const clock = fakeClock();
  const client = fakeClient();
  let nextSeed = 41;
  const events = [];
  const session = createSession({ board, client, clock, randomSeed: () => nextSeed++, ...over });
  for (const type of ['generating', 'started', 'failed', 'finished']) session.on(type, (e) => events.push([type, e]));
  return { session, client, clock, events, types: () => events.map(([t]) => t) };
}

const tick = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------- the 3D game on the shared engine

test('a 3D game from a mine count awaits the first click: its first reveal asks for a board and changes nothing', () => {
  const d = create3DGame({ X: 4, Y: 3, Z: 2, mines: 6 });
  const { view } = d;
  assert.equal(view.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.equal(view.state, 'playing');
  assert.equal(d.mines, 6);
  const first = view.idx(1, 1, 1);
  const r = d.reveal(first);
  assert.equal(r.boardNeeded, first, 'the board request for the clicked cell');
  assert.equal(r.revealed, 0);
  assert.equal(view.phase, PHASE.AWAITING_FIRST_CLICK, 'no board is placed by the game itself');
  assert.equal(view.version, 0);
});

// ---------------------------------------------------------------- the generator's box graph

test('the generator takes the box graph description, with the same cell layout as the session', () => {
  const box = createBoxGrid(5, 4, 3);
  const g = boardGraph({ kind: 'box', X: 5, Y: 4, Z: 3 });
  assert.equal(g.count, box.graph.count);
  for (const c of [0, 7, 31, 59]) {
    assert.equal(g.degree(c), box.graph.degree(c));
    for (let k = 0; k < g.degree(c); k++) assert.equal(g.neighbour(c, k), box.graph.neighbour(c, k));
  }
  assert.throws(() => boardGraph({ kind: 'box', X: 0, Y: 4, Z: 3 }), RangeError);
});

test('a box board request keeps the first-click cell alone mine-free, up to every cell but one', () => {
  const graph = { kind: 'box', X: 3, Y: 3, Z: 3 };
  for (let seed = 1; seed <= 20; seed++) {
    const r = generate({ graph, mineCount: 10, firstClick: 13, noGuess: false, seed });
    assert.equal(r.ok, true);
    assert.equal(r.mines.length, 10);
    assert.ok(!Array.from(r.mines).includes(13), 'the clicked cell is safe');
  }
  const dense = generate({ graph, mineCount: 26, firstClick: 0, noGuess: false, seed: 9 });
  assert.equal(dense.ok, true, 'the mine cap of every cell but one never fails');
  assert.deepEqual(Array.from(dense.mines), Array.from({ length: 26 }, (_, i) => i + 1));
  const reply = handleMessage({ id: 3, request: { graph, mineCount: 5, firstClick: 4, noGuess: true, seed: 7 } });
  assert.equal(reply.id, 3);
  assert.equal(typeof reply.result.ok, 'boolean', 'the worker answers a no-guess box request');
});

// ---------------------------------------------------------------- the session

test('the session opens a closed box awaiting its first click, from the board choice', () => {
  const choice = boardOf(DEFAULT_CHOICE);
  const { session } = sessionOf(choice);
  const v = session.view;
  assert.equal(session.state, SESSION_STATE.READY);
  assert.deepEqual([v.X, v.Y, v.Z, v.n], [8, 8, 2, 128]);
  assert.equal(v.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.equal(v.state, 'playing');
  assert.equal(v.minesLeft, 10);
  assert.ok(Array.from(v.pressed).every((x) => x === 0), 'the box is closed');
  assert.equal(session.seed, null);
  assert.equal(session.generatorVersion, null);
  assert.equal(session.seconds(), 0);
  assert.throws(() => createSession({ board: { X: 2, Y: 2, Z: 2, mines: 8 }, client: fakeClient() }), RangeError);
});

test('the first reveal asks the worker for a board around that cell, with the no-guess setting', async () => {
  const { session, client, types } = sessionOf({ ...BOARD, noGuess: true });
  const first = session.view.idx(1, 2, 1);
  const pending = session.reveal(first);
  assert.ok(pending instanceof Promise, 'the first reveal waits for its board');
  assert.equal(session.state, SESSION_STATE.GENERATING);
  assert.deepEqual(client.requests[0].req, {
    graph: { kind: 'box', X: 4, Y: 4, Z: 2 }, mineCount: 6, firstClick: first, noGuess: true, seed: 41,
  });
  assert.deepEqual(types(), [], 'nothing has started');
  client.answer(generate({ ...client.requests[0].req, noGuess: false }));
  const r = await pending;
  assert.ok(r && !r.exploded, 'the first click is safe');
  assert.equal(session.view.pressed[first], 1, 'the reveal is applied to the board');
  assert.equal(session.state === SESSION_STATE.PLAYING || session.state === SESSION_STATE.WON, true);
  assert.equal(session.seed, 41, 'the seed is kept');
  assert.equal(session.generatorVersion, GENERATOR_VERSION, 'the generator version is kept');
  assert.equal(types()[0], 'started');
});

test('while generating, the session shows the "generating" state after its delay and accepts no board action', async () => {
  const { session, client, clock, events } = sessionOf();
  const c = session.view.idx(0, 0, 0);
  const pending = session.reveal(c);
  clock.advance(GENERATING_DELAY_MS - 1);
  assert.equal(session.generatingShown, false, 'a quick answer shows no "generating" state');
  clock.advance(1);
  assert.equal(session.generatingShown, true);
  assert.deepEqual(events.at(-1), ['generating', { shown: true }]);
  const v0 = session.view.version;
  assert.equal(session.reveal(session.view.idx(3, 3, 1)), null);
  assert.equal(session.toggleFlag(session.view.idx(3, 3, 1)), null);
  assert.equal(session.chord(c), null);
  assert.equal(session.view.version, v0, 'no action reached the box');
  assert.equal(client.requests.length, 1);
  client.answer();
  await pending;
  assert.equal(session.generatingShown, false);
  assert.deepEqual(events.filter(([t]) => t === 'generating').map(([, e]) => e.shown), [true, false]);
});

test('the timer starts when the board arrives, shows whole seconds and stops at the end', async () => {
  // 5 x 1 x 1, mines at both ends: cell 1 shows a 1, cell 2 opens the rest
  const { session, client, clock, types } = sessionOf(ROW);
  const pending = session.reveal(1);
  clock.advance(5000);
  assert.equal(session.seconds(), 0, 'no time runs while the board is generated');
  client.answer(ROW_BOARD);
  await pending;
  assert.equal(session.state, SESSION_STATE.PLAYING);
  clock.advance(1999);
  assert.equal(session.seconds(), 1);
  assert.equal(session.elapsedMs(), 1999);
  const r = session.reveal(2);
  assert.equal(r.ended, true);
  assert.equal(session.state, SESSION_STATE.WON);
  assert.deepEqual(types(), ['generating', 'generating', 'started', 'finished']);
  clock.advance(10000);
  assert.equal(session.seconds(), 1, 'the timer stopped at the win');
  assert.equal(session.reveal(1), null, 'a finished game accepts no action');
});

test('a loss stops the timer too', async () => {
  const { session, client, clock, events } = sessionOf(ROW);
  const pending = session.reveal(1);
  client.answer(ROW_BOARD);
  await pending;
  clock.advance(3200);
  const r = session.reveal(4);
  assert.equal(r.exploded, true);
  assert.equal(session.state, SESSION_STATE.LOST);
  assert.deepEqual(events.at(-1), ['finished', { state: 'lost' }]);
  clock.advance(5000);
  assert.equal(session.seconds(), 3);
});

test('flags placed before the first reveal are kept, and neither they nor a chord start anything', async () => {
  // 5 x 1 x 1, the mine at cell 4: flag cell 1 first, then reveal cell 0 — the zero flood stops at the flag
  const { session, client, types } = sessionOf({ X: 5, Y: 1, Z: 1, mines: 1, noGuess: false });
  const v = session.view;
  const v0 = v.version;
  const r = session.toggleFlag(1);
  assert.deepEqual([r.flagged, r.unflagged, r.revealed], [1, 0, 0]);
  assert.equal(v.flagged[1], 1, 'the flag shows on the closed box');
  assert.equal(v.minesLeft, 0);
  assert.ok(v.version > v0, 'the flag reached the view');
  assert.deepEqual(Array.from(v.consumeDirty()), [1]);
  session.toggleFlag(3);
  session.toggleFlag(3); // placed and removed again
  assert.equal(v.flagged[3], 0);
  assert.equal(v.minesLeft, 0);

  const onFlag = session.reveal(1);
  assert.equal(onFlag.revealed, 0, 'a left release on a flagged cell does nothing');
  assert.equal(session.chord(0).revealed, 0, 'a chord before the first reveal does nothing');
  assert.equal(session.state, SESSION_STATE.READY, 'neither asks for a board');
  assert.equal(client.requests.length, 0);
  assert.equal(session.seconds(), 0);
  assert.deepEqual(types(), []);

  const pending = session.reveal(0);
  assert.equal(client.requests[0].req.firstClick, 0);
  client.answer({ ok: true, mines: Int32Array.of(4), seed: 41, generatorVersion: GENERATOR_VERSION });
  await pending;
  assert.equal(v.flagged[1], 1, 'the flag is kept once the board arrives');
  assert.equal(v.flagged[3], 0);
  assert.deepEqual(Array.from(v.pressed), [1, 0, 0, 0, 0], 'the flood stops at the flag');
  assert.equal(v.minesLeft, 0);
  assert.ok(v.dirty.includes(0));
});

test('a pause during generation keeps the request running and the timer unstarted', async () => {
  const { session, client, clock } = sessionOf(ROW);
  const pending = session.reveal(1);
  session.pause();
  assert.equal(session.paused, true);
  assert.equal(client.cancels, 0, 'the request keeps running');
  assert.equal(session.state, SESSION_STATE.GENERATING);
  client.answer(ROW_BOARD);
  await pending;
  assert.equal(session.state, SESSION_STATE.PLAYING);
  clock.advance(4000);
  assert.equal(session.elapsedMs(), 0, 'the board arrived while paused: the timer waits for the resume');
  assert.equal(session.reveal(2), null, 'a paused game accepts no action');
  session.resume();
  clock.advance(1500);
  assert.equal(session.seconds(), 1);
});

test('restart and leave cancel a pending generation, and a late answer is dropped', async () => {
  for (const end of ['restart', 'leave']) {
    const { session, client, clock, types } = sessionOf();
    const pending = session.reveal(0);
    clock.advance(GENERATING_DELAY_MS);
    assert.equal(session.generatingShown, true);
    session[end]();
    assert.equal(client.cancels, 1, `${end} cancels the request`);
    assert.equal(await pending, null);
    assert.equal(session.generatingShown, false);
    assert.equal(session.state, end === 'restart' ? SESSION_STATE.READY : SESSION_STATE.LEFT);
    if (end === 'restart') {
      assert.equal(session.view.phase, PHASE.AWAITING_FIRST_CLICK, 'a fresh closed box');
      assert.equal(session.seed, null);
    }
    assert.deepEqual(types().filter((t) => t !== 'generating'), [], `${end}: nothing started`);
  }
  // a stale answer delivered after a leave changes nothing
  const { session, client } = sessionOf();
  const pending = session.reveal(0);
  const stale = client.requests[0];
  session.leave();
  stale.resolve(handleMessage({ id: 1, request: stale.req }).result);
  assert.equal(await pending, null);
  assert.equal(session.state, SESSION_STATE.LEFT);
  assert.equal(session.view.phase, PHASE.AWAITING_FIRST_CLICK);
});

test('restart after a started game opens a fresh closed box with its flags cleared', async () => {
  const { session, client } = sessionOf({ X: 5, Y: 1, Z: 1, mines: 1, noGuess: false });
  session.toggleFlag(4);
  const pending = session.reveal(0);
  client.answer({ ok: true, mines: Int32Array.of(4), seed: 41, generatorVersion: GENERATOR_VERSION });
  await pending;
  session.restart();
  assert.equal(session.state, SESSION_STATE.READY);
  assert.deepEqual(Array.from(session.view.flagged), [0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(session.view.pressed), [0, 0, 0, 0, 0]);
  assert.equal(session.view.minesLeft, 1);
  assert.equal(session.seconds(), 0);
});

test('a no-guess board not found is handled as Classic 2D handles it: Retry, or a standard board', async () => {
  const { session, client, events } = sessionOf({ ...BOARD, noGuess: true });
  const pending = session.reveal(5);
  client.answer({ ok: false, reason: 'no candidate', seed: 41, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  assert.equal(await pending, null);
  assert.equal(session.state, SESSION_STATE.FAILED);
  assert.deepEqual(FAILURE_OFFERS, ['retry', 'standard']);
  assert.deepEqual(events.at(-1), ['failed', { reason: 'no candidate', offers: ['retry', 'standard'] }]);
  assert.equal(session.seconds(), 0, 'the timer never started');
  assert.equal(session.reveal(6), null, 'a failed board takes no action');

  const again = session.retry();
  assert.equal(session.state, SESSION_STATE.GENERATING);
  assert.deepEqual(client.requests[1].req, { ...client.requests[0].req, seed: 42 }, 'Retry: the same cell, a new seed');
  client.answer({ ok: false, reason: 'no candidate', seed: 42, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  await again;
  const standard = session.playStandard();
  assert.deepEqual(client.requests[2].req, { ...client.requests[0].req, noGuess: false, seed: 43 }, 'the same size, no-guess off');
  assert.equal(session.board.noGuess, false);
  client.answer();
  const r = await standard;
  assert.ok(r);
  assert.equal(session.view.pressed[5], 1);
  assert.equal(events.filter(([t]) => t === 'started').length, 1);
});

test('a worker that fails, or rejects the request, fails the board the same way', async () => {
  const { session, client, events } = sessionOf();
  const pending = session.reveal(0);
  client.fail(new Error('generation worker failed'));
  assert.equal(await pending, null);
  assert.equal(session.state, SESSION_STATE.FAILED);
  assert.equal(events.at(-1)[1].reason, 'generation worker failed');
  const again = session.retry();
  client.answer({ ok: false, rejected: true, reason: 'bad request', generatorVersion: GENERATOR_VERSION });
  await again;
  assert.equal(session.state, SESSION_STATE.FAILED);
  assert.equal(events.filter(([t]) => t === 'failed').length, 2);
});

test('a fixed mine set (the debug hook\'s board) plays at once: the first reveal starts the timer', () => {
  const { session, client, clock, types } = sessionOf({ X: 5, Y: 1, Z: 1, mines: 99, minePositions: [4] });
  assert.equal(session.view.minesLeft, 1);
  session.toggleFlag(4);
  const r = session.reveal(3);
  assert.equal(r.revealed, 1, 'answered at once, with no board request');
  assert.equal(client.requests.length, 0);
  assert.equal(session.state, SESSION_STATE.PLAYING);
  assert.equal(session.view.flagged[4], 1);
  assert.deepEqual(types(), ['started']);
  clock.advance(2500);
  assert.equal(session.seconds(), 2);
  assert.equal(session.seed, null);
});

test('every preset opens a closed box of its size', () => {
  for (const p of PRESETS) {
    const { session } = sessionOf(boardOf({ ...DEFAULT_CHOICE, size: p.id }));
    assert.equal(session.view.n, p.X * p.Y * p.Z, p.id);
    assert.equal(session.view.minesLeft, p.mines);
  }
});

// ---------------------------------------------------------------- the module boundaries

test('the session is DOM-free and reaches generation only through the client', () => {
  const src = code('js/mode3d/session.js');
  assert.doesNotMatch(src, /\b(document|window|navigator|localStorage)\b/);
  assert.doesNotMatch(src, /from ['"]three['"]/);
  for (const [, from] of src.matchAll(/^import .* from '([^']+)';$/gm)) {
    assert.doesNotMatch(from, /generation\//, `the session does not import generation code (${from})`);
  }
});

test('the 3D game is no longer placed on the main thread', () => {
  for (const f of ['js/main.js', 'js/shell/mode-3d.js', 'js/mode3d/session.js']) {
    assert.doesNotMatch(code(f), /placeMines|generation\/placer\.js|generation\/generate\.js/, `${f} does not place mines`);
  }
  const main = code('js/main.js');
  assert.match(main, /import \{[^}]*createSession[^}]*\} from '\.\/mode3d\/session\.js'/);
  assert.match(main, /createGenerationClient/, 'the 3D game asks the generation worker');
});

test('the old per-size best times are neither read nor written, and are left where they are', () => {
  for (const f of ['js/main.js', 'js/ui.js', 'js/shell/mode-3d.js', 'js/mode3d/session.js', 'js/mode3d/board-choice.js']) {
    const src = code(f);
    assert.doesNotMatch(src, /ms3d\.best|\bLS_BEST\b|\brecordBest\b|\bgetBest\b/, `${f} keeps no best time`);
  }
  assert.doesNotMatch(code('js/main.js'), /setBannerRecord/, 'the end banner shows no best time');
});

test('3D actions come from the existing mouse state machine and controller mapping', () => {
  const main = code('js/main.js');
  assert.match(main, /new MouseActions\(onAction, hasSelection\)/);
  assert.match(main, /if \(pressed\(BTN\.RT\)\) mouse\.down\(0\);/);
  assert.match(main, /if \(pressed\(BTN\.LT\)\) mouse\.down\(2\);/);
});

// ---------------------------------------------------------------- in a browser

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path)) { res.writeHead(404); res.end(); return; }
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

test('in a browser, a preset 3D game is generated by the worker around the first click and played to its end', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return; }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

    // the cube Beginner preset (6 x 6 x 6, 10 mines), with no-guess on
    const preset = PRESETS.find((p) => p.id === 'cube-beginner');
    await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); }, { ...boardOf({ ...DEFAULT_CHOICE, size: preset.id }), noGuess: true });
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'playing');

    // a flag before the first reveal is kept; it starts nothing
    const flagged = await ms(() => {
      const g = globalThis.__ms.game;
      for (let c = g.n - 1; c >= 0; c--) if (globalThis.__ms.aimAt(c) === c) { globalThis.__ms.click('right'); return c; }
      return -1;
    });
    assert.ok(flagged >= 0, 'a cell is aimed at and flagged');
    assert.equal(await ms((c) => globalThis.__ms.game.flagged[c], flagged), 1);
    assert.equal(await ms(() => globalThis.__ms.state.started), false);

    // the first reveal: a closed cell on the box's near face
    const first = await ms((f) => {
      const g = globalThis.__ms.game;
      for (let c = 0; c < g.n; c++) if (c !== f && globalThis.__ms.aimAt(c) === c) { globalThis.__ms.click('left'); return c; }
      return -1;
    }, flagged);
    assert.ok(first >= 0, 'a cell is aimed at');
    await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 15000 });
    const s = await ms(() => ({ seed: globalThis.__ms.state.play.seed, version: globalThis.__ms.state.play.generatorVersion, noGuess: globalThis.__ms.state.play.board.noGuess }));
    assert.equal(typeof s.seed, 'number', 'the board came from the worker with its seed');
    assert.equal(typeof s.version, 'number');
    assert.equal(s.noGuess, true);
    assert.equal(await ms((c) => globalThis.__ms.game.pressed[c], first), 1, 'the first click is safe and applied');
    assert.equal(await ms((c) => globalThis.__ms.game.flagged[c], flagged), 1, 'the flag placed before it is kept');
    assert.equal(await ms(() => globalThis.__ms.game.state), 'playing');

    // the timer runs in the overlay bar, three whole-second digits
    await page.waitForFunction(() => globalThis.__ms.state.time >= 1.05, null, { timeout: 5000 });
    await frames(3);
    assert.match(await ms(() => document.getElementById('hud-time').textContent), /^00[1-9]$/);

    // play to the end: open a mine that can be aimed at, opening safe cells (Space held, so the
    // picking passes through revealed ones) until one can
    const mine = await ms(() => {
      const ms3 = globalThis.__ms, g = ms3.game;
      ms3.key('Space', true);
      try {
        for (let step = 0; step < 400 && g.state === 'playing'; step++) {
          let safe = -1;
          for (let c = 0; c < g.n; c++) {
            if (g.pressed[c] || g.flagged[c] || ms3.aimAt(c) !== c) continue;
            if (g.number[c] === -1) { ms3.click('left'); return c; }
            if (safe < 0) safe = c;
          }
          if (safe < 0) return -1;
          ms3.aimAt(safe);
          ms3.click('left');
        }
        return -1;
      } finally { ms3.key('Space', false); }
    });
    assert.ok(mine >= 0, 'a mine is aimed at');
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    const t0 = await ms(() => globalThis.__ms.state.endState.time);
    await frames(20);
    assert.equal(await ms(() => globalThis.__ms.state.time), t0, 'the timer stopped at the loss');
    assert.equal(await ms(() => Object.keys(localStorage).filter((k) => k.startsWith('ms3d.best.')).length), 0, 'no best time is written');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('in a browser, a failed no-guess 3D board offers Retry and a standard board, and a restart keeps the standard board', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return; }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // a worker whose no-guess requests always run out of budget; standard requests are generated as usual
    await page.route('**/js/generation/worker.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `import { handleMessage } from './worker-real.js';
        globalThis.onmessage = ({ data }) => globalThis.postMessage(data.request.noGuess
          ? { id: data.id, result: { ok: false, reason: 'no candidate', seed: data.request.seed, generatorVersion: 1, candidates: 2000 } }
          : handleMessage(data));`,
    }));
    await page.route('**/js/generation/worker-real.js', async (route) => route.fulfill({
      contentType: 'text/javascript', body: read('js/generation/worker.js'),
    }));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const shown = (id) => ms((i) => !document.getElementById(i).classList.contains('hidden'), id);

    await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); }, { ...boardOf({ ...DEFAULT_CHOICE, size: 'cube-beginner' }), noGuess: true });
    const first = await ms(() => {
      const g = globalThis.__ms.game;
      for (let c = 0; c < g.n; c++) if (globalThis.__ms.aimAt(c) === c) { globalThis.__ms.click('left'); return c; }
      return -1;
    });
    assert.ok(first >= 0, 'a cell is aimed at');
    await page.waitForFunction(() => globalThis.__ms.state.play.state === 'failed', null, { timeout: 15000 });
    assert.equal(await shown('m3d-status'), true, 'the failed board shows its card');
    assert.equal(await shown('m3d-offer'), true, 'with its offer');
    assert.equal(await ms(() => document.getElementById('m3d-status-title').textContent), 'No board found');
    assert.equal(await ms(() => document.activeElement?.id), 'm3d-retry', 'Retry is focused');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'playing', 'the offer is not a pause');
    assert.equal(await ms(() => globalThis.__ms.state.started), false, 'the timer never started');

    // Retry: the same no-guess request with a new seed, which fails again here
    const seed1 = await ms(() => globalThis.__ms.state.play.seed);
    await ms(() => document.getElementById('m3d-retry').click());
    await page.waitForFunction((s) => globalThis.__ms.state.play.state === 'failed' && globalThis.__ms.state.play.seed !== s, seed1, { timeout: 15000 });
    assert.equal(await shown('m3d-offer'), true);

    // Play a standard board: the same size with no-guess off, for the same first cell
    await ms(() => document.getElementById('m3d-standard').click());
    await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 15000 });
    assert.equal(await shown('m3d-status'), false, 'the card goes once the board arrives');
    assert.equal(await ms(() => globalThis.__ms.state.play.board.noGuess), false);
    assert.equal(await ms((c) => globalThis.__ms.game.pressed[c], first), 1, 'the first click is applied');

    // a restart plays the standard board again
    await ms(() => globalThis.__ms.pause());
    await ms(() => document.getElementById('p-restart').click());
    await ms(() => document.getElementById('p-confirm-yes').click());
    assert.equal(await ms(() => globalThis.__ms.state.play.board.noGuess), false, 'a restart keeps no-guess off');
    assert.equal(await shown('m3d-status'), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
