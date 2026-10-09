// Records screen: the board picker, the chosen board's figures and the Classic 2D overall figures,
// read from the records store. recordsContent() and the screen controller are DOM-free;
// createRecordsView() binds the #records markup handed in.
//
// The picker lists Beginner, Intermediate and Expert, each without no-guess then with it, then every
// custom board played (most recently played first), labelled by boardLabel. The screen opens on the
// board it was asked for (a board key), otherwise on the last board played — the board whose latest
// game ended last — otherwise on Beginner. Times show in the results screen's format (formatTime,
// js/results/view.js), 3BV/s and efficiency in its formats too; a date is "9 Oct 2026"; a win rate
// a whole percentage; anything missing DASH.
//
// recordsContent(records, { boardKey, notSaved, page }) → { boards: [{ key, label, selected }],
//   board: { key, label }, empty, emptyText, bests: [{ stat, label, value, date }],
//   counters: [{ key, label, value }], overallTitle, overall: [{ key, label, value }], notes,
//   chart: { points, text }, games: { headers, rows: [{ id, outcome, time, rate, efficiency }],
//   page, pages, label, hasPrev, hasNext } }
// The history is the chosen board's (js/records/history-chart.js): the chart's points are its won
// games in play order with their text alternative; the games list is every game, newest first,
// paged (pageOf, page clamped to the last).
// A board with no games is empty. Records that cannot be read (a query throws) are empty too, over
// the standard boards, and never throw: the screen always shows and Back always works.
//
// createRecordsScreen({ records, view }) → { show({ boardKey }?), hide(), select(key), showPage(n),
// board, page }: show draws the content through view.show(content) and subscribes to
// records.onChange, redrawing the chosen board on every newly recorded game (on the same games
// page); show and select start on the first games page; hide unsubscribes and calls view.hide(). When
// records are not being saved (records.available() false) the first show of the session carries
// the results screen's notSaved note, kept for that visit only.
//
// createRecordsView({ root, onSelect, onBack, onPage, chart? }) → { show(content), hide() }: fills
// #records by id; the picker is a kit segmented choice whose options are rebuilt only when the board
// list changes; the chart (createHistoryChart over #records-chart by default) is drawn after the
// screen shows; the Newer and Older buttons call onPage with the page to show, and a pager button
// that ends while focused hands focus to the other.

import { STANDARD_BOARDS, boardKey, boardLabel, createBoardIdentity, parseBoardKey } from './board.js';
import { DASH, NOTES, formatTime, formatRate, formatEfficiency } from '../results/view.js';
import { bindSegmented } from '../ui/components.js';
import { bbbvPerSecond, efficiency } from './summary.js';
import { chartPoints, chartText, pageOf, createHistoryChart } from './history-chart.js';

export const RECORDS_SCREEN = 'records';
export const EMPTY_TEXT = 'No games on this board yet.';
const MODE = 'classic-2d';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date as "9 Oct 2026", in local time. */
export function formatDate(iso) {
  if (typeof iso !== 'string') return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** A win rate (0..1) as a whole percentage. */
export function formatWinRate(rate) {
  return rate === null || rate === undefined || !Number.isFinite(rate) ? DASH : `${Math.round(rate * 100)}%`;
}

const STANDARD = STANDARD_BOARDS.flatMap(({ width, height, mines }) => [false, true].map((noGuess) =>
  createBoardIdentity({ mode: MODE, grid: 'square', width, height, mines, noGuess })));

const BESTS = Object.freeze([
  { stat: 'time', label: 'Best time', format: formatTime },
  { stat: 'bbbvPerSecond', label: 'Best 3BV/s', format: formatRate },
  { stat: 'efficiency', label: 'Best efficiency', format: formatEfficiency },
]);
const COUNTERS = Object.freeze([
  { key: 'games', label: 'Games' },
  { key: 'wins', label: 'Wins' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'currentStreak', label: 'Current streak' },
  { key: 'longestStreak', label: 'Longest streak' },
]);
const EMPTY_COUNTERS = Object.freeze({ games: 0, wins: 0, currentStreak: 0, longestStreak: 0 });
const OUTCOME_LABELS = Object.freeze({ won: 'Won', lost: 'Lost', abandoned: 'Abandoned' });
const GAME_HEADERS = Object.freeze(['Outcome', 'Time', '3BV/s', 'Efficiency']);

const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const entry = (board) => ({ key: boardKey(board), label: boardLabel(board), board });
const keyOf = (key) => attempt(() => boardKey(parseBoardKey(key)), null);

/** The picker's boards: the six standard boards, then every custom board played. */
export function pickerBoards(records) {
  const list = STANDARD.map(entry);
  const keys = new Set(list.map((b) => b.key));
  for (const { key, board } of attempt(() => records.boardsPlayed(), [])) {
    if (!keys.has(key)) { keys.add(key); list.push(entry(board)); }
  }
  return list;
}

/** The key of the board whose latest game ended last, or null before any game. */
export function lastBoardPlayed(records) {
  let last = null;
  let at = '';
  for (const { key } of attempt(() => records.boardsPlayed(), [])) {
    const end = attempt(() => records.history(key).at(-1)?.endedAt, null);
    if (typeof end === 'string' && (last === null || end > at)) { last = key; at = end; }
  }
  return last;
}

const counterFigures = (counters, rate) => COUNTERS.map(({ key, label }) => ({
  key, label, value: key === 'winRate' ? formatWinRate(rate) : String(counters[key] ?? 0),
}));

const gameRow = (e) => ({
  id: e.id, outcome: OUTCOME_LABELS[e.outcome] ?? e.outcome, time: formatTime(e.elapsedMs),
  rate: formatRate(attempt(() => bbbvPerSecond(e), null)), efficiency: formatEfficiency(attempt(() => efficiency(e), null)),
});

function gamesList(history, page) {
  const p = pageOf(history.toReversed(), page);
  return {
    headers: [...GAME_HEADERS],
    rows: p.items.map(gameRow),
    page: p.page, pages: p.pages,
    label: p.total ? `Games ${p.from}–${p.to} of ${p.total}` : '',
    hasPrev: p.hasPrev, hasNext: p.hasNext,
  };
}

export function recordsContent(records, { boardKey: asked = null, notSaved = false, page = 0 } = {}) {
  const boards = pickerBoards(records);
  let key = (asked && keyOf(asked)) || lastBoardPlayed(records) || boards[0].key;
  if (!boards.some((b) => b.key === key)) boards.push(entry(parseBoardKey(key)));
  const chosen = boards.find((b) => b.key === key);
  const counters = attempt(() => records.counters(key), EMPTY_COUNTERS);
  const bests = attempt(() => records.bests(key), {});
  const overall = attempt(() => records.overall(MODE), EMPTY_COUNTERS);
  const history = attempt(() => records.history(key), []);
  const points = chartPoints(history);
  return {
    boards: boards.map((b) => ({ key: b.key, label: b.label, selected: b.key === key })),
    board: { key, label: chosen.label },
    empty: !(counters.games > 0),
    emptyText: EMPTY_TEXT,
    bests: BESTS.map(({ stat, label, format }) => {
      const best = bests?.[stat] ?? null;
      return { stat, label, value: format(best ? best.value : null), date: best ? formatDate(best.endedAt) : DASH };
    }),
    counters: counterFigures(counters, attempt(() => records.winRate(key), null)),
    overallTitle: 'Classic 2D overall',
    overall: counterFigures(overall, attempt(() => records.overallWinRate(MODE), null)),
    notes: notSaved ? [NOTES.notSaved] : [],
    chart: { points, text: chartText(points) },
    games: gamesList(history, page),
  };
}

export function createRecordsScreen({ records, view }) {
  let board = null;
  let page = 0;
  let off = null;
  let notSaved = false;
  let told = false;
  const draw = () => {
    const content = recordsContent(records, { boardKey: board, notSaved, page });
    board = content.board.key;
    page = content.games.page;
    view.show(content);
  };
  const unsubscribe = () => { if (off) { off(); off = null; } };
  return {
    get board() { return board; },
    get page() { return page; },
    show({ boardKey: key = null } = {}) {
      unsubscribe();
      board = key;
      page = 0;
      notSaved = !told && !attempt(() => records.available(), false);
      if (notSaved) told = true;
      off = records.onChange(() => draw());
      draw();
    },
    select(key) { board = key; page = 0; draw(); },
    showPage(n) { page = n; draw(); },
    hide() {
      unsubscribe();
      notSaved = false;
      view.hide();
    },
  };
}

export function createRecordsView({ root, onSelect, onBack, onPage, chart = null }) {
  const $ = (id) => root.querySelector(`#${id}`);
  const picker = $('records-picker');
  const canvas = $('records-chart');
  const history = chart ?? createHistoryChart({ canvas });
  const prev = $('records-prev');
  const next = $('records-next');
  let page = 0;
  let pickerKeys = '';
  let unbind = () => {};
  const fill = (prefix, figures) => {
    for (const f of figures) $(`${prefix}-${f.key}`).querySelector('.ui-stat__value').textContent = f.value;
  };
  $('records-back').addEventListener('click', () => onBack());
  prev.addEventListener('click', () => onPage(page - 1));
  next.addEventListener('click', () => onPage(page + 1));

  const showGames = (games) => {
    const doc = root.ownerDocument;
    page = games.page;
    $('records-games-body').replaceChildren(...games.rows.map((g) => {
      const tr = doc.createElement('tr');
      for (const text of [g.outcome, g.time, g.rate, g.efficiency]) {
        const td = doc.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      return tr;
    }));
    $('records-page').textContent = games.label;
    const focused = doc.activeElement;
    prev.disabled = !games.hasPrev;
    next.disabled = !games.hasNext;
    if (focused === prev && prev.disabled && !next.disabled) next.focus({ preventScroll: true });
    if (focused === next && next.disabled && !prev.disabled) prev.focus({ preventScroll: true });
  };

  const buildPicker = (boards) => {
    const hadFocus = picker.contains(root.ownerDocument.activeElement);
    unbind();
    picker.replaceChildren(...boards.map((b) => {
      const o = root.ownerDocument.createElement('button');
      o.type = 'button';
      o.className = 'ui-segmented__option';
      o.setAttribute('role', 'radio');
      o.setAttribute('aria-checked', String(b.selected));
      o.dataset.value = b.key;
      o.textContent = b.label;
      return o;
    }));
    unbind = bindSegmented(picker, { onChange: (key) => onSelect(key) });
    if (hadFocus) picker.querySelector('[aria-checked="true"]')?.focus({ preventScroll: true });
  };

  return {
    show(content) {
      const keys = content.boards.map((b) => b.key).join('\n');
      if (keys !== pickerKeys) {
        pickerKeys = keys;
        buildPicker(content.boards);
      } else {
        for (const o of picker.querySelectorAll('.ui-segmented__option')) {
          const on = o.dataset.value === content.board.key;
          o.setAttribute('aria-checked', String(on));
          o.tabIndex = on ? 0 : -1;
        }
      }
      $('records-board').textContent = content.board.label;
      const empty = $('records-empty');
      empty.textContent = content.emptyText;
      empty.classList.toggle('hidden', !content.empty);
      $('records-bests').classList.toggle('hidden', content.empty);
      $('records-counters').classList.toggle('hidden', content.empty);
      $('records-history').classList.toggle('hidden', content.empty);
      canvas.setAttribute('aria-label', content.chart.text);
      canvas.textContent = content.chart.text;
      showGames(content.games);
      for (const b of content.bests) {
        const el = $(`rec-${b.stat}`);
        el.querySelector('.ui-stat__value').textContent = b.value;
        el.querySelector('.ui-stat__detail').textContent = b.date;
      }
      fill('rec', content.counters);
      $('records-overall-title').textContent = content.overallTitle;
      fill('ro', content.overall);
      const note = $('records-note');
      note.textContent = content.notes.join(' ');
      note.classList.toggle('hidden', !content.notes.length);
      root.classList.remove('hidden');
      if (!content.empty) history.draw(content.chart.points);
    },
    hide() { root.classList.add('hidden'); },
  };
}
