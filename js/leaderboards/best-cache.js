// The player's best score on each Steam leaderboard, held in memory for the session (no DOM).
// Steam is its source of truth: it is read once Steam is logged on and updated after each upload.
// Eligibility reads it (js/leaderboards/eligibility.js, through submit.js' knownBest).
//
// createBestCache({ client, find, playerId, leaderboards? }) → { get, record, load }
//   find          the shared leaderboard finder (js/leaderboards/reader.js createFinder).
//   playerId      () → the player's Steam id, or null.
//   leaderboards  the names read; default every catalogue leaderboard (js/leaderboards/catalogue.js).
//
//   get(name)           → the player's best score on it, or null when none is known.
//   record(name, score) → keeps the lower of the known best and score.
//   load()              → Promise; reads the player's entry on each leaderboard not read yet, one
//                         after another — a leaderboard whose read fails is read again on the next
//                         load. Without a player id it reads nothing. Never rejects.

import { CATALOGUE } from './catalogue.js';

export function createBestCache({ client, find, playerId = () => null, leaderboards = CATALOGUE.map((c) => c.name) }) {
  const best = new Map();
  const read = new Set();

  function record(name, score) {
    if (!Number.isInteger(score)) return;
    const known = best.get(name);
    if (known === undefined || score < known) best.set(name, score);
  }

  async function readOne(name, me) {
    try {
      const handle = await find(name);
      const result = await client.downloadScores(handle, { scope: 'players', players: [me] });
      const own = (result?.entries ?? []).find((e) => e.steamId === me);
      if (own) record(name, own.score);
      read.add(name);
    } catch {
      // read again on the next load
    }
  }

  return {
    get: (name) => best.get(name) ?? null,
    record,
    async load() {
      const me = playerId();
      if (!me) return;
      for (const name of leaderboards) if (!read.has(name)) await readOne(name, me);
    },
  };
}
