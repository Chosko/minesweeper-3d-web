import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModeHost, MODE_METHODS, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DGame } from '../js/mode3d/session.js';
import { PHASE } from '../js/engine/rules.js';
import { clampSettings } from '../js/ui.js';
import { customStatus } from '../js/mode3d/board-choice.js';
import { pickCell, pickCellBrute } from '../js/picking.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MAIN_SRC = () => read('js/main.js');

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
  assert.deepEqual(fin, { mode: 'a', summary: { mode: 'fake', outcome: 'won', choice: 1, time: 12.5 }, replay: null });
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
  assert.deepEqual(ab, { mode: 'a', summary: { mode: 'fake', outcome: 'abandoned', choice: 5, time: 12.5 }, replay: null });
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

test('the mode host is DOM-free and imports nothing', () => {
  const src = read('js/shell/mode-host.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator)\b/, 'the mode host touches no browser global');
  assert.doesNotMatch(read('js/shell/mode-host.js'), /^import /m, 'the mode host imports nothing');
});

// ---------------------------------------------------------------- the 3D game on the shared engine

test('a 3D game from a fixed mine set plays from the start: a mine loses', () => {
  const d = create3DGame({ X: 5, Y: 1, Z: 1, mines: 99, minePositions: [4] });
  assert.equal(d.view.phase, PHASE.PLAYING);
  assert.equal(d.mines, 1, 'the mine count is the mine set\'s');
  assert.deepEqual(Array.from(d.view.number), [0, 0, 0, 1, -1]);
  const r = d.reveal(4);
  assert.equal(r.exploded, true);
  assert.equal(d.view.state, 'lost');
  assert.equal(d.view.explodedIdx, 4);
  assert.deepEqual(Array.from(d.view.pressed), [1, 1, 1, 1, 1], 'a loss reads as every cell pressed');
});

test('a 3D game from a fixed mine set: opening every safe cell wins, and the result counts what it opened', () => {
  const d = create3DGame({ X: 5, Y: 1, Z: 1, minePositions: [4] });
  const r = d.reveal(0);
  assert.equal(r.exploded, false);
  assert.equal(r.revealed, 4, 'the flood opened cells 0 to 3');
  assert.equal(r.ended, true);
  assert.equal(d.view.state, 'won');
});

test('a 3D game counts flags placed and removed, from a closed cell and from a revealed one', () => {
  // 3 x 1 x 1: cells 0 (mine), 1 (1), 2 (1)
  const d = create3DGame({ X: 3, Y: 1, Z: 1, minePositions: [0] });
  assert.equal(d.reveal(1).revealed, 1);
  assert.equal(d.reveal(1).revealed, 0, 'a second reveal opens nothing');
  const v0 = d.view.version;
  let r = d.toggleFlag(1); // a revealed cell: flags every closed neighbour
  assert.deepEqual([r.flagged, r.unflagged], [2, 0]);
  assert.ok(d.view.version > v0, 'the flag reached the state view');
  r = d.toggleFlag(1); // every closed neighbour is flagged: unflags them all
  assert.deepEqual([r.flagged, r.unflagged], [0, 2]);
  r = d.toggleFlag(0); // a closed cell
  assert.deepEqual([r.flagged, r.unflagged], [1, 0]);
  assert.equal(d.view.flagged[0], 1);
  r = d.chord(1);
  assert.equal(r.exploded, false);
  assert.equal(r.revealed, 1, 'the chord opened the far cell');
  assert.equal(d.view.pressed[2], 1);
  assert.equal(d.view.state, 'won');
});

test('picking over the 3D state view skips hidden cells', () => {
  // 3 x 1 x 1: cells 0 (0), 1 (1), 2 (mine); a ray along +x through every cube, spacing 1
  const d = create3DGame({ X: 3, Y: 1, Z: 1, minePositions: [2] });
  const o = { x: -20, y: 0, z: 0 }, dir = { x: 1, y: 0, z: 0 };
  const pick = (space = false) => [pickCell(d.view, 1, o, dir, space), pickCellBrute(d.view, 1, o, dir, space)];
  assert.deepEqual(pick(), [0, 0]);
  d.reveal(0);
  assert.equal(d.view.unlinked[0], 1, 'the revealed zero is hidden');
  assert.deepEqual(pick(), [1, 1], 'the hidden cell cannot be picked: the ray reaches the cell behind it');
  assert.deepEqual(pick(true), [2, 2], 'with Space held, revealed cells are skipped too');
});

test('a 3D game rejects more mines than every cell but one', () => {
  assert.throws(() => create3DGame({ X: 2, Y: 2, Z: 2, mines: 8 }), RangeError);
  assert.doesNotThrow(() => create3DGame({ X: 2, Y: 2, Z: 2, mines: 7 }));
});

test('custom 3D boards accept at most cells minus one mines', () => {
  assert.deepEqual(clampSettings({ X: 2, Y: 2, Z: 2, mines: 8 }), { X: 2, Y: 2, Z: 2, mines: 7 });
  assert.deepEqual(clampSettings({ X: 2, Y: 2, Z: 2, mines: 7 }), { X: 2, Y: 2, Z: 2, mines: 7 });
  assert.equal(clampSettings({ X: 10, Y: 10, Z: 10, mines: 5000 }).mines, 999);
  assert.equal(clampSettings({ X: 3, Y: 3, Z: 3, mines: 0 }).mines, 1);
  const over = customStatus({ X: 2, Y: 2, Z: 2, mines: 8 });
  assert.equal(over.ok, false, 'the custom board\'s info line warns past cells minus one');
  assert.equal(over.field, 'mines');
  assert.match(over.text, /from 1 to 7\b/);
  assert.equal(customStatus({ X: 2, Y: 2, Z: 2, mines: 7 }).ok, true);
});

test('the 3D engine is retired: js/logic.js and its tests are gone and nothing imports them', () => {
  assert.equal(existsSync(join(ROOT, 'js/logic.js')), false);
  assert.equal(existsSync(join(ROOT, 'tests/logic.test.mjs')), false);
  const files = (dir) => readdirSync(join(ROOT, dir), { recursive: true })
    .filter((f) => /\.(m?js|html)$/.test(f)).map((f) => join(dir, String(f)));
  for (const f of ['index.html', ...files('js'), ...files('tests'), ...files('dev')]) {
    assert.doesNotMatch(read(f), /(import|from)\s*\(?\s*['"][^'"]*logic(\.js|\.test\.mjs)['"]/, `${f} imports no 3D engine`);
  }
  assert.match(MAIN_SRC(), /import \{[^}]*create3DGame[^}]*\} from '\.\/mode3d\/session\.js'/, 'js/main.js builds the 3D game on the shared engine');
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
  assert.match(MAIN, /onStart: \(choice\) => \{[^\n]*MODES\.start\('3d', boardOf\(choice\)\)/, 'the board choice starts a game through the host');
  assert.match(MAIN, /onRestart: \(\) => PAUSE\.restart\(padGesture \? 'pad' : 'pointer'\)/, 'restart goes through the pause controller');
  assert.match(MAIN, /menu: \{[^\n]*MODES\.leave\(\)/, 'the menu leaves the active mode');
  assert.match(MAIN, /MODES\.on\('failed'/, 'a mode failure routes to its failure screen');
});

// ---------------------------------------------------------------- browser: the 3D game on the shared engine

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

test('in a browser, a 3D game on the shared engine plays a fixed mine set to a win and to a loss', async (t) => {
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
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const play = (board, cells) => ms(([b, cs]) => {
      globalThis.__ms.start(b.X, b.Y, b.Z, b.mines, b.minePositions);
      globalThis.__ms.forcePlay();
      for (const [cell, kind] of cs) {
        if (globalThis.__ms.aimAt(cell) !== cell) return `cell ${cell} could not be aimed at`;
        globalThis.__ms.click(kind);
      }
      const g = globalThis.__ms.game;
      return { state: g.state, pressed: Array.from(g.pressed), flagged: Array.from(g.flagged), minesLeft: g.minesLeft, version: g.version };
    }, [board, cells]);

    // a 3 x 3 x 1 board, the mine in a corner: flag it, then open the far corner's zero region
    const BOARD = { X: 3, Y: 3, Z: 1, mines: 1, minePositions: [0] };
    const won = await play(BOARD, [[0, 'right'], [8, 'left']]);
    assert.equal(won.state, 'won', JSON.stringify(won));
    assert.deepEqual(won.flagged, [1, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(won.pressed, [0, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(won.minesLeft, 0);
    await frames(3);
    assert.equal(await ms(() => document.getElementById('hud-mines').textContent), '0', 'the HUD reads the state view');
    assert.equal(await ms(() => globalThis.__ms.state.endState?.state), 'won');

    const lost = await play(BOARD, [[4, 'left'], [0, 'left']]);
    assert.equal(lost.state, 'lost', JSON.stringify(lost));
    assert.deepEqual(lost.pressed, [1, 1, 1, 1, 1, 1, 1, 1, 1], 'a loss shows the whole board');
    assert.equal(await ms(() => globalThis.__ms.game.explodedIdx), 0);
    assert.equal(await ms(() => globalThis.__ms.state.endState?.state), 'lost');

    // from a mine count, the first click is always safe: the worker's board arrives, then the reveal
    for (let i = 0; i < 5; i++) {
      await play({ X: 3, Y: 3, Z: 3, mines: 26 }, [[7, 'left']]);
      await page.waitForFunction(() => globalThis.__ms.state.endState !== null, null, { timeout: 15000 });
      assert.equal(await ms(() => globalThis.__ms.game.state), 'won', 'with every other cell a mine, the safe first click wins');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
