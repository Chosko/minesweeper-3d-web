// The Steam leaderboard reader: a leaderboard's entries in a scope and the player's own standing,
// read through the desktop host's bridge client (no DOM).
//
// createFinder(client) → find(name) → Promise of the leaderboard's handle (client.findLeaderboard),
//   found once per name and shared by every later call; a failed find is asked again next time.
//   Rejects with the bridge's typed error { code, message }.
// reasonOf(error) → the typed error's code ('unavailable', 'offline', 'not-found', 'invalid',
//   'failed'), 'failed' for anything else.
//
// createReader({ client, find, capabilities, playerId }) → { entries, standing }
//   capabilities  the platform's flags (js/platform/capabilities.js); with `leaderboards` off every
//                 query rejects with { reason: 'unavailable' } and asks nothing.
//   playerId      () → the player's Steam id, or null.
//   entries(board, scope, range) → Promise of { total, entries } for a board identity: scope
//                 'global' (range { start, end }, ranks from 1), 'friends' (range ignored) or
//                 'around' (range { start, end } around the player's rank, negative before it);
//                 `total` is the leaderboard's entry count, each entry { leaderboard, rank,
//                 playerId, playerName, score, details, replay } — details decoded
//                 (js/leaderboards/details.js, null when unreadable), playerName null when the
//                 names could not be read, replay the attached file's handle or null.
//   standing(board) → Promise of { score, globalRank, friendsRank } for the player, or null when the
//                 player has no entry (or no Steam id is known).
// Queries reject with { reason }: 'no-leaderboard' for a board outside the catalogue, else the
// typed error's code (reasonOf). Nothing throws.

import { leaderboardFor } from './catalogue.js';
import { decodeDetails } from './details.js';

const FRIENDS_RANGE = Object.freeze({ start: 1, end: 100 });
const NAMES_PER_REQUEST = 100; // the ids one identity.names request takes (desktop/bridge.js LIMITS.players)

export function reasonOf(error) {
  return typeof error?.code === 'string' ? error.code : 'failed';
}

export function createFinder(client) {
  const handles = new Map(); // name → Promise of its handle
  return function find(name) {
    if (!handles.has(name)) {
      const found = Promise.resolve().then(() => client.findLeaderboard(name));
      handles.set(name, found);
      found.catch(() => { if (handles.get(name) === found) handles.delete(name); });
    }
    return handles.get(name);
  };
}

const refusal = (reason) => Promise.reject(Object.freeze({ reason }));

export function createReader({ client, find, capabilities, playerId = () => null }) {
  async function names(ids) {
    if (ids.length === 0) return {};
    try {
      const chunks = [];
      for (let i = 0; i < ids.length; i += NAMES_PER_REQUEST) chunks.push(ids.slice(i, i + NAMES_PER_REQUEST));
      const maps = await Promise.all(chunks.map((chunk) => client.personaNames(chunk)));
      return maps.some((m) => m == null) ? null : Object.assign({}, ...maps);
    } catch {
      return null;
    }
  }

  async function ask(board, query) {
    const leaderboard = leaderboardFor(board);
    if (!capabilities.leaderboards) return refusal('unavailable');
    if (leaderboard === null) return refusal('no-leaderboard');
    try {
      const handle = await find(leaderboard);
      const result = await client.downloadScores(handle, query);
      return { leaderboard, total: Number(result?.total ?? 0), rows: [...(result?.entries ?? [])].sort((a, b) => a.rank - b.rank) };
    } catch (error) {
      return refusal(reasonOf(error));
    }
  }

  return {
    async entries(board, scope, range) {
      const { start, end } = scope === 'friends' ? FRIENDS_RANGE : range ?? {};
      const { leaderboard, total, rows } = await ask(board, { scope, start, end });
      const known = await names([...new Set(rows.map((e) => e.steamId))]);
      return {
        total,
        entries: rows.map((e) => ({
          leaderboard,
          rank: e.rank,
          playerId: e.steamId,
          playerName: known === null ? null : known[e.steamId] ?? null,
          score: e.score,
          details: decodeDetails(e.details),
          replay: e.fileHandle ?? null,
        })),
      };
    },
    async standing(board) {
      if (!capabilities.leaderboards) return refusal('unavailable');
      const me = playerId();
      if (!me) return null;
      const own = (await ask(board, { scope: 'players', players: [me] })).rows.find((e) => e.steamId === me);
      if (!own) return null;
      const friends = (await ask(board, { scope: 'friends', ...FRIENDS_RANGE })).rows;
      const at = friends.findIndex((e) => e.steamId === me);
      return { score: own.score, globalRank: own.rank, friendsRank: at === -1 ? null : at + 1 };
    },
  };
}
