// 3D summaries (js/records/summary.js over a 3D board) and the 3D mode's summary hand-off
// (js/shell/mode-3d.js over the 3D game session, js/mode3d/session.js): the builder takes the 3D
// board choice and the engine's summary or counts over the box graph, with 3BV/s, efficiency and
// best eligibility by the unchanged 2D rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { buildSummary, bbbvPerSecond, efficiency, isBestEligible } from '../js/records/summary.js';
import { create3DGame, createSession } from '../js/mode3d/session.js';
import { createModeHost, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DMode } from '../js/shell/mode-3d.js';

// The 3D mode's end delay on a clock the test fires: endDelay() ends every pending one.
function endClock() {
  const pending = [];
  return {
    setTimeout: (fn) => { pending.push(fn); return fn; },
    clearTimeout: (fn) => { const i = pending.indexOf(fn); if (i >= 0) pending.splice(i, 1); },
    endDelay: () => { for (const fn of pending.splice(0)) fn(); },
  };
}

const cube = (X, Y, Z, mines, noGuess = false) =>
  createBoardIdentity({ mode: MODE_3D, width: X, height: Y, depth: Z, mines, noGuess });

const ENDED = new Date('2026-10-10T12:00:00.000Z');
const base = (board, engine, extra = {}) => ({
  engine, board, elapsedMs: 4000, seed: 777, generatorVersion: 1, endedAt: ENDED, id: 'g3-1', ...extra,
});

// A 5 × 1 × 1 row with its mine in the middle: cells 1 and 3 show a 1, cells 0 and 4 are zeros,
// so the row has two openings and 3BV 2.
const ROW = { X: 5, Y: 1, Z: 1, mines: [2] };
const rowGame = () => create3DGame({ X: ROW.X, Y: ROW.Y, Z: ROW.Z, minePositions: ROW.mines });
const ROW_BOARD = cube(5, 1, 1, 1);

// ---------- won, lost, abandoned ----------

test('won: a 3D engine summary becomes a record carrying the 3D board identity', () => {
  const g = rowGame();
  g.reveal(0);
  g.reveal(4);
  const engine = g.engineSummary();
  assert.equal(engine.outcome, 'won');
  const s = buildSummary(base(ROW_BOARD, engine));
  assert.deepEqual(s, {
    id: 'g3-1',
    board: { mode: '3d', width: 5, height: 1, depth: 1, mines: 1, noGuess: false },
    outcome: 'won',
    elapsedMs: 4000,
    bbbv: 2,
    bbbvSolved: 2,
    clicks: { reveal: { effective: 2, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
    bbbvPerSecond: 0.5,
    efficiency: 100,
    seed: 777,
    generatorVersion: 1,
    endedAt: '2026-10-10T12:00:00.000Z',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  for (const stat of ['time', 'bbbvPerSecond', 'efficiency']) assert.equal(isBestEligible(s, stat), true, stat);
});

test('lost: outcome from the 3D engine summary, stats from the 3BV solved so far', () => {
  const g = rowGame();
  g.reveal(0);
  g.reveal(2);
  const engine = g.engineSummary();
  assert.equal(engine.outcome, 'lost');
  const s = buildSummary(base(ROW_BOARD, engine, { elapsedMs: 2000 }));
  assert.equal(s.outcome, 'lost');
  assert.equal(s.bbbv, 2);
  assert.equal(s.bbbvSolved, 1);
  assert.equal(s.bbbvPerSecond, 0.5);
  assert.equal(s.efficiency, 50);
  for (const stat of ['time', 'bbbvPerSecond', 'efficiency']) assert.equal(isBestEligible(s, stat), false, stat);
});

test('abandoned: the 3D engine counts of a started game; none before the first click', () => {
  const g = rowGame();
  g.reveal(0);
  const s = buildSummary(base(ROW_BOARD, g.counts(), { elapsedMs: 1000 }));
  assert.equal(s.outcome, 'abandoned');
  assert.equal(s.bbbv, 2);
  assert.equal(s.bbbvSolved, 1);
  assert.equal(s.bbbvPerSecond, 1);
  assert.equal(isBestEligible(s, 'time'), false);
  const closed = create3DGame({ X: 5, Y: 1, Z: 1, mines: 1 });
  assert.equal(closed.counts().bbbv, null);
  assert.equal(buildSummary(base(ROW_BOARD, closed.counts())), null, 'a game left before its first click has no summary');
});

// ---------- efficiency and the 3D right-click ----------

test('3D efficiency: a right-click on a revealed cell is one flag click, wasted when it flags nothing', () => {
  const g = rowGame();
  g.reveal(0); // opens 0 and 1
  const r = g.toggleFlag(1); // right-click on the revealed 1: flags its closed neighbour, cell 2
  assert.equal(r.flagged, 1);
  g.toggleFlag(0); // right-click on the revealed zero: no closed neighbour, flags nothing
  g.reveal(4); // opens 4 and 3: won
  const engine = g.engineSummary();
  assert.equal(engine.outcome, 'won');
  assert.deepEqual(engine.clicks.flag, { effective: 1, wasted: 1 });
  const s = buildSummary(base(ROW_BOARD, engine));
  assert.equal(s.efficiency, 50, '3BV solved 2 over four counted clicks: two reveals and two flag clicks');
  assert.equal(s.efficiency, efficiency(s));
  assert.equal(s.bbbvPerSecond, bbbvPerSecond(s));
});

// ---------- invalid 3D input ----------

test('invalid 3D input throws a range error', () => {
  const g = rowGame();
  g.reveal(0);
  g.reveal(4);
  const engine = g.engineSummary();
  const throws = (board, eng = engine) => assert.throws(() => buildSummary(base(board, eng)), RangeError);
  throws({ mode: '3d', width: 5, height: 1, depth: 1, mines: 0, noGuess: false }); // no mine
  throws({ mode: '3d', width: 5, height: 1, depth: 1, mines: 5, noGuess: false }); // every cell a mine
  throws({ mode: '3d', width: 101, height: 1, depth: 1, mines: 1, noGuess: false }); // a dimension above 100
  throws({ mode: '3d', width: 5, height: 1, mines: 1, noGuess: false }); // no depth
  throws(cube(5, 1, 2, 1)); // the game is 5 × 1 × 1
  throws(cube(1, 5, 1, 1)); // the game is 5 × 1 × 1, not 1 × 5 × 1
  throws(cube(5, 1, 1, 2)); // the game has one mine
  throws({ mode: 'classic-2d', grid: 'square', width: 5, height: 1, mines: 1, noGuess: false }); // a 3D game, a 2D board
  // counts that do not fit the board: more 3BV than the board's safe cells
  throws(cube(2, 1, 1, 1), { bbbv: 2, bbbvSolved: 0, clicks: g.counts().clicks });
  throws(cube(5, 1, 1, 1), { bbbv: 2, bbbvSolved: 3, clicks: g.counts().clicks });
});

test('a 3D board\'s safe cells span its depth', () => {
  const clicks = { reveal: { effective: 1, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
  const s = buildSummary(base(cube(2, 2, 2, 1), { bbbv: 7, bbbvSolved: 1, clicks }));
  assert.equal(s.bbbv, 7, 'seven safe cells in a 2 × 2 × 2 box with one mine');
  assert.throws(() => buildSummary(base(cube(2, 2, 2, 1), { bbbv: 8, bbbvSolved: 1, clicks })), RangeError);
});

// ---------- the 3D mode's summary hand-off ----------

// A generation client that answers each request at once with the row's board.
const rowClient = () => ({
  request: () => Promise.resolve({ ok: true, mines: Int32Array.from(ROW.mines), seed: 4242, generatorVersion: 1 }),
  cancel() {},
});

function play3D() {
  let t = 1000;
  const clock = { now: () => t, setTimeout: () => 0, clearTimeout() {} };
  const host = createModeHost();
  const events = [];
  for (const type of MODE_EVENTS) host.on(type, (e) => events.push([type, e]));
  let session = null;
  const open = (choice) => {
    session = createSession({ board: choice, client: rowClient(), clock });
    return session;
  };
  const flow = {
    openBoardChoice() {}, pause() {}, resume() {}, leave() {},
    start: (choice) => open(choice),
    restart: () => open({ X: 5, Y: 1, Z: 1, mines: 1, noGuess: true }),
    contextLost: () => false,
    clock: endClock(),
  };
  host.register('3d', (report) => create3DMode(flow, report));
  host.start('3d', { X: 5, Y: 1, Z: 1, mines: 1, noGuess: true });
  return {
    host, events,
    get session() { return session; },
    advance: (ms) => { t += ms; },
    endDelay: () => flow.clock.endDelay(),
    of: (type) => events.filter(([ty]) => ty === type).map(([, e]) => e.summary),
  };
}

test('the 3D mode answers summary() with the started game\'s summary so far, from the builder', async () => {
  const p = play3D();
  assert.equal(p.host.summary(), null, 'nothing before the first applied reveal');
  await p.session.reveal(0);
  const [started] = p.of('started');
  assert.equal(started.outcome, 'abandoned');
  p.advance(1500);
  const s = p.host.summary();
  assert.deepEqual({ ...s, id: undefined, endedAt: undefined }, {
    id: undefined,
    board: { mode: '3d', width: 5, height: 1, depth: 1, mines: 1, noGuess: true },
    outcome: 'abandoned',
    elapsedMs: 1500,
    bbbv: 2,
    bbbvSolved: 1,
    clicks: { reveal: { effective: 1, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
    bbbvPerSecond: 1 / 1.5,
    efficiency: 100,
    seed: 4242,
    generatorVersion: 1,
    endedAt: undefined,
  });
  assert.equal(typeof s.id, 'string');
  assert.equal(s.id, started.id, 'every summary of one game carries the same id');
});

test('the 3D mode reports game finished with the builder\'s summary, its outcome and its id', async () => {
  const p = play3D();
  await p.session.reveal(0);
  p.advance(3000);
  p.session.toggleFlag(1); // a right-click on a revealed cell: one flag click
  p.session.reveal(4);
  assert.deepEqual(p.of('finished'), [], 'the end effect plays first');
  p.endDelay();
  const [finished] = p.of('finished');
  assert.equal(finished.outcome, 'won');
  assert.equal(finished.elapsedMs, 3000);
  assert.deepEqual(finished.clicks.flag, { effective: 1, wasted: 0 });
  assert.equal(finished.efficiency, (100 * 2) / 3);
  assert.equal(finished.id, p.of('started')[0].id);
  p.advance(5000);
  assert.deepEqual(p.host.summary(), finished, 'summary() after the end is the finished summary');
  p.host.leave();
  assert.deepEqual(p.of('abandoned'), [], 'a finished game is never abandoned');
});

test('the 3D mode reports game abandoned with the builder\'s summary when a started game is restarted', async () => {
  const p = play3D();
  await p.session.reveal(0);
  const id = p.of('started')[0].id;
  p.advance(2000);
  p.host.restart({ source: 'pointer' });
  const [abandoned] = p.of('abandoned');
  assert.equal(abandoned.outcome, 'abandoned');
  assert.equal(abandoned.elapsedMs, 2000);
  assert.equal(abandoned.id, id);
  assert.equal(abandoned.board.mode, '3d');
  await p.session.reveal(0);
  assert.notEqual(p.host.summary().id, id, 'the next game is another game');
});

test('a fixed 3D board, which no generator made, has no summary', () => {
  const host = createModeHost();
  const events = [];
  for (const type of MODE_EVENTS) host.on(type, (e) => events.push([type, e]));
  let session;
  const flow = {
    openBoardChoice() {}, pause() {}, resume() {}, leave() {}, restart() {}, contextLost: () => false,
    start: (choice) => { session = createSession({ board: choice, client: rowClient() }); return session; },
    clock: endClock(),
  };
  host.register('3d', (report) => create3DMode(flow, report));
  host.start('3d', { X: 5, Y: 1, Z: 1, mines: 1, minePositions: ROW.mines });
  session.reveal(0);
  assert.equal(host.summary(), null);
  session.reveal(4);
  flow.clock.endDelay();
  assert.deepEqual(events.map(([t]) => t), ['started', 'canPause', 'canPause', 'finished']);
  assert.equal(events.at(-1)[1].summary, null);
});
