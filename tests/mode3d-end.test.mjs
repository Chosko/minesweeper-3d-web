// The 3D end of game (feature 3d-results-records-screens): at a win or a loss input freezes while
// the end effect plays, and after the board's end delay the 3D mode releases pointer lock and
// reports game finished, so the shared results screen shows over the dimmed 3D scene, where Look at
// the board flies over the frozen finished board. The adapter's delay, the ignored pause and the
// hidden-tab and lost-context rules over fakes; the banner's removal and the shell's input guards
// as static checks; in a browser, 3D boards won and lost through the real shell, and looked at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModeHost, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DMode, END_DELAY_MS, endDelayMs } from '../js/shell/mode-3d.js';
import { createEndSkip } from '../js/shell/end-skip.js';
import { resultsContent, createResultsView } from '../js/results/view.js';
import { createBoardIdentity } from '../js/records/board.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
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
    pauses: () => [],
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

test('the end delay is one function of the finished board, shared by win and loss; one second on this small board', () => {
  assert.equal(endDelayMs({ X: 4, Y: 5, Z: 6 }), END_DELAY_MS);
  assert.equal(END_DELAY_MS, 1000);
  const src = strip(read('js/shell/mode-3d.js'));
  assert.match(src, /clock\.setTimeout\(\(\) => finish\(g\), endDelayMs\(session\.board\)\)/, 'the adapter waits for the finished board\'s delay');
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
  assert.match(MAIN, /addEventListener\('pagehide', \(\) => \{ if \(endDelay\(\)\) activeMode\(\)\.finishNow\(\); PAUSE\.pageHide\(\); \}\)/);
  assert.match(fnBody(MAIN, 'guardLeave'), /endDelay\(\)/);
});

// ---------------------------------------------------------------- a press ends the delay

// The 3D adapter in its end delay, behind the shell's skip as js/main.js builds it.
function skipping(state) {
  const ctx = ended(state);
  const skip = createEndSkip({ ending: () => ctx.mode.ending, skip: () => ctx.mode.finishNow() });
  return { ...ctx, skip };
}

test('a key, a mouse button or a controller button pressed during the 3D end delay reports the game finished at once, and is consumed', () => {
  const presses = {
    key: (s) => s.keyDown({ code: 'KeyW', repeat: false }),
    'mouse button': (s) => s.press(),
    'controller button': (s) => s.pad(true),
  };
  for (const [what, press] of Object.entries(presses)) {
    for (const state of ['won', 'lost']) {
      const { skip, types, events, mode, clock, log } = skipping(state);
      assert.equal(press(skip), true, `${what}: consumed, so nothing else acts on it`);
      assert.deepEqual(types(), ['started', 'canPause', 'canPause', 'finished'], `${what}: finished at once`);
      assert.equal(events.at(-1)[1].summary.outcome, state);
      assert.deepEqual(log.slice(-2), [['release'], ['finished']], 'pointer lock released for the results screen');
      assert.equal(mode.ending, false);
      clock.advance(10 * END_DELAY_MS);
      assert.equal(types().filter((t) => t === 'finished').length, 1, 'reported once');
      assert.equal(types().includes('abandoned'), false);
    }
  }
});

test('nothing but a fresh press ends the delay: a key held from the game, a release and a still controller poll do not', () => {
  const { skip, types, mode } = skipping('won');
  assert.equal(skip.keyDown({ code: 'KeyW', repeat: true }), true, 'a held key\'s auto-repeat is consumed …');
  assert.equal(skip.release({ buttons: 0 }), true, 'a release is consumed …');
  assert.equal(skip.pad(false), true, 'a controller poll with nothing pressed is consumed …');
  assert.equal(skip.click(), true);
  assert.equal(mode.ending, true, '… and none of them ends the delay');
  assert.equal(types().includes('finished'), false);
  assert.equal(skip.keyUp({ code: 'KeyW' }), false, 'the held key\'s release goes through');
  assert.equal(skip.keyDown({ code: 'KeyW', repeat: false }), true, 'pressed again, it is a fresh press');
  assert.equal(types().at(-1), 'finished');
});

test('the mouse press that ended the delay is consumed whole: its release and its click, then nothing more', () => {
  const { skip, mode } = skipping('lost');
  assert.equal(skip.press(), true);
  assert.equal(mode.ending, false);
  assert.equal(skip.press(), true, 'the same press seen as mousedown after pointerdown');
  assert.equal(skip.release({ buttons: 1 }), true, 'a button released while another is held');
  assert.equal(skip.release({ buttons: 0 }), true, 'the last button released');
  assert.equal(skip.click(), true, 'the click it brings');
  assert.equal(skip.click(), true, 'and a right button\'s auxclick and context menu');
  assert.equal(skip.press(), false, 'a fresh press reaches the results card');
  assert.equal(skip.release({ buttons: 0 }), false);
  assert.equal(skip.click(), false, 'and so does its click');
  const again = skipping('won').skip;
  again.press();
  again.release({ buttons: 0 });
  assert.equal(again.keyDown({ code: 'Enter', repeat: false }), false, 'a key press ends the skipping gesture too …');
  assert.equal(again.click(), false, '… so Enter\'s own click on a focused button goes through');

  const pad = skipping('won').skip;
  pad.press();
  pad.release({ buttons: 0 });
  assert.equal(pad.click({ isTrusted: true }), true, 'the gesture\'s own click is consumed');
  assert.equal(pad.click({ isTrusted: false }), false, 'a script\'s click — the controller\'s A on a focused button — goes through');
  assert.equal(pad.pad(true), false, 'a controller press after the delay is the shell\'s …');
  assert.equal(pad.click({ isTrusted: true }), false, '… and ends the skipping gesture');
});

test('during the delay every click is consumed, a script\'s too; losing focus forgets the releases it waited for', () => {
  const { skip } = skipping('won');
  assert.equal(skip.click({ isTrusted: false }), true, 'the overlay\'s pause button clicked by script does nothing');
  assert.equal(skip.keyDown({ code: 'ControlLeft', repeat: false }), true, 'Ctrl ends the delay');
  skip.reset(); // its release lands in another tab
  assert.equal(skip.keyDown({ code: 'ControlLeft', repeat: false }), false, 'the next Ctrl press reaches the game');
  assert.equal(skip.keyUp({ code: 'ControlLeft' }), false);
  assert.match(MAIN, /window\.addEventListener\('blur', \(\) => \{ END_SKIP\.reset\(\); LOOK_END\.reset\(\); \}\)/);
  assert.match(MAIN, /addEventListener\('visibilitychange', \(\) => \{ if \(document\.hidden\) \{ END_SKIP\.reset\(\); LOOK_END\.reset\(\); \} \}\)/);
  assert.match(MAIN, /if \(END_SKIP\.click\(e\) \|\| \(!lookTouch\(e\) && LOOK_END\.click\(e\)\)\) swallow\(e\)/, 'the click\'s isTrusted reaches the skip');
});

test('the pointer lock released during the delay — the browser\'s Esc, whose key the page never sees — ends it', () => {
  const { skip, types } = skipping('won');
  assert.equal(skip.lockLost(), true);
  assert.equal(types().at(-1), 'finished');
  assert.equal(skip.lockLost(), false, 'outside the delay a lost lock is the shell\'s as before');
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
  assert.match(guard, /endDelay\(\)/);
  assert.match(guard, /PAUSE\.pause\(/);
  assert.match(fnBody(MAIN, 'endDelay'), /activeMode\(\)\?\.ending/, 'either mode\'s end delay');
  assert.match(fnBody(MAIN, 'activeMode'), /mode3d/);
  assert.match(fnBody(MAIN, 'activeMode'), /mode2d/);
});

test('during the end delay a press ends it and nothing else acts: the shell consumes it before any other listener', () => {
  assert.match(MAIN, /const END_SKIP = createEndSkip\(\{ ending: \(\) => endDelay\(\), skip: \(\) => activeMode\(\)\?\.finishNow\(\) \}\)/);
  assert.match(MAIN, /window\.addEventListener\('keydown', \(e\) => \{ if \(END_SKIP\.keyDown\(e\)/, 'keydown in the capture phase');
  assert.match(MAIN, /window\.addEventListener\('keyup', \(e\) => \{ if \(\[END_SKIP\.keyUp\(e\), LOOK_END\.keyUp\(e\)\]\.some\(Boolean\)\) swallow\(e\); \}, true\)/, 'keyup in the capture phase');
  assert.match(MAIN, /for \(const type of \['pointerdown', 'mousedown'\]\) window\.addEventListener\(type, \(e\) => \{ if \(END_SKIP\.press\(\)/);
  assert.match(MAIN, /for \(const type of \['pointerup', 'mouseup'\]\)/);
  assert.match(MAIN, /for \(const type of \['click', 'auxclick', 'contextmenu'\]\)/);
  assert.match(MAIN, /const swallow = \(e\) => \{ e\.preventDefault\(\); e\.stopImmediatePropagation\(\); \}/);
  const pad = fnBody(MAIN, 'handlePad');
  assert.ok(pad.indexOf('END_SKIP.pad(') >= 0 && pad.indexOf('END_SKIP.pad(') < pad.indexOf('restartInput('), 'the controller: before Start + Y and every screen');
  assert.match(MAIN, /onLockChange: \(locked\) => \{[\s\S]*?END_SKIP\.lockLost\(\)/, 'the browser\'s Esc releasing the lock');
});

test('Back, camera movement and the view-mode keys are ignored during the end delay', () => {
  assert.match(fnBody(MAIN, 'shellBack'), /endDelay\(\)/, 'Back (Esc, the controller\'s back buttons) is ignored');
  assert.match(fnBody(MAIN, 'historyBack'), /endDelay\(\)/, 'the browser\'s Back too');
  assert.match(MAIN, /isActive: \(\) => \(S\.mode === 'playing' && !endDelay\(\)\) \|\| looking\(\)/, 'mouse look, wheel and buttons are ignored');
  assert.match(fnBody(MAIN, 'frame'), /endDelay\(\)/, 'camera movement and view-mode keys are ignored');
  assert.doesNotMatch(MAIN, /ending3D/, 'one end-delay test for both modes');
});

test('the 3D flow releases pointer lock for the results screen', () => {
  const flow = MAIN.slice(MAIN.indexOf('const FLOW_3D = {'), MAIN.indexOf('const mode3d ='));
  assert.match(flow, /release: \(\) => input\.exitLock\(\)/);
});

test('the 3D scene is drawn behind a 3D results screen on demand only: a resize, an end effect still running, the card\'s first frame', () => {
  const body = fnBody(MAIN, 'shouldRender');
  assert.match(body, /if \(S\.mode === 'results' && RESULTS\.current\?\.mode === '3d'\) return needRender \|\| synced \|\| rendererAnimating\(\) === true;/);
  assert.match(MAIN, /onChange: \(\) => \{ layerChanged\(\); needRender = true;/, 'every screen change draws one frame');
  assert.match(MAIN, /window\.addEventListener\('resize', \(\) => \{ renderer\.resize\(\); needRender = true; \}\)/);
});

// ---------------------------------------------------------------- the look (static)

test('the look gates every board action and the pause', () => {
  assert.match(fnBody(MAIN, 'onAction'), /if \(!g \|\| S\.selected < 0 \|\| looking\(\)\) return;/, 'no reveal, flag or chord');
  assert.match(fnBody(MAIN, 'pauseGame'), /endDelay\(\) \|\| looking\(\)/, 'no pause');
  assert.match(fnBody(MAIN, 'looking'), /S\.mode === LOOK_SCREEN/);
  // a press in the look ends it and is consumed before Input or MouseActions sees it
  assert.match(MAIN, /const LOOK_END = createEndSkip\(\{ ending: \(\) => looking\(\), skip: \(\) => endLook\(\) \}\)/);
  assert.match(MAIN, /for \(const type of \['pointerdown', 'mousedown'\]\) window\.addEventListener\(type, \(e\) => \{ if \(END_SKIP\.press\(\) \|\| \(!lookTouch\(e\) && LOOK_END\.press\(\)\)\) swallow\(e\); \}, true\)/);
  assert.match(MAIN, /if \(END_SKIP\.release\(e\) \|\| \(!lookTouch\(e\) && LOOK_END\.release\(e\)\)\) swallow\(e\)/);
  // on a coarse-only device a touch on the scene flies the look (the stick, the drag) and its tap ends it
  assert.match(MAIN, /const lookTouch = \(e\) => COARSE_ONLY && looking\(\) && \(\(e\.pointerType === 'touch' && e\.target === canvas\) \|\| !!e\.target\?\.closest\?\.\('#touch-modes'\)\);/, 'and the touch toolbar toggles in the look');
  assert.match(MAIN, /onTap: \(\) => \{ if \(looking\(\)\) endLook\(\); \}/);
  assert.match(MAIN, /if \(END_SKIP\.click\(e\) \|\| \(!lookTouch\(e\) && LOOK_END\.click\(e\)\)\) swallow\(e\)/);
  assert.match(MAIN, /if \(END_SKIP\.keyDown\(e\) \|\| \(\(isBackKey\(e\.code\) \|\| !looking\(\)\) && LOOK_END\.keyDown\(e\)\)\) swallow\(e\)/, 'Esc ends the look; the flight and view-mode keys fly; outside it every key reaches LOOK_END');
  assert.match(fnBody(MAIN, 'showResults'), /over3d: content\.over3d && board/, 'the scene behind the card only while the finished board is there');
  assert.match(fnBody(MAIN, 'refusedLook'), /RESULTS_VIEW\.noteLook\(LOOK_REFUSED\);\s*keyFocus\(document\.getElementById\('r-look'\)\)/, 'a refused lock: the note, and focus on Look at the board so Enter retries');
  const pad = fnBody(MAIN, 'handlePad');
  assert.ok(pad.indexOf('LOOK_END.pad(') > pad.indexOf('END_SKIP.pad(') && pad.indexOf('LOOK_END.pad(') < pad.indexOf('restartInput('), 'any controller button ends the look before anything else reads it');
  assert.match(fnBody(MAIN, 'padLook'), /padSticks\(p, dt\)/, 'the sticks fly');
  assert.doesNotMatch(fnBody(MAIN, 'padLook'), /mouse\.|padClick|backGame|pauseGame/, 'and nothing else');
  assert.match(MAIN, /\} else if \(LOOK_END\.lockLost\(\)\) \{/, 'the browser\'s Esc releasing the lock returns to the card');
  assert.match(fnBody(MAIN, 'frame'), /const looking3D = looking\(\)/);
  assert.match(fnBody(MAIN, 'frame'), /if \(\(playing && !frozen\) \|\| looking3D\) \{\s*cam\.move\(dt, input\.move\)/, 'the camera flies in the look');
});

// ---------------------------------------------------------------- the results surface

const BOARD_3D = createBoardIdentity({ mode: '3d', width: 4, height: 5, depth: 6, mines: 7, noGuess: false });
const BOARD_2D = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const summary = (board) => ({
  id: 'g1', board, outcome: 'won', elapsedMs: 9000, bbbv: 10, bbbvSolved: 10, clicks: CLICKS,
  bbbvPerSecond: 10 / 9, efficiency: 500, seed: 1, generatorVersion: 1, endedAt: '2026-10-11T10:00:00.000Z',
});

test('the results screen shows over a 3D game on a dimmed translucent surface, the scene behind it; over Classic 2D the board stays visible', () => {
  assert.equal(resultsContent({ summary: summary(BOARD_3D) }).over3d, true);
  assert.equal(resultsContent({ summary: summary(BOARD_2D) }).over3d, false);
  const classes = new Set();
  const node = () => ({
    textContent: '', classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
    addEventListener() {}, toggleAttribute() {}, setAttribute() {}, removeAttribute() {}, querySelector: () => node(),
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
  assert.equal(classes.has('results--over3d'), true);
  view.show(resultsContent({ summary: summary(BOARD_2D) }));
  assert.equal(classes.has('results--over3d'), false);
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /results--takeover/, 'the opaque takeover surface is gone');
  const theme = read('themes/joyful-tiles/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(theme, /#results\.results--over3d/, 'over the 3D scene the results take the one scrim, as over 2D');
  const rule = theme.match(/:is\(#pause, #ready, #results, #learn-end, #ctx-lost, \.modal\)\s*\{([^}]*)\}/);
  assert.ok(rule, 'the scrim has its rule');
  assert.match(rule[1], /background:\s*var\(--color-backdrop\)/, 'a translucent scrim of the theme');
  assert.doesNotMatch(rule[1], /backdrop-filter/, 'the scene reads behind it, unblurred');
});

// ---------------------------------------------------------------- browser

test('in a browser, a 3D board won and lost ends on the results screen, shown over the dimmed scene', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
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
      await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: patience(15000) });
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
    // nothing is finished, and a pause, a hidden tab, blur and the overlay's pause button clicked by
    // script (a click with no press, which would end the delay) offer no pause
    const during = await ms((cs) => {
      const m = globalThis.__ms;
      // clickAt: just before the winning click, so no later than the end delay's start
      let clickAt = 0;
      for (const c of cs) { if (!m.game.pressed[c]) { m.aimAt(c); clickAt = performance.now(); m.click('left'); } }
      const out = { state: m.game.state, clickAt, endedAt: performance.now(), finished: m.modes.state.finished, endState: m.state.endState?.state };
      out.cam = { ...m.info().cam };
      const modes = [];
      m.pause(); modes.push(m.state.mode);
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
    assert.deepEqual(during.modes, ['playing', 'playing', 'playing', 'playing'], 'no pause is offered');
    // a frame inside the delay, counted from before the winning click however long that click took
    if (during.frameAt - during.clickAt < END_DELAY_MS) assert.equal(during.modeAfter, 'playing');
    assert.deepEqual(during.camAfter, during.cam, 'the camera does not move');

    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000) });
    const waited = await ms(() => performance.now()) - during.endedAt;
    assert.ok(waited >= 1000, `the results screen waits for the end delay (${waited} ms)`);
    assert.deepEqual(await ms(() => globalThis.__hand), [['finished', 'won']], 'recorded once, as won');
    assert.equal(await ms(() => document.getElementById('results-title').textContent), 'You won!');
    // The overlay's click count froze with the timer and agrees with the recorded game; the 3D card
    // carries the same tiles and details as Classic 2D's.
    const card = await ms(() => {
      const m = globalThis.__ms;
      const key = m.records.boardsPlayed('3d')[0].key;
      const c = m.records.history(key).at(-1).clicks;
      const text = (id) => document.getElementById(id).textContent;
      return {
        hud: text('hud-clicks'), counted: c.reveal.effective + c.reveal.wasted + c.flag.effective + c.flag.wasted + c.chord.effective + c.chord.wasted,
        clicks: document.querySelector('#rd-clicks td').textContent, boardLine: text('results-board'), rankChip: document.getElementById('results-rank').classList.contains('hidden'),
        badges: [...document.querySelectorAll('#results-tiles .ui-stat--tile')].filter((e) => !e.querySelector('.ui-chip--best')?.classList.contains('hidden') && e.querySelector('.ui-chip--best')).map((e) => e.id),
        next: document.querySelector('#rd-target td').textContent, time: document.querySelector('#rs-time .ui-stat__value').textContent,
        look: document.getElementById('results-head').contains(document.getElementById('r-look')),
        menuHint: getComputedStyle(document.querySelector('#r-menu .ui-key-hint')).display === 'none',
      };
    });
    assert.equal(card.hud, String(card.counted), 'the overlay counts the clicks the summary counts');
    assert.match(card.clicks, new RegExp(`^${card.counted} · left \\d+ · right \\d+ · chords \\d+ · wasted \\d+$`));
    assert.match(card.boardLine, / · #1 of 1 wins on this board$/, 'over the scene the rank ends the board line');
    assert.equal(card.rankChip, true, 'not in a chip');
    assert.deepEqual(card.badges, ['rs-time', 'rs-bbbvPerSecond', 'rs-efficiency'], 'every best a first win sets is badged on its tile');
    assert.equal(card.next, `beat ${card.time} · streak 1`);
    assert.equal(card.look, true, 'Look at the board sits in the header band');
    assert.equal(card.menuHint, true, 'Main menu carries no Esc hint over the scene');
    assert.match(card.time, /^\d+\.\d{3} s$/);
    assert.equal(await ms(() => document.pointerLockElement), null, 'pointer lock is released');
    assert.equal(await ms(() => document.getElementById('banner')), null, 'there is no end banner');
    const surface = await ms(() => {
      const el = document.getElementById('results');
      const cs = getComputedStyle(el);
      return { over3d: el.classList.contains('results--over3d'), bg: cs.backgroundColor, filter: cs.backdropFilter };
    });
    assert.equal(surface.over3d, true);
    assert.match(surface.bg, /rgba\(.*,\s*0\.\d+\)$/, `the surface is translucent (${surface.bg})`);
    assert.equal(surface.filter, 'none');
    // the scene is drawn behind the card while its effects run, then no frame while nothing changes
    await page.waitForFunction(() => !globalThis.__ms.renderer.isAnimating(), null, { timeout: patience(8000) });
    await frames(3);
    const r0 = await ms(() => globalThis.__ms.frameStats.renders);
    await frames(10);
    assert.equal(await ms(() => globalThis.__ms.frameStats.renders), r0, 'no frame is drawn under the results screen while nothing changes');
    await ms(() => window.dispatchEvent(new Event('resize')));
    await frames(3);
    assert.ok(await ms(() => globalThis.__ms.frameStats.renders) > r0, 'a resize draws the scene behind the card');

    // Records, Back, then Play again starts the same 3D board choice
    await ms(() => document.getElementById('r-records').click());
    assert.equal(await mode(), 'records');
    await ms(() => document.getElementById('records-back').click());
    assert.equal(await mode(), 'results');
    assert.deepEqual(await ms(() => ({ over3d: document.getElementById('results').classList.contains('results--over3d'), look: !document.getElementById('r-look').classList.contains('hidden') })),
      { over3d: false, look: false }, 'after Records the finished board is gone: no scene behind the card and no look');
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
        await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000) });
        continue;
      }
      assert.equal(await play([(await mines())[0]]), 'lost');
      lost = true;
    }
    assert.ok(lost, 'a board was lost');
    assert.equal(await mode(), 'playing', 'the loss wave plays on the board first');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000) });
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
  }
});

test('in a browser, a press during the 3D end delay shows the results at once; R plays again, entering play with no ready card when the lock is granted and the ready card when it is refused', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A stand-in pointer lock the test grants or refuses; each request notes whether the ready card
    // was visible when the activation asked for the lock.
    await page.addInitScript(() => {
      let locked = null;
      globalThis.__lock = { grant: true, asks: [] };
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
      Element.prototype.requestPointerLock = function requestPointerLock() {
        const ready = document.getElementById('ready');
        globalThis.__lock.asks.push({ readyShown: !ready.classList.contains('hidden') && getComputedStyle(ready).visibility !== 'hidden' });
        if (!globalThis.__lock.grant) {
          setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
          return Promise.reject(new Error('refused'));
        }
        locked = this;
        setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
        return Promise.resolve();
      };
      document.exitPointerLock = () => { locked = null; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0); };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    await ms(() => {
      globalThis.__hand = [];
      globalThis.__ms.pauser.attach('finished', (s) => globalThis.__hand.push(['finished', s?.outcome ?? null]));
      globalThis.__ms.pauser.attach('abandoned', (s) => globalThis.__hand.push(['abandoned', s?.outcome ?? null]));
      // the ready card seen on any frame
      globalThis.__readySeen = 0;
      const look = () => {
        const r = document.getElementById('ready');
        if (!r.classList.contains('hidden') && getComputedStyle(r).visibility !== 'hidden') globalThis.__readySeen += 1;
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });

    // A row of eight with three mines, generated around the first click on cell 0, every safe cell
    // revealed in one task: a win. With `press`, a mouse press follows in that same task, so it lands
    // inside the end delay however slow the machine.
    const BOARD = { X: 8, Y: 1, Z: 1, mines: 3 };
    const winBoard = async (press = false) => {
      await ms(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
      await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: patience(15000) });
      return ms((withPress) => {
        const m = globalThis.__ms;
        for (let c = 0; c < m.game.n; c++) {
          if (m.game.state !== 'playing') break;
          if (m.game.pressed[c] || m.game.number[c] === -1) continue;
          m.aimAt(c);
          m.click('left');
        }
        const out = { state: m.game.state, mode: m.state.mode, finished: m.modes.state.finished };
        if (withPress) {
          const canvas = document.querySelector('canvas');
          const at = { bubbles: true, cancelable: true, clientX: 550, clientY: 450, button: 0 };
          canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
          out.afterPress = m.state.mode;
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0 }));
          canvas.dispatchEvent(new MouseEvent('click', at));
        }
        return out;
      }, press);
    };
    await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); }, BOARD);

    // ---- a click during the delay: the results screen at once, the game recorded finished
    const won = await winBoard(true);
    assert.deepEqual({ ...won, afterPress: undefined }, { state: 'won', mode: 'playing', finished: false, afterPress: undefined }, 'the end delay runs');
    assert.equal(won.afterPress, 'results', 'a press ends the end delay at once');
    assert.deepEqual(await ms(() => globalThis.__hand), [['finished', 'won']], 'recorded once, as won');
    assert.equal(await ms(() => document.getElementById('results-title').textContent), 'You won!');
    assert.equal(await ms(() => document.activeElement.id), 'r-again', 'the click acted on nothing on the card');

    // ---- R plays again; the key is the pointer-lock gesture: granted, play starts with no ready card
    await ms(() => { globalThis.__readySeen = 0; });
    await page.keyboard.press('KeyR');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    assert.equal(await ms(() => globalThis.__ms.state.started), false, 'a new board');
    assert.deepEqual(await ms(() => globalThis.__ms.state.settings), { X: 8, Y: 1, Z: 1, mines: 3 }, 'of the same choice');
    assert.equal(await ms(() => globalThis.__ms.state.lockless), false, 'in locked play');
    assert.deepEqual(await ms(() => globalThis.__lock.asks.at(-1)), { readyShown: false }, 'the ready card is not shown when the lock is asked for');
    assert.equal(await ms(() => globalThis.__readySeen), 0, 'nor on any frame after');

    // ---- the next win, its delay played out; Enter on Play again with the lock refused: the ready card, with its message
    assert.equal((await winBoard()).state, 'won');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000) });
    await ms(() => { globalThis.__lock.grant = false; });
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('ready-msg').textContent !== '');
    assert.equal(await mode(), 'ready', 'the ready card is the fallback');
    assert.equal(await ms(() => getComputedStyle(document.getElementById('ready')).visibility), 'visible');
    assert.equal(await ms(() => globalThis.__ms.state.started), false, 'on a new board');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('[slow] in a browser, Look at the board: the loss wave reaches the far side before the card, which shows over the scene; the frozen board is flown over read-only until Esc or a button brings the card back', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A stand-in pointer lock that is always granted, and released as the browser's Esc releases it.
    await page.addInitScript(() => {
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
      Element.prototype.requestPointerLock = function requestPointerLock() {
        locked = this;
        setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0);
        return Promise.resolve();
      };
      document.exitPointerLock = () => { if (!locked) return; locked = null; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0); };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const layer = (c) => ms((i) => globalThis.__ms.renderer.stateData[i * 4], c);
    const press = (button = 0) => ms((b) => {
      const canvas = document.querySelector('canvas');
      const at = { bubbles: true, cancelable: true, clientX: 550, clientY: 450, button: b };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, buttons: 1 }));
      canvas.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 }));
      const during = globalThis.__ms.state.mode;
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', { ...at, buttons: 0 }));
      canvas.dispatchEvent(new MouseEvent(b === 2 ? 'contextmenu' : 'click', at));
      return during;
    }, button);
    await ms(() => {
      globalThis.__hand = [];
      globalThis.__ms.pauser.attach('finished', (s, m, replay) => {
        globalThis.__hand.push(['finished', s?.outcome ?? null]);
        globalThis.__finAt = performance.now();
        globalThis.__blob = replay?.blob ?? null;
        globalThis.__bytes = replay ? Array.from(replay.blob) : null;
      });
      globalThis.__ms.pauser.attach('abandoned', (s) => globalThis.__hand.push(['abandoned', s?.outcome ?? null]));
    });
    const stored = () => ms(() => JSON.stringify(globalThis.__ms.records.boardsPlayed('3d').map((b) => [b.key, globalThis.__ms.records.history(b.key)])));
    const mines = () => ms(() => { const g = globalThis.__ms.game; return [...Array(g.n).keys()].filter((c) => g.number[c] === -1); });
    const firstClick = async (board) => {
      await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); }, board);
      await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: patience(15000) });
      if (await ms(() => globalThis.__ms.game.state) === 'playing') return true;
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(8000) });
      return false;
    };

    // ---- a loss on a long board, whose end delay is the longest, with a wrong flag
    const LONG = { X: 100, Y: 1, Z: 1, mines: 15 };
    let playing = false;
    for (let i = 0; i < 10 && !playing; i++) playing = await firstClick(LONG);
    assert.ok(playing, 'a board the first click did not win');
    const flagged = await ms(() => {
      const m = globalThis.__ms, g = m.game;
      for (let c = g.n - 1; c >= 0; c--) {
        if (g.pressed[c] || g.flagged[c] || g.number[c] < 0) continue;
        if (m.aimAt(c) !== c) continue;
        m.click('right');
        return g.flagged[c] ? c : -1;
      }
      return -1;
    });
    assert.ok(flagged >= 0, 'a safe cell is flagged');
    const bombs = await mines();
    const lost = await ms((list) => {
      const m = globalThis.__ms;
      for (const c of list) {
        if (m.aimAt(c) !== c) continue;
        m.click('left');
        return m.game.state;
      }
      return 'no mine could be aimed at';
    }, bombs);
    assert.equal(lost, 'lost');
    await frames(2);
    const wave = await ms(() => {
      const r = globalThis.__ms.renderer, g = globalThis.__ms.game, o = r.uniforms.uEffOrigin.value;
      const far = Math.hypot(Math.max(o.x, g.X - 1 - o.x), Math.max(o.y, g.Y - 1 - o.y), Math.max(o.z, g.Z - 1 - o.z));
      return { t0: r._eff?.t0 ?? null, type: r._eff?.type ?? null, reach: far * r.uniforms.uEffDelay.value };
    });
    assert.equal(wave.type, 'loss');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(8000) });
    const finAt = await ms(() => globalThis.__finAt);
    assert.ok(finAt / 1000 - wave.t0 >= wave.reach + 0.3,
      `the wave reached the far side and its reveal finished (${((wave.reach + 0.3) * 1000).toFixed(0)} ms) before the card showed (${(finAt - wave.t0 * 1000).toFixed(0)} ms)`);
    assert.equal(await ms(() => document.getElementById('results').classList.contains('results--over3d')), true);
    const r0 = await ms(() => globalThis.__ms.frameStats.renders);
    await frames(3);
    assert.ok(await ms(() => globalThis.__ms.frameStats.renders) > r0, 'the scene is drawn behind the card');
    assert.equal(await ms(() => document.getElementById('r-look').classList.contains('hidden')), false, 'Look at the board is offered');
    assert.equal(await ms(() => document.activeElement.id), 'r-again', 'Play again keeps the default focus');
    const records = await stored();
    const exploded = await ms(() => globalThis.__ms.game.explodedIdx);

    // ---- Look at the board: the click is the lock gesture; the board is the loss's end state
    await ms(() => document.getElementById('r-look').click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'look');
    assert.equal(await ms(() => document.getElementById('results').classList.contains('hidden')), true, 'the card is hidden');
    assert.equal(await ms(() => document.pointerLockElement === document.querySelector('canvas')), true, 'in pointer-locked look');
    assert.match(await ms(() => { const h = document.getElementById('look'); return h.classList.contains('hidden') ? '' : h.textContent; }), /Esc/, 'a hint names the way back');
    assert.equal(await layer(flagged), 31, 'the wrong flag is crossed');
    assert.equal(await layer(exploded), 3, 'the exploded cube is marked');
    for (const c of bombs) if (c !== exploded) assert.equal(await layer(c), 2, `the mine ${c} is shown`);
    // fly
    const cam0 = await ms(() => ({ ...globalThis.__ms.info().cam }));
    await ms(() => globalThis.__ms.key('KeyW'));
    await frames(6);
    await ms(() => globalThis.__ms.key('KeyW', false));
    assert.notDeepEqual(await ms(() => ({ ...globalThis.__ms.info().cam })), cam0, 'the camera flies');
    assert.equal(await mode(), 'look', 'a flight key does not end the look');
    // read-only: a board action does nothing, and a mouse press ends the look and does nothing else
    const v0 = await ms(() => globalThis.__ms.game.version);
    await ms(() => { const m = globalThis.__ms; m.aimAt(m.game.n - 1); m.click('left'); m.click('right'); m.click('chord'); });
    assert.equal(await ms(() => globalThis.__ms.game.version), v0, 'no reveal, flag or chord in the look');
    assert.equal(await press(0), 'results', 'a mouse button brings the card back');
    await frames(2);
    assert.equal(await mode(), 'results');
    assert.equal(await ms(() => document.activeElement.id), 'r-again', 'focus on Play again; the press activated nothing');
    assert.equal(await ms(() => document.pointerLockElement), null, 'the lock is released');
    assert.equal(await ms(() => document.getElementById('look').classList.contains('hidden')), true);

    // ---- Esc on the card opens the look; Esc in it brings the card back, and does not reopen it
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'look');
    await page.keyboard.press('Escape');
    await frames(3);
    assert.equal(await mode(), 'results', 'Esc in the look shows the card again');
    // the browser's Esc releasing the lock in the look returns to the card, and that Esc does not reopen it
    await page.waitForTimeout(600);
    await ms(() => document.getElementById('r-look').click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'look');
    await ms(() => document.exitPointerLock());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
    await page.keyboard.press('Escape');
    await frames(3);
    assert.equal(await mode(), 'results', 'the Esc that released the lock does not reopen the look');

    // ---- Watch replay and back: the end state is drawn the same
    await ms(() => document.getElementById('r-watch').click());
    assert.equal(await mode(), 'replay');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
    assert.equal(await layer(flagged), 31, 'the wrong flag survives the replay viewer');
    assert.equal(await layer(exploded), 3);

    // ---- nothing was recorded by the look
    assert.equal(await stored(), records, 'the records and history are what they were');
    assert.equal(await ms(() => JSON.stringify(Array.from(globalThis.__blob)) === JSON.stringify(globalThis.__bytes)), true, 'the sealed replay is unchanged');
    assert.deepEqual(await ms(() => globalThis.__hand), [['finished', 'lost']], 'one game, recorded once');

    // ---- a win's solved board, looked at the same way
    const ROW = { X: 8, Y: 1, Z: 1, mines: 3 };
    playing = false;
    for (let i = 0; i < 10 && !playing; i++) playing = await firstClick(ROW);
    assert.ok(playing);
    const won = await ms(() => {
      const m = globalThis.__ms;
      for (let c = 0; c < m.game.n; c++) { if (!m.game.pressed[c] && m.game.number[c] !== -1) { m.aimAt(c); m.click('left'); } }
      return m.game.state;
    });
    assert.equal(won, 'won');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(8000) });
    const winBombs = await mines();
    await page.waitForTimeout(600);
    await ms(() => document.getElementById('r-look').click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'look');
    for (const c of winBombs) assert.equal(await layer(c), 1, `the unflagged mine ${c} shows as a flag`);
    assert.equal(await press(2), 'results', 'any mouse button — the right one too');
    assert.equal(await ms(() => document.getElementById('results-title').textContent), 'You won!', 'the same card');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
