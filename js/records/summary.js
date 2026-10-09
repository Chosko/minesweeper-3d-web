// The summary record of one played game, its derived stats and best eligibility (no DOM).
//
// buildSummary turns what the rules engine reports at the end of a game — its summary() at a
// win or a loss, or its counts() for a game abandoned after the first click — plus the elapsed
// time, the board identity (js/records/board.js), the seed and the generator version into one
// plain, serialisable record:
//   { id, board, outcome, elapsedMs, bbbv, bbbvSolved, clicks, bbbvPerSecond, efficiency,
//     seed, generatorVersion, endedAt }
// clicks is { reveal, flag, chord }, each { effective, wasted }; endedAt is an ISO 8601 string.
// A game left before its first click (counts with no 3BV yet) produces no summary: null.
//
// The derived stats are pure functions of the record's own fields, so every consumer gets the
// same answer: 3BV/s = 3BV solved ÷ elapsed seconds, efficiency = 3BV solved ÷ counted clicks
// as a percentage. The engine already counts clicks by the reference profile's `clickCounting`
// rule (js/engine/profiles.js), so every click it reports counts, wasted ones included. A zero
// divisor makes a stat null — not available — never 0 or infinity. Only won games are eligible
// for a personal best, and only on a stat that is available.

import { CLICK_KINDS } from '../engine/metrics.js';
import { createBoardIdentity } from './board.js';

export const OUTCOMES = Object.freeze(['won', 'lost', 'abandoned']);
export const BEST_STATS = Object.freeze(['time', 'bbbvPerSecond', 'efficiency']);

const TWO_32 = 2 ** 32;

const count = (name, v, max = Infinity) => {
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
    out[kind] = { effective: count(`clicks.${kind}.effective`, c.effective), wasted: count(`clicks.${kind}.wasted`, c.wasted) };
  }
  return out;
}

// The engine's summary carries the board it was played on; it has to be the board named.
function checkEngineBoard(engine, board) {
  if (engine.mineCount !== undefined && engine.mineCount !== board.mines) {
    throw new RangeError(`the game has ${engine.mineCount} mines, the board ${board.mines}`);
  }
  const dims = engine.dimensions;
  if (dims && dims.width !== undefined && (dims.width !== board.width || dims.height !== board.height)) {
    throw new RangeError(`the game is ${dims.width} × ${dims.height}, the board ${board.width} × ${board.height}`);
  }
}

// { engine, outcome?, elapsedMs, board, seed, generatorVersion, endedAt?, id? } → record or null.
// engine is game.summary() (outcome won or lost) or game.counts() (outcome abandoned); a stated
// outcome must agree with it. endedAt defaults to now, id to a fresh random UUID.
export function buildSummary({ engine, outcome, elapsedMs, board, seed, generatorVersion, endedAt, id } = {}) {
  if (!engine || typeof engine !== 'object') throw new RangeError('summary needs the engine summary or counts');
  const ended = engine.outcome !== undefined;
  if (ended && engine.outcome !== 'won' && engine.outcome !== 'lost') {
    throw new RangeError(`the engine outcome must be won or lost, got ${engine.outcome}`);
  }
  const result = ended ? engine.outcome : 'abandoned';
  if (outcome !== undefined && outcome !== result) {
    throw new RangeError(`outcome ${outcome} does not match the game, which is ${result}`);
  }
  if (!ended && engine.bbbv === null) return null; // left before the first click

  const identity = createBoardIdentity(board);
  checkEngineBoard(engine, identity);
  const safe = identity.width * identity.height - identity.mines;
  const bbbv = count('bbbv', engine.bbbv, safe);
  if (bbbv < 1) throw new RangeError('summary bbbv must be at least 1 on a board with a safe cell');
  const bbbvSolved = count('bbbvSolved', engine.bbbvSolved, bbbv);
  if (result === 'won' && bbbvSolved !== bbbv) {
    throw new RangeError(`a won game has solved its whole 3BV (${bbbv}), got ${bbbvSolved}`);
  }
  const clicks = checkClicks(engine.clicks);
  if (!Number.isInteger(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`summary elapsedMs must be a non-negative integer, got ${elapsedMs}`);
  }
  if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_32) {
    throw new RangeError(`summary seed must be an integer 0 .. 2^32 - 1, got ${seed}`);
  }
  if (!Number.isInteger(generatorVersion) || generatorVersion < 1) {
    throw new RangeError(`summary generatorVersion must be a positive integer, got ${generatorVersion}`);
  }
  const end = endedAt === undefined ? new Date() : endedAt;
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) throw new RangeError('summary endedAt must be a valid Date');
  const recordId = id === undefined ? globalThis.crypto.randomUUID() : id;
  if (typeof recordId !== 'string' || recordId.length === 0) throw new RangeError('summary id must be a non-empty string');

  const summary = {
    id: recordId,
    board: { ...identity },
    outcome: result,
    elapsedMs,
    bbbv,
    bbbvSolved,
    clicks,
    bbbvPerSecond: null,
    efficiency: null,
    seed,
    generatorVersion,
    endedAt: end.toISOString(),
  };
  summary.bbbvPerSecond = bbbvPerSecond(summary);
  summary.efficiency = efficiency(summary);
  return summary;
}

// Every click the engine reported, wasted ones included.
export function countedClicks(clicks) {
  let total = 0;
  for (const kind of CLICK_KINDS) total += clicks[kind].effective + clicks[kind].wasted;
  return total;
}

// 3BV solved per elapsed second; null when no time elapsed.
export function bbbvPerSecond(summary) {
  return summary.elapsedMs === 0 ? null : summary.bbbvSolved / (summary.elapsedMs / 1000);
}

// 3BV solved per counted click, as a percentage; null when no click was counted.
export function efficiency(summary) {
  const clicks = countedClicks(summary.clicks);
  return clicks === 0 ? null : (100 * summary.bbbvSolved) / clicks;
}

const STAT_VALUE = {
  time: (s) => s.elapsedMs,
  bbbvPerSecond,
  efficiency,
};

// True only for a won game whose `stat` (one of BEST_STATS) is available.
export function isBestEligible(summary, stat) {
  if (!BEST_STATS.includes(stat)) throw new RangeError(`unknown best stat "${stat}"`);
  return summary.outcome === 'won' && STAT_VALUE[stat](summary) !== null;
}
