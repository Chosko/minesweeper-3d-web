// The leaderboards (steam-leaderboards), one module for both builds: the Steam build's — the
// submission, its outbox and the Steam submitter, the best cache, the reader and the replay
// fetcher, wired over the desktop host's bridge client — and the web build's local stand-in,
// createLocalLeaderboards (js/leaderboards/local.js), with the same interface (no DOM). The platform
// fills its `leaderboards` slot with one of the two (js/platform/index.js); the results flow's
// end-of-game hand-off calls submit, and the game shell connects the records and the replay
// library, which only the stand-in reads.
//
// createSteamLeaderboards({ client, capabilities, storage, openBlobStore, log? }) → leaderboards
//   client         the platform's client of the desktop host's page bridge.
//   capabilities   the platform's flags and latest Steam state (js/platform/capabilities.js).
//   storage        the platform storage interface; the outbox registers its document on it.
//   openBlobStore  (name) → a blob store opened under that name; the outbox opens one of its own,
//                  never the replay library's, whose start-up clean-up would delete its blobs.
//   log            (...args) for a leaderboard Steam does not have. Default console.warn.
//
//   submit, state, onChange, flush  the submission's (js/leaderboards/submit.js), its eligibility
//                  reading the best cache.
//   entries, standing  the reader's (js/leaderboards/reader.js).
//   replayFor      the replay fetcher's (js/leaderboards/replay-fetch.js).
//   local          false; the stand-in's is true.
//   connect({ records, replays })  nothing: the Steam leaderboards read Steam.
//   started        the submission's start() Promise: the outbox loaded and flushed. It starts at
//                  once; each time Steam reports it is logged on (watchLoggedOn) the best cache
//                  reads what it has not read yet and the outbox flushes.
//   settled()      → Promise that resolves once every submission operation and best cache read
//                  asked for so far has finished.
//
// watchLoggedOn(client) → onLoggedOn(listener) → unsubscribe: listener(state) is called,
//   asynchronously, with the Steam state each time the Steam state (client.steamState() at start-up, then every steamStateChanged) goes
//   from not logged on to logged on — at start-up when Steam is logged on already.

import { createLeaderboardSubmission } from './submit.js';
import { createSteamSubmitter } from './steam-submitter.js';
import { createBestCache } from './best-cache.js';
import { createFinder, createReader } from './reader.js';
import { createReplayFetcher } from './replay-fetch.js';

export { createLocalLeaderboards } from './local.js';

export function watchLoggedOn(client) {
  const listeners = new Set();
  let on = false;
  let changed = false;
  const seen = (state) => {
    const now = state?.loggedOn === true;
    const rising = now && !on;
    on = now;
    if (!rising) return;
    Promise.resolve().then(() => {
      for (const listener of [...listeners]) {
        try { listener(state); } catch (err) { console.error(err); }
      }
    });
  };
  client.on('steamStateChanged', (state) => { changed = true; seen(state); });
  client.steamState().then((state) => { if (!changed) seen(state); }, () => {});
  return (listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
}

export function createSteamLeaderboards({ client, capabilities, storage, openBlobStore, log = console.warn }) {
  let loggedOnAs = null; // the Steam state that last reported logging on
  const playerId = () => capabilities.steamState()?.player?.steamId ?? loggedOnAs?.player?.steamId ?? null;
  const find = createFinder(client);
  const bestCache = createBestCache({ client, find, playerId });
  const onLoggedOn = watchLoggedOn(client);
  onLoggedOn((state) => { loggedOnAs = state; });
  const submission = createLeaderboardSubmission({
    storage,
    openBlobStore,
    submitter: createSteamSubmitter({ client, find, playerId, bestCache, log }),
    knownBest: (leaderboard) => bestCache.get(leaderboard),
    onLoggedOn,
  });
  const reader = createReader({ client, find, capabilities, playerId });
  const fetcher = createReplayFetcher({ client, capabilities });

  let reading = Promise.resolve();
  onLoggedOn(() => { reading = reading.then(() => bestCache.load()); });

  return {
    local: false,
    connect() {},
    submit: (summary, replay) => submission.submit(summary, replay),
    state: (id) => submission.state(id),
    onChange: (fn) => submission.onChange(fn),
    flush: () => submission.flush(),
    entries: (board, scope, range) => reader.entries(board, scope, range),
    standing: (board) => reader.standing(board),
    replayFor: (entry) => fetcher.replayFor(entry),
    started: submission.start(),
    async settled() {
      await submission.settled();
      await reading;
      await submission.settled();
    },
  };
}
