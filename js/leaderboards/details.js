// A leaderboard entry's score and details: their encoding, the decoder and the stats derived from
// them (no DOM).
//
// The score is the game's elapsed time in integer milliseconds, ranked ascending.
// The details are the integer array uploaded with it (details format DETAILS_FORMAT_VERSION):
//   [details format version, replay format version, rules version, 3BV, 3BV solved,
//    reveal effective, reveal wasted, flag effective, flag wasted, chord effective, chord wasted]
// — the clicks by kind in CLICK_KINDS order — so a screen derives 3BV/s and efficiency from an
// entry without downloading its replay, with game-summary's own derivations (js/records/summary.js).
// Steam stores each value as a signed 32-bit integer.
//
// encodeDetails throws a RangeError on fields it cannot write; decodeDetails returns null for
// details it cannot read — another player's entry is outside data — and ignores values after the
// last field, which a details array may be padded with.

import { CLICK_KINDS } from '../engine/metrics.js';
import { REPLAY_FORMAT_VERSION } from '../replay/format.js';
import { bbbvPerSecond, efficiency } from '../records/summary.js';

export const DETAILS_FORMAT_VERSION = 1;

const INT32_MAX = 2 ** 31 - 1;
const LENGTH = 5 + 2 * CLICK_KINDS.length;

const isCount = (v, min = 0) => Number.isInteger(v) && v >= min && v <= INT32_MAX;

const field = (name, v, min = 0) => {
  if (!isCount(v, min)) throw new RangeError(`details ${name} must be an integer from ${min} to ${INT32_MAX}, got ${v}`);
  return v;
};

// The score of a summary: its elapsed time in ms.
export function scoreOf(summary) {
  return summary.elapsedMs;
}

// { replayFormatVersion, rulesVersion, bbbv, bbbvSolved, clicks } → the details array.
export function encodeDetails({ replayFormatVersion, rulesVersion, bbbv, bbbvSolved, clicks } = {}) {
  const out = [
    DETAILS_FORMAT_VERSION, field('replayFormatVersion', replayFormatVersion, 1), field('rulesVersion', rulesVersion, 1),
    field('bbbv', bbbv), field('bbbvSolved', bbbvSolved),
  ];
  if (bbbvSolved > bbbv) throw new RangeError(`details bbbvSolved ${bbbvSolved} is above its bbbv ${bbbv}`);
  if (!clicks || typeof clicks !== 'object') throw new RangeError('details clicks must be an object');
  for (const kind of CLICK_KINDS) {
    const c = clicks[kind];
    out.push(field(`clicks.${kind}.effective`, c?.effective), field(`clicks.${kind}.wasted`, c?.wasted));
  }
  return out;
}

// The details of a summary's game: its 3BV and clicks, the replay format version (the current one
// unless given) and the rules version its replay was played under.
export function detailsFor(summary, { rulesVersion, replayFormatVersion = REPLAY_FORMAT_VERSION } = {}) {
  return encodeDetails({
    replayFormatVersion, rulesVersion, bbbv: summary.bbbv, bbbvSolved: summary.bbbvSolved, clicks: summary.clicks,
  });
}

// The details array → { detailsVersion, replayFormatVersion, rulesVersion, bbbv, bbbvSolved, clicks },
// or null when it is not details of a known format.
export function decodeDetails(details) {
  if (!Array.isArray(details) && !ArrayBuffer.isView(details)) return null;
  if (details.length < LENGTH || details[0] !== DETAILS_FORMAT_VERSION) return null;
  const v = Array.from(details.slice(0, LENGTH));
  if (!isCount(v[1], 1) || !isCount(v[2], 1) || !v.slice(3).every((x) => isCount(x)) || v[4] > v[3]) return null;
  const clicks = {};
  CLICK_KINDS.forEach((kind, k) => { clicks[kind] = { effective: v[5 + 2 * k], wasted: v[6 + 2 * k] }; });
  return { detailsVersion: v[0], replayFormatVersion: v[1], rulesVersion: v[2], bbbv: v[3], bbbvSolved: v[4], clicks };
}

// 3BV/s and efficiency of an entry from its score and decoded details, each null when not available
// — both null for details the decoder could not read (null).
export function statsOf(score, details) {
  if (!details) return { bbbvPerSecond: null, efficiency: null };
  const record = { elapsedMs: score, bbbvSolved: details.bbbvSolved, clicks: details.clicks };
  return { bbbvPerSecond: bbbvPerSecond(record), efficiency: efficiency(record) };
}
