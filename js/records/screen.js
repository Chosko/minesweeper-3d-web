// Records screen: the 2D | 3D switch, the board picker, the chosen board's figures and the chosen
// mode's overall figures, read from the records store. recordsContent() and the screen controller
// are DOM-free; createRecordsView() binds the #records markup handed in.
//
// The switch chooses a mode (RECORDS_MODES: Classic 2D, 3D) and the picker lists that mode's boards:
// for Classic 2D, Beginner, Intermediate and Expert, for 3D the three cube presets (PRESETS_3D
// order), each without no-guess then with it, then every custom board of the mode played
// (boardsPlayed(mode), most recently played first), labelled by boardLabel. The screen opens on
// the board it was asked
// for (a board key, which also sets the mode), otherwise on the mode asked for and its last board
// played, otherwise on the last board played in either mode — the board whose latest game ended
// last — and its mode; a mode with nothing played opens on its first board, and with no mode asked
// and nothing played the screen opens on Classic 2D's Beginner. Times show in the results screen's
// format (formatTime, js/results/view.js), 3BV/s and efficiency in its formats too; a best's date is
// "9 Oct 2026" (formatDate) and a game's or a replay's end "9 Oct 2026 14:32" (formatDateTime, local,
// 24-hour); a win rate a whole percentage; anything missing DASH. The counters of the board and
// of the mode overall show the completed games' win rate and best streak beside the reference win
// rate and longest streak, labelled for what they leave out (games abandoned by a restart, Back to
// menu or a closed page).
//
// recordsContent(records, { mode, boardKey, notSaved, page, replays, replayPage, pinnedFirst, canWatch,
//   replaysNotSaved, period, outcome, tab, topStat, now, exportable }) → { mode, modes: [{ value, label,
//   selected }], boards: [{ key, label, selected }], board: { key, label }, empty, emptyText,
//   bests: [{ stat, label, value, date, watch }], counters: [{ key, label, value }], overallTitle,
//   overall: [{ key, label, value }], notes, filters: { period, outcome, wonOnly }, chart: { points, text },
//   bestChart: { steps, start, end, emptyText, text }, averages: { columns: [{ key, label }],
//   rows: [{ stat, label, values }], winRates: [{ key, label, value, detail }] }, tab, tabs,
//   games: { headers, rows: [{ id, date, outcome, time, bbbv, rate, efficiency, watch }], empty, emptyText,
//   page, pages, label, pager }, top: { stat, stats, headers, rows: [{ id, rank, time, rate, efficiency,
//   date, bbbv, clicks, watch }], empty, emptyText }, exportable, replays, canWatch }
// filters.period and filters.outcome, tabs and top.stats are choice lists [{ value, label, selected }]
// (PERIODS, OUTCOME_FILTERS, GAME_TABS, TOP_STATS; an unknown choice is the first). The period, measured
// back from now on each game's end date (filterHistory, js/records/stats.js), filters every history view;
// the outcome filters only the recent games, the one view of every outcome. The bests, the board's
// counters and the mode's overall row are all-time. The Top 10 (topGames) ranks the period's won games by
// topStat, in the shared ranking the results screen's rank reads; the averages are the means over the
// period's last 10, last 50 and all won games, a column short of its size labelled with its count ("Last 50 (12)"),
// and the win rates are over its last 50 games of every outcome, with the completed games' beside it;
// the best-time chart's steps are the period's new standing bests, start and end its first and last
// won game. A filter leaving nothing gives each view its empty line, never the board's empty state.
// exportable says whether the export actions are enabled.
// The bests show as the screen's three stat tiles; the board's counters and the mode's overall
// figures are two separate rows. A game's bbbv is its board's 3BV from its history entry.
// replays is the library view (js/records/replay-list.js) of the chosen board over the replay
// library handed in, on its page replayPage, pinned ones first under pinnedFirst. With canWatch, a best's and a game's watch
// is its summary id when the library keeps its replay (replays.has), else null; without, null.
// The history is the chosen board's (js/records/history-chart.js): the chart's points are its won
// games in play order with their text alternative; the games list is every game, newest first,
// paged (pageOf, page clamped to the last), pager the kit pager's state (pagerState); both under the
// filters above.
// A board with no games is empty. Records that cannot be read (a query throws) are empty too, over
// the chosen mode's named boards, and never throw: the screen always shows and Back always works.
//
// createRecordsScreen({ records, view, replays?, router?, viewPrefs?, exporter?, files?, now? }) → { show({ mode, boardKey }?), hide(), select(key),
// stepBoard(delta), setMode(mode), showPage(n), showReplayPage(n), setPeriod(v), setOutcome(v), setTab(v), setTopStat(v),
// exportFile(format), downloadReplay(id), openReplayFile(), mode, board, page, filters }: show draws the content through view.show(content)
// and subscribes to records.onChange, redrawing the chosen board on every newly recorded game (on
// the same pages, each clamped to its last); show, select and setMode start both lists on their first page; stepBoard(±1) selects the
// previous / next board of the picker, in its order, and returns false, changing nothing, at either end
// (the controller's LB / RB; TRIGGER_MODES are LT's and RT's modes for setMode); setMode shows the
// mode's last board played, or its first board, and does nothing for the mode already shown or an
// unknown one; hide unsubscribes and calls view.hide(). The period, outcome, tab and Top 10 stat are
// screen state: kept across board and mode changes, back to All time · All, Recent games and Time on
// each show; setPeriod and setOutcome start the recent games on their first page. With an exporter
// (js/records/export.js), content.exportable is its hasGames() and exportFile(format) its save(format). When records are not being saved (records.available() false) the first show of the session carries
// the results screen's notSaved note, kept for that visit only.
// With a replay library (replays), show also subscribes to its onChange, redrawing on every add,
// pin, unpin and removal; togglePin(id) pins or unpins a listed replay and deleteReplay(id) removes
// it (library.remove; the list redraws through that notification); setPinnedFirst(on) redraws under
// the filter on the replays' first page and saves the choice through viewPrefs
// (js/records/view-prefs.js), whose pinnedFirst every show applies; closeConfirm() closes the
// view's Delete confirmation (Back) → false when none is open, and confirmOpen says whether one is
// open (the controller's board and mode buttons wait while it is). Once the library has loaded
// (replays.load()), a library that is not saving (available() false) adds REPLAYS_NOT_SAVED to the
// notes, the first visit of the session only. With a router ({ has, go }, js/shell/router.js) that
// registers REPLAY_SCREEN, Watch is offered and watch(id) routes to the replay viewer with the
// replay id and this screen on its board to return to (watchRoute); without, watch does nothing.
// With files ({ save(bytes, name), pick() → Promise of a File or null }, the shell's), each listed
// replay's Download saves its stored bytes (replays.bytes) under its row's file name through
// downloadReplay(id), and, with the replay viewer's route, content.canOpen offers Open replay file:
// openReplayFile() picks a file and routes to the replay viewer with { file, returnTo } this screen
// on its board. An imported replay is watched there, never added to the library.
//
// createRecordsView({ root, onSelect, onBack, onPage, onMode?, onWatch?, onTogglePin?, onPinnedFirst?,
// onReplayPage?, onDelete?, onPeriod?, onOutcome?, onTab?, onTopStat?, onExport?, onDownload?, onOpenFile?, chart?, bestChart? }) → { show(content), hide(),
// closeConfirm(), isConfirmOpen() }: fills #records by id, the replays panel through
// createReplayListView; the 2D | 3D switch (#records-mode, a kit segmented choice whose two options
// are in the markup) shows content.mode and calls onMode(mode); a best and a recent game whose
// watch is set get a Watch button calling onWatch(id), and the games list gains its Replay column
// while content.canWatch; the picker is a kit segmented choice whose options are rebuilt only when
// the board list changes; the chart (createHistoryChart over #records-chart by default) is drawn after the
// screen shows; the recent games' kit pager (#records-games-pager, bindPager) calls onPage with the
// page to show. The period, outcome, tab and Top 10 stat choices (#records-period, #records-outcome,
// #records-tabs, #records-top-stat, kit segmented choices whose options are in the markup) call onPeriod,
// onOutcome, onTab and onTopStat; the tab shows #records-recent or #records-top; the best-time chart
// (createHistoryChart kind 'best' over #records-best-chart by default) is drawn beside the other; the
// export actions (#records-export-csv, #records-export-json, bindExportActions) call onExport(format).

import { MODE_3D, PRESETS_3D, STANDARD_BOARDS, boardKey, boardLabel, createBoardIdentity, parseBoardKey } from './board.js';
import { DASH, NOTES, formatTime, formatRate, formatEfficiency, formatWinRate } from '../results/view.js';
import { bindSegmented, bindPager, pagerState } from '../ui/components.js';
import { BEST_STATS, bbbvPerSecond, countedClicks, efficiency } from './summary.js';
import {
  NO_WON_GAMES, NO_WON_GAMES_PERIOD, NO_BEST_TIME, NO_BEST_TIME_PERIOD, chartPoints, chartText, bestTimeText, formatDate, pageOf, createHistoryChart,
} from './history-chart.js';
import { PERIODS, OUTCOME_FILTERS, AVERAGE_WINDOWS, RECENT_GAMES, filterHistory, topGames, averages, recentWinRate, bestTimeSteps } from './stats.js';
import { bindExportActions } from './export.js';
import { REPLAY_SCREEN, REPLAYS_NOT_SAVED, replayList, togglePin, watchRoute, createReplayListView } from './replay-list.js';

export const RECORDS_SCREEN = 'records';
export const EMPTY_TEXT = 'No games on this board yet.';
const MODE_2D = 'classic-2d';
/** The mode each controller trigger chooses on the Records screen. */
export const TRIGGER_MODES = Object.freeze({ lt: MODE_2D, rt: MODE_3D });
/** The switch's modes, in order. */
export const RECORDS_MODES = Object.freeze([
  Object.freeze({ value: MODE_2D, label: '2D', overallTitle: 'Classic 2D overall' }),
  Object.freeze({ value: MODE_3D, label: '3D', overallTitle: '3D overall' }),
]);
const isMode = (mode) => RECORDS_MODES.some((m) => m.value === mode);

const localDate = (iso) => {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};
export { formatDate };
const two = (n) => String(n).padStart(2, '0');
/** A date and local time as "9 Oct 2026 14:32", 24-hour, to the minute. */
export function formatDateTime(iso) {
  const d = localDate(iso);
  return d ? `${formatDate(iso)} ${two(d.getHours())}:${two(d.getMinutes())}` : DASH;
}
export { formatWinRate };

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
  { key: 'winRate', label: 'Win rate', rate: true },
  { key: 'completedWinRate', label: 'Win rate, completed games', rate: true },
  { key: 'currentStreak', label: 'Current streak' },
  { key: 'longestStreak', label: 'Longest streak' },
  { key: 'longestCompletedStreak', label: 'Best streak, completed games' },
]);
const EMPTY_COUNTERS = Object.freeze({
  games: 0, wins: 0, currentStreak: 0, longestStreak: 0, completed: 0, currentCompletedStreak: 0, longestCompletedStreak: 0,
});
const NO_RATES = Object.freeze({ winRate: null, completedWinRate: null });
const OUTCOME_LABELS = Object.freeze({ won: 'Won', lost: 'Lost', abandoned: 'Abandoned' });
const outcomeLabel = (outcome) => OUTCOME_LABELS[outcome] ?? outcome;
const GAME_HEADERS = Object.freeze(['Date', 'Outcome', 'Time', '3BV', '3BV/s', 'Efficiency']);
const TOP_HEADERS = Object.freeze(['Rank', 'Time', '3BV/s', 'Efficiency', 'Date', '3BV', 'Clicks']);
/** The games area's tabs, the first the default. */
export const GAME_TABS = Object.freeze([
  Object.freeze({ value: 'recent', label: 'Recent games' }),
  Object.freeze({ value: 'top', label: 'Top 10' }),
]);
/** The Top 10's ranking choice, the first the default. */
export const TOP_STATS = Object.freeze([
  Object.freeze({ value: 'time', label: 'Time' }),
  Object.freeze({ value: 'bbbvPerSecond', label: '3BV/s' }),
  Object.freeze({ value: 'efficiency', label: 'Efficiency' }),
]);
export const TOP_EMPTY_TEXT = 'No won games on this board yet.';
export const TOP_EMPTY_PERIOD = 'No won games in this period.';
export const GAMES_EMPTY_TEXT = 'No games match these filters.';
export const WON_ONLY_TEXT = 'The Top 10, the averages and both charts count won games only; the outcome choice filters the recent games.';
const AVERAGE_ROWS = Object.freeze([
  { stat: 'time', label: 'Time', format: formatTime },
  { stat: 'bbbvPerSecond', label: '3BV/s', format: formatRate },
  { stat: 'efficiency', label: 'Efficiency', format: formatEfficiency },
]);
const WINDOW_LABELS = Object.freeze({ last10: 'Last 10', last50: 'Last 50', all: 'All' });
const choiceOf = (list, value) => (list.some((c) => c.value === value) ? value : list[0].value);
const choices = (list, value) => list.map((c) => ({ value: c.value, label: c.label, selected: c.value === value }));

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

// rates: { winRate, completedWinRate }, each 0..1 or null.
const counterFigures = (counters, rates) => COUNTERS.map(({ key, label, rate }) => ({
  key, label, value: rate ? formatWinRate(rates[key]) : String(counters[key] ?? 0),
}));

const gameRow = (e, kept) => ({
  id: e.id, date: formatDateTime(e.endedAt), outcome: outcomeLabel(e.outcome), time: formatTime(e.elapsedMs),
  bbbv: Number.isInteger(e.bbbv) ? String(e.bbbv) : DASH,
  rate: formatRate(attempt(() => bbbvPerSecond(e), null)), efficiency: formatEfficiency(attempt(() => efficiency(e), null)),
  watch: kept(e.id),
});

function gamesList(history, page, kept) {
  const p = pageOf(history.toReversed(), page);
  return {
    headers: [...GAME_HEADERS],
    rows: p.items.map((e) => gameRow(e, kept)),
    empty: p.total === 0,
    emptyText: GAMES_EMPTY_TEXT,
    page: p.page, pages: p.pages,
    label: p.total ? `Games ${p.from}–${p.to} of ${p.total}` : '',
    pager: pagerState(p.page, p.pages),
  };
}

const topRow = (e, i, kept) => ({
  id: e.id, rank: String(i + 1), time: formatTime(e.elapsedMs),
  rate: formatRate(attempt(() => bbbvPerSecond(e), null)), efficiency: formatEfficiency(attempt(() => efficiency(e), null)),
  date: formatDateTime(e.endedAt), bbbv: Number.isInteger(e.bbbv) ? String(e.bbbv) : DASH,
  clicks: String(attempt(() => countedClicks(e.clicks), DASH)), watch: kept(e.id),
});

function topList(history, stat, kept, filtered) {
  const rows = attempt(() => topGames(history, stat), []).map((e, i) => topRow(e, i, kept));
  return {
    stat, stats: choices(TOP_STATS, stat), headers: [...TOP_HEADERS], rows,
    empty: rows.length === 0, emptyText: filtered ? TOP_EMPTY_PERIOD : TOP_EMPTY_TEXT,
  };
}

function averagesPanel(history) {
  const avg = attempt(() => averages(history), null);
  const recent = attempt(() => recentWinRate(history), null);
  const columns = AVERAGE_WINDOWS.map((w, i) => {
    const count = avg?.columns[i].count ?? 0;
    const short = w.size !== null && count > 0 && count < w.size;
    return { key: w.key, label: short ? `${WINDOW_LABELS[w.key]} (${count})` : WINDOW_LABELS[w.key] };
  });
  const games = recent?.games ?? 0;
  const detail = games > 0 && games < RECENT_GAMES ? `${games} game${games === 1 ? '' : 's'} so far` : '';
  return {
    columns,
    rows: AVERAGE_ROWS.map(({ stat, label, format }) => ({ stat, label, values: AVERAGE_WINDOWS.map((w, i) => format(avg?.rows[stat][i] ?? null)) })),
    winRates: [
      { key: 'recentWinRate', label: `Win rate, last ${RECENT_GAMES} games`, value: formatWinRate(recent?.winRate ?? null), detail },
      { key: 'recentCompletedWinRate', label: `Win rate, last ${RECENT_GAMES}, completed games`, value: formatWinRate(recent?.completedWinRate ?? null), detail },
    ],
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
  mode: askedMode = null, boardKey: asked = null, notSaved = false, page = 0, replays = null, replayPage = 0, pinnedFirst = false,
  canWatch = false, canOpen = false, replaysNotSaved = false, period: askedPeriod = 'all', outcome: askedOutcome = 'all', tab: askedTab = 'recent',
  topStat: askedStat = 'time', now = new Date(), exportable = false,
} = {}) {
  const period = choiceOf(PERIODS, askedPeriod);
  const outcome = choiceOf(OUTCOME_FILTERS, askedOutcome);
  const tab = choiceOf(GAME_TABS, askedTab);
  const topStat = BEST_STATS.includes(askedStat) ? askedStat : TOP_STATS[0].value;
  const filtered = period !== 'all';
  const { key, mode } = choose(records, asked, askedMode);
  const boards = pickerBoards(records, mode);
  if (!boards.some((b) => b.key === key)) boards.push(entry(parseBoardKey(key)));
  const chosen = boards.find((b) => b.key === key);
  const counters = attempt(() => records.counters(key), EMPTY_COUNTERS);
  const bests = attempt(() => records.bests(key), {});
  const overall = attempt(() => records.overall(mode), EMPTY_COUNTERS);
  const history = attempt(() => records.history(key), []);
  const shown = attempt(() => filterHistory(history, { period }, now), []);
  const listed = attempt(() => filterHistory(shown, { outcome }), []);
  const points = attempt(() => chartPoints(shown), []);
  const won = shown.filter((e) => e.outcome === 'won');
  const steps = attempt(() => bestTimeSteps(shown), []);
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
    counters: counterFigures(counters, attempt(() => ({ winRate: records.winRate(key), completedWinRate: records.completedWinRate(key) }), NO_RATES)),
    overallTitle: RECORDS_MODES.find((m) => m.value === mode).overallTitle,
    overall: counterFigures(overall, attempt(() => ({
      winRate: records.overallWinRate(mode), completedWinRate: records.overallCompletedWinRate(mode),
    }), NO_RATES)),
    notes: [...(notSaved ? [NOTES.notSaved] : []), ...(replaysNotSaved ? [REPLAYS_NOT_SAVED] : [])],
    filters: { period: choices(PERIODS, period), outcome: choices(OUTCOME_FILTERS, outcome), wonOnly: WON_ONLY_TEXT },
    chart: { points, text: chartText(points, filtered ? NO_WON_GAMES_PERIOD : NO_WON_GAMES) },
    bestChart: {
      steps, start: won[0]?.endedAt ?? null, end: won.at(-1)?.endedAt ?? null,
      emptyText: filtered ? NO_BEST_TIME_PERIOD : NO_BEST_TIME, text: bestTimeText(steps, filtered ? NO_BEST_TIME_PERIOD : NO_BEST_TIME),
    },
    averages: averagesPanel(shown),
    tab,
    tabs: choices(GAME_TABS, tab),
    games: gamesList(listed, page, kept),
    top: topList(shown, topStat, kept, filtered),
    exportable: !!exportable,
    replays: { ...replayList(replays, key, { pinnedFirst, canWatch, formatDate: formatDateTime, outcomeLabel, page: replayPage }), canOpen: !!canOpen },
    canWatch,
    canOpen: !!canOpen,
  };
}

export function createRecordsScreen({ records, view, replays = null, router = null, viewPrefs = null, exporter = null, files = null, now = () => new Date() }) {
  let mode = null;
  let board = null;
  let page = 0;
  let replayPage = 0;
  let period = 'all';
  let outcome = 'all';
  let tab = 'recent';
  let topStat = 'time';
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
    content = recordsContent(records, {
      mode, boardKey: board, notSaved, page, replays, replayPage, pinnedFirst, canWatch: canWatch(), canOpen: canWatch() && typeof files?.pick === 'function', replaysNotSaved,
      period, outcome, tab, topStat, now: now(), exportable: !!attempt(() => exporter?.hasGames(), false),
    });
    mode = content.mode;
    board = content.board.key;
    page = content.games.page;
    replayPage = content.replays.page;
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
    /** The screen state the history views are under: { period, outcome, tab, topStat }. */
    get filters() { return { period, outcome, tab, topStat }; },
    show({ mode: m = null, boardKey: key = null } = {}) {
      unsubscribe();
      visit++;
      mode = m;
      board = key;
      page = 0;
      replayPage = 0;
      period = 'all';
      outcome = 'all';
      tab = 'recent';
      topStat = 'time';
      pinnedFirst = !!attempt(() => viewPrefs?.pinnedFirst, false);
      notSaved = !told && !attempt(() => records.available(), false);
      if (notSaved) told = true;
      offs.push(records.onChange(() => draw()));
      if (replays) offs.push(replays.onChange(() => draw()));
      draw();
      checkReplays(visit);
    },
    select(key) { board = key; page = 0; replayPage = 0; draw(); },
    stepBoard(delta) {
      const boards = content?.boards ?? [];
      const at = boards.findIndex((b) => b.key === board);
      const next = boards[at + Math.sign(delta)];
      if (at < 0 || !delta || !next) return false;
      this.select(next.key);
      return true;
    },
    setMode(m) {
      if (!isMode(m) || m === mode) return;
      mode = m;
      board = null;
      page = 0;
      replayPage = 0;
      draw();
    },
    showPage(n) { page = n; draw(); },
    setPeriod(value) { period = choiceOf(PERIODS, value); page = 0; draw(); },
    setOutcome(value) { outcome = choiceOf(OUTCOME_FILTERS, value); page = 0; draw(); },
    setTab(value) { tab = choiceOf(GAME_TABS, value); draw(); },
    setTopStat(value) { topStat = choiceOf(TOP_STATS, value); draw(); },
    /** Saves the export file of `format` ('csv' or 'json') through the exporter; null when there is none or nothing to export. */
    exportFile(format) { return attempt(() => exporter?.save(format) ?? null, null); },
    showReplayPage(n) { replayPage = n; draw(); },
    setPinnedFirst(on) {
      pinnedFirst = !!on;
      replayPage = 0;
      Promise.resolve(attempt(() => viewPrefs?.setPinnedFirst(pinnedFirst), undefined)).catch(() => {});
      draw();
    },
    async togglePin(id) {
      const row = content?.replays.rows.find((r) => r.id === id);
      if (row) await togglePin(replays, row);
    },
    async deleteReplay(id) {
      if (content?.replays.rows.some((r) => r.id === id)) await replays.remove(id);
    },
    closeConfirm() { return attempt(() => view.closeConfirm?.() ?? false, false); },
    /** Whether the view's Delete confirmation is open. */
    get confirmOpen() { return attempt(() => view.isConfirmOpen?.() ?? false, false); },
    watch(id) {
      if (!canWatch()) return;
      const { screen, data } = watchRoute(id, { screen: RECORDS_SCREEN, data: { boardKey: board } });
      router.go(screen, { data });
    },
    /** Saves a listed replay's stored bytes under its file name; resolves once handed to files.save. */
    async downloadReplay(id) {
      const row = content?.replays.rows.find((r) => r.id === id);
      if (!row || !files?.save) return;
      const bytes = await replays.bytes(id);
      if (bytes) files.save(bytes, row.file);
    },
    /** Open replay file: the picked file opens in the replay viewer, Back returning to this board. */
    async openReplayFile() {
      if (!content?.canOpen) return;
      const file = await files.pick();
      if (!file) return;
      router.go(REPLAY_SCREEN, { data: { file, returnTo: { screen: RECORDS_SCREEN, data: { boardKey: board } } } });
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
  root, onSelect, onMode = () => {}, onBack, onPage, onWatch = () => {}, onTogglePin = () => {}, onPinnedFirst = () => {},
  onReplayPage = () => {}, onDelete = () => {}, onPeriod = () => {}, onOutcome = () => {}, onTab = () => {}, onTopStat = () => {},
  onExport = () => {}, onDownload = () => {}, onOpenFile = () => {}, chart = null, bestChart = null,
}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const list = createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst, onPage: onReplayPage, onDelete, onDownload, onOpenFile });
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
  const bestCanvas = $('records-best-chart');
  const best = bestChart ?? createHistoryChart({ canvas: bestCanvas, kind: 'best' });
  const choiceGroups = [
    ['records-period', onPeriod], ['records-outcome', onOutcome], ['records-tabs', onTab], ['records-top-stat', onTopStat],
  ].map(([id, fn]) => {
    const group = $(id);
    bindSegmented(group, { onChange: (value) => fn(value) });
    return group;
  });
  const [periodGroup, outcomeGroup, tabsGroup, statGroup] = choiceGroups;
  const exportActions = bindExportActions(
    { csv: $('records-export-csv'), json: $('records-export-json'), note: $('records-export-note') },
    { onExport: (format) => onExport(format) },
  );
  const pager = bindPager($('records-games-pager'), { onPage: (page) => onPage(page), name: 'games' });
  let pickerKeys = '';
  let unbind = () => {};
  const fill = (prefix, figures) => {
    for (const f of figures) $(`${prefix}-${f.key}`).querySelector('.ui-stat__value').textContent = f.value;
  };
  $('records-back').addEventListener('click', () => onBack());

  const showGames = (games, canWatch) => {
    const doc = root.ownerDocument;
    const body = $('records-games-body');
    const watching = body.contains(doc.activeElement) ? doc.activeElement.dataset.watch : null;
    $('records-games-replay').classList.toggle('hidden', !canWatch);
    const empty = $('records-games-empty');
    empty.textContent = games.emptyText;
    empty.classList.toggle('hidden', !games.empty);
    $('records-games').classList.toggle('hidden', games.empty);
    body.replaceChildren(...games.rows.map((g) => {
      const tr = doc.createElement('tr');
      [g.date, g.outcome, g.time, g.bbbv, g.rate, g.efficiency].forEach((text, i) => {
        const td = doc.createElement('td');
        td.textContent = text;
        td.dataset.label = games.headers[i];
        tr.append(td);
      });
      if (canWatch) {
        const td = doc.createElement('td');
        td.dataset.label = 'Replay';
        if (g.watch) td.append(watchButton(g.watch, `Watch the replay of this ${g.outcome.toLowerCase()} game, ${g.time}`));
        tr.append(td);
      }
      return tr;
    }));
    if (watching) [...body.querySelectorAll('[data-watch]')].find((w) => w.dataset.watch === watching)?.focus({ preventScroll: true });
    $('records-page').textContent = games.label;
    pager.show(games.pager);
  };

  // A segmented choice in the markup, its options checked from the content's list.
  const check = (group, list) => {
    for (const o of group.querySelectorAll('.ui-segmented__option')) {
      const on = list.some((c) => c.value === o.dataset.value && c.selected);
      o.setAttribute('aria-checked', String(on));
      o.tabIndex = on ? 0 : -1;
    }
  };
  const cells = (doc, tr, values, headers) => values.forEach((text, i) => {
    const td = doc.createElement('td');
    td.textContent = text;
    td.dataset.label = headers[i];
    tr.append(td);
  });

  const showTop = (top, canWatch) => {
    const doc = root.ownerDocument;
    const body = $('records-top-body');
    const watching = body.contains(doc.activeElement) ? doc.activeElement.dataset.watch : null;
    check(statGroup, top.stats);
    $('records-top-replay').classList.toggle('hidden', !canWatch);
    const empty = $('records-top-empty');
    empty.textContent = top.emptyText;
    empty.classList.toggle('hidden', !top.empty);
    $('records-top-table').classList.toggle('hidden', top.empty);
    body.replaceChildren(...top.rows.map((g) => {
      const tr = doc.createElement('tr');
      cells(doc, tr, [g.rank, g.time, g.rate, g.efficiency, g.date, g.bbbv, g.clicks], top.headers);
      if (canWatch) {
        const td = doc.createElement('td');
        td.dataset.label = 'Replay';
        if (g.watch) td.append(watchButton(g.watch, `Watch the replay of the number ${g.rank} game, ${g.time}`));
        tr.append(td);
      }
      return tr;
    }));
    if (watching) [...body.querySelectorAll('[data-watch]')].find((w) => w.dataset.watch === watching)?.focus({ preventScroll: true });
  };

  const showAverages = (averages) => {
    const doc = root.ownerDocument;
    averages.columns.forEach((c) => { $(`records-avg-${c.key}`).textContent = c.label; });
    $('records-averages-body').replaceChildren(...averages.rows.map((r) => {
      const tr = doc.createElement('tr');
      const th = doc.createElement('th');
      th.scope = 'row';
      th.textContent = r.label;
      tr.append(th);
      cells(doc, tr, r.values, averages.columns.map((c) => c.label));
      return tr;
    }));
    for (const w of averages.winRates) {
      const el = $(`rec-${w.key}`);
      el.querySelector('.ui-stat__value').textContent = w.value;
      el.querySelector('.ui-stat__detail').textContent = w.detail;
    }
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
      $('records-averages').classList.toggle('hidden', content.empty);
      check(periodGroup, content.filters.period);
      check(outcomeGroup, content.filters.outcome);
      $('records-won-only').textContent = content.filters.wonOnly;
      canvas.setAttribute('aria-label', content.chart.text);
      canvas.textContent = content.chart.text;
      bestCanvas.setAttribute('aria-label', content.bestChart.text);
      bestCanvas.textContent = content.bestChart.text;
      check(tabsGroup, content.tabs);
      $('records-recent').classList.toggle('hidden', content.tab !== 'recent');
      $('records-top').classList.toggle('hidden', content.tab !== 'top');
      showGames(content.games, content.canWatch);
      showTop(content.top, content.canWatch);
      showAverages(content.averages);
      exportActions.show(content.exportable);
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
      if (!content.empty) {
        history.draw(content.chart.points);
        best.draw(content.bestChart);
      }
    },
    closeConfirm: () => list.closeConfirm(),
    isConfirmOpen: () => list.isConfirmOpen(),
    hide() {
      list.hide();
      root.classList.add('hidden');
    },
  };
}
