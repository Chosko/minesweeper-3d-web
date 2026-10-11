// The 3D end of game (feature 3d-results-records-screens): at a win or a loss input freezes while
// the end effect plays, and after one end delay the 3D mode releases pointer lock and reports game
// finished, so the shared results screen takes over the 3D scene. The adapter's delay, the ignored
// pause and the hidden-tab and lost-context rules over fakes; the banner's removal and the shell's
// input guards as static checks; in a browser, a 3D board won and lost through the real shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModeHost, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DMode, END_DELAY_MS } from '../js/shell/mode-3d.js';
import { resultsContent, createResultsView } from '../js/results/view.js';
import { createBoardIdentity } from '../js/records/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

// ---------------------------------------------------------------- fakes

// A clock whose timers fire only when the test advances it: a hidden tab runs no frames, but its
// timers still fire.
function fakeClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) { timers.delete(id); t.fn(); }
      }
    },
    get pending() { return timers.size; },
  };
}

const CLICKS = Object.freeze({ reveal: { effective: 2, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
function fakeSession({ fixed = false } = {}) {
  const listeners = { generating: new Set(), started: new Set(), failed: new Set(), finished: new Set() };
  const s = {
    board: { X: 4, Y: 5, Z: 6, mines: 7, noGuess: false },
    seed: fixed ? null : 99,
    generatorVersion: fixed ? null : 1,
    ms: 0,
    outcome: null,
    calls: [],
    elapsedMs: () => s.ms,
    counts: () => ({ bbbv: 10, bbbvSolved: 4, clicks: CLICKS }),
    engineSummary: () => (s.outcome
      ? { outcome: s.outcome, dimensions: { width: 4, height: 5, depth: 6 }, mineCount: 7, bbbv: 10, bbbvSolved: s.outcome === 'won' ? 10 : 4, clicks: CLICKS }
      : null),
    replay: (summary) => (summary ? { blob: new Uint8Array([1]), listing: { id: summary.id } } : null),
    on(type, fn) { listeners[type].add(fn); return () => listeners[type].delete(fn); },
    emit(type, payload) {
      if (type === 'finished') s.outcome = payload.state;
      for (const fn of [...listeners[type]]) fn(payload);
    },
    pause() { s.calls.push('pause'); },
    resume() { s.calls.push('resume'); },
    leave() { s.calls.push('leave'); },
  };
  return s;
}

// The 3D mode on a host, over a fake flow that logs every call in one list with the host's reports.
function setup({ fixed = false } = {}) {
  const clock = fakeClock();
  const log = [];
  const sessions = [];
  const next = () => { const s = fakeSession({ fixed }); sessions.push(s); return s; };
  const flow = {
    clock,
    lost: false,
    contextLost: () => flow.lost,
    openBoardChoice: () => log.push(['openBoardChoice']),
    start: () => { log.push(['start']); return next(); },
    pause: (note) => log.push(['flow.pause', note]),
    resume: (source) => log.push(['resume', source]),
    restart: (source) => { log.push(['restart', source]); return next(); },
    leave: () => log.push(['leave']),
    release: () => log.push(['release']),
  };
  const host = createModeHost();
  const events = [];
  for (const t of MODE_EVENTS) host.on(t, (e) => { events.push([t, e]); log.push([t]); });
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  const types = () => events.map(([t]) => t);
  const session = () => sessions.at(-1);
  return { host, mode, flow, clock, log, events, types, session, sessions };
}

// A started game that has just been won or lost.
function ended(state, opts) {
  const ctx = setup(opts);
  ctx.host.start('3d', { X: 4, Y: 5, Z: 6, mines: 7 });
  ctx.session().emit('started', {});
  ctx.session().ms = 9000;
  ctx.session().emit('finished', { state });
  return ctx;
}

// ---------------------------------------------------------------- the end delay

test('the end delay is one constant of one second, shared by win and loss', () => {
  assert.equal(END_DELAY_MS, 1000);
  const src = strip(read('js/shell/mode-3d.js'));
  assert.equal(src.match(/END_DELAY_MS/g).length >= 2, true, 'the adapter waits for the exported constant');
  assert.doesNotMatch(src, /setTimeout\([^)]*\b\d{3,}\b/, 'no other delay is written in the adapter');
});

test('at a win or a loss the game stops being pausable at once, and is reported finished once, after the end delay', () => {
  for (const state of ['won', 'lost']) {
    const { types, events, mode, clock, log } = ended(state);
    assert.deepEqual(types(), ['started', 'canPause', 'canPause'], 'pause is not offered, and nothing is finished yet');
    assert.equal(events.at(-1)[1].canPause, false);
    assert.equal(mode.ending, true, 'the end sequence is running');
    clock.advance(END_DELAY_MS - 1);
    assert.equal(types().includes('finished'), false, 'the end effect plays for the whole delay');
    clock.advance(1);
    assert.deepEqual(types(), ['started', 'canPause', 'canPause', 'finished']);
    const { summary, replay } = events.at(-1)[1];
    assert.equal(summary.outcome, state);
    assert.equal(summary.elapsedMs, 9000);
    assert.deepEqual(replay, { blob: new Uint8Array([1]), listing: { id: summary.id } }, 'the sealed replay goes beside the summary');
    assert.deepEqual(log.slice(-2), [['release'], ['finished']], 'pointer lock is released before the results screen takes over');
    assert.equal(mode.ending, false);
    clock.advance(10 * END_DELAY_MS);
    assert.equal(types().filter((t) => t === 'finished').length, 1, 'game finished is reported once');
  }
});

test('the summary is the game\'s at its end, whatever the clock reads when the delay ends', () => {
  const { events, session, clock } = ended('won');
  session().ms = 9500;
  clock.advance(END_DELAY_MS);
  assert.equal(events.at(-1)[1].summary.elapsedMs, 9000);
});

test('during the end delay a pause is ignored: the session is not paused and no pause card is asked for', () => {
  const { host, mode, session, log, clock, types } = ended('lost');
  const before = log.length;
  for (const source of ['key', 'pad', 'button', 'blur', 'hidden']) host.pause({ source });
  mode.pause({ note: 'Controller disconnected' });
  assert.deepEqual(log.slice(before), [], 'the flow is asked for nothing');
  assert.deepEqual(session().calls, [], 'the session is not paused');
  clock.advance(END_DELAY_MS);
  assert.equal(types().at(-1), 'finished');
});

test('a hidden tab: no frames run, and the summary is still reported at the end of the delay', () => {
  const { mode, clock, events, types } = ended('won');
  mode.pause({ source: 'hidden' }); // the shell's automatic pause when the tab hides
  // no tick(): a hidden tab draws no frames, and the end does not wait for one
  clock.advance(END_DELAY_MS);
  assert.equal(types().at(-1), 'finished', 'the summary is handed off to be recorded at the end of the delay');
  assert.equal(events.at(-1)[1].summary.outcome, 'won');
});

test('a lost graphics context during the delay is a mode failure, and the summary is still reported first', () => {
  const { mode, clock, events, types, session } = ended('lost');
  mode.contextLost();
  assert.deepEqual(types().slice(-2), ['finished', 'failed']);
  assert.equal(events.at(-2)[1].summary.outcome, 'lost', 'the finished game is recorded, never abandoned');
  assert.deepEqual(events.at(-1)[1], { mode: '3d', reason: 'graphics context lost', screen: 'ctxlost' });
  assert.deepEqual(session().calls, ['leave']);
  assert.equal(mode.ending, false);
  clock.advance(10 * END_DELAY_MS);
  assert.equal(types().filter((t) => t === 'finished').length, 1, 'the delay ends nothing more');
  assert.equal(types().includes('abandoned'), false);
});

test('a page going away during the delay ends it now: the game is reported finished, never abandoned', () => {
  const { mode, clock, events, types, host } = ended('won');
  mode.finishNow();
  assert.equal(types().at(-1), 'finished');
  assert.equal(events.at(-1)[1].summary.outcome, 'won');
  assert.equal(host.summary().outcome, 'won', 'the in-progress hand-off now sees a finished game, not an abandoned one');
  assert.equal(mode.ending, false);
  mode.finishNow();
  clock.advance(10 * END_DELAY_MS);
  assert.equal(types().filter((t) => t === 'finished').length, 1, 'reported once');
  assert.equal(types().includes('abandoned'), false);
});

test('js/main.js ends the delay on pagehide before keeping the game, and the leave-page guard does not prompt during it', () => {
  assert.match(MAIN, /addEventListener\('pagehide', \(\) => \{ if \(ending3D\(\)\) mode3d\.finishNow\(\); PAUSE\.pageHide\(\); \}\)/);
  assert.match(fnBody(MAIN, 'guardLeave'), /ending3D\(\)/);
});

test('a fixed board, which has no summary, still ends its delay with game finished', () => {
  const { clock, events, types } = ended('won', { fixed: true });
  clock.advance(END_DELAY_MS);
  assert.equal(types().at(-1), 'finished');
  assert.equal(events.at(-1)[1].summary, null);
});

test('a game the adapter no longer holds reports nothing when its delay would have ended', () => {
  const { host, clock, types } = ended('won');
  host.leave();
  clock.advance(10 * END_DELAY_MS);
  assert.equal(types().includes('finished'), false);
  assert.equal(clock.pending, 0, 'the delay is cancelled with the game');
});

// ---------------------------------------------------------------- the shell's guards (static)

const MAIN = strip(read('js/main.js'));
const fnBody = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `js/main.js has ${name}`);
  let depth = 0;
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
};

test('the end banner, its compact form and its best-time line are gone', () => {
  assert.doesNotMatch(read('index.html'), /id="banner|banner-record|banner-hint/);
  assert.doesNotMatch(strip(read('js/ui.js')), /banner/i);
  assert.doesNotMatch(MAIN, /Banner/);
  assert.doesNotMatch(read('css/style.css'), /#banner|\.banner-/);
});

test('every pause in js/main.js goes through the guard that ignores it during the end delay', () => {
  assert.equal(MAIN.match(/PAUSE\.pause\(/g).length, 1, 'PAUSE.pause is called in one place');
  const guard = fnBody(MAIN, 'pauseGame');
  assert.match(guard, /ending3D\(\)/);
  assert.match(guard, /PAUSE\.pause\(/);
  assert.match(fnBody(MAIN, 'ending3D'), /mode3d\.ending/);
});

test('Esc, the controller and camera movement are ignored during the end delay', () => {
  assert.match(fnBody(MAIN, 'shellBack'), /ending3D\(\)/, 'Back (Esc, the controller\'s back buttons) is ignored');
  assert.match(fnBody(MAIN, 'padPlaying'), /ending3D\(\)/, 'the controller\'s Start, triggers and sticks are ignored');
  assert.match(MAIN, /isActive: \(\) => S\.mode === 'playing' && !ending3D\(\)/, 'mouse look, wheel and buttons are ignored');
  assert.match(fnBody(MAIN, 'frame'), /ending3D\(\)/, 'camera movement and view-mode keys are ignored');
});

test('the 3D flow releases pointer lock for the results screen', () => {
  const flow = MAIN.slice(MAIN.indexOf('const FLOW_3D = {'), MAIN.indexOf('const mode3d ='));
  assert.match(flow, /release: \(\) => input\.exitLock\(\)/);
});

test('the 3D scene stops rendering while the results screen shows over it', () => {
  assert.match(fnBody(MAIN, 'shouldRender'), /S\.mode === 'results'/);
});

// ---------------------------------------------------------------- the results surface

const BOARD_3D = createBoardIdentity({ mode: '3d', width: 4, height: 5, depth: 6, mines: 7, noGuess: false });
const BOARD_2D = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const summary = (board) => ({
  id: 'g1', board, outcome: 'won', elapsedMs: 9000, bbbv: 10, bbbvSolved: 10, clicks: CLICKS,
  bbbvPerSecond: 10 / 9, efficiency: 500, seed: 1, generatorVersion: 1, endedAt: '2026-10-11T10:00:00.000Z',
});

test('the results screen takes over a 3D game on an opaque surface; over Classic 2D the board stays visible', () => {
  assert.equal(resultsContent({ summary: summary(BOARD_3D) }).takeover, true);
  assert.equal(resultsContent({ summary: summary(BOARD_2D) }).takeover, false);
  const classes = new Set();
  const node = () => ({
    textContent: '', classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    addEventListener() {}, toggleAttribute() {}, querySelector: () => node(),
  });
  const root = {
    querySelector: () => node(),
    classList: {
      toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
    },
  };
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  view.show(resultsContent({ summary: summary(BOARD_3D) }));
  assert.equal(classes.has('results--takeover'), true);
  view.show(resultsContent({ summary: summary(BOARD_2D) }));
  assert.equal(classes.has('results--takeover'), false);
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/#results\.results--takeover\s*\{([^}]*)\}/);
  assert.ok(rule, 'the takeover surface has its rule');
  assert.match(rule[1], /background:\s*var\(--color-backdrop\)/, 'an opaque surface in the chosen theme');
  assert.match(rule[1], /backdrop-filter:\s*none/);
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

test('in a browser, a 3D board won and lost ends on the results screen, which takes over the scene', async (t) => {
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
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    await ms(() => {
      globalThis.__hand = [];
      globalThis.__ms.pauser.attach('finished', (s) => globalThis.__hand.push(['finished', s?.outcome ?? null]));
      globalThis.__ms.pauser.attach('abandoned', (s) => globalThis.__hand.push(['abandoned', s?.outcome ?? null]));
    });

    // A row of eight with three mines: the board is generated around the first click on cell 0, so
    // it is a recorded game; its mines are read from the state view once it arrives.
    const BOARD = { X: 8, Y: 1, Z: 1, mines: 3 };
    const firstClick = async () => {
      await ms((b) => {
        globalThis.__ms.modes.start('3d', b);
        globalThis.__ms.forcePlay();
        globalThis.__ms.aimAt(0);
        globalThis.__ms.click('left');
      }, BOARD);
      await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 15000 });
    };
    const mines = () => ms(() => { const g = globalThis.__ms.game; return [...Array(g.n).keys()].filter((c) => g.number[c] === -1); });
    const play = (cells) => ms((cs) => {
      for (const c of cs) {
        if (globalThis.__ms.game.state !== 'playing') break;
        if (globalThis.__ms.game.pressed[c]) continue;
        if (globalThis.__ms.aimAt(c) !== c) return `cell ${c} could not be aimed at`;
        globalThis.__ms.click('left');
      }
      return globalThis.__ms.game.state;
    }, cells);

    // ---- a win
    await firstClick();
    const bombs = await mines();
    assert.equal(bombs.length, 3);
    const safe = [...Array(8).keys()].filter((c) => !bombs.includes(c));
    // the win and, in the same task, everything the end delay must ignore: the board is still shown,
    // nothing is finished, and Esc, the pause button, blur and a hidden tab offer no pause
    const during = await ms((cs) => {
      const m = globalThis.__ms;
      for (const c of cs) { if (!m.game.pressed[c]) { m.aimAt(c); m.click('left'); } }
      const out = { state: m.game.state, endedAt: performance.now(), finished: m.modes.state.finished, endState: m.state.endState?.state };
      out.cam = { ...m.info().cam };
      const modes = [];
      m.pause(); modes.push(m.state.mode);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })); modes.push(m.state.mode);
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
      modes.push(m.state.mode);
      window.dispatchEvent(new Event('blur')); modes.push(m.state.mode);
      document.getElementById('hud-pause').click(); modes.push(m.state.mode);
      out.modes = modes;
      m.key('KeyW');
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        out.camAfter = { ...m.info().cam };
        out.frameAt = performance.now();
        out.modeAfter = m.state.mode;
        m.key('KeyW', false);
        r(out);
      })));
    }, safe);
    assert.equal(during.state, 'won');
    assert.equal(during.finished, false, 'game finished waits for the end delay');
    assert.equal(during.endState, 'won', 'the HUD\'s end state is frozen');
    assert.deepEqual(during.modes, ['playing', 'playing', 'playing', 'playing', 'playing'], 'no pause is offered');
    if (during.frameAt - during.endedAt < 1000) assert.equal(during.modeAfter, 'playing');
    assert.deepEqual(during.camAfter, during.cam, 'the camera does not move');

    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 5000 });
    const waited = await ms(() => performance.now()) - during.endedAt;
    assert.ok(waited >= 1000, `the results screen waits for the end delay (${waited} ms)`);
    assert.deepEqual(await ms(() => globalThis.__hand), [['finished', 'won']], 'recorded once, as won');
    assert.equal(await ms(() => document.getElementById('results-title').textContent), 'You won!');
    assert.equal(await ms(() => document.pointerLockElement), null, 'pointer lock is released');
    assert.equal(await ms(() => document.getElementById('banner')), null, 'there is no end banner');
    const surface = await ms(() => {
      const el = document.getElementById('results');
      const cs = getComputedStyle(el);
      return { takeover: el.classList.contains('results--takeover'), bg: cs.backgroundColor, filter: cs.backdropFilter };
    });
    assert.equal(surface.takeover, true);
    assert.doesNotMatch(surface.bg, /rgba\(.*,\s*0(\.\d+)?\)$/, `the surface is opaque (${surface.bg})`);
    assert.equal(surface.filter, 'none');
    await frames(3);
    const r0 = await ms(() => globalThis.__ms.frameStats.renders);
    await ms(() => globalThis.__ms.wheel(3)); // a change the scene would redraw for
    await frames(10);
    assert.equal(await ms(() => globalThis.__ms.frameStats.renders), r0, 'the 3D scene stops rendering under the results screen');

    // Records, Back, then Play again starts the same 3D board choice
    await ms(() => document.getElementById('r-records').click());
    assert.equal(await mode(), 'records');
    await ms(() => document.getElementById('records-back').click());
    assert.equal(await mode(), 'results');
    await ms(() => document.getElementById('r-again').click());
    assert.ok(['ready', 'playing'].includes(await mode()), 'a new board, entered as resume enters play');
    assert.equal(await ms(() => globalThis.__ms.modes.active), '3d');
    assert.equal(await ms(() => globalThis.__ms.state.started), false);
    assert.deepEqual(await ms(() => globalThis.__ms.state.settings), { X: 8, Y: 1, Z: 1, mines: 3 });

    // ---- a loss: a board the first click did not already win, then a mine
    let lost = false;
    for (let i = 0; i < 10 && !lost; i++) {
      await firstClick();
      if (await ms(() => globalThis.__ms.game.state) !== 'playing') {
        await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 5000 });
        continue;
      }
      assert.equal(await play([(await mines())[0]]), 'lost');
      lost = true;
    }
    assert.ok(lost, 'a board was lost');
    assert.equal(await mode(), 'playing', 'the loss wave plays on the board first');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: 5000 });
    assert.equal(await ms(() => document.getElementById('results-title').textContent), 'Game over');
    assert.equal(await ms(() => document.getElementById('rs-bbbvSolved').classList.contains('hidden')), false, '3BV solved shows on a loss');
    assert.equal((await ms(() => globalThis.__hand)).at(-1)[1], 'lost');
    assert.equal((await ms(() => globalThis.__hand)).some(([h]) => h === 'abandoned'), false, 'a finished 3D game is never abandoned');

    // Play again from the results screen itself, with the mode still active
    await ms(() => document.getElementById('r-again').click());
    assert.ok(['ready', 'playing'].includes(await mode()));
    assert.equal(await ms(() => globalThis.__ms.state.started), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
