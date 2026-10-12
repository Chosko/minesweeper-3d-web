// Classic 2D mode (js/classic2d/mode.js) behind the game shell's mode contract, and its board choice
// screen (js/classic2d/board-choice.js): the contract over a real mode host and pause controller,
// summary() before and after the first click, the overlay feed, pause / resume / restart / leave,
// the finished game's hand-off, the last board choice, the shell's markup and wiring, and one
// Playwright flow menu → Classic 2D → Expert → first click → pause → resume → back to menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClassic2DMode, MODE_ID } from '../js/classic2d/mode.js';
import { CHOICE_SIZES, customStatus, readChoice, sizeLabel, densityHintShown } from '../js/classic2d/board-choice.js';
import {
  createLastChoice, DEFAULT_CHOICE, LAST_CHOICE_DOC, maxMines, NOGUESS_DENSITY_HINT, DENSITY_HINT_TEXT, NOGUESS_HELP_TEXT,
} from '../js/classic2d/board-setup.js';
import { createModeHost, MODE_METHODS } from '../js/shell/mode-host.js';
import { createPauseController } from '../js/shell/pause.js';
import { createResultsFlow } from '../js/results/flow.js';
import { createRecordsStore } from '../js/records/store.js';
import { CUSTOM_LIMITS } from '../js/engine/profiles.js';
import { CELL } from '../js/engine/rules.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
  };
}

// A generation client per game. `mines` answers every request with that mine set; `hold` keeps the
// request pending until the test answers it.
function clients({ mines = null, hold = false } = {}) {
  const made = [];
  const create = () => {
    let pending = null;
    const c = {
      requests: [],
      cancels: 0,
      request(req) {
        c.requests.push(req);
        if (!hold) return Promise.resolve({ ok: true, mines: mines ?? defaultMines(req), seed: req.seed, generatorVersion: 1 });
        return new Promise((resolve) => { pending = resolve; });
      },
      cancel() {
        c.cancels += 1;
        pending?.({ ok: false, cancelled: true, reason: 'cancelled' });
        pending = null;
      },
      answer(result) { pending?.(result); pending = null; },
    };
    made.push(c);
    return c;
  };
  return { made, create };
}
// Mines in the first cells, never on the first click.
function defaultMines(req) {
  const out = [];
  for (let c = 0; out.length < req.mineCount; c++) if (c !== req.firstClick) out.push(c);
  return out;
}

// Recording mounts standing in for mountBoardView / mountPointerInput / mountCursorInput.
function mounts() {
  const log = { boards: [], pointers: [], cursors: [] };
  const board = ({ container, grid }) => {
    const v = {
      container, grid, game: null, hidden: false, updates: [], destroyed: false, canvas: { id: 'canvas' },
      setGame(g) { v.game = g; },
      update(changed) { v.updates.push([...changed]); },
      setHidden(h) { v.hidden = !!h; },
      setPressed() {}, setCursor() {}, ensureVisible() {},
      destroy() { v.destroyed = true; },
    };
    log.boards.push(v);
    return v;
  };
  const input = (list) => ({ view, session }) => {
    const m = { view, session, resets: 0, destroyed: false, polls: [], input: { reset() { m.resets += 1; } } };
    m.destroy = () => { m.destroyed = true; };
    m.pad = (poll, now) => { m.polls.push([poll, now]); };
    list.push(m);
    return m;
  };
  return { log, mount: { board, pointer: input(log.pointers), cursor: input(log.cursors) } };
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
    board(b) { calls.push(['board', b]); },
    generating(shown) { calls.push(['generating', shown]); },
    failed(f) { calls.push(['failed', f]); },
  };
  return flow;
}

const CUSTOM_3X3 = { size: 'custom', custom: { width: 3, height: 3, mines: 2 }, noGuess: false };
const memoryLastChoice = (initial) => createLastChoice({ storage: createStorage({ backend: createMemoryBackend({ initial }) }) });

// A mode registered on a real host, with a recording flow, mounts and clients.
function setup({ mines = null, hold = false, choice = null, lastChoice = memoryLastChoice() } = {}) {
  const host = createModeHost();
  const flow = fakeFlow();
  const { log, mount } = mounts();
  const cl = clients({ mines, hold });
  const clock = fakeClock();
  let seed = 7;
  const mode = host.register(MODE_ID, (report) => createClassic2DMode(report, {
    flow, lastChoice, mount, clock, createClient: cl.create, randomSeed: () => seed++,
  }));
  const events = [];
  for (const e of ['started', 'finished', 'abandoned', 'canPause', 'failed']) host.on(e, (p) => events.push([e, p]));
  if (choice) host.start(MODE_ID, choice);
  const board = () => log.boards.at(-1);
  const pointer = () => log.pointers.at(-1);
  const cursor = () => log.cursors.at(-1);
  // Act through what the pointer input was handed, as the mounted input would.
  const act = (kind, c) => pointer().session[kind](c);
  return { host, mode, flow, log, cl, clock, events, board, pointer, cursor, act, lastChoice };
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
  assert.deepEqual(flow.calls.find((c) => c[0] === 'board'), ['board', { width: 30, height: 16, mines: 99, noGuess: false }]);
  assert.deepEqual(flow.huds.at(-1), { seconds: 0, minesLeft: 99, clicks: 0 });
  await settle();
  assert.equal(lastChoice.current.size, 'expert', 'the choice is the last board choice from now on');
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
  assert.ok(events.some((e) => e[0] === 'finished'));
  const frozen = flow.huds.at(-1);
  assert.equal(frozen.clicks, 4, 'the losing click is counted');
  clock.advance(5000);
  mode.tick();
  act('reveal', 2);
  assert.equal(flow.huds.at(-1).clicks, 4, 'nothing changes the count once the game ended');
  assert.equal(flow.huds.at(-1).seconds, frozen.seconds, 'frozen with the timer');
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
  const secondClient = cl.made.at(-1);
  act('reveal', 5);
  host.leave();
  assert.equal(secondClient.cancels, 1);
  assert.equal(second.destroyed, true);
  assert.equal(pointer().destroyed && cursor().destroyed, true);
  assert.equal(host.active, null);
  assert.equal(flow.calls.filter((c) => c[0] === 'generating').every((c) => c[1] === false), true, 'no slow request was shown');
});

test('a finished game reports its summary and the results flow routes it; Play again starts the same choice', async () => {
  const { host, act, events, board } = setup({ choice: CUSTOM_3X3, mines: [0, 8] });
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

test('a no-guess failure shows its offer; a standard board keeps no-guess off for the rest of the session', async () => {
  const { host, cl, act, flow, mode, board } = setup({ hold: true, choice: { size: 'beginner', noGuess: true } });
  const p = act('reveal', 40);
  cl.made.at(-1).answer({ ok: false, reason: 'no board' });
  assert.equal(await p, null);
  const failed = flow.calls.filter((c) => c[0] === 'failed').at(-1);
  assert.deepEqual(failed[1].offers, ['retry', 'standard']);
  assert.equal(flow.calls.filter((c) => c[0] === 'board').at(-1)[1].noGuess, true);
  const q = mode.playStandard();
  assert.deepEqual(flow.calls.filter((c) => c[0] === 'failed').at(-1), ['failed', null], 'the offer is cleared');
  assert.equal(flow.calls.filter((c) => c[0] === 'board').at(-1)[1].noGuess, false, 'the board line no longer says no-guess');
  cl.made.at(-1).answer({ ok: true, mines: defaultMines({ mineCount: 10, firstClick: 40 }), seed: 1, generatorVersion: 1 });
  await q;
  assert.equal(host.state.started, true);
  host.restart({});
  assert.equal(cl.made.length, 2);
  assert.equal(board().grid.width, 9);
  act('reveal', 40);
  assert.equal(cl.made.at(-1).requests.at(-1).noGuess, false, 'restart keeps no-guess off');
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

test('the controller reaches the board through the cursor input', () => {
  const { mode, cursor } = setup({ choice: { size: 'beginner', noGuess: false } });
  const poll = { held: [true], ls: [0, 0] };
  mode.pad(poll, 5);
  assert.deepEqual(cursor().polls, [[poll, 5]]);
  mode.pause({});
  assert.ok(cursor().resets > 0, 'the cursor is reset on pause');
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

test('index.html builds the Classic 2D board choice from kit components', () => {
  assert.ok(CHOICE.length > 500, 'index.html has the Classic 2D board choice');
  assert.match(CHOICE, /^<section id="c2d-choice" class="overlay hidden"/);
  assert.match(CHOICE, /<section class="ui-card ui-screen ui-screen--wide" aria-labelledby="c2d-choice-title">/);
  const sizes = [...CHOICE.matchAll(/<button type="button" class="ui-menu__item" data-size="(\w+)">/g)].map((m) => m[1]);
  assert.deepEqual(sizes, ['beginner', 'intermediate', 'expert']);
  for (const f of ['width', 'height', 'mines']) {
    assert.match(CHOICE, new RegExp(`<label class="ui-field"><span class="ui-field__label">[^<]+</span><input id="c2d-${f}" data-field="${f}" class="ui-field__input" type="number"`), f);
  }
  assert.match(CHOICE, new RegExp(`id="c2d-width"[^>]*min="${CUSTOM_LIMITS.minSide}" max="${CUSTOM_LIMITS.maxSide}"`));
  assert.match(CHOICE, /id="c2d-mines"[^>]*min="1"/, 'a custom board takes at least one mine');
  assert.match(CHOICE, /<button type="submit" id="c2d-start" class="ui-button ui-button--primary" data-size="custom">/);
  assert.match(CHOICE, /<label class="ui-toggle"><input type="checkbox" role="switch" id="c2d-noguess" class="ui-toggle__input"/);
  // The switch sits directly under the sizes, with its helper line, before the custom panel (as in 3D).
  const sw = CHOICE.indexOf('id="c2d-noguess"');
  const help = CHOICE.indexOf(`<p id="c2d-noguess-help" class="ui-text ui-text--muted">${NOGUESS_HELP_TEXT}</p>`);
  assert.ok(sw > CHOICE.lastIndexOf('data-size="expert"') && sw < CHOICE.indexOf('<form id="c2d-custom"'), 'the switch sits under the sizes');
  assert.ok(help > sw && help < CHOICE.indexOf('<form id="c2d-custom"'), 'its helper line under it');
  const form = CHOICE.slice(CHOICE.indexOf('<form id="c2d-custom"'), CHOICE.indexOf('</form>'));
  const hint = form.indexOf('<p id="c2d-density-hint" class="ui-text ui-text--muted hidden" data-density-hint></p>');
  assert.ok(hint > form.indexOf('data-info'), 'the density hint sits under the custom panel\'s info line');
  assert.match(CHOICE, /id="c2d-choice-back" class="ui-button ui-button--secondary"[^>]*>Back/);
  for (const [, cls] of CHOICE.matchAll(/class="([^"]+)"/g)) {
    for (const c of cls.split(/\s+/)) assert.ok(c.startsWith('ui-') || ['overlay', 'hidden'].includes(c), `kit class: ${c}`);
  }
});

test('index.html holds the Classic 2D board layer with its generating and failure card', () => {
  assert.match(LAYER, /^<section id="c2d" class="hidden"/);
  assert.match(LAYER, /<div id="c2d-board"/);
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
  assert.match(table, /'classic-2d-choice': \{[^\n]*defaultFocus: '\[data-size\]\[data-last\]'/, 'the board choice focuses the last choice');
  assert.match(table, /'classic-2d': \{[^\n]*defaultFocus: null[^\n]*back: \(\{ source \}\) => backGame\(/, 'Back on the board is Pause, or cancels a board being generated');
  assert.match(MAIN, /MODES\.register\('classic-2d', \(report\) => createClassic2DMode\(report, /);
  assert.match(MAIN, /c2d: 'classic-2d'/, 'the board layer is a controller layer');
  assert.match(MAIN, /'c2d-choice': 'classic-2d-choice'/, 'the controller reaches the board choice');
  assert.match(MAIN, /mode2d\.pad\(/, 'the shell\'s controller poll reaches the cursor input');
  assert.match(MAIN, /mode2d\.tick\(\)/, 'the overlay feed runs every frame');
  assert.match(MAIN, /mode2d\.loadChoice\(\)/, 'the last board choice is loaded at start-up');
});

test('the catalogue documents the Classic 2D board choice', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Classic 2D board choice \(index\.html #c2d-choice\)[\s\S]*?Default focus: the last board choice/);
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

test('in a browser, menu → Classic 2D → Expert → first click → pause → resume → back to menu reports the abandoned game', async (t) => {
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
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
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
    // Custom: an impossible mine count is refused with its reason.
    await page.fill('#c2d-width', '5');
    await page.fill('#c2d-height', '5');
    await page.fill('#c2d-mines', '25');
    assert.match(await ms(() => document.getElementById('c2d-info').textContent), /mines/i);
    assert.ok(await ms(() => document.getElementById('c2d-info').classList.contains('ui-text--warning')));
    await page.click('#c2d-start');
    assert.equal(await mode(), 'classic-2d-choice', 'an invalid custom board does not start');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // Expert, then the first click in the middle of the board.
    await page.click('#menu-entry-classic-2d');
    await page.uncheck('#c2d-noguess'); // a standard Expert board: no-guess is on by default
    await page.click('#c2d-choice [data-size="expert"]');
    assert.equal(await mode(), 'classic-2d');
    assert.equal(await ms(() => globalThis.__ms.modes.active), 'classic-2d');
    const box = await page.locator('#c2d-board canvas').boundingBox();
    assert.ok(box && box.width > 0, 'the board canvas shows');
    const bar = await ms(() => document.querySelector('.ui-overlay-bar').getBoundingClientRect().bottom);
    assert.equal(Math.round(box.y), Math.round(bar + 16), 'the board sits 16 px below the overlay bar');
    assert.equal(await ms(() => document.getElementById('hud-mines').textContent), '99');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    await page.waitForFunction(() => document.getElementById('hud-time').textContent !== '000', null, { timeout: 10000 });

    // Pause hides the board; resume brings it back.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    assert.equal(await active(), 'p-resume');
    // The clock runs through the pause: the HUD and the pause card's time go on.
    await ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const before = Number(await ms(() => document.getElementById('hud-time').textContent));
    const card = async () => Number((await ms(() => document.getElementById('pause-sub').textContent)).match(/^Time (\d+)\./)[1]);
    const cardBefore = await card();
    await page.waitForTimeout(1200);
    await ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.ok(Number(await ms(() => document.getElementById('hud-time').textContent)) > before, 'the timer runs while paused');
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

    // The board choice reopens on the last choice.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await active(), 'expert');
    // Each size carries one detail line under its size line; the abandoned game set no best.
    const lines = await ms(() => [...document.querySelectorAll('#c2d-choice [data-size] [data-detail]')].map((l) => [l.closest('[data-size]').dataset.size, l.className, l.textContent]));
    assert.deepEqual(lines.map(([size, cls]) => [size, cls]), [['beginner', 'ui-menu__detail'], ['intermediate', 'ui-menu__detail'], ['expert', 'ui-menu__detail']]);
    assert.match(lines[2][2], /^21 % mines · ~\d+ 3BV · —$/);
    assert.equal(await ms(() => document.getElementById('c2d-noguess').checked), false, 'the switch as last played');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
