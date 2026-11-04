// The Steam submitter: sends one outbox entry to its Steam leaderboard through the desktop host's
// bridge client (no DOM). It is the submitter js/leaderboards/submit.js flushes the outbox through.
//
// createSteamSubmitter({ client, find, playerId, bestCache?, log? }) → { submit }
//   find       the shared leaderboard finder (js/leaderboards/reader.js createFinder).
//   playerId   () → the player's Steam id, or null.
//   bestCache  the player's best per leaderboard (js/leaderboards/best-cache.js), or null.
//   log        (...args), told once per leaderboard Steam does not have. Default console.warn.
//
//   submit({ leaderboard, id, score, details, replay }) → Promise of
//     { result: 'submitted', rankBefore, rankAfter } | { result: 'dropped', reason }
//     | { result: 'retry', reason }; never rejects.
//   A score the known best already beats is dropped ('beaten') before anything is written.
//   Otherwise: the replay bytes are written to Steam remote storage under the leaderboard's file
//   name (replayFileName) and shared, then the score is uploaded with its details, keeping the best.
//   When Steam reports the score improved, the shared file is attached to the entry — an improved
//   upload clears the entry's attachment, so every one is followed by an attach — and the answer is
//   submitted with Steam's global rank before (null on a first entry) and after. When it did not
//   improve, the player's entry is read: the same score with no file attached is this game's
//   upload whose attach failed, so the file is attached now and the answer is submitted at that
//   rank; the same score with a file is submitted already; a better score drops the game
//   ('beaten'). A leaderboard Steam does not have ('not-found') drops it and is logged once; any
//   other failure ('offline', 'failed', 'unavailable', ...) is retry with the typed error's code.
//   Replacing the shared file under the same name is safe: each share gets a new handle, and an
//   earlier handle keeps returning the earlier file.

import { reasonOf } from './reader.js';

/** The remote storage file name a leaderboard's replay is shared under. */
export const replayFileName = (leaderboard) => `${leaderboard}.msrp`;

export function createSteamSubmitter({ client, find, playerId = () => null, bestCache = null, log = console.warn }) {
  const logged = new Set();

  async function ownEntry(handle) {
    const me = playerId();
    if (!me) return null;
    const result = await client.downloadScores(handle, { scope: 'players', players: [me] });
    return (result?.entries ?? []).find((e) => e.steamId === me) ?? null;
  }

  async function send({ leaderboard, score, details, replay }) {
    const handle = await find(leaderboard);
    const file = await client.writeAndShare(replayFileName(leaderboard), replay);
    const upload = await client.uploadScore(handle, score, details);
    if (upload?.changed) {
      bestCache?.record(leaderboard, score);
      await client.attachToLeaderboard(handle, file);
      return { result: 'submitted', rankBefore: upload.rankBefore ?? null, rankAfter: upload.rankAfter ?? null };
    }
    const own = await ownEntry(handle);
    if (own) bestCache?.record(leaderboard, own.score);
    if (own?.score === score) {
      if (own.fileHandle == null) await client.attachToLeaderboard(handle, file);
      return { result: 'submitted', rankBefore: own.rank, rankAfter: own.rank };
    }
    return { result: 'dropped', reason: 'beaten' };
  }

  return {
    async submit(entry) {
      const best = bestCache?.get(entry.leaderboard) ?? null;
      if (best !== null && best < entry.score) return { result: 'dropped', reason: 'beaten' };
      try {
        return await send(entry);
      } catch (error) {
        const reason = reasonOf(error);
        if (reason !== 'not-found') return { result: 'retry', reason };
        if (!logged.has(entry.leaderboard)) {
          logged.add(entry.leaderboard);
          log(`Steam has no leaderboard ${entry.leaderboard}; its submissions are dropped`);
        }
        return { result: 'dropped', reason };
      }
    },
  };
}
