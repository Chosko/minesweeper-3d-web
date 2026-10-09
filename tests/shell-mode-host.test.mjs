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

// A fake mode: records every contract call; `play` drives its game the way a board would.
function fakeMode(extra = {}) {
  const calls = [];
  let report = null;
  let game = null; // { choice, started, outcome }
  const mode = {
    failureScreen: 'fake-failed',
    openBoardChoice() { calls.push(['openBoardChoice']); },
    start(choice) { calls.push(['start', choice]); game = { choice, started: false, outcome: null }; },
    pause(opts) { calls.push(['pause', opts]); },
    resume(opts) { calls.push(['resume', opts]); },
    restart(opts) { calls.push(['restart', opts]); game = { choice: game.choice, started: false, outcome: null }; },
    leave() { calls.push(['leave']); game = null; },
    summary() {
      if (!game || !game.started) return null;
      return { mode: 'fake', outcome: game.outcome ?? 'abandoned', choice: game.choice, time: 12.5 };
    },
    ...extra,
  };
  const play = {
    click() { game.started = true; report.started(); report.canPause(true); },
    end(outcome) { game.outcome = outcome; report.canPause(false); report.finished(mode.summary()); },
    fail(reason) { report.failed(reason); },
  };
  return { factory: (r) => { report = r; return mode; }, mode, calls, play };
}

function hostWith(...ids) {
  const host = createModeHost();
  const events = [];
  for (const type of MODE_EVENTS) host.on(type, (e) => events.push([type, e]));
  const fakes = {};
  for (const id of ids) {
    fakes[id] = fakeMode();
    host.register(id, fakes[id].factory);
  }
  return { host, events, fakes };
}

// ---------------------------------------------------------------- registry

test('the contract names every method and report of the feature', () => {
  assert.deepEqual([...MODE_METHODS], ['openBoardChoice', 'start', 'pause', 'resume', 'restart', 'leave', 'summary']);
  assert.deepEqual([...MODE_EVENTS], ['started', 'finished', 'abandoned', 'canPause', 'failed']);
});

test('modes are registered by id; the host hands each its report and returns the mode', () => {
  const host = createModeHost();
  const a = fakeMode();
  assert.equal(host.register('a', a.factory), a.mode);
  assert.equal(host.has('a'), true);
  assert.equal(host.has('b'), false);
  assert.deepEqual(host.ids, ['a']);
  assert.equal(host.active, null);
});

test('a duplicate id, a mode missing a contract method, or a non-factory is refused', () => {
  const host = createModeHost();
  host.register('a', fakeMode().factory);
  assert.throws(() => host.register('a', fakeMode().factory), /already registered/);
  for (const m of MODE_METHODS) {
    assert.throws(() => host.register(`no-${m}`, fakeMode({ [m]: undefined }).factory), new RegExp(m));
    assert.equal(host.has(`no-${m}`), false);
  }
  assert.throws(() => host.register('x', {}), /factory/);
});

test('an unknown mode cannot be started or asked for its board choice', () => {
  const { host } = hostWith('a');
  assert.throws(() => host.start('nope', {}), /unknown mode "nope"/);
  assert.throws(() => host.openBoardChoice('nope'), /unknown mode "nope"/);
  assert.equal(host.active, null);
});

test('open board choice reaches the named mode without making it active', () => {
  const { host, fakes } = hostWith('a');
  host.openBoardChoice('a');
  assert.deepEqual(fakes.a.calls, [['openBoardChoice']]);
  assert.equal(host.active, null);
});

// ---------------------------------------------------------------- the active mode

test('start makes the mode active and hands it the choice; pause and resume reach it', () => {
  const { host, fakes } = hostWith('a', 'b');
  host.start('a', { size: 9 });
  assert.equal(host.active, 'a');
  host.pause({ note: 'x' });
  host.resume({ source: 'pad' });
  assert.deepEqual(fakes.a.calls, [['start', { size: 9 }], ['pause', { note: 'x' }], ['resume', { source: 'pad' }]]);
  assert.deepEqual(fakes.b.calls, []);
});

test('with no active mode, pause, resume, restart, leave and summary do nothing', () => {
  const { host, fakes, events } = hostWith('a');
  host.pause();
  host.resume();
  host.restart();
  host.leave();
  assert.equal(host.summary(), null);
  assert.deepEqual(fakes.a.calls, []);
  assert.deepEqual(events, []);
});

test('the mode reports game started and can pause; the host keeps the game state', () => {
  const { host, fakes, events } = hostWith('a');
  host.start('a', 1);
  assert.deepEqual(host.state, { mode: 'a', started: false, finished: false, canPause: false });
  fakes.a.play.click();
  assert.deepEqual(host.state, { mode: 'a', started: true, finished: false, canPause: true });
  assert.deepEqual(events.map(([t]) => t), ['started', 'canPause']);
  assert.equal(events[0][1].mode, 'a');
  assert.deepEqual(events[1][1], { mode: 'a', canPause: true });
});

test('summary is nothing before the first click, and the summary so far, outcome abandoned, after it', () => {
  const { host, fakes } = hostWith('a');
  host.start('a', 7);
  assert.equal(host.summary(), null);
  fakes.a.play.click();
  assert.deepEqual(host.summary(), { mode: 'fake', outcome: 'abandoned', choice: 7, time: 12.5 });
  host.pause();
  assert.equal(host.summary().outcome, 'abandoned', 'at any moment, paused included');
});

test('summary stays abandoned for a started, unfinished game even when the mode says otherwise', () => {
  const host = createModeHost();
  const f = fakeMode({ summary: () => ({ outcome: 'playing', time: 3 }) });
  host.register('a', f.factory);
  host.start('a');
  f.play.click();
  assert.deepEqual(host.summary(), { outcome: 'abandoned', time: 3 });
});

test('game finished carries the summary; a finished game is never abandoned', () => {
  const { host, fakes, events } = hostWith('a');
  host.start('a', 1);
  fakes.a.play.click();
  fakes.a.play.end('won');
  const fin = events.find(([t]) => t === 'finished')[1];
  assert.deepEqual(fin, { mode: 'a', summary: { mode: 'fake', outcome: 'won', choice: 1, time: 12.5 } });
  assert.equal(host.state.finished, true);
  assert.equal(host.summary().outcome, 'won');
  host.restart();
  host.leave();
  assert.equal(events.filter(([t]) => t === 'abandoned').length, 0);
});

test('restart on a started, unfinished game first reports game abandoned with its summary', () => {
  const { host, fakes, events } = hostWith('a');
  host.start('a', 5);
  fakes.a.play.click();
  const order = [];
  host.on('abandoned', () => order.push('abandoned'));
  const restart = fakes.a.mode.restart;
  fakes.a.mode.restart = function () { order.push('restart'); return restart.call(this); };
  host.restart();
  assert.deepEqual(order, ['abandoned', 'restart']);
  const ab = events.find(([t]) => t === 'abandoned')[1];
  assert.deepEqual(ab, { mode: 'a', summary: { mode: 'fake', outcome: 'abandoned', choice: 5, time: 12.5 } });
  assert.deepEqual(host.state, { mode: 'a', started: false, finished: false, canPause: false });
  assert.equal(host.summary(), null, 'the new game has not been clicked');
});

test('restart and leave before the first click report nothing', () => {
  const { host, events } = hostWith('a');
  host.start('a', 5);
  host.restart();
  host.leave();
  assert.deepEqual(events.filter(([t]) => t === 'abandoned'), []);
});

test('leave on a started, unfinished game reports abandoned, then releases the mode', () => {
  const { host, fakes, events } = hostWith('a');
  host.start('a', 5);
  fakes.a.play.click();
  host.leave();
  assert.deepEqual(events.map(([t]) => t), ['started', 'canPause', 'abandoned', 'canPause']);
  assert.deepEqual(events.at(-1)[1], { mode: 'a', canPause: false });
  assert.deepEqual(fakes.a.calls.at(-1), ['leave']);
  assert.equal(host.active, null);
  assert.deepEqual(host.state, { mode: null, started: false, finished: false, canPause: false });
});

test('starting a game while another is in progress abandons and leaves it first', () => {
  const { host, fakes, events } = hostWith('a', 'b');
  host.start('a', 1);
  fakes.a.play.click();
  host.start('b', 2);
  assert.equal(events.find(([t]) => t === 'abandoned')[1].mode, 'a');
  assert.deepEqual(fakes.a.calls.at(-1), ['leave']);
  assert.equal(host.active, 'b');
  assert.deepEqual(fakes.b.calls, [['start', 2]]);
});

test('a report from a mode that is not active is ignored', () => {
  const { host, fakes, events } = hostWith('a', 'b');
  host.start('a', 1);
  host.start('b', 1);
  fakes.a.play.fail('late');
  assert.deepEqual(events, []);
  assert.deepEqual(host.state, { mode: 'b', started: false, finished: false, canPause: false });
});

test('a mode that fails to start reports it with its failure screen', () => {
  const { host, fakes, events } = hostWith('a');
  fakes.a.mode.start = () => fakes.a.play.fail('no graphics');
  host.start('a', 1);
  assert.deepEqual(events, [['failed', { mode: 'a', reason: 'no graphics', screen: 'fake-failed' }]]);
  assert.equal(host.state.started, false);
});

test('a start that throws is reported as a failure, never thrown at the shell', () => {
  const { host, fakes, events } = hostWith('a');
  fakes.a.mode.start = () => { throw new Error('boom'); };
  assert.doesNotThrow(() => host.start('a', 1));
  assert.deepEqual(events, [['failed', { mode: 'a', reason: 'boom', screen: 'fake-failed' }]]);
});

test('a listener can unsubscribe, and a throwing listener does not stop the others', () => {
  const { host, fakes } = hostWith('a');
  const seen = [];
  const off = host.on('started', () => seen.push('first'));
  host.on('started', () => { throw new Error('listener'); });
  host.on('started', () => seen.push('third'));
  host.start('a');
  fakes.a.play.click();
  off();
  host.restart();
  fakes.a.play.click();
  assert.deepEqual(seen, ['first', 'third', 'third']);
  assert.throws(() => host.on('nope', () => {}), /unknown mode event/);
});

// ---------------------------------------------------------------- the 3D adapter

function fakeFlow(over = {}) {
  const calls = [];
  const snap = { settings: { X: 4, Y: 5, Z: 6, mines: 7 }, started: false, time: 0, endState: null };
  const flow = {
    snap,
    lost: false,
    contextLost: () => flow.lost,
    openBoardChoice: () => calls.push(['openBoardChoice']),
    start: (c) => calls.push(['start', c]),
    pause: (note) => calls.push(['pause', note]),
    resume: (source) => calls.push(['resume', source]),
    restart: (source) => calls.push(['restart', source]),
    leave: () => calls.push(['leave']),
    snapshot: () => snap,
    ...over,
  };
  return { flow, calls };
}

test('the 3D summary has the fields the game already has: outcome, dimensions, mines, time', () => {
  const snap = { settings: { X: 4, Y: 5, Z: 6, mines: 7 }, started: false, time: 0, endState: null };
  assert.equal(summary3d(snap), null, 'nothing before the first click');
  assert.equal(summary3d({ ...snap, settings: null }), null);
  assert.deepEqual(summary3d({ ...snap, started: true, time: 3.25 }),
    { mode: '3d', outcome: 'abandoned', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 3.25 });
  assert.deepEqual(summary3d({ ...snap, started: true, time: 9, endState: { state: 'lost', time: 8.5, minesLeft: 2 } }),
    { mode: '3d', outcome: 'lost', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 8.5 });
  assert.equal(summary3d({ ...snap, endState: { state: 'won', time: 0, minesLeft: 0 } }).outcome, 'won',
    'a board won before any click still has its finished summary');
});

test('the 3D adapter implements the contract over the existing flow', () => {
  const host = createModeHost();
  const { flow, calls } = fakeFlow();
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  for (const m of MODE_METHODS) assert.equal(typeof mode[m], 'function', m);
  assert.equal(mode.failureScreen, 'ctxlost');
  host.openBoardChoice('3d');
  host.start('3d', { X: 4, Y: 5, Z: 6, mines: 7 });
  host.pause({ note: 'Controller disconnected' });
  host.resume({ source: 'pad' });
  host.resume();
  host.restart({ source: 'pad' });
  host.leave();
  assert.deepEqual(calls, [
    ['openBoardChoice'], ['start', { X: 4, Y: 5, Z: 6, mines: 7 }], ['pause', 'Controller disconnected'],
    ['resume', 'pad'], ['resume', 'pointer'], ['restart', 'pad'], ['leave'],
  ]);
});

test('the 3D adapter reports started, finished and can pause from the game\'s own flow', () => {
  const host = createModeHost();
  const events = [];
  for (const t of MODE_EVENTS) host.on(t, (e) => events.push([t, e]));
  const { flow } = fakeFlow();
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  host.start('3d', flow.snap.settings);
  flow.snap.started = true;
  flow.snap.time = 4;
  mode.gameStarted();
  assert.deepEqual(host.summary(), summary3d(flow.snap));
  flow.snap.endState = { state: 'won', time: 4, minesLeft: 0 };
  mode.gameEnded();
  assert.deepEqual(events.map(([t]) => t), ['started', 'canPause', 'canPause', 'finished']);
  assert.deepEqual(events[0][1].summary, { mode: '3d', outcome: 'abandoned', dimensions: { X: 4, Y: 5, Z: 6 }, mines: 7, time: 4 });
  assert.equal(events.at(-1)[1].summary.outcome, 'won');
  assert.equal(host.state.canPause, false);
});

test('the 3D adapter reports a lost graphics context, at start and in play', () => {
  const host = createModeHost();
  const failed = [];
  host.on('failed', (e) => failed.push(e));
  const { flow, calls } = fakeFlow();
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  flow.lost = true;
  host.start('3d', flow.snap.settings);
  assert.deepEqual(calls, [], 'a dead canvas starts nothing');
  assert.deepEqual(failed, [{ mode: '3d', reason: 'graphics context lost', screen: 'ctxlost' }]);
  mode.contextLost();
  assert.equal(failed.length, 2);
});

test('mode host and 3D adapter are DOM-free', () => {
  for (const f of ['js/shell/mode-host.js', 'js/shell/mode-3d.js']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(document|window|navigator)\b/, `${f} touches no browser global`);
    assert.doesNotMatch(src, /from ['"]three['"]/, `${f} does not import three.js`);
    assert.doesNotMatch(src, /^import /m, `${f} imports nothing`);
  }
});

test('the contract is documented in the mode-host module', () => {
  const head = read('js/shell/mode-host.js').split('export ')[0];
  for (const word of [...MODE_METHODS, ...MODE_EVENTS]) assert.match(head, new RegExp(`\\b${word}\\b`), `documents ${word}`);
});

// ---------------------------------------------------------------- the shell's wiring

const MAIN = read('js/main.js');

test('the shell reaches the 3D game only through the mode host', () => {
  assert.match(MAIN, /createModeHost\(/);
  assert.match(MAIN, /MODES\.register\('3d', \(report\) => create3DMode\(/);
  const flow = MAIN.slice(MAIN.indexOf('const FLOW_3D = {'), MAIN.indexOf('// end of 3D flow'));
  assert.ok(flow.length > 100, 'js/main.js declares the 3D flow');
  assert.equal([...MAIN.replace(flow, '').matchAll(/\bstartGame\(/g)].length, 1, 'only the 3D flow calls startGame');
  assert.match(MAIN, /start\(X, Y, Z, mines, minePositions\) \{ MODES\.start\('3d'/, 'the debug hook starts through the host');
  assert.match(MAIN, /onStart: \(s\) => \{[^}]*MODES\.start\('3d', s\)/, 'the menu starts a game through the host');
  assert.match(MAIN, /onRestart: \(\) => PAUSE\.restart\(padGesture \? 'pad' : 'pointer'\)/, 'restart goes through the pause controller');
  assert.match(MAIN, /menu: \{[^\n]*MODES\.leave\(\)/, 'the menu leaves the active mode');
  assert.match(MAIN, /MODES\.on\('failed'/, 'a mode failure routes to its failure screen');
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
