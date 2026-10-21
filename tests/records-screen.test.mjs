// Records screen (js/records/screen.js): the board picker, the figures and overall panels, the empty
// state and the not-saving notice from a fake records store; the screen controller's live update and
// told-once notice; the #records markup and its wiring in js/main.js; and in a browser the routes
// from the main menu and the results screen, the picker and Back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECORDS_SCREEN, TRIGGER_MODES, pickerBoards, lastBoardPlayed, recordsContent, createRecordsScreen, formatDate, formatWinRate, formatDateTime,
  EMPTY_TEXT, DAILY_OPTION, GAME_TABS, TOP_STATS, TOP_EMPTY_TEXT, TOP_EMPTY_PERIOD, GAMES_EMPTY_TEXT, WON_ONLY_TEXT,
} from '../js/records/screen.js';
import { NO_WON_GAMES_PERIOD, NO_BEST_TIME, NO_BEST_TIME_PERIOD } from '../js/records/history-chart.js';
import { gameRank } from '../js/records/stats.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { DASH, NOTES } from '../js/results/view.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const BEGINNER = board(9, 9, 10);
const EXPERT_NG = board(30, 16, 99, true);
const CUSTOM = board(20, 12, 50);
const CUSTOM2 = board(5, 5, 3);
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
    subscribed: () => listeners.size,
    available: () => available,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    record(s) { const c = model.record(s); for (const fn of listeners) fn(c, s); return c; },
  };
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'completedWinRate', 'history', 'overall', 'overallWinRate', 'overallCompletedWinRate']) {
    store[q] = (...a) => model[q](...a);
  }
  return store;
}
/** A store whose stored records could not be read: every query throws. */
function brokenStore() {
  const fail = () => { throw new RangeError('records: unreadable'); };
  return {
    available: () => false, onChange: () => () => {},
    boardsPlayed: fail, bests: fail, counters: fail, winRate: fail, completedWinRate: fail, history: fail, overall: fail, overallWinRate: fail,
    overallCompletedWinRate: fail,
  };
}
const STANDARD_LABELS = ['Beginner', 'Intermediate', 'Expert', 'Beginner · no-guess', 'Intermediate · no-guess', 'Expert · no-guess'];
const DAILY_LABEL = 'Daily · Expert · no-guess';
const stat = (list, key) => list.find((s) => s.key === key || s.stat === key);

// ---------------------------------------------------------------- the Daily board and board codes

const DAILY_EXPERT = createBoardIdentity({ ...EXPERT_NG, daily: true });

test('the Daily board: its days in a row stand in for the win streak, as of today\'s local date', () => {
  const daily = (date, outcome = 'won') => game(DAILY_EXPERT, { outcome, daily: date, startCell: 255, endedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T12:00:00.000Z` });
  const store = fakeStore({ games: [daily('20261008'), daily('20261009', 'lost'), daily('20261010')] });
  const today = recordsContent(store, { boardKey: boardKey(DAILY_EXPERT), now: new Date(2026, 9, 11, 9) });
  assert.equal(today.board.label, DAILY_LABEL);
  assert.deepEqual(['currentStreak', 'longestStreak'].map((k) => [stat(today.counters, k).label, stat(today.counters, k).value]),
    [['Days in a row', '3'], ['Longest days in a row', '3']]);
  assert.equal(stat(today.counters, 'games').value, '3');
  assert.equal(stat(today.counters, 'wins').value, '2');
  const later = recordsContent(store, { boardKey: boardKey(DAILY_EXPERT), now: new Date(2026, 9, 12, 9) });
  assert.equal(stat(later.counters, 'currentStreak').value, '0', 'a date ended without a daily');
  assert.equal(stat(later.counters, 'longestStreak').value, '3');
  const plain = recordsContent(store, { boardKey: boardKey(EXPERT_NG) });
  assert.equal(stat(plain.counters, 'currentStreak').label, 'Current streak', 'the plain board keeps its win streak');
  assert.equal(today.games.rows[0].code, 'EN-20261010-' + today.games.rows[0].code.slice(-4), 'a daily row shows its daily form');
});

test('every recent game and Top 10 row names its board code; an entry from before codes shows none', () => {
  const store = fakeStore({ games: [game(BEGINNER, { startCell: 40, seed: 0x1234 }), game(BEGINNER, { elapsedMs: 30000 })] });
  const c = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.match(c.games.rows[1].code, /^B-00001234-40-1[0-9A-F]{3}$/);
  assert.equal(c.games.rows[0].code, null);
  assert.match(c.top.rows[1].code, /^B-00001234-40-/);
});

// ---------------------------------------------------------------- picker

test('the picker lists the three standard boards, the three no-guess ones, the Daily board as "Daily", then every custom board played, by boardLabel', () => {
  assert.equal(DAILY_OPTION, 'Daily');
  assert.deepEqual(pickerBoards(fakeStore()).map((b) => b.label), [...STANDARD_LABELS, DAILY_OPTION], 'the standard boards and the Daily board with no games played');
  const store = fakeStore({ games: [game(CUSTOM2, { endedAt: '2026-10-01T12:00:00.000Z' }), game(BEGINNER), game(CUSTOM, { endedAt: '2026-10-08T12:00:00.000Z' }), game(EXPERT_NG)] });
  const boards = pickerBoards(store);
  assert.deepEqual(boards.map((b) => b.label), [...STANDARD_LABELS, DAILY_OPTION, '20 × 12 · 50 mines', '5 × 5 · 3 mines']);
  assert.equal(boards[0].key, boardKey(BEGINNER));
  assert.equal(boards[5].key, boardKey(EXPERT_NG));
  assert.equal(new Set(boards.map((b) => b.key)).size, boards.length, 'a standard board played is not listed twice');
});

test('the last board played is the one whose latest game ended last; none before any game', () => {
  assert.equal(lastBoardPlayed(fakeStore()), null);
  const store = fakeStore({ games: [
    game(BEGINNER, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM, { endedAt: '2026-10-09T08:00:00.000Z' }),
    game(EXPERT_NG, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  assert.equal(lastBoardPlayed(store), boardKey(CUSTOM));
});

test('the screen opens on the board asked for, else on the last board played, else on Beginner', () => {
  const store = fakeStore({ games: [game(BEGINNER, { endedAt: '2026-10-01T12:00:00.000Z' }), game(CUSTOM, { endedAt: '2026-10-02T12:00:00.000Z' })] });
  assert.equal(recordsContent(store, { boardKey: boardKey(BEGINNER) }).board.key, boardKey(BEGINNER));
  assert.equal(recordsContent(store).board.key, boardKey(CUSTOM));
  assert.equal(recordsContent(fakeStore()).board.key, boardKey(BEGINNER));
  const c = recordsContent(store, { boardKey: boardKey(EXPERT_NG) });
  assert.equal(c.board.label, 'Expert · no-guess');
  assert.deepEqual(c.boards.filter((b) => b.selected).map((b) => b.key), [boardKey(EXPERT_NG)], 'one board is selected');
  const unplayed = recordsContent(store, { boardKey: boardKey(CUSTOM2) });
  assert.equal(unplayed.board.key, boardKey(CUSTOM2), 'a board asked for that the records do not hold is still shown');
  assert.equal(unplayed.boards.at(-1).key, boardKey(CUSTOM2));
  assert.equal(recordsContent(store, { boardKey: 'not a key' }).board.key, boardKey(CUSTOM), 'a malformed key falls back');
});

// ---------------------------------------------------------------- figures

test('the figures panel shows the three bests with their dates, games, wins, win rate and streaks', () => {
  const store = fakeStore({ games: [
    game(BEGINNER, { elapsedMs: 52000, endedAt: '2026-10-07T12:00:00.000Z' }),
    game(BEGINNER, { elapsedMs: 47380, endedAt: '2026-10-08T12:00:00.000Z' }),
    game(BEGINNER, { outcome: 'lost', endedAt: '2026-10-09T12:00:00.000Z' }),
    game(BEGINNER, { elapsedMs: 60000, endedAt: '2026-10-09T13:00:00.000Z' }),
  ] });
  const c = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.equal(c.empty, false);
  assert.deepEqual(c.bests.map((b) => b.stat), ['time', 'bbbvPerSecond', 'efficiency']);
  assert.deepEqual(c.bests.map((b) => b.label), ['Best time', 'Best 3BV/s', 'Best efficiency']);
  assert.equal(stat(c.bests, 'time').value, '47.380 s', 'the fastest time, to the thousandth, truncated');
  assert.equal(stat(c.bests, 'time').date, formatDate('2026-10-08T12:00:00.000Z'));
  assert.equal(stat(c.bests, 'bbbvPerSecond').value, (20 / 47.38).toFixed(2));
  assert.equal(stat(c.bests, 'efficiency').value, '80.0%', 'efficiency to one decimal');
  assert.equal(stat(c.bests, 'efficiency').date, formatDate('2026-10-07T12:00:00.000Z'), 'a tie keeps the earlier holder');
  assert.deepEqual(c.counters.map((s) => [s.key, s.value]), [
    ['games', '4'], ['wins', '3'], ['winRate', '75%'], ['completedWinRate', '75%'], ['currentStreak', '1'], ['longestStreak', '2'],
    ['longestCompletedStreak', '2'],
  ]);
  assert.deepEqual(c.counters.map((s) => s.label), [
    'Games', 'Wins', 'Win rate', 'Win rate, completed', 'Current streak', 'Longest streak', 'Best streak, completed',
  ]);
});

test('the completed-games win rate and best streak sit beside the reference ones, leaving restarted games out', () => {
  const outcomes = ['won', 'abandoned', 'won', 'abandoned', 'won', 'lost', 'abandoned', 'won'];
  const store = fakeStore({ games: outcomes.map((outcome) => game(BEGINNER, { outcome })) });
  const c = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.equal(stat(c.counters, 'winRate').value, '50%', 'the reference win rate counts a restart as a loss');
  assert.equal(stat(c.counters, 'completedWinRate').value, '80%', 'four wins of five completed games');
  assert.equal(stat(c.counters, 'longestStreak').value, '1');
  assert.equal(stat(c.counters, 'longestCompletedStreak').value, '3', 'a restart leaves the completed streak alone');
  assert.equal(stat(c.overall, 'completedWinRate').value, '80%');
  assert.equal(stat(c.overall, 'longestCompletedStreak').value, '3');
  const abandonedOnly = recordsContent(fakeStore({ games: [game(CUSTOM, { outcome: 'abandoned' })] }), { boardKey: boardKey(CUSTOM) });
  assert.equal(stat(abandonedOnly.counters, 'completedWinRate').value, DASH, 'no completed game: no completed win rate');
});

test("the fastest-time best goes through the results screen's time formatter", () => {
  const store = fakeStore({ games: [game(BEGINNER, { elapsedMs: 47999 })] });
  assert.equal(stat(recordsContent(store).bests, 'time').value, '47.999 s', 'truncated, never rounded');
  const src = read('js/records/screen.js');
  assert.match(src, /import \{[^}]*formatTime[^}]*\} from '\.\.\/results\/view\.js'/, 'the one time formatter is imported');
  assert.doesNotMatch(src, /\/\s*1000|\.toFixed\(1\)|tenths/, 'no second copy of the time format');
});

test('the overall panel shows the Classic 2D totals across every board', () => {
  const store = fakeStore({ games: [game(BEGINNER), game(CUSTOM, { outcome: 'lost' }), game(EXPERT_NG), game(EXPERT_NG)] });
  const c = recordsContent(store, { boardKey: boardKey(CUSTOM) });
  assert.deepEqual(c.overall.map((s) => [s.key, s.value]), [
    ['games', '4'], ['wins', '3'], ['winRate', '75%'], ['completedWinRate', '75%'], ['currentStreak', '2'], ['longestStreak', '2'],
    ['longestCompletedStreak', '2'],
  ]);
  assert.equal(c.overallTitle, 'Classic 2D overall');
  assert.equal(c.overallLine, 'Games 4 · Wins 3 · Win rate 75% (completed 75%) · Current streak 2 · Longest 2 (completed 2)', 'one sentence');
  const many = fakeStore({ games: Array.from({ length: 1207 }, (_, i) => game(BEGINNER, { outcome: i % 2 ? 'won' : 'lost' })) });
  assert.match(recordsContent(many).overallLine, /^Games 1,207 · Wins 603 · /, 'counts grouped by thousands');
});

test('formats: a date is day, month and year; a win rate a whole percentage; a missing value a dash', () => {
  assert.equal(formatDate('2026-10-09T12:00:00.000Z'), '9 Oct 2026');
  assert.equal(formatDate('2026-01-31T12:00:00.000Z'), '31 Jan 2026');
  assert.equal(formatDate(null), DASH);
  assert.equal(formatDate('garbage'), DASH);
  assert.equal(formatWinRate(2 / 3), '67%');
  assert.equal(formatWinRate(1), '100%');
  assert.equal(formatWinRate(null), DASH);
});

test('a board with no games shows the empty state, and a best not yet set shows a dash', () => {
  const c = recordsContent(fakeStore({ games: [game(CUSTOM)] }), { boardKey: boardKey(BEGINNER) });
  assert.equal(c.empty, true);
  assert.equal(c.emptyText, EMPTY_TEXT);
  assert.deepEqual([c.games.empty, c.games.emptyText], [true, EMPTY_TEXT], 'the Recent games tab says the board has no games, not that a filter left none');
  assert.deepEqual(c.counters.map((s) => s.value), ['0', '0', DASH, DASH, '0', '0', '0']);
  const lostOnly = recordsContent(fakeStore({ games: [game(BEGINNER, { outcome: 'lost' })] }), { boardKey: boardKey(BEGINNER) });
  assert.equal(lostOnly.empty, false);
  assert.deepEqual(lostOnly.bests.map((b) => [b.value, b.date]), [[DASH, DASH], [DASH, DASH], [DASH, DASH]]);
});

test('unreadable records show the empty state over the standard boards and never throw', () => {
  const c = recordsContent(brokenStore(), { boardKey: boardKey(CUSTOM) });
  assert.equal(c.empty, true);
  assert.deepEqual(c.boards.map((b) => b.label).slice(0, 6), STANDARD_LABELS);
  assert.ok(c.overall.every((s) => s.value === '0' || s.value === DASH));
});

test('the not-saving notice is the results screen\'s, carried only when asked', () => {
  const store = fakeStore({ available: false });
  assert.deepEqual(recordsContent(store, { notSaved: true }).notes, [NOTES.notSaved]);
  assert.deepEqual(recordsContent(store).notes, []);
});

// ---------------------------------------------------------------- the screen controller

function fakeView() {
  const shown = [];
  return { shown, hidden: 0, show(c) { shown.push(c); }, hide() { this.hidden++; } };
}

test('the screen subscribes to the store\'s change notification while open and unsubscribes when left', () => {
  const store = fakeStore({ games: [game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  assert.equal(store.subscribed(), 0);
  screen.show({ boardKey: boardKey(BEGINNER) });
  assert.equal(store.subscribed(), 1);
  assert.equal(view.shown.at(-1).counters[0].value, '1');
  store.record(game(BEGINNER));
  assert.equal(view.shown.length, 2, 'a newly recorded game redraws the open screen');
  assert.equal(view.shown.at(-1).counters[0].value, '2');
  assert.equal(view.shown.at(-1).board.key, boardKey(BEGINNER), 'on the same board');
  screen.show({ boardKey: boardKey(BEGINNER) });
  assert.equal(store.subscribed(), 1, 'shown again, still one subscription');
  screen.hide();
  assert.equal(store.subscribed(), 0);
  assert.equal(view.hidden, 1);
  store.record(game(BEGINNER));
  assert.equal(view.shown.length, 3, 'nothing redraws once left');
});

test('choosing a board in the picker shows its figures; a new custom board joins the picker live', () => {
  const store = fakeStore({ games: [game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show();
  assert.equal(screen.board, boardKey(BEGINNER), 'the last board played');
  screen.select(boardKey(EXPERT_NG));
  assert.equal(view.shown.at(-1).board.key, boardKey(EXPERT_NG));
  assert.equal(view.shown.at(-1).empty, true);
  store.record(game(CUSTOM, { endedAt: '2026-10-09T15:00:00.000Z' }));
  assert.equal(view.shown.at(-1).board.key, boardKey(EXPERT_NG), 'the chosen board stays chosen');
  assert.equal(view.shown.at(-1).boards.at(-1).label, '20 × 12 · 50 mines');
  screen.hide();
  screen.show();
  assert.equal(screen.board, boardKey(CUSTOM), 'opened again without a board: the last board played');
});

test('stepBoard walks the picker forward and back in its order, held at either end (the controller\'s LB / RB)', () => {
  const store = fakeStore({ games: [game(BEGINNER), game(CUSTOM, { endedAt: '2026-10-08T12:00:00.000Z' })] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show({ boardKey: boardKey(BEGINNER) });
  const order = view.shown.at(-1).boards.map((b) => b.key);
  assert.equal(order[0], boardKey(BEGINNER));
  assert.equal(order.at(-1), boardKey(CUSTOM), 'the custom board played ends the picker');
  assert.equal(screen.stepBoard(-1), false, 'held at the first board');
  assert.equal(screen.board, boardKey(BEGINNER));
  const drawn = view.shown.length;
  for (let i = 1; i < order.length; i++) {
    assert.equal(screen.stepBoard(1), true);
    assert.equal(screen.board, order[i]);
    assert.equal(view.shown.at(-1).board.key, order[i], 'drawn as a click on the picker draws it');
  }
  assert.equal(view.shown.length, drawn + order.length - 1);
  assert.equal(screen.stepBoard(1), false, 'held at the last board');
  assert.equal(view.shown.length, drawn + order.length - 1, 'nothing redrawn at the end');
  assert.equal(screen.stepBoard(-1), true);
  assert.equal(screen.board, order.at(-2));
  screen.showPage(1);
  screen.stepBoard(-1);
  assert.equal(screen.page, 0, 'a new board starts on its first games page');
});

test('the triggers choose the mode through setMode: LT 2D, RT 3D', () => {
  assert.deepEqual(TRIGGER_MODES, { lt: 'classic-2d', rt: '3d' });
  const store = fakeStore({ games: [game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show({ boardKey: boardKey(BEGINNER) });
  screen.setMode(TRIGGER_MODES.rt);
  assert.equal(screen.mode, '3d');
  assert.equal(view.shown.at(-1).mode, '3d');
  const drawn = view.shown.length;
  screen.setMode(TRIGGER_MODES.rt);
  assert.equal(view.shown.length, drawn, 'the mode already shown: nothing');
  screen.setMode(TRIGGER_MODES.lt);
  assert.equal(screen.mode, 'classic-2d');
  assert.equal(screen.board, boardKey(BEGINNER), 'back on the mode\'s last board played');
});

test('when records are not being saved the screen says so once', () => {
  const store = fakeStore({ available: false });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show();
  assert.deepEqual(view.shown.at(-1).notes, [NOTES.notSaved]);
  store.record(game(BEGINNER));
  assert.deepEqual(view.shown.at(-1).notes, [NOTES.notSaved], 'kept while this visit lasts');
  screen.hide();
  screen.show();
  assert.deepEqual(view.shown.at(-1).notes, [], 'not told again');
  const saved = createRecordsScreen({ records: fakeStore(), view: fakeView() });
  saved.show();
  assert.equal(RECORDS_SCREEN, 'records');
});

test('unreadable records never block the screen or Back', () => {
  const view = fakeView();
  const screen = createRecordsScreen({ records: brokenStore(), view });
  assert.doesNotThrow(() => screen.show({ boardKey: boardKey(CUSTOM) }));
  assert.equal(view.shown.at(-1).empty, true);
  assert.doesNotThrow(() => screen.hide());
});

test('the view model and controller are DOM-free apart from the view binder', () => {
  const src = read('js/records/screen.js');
  const binder = src.indexOf('export function createRecordsView');
  assert.ok(binder > 0, 'the binder is createRecordsView');
  assert.doesNotMatch(src.slice(0, binder), /document|window/);
});

// ---------------------------------------------------------------- Top 10, averages, filters

const NOW = new Date('2026-10-14T12:00:00.000Z');
const daysAgo = (d, minutes = 0) => new Date(NOW.getTime() - d * 86400000 + minutes * 60000).toISOString();
const keptLibrary = (ids) => ({ has: (id) => ids.includes(id), forBoard: () => [], onChange: () => () => {}, load: () => Promise.resolve(), available: () => true });

test('the Top 10 by time: ten rows best first, each with rank, time, 3BV/s, efficiency, date, 3BV, clicks and Watch for a kept replay', () => {
  const games = Array.from({ length: 13 }, (_, i) => game(BEGINNER, { id: `t${i}`, elapsedMs: 60000 - i * 1000, endedAt: daysAgo(13 - i) }));
  const store = fakeStore({ games: [...games, game(BEGINNER, { id: 'lost', outcome: 'lost', elapsedMs: 1000, endedAt: daysAgo(0) })] });
  const c = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, replays: keptLibrary(['t12', 't5']), canWatch: true });
  assert.equal(c.tab, 'recent', 'Recent games is the default tab');
  assert.deepEqual(c.tabs.map((t) => [t.label, t.selected]), [['Recent games', true], ['Top 10', false], ['Replays', false], ['Leaderboards', false]]);
  assert.deepEqual(GAME_TABS.map((t) => t.value), ['recent', 'top', 'replays', 'leaderboards']);
  const { top } = c;
  assert.equal(top.stat, 'time');
  assert.deepEqual(top.stats.map((t) => [t.label, t.selected]), [['Time', true], ['3BV/s', false], ['Efficiency', false]]);
  assert.deepEqual(top.headers, ['#', 'Time', '3BV/s', 'Eff.', 'Date', '3BV', 'Clicks']);
  assert.equal(top.rows.length, 10, 'ten of thirteen won games; the loss never ranks');
  assert.deepEqual(top.rows.map((r) => r.rank), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  assert.deepEqual(top.rows[0], {
    id: 't12', rank: '1', time: '48.000 s', rate: (20 / 48).toFixed(2), efficiency: '80.0%', date: formatDateTime(daysAgo(1)), bbbv: '20', clicks: '25', watch: 't12', code: null,
  });
  assert.equal(top.rows[1].watch, null, 'Watch only for a kept replay');
  assert.equal(top.rows.find((r) => r.id === 't5').watch, 't5');
  assert.equal(recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, replays: keptLibrary(['t12']), canWatch: false }).top.rows[0].watch, null,
    'no Watch without the replay route');
  const byRate = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, topStat: 'bbbvPerSecond' }).top;
  assert.equal(byRate.rows[0].id, 't12');
  assert.equal(byRate.stats.find((t) => t.selected).value, 'bbbvPerSecond');
  assert.deepEqual(TOP_STATS.map((t) => t.value), ['time', 'bbbvPerSecond', 'efficiency']);
});

test('the Top 10 by time agrees with the results screen\'s rank, ranks a no-guess board alone, and says so when empty', () => {
  const plain = [game(BEGINNER, { id: 'p1', elapsedMs: 50000 }), game(BEGINNER, { id: 'p2', elapsedMs: 40000 })];
  const ng = board(9, 9, 10, true);
  const store = fakeStore({ games: [...plain, game(ng, { id: 'n1', elapsedMs: 30000 })] });
  const top = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW }).top;
  assert.deepEqual(top.rows.map((r) => r.id), ['p2', 'p1'], 'fewer than ten: all of them; the no-guess game is not here');
  for (const id of ['p1', 'p2']) {
    const e = store.history(boardKey(BEGINNER)).find((x) => x.id === id);
    assert.equal(top.rows.findIndex((r) => r.id === id) + 1, gameRank(store.history(boardKey(BEGINNER)), e).position, `${id}: the results rank`);
  }
  assert.deepEqual(recordsContent(store, { boardKey: boardKey(ng), now: NOW }).top.rows.map((r) => r.id), ['n1']);
  const lostOnly = recordsContent(fakeStore({ games: [game(BEGINNER, { outcome: 'lost' })] }), { boardKey: boardKey(BEGINNER), now: NOW, tab: 'top' }).top;
  assert.deepEqual([lostOnly.rows, lostOnly.empty, lostOnly.emptyText], [[], true, TOP_EMPTY_TEXT]);
  assert.equal(TOP_EMPTY_TEXT, 'No won games on this board yet.');
});

test('the averages panel: Time, 3BV/s and Efficiency over the last 10, last 50 and all won games, a short window with its count', () => {
  const games = Array.from({ length: 12 }, (_, i) => game(BEGINNER, { elapsedMs: 40000 + i * 1000, endedAt: daysAgo(12 - i) }));
  const store = fakeStore({ games: [...games, game(BEGINNER, { outcome: 'lost', endedAt: daysAgo(0) })] });
  const { averages } = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW });
  assert.deepEqual(averages.columns.map((c) => c.label), ['Last 10', 'Last 50 (12)', 'All']);
  assert.deepEqual(averages.rows.map((r) => r.label), ['Time', '3BV/s', 'Efficiency']);
  assert.deepEqual(averages.rows[0].values, ['46.500 s', '45.500 s', '45.500 s'], 'the mean of the last 10 and of all 12 won games');
  assert.deepEqual(averages.rows[2].values, ['80.0%', '80.0%', '80.0%']);
  assert.equal(averages.winRate, 'Win rate, last 50 (13): 92% (completed games 92%)',
    'one line: the last-50 win rate counts the loss, the completed games\' beside it, a short window with its count');
  const none = recordsContent(fakeStore({ games: [game(BEGINNER, { outcome: 'abandoned' })] }), { boardKey: boardKey(BEGINNER), now: NOW }).averages;
  assert.deepEqual(none.rows.map((r) => r.values), [[DASH, DASH, DASH], [DASH, DASH, DASH], [DASH, DASH, DASH]], 'no won game: dashes');
  assert.deepEqual(none.columns.map((c) => c.label), ['Last 10', 'Last 50', 'All']);
  assert.equal(none.winRate, `Win rate, last 50 (1): 0% (completed games ${DASH})`, 'an abandoned game counts in the win rate, not the completed one');
});

test('the period filters every history view; the outcome only the recent games; bests, counters and overall stay all-time', () => {
  const store = fakeStore({ games: [
    game(BEGINNER, { id: 'old', elapsedMs: 30000, endedAt: daysAgo(100) }),
    game(BEGINNER, { id: 'w1', elapsedMs: 50000, endedAt: daysAgo(10) }),
    game(BEGINNER, { id: 'l1', outcome: 'lost', endedAt: daysAgo(5) }),
    game(BEGINNER, { id: 'a1', outcome: 'abandoned', endedAt: daysAgo(2) }),
    game(BEGINNER, { id: 'w2', elapsedMs: 45000, endedAt: daysAgo(1) }),
  ] });
  const all = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW });
  const month = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, period: '30d' });
  assert.deepEqual(all.filters.period.map((p) => [p.label, p.selected]), [['All time', true], ['12 months', false], ['30 days', false], ['7 days', false]]);
  assert.deepEqual(all.filters.outcome.map((p) => [p.label, p.selected]), [['All', true], ['Won', false], ['Lost', false], ['Abandoned', false]]);
  assert.equal(all.filters.wonOnly, WON_ONLY_TEXT, 'the won-only views say they count won games');
  assert.equal(month.games.rows.length, 4);
  assert.deepEqual(month.top.rows.map((r) => r.id), ['w2', 'w1'], 'the Top 10 within the period');
  assert.equal(month.averages.rows[0].values[2], '47.500 s');
  assert.equal(month.averages.winRate, 'Win rate, last 50 (4): 50% (completed games 67%)');
  assert.equal(month.chart.points.length, 2);
  assert.deepEqual(month.bestChart.steps.map((x) => x.id), ['w1', 'w2'], 'the best time\'s progression within the period');
  assert.deepEqual([month.bestChart.start, month.bestChart.end], [daysAgo(10), daysAgo(1)], 'the first and last shown won games');
  assert.deepEqual(all.bestChart.steps.map((x) => x.id), ['old']);
  assert.deepEqual(month.bests, all.bests, 'the bests tiles stay all-time');
  assert.deepEqual(month.counters, all.counters);
  assert.deepEqual(month.overall, all.overall);
  const won = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, period: '30d', outcome: 'won' });
  assert.deepEqual(won.games.rows.map((r) => r.id), ['w2', 'w1'], 'the outcome filters the recent games');
  assert.deepEqual(won.top.rows, month.top.rows, 'and not the won-only views');
  assert.deepEqual(won.averages, month.averages);
  assert.deepEqual(recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, outcome: 'abandoned' }).games.rows.map((r) => r.id), ['a1']);
  assert.deepEqual(recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, outcome: 'lost' }).games.rows.map((r) => r.outcome), ['Lost']);
});

test('a filter that leaves nothing shows the views\' empty lines, never the board\'s empty state', () => {
  const store = fakeStore({ games: [game(BEGINNER, { endedAt: daysAgo(40) }), game(BEGINNER, { outcome: 'lost', endedAt: daysAgo(3) })] });
  const week = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, period: '7d' });
  assert.equal(week.empty, false);
  assert.deepEqual([week.top.empty, week.top.emptyText], [true, TOP_EMPTY_PERIOD]);
  assert.equal(week.chart.text, NO_WON_GAMES_PERIOD);
  assert.deepEqual([week.bestChart.steps, week.bestChart.text, week.bestChart.emptyText], [[], NO_BEST_TIME_PERIOD, NO_BEST_TIME_PERIOD]);
  const none = recordsContent(store, { boardKey: boardKey(BEGINNER), now: NOW, period: '7d', outcome: 'won' }).games;
  assert.deepEqual([none.rows, none.empty, none.emptyText], [[], true, GAMES_EMPTY_TEXT]);
  assert.equal(recordsContent(fakeStore({ games: [game(BEGINNER, { outcome: 'lost' })] }), { boardKey: boardKey(BEGINNER), now: NOW }).bestChart.text, NO_BEST_TIME);
});

test('the filters are screen state: kept across board and mode changes, starting the recent games on page one, back to All on each show', () => {
  const games = Array.from({ length: 25 }, (_, i) => game(BEGINNER, { outcome: i % 2 ? 'won' : 'lost', endedAt: daysAgo(i % 3 ? 2 : 50, i) }));
  const store = fakeStore({ games });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view, now: () => NOW });
  screen.show({ boardKey: boardKey(BEGINNER) });
  assert.deepEqual(screen.filters, { period: 'all', outcome: 'all', tab: 'recent', topStat: 'time' });
  screen.showPage(1);
  screen.setPeriod('30d');
  assert.equal(screen.page, 0, 'a filter change starts the recent games on their first page');
  assert.equal(view.shown.at(-1).filters.period.find((p) => p.selected).value, '30d');
  screen.showPage(1);
  screen.setOutcome('won');
  assert.equal(screen.page, 0);
  assert.ok(view.shown.at(-1).games.rows.every((r) => r.outcome === 'Won'));
  for (const tab of ['leaderboards', 'replays']) {
    screen.setTab(tab);
    assert.equal(view.shown.at(-1).tab, tab, `the ${tab} tab`);
  }
  screen.setTab('top');
  screen.setTopStat('efficiency');
  assert.equal(view.shown.at(-1).tab, 'top');
  screen.select(boardKey(EXPERT_NG));
  screen.setMode('3d');
  assert.deepEqual(screen.filters, { period: '30d', outcome: 'won', tab: 'top', topStat: 'efficiency' }, 'kept across board and mode changes');
  screen.setMode('classic-2d');
  const drawn = view.shown.length;
  store.record(game(BEGINNER, { id: 'live', endedAt: daysAgo(0) }));
  assert.equal(view.shown.length, drawn + 1);
  assert.ok(view.shown.at(-1).games.rows.some((r) => r.id === 'live'), 'live update redraws through the filters');
  screen.setPeriod('nonsense');
  assert.equal(screen.filters.period, 'all', 'an unknown choice is the default');
  screen.setPeriod('7d');
  screen.hide();
  screen.show();
  assert.deepEqual(screen.filters, { period: 'all', outcome: 'all', tab: 'recent', topStat: 'time' }, 'each show starts on All time · All');
  assert.equal(view.shown.at(-1).filters.outcome.find((p) => p.selected).value, 'all');
});

test('the Records export actions: enabled once a game is recorded, saving through the one exporter', () => {
  const saved = [];
  let games = 0;
  const exporter = { hasGames: () => games > 0, save: (format) => { saved.push(format); return { name: format }; } };
  const store = fakeStore();
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view, exporter });
  screen.show();
  assert.equal(view.shown.at(-1).exportable, false, 'nothing recorded: disabled');
  games = 1;
  store.record(game(BEGINNER));
  assert.equal(view.shown.at(-1).exportable, true, 'live');
  assert.deepEqual(screen.exportFile('csv'), { name: 'csv' });
  screen.exportFile('json');
  assert.deepEqual(saved, ['csv', 'json']);
  assert.equal(createRecordsScreen({ records: store, view: fakeView() }).exportFile('csv'), null, 'no exporter: nothing');
  assert.equal(recordsContent(store, {}).exportable, false);
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the records screen is the kit composition: picker, figures, overall, note and Back', () => {
  assert.ok(RECORDS_HTML.length > 400, 'index.html holds #records');
  assert.match(RECORDS_HTML, /^<section id="records" class="overlay ui-backdrop hidden"/);
  const classes = [...RECORDS_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
  assert.match(RECORDS_HTML, /<section class="ui-frame" id="records-frame" aria-labelledby="records-title">/);
  assert.match(RECORDS_HTML, /<h2 class="ui-frame__title" id="records-title">Records<\/h2>/);
  assert.match(RECORDS_HTML, /<div id="records-picker-clip"><div id="records-picker-scroll"><div id="records-picker" class="ui-segmented" role="radiogroup" aria-label="Board"><\/div><\/div><\/div>/,
    'the picker in its sideways scroll, under the fade of its clip');
  for (const id of ['records-title', 'records-picker', 'records-figures', 'records-board', 'records-bests', 'records-counters',
    'rec-time', 'rec-bbbvPerSecond', 'rec-efficiency', 'rec-games', 'rec-wins', 'rec-winRate', 'rec-completedWinRate', 'rec-currentStreak',
    'rec-longestStreak', 'rec-longestCompletedStreak', 'records-overall', 'records-overall-line', 'records-win-rate', 'records-note', 'records-back',
    'records-leaderboards']) {
    assert.ok(RECORDS_HTML.includes(`id="${id}"`), `#${id}`);
  }
  assert.doesNotMatch(RECORDS_HTML, /id="records-empty"|id="ro-/, 'the list says a board is empty; the overall figures are one line');
  assert.match(RECORDS_HTML, /id="rec-completedWinRate-label">Win rate, completed</);
  assert.match(RECORDS_HTML, /id="rec-longestCompletedStreak-label">Best streak, completed</);
  const buttons = [...RECORDS_HTML.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  const option = (value, on) => `<button type="button" class="ui-segmented__option" role="radio" aria-checked="${on}" data-value="${value}">`;
  const tab = (value, on) => `<button type="button" class="ui-tabs__tab" role="tab" aria-selected="${on}" id="records-tab-${value}" aria-controls="records-${value}" data-value="${value}">`;
  assert.deepEqual(buttons, [
    '<button type="button" id="records-back" class="ui-button ui-button--secondary ui-button--sm" data-back data-to-menu data-icon="arrow-left" aria-label="Back to Main menu">',
    option('classic-2d', true), option('3d', false),
    option('classic-2d', true), option('3d', false),
    '<button type="button" id="records-export-csv" class="ui-button ui-button--secondary ui-button--sm" data-icon="download">',
    '<button type="button" id="records-export-json" class="ui-button ui-button--secondary ui-button--sm" data-icon="download">',
    option('all', true), option('12m', false), option('30d', false), option('7d', false),
    option('all', true), option('won', false), option('lost', false), option('abandoned', false),
    tab('recent', true), tab('top', false), tab('replays', false), tab('leaderboards', false),
    option('time', true), option('bbbvPerSecond', false), option('efficiency', false),
    '<button type="button" id="records-replays-open" class="ui-button ui-button--secondary ui-button--sm hidden" data-icon="upload">',
    '<button type="button" id="records-replays-yes" class="ui-button ui-button--danger ui-button--sm" data-icon="trash">',
    '<button type="button" id="records-replays-no" class="ui-button ui-button--secondary ui-button--sm">',
  ]);
});

test('the board\'s figures sit on the frame under section labels: three plain stat tiles of bests, then the counters as sunk tiles', () => {
  const figures = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-figures"'), RECORDS_HTML.indexOf('<div id="records-averages"'));
  assert.match(figures, /^<div id="records-figures" role="group" aria-labelledby="records-board">\s*<div class="ui-section-label"><h3 class="ui-section-label__text" id="records-board">Beginner · Bests<\/h3><\/div>/,
    'no panel: the board\'s bests under its section label');
  assert.match(figures, /<div class="ui-section-label"><h3 class="ui-section-label__text" id="records-counters-title">Counters<\/h3><\/div>\s*<div id="records-counters" class="ui-stat-row" role="group" aria-labelledby="records-counters-title">/);
  const bests = figures.slice(figures.indexOf('<div id="records-bests"'), figures.indexOf('<div class="ui-section-label"><h3 class="ui-section-label__text" id="records-counters-title">'));
  assert.match(bests, /^<div id="records-bests" class="ui-stat-row ui-stat-row--tiles">/);
  for (const [stat, label] of [['time', 'Best time'], ['bbbvPerSecond', 'Best 3BV/s'], ['efficiency', 'Best efficiency']]) {
    assert.ok(bests.includes(`<div id="rec-${stat}" class="ui-stat ui-stat--tile" role="group" aria-labelledby="rec-${stat}-label">`
      + `<span class="ui-stat__label" id="rec-${stat}-label">${label}</span><span class="ui-stat__value">&mdash;</span>`
      + '<span class="ui-stat__detail"></span></div>'), `${stat} tile: its note filled by the view, the date and the inline Watch`);
  }
  const css = read('css/style.css');
  assert.match(css, /#records-bests \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/, 'three across at every size');
  assert.match(css, /#records-counters \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/, 'four counters across');
  assert.match(css, /@media \(max-width: 719px\) \{[^}]*\}[\s\S]*?#records-counters \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/, 'two on a phone');
  assert.match(read('themes/joyful-tiles/theme.css'), /#records-counters > \.ui-stat \{ border-radius: 12px; background: var\(--color-surface-sunk\); \}/, 'the counters sunk');
});

test('the screen is a frame: Back, the title and the switch in its head; the picker, then two columns — figures and export; history and the tabs — then the note', () => {
  const at = (needle) => { const i = RECORDS_HTML.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  const head = RECORDS_HTML.slice(at('<header class="ui-frame__head">'), at('</header>'));
  assert.ok(head.includes('id="records-back"') && head.includes('id="records-title"') && head.includes('id="records-mode"'), 'Back, the title and the switch in the head');
  assert.match(head, /<div class="ui-frame__start"><button type="button" id="records-back"[^>]*><span data-label="wide">Main menu<\/span><span data-label="phone">Back<\/span> <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button><\/div>/,
    '"Main menu" led by its arrow, "Back" on a phone');
  assert.match(head, /<div class="ui-frame__end">/);
  assert.ok(at('id="records-picker"') > at('<div class="ui-frame__body" id="records-body">'), 'the picker in the body');
  assert.ok(at('id="records-picker"') < at('<div class="ui-columns ui-columns--two" id="records-columns">'), 'the picker above both columns');
  const cols = RECORDS_HTML.slice(at('<div class="ui-columns ui-columns--two" id="records-columns">'));
  const [, first, second] = cols.split(/<div class="ui-column" id="records-[a-z]+-column">/);
  assert.ok(first && second, 'two ui-column children');
  assert.ok(first.includes('<div class="ui-divider ui-divider--vertical" role="separator" aria-orientation="vertical"></div>'), 'a rule between the columns');
  const order = (text, ids) => {
    const where = ids.map((id) => text.indexOf(id));
    for (const w of where) assert.ok(w >= 0);
    assert.deepEqual(where, [...where].sort((a, b) => a - b), ids.join(' < '));
  };
  order(first, ['id="records-bests"', 'id="records-counters"', 'id="records-averages"', 'id="records-overall"', 'id="records-export-csv"', 'id="records-export-json"']);
  assert.doesNotMatch(first, /records-history|records-replays/);
  order(second, ['id="records-history"', 'id="records-period"', 'id="records-outcome"', 'id="records-won-only"', 'id="records-chart"',
    'id="records-best-chart"', 'id="records-tabs"', 'id="records-games"', 'id="records-top"', 'id="records-replays"', 'id="records-leaderboards"']);
  assert.ok(at('id="records-note"') > at('id="records-leaderboards"'), 'the note below both columns');
  assert.doesNotMatch(RECORDS_HTML, /ui-panel(?!--muted)"/, 'no panel but the muted ones');
});

test('the averages sit under the board\'s figures: a table of Time, 3BV/s and Efficiency by window, then the last-50 win rate line', () => {
  const panel = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-averages"'), RECORDS_HTML.indexOf('<div id="records-overall"'));
  assert.match(panel, /^<div id="records-averages" role="group" aria-labelledby="records-averages-title">\s*<div class="ui-section-label"><h3 class="ui-section-label__text" id="records-averages-title">Averages · won games<\/h3><\/div>/);
  const heads = [...panel.matchAll(/<th scope="col" class="ui-table__figure" id="records-avg-(\w+)">([^<]+)<\/th>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(heads, [['last10', 'Last 10'], ['last50', 'Last 50'], ['all', 'All']]);
  assert.match(panel, /<tbody id="records-averages-body"><\/tbody>/);
  assert.match(panel, /<p id="records-win-rate" class="ui-text"><\/p>/);
});

test('the history area: period and outcome choices above it, both charts, the four tabs, the Top 10 table and the Leaderboards coming-soon panel', () => {
  const panel = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-history"'), RECORDS_HTML.indexOf('<div id="records-replays"'));
  assert.match(panel, /^<div id="records-history" role="group" aria-label="History">\s*<div id="records-filters" class="ui-row"><div id="records-period" class="ui-segmented" role="radiogroup" aria-label="Period">/,
    'no panel and no heading; the period and the outcome on one row');
  assert.match(panel, /<\/div><div id="records-outcome" class="ui-segmented" role="radiogroup" aria-label="Outcome">/);
  assert.match(panel, /<canvas id="records-best-chart" role="img" aria-label="[^"]+">[^<]*<\/canvas>/, 'the best-time chart is an image with a text alternative');
  assert.match(panel, /<div id="records-tabs" class="ui-tabs" role="tablist" aria-label="Lists">/);
  const tabs = [...RECORDS_HTML.matchAll(/<button type="button" class="ui-tabs__tab" role="tab" aria-selected="(?:true|false)" id="records-tab-(\w+)" aria-controls="records-(\w+)" data-value="(\w+)">([^<]+)<\/button>/g)]
    .map((m) => [m[1], m[2], m[3], m[4]]);
  assert.deepEqual(tabs, [['recent', 'recent', 'recent', 'Recent games'], ['top', 'top', 'top', 'Top 10'], ['replays', 'replays', 'replays', 'Replays'],
    ['leaderboards', 'leaderboards', 'leaderboards', 'Leaderboards']], 'four tabs, in order, each controlling its panel');
  for (const value of ['recent', 'top', 'replays', 'leaderboards']) {
    assert.match(RECORDS_HTML, new RegExp(`<div id="records-${value}"[^>]* role="tabpanel" aria-labelledby="records-tab-${value}"`), `the ${value} panel`);
  }
  assert.match(panel, /<div id="records-recent" role="tabpanel" aria-labelledby="records-tab-recent">\s*<p id="records-games-empty" class="ui-text ui-text--muted hidden">/);
  assert.match(panel, /<div id="records-top" class="hidden" role="tabpanel" aria-labelledby="records-tab-top">\s*<div id="records-top-rank" class="ui-row"><span class="ui-text ui-text--muted" id="records-top-stat-label">Rank by<\/span><div id="records-top-stat" class="ui-segmented" role="radiogroup" aria-labelledby="records-top-stat-label">/,
    'a "Rank by" label before the choice it names');
  const soon = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-leaderboards"'), RECORDS_HTML.indexOf('<p id="records-note"'));
  assert.match(soon, /^<div id="records-leaderboards" class="ui-panel ui-panel--muted hidden" role="tabpanel" aria-labelledby="records-tab-leaderboards">\s*<span class="ui-card__icon" id="records-leaderboards-icon" aria-hidden="true"><svg class="ui-icon" data-icon="trophy"/);
  assert.match(soon, /<h4 class="ui-card__title" id="records-leaderboards-title">Leaderboards are coming soon<\/h4>/);
  assert.match(soon, /<p class="ui-text ui-text--muted">They will rank this board against other players, beside your own records\.<\/p>/);
  assert.doesNotMatch(soon, /ui-pager/, 'no pager');
  const top = panel.slice(panel.indexOf('<table id="records-top-table" class="ui-table">'));
  const heads = [...top.slice(0, top.indexOf('</thead>')).matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['#', 'Time', '3BV/s', 'Eff.', 'Date', '3BV', 'Clicks', 'Board code', 'Replay']);
  assert.match(top, /<th scope="col" id="records-top-replay" class="hidden">Replay<\/th>/);
  assert.match(panel, /<p id="records-top-empty" class="ui-text ui-text--muted hidden">No won games on this board yet\.<\/p>/);
  for (const id of ['records-games', 'records-top-table', 'records-replays-table']) {
    assert.match(RECORDS_HTML, new RegExp(`<div id="${id.replace(/-table$/, '')}-scroll">\\s*<table id="${id}" class="ui-table">`), `${id} scrolls sideways in its own box`);
  }
});

test('the export actions sit under the mode\'s overall figures, with their nothing-to-export line', () => {
  const actions = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-export" class="ui-actions ui-actions--row">'));
  assert.ok(RECORDS_HTML.indexOf('<div id="records-export"') > RECORDS_HTML.indexOf('<div id="records-overall"'), 'under the overall figures');
  const at = (id) => actions.indexOf(`id="${id}"`);
  assert.ok(at('records-export-csv') > 0 && at('records-export-json') > at('records-export-csv'));
  assert.match(actions, />Export history \(CSV\)<\/button>/);
  assert.match(actions, />Export all \(JSON\)<\/button>/);
  assert.match(actions, /<span id="records-export-note" class="ui-text ui-text--muted hidden" role="status"><\/span>/);
});

test('the shell wires the filters, tabs, stat choice and export to the controller, over the one records export', () => {
  for (const [cb, call] of [['onPeriod: (period)', 'setPeriod(period)'], ['onOutcome: (outcome)', 'setOutcome(outcome)'], ['onTab: (tab)', 'setTab(tab)'],
    ['onTopStat: (stat)', 'setTopStat(stat)'], ['onExport: (format)', 'exportFile(format)']]) {
    assert.ok(MAIN.includes(`${cb} => RECORDS_PAGE.${call}`), cb);
  }
  assert.match(MAIN, /createRecordsScreen\(\{[^)]*exporter: RECORDS_EXPORT,/);
  const src = read('js/records/screen.js');
  assert.match(src, /import \{ bindExportActions \} from '\.\/export\.js'/);
  assert.match(src, /createHistoryChart\(\{ canvas: bestCanvas, kind: 'best' \}\)/);
});

test('the mode overall figures are one muted line of their own, titled for the mode, never mixed with the board figures', () => {
  const figures = RECORDS_HTML.slice(at0('<div id="records-figures"'), at0('<div id="records-overall"'));
  assert.doesNotMatch(figures, /records-overall-line/);
  const overall = RECORDS_HTML.slice(at0('<div id="records-overall"'), at0('<div id="records-history"'));
  assert.match(overall, /^<div id="records-overall" class="ui-panel ui-panel--muted" role="group" aria-labelledby="records-overall-title">/);
  assert.match(overall, /<div class="ui-section-label"><h3 class="ui-section-label__text" id="records-overall-title">Classic 2D overall<\/h3><\/div>\s*<p id="records-overall-line" class="ui-text"><\/p>/);
  assert.doesNotMatch(overall, /id="rec-/);
});
function at0(needle) { return RECORDS_HTML.indexOf(needle); }

test('the shell registers the records screen, its default focus on the picker, its controller layer and Back', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /records: \{ defaultFocus: '#records-picker \[aria-checked="true"\]'/, 'the picker takes default focus');
  assert.doesNotMatch(table.match(/records: \{[^\n]*/)[0], /back:/, 'Back is the back stack');
  assert.match(MAIN, /LAYER_SCREEN = \{[^}]*records: 'records'/, 'the controller reaches the records layer');
  assert.match(MAIN, /BACKDROP_SCREENS = new Set\(\[[^\]]*'records'/);
  assert.match(MAIN, /createRecordsScreen\(\{ records: RECORDS/);
  assert.doesNotMatch(read('css/style.css'), /#records\b[^{]*\{[^}]*background/, 'the screen sits on the scene with no tint of its own');
});

test('the catalogue documents the records screen', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?Default focus: the chosen board/);
  const records = head.slice(head.indexOf('Records (index.html #records)'), head.indexOf('Settings page (index.html #settings)'));
  for (const part of ['ui-frame', 'averages', 'period', 'outcome', 'best time', 'Top 10', 'ui-tabs', 'Replays', 'Leaderboards', 'coming soon',
    'Export history (CSV)', 'Export all (JSON)', 'ui-columns--pair']) {
    assert.ok(records.includes(part), `the catalogue names ${part}`);
  }
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}
test('in a browser, the menu opens the records screen on the last board played, the picker chooses a board, Back returns; Records lays out in columns at 1280 px, one column at 900 and 390 px, never scrolling sideways; Back closes a Delete confirmation first', async (t) => {
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
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const active = () => page.evaluate(() => document.activeElement?.textContent ?? '');
    const value = (id) => page.evaluate((i) => document.querySelector(`#${i} .ui-stat__value`).textContent, id);
    const visible = (id) => page.evaluate((i) => !document.getElementById(i).classList.contains('hidden'), id);
    const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);

    // Nothing played: Beginner, its empty state.
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.equal(await visible('records'), true);
    const options = await page.evaluate(() => [...document.querySelectorAll('#records-picker .ui-segmented__option')].map((o) => o.textContent));
    assert.deepEqual(options, [...STANDARD_LABELS, DAILY_OPTION]);
    assert.equal(await active(), 'Beginner', 'the picker takes default focus');
    assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('records-back'); return [b.hasAttribute('data-to-menu'), b.getAttribute('aria-label'), b.innerText.split('\n')[0].trim()]; }),
      [true, 'Back to Main menu', 'Main menu'], 'opened from the menu, Back reads Main menu');
    assert.equal(await text('records-games-empty'), 'No games on this board yet.', 'the list says the board has no games');
    assert.equal(await visible('records-games-empty'), true);
    assert.deepEqual(await page.evaluate(() => ['records-filters', 'records-won-only', 'records-charts', 'records-averages', 'records-tabs']
      .filter((id) => document.getElementById(id).getClientRects().length === 0)), [], 'the filters, the note, both empty charts, the averages and the tabs stay');
    assert.equal(await visible('records-win-rate'), false, 'no win rate line without a game');
    assert.deepEqual(await page.evaluate(() => ['rec-time', 'rec-games', 'rec-winRate'].map((id) => document.querySelector(`#${id} .ui-stat__value`).textContent)),
      ['—', '0', '—'], 'the bests a dash, the counters 0 or a dash');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');
    assert.equal(await visible('records'), false);

    // Two games recorded: a custom board joins the picker and is the last board played.
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const g = (id, board, elapsedMs, endedAt) => ({ id, board, outcome: 'won', elapsedMs, bbbv: 20, bbbvSolved: 20, clicks,
        bbbvPerSecond: 20 / (elapsedMs / 1000), efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      globalThis.__ms.records.record(g('b1', { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, 47380, '2026-10-08T12:00:00.000Z'));
      globalThis.__ms.records.record(g('c1', { mode: 'classic-2d', grid: 'square', width: 20, height: 12, mines: 50, noGuess: false }, 90000, '2026-10-09T12:00:00.000Z'));
    });
    await page.focus('#menu-entry-records');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'records');
    assert.equal(await active(), '20 × 12 · 50 mines', 'opens on the last board played');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), '20 × 12 · 50 mines · Bests');
    assert.equal(await value('rec-time'), '90.000 s');

    // Keyboard: the arrow keys move the choice; the figures follow.
    await page.keyboard.press('ArrowRight');
    assert.equal(await active(), 'Beginner', 'the arrows wrap through every board');
    assert.equal(await value('rec-time'), '47.380 s');
    assert.equal(await value('rec-games'), '1');
    assert.equal(await visible('records-games-empty'), false);

    // Mouse: an option click chooses it.
    await page.click('#records-picker [data-value="classic-2d:square:30x16:99:no-guess"]');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Expert · no-guess · Bests');
    assert.equal(await visible('records-games-empty'), true);
    assert.match(await text('records-overall-line'), /^Games 2 · Wins 2 · /, 'the Classic 2D overall figures');

    // Live: a game recorded while the screen is open redraws it.
    await page.click('#records-picker [data-value="classic-2d:square:9x9:10:guess"]');
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      globalThis.__ms.records.record({ id: 'b2', board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false },
        outcome: 'lost', elapsedMs: 3000, bbbv: 20, bbbvSolved: 4, clicks, bbbvPerSecond: 4 / 3, efficiency: 16, seed: 1, generatorVersion: 1,
        endedAt: '2026-10-09T13:00:00.000Z' });
    });
    assert.equal(await value('rec-games'), '2');
    assert.equal(await value('rec-winRate'), '50%');
    assert.equal(await value('rec-completedWinRate'), '50%', 'the completed-games figures show beside the reference ones');
    assert.equal(await value('rec-longestCompletedStreak'), '1');
    assert.match(await text('records-overall-line'), /Win rate 67% \(completed 67%\)/);

    // The tabs: the mouse opens Leaderboards' coming-soon panel, with no pager; the arrow keys walk the four tabs.
    const tabShown = () => page.evaluate(() => ['recent', 'top', 'replays', 'leaderboards'].filter((v) => {
      const el = document.getElementById(`records-${v}`);
      return !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0;
    }));
    assert.deepEqual(await tabShown(), ['recent']);
    await page.click('#records-tab-leaderboards');
    assert.deepEqual(await tabShown(), ['leaderboards']);
    assert.equal(await page.evaluate(() => document.querySelector('#records-tabs [aria-selected="true"]').id), 'records-tab-leaderboards');
    assert.match(await page.evaluate(() => document.getElementById('records-leaderboards').textContent), /Leaderboards are coming soon/);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#records .ui-pager')].some((p) => p.getClientRects().length > 0)), false, 'no pager under Leaderboards');
    await page.focus('#records-tab-leaderboards');
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await tabShown(), ['replays'], 'Left: Replays');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'records-tab-replays');
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await tabShown(), ['leaderboards'], 'Right: Leaderboards');
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await tabShown(), ['recent'], 'the arrows wrap');

    await page.click('#records-back');
    assert.equal(await mode(), 'menu', 'the Back button returns to the menu');

    // Records laid out at each window size, and a Delete confirmation closed by Back.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      for (let i = 0; i < 14; i++) {
        globalThis.__ms.records.record({ id: `L${i}`, board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false },
          outcome: i % 3 ? 'won' : 'lost', elapsedMs: 40000 + i * 1000, bbbv: 20, bbbvSolved: i % 3 ? 20 : 4, clicks, bbbvPerSecond: 0.5, efficiency: 80,
          seed: 1, generatorVersion: 1, endedAt: new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString() });
      }
    });
    await page.evaluate(async () => {
      const library = globalThis.__ms.replays;
      await library.load();
      for (let i = 0; i < 12; i++) {
        await library.add(new Uint8Array([1, 2, 3]), { id: `L${i}`, boardKey: 'classic-2d:square:9x9:10:guess', mode: 'classic-2d', outcome: i % 3 ? 'won' : 'lost',
          elapsedMs: 40000 + i * 1000, bbbvPerSecond: 0.5, efficiency: 80, endedAt: new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString(), size: 3 }, i === 4);
      }
      await library.settled();
    });
    // Columns: the distinct left edges of a layout's direct children; sideways scroll: any box wider than its scroll port.
    const measure = (id, items) => page.evaluate(([screen, sel]) => {
      const root = document.getElementById(screen);
      const lefts = new Set([...root.querySelectorAll(sel)].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().left)));
      const card = root.querySelector('.ui-card, .ui-frame__body');
      const wide = [document.documentElement, root, card].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.tagName);
      return { columns: lefts.size, wide };
    }, [id, items]);
    const cases = [[1280, 800, 2], [900, 800, 1], [390, 844, 1]];
    for (const theme of ['joyful-tiles']) {
      for (const [width, height, columns] of cases) {
        await page.setViewportSize({ width, height });
        await page.click('#menu-entry-records');
        const records = await measure('records', '.ui-columns > .ui-column');
        assert.equal(records.columns, columns, `${theme} ${width} px: Records in ${columns} column(s)`);
        assert.deepEqual(records.wide, [], `${theme} ${width} px: Records never scrolls sideways`);
        await page.keyboard.press('Escape');
      }
    }

    // Esc, the browser's Back and the controller's Back close an open Delete confirmation first, staying on Records.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('#menu-entry-records');
    // The custom board's game is the latest played, so Records opens on it: Beginner holds the replays.
    await page.click('#records-picker [data-value="classic-2d:square:9x9:10:guess"]');
    await page.click('#records-tab-replays');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#records-replays-body tr').length), 10, 'ten replays a page');
    assert.equal(await page.evaluate(() => document.getElementById('records-replays-page').textContent), 'Replays 1–10 of 12');
    for (const back of ['key', 'history']) {
      await page.focus('#records-replays-body button[data-act="delete"][data-id="L11"]');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'records-replays-no');
      if (back === 'key') await page.keyboard.press('Escape');
      else await page.goBack();
      await page.waitForFunction(() => document.getElementById('records-replays-confirm').classList.contains('hidden'));
      assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'records', `${back} Back stays on Records`);
      assert.deepEqual(await page.evaluate(() => ({ ...document.activeElement?.dataset })), { id: 'L11', act: 'delete' });
      assert.equal(await page.evaluate(() => globalThis.__ms.replays.has('L11')), true, 'nothing deleted');
    }
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'with nothing open, Back leaves');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, at 1280 × 800 and 390 × 844, the Top 10 opens, both charts hover, the filters change and both files export', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    // Settings first: nothing recorded, so the export is offered but disabled, with no line of its own.
    await page.click('#menu-entry-settings');
    assert.deepEqual(await page.evaluate(() => ['set-export-csv', 'set-export-json'].map((id) => document.getElementById(id).disabled)), [true, true]);
    assert.equal(await page.evaluate(() => document.getElementById('set-export-note')), null);
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const now = Date.now();
      const b = { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false };
      for (let i = 0; i < 16; i++) {
        const won = i % 4 !== 3;
        const clicks = { reveal: { effective: 20 + (i % 5), wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
        const elapsedMs = 60000 - i * 1500 + (i % 3) * 4000;
        const bbbvSolved = won ? 20 : 6;
        globalThis.__ms.records.record({ id: `x${i}`, board: b, outcome: won ? 'won' : 'lost', elapsedMs, bbbv: 20, bbbvSolved, clicks,
          bbbvPerSecond: bbbvSolved / (elapsedMs / 1000), efficiency: (100 * bbbvSolved) / (20 + (i % 5)), seed: 1, generatorVersion: 1,
          endedAt: new Date(now - (60 - i * 4) * 86400000).toISOString() });
      }
    });
    const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);
    const visible = (id) => page.evaluate((i) => { const el = document.getElementById(i); return !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0; }, id);
    const hover = async (id) => {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      const box = await page.locator(`#${id}`).boundingBox();
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height / 2);
      const readout = await page.evaluate((i) => document.getElementById(i).dataset.readout ?? null, id);
      await page.mouse.move(box.x + box.width / 2, box.y - 40);
      const after = await page.evaluate((i) => document.getElementById(i).dataset.readout ?? null, id);
      return { readout, after };
    };
    const wide = () => page.evaluate(() => [document.documentElement, document.getElementById('records'), document.getElementById('records-body')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.tagName));
    for (const theme of ['joyful-tiles']) {
      for (const [width, height] of [[1280, 800], [390, 844]]) {
        const at = `${theme} ${width} px`;
        await page.setViewportSize({ width, height });
        await page.click('#menu-entry-records');
        assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Beginner', `${at}: default focus on the chosen board`);
        assert.equal(await visible('records-averages'), true);
        assert.equal(await page.evaluate(() => document.querySelectorAll('#records-averages-body tr').length), 3, `${at}: the averages table`);
        // Both charts side by side at 1280 px, stacked at 390 px.
        const [a, b] = await page.evaluate(() => ['records-chart', 'records-best-chart'].map((id) => document.getElementById(id).getBoundingClientRect().toJSON()));
        assert.ok(a.width > 100 && b.width > 100, `${at}: both charts drawn`);
        if (width >= 1024) assert.ok(Math.abs(a.top - b.top) < 2 && b.left > a.right - 1, `${at}: side by side`);
        else assert.ok(b.top >= a.bottom - 1, `${at}: stacked`);
        // Hover both charts.
        const rate = await hover('records-chart');
        assert.match(rate.readout ?? '', /^\d+ \w{3} \d{4} \d\d:\d\d · 3BV\/s \d+\.\d\d · Efficiency \d+\.\d%$/, `${at}: the 3BV/s chart's readout`);
        assert.equal(rate.after, null, `${at}: gone when the pointer leaves`);
        const best = await hover('records-best-chart');
        assert.match(best.readout ?? '', /^\d+ \w{3} \d{4} \d\d:\d\d · Best time \d+\.\d{3} s$/, `${at}: the best-time chart's readout`);
        assert.equal(best.after, null);
        assert.match(await page.evaluate(() => document.getElementById('records-best-chart').getAttribute('aria-label')), /^Best time by date, \d+ new bests?: /);
        // The Top 10.
        await page.click('#records-tabs [data-value="top"]');
        assert.equal(await visible('records-top'), true);
        assert.equal(await visible('records-recent'), false);
        const ranks = await page.evaluate(() => [...document.querySelectorAll('#records-top-body tr')].map((r) => r.cells[0].textContent.replace(/^Rank/, '')));
        assert.deepEqual(ranks, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], `${at}: ten ranked won games`);
        await page.click('#records-top-stat [data-value="efficiency"]');
        assert.equal(await page.evaluate(() => document.querySelector('#records-top-stat [aria-checked="true"]').dataset.value), 'efficiency');
        // The filters: 30 days keeps the newest games; Lost on the recent games.
        await page.click('#records-period [data-value="30d"]');
        const topRows = await page.evaluate(() => document.querySelectorAll('#records-top-body tr').length);
        assert.ok(topRows > 0 && topRows < 10, `${at}: the Top 10 within 30 days (${topRows})`);
        await page.click('#records-tabs [data-value="recent"]');
        await page.click('#records-outcome [data-value="lost"]');
        const outcomes = await page.evaluate(() => [...document.querySelectorAll('#records-games-body tr')].map((r) => r.cells[1].textContent.replace(/^Outcome/, '')));
        assert.ok(outcomes.length > 0 && outcomes.every((o) => o === 'Lost'), `${at}: the lost games only`);
        await page.click('#records-period [data-value="7d"]');
        await page.click('#records-outcome [data-value="abandoned"]');
        assert.equal(await visible('records-games-empty'), true, `${at}: a filter leaving nothing shows the list's empty line`);
        assert.notEqual(await text('records-games-empty'), 'No games on this board yet.', `${at}: never the board's empty state`);
        assert.deepEqual(await wide(), [], `${at}: Records never scrolls sideways`);
        await page.keyboard.press('Escape');
        await page.click('#menu-entry-records');
        assert.deepEqual(await page.evaluate(() => [...['records-period', 'records-outcome'].map((id) => document.querySelector(`#${id} [aria-checked="true"]`).dataset.value),
          document.querySelector('#records-tabs [aria-selected="true"]').dataset.value]), ['all', 'all', 'recent'], `${at}: each show starts on All time · All`);
        await page.keyboard.press('Escape');
      }
    }
    // Export both files from Records, then the same files from Settings.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('#menu-entry-records');
    assert.equal(await visible('records-export-note'), false);
    const save = async (selector) => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
      const chunks = []; // a download's path is local to the browser's machine; its stream reaches the shared Chromium too
      for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      return { name: download.suggestedFilename(), body };
    };
    const csv = await save('#records-export-csv');
    assert.match(csv.name, /^minesweeper-3d-history-\d{4}-\d\d-\d\d\.csv$/);
    assert.equal(csv.body.trimEnd().split('\r\n').length, 17, 'a header and sixteen games');
    assert.match(csv.body, /^ended_at,mode,board_key,board_label,no_guess,outcome,time_s,/);
    const json = await save('#records-export-json');
    assert.match(json.name, /^minesweeper-3d-records-\d{4}-\d\d-\d\d\.json$/);
    const data = JSON.parse(json.body);
    assert.deepEqual([data.format, data.games.length, Array.isArray(data.replays)], [1, 16, true]);
    await page.keyboard.press('Escape');
    await page.click('#menu-entry-settings');
    assert.equal(await page.evaluate(() => document.getElementById('set-export-csv').disabled), false);
    const settingsCsv = await save('#set-export-csv');
    assert.equal(settingsCsv.body, csv.body, 'Settings gives the same file');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, in both modes the best tiles and the Records tables keep every figure on one line, a replay row\'s actions in one row, and the Averages table stays inside its panel with times over 500 s, a table at 1024 px and stacked on a phone', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    // For the figures: a long custom board in each mode, a won game at the longest time and a lost one,
    // each kept with its board code. For the averages: another long board in each mode with twelve won
    // games, each 502.426 s long, so every average is a three-digit time and the Last 50 column "Last 50 (12)".
    const { figureKeys, averageKeys } = await page.evaluate(async () => {
      const { createBoardIdentity, boardKey } = await import('/js/records/board.js');
      const { codeOf } = await import('/js/records/board-code.js');
      const boards = [createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 99, height: 99, mines: 1500, noGuess: true }),
        createBoardIdentity({ mode: '3d', width: 20, height: 20, depth: 20, mines: 1200, noGuess: false })];
      const library = globalThis.__ms.replays;
      await library.load();
      let n = 0;
      for (const board of boards) {
        const cells = board.width * board.height * (board.depth ?? 1);
        for (const [outcome, elapsedMs] of [['won', 999999], ['lost', 754321]]) {
          const id = `long${n++}`;
          const solved = outcome === 'won' ? 999 : 400;
          const clicks = { reveal: { effective: solved, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
          const game = { id, board, outcome, elapsedMs, bbbv: 999, bbbvSolved: solved, clicks, bbbvPerSecond: solved / (elapsedMs / 1000), efficiency: 100,
            seed: 0xfedcba98, startCell: cells - 1, generatorVersion: 1, endedAt: `2026-10-0${n}T12:34:00.000Z` };
          globalThis.__ms.records.record(game);
          await library.add(new Uint8Array([1, 2, 3]), { id, boardKey: boardKey(board), mode: board.mode, outcome, elapsedMs,
            bbbvPerSecond: game.bbbvPerSecond, efficiency: 100, endedAt: game.endedAt, size: 3, code: codeOf(game) }, false);
        }
      }
      await library.settled();
      const averages = [createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 98, height: 98, mines: 1400, noGuess: true }),
        createBoardIdentity({ mode: '3d', width: 19, height: 19, depth: 19, mines: 1000, noGuess: false })];
      let a = 0;
      for (const board of averages) {
        for (let i = 0; i < 12; i++) {
          const elapsedMs = 502426;
          const clicks = { reveal: { effective: 999, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
          globalThis.__ms.records.record({ id: `avg${a++}`, board, outcome: 'won', elapsedMs, bbbv: 999, bbbvSolved: 999, clicks,
            bbbvPerSecond: 999 / (elapsedMs / 1000), efficiency: 100, seed: 0x1234 + a, startCell: 0, generatorVersion: 1,
            endedAt: `2026-10-${String(1 + i).padStart(2, '0')}T12:34:00.000Z` });
        }
      }
      return { figureKeys: boards.map(boardKey), averageKeys: averages.map(boardKey) };
    });
    // Lines of text an element's content takes; the boxes that must lie inside another.
    const figures = () => page.evaluate(() => {
      const lines = (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      };
      const inside = (outer, inner) => {
        const o = outer.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(inner);
        return [inner.getBoundingClientRect(), ...range.getClientRects()].every((r) => r.left >= o.left - 0.5 && r.right <= o.right + 0.5 && r.top >= o.top - 0.5 && r.bottom <= o.bottom + 0.5);
      };
      const tiles = ['rec-time', 'rec-bbbvPerSecond', 'rec-efficiency'].map((id) => {
        const tile = document.getElementById(id);
        const value = tile.querySelector('.ui-stat__value');
        return { id, text: value.textContent, lines: lines(value), inside: [...tile.children].every((c) => inside(tile, c)) };
      });
      const shown = (el) => el.getClientRects().length > 0;
      const cells = [...document.querySelectorAll('#records-games-body td:is([data-label="Time"], [data-label="Board code"]), #records-top-body td:is([data-label="Time"], [data-label="Board code"]), #records-replays-body td:is([data-label="Time"], [data-label="Board code"])')]
        .filter(shown).map((el) => ({ text: el.textContent, lines: lines(el) }));
      const rows = [...document.querySelectorAll('#records-replays-body tr')].map((tr) => new Set([...tr.querySelectorAll('button[data-act]')].map((b) => Math.round(b.getBoundingClientRect().top))).size);
      return { tiles, cells, rows };
    });
    const averagesOf = () => page.evaluate(() => {
      const lines = (el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
      };
      const panel = document.getElementById('records-averages');
      const table = document.getElementById('records-averages-table');
      const p = panel.getBoundingClientRect();
      const s = getComputedStyle(panel);
      const box = { left: p.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft), right: p.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight) };
      const tb = table.getBoundingClientRect();
      return {
        inside: tb.left >= box.left - 0.5 && tb.right <= box.right + 0.5,
        table: [Math.round(tb.left), Math.round(tb.right)], box: [Math.round(box.left), Math.round(box.right)],
        scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth, display: getComputedStyle(table).display,
        heads: [...table.querySelectorAll('thead th')].map((th) => th.textContent),
        cells: [...document.querySelectorAll('#records-averages-body td')].map((td) => ({ text: td.textContent, lines: lines(td) })),
      };
    });
    const setTiles = (texts) => page.evaluate((list) => ['rec-time', 'rec-bbbvPerSecond', 'rec-efficiency'].forEach((id, i) => {
      document.querySelector(`#${id} .ui-stat__value`).textContent = list[i];
    }), texts);
    const open = async (key) => {
      await page.click('#menu-entry-records');
      await page.evaluate((k) => globalThis.__ms.state.mode === 'records' && document.querySelector(`#records-mode [data-value="${k.startsWith('3d') ? '3d' : 'classic-2d'}"]`).click(), key);
      await page.click(`#records-picker [data-value="${key}"]`);
    };
    const FIGURES = [['999.999 s', '99.99', '100.0%'], ['—', '—', '—']];
    // The narrowest desktop, the largest (the board code shown), a phone and the narrowest phone.
    for (const [width, height] of [[1024, 768], [1920, 1080], [390, 844], [360, 800]]) {
      await page.setViewportSize({ width, height });
      for (const key of figureKeys) {
        const at = `${width} px ${key}`;
        await open(key);
        for (const shown of [null, ...FIGURES]) {
          if (shown) await setTiles(shown);
          for (const tile of (await figures()).tiles) {
            assert.equal(tile.lines, 1, `${at}: ${tile.id} "${tile.text}" on one line`);
            assert.ok(tile.inside, `${at}: ${tile.id} "${tile.text}" — its label, figure, date and Watch inside the tile`);
          }
        }
        if (width >= 1024) {
          for (const tab of ['recent', 'top', 'replays']) {
            await page.click(`#records-tabs [data-value="${tab}"]`);
            const { cells, rows } = await figures();
            assert.ok(cells.some((c) => c.text === '999.999 s'), `${at} ${tab}: a long time shown`);
            assert.equal(cells.some((c) => /-/.test(c.text)), width >= 1440, `${at} ${tab}: the board code shown on the largest window only`);
            for (const c of cells) assert.equal(c.lines, 1, `${at} ${tab}: "${c.text}" on one line`);
            if (tab === 'replays') assert.ok(rows.length > 0 && rows.every((n) => n === 1), `${at}: each replay row's actions in one row (${rows})`);
          }
        }
        await page.keyboard.press('Escape');
      }
      for (const key of averageKeys) {
        const at = `${width} px ${key}, Averages`;
        await open(key);
        const m = await averagesOf();
        assert.deepEqual(m.heads, ['Last 10', 'Last 50 (12)', 'All'], `${at}: the columns`);
        assert.ok(m.cells.filter((c) => c.text === '502.426 s').length === 3, `${at}: a three-digit average time in every column`);
        assert.ok(m.inside, `${at}: the Averages table ${m.table} inside its panel's content box ${m.box}`);
        assert.equal(m.scrollWidth, m.viewport, `${at}: the page does not scroll sideways`);
        for (const c of m.cells) assert.equal(c.lines, 1, `${at}: "${c.text}" on one line`);
        assert.equal(m.display, width >= 1024 ? 'table' : 'block', `${at}: a table at 1024 px, the stacked cards on a phone`);
        await page.keyboard.press('Escape');
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the bests show at 32 px on the largest window, and the picker opens with the chosen board in view on a phone', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      globalThis.__ms.records.record({ id: 'x1', board: { mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99, noGuess: true }, outcome: 'won',
        elapsedMs: 48213, bbbv: 20, bbbvSolved: 20, clicks, bbbvPerSecond: 0.4, efficiency: 80, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T12:00:00.000Z' });
    });
    await page.click('#menu-entry-records');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#rec-time .ui-stat__value')).fontSize), '32px', 'the canvas\'s 32 px figure at xl');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#menu-entry-records');
    const view = await page.evaluate(() => {
      const scroller = document.getElementById('records-picker-scroll').getBoundingClientRect();
      const chosen = document.querySelector('#records-picker [aria-checked="true"]');
      const r = chosen.getBoundingClientRect();
      return { label: chosen.textContent, inside: r.left >= scroller.left - 0.5 && r.right <= scroller.right - 40 + 0.5, page: document.documentElement.scrollLeft };
    });
    assert.deepEqual(view, { label: 'Expert · no-guess', inside: true, page: 0 }, 'the chosen board scrolled into view, clear of the fade, the page unmoved');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
