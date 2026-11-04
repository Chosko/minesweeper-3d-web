// The personal records model: bests, counters, history and the comparison (no DOM, no storage).
//
// Two plain, serialisable documents hold the records:
//   history — every recorded summary in play order, in compact form
//             { id, boardKey, outcome, elapsedMs, pauses, pausedMs, bbbv, bbbvSolved, clicks,
//             endedAt, seed?, generatorVersion?, startCell?, daily?, challenge? }; pauses and
//             pausedMs are the summary's pause count and paused time, and an entry or summary
//             without them (recorded before pauses were) reads as 0 and 0; seed, generatorVersion,
//             startCell, daily and challenge are kept when the summary has them, what a board code
//             needs (js/records/board-code.js), so an entry from before them shows no code;
//   records — { boards: { [boardKey]: { board, bests, counters } }, overall: { [mode]: counters } }
//             where overall holds every mode in MODES, bests is
//             { time, bbbvPerSecond, efficiency }, each null or the holding game's
//             { id, value, endedAt }, and counters is { games, wins, currentStreak, longestStreak,
//             completed, currentCompletedStreak, longestCompletedStreak, challenges?, currentDays?,
//             longestDays?, lastDay? } — challenges once a challenge was counted, the days fields
//             on a Daily board only.
// The history is the source of truth: the records are a cache derived from it entry by entry,
// so rebuildRecords(history) always equals the records maintained game by game.
//
// Rules. A best comes from best-eligible won games only (isBestEligible, js/records/summary.js)
// and is replaced only by a strictly better value — lower time, higher 3BV/s or efficiency — so
// a tie keeps the earlier holder. Every game counts in its board's counters and its mode's
// overall counters only — no figure combines two modes (Classic 2D, Hexagon, Triangle, 3D), and a daily game counts on its
// Daily board (a board key `daily:…`) and in its mode's overall figures; a win extends the current
// streak, a loss or an abandoned game ends it. A completed game is one played to a win or a loss: it counts
// in `completed`, and a win extends the completed streak, a loss ends it, while an abandoned game
// (restart, back to menu, a replacing start, a closed page) leaves it as it was. Win rate (wins ÷
// games) and completed win rate (wins ÷ completed games) are derived, never stored, each null with
// nothing to divide by. The comparison of a game is made against the bests that stood before it,
// and recording a summary id already in the history changes nothing and returns that game's
// original comparison, recomputed from the history before it.
//
// upgradeRecords(records) is the records format step that adds modes: from the m1 records, whose
// overall counters held Classic 2D only, and from the records before Hexagon and Triangle. Every
// board and every mode's counters carry over unchanged, and a mode without counters starts at zero. hasCompletedCounters(records) tells whether every board's and
// mode's counters carry the completed games' figures, which records saved before them lack: the
// records store rebuilds such records from the history. Records handed to createRecordsModel
// without them, with no history to derive them from, take them from the reference figures:
// completed games as games, the completed streaks as the streaks, so wins never exceed completed.

import { BEST_STATS, OUTCOMES, isBestEligible, bbbvPerSecond, efficiency } from './summary.js';
import {
  STANDARD_BOARDS, STANDARD_BOARDS_HEX, STANDARD_BOARDS_TRI, PRESETS_3D, MODE_3D, MODE_HEXAGON, MODE_TRIANGLE,
  boardKey, parseBoardKey, standardBoard, preset3D,
} from './board.js';
import { CLICK_KINDS } from '../engine/metrics.js';

export const MODE_CLASSIC_2D = 'classic-2d';
export const MODES = Object.freeze([MODE_CLASSIC_2D, MODE_HEXAGON, MODE_TRIANGLE, MODE_3D]);

// Each mode's named boards, in order, and the function naming a board as one of them.
const NAMED = {
  [MODE_CLASSIC_2D]: [standardBoard, STANDARD_BOARDS],
  [MODE_HEXAGON]: [standardBoard, STANDARD_BOARDS_HEX],
  [MODE_TRIANGLE]: [standardBoard, STANDARD_BOARDS_TRI],
  [MODE_3D]: [preset3D, PRESETS_3D],
};

const STAT_VALUE = { time: (e) => e.elapsedMs, bbbvPerSecond, efficiency };
const BETTER = { time: (a, b) => a < b, bbbvPerSecond: (a, b) => a > b, efficiency: (a, b) => a > b };

const clone = (v) => structuredClone(v);
const emptyBests = () => Object.fromEntries(BEST_STATS.map((stat) => [stat, null]));
const emptyCounters = () => ({
  games: 0, wins: 0, currentStreak: 0, longestStreak: 0, completed: 0, currentCompletedStreak: 0, longestCompletedStreak: 0,
});
const COMPLETED_FIELDS = Object.freeze(['completed', 'currentCompletedStreak', 'longestCompletedStreak']);
const tally = (name, v, max = Infinity) => {
  if (!Number.isInteger(v) || v < 0 || v > max) {
    throw new RangeError(`summary ${name} must be an integer from 0 to ${max}, got ${v}`);
  }
  return v;
};

function checkClicks(clicks) {
  if (!clicks || typeof clicks !== 'object') throw new RangeError('summary clicks must be an object');
  const out = {};
  for (const kind of CLICK_KINDS) {
    const c = clicks[kind];
    if (!c || typeof c !== 'object') throw new RangeError(`summary clicks.${kind} is missing`);
    out[kind] = { effective: tally(`clicks.${kind}.effective`, c.effective), wasted: tally(`clicks.${kind}.wasted`, c.wasted) };
  }
  return out;
}

const rated = (c) => c.games - (c.challenges ?? 0);
const rate = (c) => (rated(c) === 0 ? null : c.wins / rated(c));
const completedRate = (c) => (c.completed === 0 ? null : c.wins / c.completed);

export function emptyRecords() {
  return { boards: {}, overall: Object.fromEntries(MODES.map((mode) => [mode, emptyCounters()])) };
}

// The records format step that adds modes: a copy of `records` with zeroed counters for every mode
// that has none. Anything that is not records is returned as it is.
export function upgradeRecords(records) {
  if (!records || typeof records !== 'object' || !records.overall || typeof records.overall !== 'object') return records;
  const out = clone(records);
  for (const mode of MODES) out.overall[mode] ??= emptyCounters();
  return out;
}

const completeCounters = (c) => c !== null && typeof c === 'object' && COMPLETED_FIELDS.every((k) => Number.isInteger(c[k]));

// Whether every board's and every mode's counters in `records` carry the completed games' figures.
export function hasCompletedCounters(records) {
  return Object.values(records.boards).every((rec) => completeCounters(rec?.counters))
    && Object.values(records.overall).every(completeCounters);
}

// Counters carrying every field: a missing completed figure is seeded from its reference figure.
function filledCounters(c) {
  const out = { ...emptyCounters(), ...c };
  if (!completeCounters(c)) {
    out.completed = out.games;
    out.currentCompletedStreak = out.currentStreak;
    out.longestCompletedStreak = out.longestStreak;
  }
  return out;
}

// A copy of `records` whose counters all carry every field (filledCounters).
function filled(records) {
  const out = clone(records);
  for (const rec of Object.values(out.boards)) rec.counters = filledCounters(rec.counters);
  for (const mode of Object.keys(out.overall)) out.overall[mode] = filledCounters(out.overall[mode]);
  return out;
}

// A history entry or summary's pause count and paused time, 0 and 0 when it has none. Throws a
// RangeError on values that are not whole, non-negative numbers, or more paused time than elapsed.
export function pauseFields({ pauses = 0, pausedMs = 0, elapsedMs }) {
  return { pauses: tally('pauses', pauses), pausedMs: tally('pausedMs', pausedMs, elapsedMs) };
}

// The history entry of a summary built by buildSummary. Throws a RangeError on anything that is
// not a recordable summary.
export function compactSummary(summary) {
  if (!summary || typeof summary !== 'object') throw new RangeError('a summary must be an object');
  const { id, outcome } = summary;
  if (typeof id !== 'string' || id.length === 0) throw new RangeError('a summary id must be a non-empty string');
  if (!OUTCOMES.includes(outcome)) throw new RangeError(`unknown summary outcome "${outcome}"`);
  const bbbv = tally('bbbv', summary.bbbv);
  if (typeof summary.endedAt !== 'string' || Number.isNaN(Date.parse(summary.endedAt))) {
    throw new RangeError(`summary endedAt must be an ISO date string, got ${summary.endedAt}`);
  }
  const elapsedMs = tally('elapsedMs', summary.elapsedMs);
  return {
    id,
    boardKey: boardKey(summary.board),
    outcome,
    elapsedMs,
    ...pauseFields({ ...summary, elapsedMs }),
    bbbv,
    bbbvSolved: tally('bbbvSolved', summary.bbbvSolved, bbbv),
    clicks: checkClicks(summary.clicks),
    endedAt: summary.endedAt,
    ...codeFields(summary),
  };
}

// The fields of a summary a board code needs, those it has.
function codeFields(summary) {
  const out = {};
  if (summary.seed !== undefined) out.seed = tally('seed', summary.seed, 2 ** 32 - 1);
  if (summary.generatorVersion !== undefined) out.generatorVersion = tally('generatorVersion', summary.generatorVersion);
  if (summary.startCell !== undefined) out.startCell = tally('startCell', summary.startCell);
  if (summary.daily !== undefined) {
    if (typeof summary.daily !== 'string' || !/^[0-9]{8}$/.test(summary.daily)) throw new RangeError(`summary daily must be a YYYYMMDD date, got ${summary.daily}`);
    out.daily = summary.daily;
  }
  if (summary.challenge !== undefined) {
    if (summary.challenge !== true) throw new RangeError(`summary challenge must be true when given, got ${summary.challenge}`);
    out.challenge = true;
  }
  return out;
}

// Per stat: the standing best before this entry, the entry's value when it is eligible, the
// difference value − best, and whether the entry sets a new best.
function compare(bests, entry) {
  const out = {};
  for (const stat of BEST_STATS) {
    const best = bests[stat] ? { ...bests[stat] } : null;
    const value = isBestEligible(entry, stat) ? STAT_VALUE[stat](entry) : null;
    out[stat] = {
      best,
      value,
      difference: value !== null && best ? value - best.value : null,
      newBest: value !== null && (best === null || BETTER[stat](value, best.value)),
    };
  }
  return out;
}

function count(counters, outcome, challenge = false) {
  counters.games += 1;
  if (challenge) {
    counters.challenges = (counters.challenges ?? 0) + 1;
    return;
  }
  if (outcome !== 'abandoned') counters.completed += 1;
  if (outcome === 'won') {
    counters.wins += 1;
    counters.currentStreak += 1;
    counters.longestStreak = Math.max(counters.longestStreak, counters.currentStreak);
    counters.currentCompletedStreak += 1;
    counters.longestCompletedStreak = Math.max(counters.longestCompletedStreak, counters.currentCompletedStreak);
  } else {
    counters.currentStreak = 0;
    if (outcome === 'lost') counters.currentCompletedStreak = 0;
  }
}

// Folds one history entry into `records` and returns its comparison.
function apply(records, entry) {
  const key = entry.boardKey;
  const rec = (records.boards[key] ??= { board: { ...parseBoardKey(key) }, bests: emptyBests(), counters: emptyCounters() });
  const comparison = compare(rec.bests, entry);
  for (const stat of BEST_STATS) {
    if (comparison[stat].newBest) rec.bests[stat] = { id: entry.id, value: comparison[stat].value, endedAt: entry.endedAt };
  }
  count(rec.counters, entry.outcome, entry.challenge === true);
  if (rec.board.daily) countDay(rec.counters, entry.daily);
  count((records.overall[rec.board.mode] ??= emptyCounters()), entry.outcome, entry.challenge === true);
  return comparison;
}

// The date after a YYYYMMDD date.
export function nextDay(date) {
  const t = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)) + 1));
  const p = (v, n) => String(v).padStart(n, '0');
  return `${p(t.getUTCFullYear(), 4)}${p(t.getUTCMonth() + 1, 2)}${p(t.getUTCDate(), 2)}`;
}

// A Daily board's days in a row, after one more counted daily game played on `date`.
function countDay(counters, date) {
  counters.currentDays ??= 0;
  counters.longestDays ??= 0;
  counters.lastDay ??= null;
  if (typeof date !== 'string' || (counters.lastDay !== null && date <= counters.lastDay)) return;
  counters.currentDays = counters.lastDay !== null && nextDay(counters.lastDay) === date ? counters.currentDays + 1 : 1;
  counters.longestDays = Math.max(counters.longestDays, counters.currentDays);
  counters.lastDay = date;
}

// A Daily board's days in a row as of `today` (YYYYMMDD): { current, longest, lastDay }. The
// current run stays alive through today while its last day is today or yesterday.
export function daysInARow(counters, today) {
  const last = counters?.lastDay ?? null;
  const alive = last !== null && (last === today || nextDay(last) === today);
  return { current: alive ? counters.currentDays ?? 0 : 0, longest: counters?.longestDays ?? 0, lastDay: last };
}

// The records derived from a history alone.
export function rebuildRecords(history) {
  const records = emptyRecords();
  for (const entry of history) apply(records, entry);
  return records;
}

const keyOf = (board) => (typeof board === 'string' ? boardKey(parseBoardKey(board)) : boardKey(board));

// createRecordsModel({ records?, history? }) — the in-memory records. Given a history without
// records, the records are rebuilt from it. Every query returns a copy.
export function createRecordsModel({ records, history } = {}) {
  const hist = history ? history.map((e) => ({ ...clone(e), ...pauseFields(e) })) : [];
  const recs = records ? filled(records) : rebuildRecords(hist);
  const index = new Map(hist.map((e, i) => [e.id, i]));

  // The comparison the entry at `i` got: against the bests of its board before it.
  function comparisonAt(i) {
    const entry = hist[i];
    const before = emptyRecords();
    for (let j = 0; j < i; j++) if (hist[j].boardKey === entry.boardKey) apply(before, hist[j]);
    return compare(before.boards[entry.boardKey]?.bests ?? emptyBests(), entry);
  }

  const boardRecord = (board) => recs.boards[keyOf(board)];

  return {
    record(summary) {
      const entry = compactSummary(summary);
      if (index.has(entry.id)) return comparisonAt(index.get(entry.id));
      const comparison = apply(recs, entry);
      index.set(entry.id, hist.length);
      hist.push(entry);
      return comparison;
    },

    // The boards played in `mode`: its named boards first — a 2D mode's standard boards in its
    // grid's list order (STANDARD_BOARDS, STANDARD_BOARDS_HEX, STANDARD_BOARDS_TRI), 3D's presets
    // in PRESETS_3D order — each without no-guess before with it; then the mode's Daily board;
    // then custom boards, the most recently played first.
    boardsPlayed(mode = MODE_CLASSIC_2D) {
      const last = new Map();
      hist.forEach((e, i) => last.set(e.boardKey, i));
      const [named, list] = NAMED[mode] ?? [() => null, []];
      const rank = (b) => {
        if (b.daily) return list.length * 2;
        const i = list.indexOf(named(b));
        return i >= 0 ? i * 2 + (b.noGuess ? 1 : 0) : Infinity;
      };
      return Object.entries(recs.boards)
        .filter(([, rec]) => rec.board.mode === mode)
        .map(([key, rec]) => ({ key, board: { ...rec.board }, rank: rank(rec.board), last: last.get(key) ?? -1 }))
        .sort((a, b) => (a.rank !== b.rank ? (a.rank < b.rank ? -1 : 1) : b.last - a.last))
        .map(({ key, board }) => ({ key, board }));
    },

    bests(board) {
      const rec = boardRecord(board);
      return rec ? clone(rec.bests) : emptyBests();
    },

    counters(board) {
      const rec = boardRecord(board);
      return rec ? { ...rec.counters } : emptyCounters();
    },

    winRate(board) {
      return rate(this.counters(board));
    },

    completedWinRate(board) {
      return completedRate(this.counters(board));
    },

    history(board) {
      const key = keyOf(board);
      return clone(hist.filter((e) => e.boardKey === key));
    },

    overall(mode = MODE_CLASSIC_2D) {
      return { ...(recs.overall[mode] ?? emptyCounters()) };
    },

    overallWinRate(mode = MODE_CLASSIC_2D) {
      return rate(this.overall(mode));
    },

    overallCompletedWinRate(mode = MODE_CLASSIC_2D) {
      return completedRate(this.overall(mode));
    },

    // The two documents to persist.
    documents() {
      return { records: clone(recs), history: clone(hist) };
    },
  };
}
