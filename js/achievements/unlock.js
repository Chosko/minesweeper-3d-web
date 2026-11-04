// The achievement unlocker: sets on Steam the achievements not set yet, then stores (no DOM).
//
// createUnlocker({ client, log? }) → { unlock(names) }
//   client  the platform's client of the desktop host's page bridge: achievementsSet(names) → the
//           names set, setAchievement(name), storeStats().
//   log     (...args) for a failed request. Default console.warn.
//
//   unlock(names) → Promise, never rejecting. Asks which of the names are set, sets the rest one by
//           one and stores once when any was set. Steam shows its own notification for each new
//           unlock; offline, the Steam client keeps the unlock and syncs it later. A failed read
//           sets nothing and a failed set leaves its name unset, both for the next catch-up to
//           find again; a failed store is made again by the next unlock, even one with nothing new
//           to set. Nothing is kept beyond that one pending store.

export function createUnlocker({ client, log = console.warn }) {
  let unstored = false;

  async function store() {
    try {
      await client.storeStats();
      unstored = false;
    } catch (err) {
      unstored = true;
      log('achievements: store failed', err);
    }
  }

  return {
    async unlock(names) {
      const wanted = [...new Set(names)];
      let missing = [];
      if (wanted.length > 0) {
        try {
          const already = new Set(await client.achievementsSet(wanted));
          missing = wanted.filter((n) => !already.has(n));
        } catch (err) {
          log('achievements: read failed', err);
        }
      }
      let set = 0;
      for (const name of missing) {
        try {
          await client.setAchievement(name);
          set += 1;
        } catch (err) {
          log('achievements: set failed', name, err);
        }
      }
      if (set > 0 || unstored) await store();
    },
  };
}
