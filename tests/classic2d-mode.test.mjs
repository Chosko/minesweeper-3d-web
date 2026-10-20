// Classic 2D mode (js/classic2d/mode.js) behind the game shell's mode contract, and its board choice
// screen (js/classic2d/board-choice.js): the contract over a real mode host and pause controller,
// summary() before and after the first click, the overlay feed, pause / resume / restart / leave,
// the finished game's hand-off, the last board choice, the shell's markup and wiring, and one
// Playwright flow menu → Classic 2D → Expert → first click → pause → resume → back to menu.
import { test } from 'node:test';
import { startCell } from '../js/generation/start-cell.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClassic2DMode, MODE_ID, END_DELAY_MS } from '../js/classic2d/mode.js';
import { createSession } from '../js/classic2d/session.js';
import { WIN, LOSS } from '../js/classic2d/end-effect.js';
import {
  CHOICE_SIZES, CUSTOM_HINT, CODE_PROMPT, customStatus, customInfo, readChoice, sizeLabel, boardLine, mineDensity, densityHintShown,
  randomCustom, choiceSummary, bestsTitle,
} from '../js/classic2d/board-choice.js';
import {
  createLastChoice, DEFAULT_CHOICE, LAST_CHOICE_DOC, maxMines, NOGUESS_DENSITY_HINT, DENSITY_HINT_TEXT, NOGUESS_HELP_TEXT,
  STANDARD_SIZES, validateCustom,
} from '../js/classic2d/board-setup.js';
import { createModeHost, MODE_METHODS } from '../js/shell/mode-host.js';
import { createPointerInput, BUTTON } from '../js/classic2d/pointer-input.js';
import { createPauseController } from '../js/shell/pause.js';
import { createResultsFlow } from '../js/results/flow.js';
import { createRecordsStore } from '../js/records/store.js';
import { CUSTOM_LIMITS } from '../js/engine/profiles.js';
import { CELL } from '../js/engine/rules.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 0));

// ---------- fakes ----------

function fakeClock(start = 1000) {
  let t = start;
  let next = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const h = next++; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout(h) { timers.delete(h); },
    advance(ms) {
      t += ms;
      for (const [h, timer] of [...timers]) if (timer.at <= t) { timers.delete(h); timer.fn(); }
    },
    get pending() { return timers.size; },
  };
}

// The mode's generation clients, as made: `mines` answers every no-guess request with that mine
// set; `hold` keeps the request pending until the test answers it. `place` is the session's
// standard placement, with the same mine set; every standard placement is kept in `placed`.
function clients({ mines = null, hold = false } = {}) {
  const made = [];
  const placed = [];
  const create = () => {
    let pending = null;
    const c = {
      requests: [],
      cancels: 0,
      warms: 0,
      warm() { c.warms += 1; return Promise.resolve(true); },
      request(req, opts = {}) {
        c.requests.push(req);
        c.opts = opts;
        if (pending) c.cancel();
        if (!hold) return Promise.resolve({ ok: true, mines: mines ?? defaultMines(req), seed: req.seed, generatorVersion: 1 });
        return new Promise((resolve) => { pending = resolve; });
      },
      cancel() {
        c.cancels += 1;
        pending?.({ ok: false, cancelled: true, reason: 'cancelled' });
        pending = null;
      },
      answer(result) { pending?.(result); pending = null; },
      get waiting() { return pending !== null; },
    };
    made.push(c);
    return c;
  };
  const place = (req) => {
    placed.push(req);
    return { ok: true, mines: Int32Array.from(mines ?? defaultMines(req)), seed: req.seed, generatorVersion: 1 };
  };
  return { made, create, place, placed };
}
// Mines in the first cells, never on the first click.
function defaultMines(req) {
  const out = [];
  for (let c = 0; out.length < req.mineCount; c++) if (c !== req.firstClick) out.push(c);
  return out;
}

// A recording sound sink standing in for js/audio.js's sfx: every cue called, with its arguments.
function fakeSound() {
  const calls = [];
  const sound = { calls };
  for (const cue of ['reveal', 'flag', 'chord', 'noop', 'explode', 'win']) sound[cue] = (...args) => { calls.push([cue, ...args]); };
  return sound;
}

// Recording mounts standing in for mountBoardView / mountPointerInput / mountCursorInput.
function mounts() {
  const log = { boards: [], pointers: [], cursors: [], touches: [] };
  const board = ({ container, grid, ...options }) => {
    const v = {
      container, grid, options, game: null, hidden: false, updates: [], destroyed: false, canvas: { id: 'canvas' },
      scales: [], cursors: [], effects: [],
      setGame(g) { v.game = g; },
      showEffect(e, t) { v.effects.push([e, t]); },
      update(changed) { v.updates.push([...changed]); },
      setHidden(h) { v.hidden = !!h; },
      setScale(scale) { v.scales.push(scale); },
      marks: [],
      pulses: 0, pulseMark() { v.pulses += 1; },
      setPressed() {}, setCursor(c) { v.cursors.push(c); }, setMark(c) { v.marks.push(c); }, ensureVisible() {},
      destroy() { v.destroyed = true; },
    };
    log.boards.push(v);
    return v;
  };
  const input = (list) => ({ view, session, swap, ...rest }) => {
    const m = { view, session, swap, ...rest, resets: 0, destroyed: false, polls: [], input: { reset() { m.resets += 1; } } };
    m.destroy = () => { m.destroyed = true; };
    m.pad = (poll, now) => { m.polls.push([poll, now]); };
    list.push(m);
    return m;
  };
  return { log, mount: { board, pointer: input(log.pointers), cursor: input(log.cursors), touch: input(log.touches) } };
}

function fakeFlow() {
  const calls = [];
  const flow = {
    calls,
    area: { id: 'board-area' },
    container() { return flow.area; },
    huds: [],
    openBoardChoice(choice) { calls.push(['openBoardChoice', choice]); },
    show() { calls.push(['show']); },
    hud(h) { flow.huds.push(h); },
    fed: [],
    figures(input, opts) { flow.fed.push({ input, ...opts }); },
    board(b) { calls.push(['board', b]); },
    generating(shown) { calls.push(['generating', shown]); },
    progress(p) { calls.push(['progress', p]); },
    failed(f) { calls.push(['failed', f]); },
    hint(text) { calls.push(['hint', text]); },
    boardScale: '125',
    panel: { top: 60, right: 9, bottom: 9, left: 9, minWidth: 400 },
    scale() { return flow.boardScale; },
    frame() { return flow.panel; },
    layouts: [],
    layout(l) { flow.layouts.push(l); },
    scrolls: 0,
    scrolled() { flow.scrolls += 1; },
  };
  return flow;
}

const CUSTOM_3X3 = { size: 'custom', custom: { width: 3, height: 3, mines: 2 }, noGuess: false };
const memoryLastChoice = (initial) => createLastChoice({ storage: createStorage({ backend: createMemoryBackend({ initial }) }) });

// A mode registered on a real host, with a recording flow, mounts and clients.
function setup({ mines = null, hold = false, choice = null, lastChoice = memoryLastChoice(), sound = null, buttonSwap = null } = {}) {
  const host = createModeHost();
  const flow = fakeFlow();
  const { log, mount } = mounts();
  const cl = clients({ mines, hold });
  const clock = fakeClock();
  let seed = 7;
  const mode = host.register(MODE_ID, (report) => createClassic2DMode(report, {
    flow, lastChoice, mount, clock, createClient: cl.create, place: cl.place, randomSeed: () => seed++, ...(sound ? { sound } : {}), ...(buttonSwap ? { buttonSwap } : {}),
  }));
  const events = [];
  for (const e of ['started', 'finished', 'abandoned', 'canPause', 'failed']) host.on(e, (p) => events.push([e, p]));
  if (choice) host.start(MODE_ID, choice);
  const board = () => log.boards.at(-1);
  const pointer = () => log.pointers.at(-1);
  const cursor = () => log.cursors.at(-1);
  const touch = () => log.touches.at(-1);
  // Act through what the pointer input was handed, as the mounted input would.
  const act = (kind, c) => pointer().session[kind](c);
  return { host, mode, flow, log, cl, clock, events, board, pointer, cursor, touch, act, lastChoice };
}

// ---------------------------------------------------------------- the contract

test('the Classic 2D mode registers with the mode host and implements every contract method', () => {
  const { host, mode } = setup();
  assert.equal(MODE_ID, 'classic-2d');
  assert.ok(host.has('classic-2d'));
  for (const m of MODE_METHODS) assert.equal(typeof mode[m], 'function', m);
});

test('open board choice shows the board choice preselected from the last board choice', async () => {
  const saved = { size: 'expert', custom: { width: 20, height: 10, mines: 30 }, noGuess: true };
  const lastChoice = memoryLastChoice({ [LAST_CHOICE_DOC]: JSON.stringify({ version: 1, data: saved }) });
  const { host, flow, mode } = setup({ lastChoice });
  host.openBoardChoice('classic-2d');
  assert.deepEqual(flow.calls.at(-1), ['openBoardChoice', DEFAULT_CHOICE], 'nothing loaded yet: the default choice');
  await mode.loadChoice();
  host.openBoardChoice('classic-2d');
  assert.deepEqual(flow.calls.at(-1), ['openBoardChoice', saved]);
  assert.equal(host.active, null, 'opening the board choice starts nothing');
});

test('start shows the board in the container, mounts the inputs, feeds the overlay and saves the choice', async () => {
  const { host, flow, board, pointer, cursor, lastChoice } = setup();
  host.start('classic-2d', { size: 'expert', noGuess: false });
  assert.equal(host.active, 'classic-2d');
  assert.equal(board().container, flow.area, 'the board fills the container the shell gives it');
  assert.equal(board().grid.width, 30);
  assert.equal(board().grid.height, 16);
  assert.ok(board().game, 'the closed board is drawn');
  assert.equal(pointer().view, board());
  assert.equal(Object.getPrototypeOf(cursor().view), board(), 'the cursor input draws on the board view');
  assert.deepEqual(flow.calls.filter((c) => c[0] === 'show').length, 1);
  const [, named] = flow.calls.find((c) => c[0] === 'board');
  assert.deepEqual({ ...named, identity: undefined }, { width: 30, height: 16, mines: 99, noGuess: false, identity: undefined });
  assert.deepEqual([named.identity.mode, named.identity.width, named.identity.height, named.identity.mines], ['classic-2d', 30, 16, 99], 'with the board\'s identity, for its bests');
  assert.deepEqual(flow.huds.at(-1), { seconds: 0, minesLeft: 99, clicks: 0 });
  await settle();
  assert.equal(lastChoice.current.size, 'expert', 'the choice is the last board choice from now on');
});

test('the page\'s button swap is handed to the pointer input of every game, and never to the cursor input', async () => {
  const buttonSwap = { on: false };
  const s = setup({ buttonSwap, choice: { size: 'beginner', noGuess: false } });
  assert.equal(s.pointer().swap, buttonSwap);
  assert.equal(s.cursor().swap, undefined);
  s.host.start(MODE_ID, { size: 'beginner', noGuess: false });
  assert.equal(s.pointer().swap, buttonSwap, 'the next game shares it');
  assert.equal(setup({ choice: { size: 'beginner', noGuess: false } }).pointer().swap, undefined, 'none handed in: none');
});

test('summary() is nothing before the first click and the summary so far, outcome abandoned, mid-game', async () => {
  const { host, mode, act, clock, events } = setup({ choice: { size: 'beginner', noGuess: false } });
  assert.equal(mode.summary(), null, 'before the first click there is none');
  assert.equal(host.summary(), null);
  act('toggleFlag', 40);
  assert.equal(mode.summary(), null, 'a flag before the first reveal is not a first click');
  assert.equal(events.length, 0, 'nothing is reported before the first click');

  const r = await act('reveal', 10);
  assert.ok(r, 'the first reveal resolves with its result');
  clock.advance(2500);
  const s = mode.summary();
  assert.equal(s.outcome, 'abandoned');
  assert.equal(s.board.width, 9);
  assert.equal(s.board.mines, 10);
  assert.equal(s.board.mode, 'classic-2d');
  assert.equal(s.elapsedMs, 2500);
  assert.ok(s.bbbv > 0);

  // the abandoned report is built the same way
  host.leave();
  const [, abandoned] = events.find((e) => e[0] === 'abandoned');
  const strip = ({ id, endedAt, ...rest }) => rest;
  assert.deepEqual(strip(abandoned.summary), strip(s));
});

test('the first click reports game started and can pause; every change is redrawn and fed to the overlay', async () => {
  const { act, events, board, flow, clock, mode } = setup({ choice: { size: 'beginner', noGuess: false } });
  await act('reveal', 10);
  assert.deepEqual(events.map((e) => e[0]), ['started', 'canPause']);
  assert.equal(events[1][1].canPause, true);
  assert.ok(board().updates.length > 0, 'the revealed cells are redrawn');
  assert.ok(board().updates[0].includes(10));

  const before = flow.huds.length;
  mode.tick();
  assert.equal(flow.huds.length, before, 'nothing changed: nothing is pushed');
  clock.advance(1000);
  mode.tick();
  assert.deepEqual(flow.huds.at(-1), { seconds: 1, minesLeft: 10, clicks: 1 }, 'the timer is pushed when its second changes');
  clock.advance(400);
  mode.tick();
  assert.equal(flow.huds.length, before + 1, 'the same second is not pushed again');

  const closed = [...Array(81).keys()].find((c) => board().game.cellState(c) === CELL.CLOSED);
  const updates = board().updates.length;
  act('toggleFlag', closed);
  assert.equal(board().updates.length, updates + 1, 'a flag is redrawn');
  assert.deepEqual(flow.huds.at(-1), { seconds: 1, minesLeft: 9, clicks: 2 }, 'mines left and the click are pushed at once');
});

test('the overlay\'s click count: none before the first click, every counted click as it is made, frozen at the end', async () => {
  // 3 × 3 with mines on 0 and 8: cell 4 reveals a 2, cell 2 a 1.
  const { act, flow, clock, mode, events } = setup({ choice: CUSTOM_3X3, mines: [0, 8] });
  act('toggleFlag', 1);
  assert.equal(flow.huds.at(-1).clicks, 0, 'a flag before the first click counts nothing');
  await act('reveal', 4);
  assert.equal(flow.huds.at(-1).clicks, 1);
  act('reveal', 4);
  assert.equal(flow.huds.at(-1).clicks, 2, 'a wasted click is counted too');
  act('toggleFlag', 0);
  assert.equal(flow.huds.at(-1).clicks, 3);
  act('reveal', 8); // a mine: lost
  assert.equal(mode.ending, true, 'the game is over, in its end delay');
  assert.ok(events.some((e) => e[0] === 'canPause' && e[1].canPause === false));
  const frozen = flow.huds.at(-1);
  assert.equal(frozen.clicks, 4, 'the losing click is counted');
  clock.advance(5000);
  mode.tick();
  act('reveal', 2);
  assert.equal(flow.huds.at(-1).clicks, 4, 'nothing changes the count once the game ended');
  assert.equal(flow.huds.at(-1).seconds, frozen.seconds, 'frozen with the timer');
});

test('the figures feed: the game\'s counts at once on every change, and on the timer\'s second for the figures that take the time', async () => {
  // 3 × 3 with mines on 0 and 8: cell 4 reveals a 2.
  const { act, flow, clock, mode } = setup({ choice: CUSTOM_3X3, mines: [0, 8] });
  const last = () => flow.fed.at(-1);
  assert.deepEqual({ ...last(), input: { ...last().input, clicks: undefined } }, {
    input: { bbbv: null, bbbvSolved: 0, clicks: undefined, flags: 0, mines: 2, elapsedMs: 0 }, tick: false,
  }, 'the closed board: nothing solved, no 3BV yet');
  await act('reveal', 4);
  const revealed = last();
  assert.equal(revealed.tick, false);
  assert.ok(revealed.input.bbbv > 0, 'the board\'s 3BV once its mines are placed');
  assert.equal(revealed.input.clicks.reveal.effective + revealed.input.clicks.reveal.wasted, 1, 'the engine\'s click counts');
  const count = flow.fed.length;
  clock.advance(400);
  mode.tick();
  assert.equal(flow.fed.length, count, 'nothing between the timer\'s seconds');
  clock.advance(600);
  mode.tick();
  assert.deepEqual([last().tick, last().input.elapsedMs, last().input.bbbvSolved], [true, 1000, revealed.input.bbbvSolved], 'the timer\'s second: the same counts, the new time');
  mode.tick();
  assert.equal(flow.fed.length, count + 1, 'the same second is not fed again');
  act('toggleFlag', 0);
  assert.deepEqual([last().tick, last().input.flags], [false, 1], 'a change is fed at once');
});

test('pause hides the board while the timer keeps running, so the pause card\'s time advances; resume shows it again', async () => {
  const { host, mode, act, clock, board, pointer, cursor, flow } = setup({ choice: { size: 'beginner', noGuess: false } });
  await act('reveal', 10);
  clock.advance(1000);
  host.pause({ source: 'key' });
  assert.equal(board().hidden, true, 'the board is hidden');
  assert.ok(pointer().resets > 0 && cursor().resets > 0, 'held inputs are dropped');
  assert.equal(pointer().session.paused, true, 'the board takes no input');
  clock.advance(5000);
  assert.equal(mode.status().time, 6, 'the time the pause card shows runs on');
  clock.advance(1000);
  assert.equal(mode.status().time, 7);
  assert.equal(act('reveal', 0), null, 'no action while paused');
  const shows = flow.calls.filter((c) => c[0] === 'show').length;
  host.resume({ source: 'pointer' });
  assert.equal(board().hidden, false);
  assert.equal(pointer().session.paused, false);
  assert.equal(flow.calls.filter((c) => c[0] === 'show').length, shows + 1, 'resume shows the board screen');
  clock.advance(1000);
  assert.equal(mode.status().time, 8);
});

test('pause starts no timer before the first click and changes none after the game ends, but hides the board', async () => {
  const { mode, act, clock, board, pointer } = setup({ choice: CUSTOM_3X3, mines: [0, 8] });
  mode.pause({});
  assert.equal(board().hidden, true, 'the board is hidden whenever the pause card shows');
  assert.equal(pointer().session.paused, true, 'and takes no input while hidden');
  assert.equal(mode.status().time, 0);
  mode.resume({});
  await act('reveal', 2);
  act('reveal', 0); // a mine: lost
  assert.equal(mode.status().state, 'lost');
  clock.advance(1000);
  const t = mode.status().time;
  mode.pause({});
  clock.advance(5000);
  mode.resume({});
  assert.equal(mode.status().time, t, 'the timer stays stopped at the end');
});

test('restart and leave release the canvas and any pending generation', async () => {
  const { host, cl, board, pointer, cursor, log, act, flow } = setup({ hold: true, choice: { size: 'expert', noGuess: true } });
  const first = board();
  const firstClient = cl.made.at(-1);
  act('reveal', 100);
  assert.equal(firstClient.requests.length, 1, 'the first click asks for a board');
  host.restart({ source: 'pointer' });
  assert.equal(firstClient.cancels, 1, 'the pending generation is cancelled');
  assert.equal(first.destroyed, true, 'the canvas is released');
  assert.equal(log.pointers[0].destroyed && log.cursors[0].destroyed, true, 'the inputs are unmounted');
  assert.notEqual(board(), first, 'a new board');
  assert.equal(board().grid.width, 30, 'with the same choice');

  const second = board();
  assert.equal(cl.made.length, 1, 'one client for the mode, across games');
  act('reveal', 5);
  host.leave();
  assert.equal(firstClient.cancels, 2);
  assert.equal(second.destroyed, true);
  assert.equal(pointer().destroyed && cursor().destroyed, true);
  assert.equal(host.active, null);
  assert.equal(flow.calls.filter((c) => c[0] === 'generating').every((c) => c[1] === false), true, 'no slow request was shown');
});

test('a finished game reports its summary and the results flow routes it; Play again starts the same choice', async () => {
  const { host, act, events, board, clock } = setup({ choice: CUSTOM_3X3, mines: [0, 8] });
  const routes = [];
  const handed = [];
  const pauser = createPauseController({ modes: host, showCard() {}, confirm: (r, yes) => yes(), goMenu() {} });
  pauser.attach('finished', (summary, mode) => handed.push([summary.outcome, mode]));
  const records = createRecordsStore({ storage: createStorage({ backend: createMemoryBackend() }) });
  await records.load();
  createResultsFlow({
    records, router: { has: (n) => n === 'results', go: (n, o) => routes.push([n, o.data]) },
    restart: (source) => pauser.restart(source), goMenu() {},
  }).attach(pauser);
  await act('reveal', 2);
  act('reveal', 0);
  clock.advance(END_DELAY_MS);
  const finished = events.find((e) => e[0] === 'finished');
  assert.ok(finished, 'game finished is reported');
  assert.equal(finished[1].summary.outcome, 'lost');
  assert.equal(finished[1].summary.board.width, 3);
  assert.deepEqual(events.filter((e) => e[0] === 'canPause').map((e) => e[1].canPause), [true, false]);
  assert.deepEqual(handed, [['lost', 'classic-2d']]);
  assert.equal(routes.length, 1);
  assert.equal(routes[0][0], 'results');
  assert.equal(routes[0][1].mode, 'classic-2d');
  assert.equal(routes[0][1].summary.outcome, 'lost');
  assert.equal(records.counters(routes[0][1].summary.board).games, 1, 'recorded before the screen shows');

  const old = board();
  pauser.restart('pointer'); // Play again
  assert.ok(old.destroyed);
  assert.notEqual(board(), old);
  assert.equal(board().grid.width, 3, 'the same board choice');
  assert.equal(events.filter((e) => e[0] === 'abandoned').length, 0, 'a finished game is never abandoned');
});

// ---------------------------------------------------------------- the end delay

// CUSTOM_3X3, first reveal on cell 8, mines on 0 and 1 (defaultMines): cell 2 wins, cell 0 loses.
async function endedGame(outcome) {
  const t = setup({ choice: CUSTOM_3X3 });
  await t.act('reveal', 8);
  t.clock.advance(3000);
  t.act('reveal', outcome === 'won' ? 2 : 0);
  return t;
}

test('at a win or a loss the game stops being pausable at once, and is reported finished once, after the 2D end delay on the mode\'s clock', async () => {
  for (const outcome of ['won', 'lost']) {
    const { events, mode, clock, host } = await endedGame(outcome);
    const types = () => events.map(([e]) => e);
    assert.deepEqual(types(), ['started', 'canPause', 'canPause'], `${outcome}: pause is not offered, and nothing is finished yet`);
    assert.equal(events.at(-1)[1].canPause, false);
    assert.equal(mode.ending, true, 'the end delay is running');
    assert.equal(mode.status().state, outcome, 'the game is over');
    const atEnd = mode.summary();
    clock.advance(END_DELAY_MS - 1);
    assert.equal(types().includes('finished'), false, 'the end effect plays for the whole delay');
    clock.advance(1);
    assert.deepEqual(types(), ['started', 'canPause', 'canPause', 'finished']);
    assert.equal(mode.ending, false);
    const { summary, replay } = events.at(-1)[1];
    assert.deepEqual(summary, atEnd, 'the summary is the game\'s at its end');
    assert.equal(summary.outcome, outcome);
    assert.equal(summary.elapsedMs, 3000, 'the time stopped at the end, not at the end of the delay');
    assert.ok(replay?.blob, 'the replay goes beside it');
    assert.equal(replay.listing.id, summary.id);
    clock.advance(10 * END_DELAY_MS);
    assert.equal(types().filter((e) => e === 'finished').length, 1, 'reported once');
    assert.equal(host.summary().outcome, outcome);
  }
});

test('the end delay runs on the mode\'s clock whether or not frames are drawn', async () => {
  const { events, clock } = await endedGame('won');
  clock.advance(END_DELAY_MS); // no tick(): a hidden tab draws no frames
  assert.equal(events.at(-1)[0], 'finished');
});

test('during the end delay a pause is ignored and the board takes no action', async () => {
  const { host, mode, board, pointer, act, events, clock, flow } = await endedGame('lost');
  const hud = flow.huds.at(-1);
  host.pause({ source: 'key' });
  mode.hideBoard(true);
  assert.equal(board().hidden, false, 'the board stays shown');
  assert.equal(pointer().session.paused, false);
  assert.equal(act('reveal', 4), null, 'no action');
  assert.equal(act('toggleFlag', 3), null);
  clock.advance(500);
  mode.tick();
  assert.deepEqual(flow.huds.at(-1), hud, 'the overlay stays frozen');
  clock.advance(END_DELAY_MS);
  assert.equal(events.filter(([e]) => e === 'finished').length, 1);
});

test('restart and leave cancel the end delay: nothing is reported finished later', async () => {
  for (const how of ['restart', 'leave']) {
    const { host, clock, events, mode } = await endedGame('won');
    if (how === 'restart') host.restart({ source: 'pointer' });
    else host.leave();
    assert.equal(mode.ending, false);
    clock.advance(10 * END_DELAY_MS);
    assert.equal(events.some(([e]) => e === 'finished'), false, `${how}: the delay is cancelled with the game`);
    assert.equal(clock.pending, 0);
  }
});

test('finishNow() ends the delay at once: the game is reported finished once, never abandoned', async () => {
  const { mode, clock, events, host } = await endedGame('won');
  const atEnd = mode.summary();
  mode.finishNow();
  assert.equal(events.at(-1)[0], 'finished');
  assert.deepEqual(events.at(-1)[1].summary, atEnd);
  assert.equal(mode.ending, false);
  assert.equal(host.summary().outcome, 'won', 'the in-progress hand-off now sees a finished game');
  mode.finishNow();
  clock.advance(10 * END_DELAY_MS);
  assert.equal(events.filter(([e]) => e === 'finished').length, 1, 'reported once');
  assert.equal(events.some(([e]) => e === 'abandoned'), false);
  const playing = setup({ choice: CUSTOM_3X3 });
  await playing.act('reveal', 8);
  playing.mode.finishNow();
  assert.equal(playing.events.some(([e]) => e === 'finished'), false, 'a game not in its end delay is not finished by it');
});

test('the board plays the end effect through the delay, from the last action\'s cell or the exploded tile, and ends in its end state', async () => {
  const won = await endedGame('won');
  const effects = won.board().effects;
  assert.equal(effects.length, 1, 'the effect starts with the delay');
  const [effect, t0] = effects[0];
  assert.equal(effect.kind, WIN);
  assert.equal(effect.origin, 2, 'the win pulse starts at the last action\'s cell');
  assert.equal(effect.duration, END_DELAY_MS);
  assert.equal(t0, 0);
  won.clock.advance(250);
  won.mode.tick();
  assert.deepEqual(effects.at(-1), [effect, 250], 'each frame draws it at the time on the mode\'s clock');
  won.clock.advance(END_DELAY_MS);
  assert.deepEqual(effects.at(-1), [null, undefined], 'the board is left in its end state, no effect running');
  const frames = effects.length;
  won.mode.tick();
  assert.equal(effects.length, frames, 'no more effect frames');

  const lost = await endedGame('lost');
  const [loss] = lost.board().effects[0];
  assert.equal(loss.kind, LOSS);
  assert.equal(loss.origin, 0, 'the loss wave starts at the exploded tile');
  lost.mode.finishNow();
  assert.deepEqual(lost.board().effects.at(-1), [null, undefined], 'cut short, the board is drawn in its end state at once');
});

test('a no-guess failure shows its offer; a standard board keeps no-guess off for the rest of the session', async () => {
  const { host, cl, act, flow, mode, board } = setup({ hold: true, choice: { size: 'beginner', noGuess: true } });
  const p = act('reveal', 40);
  cl.made.at(-1).answer({ ok: false, reason: 'no board' });
  assert.equal(await p, null);
  const failed = flow.calls.filter((c) => c[0] === 'failed').at(-1);
  assert.deepEqual(failed[1].offers, ['retry', 'standard']);
  assert.equal(flow.calls.filter((c) => c[0] === 'board').at(-1)[1].noGuess, true);
  const q = mode.playStandard();
  assert.ok(q && !(q instanceof Promise), 'a standard board is placed at once');
  assert.deepEqual(flow.calls.filter((c) => c[0] === 'failed').at(-1), ['failed', null], 'the offer is cleared');
  assert.equal(flow.calls.filter((c) => c[0] === 'board').at(-1)[1].noGuess, false, 'the board line no longer says no-guess');
  assert.equal(host.state.started, true);
  host.restart({});
  assert.equal(cl.made.length, 1);
  assert.equal(board().grid.width, 9);
  act('reveal', 40);
  assert.equal(cl.placed.at(-1).noGuess, false, 'restart keeps no-guess off');
  assert.equal(cl.made[0].requests.length, 1, 'no request for the standard boards');
});

test('cancelGeneration goes back to the closed board: the request cancelled, nothing reported, a later first click asks afresh', async () => {
  const { host, cl, act, flow, mode, clock, events, board } = setup({ hold: true, choice: { size: 'beginner', noGuess: true } });
  assert.equal(mode.cancelGeneration(), false, 'nothing to cancel on a closed board');
  const view = board();
  const p = act('reveal', 40);
  clock.advance(1000);
  assert.deepEqual(flow.calls.filter((c) => c[0] === 'generating').at(-1), ['generating', true]);
  assert.equal(mode.cancelGeneration(), true);
  const client = cl.made.at(-1);
  assert.equal(client.cancels, 1, 'cancelled through the generation client');
  assert.equal(await p, null);
  assert.equal(mode.cancelGeneration(), false, 'nothing left to cancel');
  assert.deepEqual(flow.calls.filter((c) => c[0] === 'generating').at(-1), ['generating', false], 'the card goes');
  assert.equal(board(), view, 'the same closed board, not a new game');
  assert.equal(view.destroyed, false);
  assert.equal(host.state.started, false);
  assert.equal(mode.summary(), null);
  assert.deepEqual(events, [], 'nothing started, abandoned, finished or failed');
  act('reveal', 3);
  assert.equal(client.requests.length, 2, 'the next first click asks again');
  assert.equal(client.requests.at(-1).firstClick, 3);
  host.leave();
  assert.deepEqual(events.filter((e) => e[0] === 'abandoned'), [], 'a game left before its board reports nothing');
});

test('a failure hands the shell its count of failures in a row', async () => {
  const { cl, act, flow, mode } = setup({ hold: true, choice: { size: 'beginner', noGuess: true } });
  const p = act('reveal', 40);
  cl.made.at(-1).answer({ ok: false, reason: 'no board' });
  await p;
  assert.equal(flow.calls.filter((c) => c[0] === 'failed').at(-1)[1].count, 1);
  const q = mode.retry();
  cl.made.at(-1).answer({ ok: false, reason: 'no board' });
  await q;
  assert.equal(flow.calls.filter((c) => c[0] === 'failed').at(-1)[1].count, 2, 'a Retry that fails again');
});

test('the touch input is mounted beside the pointer and cursor inputs on the board view, through the input gate', () => {
  const { mode, touch, pointer, board, flow } = setup({ choice: { size: 'beginner', noGuess: false } });
  assert.equal(touch().view, board(), 'it plays the board view');
  assert.equal(touch().session, pointer().session, 'through the same gate as the mouse');
  assert.equal(touch().swap, undefined, 'the mouse button swap is the mouse\'s alone');
  touch().onUserScroll();
  assert.equal(flow.scrolls, 1, 'a touch pan is the player\'s scroll');
  assert.equal(touch().session.paused, false);
  mode.pause({});
  assert.equal(touch().session.paused, true, 'it takes nothing while the board is hidden');
  assert.ok(touch().resets > 0, 'and drops the fingers it held');
  mode.resume({});
  mode.leave();
  assert.ok(touch().destroyed, 'the leave releases it');
});

test('the Reveal / Flag switch starts on Reveal, reaches every game\'s touch input and keeps its setting for the page\'s life', () => {
  const { host, mode, touch } = setup({ choice: { size: 'beginner', noGuess: false } });
  assert.equal(mode.tapMode, 'reveal');
  assert.equal(touch().flagMode(), false);
  mode.setTapMode('flag');
  assert.equal(mode.tapMode, 'flag');
  assert.equal(touch().flagMode(), true, 'the live board follows it');
  mode.restart();
  assert.equal(touch().flagMode(), true, 'a restart keeps it');
  mode.leave();
  host.start(MODE_ID, { size: 'expert', noGuess: false });
  assert.equal(touch().flagMode(), true, 'so does the next game');
  mode.setTapMode('sideways');
  assert.equal(mode.tapMode, 'flag', 'an unknown mode changes nothing');
  mode.setTapMode('reveal');
  assert.equal(touch().flagMode(), false);
});

test('every new game, restart and Play again opens a fresh board view, so a pinch zoom lasts one game', () => {
  const { host, mode, log, touch } = setup({ choice: { size: 'expert', noGuess: false } });
  const first = log.boards.at(-1);
  mode.restart();
  assert.notEqual(log.boards.at(-1), first, 'a restart opens a new view at the fit rule');
  assert.ok(first.destroyed);
  assert.equal(touch().view, log.boards.at(-1));
  host.start(MODE_ID, { size: 'expert', noGuess: false });
  assert.equal(log.boards.length, 3, 'a new game: a new view');
});

test('the controller reaches the board through the cursor input', () => {
  const { mode, cursor } = setup({ choice: { size: 'beginner', noGuess: false } });
  const poll = { held: [true], ls: [0, 0] };
  mode.pad(poll, 5);
  assert.deepEqual(cursor().polls, [[poll, 5]]);
  mode.pause({});
  assert.ok(cursor().resets > 0, 'the cursor is reset on pause');
});

test('the board opens at the board scale setting inside the panel\'s frame; its layouts and the player\'s scrolls reach the shell', () => {
  const { flow, board, mode } = setup({ choice: { size: 'expert', noGuess: false } });
  assert.equal(board().options.scale, '125', 'the scale the shell holds');
  assert.equal(typeof board().options.frame, 'function', 'the shell\'s measure, for the view to call at every refit');
  assert.equal(board().options.frame(), flow.panel, 'the frame the shell measured');
  const layout = { tile: 30, scrolls: false };
  board().options.onLayout(layout);
  assert.deepEqual(flow.layouts, [layout], 'each refit places the panel');
  board().options.onUserScroll();
  assert.equal(flow.scrolls, 1, 'a scroll by the player is reported, for the one-time scroll hint');
  mode.setScale('fit');
  assert.deepEqual(board().scales, ['fit'], 'a setting change refits the live board');
  mode.leave();
  mode.setScale('100');
  assert.deepEqual(board().scales, ['fit'], 'no board, nothing to refit');
});

test('the cursor\'s ring reaches the movement sampler as well as the view: its cell while shown, -1 once hidden', () => {
  const host = createModeHost();
  const flow = fakeFlow();
  const { log, mount } = mounts();
  const samples = [];
  mount.sampler = () => ({ cursor: (c) => samples.push(c), tick() {}, destroy() {} });
  host.register(MODE_ID, (report) => createClassic2DMode(report, { flow, lastChoice: memoryLastChoice(), mount, clock: fakeClock(), createClient: clients().create }));
  host.start(MODE_ID, { size: 'beginner', noGuess: false });
  assert.deepEqual(samples, [], 'no ring, nothing recorded at the start');
  const view = log.cursors.at(-1).view;
  view.setCursor(4);
  view.setCursor(-1);
  view.setCursor(5);
  assert.deepEqual(samples, [4, -1, 5]);
  assert.deepEqual(log.boards.at(-1).cursors, [4, -1, 5], 'and the board draws it');
});

// ---------------------------------------------------------------- warm worker and pre-generation

// Beginner no-guess, lost at once: mines on cells 0 .. 9 (defaultMines), the first reveal on 40,
// then a reveal on a mine.
const BEGINNER_NG = { size: 'beginner', noGuess: true };
async function loseBeginner(t) {
  const p = t.act('reveal', 40);
  await p;
  t.act('reveal', 0);
}

test('one generation client per mode across games, warmed when the board choice opens', async () => {
  const t = setup();
  assert.equal(t.cl.made.length, 0, 'made on first use');
  await t.mode.warm();
  assert.equal(t.cl.made.length, 1);
  assert.equal(t.cl.made[0].warms, 1, 'the worker is spawned and warmed');
  t.host.start(MODE_ID, BEGINNER_NG);
  await t.act('reveal', 40);
  t.host.restart({});
  await t.act('reveal', 40);
  t.host.start(MODE_ID, { size: 'expert', noGuess: true });
  await t.act('reveal', 40);
  assert.equal(t.cl.made.length, 1, 'the same client for every game');
  assert.ok(t.cl.made[0].requests.length >= 3);
});

test('a finished no-guess game pre-generates the next board for the marked start cell; Play again takes it over', async () => {
  const t = setup({ choice: BEGINNER_NG });
  await loseBeginner(t);
  const client = t.cl.made[0];
  assert.equal(client.requests.length, 2, 'the next board is asked for at the end of the game');
  const ahead = client.requests[1];
  assert.deepEqual(ahead, { graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: 40, noGuess: true, seed: ahead.seed });
  assert.equal(ahead.firstClick, startCell({ kind: 'square', width: 9, height: 9 }));
  assert.notEqual(ahead.seed, client.requests[0].seed, 'a fresh seed');
  t.clock.advance(END_DELAY_MS);
  assert.ok(t.events.find(([e]) => e === 'finished'));
  await settle();
  t.host.restart({ source: 'pointer' }); // Play again
  assert.deepEqual(t.board().marks, [40], 'the closed board opens with its marked start cell');
  assert.equal(client.requests.length, 2, 'nothing new asked');
  const r = t.act('reveal', 40);
  assert.equal(r instanceof Promise, false, 'the board is already there: applied at once');
  assert.equal(t.host.state.started, true);
  assert.deepEqual(t.board().marks, [40, -1], 'the mark goes at the first click');
  assert.equal(t.mode.summary().seed, ahead.seed, 'the game carries the pre-generation\'s seed');
});

test('Restart of the finished game takes it over too; a click elsewhere generates around that cell', async () => {
  const t = setup({ choice: BEGINNER_NG, hold: true });
  const client = () => t.cl.made[0];
  const p = t.act('reveal', 40);
  client().answer({ ok: true, mines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], seed: 1, generatorVersion: 1 });
  await p;
  t.act('reveal', 0);
  assert.equal(client().waiting, true, 'pre-generating');
  t.clock.advance(END_DELAY_MS);
  t.host.restart({ source: 'key' }); // Restart from the pause card of the finished game
  assert.deepEqual(t.board().marks, [40]);
  const q = t.act('reveal', 3);
  assert.equal(client().cancels, 1, 'the pre-generation in flight is cancelled');
  assert.equal(client().requests.at(-1).firstClick, 3, 'and a fresh request made around the clicked cell');
  assert.deepEqual(t.board().marks, [40, -1]);
  client().answer({ ok: true, mines: [0, 1, 2, 4, 5, 6, 7, 8, 9, 10], seed: 2, generatorVersion: 1 });
  await q;
  assert.equal(t.host.state.started, true);
});

test('a daily or a challenge: the start cell marked, the cursor on it, a reveal elsewhere pulses the mark with the hint, no last choice saved', async () => {
  const lastChoice = memoryLastChoice();
  const saved = [];
  const save = lastChoice.save.bind(lastChoice);
  lastChoice.save = (c) => { saved.push(c); return save(c); };
  const t = setup({ lastChoice });
  t.host.start(MODE_ID, { ...BEGINNER_NG, fixed: { startCell: 40, seed: 1234, challenge: true } });
  assert.deepEqual(saved, [], 'a challenge never changes the last board choice');
  assert.deepEqual(t.board().marks, [40]);
  assert.equal(t.cursor().start, 40, 'the keyboard and controller cursor starts on the mark');
  assert.deepEqual(t.mode.fixed, { startCell: 40, seed: 1234, challenge: true });
  assert.equal(t.act('reveal', 0), null);
  assert.equal(t.board().pulses, 1);
  assert.deepEqual(t.flow.calls.filter(([k]) => k === 'hint'), [['hint', 'Start on the marked cell']]);
  assert.equal(t.cl.made[0]?.requests.length ?? 0, 0);
  t.host.restart({ source: 'key' });
  assert.deepEqual(t.board().marks, [40], 'not started: a restart keeps the forced board');
  await t.act('reveal', 40);
  assert.equal(t.cl.made[0].requests[0].seed, 1234);
  assert.equal(t.mode.summary().challenge, true);
  t.act('reveal', 0);
  t.clock.advance(END_DELAY_MS);
  await settle();
  t.host.restart({ source: 'pointer' }); // Play again
  assert.equal(t.mode.fixed, null, 'Play again plays a free board');
  assert.deepEqual(t.board().marks, [40], 'the pre-generated next board, with a fresh seed');
  assert.notEqual(t.cl.made[0].requests.at(-1).seed, 1234);
  assert.deepEqual(saved, []);
  t.host.leave();
  t.host.start(MODE_ID, { ...BEGINNER_NG, remember: false }); // Play again after it, once the mode was left
  assert.deepEqual(saved, [], 'remember: false saves no last board choice');
  t.host.start(MODE_ID, BEGINNER_NG);
  assert.equal(saved.length, 1, 'a free start saves as before');
});

test('a daily takes the board the shell pre-generated, never one left over from the last game', async () => {
  const t = setup({ choice: BEGINNER_NG });
  await loseBeginner(t);
  t.clock.advance(END_DELAY_MS);
  const ahead = t.cl.made[0];
  const before = ahead.cancels;
  let discarded = 0;
  const pg = { cell: 40, seed: 99, settled: true, result: { ok: true, mines: Int32Array.from(defaultMines({ mineCount: 10, firstClick: 40 })), seed: 99, generatorVersion: 1 },
    promise: Promise.resolve(), listen() {}, discard() { discarded += 1; } };
  t.host.start(MODE_ID, { ...BEGINNER_NG, fixed: { startCell: 40, seed: 99, daily: '20261011' }, pregenerated: pg });
  assert.ok(ahead.cancels > before || ahead.requests.length === 2, 'the board pre-generated after the last game is let go');
  const r = t.act('reveal', 40);
  assert.equal(r instanceof Promise, false);
  assert.equal(t.mode.summary().seed, 99);
  assert.equal(t.mode.summary().daily, '20261011');
  assert.equal(discarded, 0);
});

test('no pre-generation after a standard or an abandoned game; a different choice or the leave discards one', async () => {
  const std = setup({ choice: CUSTOM_3X3 });
  std.act('reveal', 8);
  std.act('reveal', 0);
  assert.equal(std.mode.status().state, 'lost');
  assert.equal(std.cl.made[0].requests.length, 0, 'a standard board is never pre-generated, nor asked for');

  const quit = setup({ choice: BEGINNER_NG, mines: [0, 30, 31, 32, 39, 41, 48, 49, 50, 80] }); // 40 is an 8: no win
  await quit.act('reveal', 40);
  quit.host.restart({});
  assert.equal(quit.cl.made[0].requests.length, 1, 'an abandoned game pre-generates nothing');
  assert.deepEqual(quit.board().marks, [-1]);

  const other = setup({ choice: BEGINNER_NG, hold: true });
  const p = other.act('reveal', 40);
  other.cl.made[0].answer({ ok: true, mines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], seed: 1, generatorVersion: 1 });
  await p;
  other.act('reveal', 0);
  other.clock.advance(END_DELAY_MS);
  other.mode.start({ size: 'intermediate', noGuess: true }); // the mode's own start, as the host's would after its leave
  assert.equal(other.cl.made[0].cancels, 1, 'another choice discards it');
  assert.deepEqual(other.board().marks, [-1], 'and shows no mark');

  const left = setup({ choice: BEGINNER_NG, hold: true });
  const q = left.act('reveal', 40);
  left.cl.made[0].answer({ ok: true, mines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], seed: 1, generatorVersion: 1 });
  await q;
  left.act('reveal', 0);
  left.clock.advance(END_DELAY_MS);
  left.host.leave();
  assert.equal(left.cl.made[0].cancels, 1, 'the leave discards it');
});

test('the generating card\'s progress reaches the flow each time it changes, and is cleared when the card hides', async () => {
  const t = setup({ choice: BEGINNER_NG, hold: true });
  const p = t.act('reveal', 40);
  t.mode.tick();
  assert.equal(t.flow.calls.filter((c) => c[0] === 'progress').length, 0, 'nothing before the card shows');
  t.clock.advance(250);
  t.mode.tick();
  t.cl.made[0].opts.onProgress({ candidates: 14 });
  t.clock.advance(6000);
  t.mode.tick();
  t.mode.tick();
  const progress = t.flow.calls.filter((c) => c[0] === 'progress').map((c) => c[1]);
  assert.deepEqual(progress, [{ candidates: 0, seconds: 0 }, { candidates: 14, seconds: 6 }]);
  t.cl.made[0].answer({ ok: true, mines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], seed: 1, generatorVersion: 1 });
  await p;
  assert.deepEqual(t.flow.calls.filter((c) => c[0] === 'progress').at(-1), ['progress', null]);
});

test('Play a standard board from the generating card cancels the request and starts a standard game at once', async () => {
  const t = setup({ choice: BEGINNER_NG, hold: true });
  const p = t.act('reveal', 40);
  t.clock.advance(1000);
  const r = t.mode.playStandard();
  assert.ok(r && !(r instanceof Promise));
  assert.equal(t.cl.made[0].cancels, 1);
  assert.equal(await p, null);
  assert.equal(t.host.state.started, true);
  assert.equal(t.flow.calls.filter((c) => c[0] === 'board').at(-1)[1].noGuess, false);
  assert.deepEqual(t.flow.calls.filter((c) => c[0] === 'generating').at(-1), ['generating', false]);
  assert.equal(t.mode.summary().board.noGuess, false, 'played and recorded as a standard board');
  t.host.restart({});
  t.act('reveal', 40);
  assert.equal(t.cl.placed.at(-1).noGuess, false, 'later restarts stay standard');
});

// ---------------------------------------------------------------- sound

// CUSTOM_3X3 with the first reveal on cell 8: mines on 0 and 1 (defaultMines), so
//   * * 1
//   2 2 1
//   0 0 0
// the first reveal floods six cells and leaves cell 2 the last safe one.
const BOARD = [0, 1];
// The same board with no-guess on: its first reveal waits for the worker.
const CUSTOM_3X3_NG = { ...CUSTOM_3X3, noGuess: true };

for (const via of ['pointer', 'cursor']) {
  test(`every ${via} action plays the 3D game's cue for its outcome: a flag on and off, a reveal and a chord with their counts, the no-op, then the win`, async () => {
    const sound = fakeSound();
    const t = setup({ choice: CUSTOM_3X3_NG, sound });
    const act = (kind, c) => t[via]().session[kind](c);
    act('chord', 4);
    act('toggleFlag', 0);
    assert.deepEqual(sound.calls, [], 'a chord or a flag before the first reveal changes nothing (the reference) and is silent');
    const first = act('reveal', 8);
    assert.ok(first instanceof Promise);
    assert.deepEqual(sound.calls, [], 'the first reveal waits for its board');
    await settle();
    assert.deepEqual(sound.calls.splice(0), [['reveal', 6]], 'heard when the board arrives, with the cells it opened');
    act('toggleFlag', 1);
    assert.deepEqual(sound.calls.splice(0), [['flag', true, 1]]);
    act('reveal', 4);
    act('chord', 4);
    assert.deepEqual(sound.calls.splice(0), [['noop'], ['noop']], 'a reveal on a number and a chord short of its flags change no cell');
    act('chord', 5);
    assert.deepEqual(sound.calls.splice(0), [['chord', 1], ['win']], 'the winning chord\'s cue, then the win once');
    assert.equal(act('reveal', 0), null);
    assert.deepEqual(sound.calls, [], 'the ended game refuses the action, silently');
  });
}

test('a reveal or a chord that loses plays the explosion alone; a reveal that wins plays its cue, then the win', async () => {
  const lost = fakeSound();
  let t = setup({ choice: CUSTOM_3X3, sound: lost });
  t.act('reveal', 8);
  await settle();
  t.act('reveal', 0);
  assert.deepEqual(lost.calls, [['reveal', 6], ['explode']]);

  const chorded = fakeSound();
  t = setup({ choice: CUSTOM_3X3, sound: chorded });
  t.act('reveal', 8);
  await settle();
  t.act('toggleFlag', 2); // a wrong flag: the chord on the 1 beside it opens the mine
  t.act('chord', 5);
  assert.deepEqual(chorded.calls, [['reveal', 6], ['flag', true, 1], ['explode']]);
  assert.equal(t.mode.status().state, 'lost');

  const won = fakeSound();
  t = setup({ choice: CUSTOM_3X3, sound: won });
  t.act('reveal', 8);
  await settle();
  t.act('reveal', 2);
  assert.deepEqual(won.calls, [['reveal', 6], ['reveal', 1], ['win']]);
  assert.equal(t.mode.status().state, 'won');
});

test('the first reveal is heard when its board arrives, and not when the game was restarted or left before it did', async () => {
  const sound = fakeSound();
  const t = setup({ choice: CUSTOM_3X3_NG, sound, hold: true });
  const answer = (client) => client.answer({ ok: true, mines: BOARD, seed: 7, generatorVersion: 1 });
  t.act('reveal', 8);
  answer(t.cl.made.at(-1));
  t.host.restart({ source: 'pointer' }); // before the answer is read
  await settle();
  assert.deepEqual(sound.calls, [], 'restarted before the board arrived: silent');

  t.act('reveal', 8);
  answer(t.cl.made.at(-1));
  await settle();
  assert.deepEqual(sound.calls.splice(0), [['reveal', 6]]);

  t.host.restart({ source: 'pointer' });
  t.act('reveal', 8);
  answer(t.cl.made.at(-1));
  t.mode.leave();
  await settle();
  assert.deepEqual(sound.calls, [], 'left before the board arrived: silent');
});

test('no cue for a press cancelled off the board, nor for an action the session refuses', async () => {
  const sound = fakeSound();
  const t = setup({ choice: CUSTOM_3X3_NG, sound, hold: true });
  const gate = t.pointer().session;
  const input = createPointerInput({
    graph: gate.setup.grid.graph, game: () => gate.game, onPress() {}, onAction: (kind, c) => gate[kind](c),
  });
  input.down(BUTTON.LEFT, 8);
  input.move(-1);
  input.up(BUTTON.LEFT, -1);
  assert.equal(t.cl.made.at(-1).requests.length, 0, 'the press moved off the board did nothing');
  input.down(BUTTON.LEFT, 8);
  input.up(BUTTON.LEFT, 8);
  assert.equal(gate.reveal(4), null, 'generating');
  assert.equal(gate.toggleFlag(0), null);
  t.cl.made.at(-1).answer({ ok: true, mines: BOARD, seed: 7, generatorVersion: 1 });
  await settle();
  assert.deepEqual(sound.calls.splice(0), [['reveal', 6]]);
  t.mode.pause();
  assert.equal(gate.reveal(2), null, 'paused: the board hidden');
  assert.equal(gate.toggleFlag(1), null);
  assert.equal(gate.chord(5), null);
  t.mode.resume();
  t.mode.leave();
  assert.equal(gate.reveal(2), null, 'left');
  assert.deepEqual(sound.calls, []);

  const failed = fakeSound();
  const f = setup({ choice: CUSTOM_3X3_NG, sound: failed, hold: true });
  f.act('reveal', 8);
  f.cl.made.at(-1).answer({ ok: false, reason: 'no board' });
  await settle();
  assert.equal(f.act('reveal', 4), null, 'failed');
  assert.equal(f.act('toggleFlag', 0), null);
  assert.deepEqual(failed.calls, []);
});

test('a mode without a sound sink plays the same game exactly as one with it', async () => {
  const play = async (t) => {
    t.act('toggleFlag', 0);
    t.act('reveal', 8);
    await settle();
    t.act('reveal', 4);
    t.act('toggleFlag', 1);
    t.act('chord', 5);
    t.clock.advance(END_DELAY_MS);
    const s = t.events.find(([e]) => e === 'finished')[1].summary;
    return { updates: t.board().updates, huds: t.flow.huds, outcome: s.outcome, clicks: s.clicks, bbbv: s.bbbv };
  };
  const silent = await play(setup({ choice: CUSTOM_3X3 }));
  const sound = fakeSound();
  const heard = await play(setup({ choice: CUSTOM_3X3, sound }));
  assert.equal(silent.outcome, 'won');
  assert.deepEqual(heard, silent);
  assert.deepEqual(sound.calls, [['reveal', 6], ['noop'], ['flag', true, 1], ['chord', 1], ['win']]);
});

test('the shell hands the mode the one sound instance the settings drive; the mode and the replay viewers import no sound', () => {
  const main = read('js/main.js');
  assert.match(main, /MODES\.register\('classic-2d', \(report\) => createClassic2DMode\(report, \{[^}]*sound: sfx[^}]*\}\)\)/);
  assert.match(main, /const sfx = audio\.sfx \?\? new audio\.Sfx\(\);/, 'the instance applyAudio drives');
  for (const file of ['js/classic2d/mode.js', 'js/replay/viewer.js', 'js/replay/viewer-2d.js']) {
    assert.doesNotMatch(read(file), /^import [^;]*audio\.js/m, `${file} imports no sound`);
  }
});

// ---------------------------------------------------------------- board choice

test('the board choice offers the three standard sizes and a validated custom board', () => {
  assert.deepEqual(CHOICE_SIZES, ['beginner', 'intermediate', 'expert']);
  assert.equal(sizeLabel('expert'), '30 × 16 · 99 mines');
  assert.equal(sizeLabel('beginner'), '9 × 9 · 10 mines');

  const ok = customStatus({ width: 30, height: 16, mines: 99 });
  assert.equal(ok.ok, true);
  assert.equal(ok.max, maxMines(30, 16));
  assert.match(ok.text, /480 cells/);
  assert.equal(customStatus({ width: CUSTOM_LIMITS.maxSide + 1, height: 10, mines: 1 }).field, 'width');
  assert.equal(customStatus({ width: 10, height: 0, mines: 1 }).field, 'height');
  const tooMany = customStatus({ width: 5, height: 5, mines: 25 });
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.field, 'mines');
  assert.equal(tooMany.max, 24, 'one cell stays free');
  assert.match(tooMany.text, /mines/i);
  assert.equal(customStatus({ width: NaN, height: 5, mines: 1 }).ok, false);

  // At least one mine: the 1-to-max range line, the no-room line, and both counts pluralised.
  assert.deepEqual(customStatus({ width: 30, height: 16, mines: 0 }), {
    ok: false, field: 'mines', max: maxMines(30, 16), text: 'Mines must be a whole number from 1 to 168 on a 30 × 16 board.',
  });
  assert.deepEqual(customStatus({ width: 100, height: 100, mines: 0 }).text, 'Mines must be a whole number from 1 to 2,480 on a 100 × 100 board.');
  assert.deepEqual(customStatus({ width: 1, height: 1, mines: 0 }), {
    ok: false, field: 'mines', max: 0, text: 'A 1 × 1 board has no room for a mine beside the safe first click — make it at least 2 cells.',
  });
  assert.equal(customStatus({ width: 1, height: 1, mines: 1 }).field, 'mines');
  assert.deepEqual(customStatus({ width: 1, height: 2, mines: 1 }), { ok: true, field: null, max: 1, text: '2 cells · up to 1 mine' });
  assert.equal(customStatus({ width: 2, height: 1, mines: 1 }).text, '2 cells · up to 1 mine');
  assert.equal(customStatus({ width: 3, height: 1, mines: 1 }).text, '3 cells · up to 2 mines');
  for (const custom of [{ width: 1, height: 1, mines: 0 }, { width: 9, height: 9, mines: 0 }, { width: 1, height: 2, mines: 1 }]) {
    const { text } = customStatus(custom);
    assert.doesNotMatch(text, /\bfrom 0 to 0\b|\b1 mines\b|\b1 cells\b/, text);
  }
  assert.equal(readChoice({ size: 'custom', fields: { width: '9', height: '9', mines: '0' }, noGuess: false }), null, 'a 0-mine board is no choice');
  assert.equal(readChoice({ size: 'custom', fields: { width: '1', height: '1', mines: '0' }, noGuess: false }), null, 'a 1 × 1 board is no choice');

  assert.deepEqual(readChoice({ size: 'expert', fields: { width: '20', height: '10', mines: '30' }, noGuess: true }),
    { size: 'expert', custom: { width: 20, height: 10, mines: 30 }, noGuess: true });
  assert.equal(readChoice({ size: 'custom', fields: { width: '200', height: '10', mines: '30' }, noGuess: false }), null,
    'an invalid custom board is no choice');
  assert.deepEqual(readChoice({ size: 'beginner', fields: { width: '200', height: '10', mines: '30' }, noGuess: false }, DEFAULT_CHOICE.custom),
    { size: 'beginner', custom: DEFAULT_CHOICE.custom, noGuess: false }, 'a standard size keeps the last valid custom board');
});

test('the board choice opens with no-guess on for a player who never played; its density hint warns above 25 % and refuses nothing', () => {
  assert.equal(DEFAULT_CHOICE.noGuess, true);
  assert.equal(NOGUESS_DENSITY_HINT, 0.25);
  assert.equal(DENSITY_HINT_TEXT, 'Above 25 % mines, a no-guess board may not be found.');
  assert.equal(densityHintShown({ width: 10, height: 10, mines: 25 }, true), false, 'exactly 25 %');
  assert.equal(densityHintShown({ width: 10, height: 10, mines: 26 }, true), true);
  assert.equal(densityHintShown({ width: 10, height: 10, mines: 26 }, false), false, 'no-guess off');
  assert.equal(densityHintShown({ width: 0, height: 10, mines: 26 }, true), false, 'an invalid board shows its reason instead');
  assert.equal(densityHintShown({ width: 30, height: 16, mines: 99 }, true), false, 'Expert is 21 %');
  assert.equal(densityHintShown({ width: 10, height: 10, mines: 38 }, true), true);
  assert.deepEqual(readChoice({ size: 'custom', fields: { width: '10', height: '10', mines: '38' }, noGuess: true }),
    { size: 'custom', custom: { width: 10, height: 10, mines: 38 }, noGuess: true }, 'a dense no-guess board is still offered');
});

test('the board choice\'s lines: each option\'s board line and density, the custom info line, the summary and the bests title follow the switch', () => {
  assert.equal(boardLine({ width: 16, height: 16, mines: 40 }), '16 × 16 · 40 mines');
  assert.equal(boardLine({ width: 1, height: 2, mines: 1 }), '1 × 2 · 1 mine');
  assert.deepEqual(CHOICE_SIZES.map((s) => mineDensity(STANDARD_SIZES[s])), ['12.3 % mines', '15.6 % mines', '20.6 % mines']);
  assert.equal(CUSTOM_HINT, `Width and height ${CUSTOM_LIMITS.minSide}–${CUSTOM_LIMITS.maxSide}`);

  // The info line names the cells and the mine limit of the width and height, refused mines or not.
  assert.equal(customInfo({ width: 30, height: 16, mines: 99 }), `480 cells · up to ${maxMines(30, 16)} mines`);
  assert.equal(customInfo({ width: 30, height: 16, mines: 9999 }), `480 cells · up to ${maxMines(30, 16)} mines`);
  assert.equal(customInfo({ width: 1, height: 1, mines: 1 }), '1 cell · no room for a mine');
  assert.equal(customInfo({ width: 1, height: 2, mines: 1 }), '2 cells · up to 1 mine');
  assert.equal(customInfo({ width: CUSTOM_LIMITS.maxSide + 1, height: 2, mines: 1 }), '', 'no line while a side is refused');
  assert.equal(customInfo({ width: NaN, height: 2, mines: 1 }), '');

  const custom = { width: 30, height: 16, mines: 140 };
  assert.equal(choiceSummary({ selected: 'intermediate', custom, noGuess: true }), 'Intermediate · 16 × 16 · 40 mines · no-guess');
  assert.equal(choiceSummary({ selected: 'intermediate', custom, noGuess: false }), 'Intermediate · 16 × 16 · 40 mines');
  assert.equal(choiceSummary({ selected: 'custom', custom, noGuess: true }), 'Custom · 30 × 16 · 140 mines · no-guess', 'a refused board is still summarised');
  assert.equal(choiceSummary({ selected: 'custom', custom: { width: NaN, height: 16, mines: 1 }, noGuess: false }), 'Custom');
  assert.equal(choiceSummary({ selected: 'code', custom, noGuess: true, code: null }), 'Board code · paste a code to play');
  assert.equal(choiceSummary({ selected: 'code', custom, noGuess: true, code: { ok: false, reason: 'x' } }), 'Board code · paste a code to play');
  assert.equal(choiceSummary({ selected: 'code', custom, noGuess: true, code: { ok: true, text: 't', label: 'Intermediate · no-guess' } }), 'Board code · Intermediate · no-guess');

  assert.equal(bestsTitle({ selected: 'intermediate', custom, noGuess: true }), 'Intermediate · no-guess · your bests');
  assert.equal(bestsTitle({ selected: 'intermediate', custom, noGuess: false }), 'Intermediate · your bests');
  assert.equal(bestsTitle({ selected: 'custom', custom: { width: 30, height: 16, mines: 99 }, noGuess: true }), '30 × 16 · 99 mines · no-guess · your bests');
  assert.equal(bestsTitle({ selected: 'custom', custom: { width: 'x', height: 16, mines: 99 }, noGuess: false }), 'Custom · your bests');
});

test('Random fills a valid custom board every time, at most about one mine in five cells, as the 3D form\'s Random does', () => {
  for (const r of [() => 0, () => 0.999999]) assert.equal(validateCustom(randomCustom(r)).ok, true);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sizes = new Set();
  for (let i = 0; i < 500; i++) {
    const b = randomCustom(rand);
    assert.equal(validateCustom(b).ok, true, JSON.stringify(b));
    assert.ok(b.mines <= Math.max(1, Math.floor((b.width * b.height) / 5) - 1), JSON.stringify(b));
    sizes.add(`${b.width}x${b.height}`);
  }
  assert.ok(sizes.size > 100, 'the fill varies');
});

test('the board choice module touches only the elements it is handed', () => {
  const src = read('js/classic2d/board-choice.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
  const mode = read('js/classic2d/mode.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(mode, /\b(document|window|localStorage)\b/, 'the mode is DOM-free: the shell hands it its flow');
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const between = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end));
const CHOICE = between(INDEX, '<section id="c2d-choice"', '<!-- Classic 2D board -->');
const LAYER = between(INDEX, '<section id="c2d"', '<!-- In-game HUD -->');

test('index.html builds the Classic 2D board choice from kit components: the title over a window, the options beside what the chosen one needs, a bottom bar', () => {
  assert.ok(CHOICE.length > 500, 'index.html has the Classic 2D board choice');
  assert.match(CHOICE, /^<section id="c2d-choice" class="overlay ui-backdrop hidden" aria-label="Classic 2D board choice">/);
  assert.match(CHOICE, /<h1 class="ui-wordmark" id="c2d-choice-wordmark" aria-label="Minesweeper 3D">/, 'the game\'s title, as on the menu');
  assert.match(CHOICE, /<section class="ui-frame" id="c2d-choice-frame" aria-labelledby="c2d-choice-title">/);
  assert.match(CHOICE, /<div class="ui-frame__start"><button type="button" id="c2d-choice-back" class="ui-button ui-button--secondary ui-button--sm" data-back>Main menu <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button><\/div>/);
  assert.match(CHOICE, /<h2 class="ui-frame__title" id="c2d-choice-title">Classic 2D<\/h2>/);

  // Left: Board, the presets and Custom, a divider, Insert Board Code with no icon.
  const left = between(CHOICE, '<div class="ui-column" id="c2d-choice-options">', '<div class="ui-divider ui-divider--vertical"');
  assert.match(left, /<h3 class="ui-section-label__text" id="c2d-board-label">Board<\/h3>/);
  const options = [...left.matchAll(/<button type="button" class="ui-option" aria-pressed="false" data-size="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(options, ['beginner', 'intermediate', 'expert', 'custom', 'code']);
  const unescape = (t) => t.replace(/&times;/g, '×').replace(/&middot;/g, '·').replace(/&ndash;/g, '–');
  for (const size of CHOICE_SIZES) {
    const b = unescape(left.slice(left.indexOf(`data-size="${size}"`), left.indexOf('</button>', left.indexOf(`data-size="${size}"`))));
    assert.match(b, /<span class="ui-option__name">[A-Z]\w+<\/span><span class="ui-chip hidden" data-last>Last played<\/span><span class="ui-option__meta">/, `${size}: its name, then its Last played chip`);
    assert.ok(b.includes(`<span class="ui-option__size">${sizeLabel(size)}</span> · <span class="ui-option__density">${mineDensity(STANDARD_SIZES[size])}</span>`), `${size}: its size line and density`);
  }
  assert.ok(unescape(left).includes(`<span class="ui-option__meta" data-custom-meta>${CUSTOM_HINT}</span>`));
  const divider = left.indexOf('<hr class="ui-divider">');
  assert.ok(divider > left.indexOf('data-size="custom"') && divider < left.indexOf('data-size="code"'), 'a divider before Insert Board Code');
  const code = left.slice(left.indexOf('data-size="code"'), left.indexOf('</button>', left.indexOf('data-size="code"')));
  assert.match(code, /<span class="ui-option__name">Insert Board Code<\/span><span class="ui-option__meta">Play the exact board a code describes<\/span>/);
  assert.doesNotMatch(code, /ui-option__badge|ui-chip/, 'no icon');
  assert.doesNotMatch(left, /ui-menu|data-detail|3BV|Best /, 'no detail lines: no 3BV and no best on an option');

  // Right: the settings, the custom form, the bests, the code panel.
  const right = between(CHOICE, '<div class="ui-column" id="c2d-choice-detail">', '<footer class="ui-frame__foot">');
  assert.match(right, /<div id="c2d-settings" data-settings>\s*<div class="ui-section-label"><h3 class="ui-section-label__text">Board settings<\/h3><\/div>\s*<label class="ui-toggle"><input type="checkbox" role="switch" id="c2d-noguess" class="ui-toggle__input" data-noguess><span class="ui-toggle__label">No-guess<\/span><\/label>/);
  assert.ok(right.includes(`<p id="c2d-noguess-help" class="ui-text ui-text--muted">${NOGUESS_HELP_TEXT}</p>`));
  assert.ok(right.indexOf('data-density-hint') > right.indexOf('c2d-noguess-help') && right.indexOf('data-density-hint') < right.indexOf('<form id="c2d-custom"'), 'the density hint under the switch');
  const form = right.slice(right.indexOf('<form id="c2d-custom"'), right.indexOf('</form>'));
  assert.match(form, /^<form id="c2d-custom" class="ui-panel hidden"/, 'the form shows for Custom only');
  for (const f of ['width', 'height', 'mines']) {
    assert.match(form, new RegExp(`<label class="ui-field"><span class="ui-field__label">[^<]+</span><input id="c2d-${f}" data-field="${f}" class="ui-field__input" type="number"`), f);
  }
  assert.match(form, new RegExp(`id="c2d-width"[^>]*min="${CUSTOM_LIMITS.minSide}" max="${CUSTOM_LIMITS.maxSide}"`));
  assert.match(form, /id="c2d-mines"[^>]*min="1"/, 'a custom board takes at least one mine');
  const [info, random, refusal] = ['data-info', 'id="c2d-random"', 'data-refusal'].map((x) => form.indexOf(x));
  assert.ok(info > form.indexOf('id="c2d-mines"') && random > info && refusal > random, 'the fields, the info line, Random, the refusal line');
  assert.match(form, /<button type="button" id="c2d-random" class="ui-button ui-button--secondary ui-button--sm" data-random>Random<\/button>/);
  assert.match(form, /<p id="c2d-refusal" class="ui-text ui-text--warning hidden" data-refusal><\/p>/);
  assert.doesNotMatch(CHOICE, /c2d-start|type="submit"/, 'Play starts a custom board');
  const bests = right.slice(right.indexOf('<div id="c2d-bests"'), right.indexOf('<div id="c2d-code-panel"'));
  assert.ok(right.indexOf('<div id="c2d-bests"') > right.indexOf('</form>'), 'the bests under the form');
  assert.match(bests, /<hr class="ui-divider">\s*<div class="ui-section-label"><h3 class="ui-section-label__text" id="c2d-bests-title" data-bests-title>/);
  const tiles = [...bests.matchAll(/<div id="c2d-best-(\w+)" class="ui-stat ui-stat--tile" role="group" aria-labelledby="c2d-best-\1-label" data-best="\1"><span class="ui-stat__label" id="c2d-best-\1-label">([^<]+)<\/span>/g)];
  assert.deepEqual(tiles.map((m) => [m[1], m[2]]), [['time', 'Time'], ['bbbvPerSecond', '3BV/s'], ['efficiency', 'Efficiency']], 'three tiles only');
  assert.doesNotMatch(right, /[Ww]in rate|[Ss]treak|[Rr]ecent|Top 5|<canvas/, 'no wins, rates, streak, charts, recent games or Top 5');
  const panel = right.slice(right.indexOf('<div id="c2d-code-panel"'));
  assert.match(panel, /^<div id="c2d-code-panel" class="hidden" role="group" aria-labelledby="c2d-code-title" data-code-panel>/);
  assert.match(panel, /<input id="c2d-code" data-code-field class="ui-field__input" type="text"/);
  assert.ok(panel.includes(`<p id="c2d-code-info" class="ui-text ui-text--muted" data-code-info>${CODE_PROMPT}</p>`));
  assert.doesNotMatch(CHOICE, /c2d-code-play|Play this board/, 'the code is played with Play');

  // The bottom bar: the summary, Records and Play with its Enter hint.
  const foot = between(CHOICE, '<footer class="ui-frame__foot">', '</footer>');
  assert.match(foot, /<p class="ui-frame__summary" id="c2d-summary" data-summary><\/p>\s*<div class="ui-actions ui-actions--row">\s*<button type="button" id="c2d-records" class="ui-button ui-button--secondary" data-records>Records<\/button>\s*<button type="button" id="c2d-play" class="ui-button ui-button--primary ui-button--lg" data-play>Play <span class="ui-key-hint" data-action="select" aria-hidden="true"><\/span><\/button>/);
  for (const [, cls] of CHOICE.matchAll(/class="([^"]+)"/g)) {
    for (const c of cls.split(/\s+/)) assert.ok(c.startsWith('ui-') || ['overlay', 'hidden'].includes(c), `kit class: ${c}`);
  }
});

test('the shell stylesheet lays the board choice out: the window under the title, centred unless the page is too short, denser rows, one column on a phone', () => {
  // The rules are the 3D board choice's too (tests/mode3d-board-choice.test.mjs).
  const css = read('css/style.css');
  assert.match(css, /\n#c2d-choice-top, #board-choice-top \{ flex: 1 1 0;/, 'the space above the window grows with the page');
  assert.match(css, /\n#c2d-choice::after, #board-choice::after \{ content: ""; flex: 1 1 0;/, 'as much as the space below it');
  assert.match(css, /\n#c2d-choice-frame, #board-choice-frame \{ flex: 0 1 auto; width: 1120px; \}/);
  assert.match(css, /@media \(max-width: 1439px\) \{\n  #c2d-choice-frame, #board-choice-frame \{ width: 1080px; \}[\s\S]*?#c2d-choice \.ui-option, #board-choice \.ui-option \{ min-height: 46px;/);
  assert.match(css, /@media \(max-width: 1199px\) \{ #c2d-choice-frame, #board-choice-frame \{ width: 984px; \} \}/);
  assert.match(css, /@media \(max-width: 719px\) \{\n  #c2d-choice, #board-choice \{ padding: 0; \}\n  #c2d-choice-top, #board-choice-top, #c2d-choice-body > \.ui-divider--vertical, #board-choice-body > \.ui-divider--vertical,\n  #c2d-bests, #bc-bests, #c2d-summary, #bc-summary, #c2d-choice::after, #board-choice::after \{ display: none; \}/);
});

test('index.html holds the Classic 2D board layer with its generating and failure card', () => {
  assert.match(LAYER, /^<section id="c2d" class="ui-backdrop hidden"/);
  assert.match(LAYER, /<div id="c2d-board"><div id="c2d-panel" class="ui-board-frame hidden" aria-hidden="true"><\/div><\/div>/, 'the board area holds the board\'s frame, behind the canvas');
  assert.match(LAYER, /id="c2d-retry" class="ui-button ui-button--primary"/);
  assert.match(LAYER, /id="c2d-standard" class="ui-button ui-button--secondary">Play a standard board/);
  assert.match(LAYER, /id="c2d-offer-menu" class="ui-button ui-button--secondary">Main menu/, 'the offer has a way out');
  assert.match(LAYER, /<span id="c2d-spinner" class="ui-spinner" aria-hidden="true"><\/span>/, 'the generating card has a spinner');
  assert.match(LAYER, /id="c2d-cancel" class="ui-button ui-button--secondary">Cancel/, 'and a Cancel');
});

test('the shell cancels a 2D generation from its Cancel and Back, and shows the offer above the pause card', () => {
  assert.match(MAIN, /onCancel2D: \(\) => mode2d\.cancelGeneration\(\)/, 'Cancel cancels through the mode');
  assert.match(MAIN, /onOfferMenu2D: \(\) => /, 'Main menu on the offer');
  assert.match(MAIN, /if \(MODES\.active === 'classic-2d'\) return mode2d\.cancelGeneration\(\);/, 'Back cancels through the active mode');
});

test('the shell registers the mode, routes its screens and reaches the board with the controller', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /'classic-2d-choice': \{[^\n]*defaultFocus: '\[data-size\]\[aria-pressed="true"\]'/, 'the board choice focuses the chosen option, the last choice when it opens');
  assert.match(table, /'classic-2d': \{[^\n]*defaultFocus: null[^\n]*back: \(\{ source \}\) => backGame\(/, 'Back on the board is Pause, or cancels a board being generated');
  assert.match(MAIN, /MODES\.register\('classic-2d', \(report\) => createClassic2DMode\(report, /);
  assert.match(MAIN, /c2d: 'classic-2d'/, 'the board layer is a controller layer');
  assert.match(MAIN, /'c2d-choice': 'classic-2d-choice'/, 'the controller reaches the board choice');
  assert.match(MAIN, /mode2d\.pad\(/, 'the shell\'s controller poll reaches the cursor input');
  assert.match(MAIN, /mode2d\.tick\(\)/, 'the overlay feed runs every frame');
  assert.match(MAIN, /mode2d\.loadChoice\(\)/, 'the last board choice is loaded at start-up');
});

test('the shell hands the board its scale, frame and panel, keeps the scale live and shows the scroll hint once', () => {
  const flow = MAIN.slice(MAIN.indexOf('const FLOW_2D = {'), MAIN.indexOf('const board2d ='));
  assert.match(flow, /scale: \(\) => SETTINGS\.get\('boardScale'\)/, 'a new board opens at the setting');
  assert.match(flow, /frame: \(\) => ui\.panelFrame2D\(\)/, 'the board\'s frame inset');
  assert.match(flow, /layout: \(layout\) => \{ ui\.placePanel2D\(panelRect\(layout, ui\.panelFrame2D\(\)\), boardFrameRadius\(layout\.tile\)\); clipped2D\(layout\.scrolls\); \}/, 'each refit places the board\'s frame, its radius following the tile');
  assert.match(flow, /figures: \(input, \{ tick \}\) => ui\.updateFigures2D\(input, \{ tick, bests: bests2D \}\)/, 'the live figures, with the bests read at the game\'s start');
  assert.match(MAIN, /bests2D = RECORDS\.bests\(b\.identity\)/, 'the board\'s bests read once per game from the records store');
  assert.match(flow, /scrolled: \(\) => scrolled2D\(\)/);
  assert.match(MAIN, /SETTINGS\.onChange\('boardScale', \(scale\) => \{ mode2d\.setScale\(scale\); REPLAY_VIEWER\.setScale\(scale\); \}\)/, 'a change applies at once, in play and in the viewer');
  assert.match(MAIN, /function scrolled2D\(\) \{\n  if \(FIRST_USE\.once\('scrollHint'\)\) refreshHints\(\);/, 'a scroll ends the hint for good');
  assert.match(MAIN, /hint2D\.clipped && !FIRST_USE\.shown\('scrollHint'\)/, 'shown on a clipped board until seen');
  assert.match(MAIN, /if \(kind === 'scroll'\) FIRST_USE\.once\('scrollHint'\)/, 'dismissed for good');
});

test('the catalogue documents the Classic 2D board choice', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Classic 2D board choice \(index\.html #c2d-choice\)[\s\S]*?Default focus: the last board choice/);
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser, menu → Classic 2D → Expert → first click → pause → resume → back to menu reports the abandoned game', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || document.activeElement?.dataset?.size || '');
    await ms(() => {
      globalThis.__abandoned = [];
      globalThis.__ms.pauser.attach('abandoned', (summary, m) => globalThis.__abandoned.push({ summary, mode: m }));
    });

    // The menu's Classic 2D entry opens its board choice, Beginner first when nothing was played.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.equal(await active(), 'beginner');
    // Custom: an impossible mine count is refused with its reason, and Play waits.
    await page.click('#c2d-choice [data-size="custom"]');
    await page.fill('#c2d-width', '5');
    await page.fill('#c2d-height', '5');
    await page.fill('#c2d-mines', '25');
    assert.equal(await ms(() => document.getElementById('c2d-info').textContent), '25 cells · up to 24 mines');
    assert.match(await ms(() => document.getElementById('c2d-refusal').textContent), /mines/i);
    assert.equal(await ms(() => document.getElementById('c2d-play').disabled), true, 'an invalid custom board does not start');
    await page.press('#c2d-mines', 'Enter');
    assert.equal(await mode(), 'classic-2d-choice');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // Expert, then the first click in the middle of the board.
    await page.click('#menu-entry-classic-2d');
    await page.uncheck('#c2d-noguess'); // a standard Expert board: no-guess is on by default
    await page.click('#c2d-choice [data-size="expert"]');
    assert.equal(await mode(), 'classic-2d-choice', 'a click chooses the board');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d');
    assert.equal(await ms(() => globalThis.__ms.modes.active), 'classic-2d');
    const box = await page.locator('#c2d-board canvas').first().boundingBox();
    assert.ok(box && box.width > 0, 'the board canvas shows');
    const edge = await ms(() => {
      const l = globalThis.__ms.board2D.layout;
      const area = document.getElementById('c2d-board').getBoundingClientRect();
      const strip = document.getElementById('c2d-counters').getBoundingClientRect();
      return { stripBottom: strip.bottom, boardTop: area.top + l.viewY };
    });
    assert.ok(edge.boardTop >= edge.stripBottom, `the board sits below the counter strip (${edge.boardTop}, ${edge.stripBottom})`);
    assert.equal(await ms(() => document.getElementById('c2d-mines-left').textContent), '099');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    await page.waitForFunction(() => document.getElementById('c2d-time').textContent !== '000', null, { timeout: patience(5000) });

    // Pause hides the board; resume brings it back.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    assert.equal(await active(), 'p-resume');
    // The clock runs through the pause: the HUD and the pause card's time go on.
    await ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const before = Number(await ms(() => document.getElementById('c2d-time').textContent));
    const card = async () => Number((await ms(() => document.getElementById('pause-sub').textContent)).match(/^Time (\d+)\./)[1]);
    const cardBefore = await card();
    await page.waitForFunction(([hud, sub]) => Number(document.getElementById('c2d-time').textContent) > hud
      && Number(document.getElementById('pause-sub').textContent.match(/^Time (\d+)\./)[1]) > sub, [before, cardBefore], { timeout: patience(5000) });
    assert.equal(await mode(), 'paused', 'still paused');
    assert.ok(Number(await ms(() => document.getElementById('c2d-time').textContent)) > before, 'the timer runs while paused');
    assert.ok(await card() > cardBefore, 'the pause card\'s time advances while it shows');
    await page.click('#p-resume');
    assert.equal(await mode(), 'classic-2d');

    // Main menu, confirming the loss.
    await page.keyboard.press('Escape');
    await page.click('#p-menu');
    assert.ok(await ms(() => !document.getElementById('pause-confirm').classList.contains('hidden')), 'leaving asks first');
    await page.click('#p-confirm-yes');
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => document.querySelector('#c2d-board canvas')), null, 'the canvas is released');
    const abandoned = await ms(() => globalThis.__abandoned);
    assert.equal(abandoned.length, 1);
    assert.equal(abandoned[0].mode, 'classic-2d');
    assert.equal(abandoned[0].summary.outcome, 'abandoned');
    assert.equal(abandoned[0].summary.board.width, 30);
    assert.ok(abandoned[0].summary.elapsedMs >= 1000);
    assert.equal(abandoned[0].summary.pauses, 2, 'two pauses: the one resumed, and the one left from');
    assert.ok(abandoned[0].summary.pausedMs >= 1200);

    // The board choice reopens on the last choice; the abandoned game set no best.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await active(), 'expert');
    assert.equal(await ms(() => document.querySelector('#c2d-choice [aria-pressed="true"]').dataset.size), 'expert');
    assert.equal(await ms(() => document.getElementById('c2d-noguess').checked), false, 'the switch as last played');
    assert.equal(await ms(() => document.getElementById('c2d-bests-title').textContent), 'Expert · your bests');
    assert.equal(await ms(() => document.querySelector('#c2d-best-time .ui-stat__detail').textContent), 'no best yet');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the board choice: a click chooses, Play or Enter plays; the bests follow the switch and the records; Custom with Random; Insert Board Code; Records and back', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const text = (id) => ms((i) => document.getElementById(i).textContent, id);
    const shown = (id) => ms((i) => { const e = document.getElementById(i); return !e.closest('.hidden') && e.getBoundingClientRect().height > 0; }, id);
    const chosen = () => ms(() => [...document.querySelectorAll('#c2d-choice [aria-pressed="true"]')].map((b) => b.dataset.size));
    const tiles = () => ms(() => [...document.querySelectorAll('#c2d-bests [data-best]')].map((t) => [t.querySelector('.ui-stat__label').textContent, t.querySelector('.ui-stat__value').textContent, t.querySelector('.ui-stat__detail').textContent]));

    // A new player: Beginner chosen and focused, no-guess on, no bests yet.
    await page.click('#menu-entry-classic-2d');
    assert.deepEqual(await chosen(), ['beginner']);
    assert.equal(await ms(() => document.activeElement?.dataset.size), 'beginner');
    assert.equal(await ms(() => document.querySelector('#c2d-choice [data-size="beginner"] [data-last]').classList.contains('hidden')), true, 'not "Last played" before a game');
    assert.equal(await text('c2d-summary'), 'Beginner · 9 × 9 · 10 mines · no-guess');
    assert.equal(await text('c2d-bests-title'), 'Beginner · no-guess · your bests');
    assert.deepEqual(await tiles(), [['Time', '—', 'no best yet'], ['3BV/s', '—', 'no best yet'], ['Efficiency', '—', 'no best yet']]);
    assert.deepEqual([await shown('c2d-settings'), await shown('c2d-custom'), await shown('c2d-bests'), await shown('c2d-code-panel')], [true, false, true, false]);

    // Intermediate with no-guess off; a win recorded meanwhile shows at once, with its date.
    await page.click('#c2d-choice [data-size="intermediate"]');
    assert.deepEqual(await chosen(), ['intermediate']);
    assert.equal(await mode(), 'classic-2d-choice');
    await page.click('#c2d-noguess');
    assert.equal(await text('c2d-summary'), 'Intermediate · 16 × 16 · 40 mines');
    assert.equal(await text('c2d-bests-title'), 'Intermediate · your bests');
    await ms(async () => {
      const { buildSummary } = await import('/js/records/summary.js');
      const engine = { outcome: 'won', bbbv: 20, bbbvSolved: 20, clicks: { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } } };
      globalThis.__ms.records.record(buildSummary({ engine, elapsedMs: 48213, board: { mode: 'classic-2d', grid: 'square', width: 16, height: 16, mines: 40, noGuess: false }, seed: 1, generatorVersion: 1, endedAt: new Date(2026, 9, 9, 12), id: 'w-1' }));
    });
    assert.deepEqual(await tiles(), [['Time', '48.213 s', '9 Oct 2026'], ['3BV/s', '0.41', '9 Oct 2026'], ['Efficiency', '80.0%', '9 Oct 2026']]);
    await page.click('#c2d-noguess');
    assert.deepEqual((await tiles()).map((x) => x[1]), ['—', '—', '—'], 'the no-guess twin is another board');
    await page.click('#c2d-noguess');

    // Records opens on the chosen board and switch; Back returns here, as it was.
    await page.click('#c2d-records');
    assert.equal(await mode(), 'records');
    assert.match(await ms(() => document.querySelector('#records-picker [aria-checked="true"]')?.textContent ?? ''), /Intermediate/);
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.deepEqual(await chosen(), ['intermediate']);
    assert.equal(await ms(() => document.getElementById('c2d-noguess').checked), false);

    // Custom: the form and the bests for that size; Random fills a valid board; a refused one disables Play.
    await page.click('#c2d-choice [data-size="custom"]');
    assert.deepEqual([await shown('c2d-settings'), await shown('c2d-custom'), await shown('c2d-bests'), await shown('c2d-code-panel')], [true, true, true, false]);
    assert.equal(await text('c2d-summary'), 'Custom · 30 × 16 · 99 mines');
    assert.equal(await text('c2d-bests-title'), '30 × 16 · 99 mines · your bests');
    assert.equal(await ms(() => document.querySelector('#c2d-choice [data-custom-meta]').textContent), '30 × 16 · 99 mines · 20.6 % mines');
    await page.fill('#c2d-mines', '400');
    assert.equal(await ms(() => document.getElementById('c2d-play').disabled), true);
    assert.equal(await shown('c2d-refusal'), true);
    assert.equal(await ms(() => document.getElementById('c2d-mines').getAttribute('aria-invalid')), 'true');
    assert.equal(await ms(() => document.getElementById('c2d-mines').classList.contains('is-invalid')), true, 'the refused field is marked invalid');
    assert.equal(await ms(() => document.querySelectorAll('#c2d-choice .ui-field__input.is-invalid').length), 1, 'and only it');
    assert.equal(await text('c2d-summary'), 'Custom · 30 × 16 · 400 mines', 'the refused board summarised');
    for (let i = 0; i < 5; i++) {
      await page.click('#c2d-random');
      const f = await ms(() => ['width', 'height', 'mines'].map((n) => Number(document.getElementById(`c2d-${n}`).value)));
      assert.ok(f.every(Number.isInteger) && f[0] * f[1] >= 2 && f[2] >= 1 && f[2] < f[0] * f[1], `a valid board: ${f}`);
      assert.equal(await ms(() => document.getElementById('c2d-play').disabled), false);
      assert.equal(await shown('c2d-refusal'), false);
      assert.equal(await ms(() => document.querySelectorAll('#c2d-choice .ui-field__input.is-invalid').length), 0, 'no field marked invalid');
      assert.equal(await text('c2d-info'), `${(f[0] * f[1]).toLocaleString('en-US')} ${f[0] * f[1] === 1 ? 'cell' : 'cells'} · up to ${maxMines(f[0], f[1]).toLocaleString('en-US')} ${maxMines(f[0], f[1]) === 1 ? 'mine' : 'mines'}`);
    }

    // Insert Board Code: only the code field; Play waits for an accepted code, then plays it.
    await page.click('#c2d-choice [data-size="code"]');
    assert.deepEqual([await shown('c2d-settings'), await shown('c2d-custom'), await shown('c2d-bests'), await shown('c2d-code-panel')], [false, false, false, true]);
    assert.equal(await text('c2d-code-info'), CODE_PROMPT);
    assert.equal(await text('c2d-summary'), 'Board code · paste a code to play');
    assert.equal(await ms(() => document.getElementById('c2d-play').disabled), true);
    await page.fill('#c2d-code', 'nonsense');
    assert.equal(await ms(() => document.getElementById('c2d-code-info').classList.contains('ui-text--warning')), true);
    assert.equal(await ms(() => document.getElementById('c2d-play').disabled), true);
    const code = await ms(async () => (await import('/js/records/board-code.js')).encodeBoardCode({ board: { mode: 'classic-2d', grid: 'square', width: 16, height: 16, mines: 40, noGuess: true }, seed: 3, startCell: 40, generatorVersion: 1 }));
    await page.fill('#c2d-code', code);
    assert.equal(await ms(() => document.getElementById('c2d-play').disabled), false);
    assert.equal(await text('c2d-summary'), 'Board code · Intermediate · no-guess');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d', 'Play plays the code\'s challenge');
    assert.equal(await ms(() => globalThis.__ms.modes.state.mode), 'classic-2d');
    await ms(() => globalThis.__ms.pause());
    await page.click('#p-menu');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu');

    // Enter on an option chooses it and plays it.
    await page.click('#menu-entry-classic-2d');
    await ms(() => document.querySelector('#c2d-choice [data-size="expert"]').focus());
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d');
    assert.equal(await text('c2d-size'), '30 × 16 · 99 mines · no-guess');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the board choice at every supported window size: its window\'s width, centred under the title, no horizontal scroll, the presets unscrolled at 768 px high, one column on a phone', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const [width, height, frame] of [[1920, 1080, 1120], [1440, 900, 1120], [1366, 768, 1080], [1280, 800, 1080], [1024, 768, 984], [390, 844, 390]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.addInitScript(removeWebGL2);
      await page.goto(`${base}/index.html`);
      await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
      await page.click('#menu-entry-classic-2d');
      const at = `${width} × ${height}`;
      for (const size of ['intermediate', 'custom', 'code']) {
        await page.click(`#c2d-choice [data-size="${size}"]`);
        const m = await page.evaluate(() => {
          const r = (id) => document.getElementById(id).getBoundingClientRect();
          const body = document.getElementById('c2d-choice-body');
          return {
            scroll: document.documentElement.scrollWidth, layer: document.getElementById('c2d-choice').scrollWidth,
            frame: r('c2d-choice-frame'), title: r('c2d-choice-wordmark'), body: [body.scrollHeight, body.clientHeight, body.scrollWidth, body.clientWidth],
            bests: getComputedStyle(document.getElementById('c2d-bests')).display, summary: getComputedStyle(document.getElementById('c2d-summary')).display,
            play: r('c2d-play'),
          };
        });
        assert.ok(m.scroll <= width && m.layer <= width && m.body[2] <= m.body[3], `${at} ${size}: no horizontal scroll`);
        assert.equal(Math.round(m.frame.width), frame, `${at}: the window's width`);
        assert.ok(m.frame.bottom <= height + 0.5 && m.play.bottom <= height, `${at} ${size}: the window and Play in the page`);
        if (width > 719) {
          assert.ok(m.frame.top >= m.title.bottom, `${at} ${size}: the window under the title`);
          const centred = Math.abs((m.frame.top + m.frame.bottom) / 2 - height / 2) <= 1;
          assert.ok(centred || m.frame.top - m.title.bottom <= 40, `${at} ${size}: centred, or pushed just below the title`);
          if (size !== 'custom' && height <= 900) assert.ok(m.body[0] <= m.body[1], `${at} ${size}: the window fits the page unscrolled`);
        } else {
          assert.equal(m.title.height, 0, 'no title on a phone');
          assert.equal(m.bests, 'none', 'no bests on a phone');
          assert.equal(m.summary, 'none');
          assert.ok(Math.abs(m.play.bottom - height) <= 24, 'Play pinned at the bottom');
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, at 1024 × 768, 1366 × 650 and 1280 × 800: Expert in the window, unclipped at 1280 × 800 and in the viewer, Beginner at 48 px, the counters and Pause, a clipped board\'s marks and hint, and no ring for a mouse player', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const STANDARD = { beginner: { size: 'beginner', noGuess: false }, expert: { size: 'expert', noGuess: false } };
  try {
    for (const viewport of [{ width: 1024, height: 768 }, { width: 1366, height: 650 }, { width: 1280, height: 800 }]) {
      for (const theme of ['joyful-tiles']) {
        const at = `${viewport.width} × ${viewport.height} ${theme}`;
        const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.addInitScript(removeWebGL2);
        await page.goto(`${base}/index.html`);
        await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
        const ms = (fn, arg) => page.evaluate(fn, arg);
        // A game starts once the theme's board module is handed over, so its first layout is on its pitch.
        const start = (choice) => ms(async (c) => {
          const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
          while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
          globalThis.__ms.modes.start('classic-2d', c);
        }, choice);
        // Read once the board is laid out in the area as it stands: a board that scrolls shows the
        // hint strip, which shrinks the area, and the board fits again when the area's resize lands.
        const geometry = async () => {
          await page.waitForFunction(() => {
            const v = globalThis.__ms.board2D;
            const r = document.getElementById('c2d-board').getBoundingClientRect();
            return v && v.layout.width === Math.round(r.width) && v.layout.height === Math.round(r.height);
          });
          return measure();
        };
        const measure = () => ms(() => {
          const v = globalThis.__ms.board2D;
          const area = document.getElementById('c2d-board').getBoundingClientRect();
          const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
          return {
            layout: { ...v.layout }, scale: v.scale, cursor: v.cursor, area: rect(document.getElementById('c2d-board')),
            panel: rect(document.getElementById('c2d-panel')), strip: rect(document.getElementById('c2d-counters')),
            pause: rect(document.getElementById('c2d-pause')), frame: rect(document.getElementById('c2d-frame')), areaTop: area.top, areaLeft: area.left,
          };
        });

        // Expert at the default scale, in the window: the board's frame around it, the counter strip above it.
        await start(STANDARD.expert);
        await page.waitForFunction(() => globalThis.__ms.board2D);
        const g = await geometry();
        assert.equal(g.scale, '100', `${at}: the default scale`);
        assert.ok(g.layout.tile >= 26 && g.layout.tile <= 48, `${at}: Expert at ${g.layout.tile} px`);
        if (viewport.width === 1280) {
          assert.equal(g.layout.scrolls, false, `${at}: Expert fits with no scrolling`);
          assert.deepEqual([g.layout.viewWidth, g.layout.viewHeight], [30 * g.layout.tile + 29 * g.layout.gap, 16 * g.layout.tile + 15 * g.layout.gap], `${at}: no clipped cell`);
        }
        assert.ok(g.panel.x >= g.area.x - 0.5 && g.panel.x + g.panel.width <= g.area.x + g.area.width + 0.5, `${at}: the board's frame inside the area`);
        assert.ok(g.panel.y >= g.area.y - 0.5 && g.panel.y + g.panel.height <= g.area.y + g.area.height + 0.5, `${at}: the board's frame inside the area`);
        assert.ok(g.strip.y + g.strip.height <= g.areaTop + g.layout.viewY, `${at}: the counter strip above the board`);
        assert.ok(g.pause.y + g.pause.height <= g.strip.y && g.pause.x + g.pause.width <= g.frame.x + g.frame.width, `${at}: Pause in the window's head`);
        assert.ok(g.frame.x >= 0 && g.frame.x + g.frame.width <= viewport.width && g.frame.y + g.frame.height <= viewport.height, `${at}: the window inside the screen`);
        assert.deepEqual(await ms(() => ['c2d-time', 'c2d-mines-left', 'c2d-clicks'].map((id) => document.getElementById(id).textContent)), ['000', '099', '0']);
        assert.match(await ms(() => getComputedStyle(document.getElementById('c2d-panel')).backgroundColor), /^rgb\(/, `${at}: the board's frame is an opaque surface`);

        // A mouse player: the first click plays, and no ring is ever drawn.
        const cx = g.areaLeft + g.layout.viewX + g.layout.viewWidth / 2;
        const cy = g.areaTop + g.layout.viewY + g.layout.viewHeight / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.click(cx, cy);
        await page.waitForFunction(() => globalThis.__ms.modes.state.started);
        assert.equal(await ms(() => globalThis.__ms.board2D.cursor), -1, `${at}: no ring for a mouse player`);
        // Pause is in the head and pauses.
        await page.click('#c2d-pause');
        assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused', `${at}: Pause pauses`);
        await page.click('#p-resume');

        // Beginner: the largest tile whose board, gaps included, fits the frame, at most 48 px — 48 px
        // at 1280 × 800.
        await start(STANDARD.beginner);
        const b = await geometry();
        const room = Math.min(b.area.width, b.area.height) - 2 * 9;
        assert.ok(b.layout.tile <= 48 && 9 * b.layout.tile + 8 * b.layout.gap <= room, `${at}: Beginner fits at ${b.layout.tile} px`);
        assert.ok(9 * (b.layout.tile + 1) + 8 * Math.round((b.layout.tile + 1) * b.layout.gap / b.layout.tile) > room || b.layout.tile === 48, `${at}: at the largest tile that fits`);
        if (viewport.width === 1280) assert.equal(b.layout.tile, 48, `${at}: Beginner at 48 px`);

        // A clipped custom board: the shadow, the scroll bar and the one-time hint.
        await start({ size: 'custom', custom: { width: 100, height: 60, mines: 600 }, noGuess: false });
        const c = await geometry();
        assert.equal(c.layout.scrolls, true, `${at}: a 100 × 60 board scrolls`);
        assert.equal(c.layout.tile, 26, `${at}: at the floor`);
        assert.ok(Math.abs(c.panel.width - c.area.width) <= 1, `${at}: the board's frame fills the area`);
        await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'));
        assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), 'Wheel scrolls · Shift+wheel sideways');
        const marks = await ms(() => {
          const v = globalThis.__ms.board2D;
          const l = v.layout;
          const ctx = v.canvas.getContext('2d');
          const px = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
          return {
            plain: px(l.viewX + l.viewWidth / 2 + 3, l.viewY + l.viewHeight / 2 + 3),
            bar: px(l.viewX + 20, l.viewY + l.viewHeight - 4),
            shadow: px(l.viewX + l.viewWidth - 2, l.viewY + l.viewHeight / 2 + 3),
          };
        });
        assert.notDeepEqual(marks.bar, marks.plain, `${at}: the scroll bar shows along the bottom`);
        assert.notDeepEqual(marks.shadow, marks.plain, `${at}: the right edge is shaded`);
        // Scrolling ends the hint for good: a clipped board after it shows none.
        await page.mouse.move(c.areaLeft + c.layout.viewX + 100, c.areaTop + c.layout.viewY + 100);
        await page.mouse.wheel(0, 120);
        await page.waitForFunction(() => document.getElementById('hint-strip').classList.contains('hidden'));
        assert.ok((await ms(() => globalThis.__ms.board2D.scroll.y)) > 0, `${at}: the wheel scrolled`);
        await start({ size: 'custom', custom: { width: 100, height: 60, mines: 600 }, noGuess: false });
        await page.waitForTimeout(50);
        assert.equal(await ms(() => document.getElementById('hint-strip').classList.contains('hidden')), true, `${at}: never again`);

        // The viewer: Expert fits above the controls.
        if (viewport.width !== 1366) {
          await ms(() => globalThis.__ms.modes.leave());
          await ms(async () => {
            const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-expert-abandoned.msrp')).arrayBuffer());
            globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
          });
          await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
          const v = await ms(() => {
            const board = document.getElementById('replay-board').getBoundingClientRect();
            const controls = document.getElementById('replay-controls').getBoundingClientRect();
            return { width: board.width, height: board.height, bottom: board.bottom, controlsTop: controls.top };
          });
          assert.ok(v.bottom <= v.controlsTop - 15, `${at}: the board area ends above the controls`);
          const tile = Math.floor(Math.min(v.width / 30, v.height / 16));
          assert.ok(tile >= 26, `${at}: Expert fits the viewer at ${tile} px, with no scrolling`);
        }
        assert.deepEqual(errors, [], `${at}: no page errors`);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, at 1024 × 768 with a mouse: the window\'s head and counter strip keep one line each above the board, and the pause card\'s key cap rows whole', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const theme of ['joyful-tiles']) {
      const at = `1024 × 768 ${theme}`;
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
      await page.addInitScript(removeWebGL2);
      await page.goto(`${base}/index.html`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      const ms = (fn, arg) => page.evaluate(fn, arg);
      await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'expert', noGuess: false }));
      await page.waitForFunction(() => globalThis.__ms.board2D);
      await ms(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const rows = await ms(() => {
        const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height }; };
        const v = globalThis.__ms.board2D;
        const area = document.getElementById('c2d-board').getBoundingClientRect();
        const line = (els) => { const r = els.map(rect); const top = Math.min(...r.map((x) => x.y)); return r.every((x) => x.y < top + Math.max(...r.map((y) => y.height)) - 1); };
        return {
          fine: matchMedia('(pointer: fine)').matches,
          head: line([document.getElementById('hud-swap'), document.getElementById('c2d-title'), document.getElementById('c2d-pause')]),
          strip: line([document.getElementById('c2d-mines-left'), document.getElementById('c2d-restart'), document.getElementById('c2d-time')]),
          stripBox: rect(document.getElementById('c2d-counters')), boardTop: area.top + v.layout.viewY,
        };
      });
      assert.ok(rows.fine, `${at}: a fine pointer`);
      assert.ok(rows.head, `${at}: Swap clicks, the title and Pause on one line`);
      assert.ok(rows.strip, `${at}: mines left, Restart and the timer on one line`);
      assert.ok(rows.stripBox.bottom <= rows.boardTop, `${at}: the strip above the board`);

      await page.click('#c2d-pause');
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused');
      const card = await ms(() => {
        const c = document.getElementById('pause-card');
        const r = c.getBoundingClientRect();
        const capRows = [...document.querySelectorAll('#pause-controls dt')].filter((dt) => dt.querySelector('kbd')).map((dt) => {
          const caps = [...dt.querySelectorAll('kbd')].map((k) => k.getBoundingClientRect());
          return { right: Math.max(...caps.map((k) => k.right)), tops: caps.map((k) => k.top), cap: parseFloat(getComputedStyle(dt.querySelector('kbd')).fontSize) };
        });
        return {
          top: r.top, bottom: r.bottom, left: r.left, right: r.right,
          innerRight: r.right - parseFloat(getComputedStyle(c).paddingRight) + 0.5, rows: capRows,
        };
      });
      assert.ok(card.top >= 0 && card.left >= 0 && card.right <= 1024, `${at}: the pause card inside the viewport's width`);
      assert.ok(card.rows.length > 0, `${at}: the controls list key caps`);
      for (const row of card.rows) {
        assert.ok(row.cap >= 11, `${at}: a key cap at ${row.cap} px`);
        assert.ok(row.tops.every((y) => Math.abs(y - row.tops[0]) <= 2), `${at}: a key cap row on one line`);
        assert.ok(row.right <= card.innerRight, `${at}: a key cap row unclipped`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

// The pause card's layout, measured in the page: its rectangle, the scroll of the card, its overlay and
// the document, where its two panels sit, its key cap rows and the font size of each kind of text.
function measurePauseCard() {
  const c = document.getElementById('pause-card');
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  const scrolls = (el) => el.scrollHeight > el.clientHeight;
  const size = (sel) => { const el = c.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
  const innerRight = c.getBoundingClientRect().right - parseFloat(getComputedStyle(c).paddingRight) + 0.5;
  const rows = [...c.querySelectorAll('#pause-controls dt')].filter((dt) => dt.querySelector('kbd')).map((dt) => {
    const caps = [...dt.querySelectorAll('kbd')].map((k) => k.getBoundingClientRect());
    return { right: Math.max(...caps.map((k) => k.right)), tops: caps.map((k) => k.top) };
  });
  const confirm = document.getElementById('pause-confirm');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    card: box(c),
    scrolls: { card: scrolls(c), overlay: scrolls(document.getElementById('pause')), document: scrolls(document.documentElement) },
    columns: c.classList.contains('ui-screen--wide') && !!c.querySelector('.ui-columns.ui-columns--two'),
    title: box(document.getElementById('pause-title')),
    actions: box(confirm.classList.contains('hidden') ? document.getElementById('pause-actions') : confirm),
    confirm: !confirm.classList.contains('hidden'),
    list: box(document.getElementById('pause-controls').closest('.ui-panel')),
    settings: box(document.getElementById('p-settings-title').closest('.ui-panel')),
    look: document.getElementById('p-sens').getBoundingClientRect().width > 0,
    rows, innerRight,
    fonts: {
      title: size('#pause-title'), status: size('#pause-sub'), button: size('#p-menu'), slider: size('.ui-slider__label'),
      switch: size('.ui-toggle__label'), heading: size('#p-settings-title'), list: size('#pause-controls dd'),
      keyName: size('#pause-controls dt'), kbd: size('#pause-controls kbd'), statLabel: size('.ui-stat__label'),
    },
  };
}
// The pause card's font sizes with a fine pointer, which its two columns leave as they are.
const PAUSE_FONTS_FINE = Object.freeze({ title: 24, status: 16, button: 17, slider: 16, switch: 16, heading: 13, list: 14, keyName: 14, kbd: 11, statLabel: null });

test('in a browser, at 1024 × 768 with a mouse: the Classic 2D pause card in two columns fits the window, no text shrinks, and below 1024 px it stays one column in its order', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const theme of ['joyful-tiles']) {
      const at = `1024 × 768 ${theme}`;
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
      await page.addInitScript(removeWebGL2);
      await page.goto(`${base}/index.html`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      await page.evaluate(() => globalThis.__ms.modes.start('classic-2d', { size: 'expert', noGuess: false }));
      await page.waitForFunction(() => globalThis.__ms.board2D);
      // The first click starts the game, so a restart asks first.
      const board = await page.locator('#c2d-board canvas').first().boundingBox();
      await page.mouse.click(board.x + board.width / 2, board.y + board.height / 2);
      await page.waitForFunction(() => globalThis.__ms.modes.state.started);
      await page.click('#c2d-pause');
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused');
      assert.ok(await page.evaluate(() => matchMedia('(pointer: fine)').matches), `${at}: a fine pointer`);
      const m = await page.evaluate(measurePauseCard);
      assert.equal(m.look, false, `${at}: no look settings on a Classic 2D card`);
      assert.ok(m.columns, `${at}: the card composed with ui-screen--wide and a ui-columns--two`);
      assert.ok(m.card.top >= 0 && m.card.left >= 0 && m.card.right <= 1024 && m.card.bottom <= 768,
        `${at}: the whole pause card inside the viewport (${JSON.stringify(m.card)})`);
      assert.deepEqual(m.scrolls, { card: false, overlay: false, document: false }, `${at}: nothing scrolls`);
      assert.ok(m.list.left >= m.settings.right && m.list.left >= m.actions.right && m.list.left >= m.title.right,
        `${at}: the controls list in the second column, beside the title, the actions and the settings`);
      assert.ok(m.list.right - m.list.left > m.settings.right - m.settings.left, `${at}: the second column the wider`);
      assert.ok(m.title.bottom <= m.actions.top && m.actions.bottom <= m.settings.top, `${at}: the first column runs title, actions, Settings`);
      assert.ok(m.rows.length > 0, `${at}: the controls list key caps`);
      for (const row of m.rows) {
        assert.ok(row.tops.every((y) => Math.abs(y - row.tops[0]) <= 2), `${at}: a key cap row on one line`);
        assert.ok(row.right <= m.innerRight, `${at}: a key cap row unclipped`);
      }
      assert.deepEqual(m.fonts, PAUSE_FONTS_FINE, `${at}: every font size on the card as it was`);

      // The restart confirmation in place of the actions fits too.
      await page.evaluate(() => globalThis.__ms.settings.set('confirmRestart', true));
      await page.click('#p-restart');
      const asking = await page.evaluate(measurePauseCard);
      assert.equal(asking.confirm, true, `${at}: the restart confirmation shows`);
      assert.ok(asking.card.top >= 0 && asking.card.left >= 0 && asking.card.right <= 1024 && asking.card.bottom <= 768,
        `${at}, the restart confirmation: the whole pause card inside the viewport (${JSON.stringify(asking.card)})`);
      assert.deepEqual(asking.scrolls, { card: false, overlay: false, document: false }, `${at}, the restart confirmation: nothing scrolls`);
      assert.ok(asking.list.left >= asking.actions.right && asking.actions.bottom <= asking.settings.top,
        `${at}, the restart confirmation: in the first column above Settings, beside the controls list`);
      await page.click('#p-confirm-no');

      // Below the kit's breakpoint the card is one column in its order: the settings above the controls list.
      await page.setViewportSize({ width: 1023, height: 768 });
      const one = await page.evaluate(measurePauseCard);
      assert.ok(one.title.bottom <= one.actions.top && one.actions.bottom <= one.settings.top && one.settings.bottom <= one.list.top,
        `${at} at 1023 px: one column, title, actions, Settings, then the controls list`);
      assert.deepEqual(one.fonts, PAUSE_FONTS_FINE, `${at} at 1023 px: every font size as it was`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, a Classic 2D Beginner game played by mouse and by keyboard calls the cues on the one sound instance, muted while the setting is on', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    // Spy on the cues of the sound module's one instance, which js/main.js plays and applyAudio drives.
    await ms(async () => {
      const { sfx } = await import('/js/audio.js');
      globalThis.__cues = [];
      for (const cue of ['reveal', 'flag', 'chord', 'noop', 'explode', 'win']) {
        const real = sfx[cue].bind(sfx);
        sfx[cue] = (...args) => { globalThis.__cues.push([cue, ...args]); return real(...args); };
      }
    });
    const cues = () => ms(() => globalThis.__cues.splice(0));
    const muted = () => ms(async () => (await import('/js/audio.js')).sfx.muted);
    // The board's cells, read from the canvas: the closed ones (a tile's centre is halfway along
    // the board module's closed face's shading), and a cell's centre on the page.
    const closedCells = () => ms(async () => {
      const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
      const canvas = document.querySelector('#c2d-board canvas');
      const l = globalThis.__ms.board2D.layout;
      const ratio = canvas.width / canvas.getBoundingClientRect().width;
      const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const closed = BOARD_ART.current().board.palette.faces2d.closed;
      const want = rgb(closed.face).map((v, i) => (v + rgb(closed.faceShade ?? closed.face)[i]) / 2);
      const ctx = canvas.getContext('2d');
      const out = [];
      for (let c = 0; c < 81; c++) {
        const x = Math.round((l.offsetX + (c % 9) * l.pitch + l.tile * 0.5) * ratio);
        const y = Math.round((l.offsetY + Math.floor(c / 9) * l.pitch + l.tile * 0.5) * ratio);
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        if (Math.abs(want[0] - r) + Math.abs(want[1] - g) + Math.abs(want[2] - b) <= 6) out.push(c);
      }
      return out;
    });
    const centre = (c) => ms((cell) => {
      const box = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const l = globalThis.__ms.board2D.layout;
      return { x: box.left + l.offsetX + (cell % 9) * l.pitch + 0.5 * l.tile, y: box.top + l.offsetY + Math.floor(cell / 9) * l.pitch + 0.5 * l.tile };
    }, c);
    const frames = () => ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="beginner"]');
    await page.click('#c2d-play');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'classic-2d');

    // By mouse: the first click is heard when its board arrives; a right click flags and unflags.
    let p = await centre(40);
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    await page.waitForFunction(() => globalThis.__cues.length > 0);
    let heard = await cues();
    assert.equal(heard.length, 1);
    assert.equal(heard[0][0], 'reveal');
    assert.ok(heard[0][1] >= 1, 'with the cells it opened');
    await frames();
    const closed = await closedCells();
    assert.ok(closed.length > 0);
    p = await centre(closed[0]);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.mouse.click(p.x, p.y, { button: 'right' });
    assert.deepEqual(await cues(), [['flag', true, 1], ['flag', false, 1]]);

    // Muted by the setting: the same instance reports muted, and is still the one played.
    await ms(() => globalThis.__ms.settings.set('muted', true));
    assert.equal(await muted(), true);
    await page.mouse.click(p.x, p.y, { button: 'right' });
    assert.deepEqual(await cues(), [['flag', true, 1]], 'played on the muted instance, which stays silent');
    await ms(() => globalThis.__ms.settings.set('muted', false));
    assert.equal(await muted(), false);

    // By keyboard, on a new board: Space's first reveal, then F on a closed cell.
    await ms(() => globalThis.__ms.modes.restart({ source: 'key' }));
    await page.waitForFunction(() => !globalThis.__ms.modes.state.started);
    await cues();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    await page.waitForFunction(() => globalThis.__cues.length > 0);
    heard = await cues();
    assert.equal(heard.length, 1);
    assert.equal(heard[0][0], 'reveal', 'the keyboard\'s first reveal is heard');
    await frames();
    const target = (await closedCells())[0];
    for (let step = 0; step < 32; step++) {
      const c = await ms(() => globalThis.__ms.board2D.cursor);
      const dc = (target % 9) - (c % 9);
      const dr = Math.floor(target / 9) - Math.floor(c / 9);
      if (!dc && !dr) break;
      await page.keyboard.press(dc > 0 ? 'ArrowRight' : dc < 0 ? 'ArrowLeft' : dr > 0 ? 'ArrowDown' : 'ArrowUp');
    }
    assert.equal(await ms(() => globalThis.__ms.board2D.cursor), target);
    await page.keyboard.press('KeyF');
    await page.keyboard.press('KeyF');
    assert.deepEqual(await cues(), [['flag', true, 1], ['flag', false, 1]]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// The board "a few moves on a board with a best" plays: a 16 × 16 board of 10 mines, its seed fixed
// so the first click on its start cell opens an area every run and the game goes on.
const BEST_BOARD = Object.freeze({
  choice: Object.freeze({ size: 'custom', custom: Object.freeze({ width: 16, height: 16, mines: 10 }), noGuess: false }),
  fixed: Object.freeze({ startCell: 136, seed: 1 }),
  bbbv: 7,
});

test('the board with a best opens an area on its first click and leaves a game to play', () => {
  const s = createSession({ choice: BEST_BOARD.choice, client: { request() { throw new Error('a standard board asks no worker'); }, cancel() {} }, fixed: BEST_BOARD.fixed });
  s.reveal(BEST_BOARD.fixed.startCell);
  assert.equal(s.state, 'playing', 'not a first-click win');
  assert.equal(s.game.cellNumber(BEST_BOARD.fixed.startCell), 0, 'the first click opens an area');
  const counts = s.counts();
  assert.equal(counts.bbbv, BEST_BOARD.bbbv);
  assert.equal(counts.bbbvSolved, 1);
  let closed = -1;
  for (let c = 0; c < 256 && closed < 0; c++) if (s.game.cellState(c) === 'closed') closed = c;
  assert.ok(closed >= 0, 'a closed cell is left to flag');
  s.toggleFlag(closed);
  assert.equal(s.state, 'playing', 'the flag leaves the game going');
});

test('in a browser, a few moves on a board with a best: the figures panel follows the game, pace against the best shows once a 3BV is solved, and the figures are never live', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    // A best on BEST_BOARD, its 3BV won in 10.5 s: 0.67 3BV/s.
    await ms(async (bbbv) => {
      const { buildSummary } = await import('/js/records/summary.js');
      const none = { effective: 0, wasted: 0 };
      const board = { mode: 'classic-2d', grid: 'square', width: 16, height: 16, mines: 10, noGuess: false };
      const engine = { outcome: 'won', mineCount: 10, bbbv, bbbvSolved: bbbv, clicks: { reveal: { effective: bbbv, wasted: 0 }, flag: none, chord: none } };
      globalThis.__ms.records.record(buildSummary({ engine, elapsedMs: 10500, board, seed: 1, generatorVersion: 1 }));
    }, BEST_BOARD.bbbv);
    await ms((board) => globalThis.__ms.modes.start('classic-2d', { ...board.choice, fixed: board.fixed }), BEST_BOARD);
    await page.waitForFunction(() => globalThis.__ms.board2D);
    const figures = () => ms(() => Object.fromEntries([...document.querySelectorAll('#c2d-figures .ui-figure[data-figure]')].map((f) => [f.dataset.figure, {
      shown: !f.classList.contains('hidden'),
      value: f.querySelector('.ui-figure__value').textContent,
      detail: f.querySelector('.ui-figure__detail')?.classList.contains('hidden') ? null : f.querySelector('.ui-figure__detail')?.textContent ?? null,
    }])));
    const before = await figures();
    assert.equal(before.pace.shown, false, 'no pace before the first 3BV');
    assert.equal(before.rate.detail, 'Best 0.67', 'the board\'s best 3BV/s, read at the game\'s start');
    assert.equal(before.clicks.value, '0');
    assert.equal(before.flags.value, '0');
    assert.equal(before.flags.detail, '10 mines left');
    assert.match(before.bbbv.value, /^0 \/ /);

    // The first click, then a flag on a closed cell.
    const cell = (c) => ms((i) => {
      const v = globalThis.__ms.board2D;
      const r = v.cellRect(i);
      const box = v.canvas.getBoundingClientRect();
      return { x: box.x + r.x + r.size / 2, y: box.y + r.y + r.size / 2 };
    }, c);
    const first = await cell(BEST_BOARD.fixed.startCell);
    await page.mouse.click(first.x, first.y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: patience(5000) });
    await page.waitForFunction(() => document.querySelector('#c2d-figures [data-figure="clicks"] .ui-figure__value').textContent === '1', null, { timeout: patience(5000) });
    const closed = await ms(() => { const g = globalThis.__ms.game2D; for (let c = 0; c < 256; c++) if (g.cellState(c) === 'closed') return c; return -1; });
    assert.ok(closed >= 0, 'a closed cell is left');
    const flag = await cell(closed);
    await page.mouse.click(flag.x, flag.y, { button: 'right' });
    await page.waitForFunction(() => document.querySelector('#c2d-figures [data-figure="flags"] .ui-figure__value').textContent === '1', null, { timeout: patience(5000) });
    const after = await figures();
    assert.equal(after.flags.detail, '9 mines left');
    assert.equal(after.clicks.value, '2', 'both clicks counted');
    assert.match(after.clicks.detail, /^Efficiency /);
    assert.equal(after.bbbv.value, `1 / ${BEST_BOARD.bbbv}`, 'the first click\'s opening is one 3BV of the board\'s');
    assert.equal(after.pace.shown, true, 'pace against the best once a 3BV is solved');
    assert.match(after.pace.value, /^[−+]?\d+\.\d{3} s$/);
    assert.equal(after.pace.detail, 'Best 10.500 s');
    const fill = await ms(() => document.querySelector('#c2d-figures .ui-figure__fill').style.width);
    assert.match(fill, /^\d+%$/);
    assert.notEqual(fill, '0%', 'the bar fills as 3BV is solved');
    // The timer's second moves the figures that take the time, and nothing in the panel but its live part is live.
    const rate = after.rate.value;
    await page.waitForFunction((r) => document.querySelector('#c2d-figures [data-figure="rate"] .ui-figure__value').textContent !== r, rate, { timeout: patience(5000) });
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#c2d [aria-live], #c2d [role="status"]')].map((e) => e.className)), ['ui-figures__live']);
    await page.waitForFunction(() => document.querySelector('#c2d-figures .ui-figures__live').textContent !== '', null, { timeout: patience(3000) });
    assert.match(await ms(() => document.querySelector('#c2d-figures .ui-figures__live').textContent), /3BV/, 'the polite live part speaks the progress');
    // The controls reminder follows the device.
    assert.match(await ms(() => document.getElementById('c2d-reminder').textContent), /Left\s*reveal/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
