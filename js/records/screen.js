// Records screen: the 2D | 3D switch, the board picker, the chosen board's figures and the chosen
// mode's overall figures, read from the records store. recordsContent() and the screen controller
// are DOM-free; createRecordsView() binds the #records markup handed in.
//
// The switch chooses a mode (RECORDS_MODES: Classic 2D, 3D) and the picker lists that mode's boards:
// for Classic 2D, Beginner, Intermediate and Expert, for 3D the six presets (PRESETS_3D order), each
// without no-guess then with it, then every custom board of the mode played (boardsPlayed(mode),
// most recently played first), labelled by boardLabel. The screen opens on the board it was asked
// for (a board key, which also sets the mode), otherwise on the mode asked for and its last board
// played, otherwise on the last board played in either mode — the board whose latest game ended
// last — and its mode; a mode with nothing played opens on its first board, and with no mode asked
// and nothing played the screen opens on Classic 2D's Beginner. Times show in the results screen's
// format (formatTime, js/results/view.js), 3BV/s and efficiency in its formats too; a date is
// "9 Oct 2026"; a win rate a whole percentage; anything missing DASH.
//
// recordsContent(records, { mode, boardKey, notSaved, page, replays, pinnedFirst, canWatch,
//   replaysNotSaved }) → { mode, modes: [{ value, label, selected }], boards: [{ key, label, selected }],
//   board: { key, label }, empty, emptyText,
//   bests: [{ stat, label, value, date, watch }], counters: [{ key, label, value }], overallTitle,
//   overall: [{ key, label, value }], notes, chart: { points, text },
//   games: { headers, rows: [{ id, outcome, time, rate, efficiency, watch }], page, pages, label,
//   hasPrev, hasNext }, replays, canWatch }
// replays is the library view (js/records/replay-list.js) of the chosen board over the replay
// library handed in, pinned ones first under pinnedFirst. With canWatch, a best's and a game's watch
// is its summary id when the library keeps its replay (replays.has), else null; without, null.
// The history is the chosen board's (js/records/history-chart.js): the chart's points are its won
// games in play order with their text alternative; the games list is every game, newest first,
// paged (pageOf, page clamped to the last).
// A board with no games is empty. Records that cannot be read (a query throws) are empty too, over
// the chosen mode's named boards, and never throw: the screen always shows and Back always works.
//
// createRecordsScreen({ records, view }) → { show({ mode, boardKey }?), hide(), select(key),
// setMode(mode), showPage(n), mode, board, page }: show draws the content through view.show(content)
// and subscribes to records.onChange, redrawing the chosen board on every newly recorded game (on
// the same games page); show, select and setMode start on the first games page; setMode shows the
// mode's last board played, or its first board, and does nothing for the mode already shown or an
// unknown one; hide unsubscribes and calls view.hide(). When records are not being saved (records.available() false) the first show of the session carries
// the results screen's notSaved note, kept for that visit only.
// With a replay library (replays), show also subscribes to its onChange, redrawing on every add,
// pin, unpin and removal; togglePin(id) pins or unpins a listed replay (the list redraws through
// that notification); setPinnedFirst(on) redraws under the filter. Once the library has loaded
// (replays.load()), a library that is not saving (available() false) adds REPLAYS_NOT_SAVED to the
// notes, the first visit of the session only. With a router ({ has, go }, js/shell/router.js) that
// registers REPLAY_SCREEN, Watch is offered and watch(id) routes to the replay viewer with the
// replay id and this screen on its board to return to (watchRoute); without, watch does nothing.
//
// createRecordsView({ root, onSelect, onBack, onPage, onMode?, onWatch?, onTogglePin?, onPinnedFirst?,
// chart? }) → { show(content), hide() }: fills #records by id, the replays panel through
// createReplayListView; the 2D | 3D switch (#records-mode, a kit segmented choice whose two options
// are in the markup) shows content.mode and calls onMode(mode); a best and a recent game whose
// watch is set get a Watch button calling onWatch(id), and the games list gains its Replay column
// while content.canWatch; the picker is a kit segmented choice whose options are rebuilt only when
// the board list changes; the chart (createHistoryChart over #records-chart by default) is drawn after the
// screen shows; the Newer and Older buttons call onPage with the page to show, and a pager button
// that ends while focused hands focus to the other.

import { MODE_3D, PRESETS_3D, STANDARD_BOARDS, boardKey, boardLabel, createBoardIdentity, parseBoardKey } from './board.js';
import { DASH, NOTES, formatTime, formatRate, formatEfficiency } from '../results/view.js';
import { bindSegmented } from '../ui/components.js';
import { bbbvPerSecond, efficiency } from './summary.js';
import { chartPoints, chartText, pageOf, createHistoryChart } from './history-chart.js';
import { REPLAY_SCREEN, REPLAYS_NOT_SAVED, replayList, togglePin, watchRoute, createReplayListView } from './replay-list.js';

export const RECORDS_SCREEN = 'records';
export const EMPTY_TEXT = 'No games on this board yet.';
const MODE_2D = 'classic-2d';
/** The switch's modes, in order. */
export const RECORDS_MODES = Object.freeze([
  Object.freeze({ value: MODE_2D, label: '2D', overallTitle: 'Classic 2D overall' }),
  Object.freeze({ value: MODE_3D, label: '3D', overallTitle: '3D overall' }),
]);
const isMode = (mode) => RECORDS_MODES.some((m) => m.value === mode);
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

const NAMED = Object.freeze({
  [MODE_2D]: STANDARD_BOARDS.flatMap(({ width, height, mines }) => [false, true].map((noGuess) =>
    createBoardIdentity({ mode: MODE_2D, grid: 'square', width, height, mines, noGuess }))),
  [MODE_3D]: PRESETS_3D.flatMap(({ width, height, depth, mines }) => [false, true].map((noGuess) =>
    createBoardIdentity({ mode: MODE_3D, width, height, depth, mines, noGuess }))),
});

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
const outcomeLabel = (outcome) => OUTCOME_LABELS[outcome] ?? outcome;
const GAME_HEADERS = Object.freeze(['Outcome', 'Time', '3BV/s', 'Efficiency']);

const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const entry = (board) => ({ key: boardKey(board), label: boardLabel(board), board });
const keyOf = (key) => attempt(() => boardKey(parseBoardKey(key)), null);

/** The picker's boards for a mode: its named boards, then every custom board of the mode played. */
export function pickerBoards(records, mode = MODE_2D) {
  const list = NAMED[mode].map(entry);
  const keys = new Set(list.map((b) => b.key));
  for (const { key, board } of attempt(() => records.boardsPlayed(mode), [])) {
    if (!keys.has(key)) { keys.add(key); list.push(entry(board)); }
  }
  return list;
}

/** The key of the board whose latest game ended last — in the mode given, else in either — or null. */
export function lastBoardPlayed(records, mode = null) {
  let last = null;
  let at = '';
  const played = (mode ? [mode] : RECORDS_MODES.map((m) => m.value)).flatMap((m) => attempt(() => records.boardsPlayed(m), []));
  for (const { key } of played) {
    const end = attempt(() => records.history(key).at(-1)?.endedAt, null);
    if (typeof end === 'string' && (last === null || end > at)) { last = key; at = end; }
  }
  return last;
}

const counterFigures = (counters, rate) => COUNTERS.map(({ key, label }) => ({
  key, label, value: key === 'winRate' ? formatWinRate(rate) : String(counters[key] ?? 0),
}));

const gameRow = (e, kept) => ({
  id: e.id, outcome: outcomeLabel(e.outcome), time: formatTime(e.elapsedMs),
  rate: formatRate(attempt(() => bbbvPerSecond(e), null)), efficiency: formatEfficiency(attempt(() => efficiency(e), null)),
  watch: kept(e.id),
});

function gamesList(history, page, kept) {
  const p = pageOf(history.toReversed(), page);
  return {
    headers: [...GAME_HEADERS],
    rows: p.items.map((e) => gameRow(e, kept)),
    page: p.page, pages: p.pages,
    label: p.total ? `Games ${p.from}–${p.to} of ${p.total}` : '',
    hasPrev: p.hasPrev, hasNext: p.hasNext,
  };
}

/** The board and mode to show: the key asked for, else the mode's last board, else the last board played. */
function choose(records, asked, mode) {
  const key = (asked && keyOf(asked)) || (isMode(mode) ? lastBoardPlayed(records, mode) : lastBoardPlayed(records));
  if (key) return { key, mode: parseBoardKey(key).mode };
  const m = isMode(mode) ? mode : MODE_2D;
  return { key: boardKey(NAMED[m][0]), mode: m };
}

export function recordsContent(records, {
  mode: askedMode = null, boardKey: asked = null, notSaved = false, page = 0, replays = null, pinnedFirst = false, canWatch = false,
  replaysNotSaved = false,
} = {}) {
  const { key, mode } = choose(records, asked, askedMode);
  const boards = pickerBoards(records, mode);
  if (!boards.some((b) => b.key === key)) boards.push(entry(parseBoardKey(key)));
  const chosen = boards.find((b) => b.key === key);
  const counters = attempt(() => records.counters(key), EMPTY_COUNTERS);
  const bests = attempt(() => records.bests(key), {});
  const overall = attempt(() => records.overall(mode), EMPTY_COUNTERS);
  const history = attempt(() => records.history(key), []);
  const points = chartPoints(history);
  const kept = (id) => (canWatch && typeof id === 'string' && attempt(() => replays.has(id), false) ? id : null);
  return {
    mode,
    modes: RECORDS_MODES.map((m) => ({ value: m.value, label: m.label, selected: m.value === mode })),
    boards: boards.map((b) => ({ key: b.key, label: b.label, selected: b.key === key })),
    board: { key, label: chosen.label },
    empty: !(counters.games > 0),
    emptyText: EMPTY_TEXT,
    bests: BESTS.map(({ stat, label, format }) => {
      const best = bests?.[stat] ?? null;
      return { stat, label, value: format(best ? best.value : null), date: best ? formatDate(best.endedAt) : DASH, watch: kept(best?.id) };
    }),
    counters: counterFigures(counters, attempt(() => records.winRate(key), null)),
    overallTitle: RECORDS_MODES.find((m) => m.value === mode).overallTitle,
    overall: counterFigures(overall, attempt(() => records.overallWinRate(mode), null)),
    notes: [...(notSaved ? [NOTES.notSaved] : []), ...(replaysNotSaved ? [REPLAYS_NOT_SAVED] : [])],
    chart: { points, text: chartText(points) },
    games: gamesList(history, page, kept),
    replays: replayList(replays, key, { pinnedFirst, canWatch, formatDate, outcomeLabel }),
    canWatch,
  };
}

export function createRecordsScreen({ records, view, replays = null, router = null }) {
  let mode = null;
  let board = null;
  let page = 0;
  let offs = [];
  let notSaved = false;
  let told = false;
  let replaysNotSaved = false;
  let replaysTold = false;
  let pinnedFirst = false;
  let visit = 0;
  let content = null;
  const canWatch = () => attempt(() => router.has(REPLAY_SCREEN), false);
  const draw = () => {
    content = recordsContent(records, { mode, boardKey: board, notSaved, page, replays, pinnedFirst, canWatch: canWatch(), replaysNotSaved });
    mode = content.mode;
    board = content.board.key;
    page = content.games.page;
    view.show(content);
  };
  const unsubscribe = () => { for (const off of offs) off(); offs = []; };
  // Tells once, after the library has loaded, that replays are not being saved this session.
  const checkReplays = (at) => {
    if (!replays || replaysTold) return;
    Promise.resolve(attempt(() => replays.load(), undefined)).catch(() => {}).then(() => {
      if (at !== visit || replaysTold || attempt(() => replays.available(), true)) return;
      replaysTold = true;
      replaysNotSaved = true;
      draw();
    });
  };
  return {
    get mode() { return mode; },
    get board() { return board; },
    get page() { return page; },
    show({ mode: m = null, boardKey: key = null } = {}) {
      unsubscribe();
      visit++;
      mode = m;
      board = key;
      page = 0;
      notSaved = !told && !attempt(() => records.available(), false);
      if (notSaved) told = true;
      offs.push(records.onChange(() => draw()));
      if (replays) offs.push(replays.onChange(() => draw()));
      draw();
      checkReplays(visit);
    },
    select(key) { board = key; page = 0; draw(); },
    setMode(m) {
      if (!isMode(m) || m === mode) return;
      mode = m;
      board = null;
      page = 0;
      draw();
    },
    showPage(n) { page = n; draw(); },
    setPinnedFirst(on) { pinnedFirst = !!on; draw(); },
    async togglePin(id) {
      const row = content?.replays.rows.find((r) => r.id === id);
      if (row) await togglePin(replays, row);
    },
    watch(id) {
      if (!canWatch()) return;
      const { screen, data } = watchRoute(id, { screen: RECORDS_SCREEN, data: { boardKey: board } });
      router.go(screen, { data });
    },
    hide() {
      unsubscribe();
      visit++;
      notSaved = false;
      replaysNotSaved = false;
      view.hide();
    },
  };
}

export function createRecordsView({
  root, onSelect, onMode = () => {}, onBack, onPage, onWatch = () => {}, onTogglePin = () => {}, onPinnedFirst = () => {}, chart = null,
}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const list = createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst });
  const watchButton = (id, label) => {
    const b = root.ownerDocument.createElement('button');
    b.type = 'button';
    b.className = 'ui-button ui-button--secondary';
    b.textContent = 'Watch';
    b.setAttribute('aria-label', label);
    b.dataset.watch = id;
    b.addEventListener('click', () => onWatch(id));
    return b;
  };
  const modes = $('records-mode');
  bindSegmented(modes, { onChange: (mode) => onMode(mode) });
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

  const showGames = (games, canWatch) => {
    const doc = root.ownerDocument;
    page = games.page;
    const body = $('records-games-body');
    const watching = body.contains(doc.activeElement) ? doc.activeElement.dataset.watch : null;
    $('records-games-replay').classList.toggle('hidden', !canWatch);
    body.replaceChildren(...games.rows.map((g) => {
      const tr = doc.createElement('tr');
      for (const text of [g.outcome, g.time, g.rate, g.efficiency]) {
        const td = doc.createElement('td');
        td.textContent = text;
        tr.append(td);
      }
      if (canWatch) {
        const td = doc.createElement('td');
        if (g.watch) td.append(watchButton(g.watch, `Watch the replay of this ${g.outcome.toLowerCase()} game, ${g.time}`));
        tr.append(td);
      }
      return tr;
    }));
    if (watching) [...body.querySelectorAll('[data-watch]')].find((w) => w.dataset.watch === watching)?.focus({ preventScroll: true });
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
      for (const o of modes.querySelectorAll('.ui-segmented__option')) {
        const on = o.dataset.value === content.mode;
        o.setAttribute('aria-checked', String(on));
        o.tabIndex = on ? 0 : -1;
      }
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
      showGames(content.games, content.canWatch);
      for (const b of content.bests) {
        const el = $(`rec-${b.stat}`);
        el.querySelector('.ui-stat__value').textContent = b.value;
        el.querySelector('.ui-stat__detail').textContent = b.date;
        const old = el.querySelector('[data-watch]');
        if (old?.dataset.watch === b.watch) continue;
        const hadFocus = old !== null && old === root.ownerDocument.activeElement;
        old?.remove();
        if (b.watch) {
          const w = watchButton(b.watch, `Watch the replay of the ${b.label.toLowerCase()}`);
          el.append(w);
          if (hadFocus) w.focus({ preventScroll: true });
        }
      }
      list.show(content.replays);
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
