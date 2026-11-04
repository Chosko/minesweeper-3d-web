// Records screen's modes (js/records/screen.js): the mode switch above the board picker, the
// picker listing the chosen mode's boards under their labels, the chosen mode's overall figures,
// the open rules (mode, board key, last game played) and the mode switch from a fake records
// store, over Classic 2D, Hexagon, Triangle and 3D; the results screen's Records opening on a 3D,
// Hexagon or Triangle game's board; the #records-mode markup and its wiring; and in a browser the
// switch by mouse, keyboard and controller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECORDS_MODES, pickerBoards, lastBoardPlayed, recordsContent, createRecordsScreen,
} from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { createResultsFlow } from '../js/results/flow.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board2D = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const board3D = (width, height, depth, mines, noGuess = false) => createBoardIdentity({ mode: MODE_3D, width, height, depth, mines, noGuess });
const BEGINNER = board2D(9, 9, 10);
const CUSTOM_2D = board2D(20, 12, 50);
const CUBE_BEGINNER = board3D(6, 6, 6, 20);
const CUBE_INTRO = board3D(6, 6, 6, 10);
const FORMER_EXPERT = board3D(12, 12, 8, 130);
const FORMER_DOUBLE = board3D(8, 8, 2, 10);
const CUBE_EXPERT_NG = board3D(10, 10, 10, 100, true);
const CUSTOM_3D = board3D(10, 10, 10, 80);
const hexBoard = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'hexagon', grid: 'hex', width, height, mines, noGuess });
const triBoard = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'triangle', grid: 'tri', width, height, mines, noGuess });
const HEX_BEGINNER = hexBoard(9, 9, 13);
const HEX_CUSTOM = hexBoard(12, 10, 20);
const TRI_EXPERT_NG = triBoard(41, 17, 103, true);
const TRI_CUSTOM = triBoard(20, 9, 13);
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
let n = 0;
const game = (b, over = {}) => {
  const won = (over.outcome ?? 'won') === 'won';
  const elapsedMs = over.elapsedMs ?? 47380;
  const bbbv = 20;
  const bbbvSolved = won ? bbbv : 5;
  return {
    id: `g${++n}`, board: { ...b }, outcome: 'won', elapsedMs, bbbv, bbbvSolved, clicks: clicks(25),
    bbbvPerSecond: bbbvSolved / (elapsedMs / 1000), efficiency: (100 * bbbvSolved) / 25, seed: 1, generatorVersion: 1,
    endedAt: '2026-10-09T12:00:00.000Z', ...over,
  };
};

/** A fake records store: the real model's queries, plus onChange, available and record. */
function fakeStore({ games = [], available = true } = {}) {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  const listeners = new Set();
  const store = {
    available: () => available,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    record(s) { const c = model.record(s); for (const fn of listeners) fn(c, s); return c; },
  };
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'completedWinRate', 'history', 'overall', 'overallWinRate', 'overallCompletedWinRate']) {
    store[q] = (...a) => model[q](...a);
  }
  return store;
}
function brokenStore() {
  const fail = () => { throw new RangeError('records: unreadable'); };
  return {
    available: () => false, onChange: () => () => {},
    boardsPlayed: fail, bests: fail, counters: fail, winRate: fail, completedWinRate: fail, history: fail, overall: fail, overallWinRate: fail,
    overallCompletedWinRate: fail,
  };
}
/** A fake replay library recording the boards it is asked for. */
function fakeLibrary() {
  const asked = [];
  return {
    asked,
    forBoard(key) { asked.push(key); return []; },
    has: () => false,
    load: () => Promise.resolve(),
    available: () => true,
    onChange: () => () => {},
  };
}
function fakeView() {
  const shown = [];
  return { shown, show(c) { shown.push(c); }, hide() {} };
}
const PRESETS = ['Cube Intro', 'Cube Beginner', 'Cube Intermediate', 'Cube Expert'];
const PRESET_LABELS = [...PRESETS, ...PRESETS.map((l) => `${l} · no-guess`)];
const DAILY_3D = 'Daily';
const value = (list, key) => list.find((s) => s.key === key || s.stat === key).value;

// ---------------------------------------------------------------- the switch and the picker

test('the switch offers Classic 2D, Hexagon, Triangle and 3D in menu order, no Surface; the content carries the chosen mode', () => {
  assert.deepEqual(RECORDS_MODES.map((m) => [m.value, m.label, m.overallTitle]), [
    ['classic-2d', 'Classic 2D', 'Classic 2D overall'], ['hexagon', 'Hexagon', 'Hexagon overall'],
    ['triangle', 'Triangle', 'Triangle overall'], ['3d', '3D', '3D overall'],
  ]);
  const c = recordsContent(fakeStore(), { mode: '3d' });
  assert.equal(c.mode, '3d');
  assert.deepEqual(c.modes, [
    { value: 'classic-2d', label: 'Classic 2D', selected: false }, { value: 'hexagon', label: 'Hexagon', selected: false },
    { value: 'triangle', label: 'Triangle', selected: false }, { value: '3d', label: '3D', selected: true },
  ]);
  assert.equal(recordsContent(fakeStore(), { mode: 'triangle' }).mode, 'triangle');
  assert.equal(recordsContent(fakeStore()).mode, 'classic-2d');
});

test('the Hexagon and Triangle pickers list their standard boards without no-guess, then with it, their Daily board, then their custom boards played', () => {
  const store = fakeStore({ games: [game(HEX_CUSTOM), game(TRI_CUSTOM), game(BEGINNER)] });
  const STANDARD = ['Beginner', 'Intermediate', 'Expert'];
  const NAMED = [...STANDARD, ...STANDARD.map((l) => `${l} · no-guess`)];
  const hex = pickerBoards(store, 'hexagon');
  assert.deepEqual(hex.map((b) => b.label), [...NAMED, DAILY_3D, '12 × 10 · 20 mines']);
  assert.ok(hex.every((b) => b.board.mode === 'hexagon' && b.board.grid === 'hex'));
  assert.deepEqual(hex.slice(0, 3).map((b) => [b.board.width, b.board.height, b.board.mines]), [[9, 9, 13], [16, 16, 50], [30, 16, 100]]);
  const tri = pickerBoards(store, 'triangle');
  assert.deepEqual(tri.map((b) => b.label), [...NAMED, DAILY_3D, '20 × 9 · 13 mines']);
  assert.ok(tri.every((b) => b.board.mode === 'triangle' && b.board.grid === 'tri'));
  assert.deepEqual(tri.slice(0, 3).map((b) => [b.board.width, b.board.height, b.board.mines]), [[13, 7, 8], [25, 13, 36], [41, 17, 103]]);
  assert.ok(!pickerBoards(store, 'classic-2d').some((b) => b.key === boardKey(HEX_CUSTOM)), 'never mixed into another mode');
});

test('the 3D picker lists the four presets without no-guess, then with it, then the custom 3D boards played, under their 3D labels', () => {
  const store = fakeStore({ games: [game(CUSTOM_3D), game(BEGINNER), game(CUSTOM_2D), game(CUBE_EXPERT_NG)] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '10 × 10 × 10 · 80 mines']);
  assert.equal(three[0].key, boardKey(CUBE_INTRO));
  assert.equal(three[1].key, boardKey(CUBE_BEGINNER));
  assert.ok(three.every((b) => !b.label.startsWith('First box')), 'no First box entry');
  assert.equal(new Set(three.map((b) => b.key)).size, three.length, 'a preset played is not listed twice');
  const two = pickerBoards(store, 'classic-2d');
  assert.ok(two.every((b) => b.board.mode === 'classic-2d'), 'no 3D board in the 2D picker');
  assert.equal(two.at(-1).label, '20 × 12 · 50 mines');
  assert.deepEqual(pickerBoards(store).map((b) => b.key), two.map((b) => b.key), 'Classic 2D by default');
  assert.deepEqual(pickerBoards(brokenStore(), '3d').map((b) => b.label), [...PRESET_LABELS, DAILY_3D], 'unreadable records: the presets and the Daily board');
});

test('the 3D picker lists a former double layer board with the custom boards, under its size', () => {
  const store = fakeStore({ games: [
    game(FORMER_DOUBLE, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '10 × 10 × 10 · 80 mines', '8 × 8 × 2 · 10 mines']);
  const c = recordsContent(store, { boardKey: boardKey(FORMER_DOUBLE) });
  assert.equal(c.board.label, '8 × 8 × 2 · 10 mines');
  assert.equal(c.board.key, '3d:8x8x2:10:guess', 'its records keep their board key');
});

test('the 3D picker lists a former First box board with the custom boards, under its size and mine count', () => {
  const store = fakeStore({ games: [
    game(board3D(4, 4, 3, 4), { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '10 × 10 × 10 · 80 mines', '4 × 4 × 3 · 4 mines']);
  const c = recordsContent(store, { boardKey: boardKey(board3D(4, 4, 3, 4)) });
  assert.equal(c.board.label, '4 × 4 × 3 · 4 mines');
  assert.equal(c.board.key, '3d:4x4x3:4:guess', 'its records keep their board key');
});

test('the 3D picker lists the former Cube Expert with the custom boards, and the old Beginner\'s records as Cube Intro', () => {
  const store = fakeStore({ games: [
    game(FORMER_EXPERT, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUBE_INTRO, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '12 × 12 × 8 · 130 mines']);
  const c = recordsContent(store, { boardKey: boardKey(FORMER_EXPERT) });
  assert.equal(c.board.label, '12 × 12 × 8 · 130 mines');
  assert.equal(c.board.key, '3d:12x12x8:130:guess', 'its records keep their board key');
  assert.equal(recordsContent(store, { boardKey: boardKey(CUBE_INTRO) }).board.label, 'Cube Intro');
});

// ---------------------------------------------------------------- open rules

test('a board key alone sets the switch from its mode', () => {
  const store = fakeStore({ games: [game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' })] });
  const c = recordsContent(store, { boardKey: boardKey(CUBE_EXPERT_NG) });
  assert.equal(c.mode, '3d');
  assert.equal(c.board.key, boardKey(CUBE_EXPERT_NG));
  assert.equal(c.board.label, 'Cube Expert · no-guess');
  assert.deepEqual(c.boards.map((b) => b.label), [...PRESET_LABELS, DAILY_3D]);
  const custom = recordsContent(store, { boardKey: boardKey(CUSTOM_3D) });
  assert.equal(custom.mode, '3d');
  assert.equal(custom.boards.at(-1).key, boardKey(CUSTOM_3D), 'a 3D board asked for joins the 3D picker');
  assert.equal(recordsContent(store, { mode: 'classic-2d', boardKey: boardKey(CUBE_BEGINNER) }).mode, '3d', 'the key carries its mode');
  const tri = recordsContent(store, { boardKey: boardKey(TRI_EXPERT_NG) });
  assert.equal(tri.mode, 'triangle');
  assert.equal(tri.board.label, 'Expert · no-guess');
  assert.equal(recordsContent(store, { boardKey: boardKey(HEX_CUSTOM) }).boards.at(-1).key, boardKey(HEX_CUSTOM), 'a Hexagon board asked for joins the Hexagon picker');
});

test('a mode alone opens on its last board played, else on its first board', () => {
  const store = fakeStore({ games: [
    game(CUBE_EXPERT_NG, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
  ] });
  assert.equal(recordsContent(store, { mode: '3d' }).board.key, boardKey(CUSTOM_3D));
  assert.equal(recordsContent(store, { mode: 'classic-2d' }).board.key, boardKey(BEGINNER));
  assert.equal(recordsContent(fakeStore({ games: [game(BEGINNER)] }), { mode: '3d' }).board.key, boardKey(CUBE_INTRO));
  assert.equal(lastBoardPlayed(store, '3d'), boardKey(CUSTOM_3D));
  assert.equal(lastBoardPlayed(store, 'classic-2d'), boardKey(BEGINNER));
  assert.equal(recordsContent(store, { mode: 'hexagon' }).board.key, boardKey(HEX_BEGINNER), 'nothing played: its first board');
});

test('an unknown mode opens Classic 2D', () => {
  const store = fakeStore({ games: [game(CUSTOM_2D, { endedAt: '2026-10-07T12:00:00.000Z' }), game(CUBE_INTRO, { endedAt: '2026-10-09T12:00:00.000Z' })] });
  for (const mode of ['surface', 'nonsense', 42]) {
    const c = recordsContent(store, { mode });
    assert.equal(c.mode, 'classic-2d', String(mode));
    assert.equal(c.board.key, boardKey(CUSTOM_2D), 'on its last board played');
  }
  assert.equal(recordsContent(fakeStore(), { mode: 'surface' }).board.label, 'Beginner');
  const screen = createRecordsScreen({ records: store, view: fakeView() });
  screen.show({ mode: 'surface' });
  assert.equal(screen.mode, 'classic-2d');
});

test('without a mode or a board the screen opens on the mode and board of the last game played', () => {
  const store = fakeStore({ games: [
    game(BEGINNER, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUBE_EXPERT_NG, { endedAt: '2026-10-09T12:00:00.000Z' }),
    game(CUSTOM_2D, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const c = recordsContent(store);
  assert.equal(c.mode, '3d');
  assert.equal(c.board.key, boardKey(CUBE_EXPERT_NG));
  assert.equal(lastBoardPlayed(store), boardKey(CUBE_EXPERT_NG), 'across every mode');
  store.record(game(TRI_CUSTOM, { endedAt: '2026-10-10T12:00:00.000Z' }));
  const tri = recordsContent(store);
  assert.equal(tri.mode, 'triangle', 'a Triangle game played last opens Triangle');
  assert.equal(tri.board.key, boardKey(TRI_CUSTOM));
  const none = recordsContent(fakeStore());
  assert.equal(none.mode, 'classic-2d');
  assert.equal(none.board.label, 'Beginner');
  assert.equal(recordsContent(brokenStore()).mode, 'classic-2d');
});

// ---------------------------------------------------------------- figures

test("the figures panel shows the chosen 3D board's figures and the 3D overall figures", () => {
  const store = fakeStore({ games: [
    game(CUBE_BEGINNER, { elapsedMs: 30000, endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUBE_BEGINNER, { outcome: 'lost', endedAt: '2026-10-08T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T13:00:00.000Z' }),
    game(CUSTOM_3D, { outcome: 'abandoned', endedAt: '2026-10-08T14:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T13:00:00.000Z' }),
  ] });
  const library = fakeLibrary();
  const c = recordsContent(store, { boardKey: boardKey(CUBE_BEGINNER), replays: library });
  assert.equal(value(c.bests, 'time'), '30.000 s');
  assert.deepEqual(c.counters.map((s) => [s.key, s.value]), [
    ['games', '2'], ['wins', '1'], ['winRate', '50%'], ['completedWinRate', '50%'], ['currentStreak', '0'], ['longestStreak', '1'],
    ['longestCompletedStreak', '1'],
  ]);
  assert.equal(c.overallTitle, '3D overall');
  assert.deepEqual(c.overall.map((s) => [s.key, s.value]), [
    ['games', '4'], ['wins', '2'], ['winRate', '50%'], ['completedWinRate', '67%'], ['currentStreak', '0'], ['longestStreak', '1'],
    ['longestCompletedStreak', '1'],
  ], 'the 3D games only, the restarted one left out of the completed figures');
  assert.equal(c.games.rows.length, 2, 'the games list reads the chosen board');
  assert.equal(c.chart.points.length, 1, 'the chart reads the chosen board');
  assert.deepEqual(library.asked, [boardKey(CUBE_BEGINNER)], 'the library view reads the chosen board');
  const two = recordsContent(store, { mode: 'classic-2d' });
  assert.equal(two.overallTitle, 'Classic 2D overall');
  assert.equal(value(two.overall, 'games'), '2');
});

test("a Hexagon or Triangle board gets every part: its bests, counters, history views, replays and Leaderboards tab; the overall row is its mode's alone", () => {
  const store = fakeStore({ games: [
    game(HEX_BEGINNER, { elapsedMs: 30000, endedAt: '2026-10-07T12:00:00.000Z' }),
    game(HEX_BEGINNER, { outcome: 'lost', endedAt: '2026-10-08T12:00:00.000Z' }),
    game(HEX_CUSTOM, { endedAt: '2026-10-08T13:00:00.000Z' }),
    game(TRI_CUSTOM, { endedAt: '2026-10-08T14:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
  ] });
  const library = fakeLibrary();
  const c = recordsContent(store, { boardKey: boardKey(HEX_BEGINNER), replays: library, tab: 'leaderboards' });
  assert.equal(c.mode, 'hexagon');
  assert.equal(c.board.label, 'Beginner');
  assert.equal(value(c.bests, 'time'), '30.000 s');
  assert.equal(value(c.counters, 'games'), '2');
  assert.equal(c.overallTitle, 'Hexagon overall');
  assert.equal(value(c.overall, 'games'), '3', 'the Hexagon games only');
  assert.match(c.overallLine, /^Games 3 · Wins 2 /);
  assert.equal(c.games.rows.length, 2);
  assert.equal(c.top.rows.length, 1);
  assert.equal(c.chart.points.length, 1);
  assert.equal(c.bestChart.steps.length, 1);
  assert.equal(c.averages.rows[0].values[2], '30.000 s');
  assert.equal(c.tab, 'leaderboards', 'the Leaderboards tab, its coming-soon panel the markup\'s');
  assert.deepEqual(library.asked, [boardKey(HEX_BEGINNER)]);
  const tri = recordsContent(store, { mode: 'triangle' });
  assert.equal(tri.overallTitle, 'Triangle overall');
  assert.equal(value(tri.overall, 'games'), '1');
  assert.equal(tri.board.key, boardKey(TRI_CUSTOM));
});

// ---------------------------------------------------------------- the controller

test('the mode switch shows the chosen mode on its last board played, on the first games page', () => {
  const store = fakeStore({ games: [
    game(CUSTOM_3D, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
  ] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show();
  assert.equal(screen.mode, 'classic-2d');
  assert.equal(screen.board, boardKey(BEGINNER));
  screen.showPage(3);
  screen.setMode('3d');
  assert.equal(screen.mode, '3d');
  assert.equal(screen.board, boardKey(CUSTOM_3D));
  assert.equal(screen.page, 0);
  assert.equal(view.shown.at(-1).mode, '3d');
  assert.ok(view.shown.at(-1).boards.every((b) => b.key.startsWith('3d:') || b.key.startsWith('daily:3d:')));
  screen.select(boardKey(CUBE_BEGINNER));
  assert.equal(view.shown.at(-1).board.label, 'Cube Beginner');
  assert.equal(screen.mode, '3d', 'a board chosen in the picker keeps the mode');
  store.record(game(BEGINNER, { endedAt: '2026-10-09T14:00:00.000Z' }));
  assert.equal(view.shown.at(-1).board.key, boardKey(CUBE_BEGINNER), 'a game recorded live keeps the chosen board');
  screen.setMode('classic-2d');
  assert.equal(screen.board, boardKey(BEGINNER));
  const shown = view.shown.length;
  screen.setMode('classic-2d');
  assert.equal(view.shown.length, shown, 'choosing the mode already shown changes nothing');
  screen.setMode('nonsense');
  assert.equal(screen.mode, 'classic-2d', 'an unknown mode is ignored');
  screen.setMode('hexagon');
  assert.equal(screen.mode, 'hexagon');
  assert.equal(screen.board, boardKey(HEX_BEGINNER), 'a mode with nothing played: its first board');
  assert.ok(view.shown.at(-1).boards.every((b) => b.key.startsWith('hexagon:hex:') || b.key.startsWith('daily:hexagon:hex:')));
});

test("a 3D board gets every history view: the Top 10, the averages, the best-time chart and the filters, ranking its no-guess board alone", () => {
  const store = fakeStore({ games: [
    game(CUBE_BEGINNER, { id: 'c1', elapsedMs: 90000, endedAt: '2026-10-01T12:00:00.000Z' }),
    game(CUBE_BEGINNER, { id: 'c2', elapsedMs: 70000, endedAt: '2026-10-05T12:00:00.000Z' }),
    game(CUBE_BEGINNER, { id: 'c3', outcome: 'lost', endedAt: '2026-10-06T12:00:00.000Z' }),
    game(board3D(6, 6, 6, 10, true), { id: 'n1', elapsedMs: 10000, endedAt: '2026-10-07T12:00:00.000Z' }),
  ] });
  const now = new Date('2026-10-14T12:00:00.000Z');
  const c = recordsContent(store, { boardKey: boardKey(CUBE_BEGINNER), now, tab: 'top' });
  assert.equal(c.mode, '3d');
  assert.deepEqual(c.top.rows.map((r) => [r.rank, r.id, r.time]), [['1', 'c2', '70.000 s'], ['2', 'c1', '90.000 s']]);
  assert.deepEqual(c.averages.rows[0].values, ['80.000 s', '80.000 s', '80.000 s']);
  assert.equal(c.averages.winRate, 'Win rate, last 50 (3): 67% (completed games 67%)');
  assert.deepEqual(c.bestChart.steps.map((x) => x.id), ['c1', 'c2']);
  const week = recordsContent(store, { boardKey: boardKey(CUBE_BEGINNER), now, period: '7d' });
  assert.deepEqual([week.top.rows.length, week.games.rows.length], [0, 0], 'nothing in the last 7 days on this board');
  assert.equal(week.empty, false, 'the board is not empty');
});

test('Open takes an optional mode beside the optional board key', () => {
  const store = fakeStore({ games: [game(CUSTOM_3D, { endedAt: '2026-10-07T12:00:00.000Z' }), game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show({ mode: '3d' });
  assert.equal(screen.mode, '3d');
  assert.equal(screen.board, boardKey(CUSTOM_3D));
  screen.show({ boardKey: boardKey(CUBE_EXPERT_NG) });
  assert.equal(screen.mode, '3d');
  assert.equal(screen.board, boardKey(CUBE_EXPERT_NG));
  screen.show();
  assert.equal(screen.mode, 'classic-2d', 'opened again without either: the last game played');
  assert.equal(screen.board, boardKey(BEGINNER));
});

test("Watch from a 3D board returns to the Records screen on that board, and so on 3D", () => {
  const store = fakeStore({ games: [game(CUBE_BEGINNER)] });
  const routes = [];
  const router = { has: () => true, go: (screen, opts) => routes.push({ screen, ...opts }) };
  const screen = createRecordsScreen({ records: store, view: fakeView(), router });
  screen.show({ mode: '3d' });
  screen.watch('g-x');
  const back = routes.at(-1).data.returnTo;
  assert.equal(back.data.boardKey, boardKey(CUBE_BEGINNER));
  assert.equal(recordsContent(store, back.data).mode, '3d');
});

// ---------------------------------------------------------------- results screen

test("the results screen's Records opens on 3D and on this game's board for a 3D game", () => {
  const routes = [];
  const router = { has: () => true, go: (screen, opts) => routes.push({ screen, ...opts }) };
  const store = fakeStore();
  const flow = createResultsFlow({ records: store, router, restart: () => {}, goMenu: () => {} });
  flow.finished(game(CUBE_EXPERT_NG), '3d');
  flow.openRecords();
  const { screen, data } = routes.at(-1);
  assert.equal(screen, 'records');
  assert.equal(data.boardKey, boardKey(CUBE_EXPERT_NG));
  const c = recordsContent(store, data);
  assert.equal(c.mode, '3d');
  assert.equal(c.board.label, 'Cube Expert · no-guess');
  for (const [b, mode] of [[HEX_CUSTOM, 'hexagon'], [TRI_EXPERT_NG, 'triangle']]) {
    flow.finished(game(b), mode);
    flow.openRecords();
    assert.equal(routes.at(-1).data.boardKey, boardKey(b), `a ${mode} game: its board`);
    assert.equal(recordsContent(store, routes.at(-1).data).mode, mode);
  }
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the mode switch is a kit segmented choice at the right of the frame\'s heading, above the board picker', () => {
  const at = RECORDS_HTML.indexOf('id="records-mode"');
  assert.ok(at > 0, '#records-mode');
  assert.ok(at < RECORDS_HTML.indexOf('id="records-picker"'), 'above the picker');
  const group = RECORDS_HTML.slice(RECORDS_HTML.lastIndexOf('<div', at), RECORDS_HTML.indexOf('</div>', at));
  assert.match(group, /<div id="records-mode" class="ui-segmented" role="radiogroup" aria-label="Mode">/);
  const options = [...group.matchAll(/<button type="button" class="ui-segmented__option" role="radio" aria-checked="(true|false)" data-value="([^"]+)">([^<]+)<\/button>/g)]
    .map((m) => [m[2], m[3], m[1]]);
  const MODES = [['classic-2d', 'Classic 2D', 'true'], ['hexagon', 'Hexagon', 'false'], ['triangle', 'Triangle', 'false'], ['3d', '3D', 'false']];
  assert.deepEqual(options, MODES);
  const heading = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div class="ui-frame__action">'), RECORDS_HTML.indexOf('<div class="ui-frame__body"'));
  assert.ok(heading.includes('id="records-mode"'), 'the switch at the right of the heading');
  const body = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div class="ui-frame__body" id="records-body">'));
  assert.match(body, /^<div class="ui-frame__body" id="records-body">\s*<div id="records-mode-touch" class="ui-segmented" role="radiogroup" aria-label="Mode">/,
    'the phone\'s full-width bar opens the body, above the picker');
  assert.ok(body.indexOf('id="records-mode-touch"') < body.indexOf('id="records-picker"'));
  const touch = body.slice(0, body.indexOf('</div>', body.indexOf('id="records-mode-touch"')));
  assert.deepEqual([...touch.matchAll(/aria-checked="(true|false)" data-value="([^"]+)">([^<]+)</g)].map((m) => [m[2], m[3], m[1]]), MODES, 'the phone\'s bar offers the same four');
});

test('the shell opens the records screen with its mode and board, and the switch calls the controller', () => {
  assert.match(MAIN, /RECORDS_PAGE\.show\(\{ mode: d\.mode, boardKey: d\.boardKey \}\)/);
  assert.match(MAIN, /onMode: \(mode\) => RECORDS_PAGE\.setMode\(mode\)/);
  const src = read('js/records/screen.js');
  assert.match(src, /\['records-mode', 'records-mode-touch'\]\.map\(\$\)/, 'the head\'s switch and the phone\'s bar');
  assert.match(src, /for \(const group of modeGroups\) bindSegmented\(group, \{ onChange: \(mode\) => onMode\(mode\) \}\)/);
  const pad = MAIN.slice(MAIN.indexOf('function padRecords('), MAIN.indexOf('\n}\n', MAIN.indexOf('function padRecords(')));
  assert.match(pad, /RECORDS_PAGE\.stepMode\(/, 'LT / RT step the mode');
  assert.match(pad, /TRIGGER_MODES\.lt/);
  assert.match(pad, /TRIGGER_MODES\.rt/);
  assert.doesNotMatch(pad, /setMode/);
});

test('the catalogue documents the mode switch', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?mode switch[\s\S]*?#records-mode, its four options/);
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu keeps no 3D backdrop
// redrawing under software rendering.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser, mouse, keyboard and controller operate the mode switch', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const checked = () => ms(() => document.querySelector('#records-mode [aria-checked="true"]')?.dataset.value);
    const boardShown = () => ms(() => document.getElementById('records-board').textContent);
    const firstOption = () => ms(() => document.querySelector('#records-picker .ui-segmented__option')?.textContent);
    const overallTitle = () => ms(() => document.getElementById('records-overall-title').textContent);
    const frames = (count) => ms((k) => new Promise((r) => { const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
    const tap = async (button) => {
      await ms((b) => globalThis.__pad.press(b, true), button);
      await frames(1);
      await ms((b) => globalThis.__pad.press(b, false), button);
      await frames(2);
    };
    const BTN = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

    await ms(() => {
      const c = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const g = (id, board, endedAt) => ({ id, board, outcome: 'won', elapsedMs: 40000, bbbv: 20, bbbvSolved: 20, clicks: c,
        bbbvPerSecond: 0.5, efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      globalThis.__ms.records.record(g('d1', { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, '2026-10-08T12:00:00.000Z'));
      globalThis.__ms.records.record(g('t1', { mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: false }, '2026-10-09T12:00:00.000Z'));
    });

    // Opens on the mode and board of the last game played: 3D, Cube Intro (the 6 × 6 × 6 · 10 board).
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.equal(await checked(), '3d');
    assert.equal(await boardShown(), 'Cube Intro · Bests');
    assert.equal(await overallTitle(), '3D overall');
    assert.equal(await firstOption(), 'Cube Intro');
    assert.deepEqual((await ms(() => [...document.querySelectorAll('#records-picker .ui-segmented__option')].map((o) => o.textContent))).slice(0, PRESET_LABELS.length),
      PRESET_LABELS, 'the picker offers the four presets without no-guess, then with it');
    const figure = (id) => ms((i) => document.querySelector(`#${i} .ui-stat__value`).textContent, id);
    assert.equal(await figure('rec-completedWinRate'), '100%', 'the 3D board\'s completed-games figures');
    assert.match(await ms(() => document.getElementById('records-overall-line').textContent), /Longest 1 \(completed 1\)$/);

    // Mouse.
    await page.click('#records-mode [data-value="classic-2d"]');
    assert.equal(await checked(), 'classic-2d');
    assert.equal(await boardShown(), 'Beginner · Bests');
    assert.equal(await overallTitle(), 'Classic 2D overall');
    assert.equal(await firstOption(), 'Beginner');

    // Keyboard: the arrows move the switch.
    await page.focus('#records-mode [aria-checked="true"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await checked(), 'hexagon');
    assert.equal(await boardShown(), 'Beginner · Bests', 'Hexagon\'s first board, nothing played there');
    assert.equal(await overallTitle(), 'Hexagon overall');
    assert.equal(await ms(() => document.activeElement?.dataset.value), 'hexagon', 'focus stays on the switch');
    assert.equal(await ms(() => document.querySelectorAll('#records-picker .ui-segmented__option').length), 7, 'its six standard boards and its Daily board');

    // Controller: focus moves onto the 2D option and A chooses it.
    await tap(BTN.LEFT);
    assert.equal(await ms(() => document.activeElement?.dataset.value), 'classic-2d');
    await tap(BTN.A);
    assert.equal(await checked(), 'classic-2d');
    assert.equal(await boardShown(), 'Beginner · Bests');

    await tap(BTN.B);
    assert.equal(await mode(), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
