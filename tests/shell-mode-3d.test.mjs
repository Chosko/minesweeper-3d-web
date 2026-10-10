import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModeHost, MODE_METHODS, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DMode, summary3d } from '../js/shell/mode-3d.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A fake 3D game session (js/mode3d/session.js): its board, a settable clock, its events, and a
// record of the calls the adapter makes on it.
function fakeSession(board = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: false }) {
  const listeners = { generating: new Set(), started: new Set(), failed: new Set(), finished: new Set() };
  const s = {
    board,
    ms: 0,
    calls: [],
    elapsedMs: () => s.ms,
    on(type, fn) { listeners[type].add(fn); return () => listeners[type].delete(fn); },
    emit(type, payload) { for (const fn of [...listeners[type]]) fn(payload); },
    listening: () => Object.values(listeners).reduce((n, set) => n + set.size, 0),
    pause() { s.calls.push('pause'); },
    resume() { s.calls.push('resume'); },
    leave() { s.calls.push('leave'); },
  };
  return s;
}

// A fake shell flow: records every call; start and restart hand back a new fake session.
function fakeFlow() {
  const calls = [];
  const sessions = [];
  const next = () => { const s = fakeSession(); sessions.push(s); return s; };
  const flow = {
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

// ---------------------------------------------------------------- the summary

test('the 3D summary has the fields the game reports today: outcome, dimensions, mines, time', () => {
  const board = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: true };
  assert.equal(summary3d({ board, started: false, outcome: null, elapsedMs: 0 }), null, 'nothing before the first applied reveal');
  assert.equal(summary3d({ board: null, started: true, outcome: null, elapsedMs: 0 }), null);
  assert.deepEqual(summary3d({ board, started: true, outcome: null, elapsedMs: 3250 }),
    { mode: '3d', outcome: 'abandoned', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 3.25 });
  assert.deepEqual(summary3d({ board, started: true, outcome: 'lost', elapsedMs: 8500 }),
    { mode: '3d', outcome: 'lost', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 8.5 });
});

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
  assert.deepEqual(events[0][1].summary, { mode: '3d', outcome: 'abandoned', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 1.5 });
  assert.equal(host.state.canPause, true);
});

test('summary() is the started game\'s summary so far, outcome abandoned', () => {
  const { host, flow, mode } = setup();
  host.start('3d', CHOICE);
  assert.equal(mode.summary(), null);
  flow.session.emit('started', {});
  flow.session.ms = 4200;
  assert.deepEqual(mode.summary(), { mode: '3d', outcome: 'abandoned', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 4.2 });
  assert.deepEqual(host.summary(), mode.summary());
});

test('game finished carries the outcome at a win or a loss, and the game can no longer pause', () => {
  for (const state of ['won', 'lost']) {
    const { host, types, events, flow, mode } = setup();
    host.start('3d', CHOICE);
    flow.session.emit('started', {});
    flow.session.ms = 9000;
    flow.session.emit('finished', { state });
    assert.deepEqual(types(), ['started', 'canPause', 'canPause', 'finished']);
    assert.deepEqual(events.at(-1)[1].summary, { mode: '3d', outcome: state, dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 9 });
    assert.equal(mode.summary().outcome, state);
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
  assert.deepEqual(events[2][1].summary, { mode: '3d', outcome: 'abandoned', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 2 });
  assert.deepEqual(flow.sessions[0].calls, ['leave'], 'the old session is left, cancelling a pending generation');
  assert.equal(host.summary(), null, 'the new board has not started');
  flow.session.emit('started', {});
  flow.session.ms = 500;
  host.leave();
  assert.deepEqual(types().slice(-2), ['abandoned', 'canPause']);
  assert.equal(events.at(-2)[1].summary.time, 0.5);
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

test('the 3D adapter is DOM-free and imports at most the 3D session', () => {
  const src = read('js/shell/mode-3d.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator)\b/, 'the 3D adapter touches no browser global');
  assert.doesNotMatch(src, /from ['"]three['"]/, 'the 3D adapter does not import three.js');
  for (const [, from] of read('js/shell/mode-3d.js').matchAll(/^import .* from '([^']+)';$/gm)) {
    assert.match(from, /^\.\.\/mode3d\/session\.js$/, `the 3D adapter imports only the 3D session (${from})`);
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
    const sum = await ms(() => globalThis.__ms.modes.summary());
    assert.deepEqual({ ...sum, time: undefined },
      { mode: '3d', outcome: 'abandoned', dimensions: { X: 5, Y: 1, Z: 1 }, mines: 1, time: undefined });
    assert.equal(sum.time, t0);

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

    // a win reports game finished with its summary, and leaving afterwards abandons nothing
    const won = await ms((b) => {
      globalThis.__ms.modes.start('3d', b);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
      const [type, e] = globalThis.__events.at(-1);
      globalThis.__ms.modes.leave();
      return { type, outcome: e.summary?.outcome, mode: e.summary?.mode, last: globalThis.__events.at(-1)[0] };
    }, BOARD);
    assert.deepEqual(won, { type: 'finished', outcome: 'won', mode: '3d', last: 'finished' });

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

