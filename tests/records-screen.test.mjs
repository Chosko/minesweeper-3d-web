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
  RECORDS_SCREEN, TRIGGER_MODES, pickerBoards, lastBoardPlayed, recordsContent, createRecordsScreen, formatDate, formatWinRate,
  EMPTY_TEXT,
} from '../js/records/screen.js';
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
const STANDARD_LABELS = ['Beginner', 'Beginner · no-guess', 'Intermediate', 'Intermediate · no-guess', 'Expert', 'Expert · no-guess'];
const stat = (list, key) => list.find((s) => s.key === key || s.stat === key);

// ---------------------------------------------------------------- picker

test('the picker lists the six standard boards, then every custom board played, by boardLabel', () => {
  assert.deepEqual(pickerBoards(fakeStore()).map((b) => b.label), STANDARD_LABELS, 'the standard boards with no games played');
  const store = fakeStore({ games: [game(CUSTOM2, { endedAt: '2026-10-01T12:00:00.000Z' }), game(BEGINNER), game(CUSTOM, { endedAt: '2026-10-08T12:00:00.000Z' }), game(EXPERT_NG)] });
  const boards = pickerBoards(store);
  assert.deepEqual(boards.map((b) => b.label), [...STANDARD_LABELS, '20 × 12 · 50 mines', '5 × 5 · 3 mines']);
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
    'Games', 'Wins', 'Win rate', 'Win rate, completed games', 'Current streak', 'Longest streak', 'Best streak, completed games',
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

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the records screen is the kit composition: picker, figures, overall, empty state, note and Back', () => {
  assert.ok(RECORDS_HTML.length > 400, 'index.html holds #records');
  assert.match(RECORDS_HTML, /^<section id="records" class="overlay hidden"/);
  const classes = [...RECORDS_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
  assert.match(RECORDS_HTML, /class="ui-card ui-screen ui-screen--wide ui-screen--columns" aria-labelledby="records-title"/);
  assert.match(RECORDS_HTML, /<div id="records-picker" class="ui-segmented" role="radiogroup" aria-label="Board"><\/div>/);
  for (const id of ['records-title', 'records-picker', 'records-figures', 'records-board', 'records-empty', 'records-bests', 'records-counters',
    'rec-time', 'rec-bbbvPerSecond', 'rec-efficiency', 'rec-games', 'rec-wins', 'rec-winRate', 'rec-completedWinRate', 'rec-currentStreak',
    'rec-longestStreak', 'rec-longestCompletedStreak', 'records-overall', 'ro-games', 'ro-wins', 'ro-winRate', 'ro-completedWinRate',
    'ro-currentStreak', 'ro-longestStreak', 'ro-longestCompletedStreak', 'records-note', 'records-back']) {
    assert.ok(RECORDS_HTML.includes(`id="${id}"`), `#${id}`);
  }
  for (const prefix of ['rec', 'ro']) {
    assert.match(RECORDS_HTML, new RegExp(`id="${prefix}-completedWinRate-label">Win rate, completed games<`));
    assert.match(RECORDS_HTML, new RegExp(`id="${prefix}-longestCompletedStreak-label">Best streak, completed games<`));
  }
  const buttons = [...RECORDS_HTML.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(buttons, [
    '<button type="button" class="ui-segmented__option" role="radio" aria-checked="true" data-value="classic-2d">',
    '<button type="button" class="ui-segmented__option" role="radio" aria-checked="false" data-value="3d">',
    '<button type="button" id="records-replays-yes" class="ui-button ui-button--primary">',
    '<button type="button" id="records-replays-no" class="ui-button ui-button--secondary">',
    '<button type="button" id="records-back" class="ui-button ui-button--primary">',
  ]);
});

test('the bests are three kit stat tiles: label, large figure, then the date and its Watch beneath', () => {
  const bests = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-bests"'), RECORDS_HTML.indexOf('<div id="records-counters"'));
  assert.match(bests, /^<div id="records-bests" class="ui-stat-row ui-stat-row--tiles">/);
  for (const [stat, label] of [['time', 'Best time'], ['bbbvPerSecond', 'Best 3BV/s'], ['efficiency', 'Best efficiency']]) {
    assert.ok(bests.includes(`<div id="rec-${stat}" class="ui-stat ui-stat--tile" role="group" aria-labelledby="rec-${stat}-label">`
      + `<span class="ui-stat__label" id="rec-${stat}-label">${label}</span><span class="ui-stat__value">&mdash;</span>`
      + '<span class="ui-stat__detail">&mdash;</span></div>'), `${stat} tile`);
  }
});

test('the screen lays out in two columns: switch, picker, figures and the mode overall; then history and replays; note and Back below', () => {
  const at = (needle) => { const i = RECORDS_HTML.indexOf(needle); assert.ok(i >= 0, needle); return i; };
  const cols = RECORDS_HTML.slice(at('<div class="ui-columns ui-columns--two">'));
  const [, first, second] = cols.split('<div class="ui-column">');
  assert.ok(first && second, 'two ui-column children');
  const order = (text, ids) => {
    const where = ids.map((id) => text.indexOf(id));
    for (const w of where) assert.ok(w >= 0);
    assert.deepEqual(where, [...where].sort((a, b) => a - b), ids.join(' < '));
  };
  order(first, ['id="records-mode"', 'id="records-picker"', 'id="records-bests"', 'id="records-counters"', 'id="records-overall"']);
  assert.doesNotMatch(first, /records-history|records-replays/);
  order(second, ['id="records-history"', 'id="records-chart"', 'id="records-games"', 'id="records-replays"']);
  assert.ok(at('id="records-note"') > at('id="records-replays-table"') && at('id="records-back"') > at('id="records-note"'), 'note and Back below both columns');
});

test('the mode overall figures are a row of their own, titled for the mode, never mixed with the board figures', () => {
  const figures = RECORDS_HTML.slice(at0('<div id="records-figures"'), at0('<div id="records-overall"'));
  assert.doesNotMatch(figures, /id="ro-/);
  const overall = RECORDS_HTML.slice(at0('<div id="records-overall"'), at0('<div id="records-history"'));
  assert.match(overall, /<h3 class="ui-heading" id="records-overall-title">Classic 2D overall<\/h3>\s*<div class="ui-stat-row">/);
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
  assert.match(read('css/style.css'), /#settings, #records \{/);
});

test('the catalogue documents the records screen', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?Default focus: the chosen board/);
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}
test('in a browser, the menu opens the records screen on the last board played, the picker chooses a board, Back returns', async (t) => {
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

    // Nothing played: Beginner, its empty state.
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.equal(await visible('records'), true);
    const options = await page.evaluate(() => [...document.querySelectorAll('#records-picker .ui-segmented__option')].map((o) => o.textContent));
    assert.deepEqual(options, STANDARD_LABELS);
    assert.equal(await active(), 'Beginner', 'the picker takes default focus');
    assert.equal(await visible('records-empty'), true);
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
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), '20 × 12 · 50 mines');
    assert.equal(await value('rec-time'), '90.000 s');

    // Keyboard: the arrow keys move the choice; the figures follow.
    await page.keyboard.press('ArrowRight');
    assert.equal(await active(), 'Beginner', 'the arrows wrap through every board');
    assert.equal(await value('rec-time'), '47.380 s');
    assert.equal(await value('rec-games'), '1');
    assert.equal(await visible('records-empty'), false);

    // Mouse: an option click chooses it.
    await page.click('#records-picker [data-value="classic-2d:square:30x16:99:no-guess"]');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Expert · no-guess');
    assert.equal(await visible('records-empty'), true);
    assert.equal(await value('ro-games'), '2', 'the Classic 2D overall figures');

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
    assert.equal(await value('ro-completedWinRate'), '67%');

    await page.click('#records-back');
    assert.equal(await mode(), 'menu', 'the Back button returns to the menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, Records and Settings lay out in columns at 1280 px, one column at 900 and 390 px, in both themes, never scrolling sideways', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
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
      const card = root.querySelector('.ui-card');
      const wide = [document.documentElement, root, card].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.tagName);
      return { columns: lefts.size, wide };
    }, [id, items]);
    const cases = [[1280, 800, 2], [900, 800, 1], [390, 844, 1]];
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      for (const [width, height, columns] of cases) {
        await page.setViewportSize({ width, height });
        await page.click('#menu-entry-records');
        const records = await measure('records', '.ui-columns > .ui-column');
        assert.equal(records.columns, columns, `${theme} ${width} px: Records in ${columns} column(s)`);
        assert.deepEqual(records.wide, [], `${theme} ${width} px: Records never scrolls sideways`);
        await page.keyboard.press('Escape');
        await page.click('#menu-entry-settings');
        const settings = await measure('settings', '#settings-body > .ui-columns > section:not(.ui-columns__span)');
        if (width >= 1024) assert.ok(settings.columns >= 2, `${theme} ${width} px: Settings sections side by side (${settings.columns})`);
        else assert.equal(settings.columns, 1, `${theme} ${width} px: Settings in one column`);
        assert.deepEqual(settings.wide, [], `${theme} ${width} px: Settings never scrolls sideways`);
        const bindings = await measure('settings', '#settings-bindings > div');
        assert.equal(bindings.columns > 1, width >= 1024, `${theme} ${width} px: the bindings lists side by side only in columns`);
        await page.keyboard.press('Escape');
      }
    }

    // Esc, the browser's Back and the controller's Back close an open Delete confirmation first, staying on Records.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.click('#menu-entry-records');
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
