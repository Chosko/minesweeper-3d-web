// The Steam build's achievements (steam-achievements): the end-of-game hook and catch-up over the
// records' history, evaluating each game (js/achievements/evaluate.js) and unlocking through the
// desktop host's bridge client (js/achievements/unlock.js), no DOM. The platform fills its
// `achievements` slot with this (js/platform/index.js); the results flow's end-of-game hand-off
// calls onGameFinished, and the shell starts catch-up once the records have loaded.
//
// createSteamAchievements({ client, capabilities, log? }) → achievements
//   client        the platform's client of the desktop host's page bridge.
//   capabilities  the platform's live flags (js/platform/capabilities.js): with `achievements` off —
//                 Steam unavailable, or the adapter without the capability — nothing is attempted.
//   log           (...args) for a failed request or a game that cannot be evaluated. Default
//                 console.warn.
//
//   onGameFinished(summary)  returns at once; the achievements the game earns are unlocked in the
//                 background.
//   start({ history })  history() → the records' history entries, every game in play order. Runs
//                 catch-up now, again each time the flags turn achievements from off to on, and each
//                 time Steam reports it is logged on (watchLoggedOn, js/leaderboards/index.js) — at
//                 start-up when it is logged on already, which can add a second, idempotent run to
//                 the first.
//   catchUp()     → Promise: evaluates every game of the history and unlocks what is not set yet.
//                 Idempotent, and nothing of its own is stored: a failed set or store is found again
//                 by the next catch-up. Nothing before start(). A catch-up asked for while another
//                 waits its turn is that one.
//   settled()     → Promise that resolves once every unlock asked for so far has finished.
//
// Unlocks run one after another, never interleaved. Nothing here ever throws into its caller.

import { earned } from './evaluate.js';
import { createUnlocker } from './unlock.js';
import { watchLoggedOn } from '../leaderboards/index.js';

export function createSteamAchievements({ client, capabilities, log = console.warn }) {
  const unlocker = createUnlocker({ client, log });
  let queue = Promise.resolve();
  let history = null;
  let waiting = null; // the catch-up queued and not started yet

  const enqueue = (job) => {
    queue = queue.then(job).catch((err) => log('achievements:', err));
    return queue;
  };

  function earnedBy(summary) {
    try {
      return earned(summary);
    } catch (err) {
      log('achievements: a game that cannot be evaluated', summary?.id, err);
      return [];
    }
  }

  const achievements = {
    onGameFinished(summary) {
      if (!capabilities.achievements) return;
      const names = earnedBy(summary);
      if (names.length > 0) enqueue(() => unlocker.unlock(names));
    },

    catchUp() {
      if (!capabilities.achievements || !history) return Promise.resolve();
      waiting ??= enqueue(() => {
        waiting = null;
        if (!capabilities.achievements) return undefined;
        return unlocker.unlock(history().flatMap(earnedBy));
      });
      return waiting;
    },

    start({ history: source }) {
      history = source;
      let on = capabilities.achievements;
      capabilities.subscribe((flags) => {
        const rising = flags.achievements && !on;
        on = flags.achievements;
        if (rising) achievements.catchUp();
      });
      watchLoggedOn(client)(() => { achievements.catchUp(); });
      achievements.catchUp();
    },

    settled: () => queue,
  };
  return achievements;
}
