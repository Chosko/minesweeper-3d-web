// The web build's local leaderboards (steam-leaderboards' local stand-in): the Steam leaderboards'
// interface over the player's own won games on a catalogue board, from the personal records'
// history, ranked by time and linked to the replays the replay library keeps (no DOM). The platform
// fills its `leaderboards` slot with this when the desktop host's bridge is absent
// (js/platform/index.js).
//
// createLocalLeaderboards({ records?, replays?, playerName? }) → leaderboards
//   records     { history(board) } — the records store's history query (js/records/store.js).
//   replays     { has(id), bytes(id) } — the replay library's (js/replay/library.js).
//   playerName  the name every entry carries. Default LOCAL_PLAYER.name.
//   Both sources may come later, through connect(); until then every query rejects
//   { reason: 'unavailable' }.
//
//   local       true; the Steam leaderboards' is false.
//   connect({ records, replays })  hands the stand-in its two sources.
//   entries(board, scope, range) → Promise of { total, entries }, as the Steam reader's
//               (js/leaderboards/reader.js): the board's won games in the records' one ranking by
//               time (rankedGames, js/records/stats.js — no challenge, the earlier game first on a
//               tie), so it never disagrees with the Top 10; ranked from 1, each
//               { leaderboard, rank, playerId: LOCAL_PLAYER.id, playerName, score (elapsed ms),
//               details, replay } — details { detailsVersion, replayFormatVersion: null,
//               rulesVersion: null, bbbv, bbbvSolved, clicks }, which statsOf
//               (js/leaderboards/details.js) reads, and replay the summary id when the library
//               keeps the game's replay, else null. Every scope ('global', 'friends', 'around')
//               returns that list; 'global' keeps to its range { start, end } of ranks when given.
//               `total` is the whole list's length. The history and the library are read at each
//               query.
//   standing(board) → Promise of { score, globalRank, friendsRank: null } — the best time and its
//               local rank — or null without a win on the board.
//   Queries reject with { reason }: 'no-leaderboard' for a board outside the catalogue, 'invalid'
//               for an unknown scope, 'unavailable' before connect, 'failed' when the history cannot
//               be read. Nothing throws.
//   replayFor(entry) → Promise of { ok: true, replay } — the library's replay, decoded — or
//               { ok: false, reason }: REPLAY_REASONS' no replay attached (none linked, or the
//               library no longer keeps it), download failed (the store cannot read) or unreadable.
//   submit(summary, replay) → false: nothing is submitted, since the history already holds the
//               game; the summary id's state becomes not eligible (js/leaderboards/state.js).
//   state(id), onChange(fn)  that state and its change notification.
//   flush(), settled()  → resolved Promises; started, a resolved Promise.

import { leaderboardFor } from './catalogue.js';
import { DETAILS_FORMAT_VERSION } from './details.js';
import { REPLAY_REASONS } from './replay-fetch.js';
import { SUBMISSION, createSubmissionState } from './state.js';
import { decodeReplay } from '../replay/format.js';
import { rankedGames } from '../records/stats.js';

export const LOCAL_PLAYER = Object.freeze({ id: 'local', name: 'You' });

const SCOPES = new Set(['global', 'friends', 'around']);

const refusal = (reason) => Promise.reject(Object.freeze({ reason }));
const no = (reason) => ({ ok: false, reason });
const inRange = (range) => (e) => !Number.isInteger(range?.start) || !Number.isInteger(range?.end)
  || (e.rank >= range.start && e.rank <= range.end);

const detailsOf = (e) => Object.freeze({
  detailsVersion: DETAILS_FORMAT_VERSION,
  replayFormatVersion: null,
  rulesVersion: null,
  bbbv: e.bbbv,
  bbbvSolved: e.bbbvSolved,
  clicks: structuredClone(e.clicks),
});

export function createLocalLeaderboards({ records = null, replays = null, playerName = LOCAL_PLAYER.name } = {}) {
  const sources = { records, replays };
  const submissions = createSubmissionState();

  // The board's ranked list, or a refusal.
  async function ranked(board) {
    const leaderboard = leaderboardFor(board);
    if (leaderboard === null) return refusal('no-leaderboard');
    if (!sources.records) return refusal('unavailable');
    let wins;
    try {
      wins = rankedGames(sources.records.history(board), 'time');
    } catch {
      return refusal('failed');
    }
    return wins.map((e, i) => Object.freeze({
      leaderboard,
      rank: i + 1,
      playerId: LOCAL_PLAYER.id,
      playerName,
      score: e.elapsedMs,
      details: detailsOf(e),
      replay: sources.replays?.has(e.id) ? e.id : null,
    }));
  }

  return {
    local: true,
    connect({ records: r = null, replays: l = null } = {}) {
      sources.records = r;
      sources.replays = l;
    },
    async entries(board, scope, range) {
      if (!SCOPES.has(scope)) return refusal(leaderboardFor(board) === null ? 'no-leaderboard' : 'invalid');
      const list = await ranked(board);
      return { total: list.length, entries: scope === 'global' ? list.filter(inRange(range)) : list };
    },
    async standing(board) {
      const [best] = await ranked(board);
      return best ? { score: best.score, globalRank: best.rank, friendsRank: null } : null;
    },
    async replayFor(entry) {
      const id = entry?.replay;
      if (id == null || !sources.replays) return no(REPLAY_REASONS.NO_REPLAY);
      let bytes;
      try {
        bytes = await sources.replays.bytes(id);
      } catch {
        return no(REPLAY_REASONS.DOWNLOAD_FAILED);
      }
      if (bytes === undefined) return no(REPLAY_REASONS.NO_REPLAY);
      try {
        return { ok: true, replay: decodeReplay(bytes) };
      } catch {
        return no(REPLAY_REASONS.UNREADABLE);
      }
    },
    submit(summary) {
      const id = summary?.id;
      if (typeof id === 'string' && id !== '') submissions.set(id, { status: SUBMISSION.NOT_ELIGIBLE });
      return false;
    },
    state: (id) => submissions.get(id),
    onChange: (fn) => submissions.onChange(fn),
    flush: () => Promise.resolve(),
    started: Promise.resolve(),
    settled: () => Promise.resolve(),
  };
}
