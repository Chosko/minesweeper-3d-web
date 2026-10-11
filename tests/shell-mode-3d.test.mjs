import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModeHost, MODE_METHODS, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DMode, END_DELAY_MS } from '../js/shell/mode-3d.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A fake 3D game session (js/mode3d/session.js): its board, seed and generator version, a settable
// clock, the engine's counts and summary, its events, and a record of the calls the adapter makes
// on it.
const CLICKS = Object.freeze({ reveal: { effective: 2, wasted: 0 }, flag: { effective: 1, wasted: 1 }, chord: { effective: 0, wasted: 0 } });
function fakeSession(board = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: false }) {
  const listeners = { generating: new Set(), started: new Set(), failed: new Set(), finished: new Set() };
  const s = {
    board,
    seed: 99,
    generatorVersion: 1,
    ms: 0,
    outcome: null,
    calls: [],
    elapsedMs: () => s.ms,
    counts: () => ({ bbbv: 10, bbbvSolved: 4, clicks: CLICKS }),
    engineSummary: () => (s.outcome
      ? { outcome: s.outcome, dimensions: { width: 4, height: 5, depth: 6 }, mineCount: 7, bbbv: 10, bbbvSolved: s.outcome === 'won' ? 10 : 4, clicks: CLICKS }
      : null),
    on(type, fn) { listeners[type].add(fn); return () => listeners[type].delete(fn); },
    emit(type, payload) {
      if (type === 'finished') s.outcome = payload.state;
      for (const fn of [...listeners[type]]) fn(payload);
    },
    listening: () => Object.values(listeners).reduce((n, set) => n + set.size, 0),
    pause() { s.calls.push('pause'); },
    resume() { s.calls.push('resume'); },
    leave() { s.calls.push('leave'); },
  };
  return s;
}

// The summary the builder makes of the fake session's game, without its id and end time.
const BOARD_3D = { mode: '3d', width: 4, height: 5, depth: 6, mines: 7, noGuess: false };
const plain = (summary) => ({ ...summary, id: undefined, endedAt: undefined });
const expected = (outcome, elapsedMs) => {
  const bbbvSolved = outcome === 'won' ? 10 : 4;
  return {
    id: undefined, board: BOARD_3D, outcome, elapsedMs, bbbv: 10, bbbvSolved, clicks: CLICKS,
    bbbvPerSecond: elapsedMs === 0 ? null : bbbvSolved / (elapsedMs / 1000), efficiency: (100 * bbbvSolved) / 4,
    seed: 99, generatorVersion: 1, endedAt: undefined,
  };
};

// A clock whose timers fire when the test advances it (the end delay).
function fakeClock() {
  let now = 0;
  const timers = new Set();
  return {
    setTimeout(fn, ms) { const t = { at: now + ms, fn }; timers.add(t); return t; },
    clearTimeout(t) { timers.delete(t); },
    advance(ms) { now += ms; for (const t of [...timers]) if (t.at <= now) { timers.delete(t); t.fn(); } },
  };
}

// A fake shell flow: records every call; start and restart hand back a new fake session.
function fakeFlow() {
  const calls = [];
  const sessions = [];
  const next = () => { const s = fakeSession(); sessions.push(s); return s; };
  const flow = {
    clock: fakeClock(),
    lost: false,
    sessions,
    get session() { return sessions.at(-1); },
    contextLost: () => flow.lost,
    openBoardChoice: () => calls.push(['openBoardChoice']),
    start: (c) => { calls.push(['start', c]); return next(); },
    pause: (note) => calls.push(['pause', note]),
    resume: (source) => calls.push(['resume', source]),
    restart: (source) => { calls.push(['restart', source]); return next(); },
    leave: () => calls.push(['leave']),
  };
  return { flow, calls };
}

function setup() {
  const host = createModeHost();
  const events = [];
  for (const t of MODE_EVENTS) host.on(t, (e) => events.push([t, e]));
  const { flow, calls } = fakeFlow();
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  const types = () => events.map(([t]) => t);
  return { host, events, types, flow, calls, mode };
}

const CHOICE = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: false };

// ---------------------------------------------------------------- the contract

test('the 3D adapter implements the contract over the shell flow, as today', () => {
  const { host, flow, calls, mode } = setup();
  for (const m of MODE_METHODS) assert.equal(typeof mode[m], 'function', m);
  assert.equal(mode.failureScreen, 'ctxlost');
  host.openBoardChoice('3d');
  host.start('3d', CHOICE);
  host.pause({ note: 'Controller disconnected' });
  host.resume({ source: 'pad' });
  host.resume();
  host.restart({ source: 'pad' });
  host.leave();
  assert.deepEqual(calls, [
    ['openBoardChoice'], ['start', CHOICE], ['pause', 'Controller disconnected'],
    ['resume', 'pad'], ['resume', 'pointer'], ['restart', 'pad'], ['leave'],
  ]);
  assert.equal(flow.sessions.length, 2, 'start and restart each open a session');
});

test('pause pauses the session, so its timer stops; a pending board request is not cancelled', () => {
  const { host, flow } = setup();
  host.start('3d', CHOICE);
  host.pause();
  assert.deepEqual(flow.session.calls, ['pause'], 'the session pauses and is not left');
  host.resume({ source: 'key' });
  assert.deepEqual(flow.session.calls, ['pause'], 'the timer resumes with play, not with the click-to-play card');
});

// ---------------------------------------------------------------- the reports

test('game started is reported at the first applied reveal, with can pause', () => {
  const { host, types, events, flow } = setup();
  host.start('3d', CHOICE);
  assert.deepEqual(types(), [], 'nothing while the box is closed or the board is generated');
  assert.equal(host.summary(), null, 'no summary before the first applied reveal');
  flow.session.ms = 1500;
  flow.session.emit('started', { changed: new Int32Array(0) });
  assert.deepEqual(types(), ['started', 'canPause']);
  assert.deepEqual(plain(events[0][1].summary), expected('abandoned', 1500), 'the builder\'s summary so far');
  assert.equal(host.state.canPause, true);
});

test('summary() is the started game\'s summary so far, outcome abandoned', () => {
  const { host, flow, mode } = setup();
  host.start('3d', CHOICE);
  assert.equal(mode.summary(), null);
  flow.session.emit('started', {});
  flow.session.ms = 4200;
  assert.deepEqual(plain(mode.summary()), expected('abandoned', 4200));
  assert.deepEqual(plain(host.summary()), plain(mode.summary()));
  assert.equal(host.summary().id, mode.summary().id, 'every summary of one game carries the same id');
});

test('game finished carries the outcome at a win or a loss, and the game can no longer pause', () => {
  for (const state of ['won', 'lost']) {
    const { host, types, events, flow, mode } = setup();
    host.start('3d', CHOICE);
    flow.session.emit('started', {});
    flow.session.ms = 9000;
    flow.session.emit('finished', { state });
    assert.deepEqual(types(), ['started', 'canPause', 'canPause'], 'pause stops at once; the end effect plays first');
    flow.clock.advance(END_DELAY_MS);
    assert.deepEqual(types(), ['started', 'canPause', 'canPause', 'finished']);
    assert.deepEqual(plain(events.at(-1)[1].summary), expected(state, 9000));
    assert.equal(events.at(-1)[1].summary.id, events[0][1].summary.id, 'the finished summary names the started game');
    flow.session.ms = 12000;
    assert.deepEqual(mode.summary(), events.at(-1)[1].summary, 'summary() after the end is the finished summary');
    assert.equal(host.state.canPause, false);
    host.leave();
    assert.equal(types().includes('abandoned'), false, 'a finished game is never abandoned');
  }
});

test('restart and leave of a started, unfinished game report game abandoned', () => {
  const { host, types, events, flow } = setup();
  host.start('3d', CHOICE);
  flow.session.emit('started', {});
  flow.session.ms = 2000;
  host.restart({ source: 'pointer' });
  assert.deepEqual(types(), ['started', 'canPause', 'abandoned', 'canPause']);
  assert.deepEqual(plain(events[2][1].summary), expected('abandoned', 2000));
  assert.deepEqual(flow.sessions[0].calls, ['leave'], 'the old session is left, cancelling a pending generation');
  assert.equal(host.summary(), null, 'the new board has not started');
  flow.session.emit('started', {});
  flow.session.ms = 500;
  host.leave();
  assert.deepEqual(types().slice(-2), ['abandoned', 'canPause']);
  assert.equal(events.at(-2)[1].summary.elapsedMs, 500);
  assert.notEqual(events.at(-2)[1].summary.id, events[2][1].summary.id, 'the restarted board is another game');
  assert.deepEqual(flow.sessions[1].calls, ['leave']);
});

test('a game left or restarted before its first applied reveal reports nothing', () => {
  const { host, types, flow } = setup();
  host.start('3d', CHOICE);
  host.restart({ source: 'pad' });
  host.leave();
  assert.deepEqual(types(), []);
  assert.deepEqual(flow.sessions.map((s) => s.calls), [['leave'], ['leave']], 'each session is left');
});

test('reports of a session the adapter no longer holds are ignored', () => {
  const { host, types, flow } = setup();
  host.start('3d', CHOICE);
  const old = flow.session;
  host.restart({ source: 'pointer' });
  assert.equal(old.listening(), 0, 'the adapter stops listening to the old session');
  old.emit('started', {});
  old.emit('finished', { state: 'won' });
  assert.deepEqual(types(), []);
  host.leave();
  flow.sessions[1].emit('started', {});
  assert.deepEqual(types(), []);
});

test('a lost graphics context is a start or play failure, and cancels a pending generation', () => {
  const { host, events, flow, calls, mode } = setup();
  flow.lost = true;
  host.start('3d', CHOICE);
  assert.deepEqual(calls, [], 'a dead canvas starts nothing');
  assert.deepEqual(events, [['failed', { mode: '3d', reason: 'graphics context lost', screen: 'ctxlost' }]]);
  flow.lost = false;
  host.start('3d', CHOICE);
  mode.contextLost();
  assert.deepEqual(events.at(-1), ['failed', { mode: '3d', reason: 'graphics context lost', screen: 'ctxlost' }]);
  assert.deepEqual(flow.session.calls, ['leave'], 'the session is left: its pending board request is cancelled');
});

test('the 3D adapter is DOM-free and imports at most the 3D session and the records\' summary and board', () => {
  const src = read('js/shell/mode-3d.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator)\b/, 'the 3D adapter touches no browser global');
  assert.doesNotMatch(src, /from ['"]three['"]/, 'the 3D adapter does not import three.js');
  for (const [, from] of read('js/shell/mode-3d.js').matchAll(/^import .* from '([^']+)';$/gm)) {
    assert.match(from, /^\.\.\/(mode3d\/session|records\/summary|records\/board)\.js$/, `the 3D adapter imports only the 3D session and the records' summary and board (${from})`);
  }
});

test('js/main.js hands the adapter each session and leaves the reports to it', () => {
  const main = read('js/main.js');
  assert.match(main, /MODES\.register\('3d', \(report\) => create3DMode\(FLOW_3D, report\)\)/);
  assert.doesNotMatch(main, /mode3d\.(gameStarted|gameEnded)\(/, 'the game\'s own flow no longer reports for the adapter');
  assert.doesNotMatch(main, /snapshot:/, 'the summary comes from the session, not a snapshot of the shell state');
});

// ---------------------------------------------------------------- browser: the 3D game through the adapter

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

test('in a browser, the 3D game starts, pauses, resumes, restarts and leaves through the adapter', async (t) => {
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
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await ms(() => {
      globalThis.__events = [];
      for (const type of ['started', 'finished', 'abandoned', 'canPause', 'failed']) {
        globalThis.__ms.modes.on(type, (e) => globalThis.__events.push([type, e]));
      }
    });
    const events = () => ms(() => globalThis.__events.map(([t]) => t));
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

    // start: a row of five with the mine at the end, so cell 3 is a numbered cell that does not win
    const BOARD = { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] };
    // a game left before its first reveal reports nothing
    await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); globalThis.__ms.modes.leave(); }, BOARD);
    assert.deepEqual(await events(), [], 'nothing is reported for a board never revealed');

    await ms((b) => globalThis.__ms.modes.start('3d', b), BOARD);
    assert.equal(await mode(), 'ready');
    assert.equal(await ms(() => globalThis.__ms.modes.active), '3d');
    assert.equal(await ms(() => globalThis.__ms.modes.summary()), null, 'nothing before the first click');
    await ms(() => globalThis.__ms.forcePlay());
    assert.equal(await mode(), 'playing');
    assert.equal(await ms(() => globalThis.__ms.aimAt(3)), 3, 'the numbered cell is aimed at');
    await ms(() => globalThis.__ms.click('left'));
    assert.deepEqual(await events(), ['started', 'canPause']);
    assert.equal(await ms(() => globalThis.__ms.game.state), 'playing');
    await frames(10);

    // pause through the host: the pause card shows and the timer stops
    await ms(() => globalThis.__ms.modes.pause());
    assert.equal(await mode(), 'paused');
    const t0 = await ms(() => globalThis.__ms.state.time);
    await frames(10);
    assert.equal(await ms(() => globalThis.__ms.state.time), t0, 'the timer is stopped while paused');
    assert.equal(await ms(() => globalThis.__ms.modes.summary()), null, 'a fixed board, which no generator made, has no summary');

    // resume from a controller enters lockless play, as today
    await ms(() => globalThis.__ms.modes.resume({ source: 'pad' }));
    assert.equal(await mode(), 'playing');
    assert.equal(await ms(() => globalThis.__ms.state.lockless), true);

    // resume with the mouse goes to the click-to-play card, which re-acquires pointer lock
    await ms(() => globalThis.__ms.modes.pause());
    await ms(() => globalThis.__ms.modes.resume({ source: 'pointer' }));
    await frames(5);
    const resumed = await ms(() => ({ mode: globalThis.__ms.state.mode, locked: !!document.pointerLockElement, lockless: globalThis.__ms.state.lockless }));
    assert.equal(resumed.lockless, false);
    assert.ok(resumed.mode === 'playing' ? resumed.locked : resumed.mode === 'ready',
      `play under pointer lock, or the click-to-play card when the browser refuses it (${JSON.stringify(resumed)})`);

    // restart from the pause card, once confirmed, abandons the started game
    await ms(() => globalThis.__ms.pause());
    await ms(() => document.getElementById('p-restart').click());
    await ms(() => document.getElementById('p-confirm-yes').click());
    assert.ok(['ready', 'playing'].includes(await mode()), 'a new board, entered as resume enters play');
    assert.deepEqual(await events(), ['started', 'canPause', 'abandoned', 'canPause']);
    assert.equal(await ms(() => globalThis.__ms.state.started), false);

    // leave through the pause card's Main menu: the game is released
    await ms((b) => {
      globalThis.__ms.modes.start('3d', b);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(3);
      globalThis.__ms.click('left');
      globalThis.__ms.pause();
    }, BOARD);
    await ms(() => document.getElementById('p-menu').click());
    await ms(() => document.getElementById('p-confirm-yes').click());
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => globalThis.__ms.modes.active), null);
    assert.equal(await ms(() => globalThis.__ms.game), null);
    assert.equal(await ms(() => globalThis.__ms.state.lockless), false);
    assert.deepEqual((await events()).slice(-3), ['canPause', 'abandoned', 'canPause']);

    // a win reports game finished after the end delay — a fixed board with no summary, which ends on
    // the pause card — and leaving afterwards abandons nothing
    await ms((b) => {
      globalThis.__ms.modes.start('3d', b);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
    }, BOARD);
    assert.equal(await ms(() => globalThis.__ms.game.state), 'won');
    await page.waitForFunction(() => globalThis.__events.at(-1)[0] === 'finished', null, { timeout: 5000 });
    assert.equal(await mode(), 'paused', 'a fixed board, which has no results, ends on the pause card');
    const won = await ms(() => {
      const [type, e] = globalThis.__events.at(-1);
      globalThis.__ms.modes.leave();
      return { type, summary: e.summary, last: globalThis.__events.at(-1)[0] };
    });
    assert.deepEqual(won, { type: 'finished', summary: null, last: 'finished' });

    // a lost graphics context is the 3D mode's failure; its screen offers back to menu
    await ms(() => { globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }); globalThis.__ms.forcePlay(); });
    await ms(() => globalThis.__ms.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ctxlost');
    assert.equal((await events()).at(-1), 'failed');
    await ms(() => document.getElementById('ctx-lost-menu').click());
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => document.getElementById('menu').inert), false, 'the menu is usable again');
    assert.equal(await ms(() => document.getElementById('ctx-lost').classList.contains('hidden')), true);
    await ms(() => globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }));
    assert.equal(await mode(), 'ctxlost', 'a dead canvas cannot start a 3D game, and says so');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

