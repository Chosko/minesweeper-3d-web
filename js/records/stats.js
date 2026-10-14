// Records stats: the figures a board's history yields beyond the records themselves — the one
// ranking of its won games, its Top 10, the averages over its last won games, its recent win rate,
// the period and outcome filters, and the best time's progression. Pure and DOM-free: everything is
// derived from the records model's history entries (in play order) through js/records/summary.js's
// derivations on every call, and stored nowhere.
//
// statValue(entry, stat) → the entry's value of one of BEST_STATS (time is elapsedMs), or null.
// rankedGames(history, stat) → the won games whose stat is available (isBestEligible), best first:
//   lower time, higher 3BV/s, higher efficiency; a tie goes to the earlier game, the records' tie
//   rule, so rank 1 by each stat is the game holding that best.
// gameRank(history, summary, stat = 'time') → { position, of } of a game in that ranking, of
//   counting the board's won games, this one included (a game missing from the history counts
//   itself as the latest); null when the game does not rank (a loss, an unavailable stat). The
//   results screen's "#n of N on this board" reads it, so it and the Top 10 by time never disagree.
// topGames(history, stat, size = TOP_SIZE) → the first size games of rankedGames.
// AVERAGE_WINDOWS — the averages' columns: the last 10, the last 50 and all won games.
// averages(history) → { won, columns: [{ key, size, count }], rows: { time, bbbvPerSecond,
//   efficiency } }: each row the mean of that stat over each column's last won games (count of
//   them, fewer than size when there are fewer), null where no game has the stat.
// recentWinRate(history, size = RECENT_GAMES) → { games, wins, completed, winRate, completedWinRate }
//   over the last size games of every outcome: winRate is wins ÷ games, completedWinRate wins ÷ the
//   games played to a win or a loss, each null with nothing to divide by.
// PERIODS, OUTCOME_FILTERS — the filters' choices, { value, label }, the first of each the default.
// periodStart(period, now) → the earliest end time (ms) the period keeps, or -Infinity for all time:
//   12 months, 30 days or 7 days back from now.
// filterHistory(history, { period, outcome }, now = new Date()) → the entries that ended in the
//   period and, unless outcome is 'all', have that outcome; an unknown choice keeps everything.
// bestTimeSteps(history) → [{ id, endedAt, elapsedMs }]: each won game that set a new standing best
//   time, in play order — a strictly lower time, so a tie keeps the earlier best.

import { BEST_STATS, OUTCOMES, bbbvPerSecond, efficiency, isBestEligible } from './summary.js';

export const TOP_SIZE = 10;
export const RECENT_GAMES = 50;
export const AVERAGE_WINDOWS = Object.freeze([
  Object.freeze({ key: 'last10', size: 10 }),
  Object.freeze({ key: 'last50', size: 50 }),
  Object.freeze({ key: 'all', size: null }),
]);
export const PERIODS = Object.freeze([
  Object.freeze({ value: 'all', label: 'All time' }),
  Object.freeze({ value: '12m', label: '12 months' }),
  Object.freeze({ value: '30d', label: '30 days' }),
  Object.freeze({ value: '7d', label: '7 days' }),
]);
export const OUTCOME_FILTERS = Object.freeze([
  Object.freeze({ value: 'all', label: 'All' }),
  Object.freeze({ value: 'won', label: 'Won' }),
  Object.freeze({ value: 'lost', label: 'Lost' }),
  Object.freeze({ value: 'abandoned', label: 'Abandoned' }),
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const VALUE = { time: (e) => e.elapsedMs, bbbvPerSecond, efficiency };
const LOWER_IS_BETTER = { time: true, bbbvPerSecond: false, efficiency: false };
const isWon = (e) => e?.outcome === 'won';

export function statValue(entry, stat) {
  if (!BEST_STATS.includes(stat)) throw new RangeError(`unknown best stat "${stat}"`);
  try {
    const v = VALUE[stat](entry);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

const eligible = (e, stat) => {
  try { return isBestEligible(e, stat) && statValue(e, stat) !== null; } catch { return false; }
};

export function rankedGames(history, stat) {
  if (!BEST_STATS.includes(stat)) throw new RangeError(`unknown best stat "${stat}"`);
  const sign = LOWER_IS_BETTER[stat] ? 1 : -1;
  return history
    .map((e, i) => ({ e, i, v: eligible(e, stat) ? statValue(e, stat) : null }))
    .filter((x) => x.v !== null)
    .sort((a, b) => (a.v !== b.v ? sign * (a.v - b.v) : a.i - b.i))
    .map((x) => x.e);
}

export function gameRank(history, summary, stat = 'time') {
  if (!Array.isArray(history) || !isWon(summary)) return null;
  const list = history.some((e) => e?.id === summary.id) ? history : [...history, summary];
  const position = rankedGames(list, stat).findIndex((e) => e.id === summary.id);
  if (position < 0) return null;
  return { position: position + 1, of: list.filter(isWon).length };
}

export function topGames(history, stat, size = TOP_SIZE) {
  return rankedGames(history, stat).slice(0, size);
}

const mean = (entries, stat) => {
  const values = entries.map((e) => statValue(e, stat)).filter((v) => v !== null);
  return values.length ? values.reduce((a, v) => a + v, 0) / values.length : null;
};

export function averages(history) {
  const won = history.filter(isWon);
  const windows = AVERAGE_WINDOWS.map((w) => ({ ...w, games: w.size === null ? won : won.slice(-w.size) }));
  return {
    won: won.length,
    columns: windows.map(({ key, size, games }) => ({ key, size, count: games.length })),
    rows: Object.fromEntries(BEST_STATS.map((stat) => [stat, windows.map((w) => mean(w.games, stat))])),
  };
}

export function recentWinRate(history, size = RECENT_GAMES) {
  const recent = history.slice(-size);
  const wins = recent.filter(isWon).length;
  const completed = recent.filter((e) => e?.outcome === 'won' || e?.outcome === 'lost').length;
  return {
    games: recent.length, wins, completed,
    winRate: recent.length ? wins / recent.length : null,
    completedWinRate: completed ? wins / completed : null,
  };
}

export function periodStart(period, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  if (period === '7d') return t - 7 * DAY_MS;
  if (period === '30d') return t - 30 * DAY_MS;
  if (period === '12m') {
    const d = new Date(t);
    d.setMonth(d.getMonth() - 12);
    return d.getTime();
  }
  return -Infinity;
}

export function filterHistory(history, { period = 'all', outcome = 'all' } = {}, now = new Date()) {
  const from = periodStart(period, now);
  const keepOutcome = OUTCOMES.includes(outcome) ? (e) => e?.outcome === outcome : () => true;
  return history.filter((e) => {
    if (!keepOutcome(e)) return false;
    if (from === -Infinity) return true;
    const end = Date.parse(e?.endedAt);
    return Number.isFinite(end) && end >= from;
  });
}

export function bestTimeSteps(history) {
  const steps = [];
  let best = Infinity;
  for (const e of history) {
    if (!eligible(e, 'time') || !(e.elapsedMs < best)) continue;
    best = e.elapsedMs;
    steps.push({ id: e.id, endedAt: e.endedAt, elapsedMs: e.elapsedMs });
  }
  return steps;
}
