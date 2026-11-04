// Leaderboard eligibility: which finished games are submitted to Steam (no DOM).
//
// eligible(summary, replay, knownBest) is true only for a won game (js/records/summary.js) on a
// catalogue board (js/leaderboards/catalogue.js) — never a challenge, a game started from a board
// code, which no personal best counts either — with its sealed replay (js/replay/recorder.js'
// { blob, listing }, the listing naming the summary's id), whose time beats the player's known
// Steam best for that board, or with no known best (null or undefined). An equal time does not
// beat it: Steam keeps the earlier entry. Anything malformed is not eligible; nothing throws.

import { leaderboardFor } from './catalogue.js';

const sealed = (replay, summary) => replay?.blob instanceof Uint8Array && replay.blob.length > 0
  && replay.listing?.id === summary.id;

const beats = (elapsedMs, knownBest) => {
  if (knownBest === null || knownBest === undefined) return true;
  return Number.isInteger(knownBest) && elapsedMs < knownBest;
};

export function eligible(summary, replay, knownBest) {
  if (!summary || typeof summary !== 'object') return false;
  if (summary.outcome !== 'won' || summary.challenge) return false;
  if (!Number.isInteger(summary.elapsedMs) || summary.elapsedMs < 0) return false;
  if (leaderboardFor(summary.board) === null) return false;
  return sealed(replay, summary) && beats(summary.elapsedMs, knownBest);
}
