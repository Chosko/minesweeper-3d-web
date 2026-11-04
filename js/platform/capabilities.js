// The capability flags: what the host the page runs in offers, the one thing callers read instead
// of testing for the platform. Derived at start-up from platform selection — `desktopHost`, whether
// the page bridge is present — and from the Steam state the host sends, again at every change of it:
//
//   desktopHost   the desktop host: the title bar's window buttons have their actions
//   steam         Steam present: the host runs the Steam adapter, not the unavailable one
//   achievements  Steam present and the adapter's achievements capability
//   leaderboards  Steam present and the adapter's leaderboards capability
//   sharedFiles   Steam present and the adapter's shared files capability
//   cloud         Steam present: Steam Cloud syncs the save files
//
// Logged-on state never turns a flag off: a call needing the Steam network rejects with `offline`
// and its caller queues or degrades. The latest Steam state itself ({ adapter, loggedOn, player,
// capabilities }, desktop/bridge.js's `steam.state`) is kept beside the flags. The web build has no
// host, so every flag is off.

export const CAPABILITY_FLAGS = Object.freeze(['desktopHost', 'steam', 'achievements', 'leaderboards', 'sharedFiles', 'cloud']);

/** The flags of a host: `desktopHost` from selection, the rest from the Steam state (null before it arrives). */
export function deriveFlags({ desktopHost = false, steamState = null } = {}) {
  const host = desktopHost === true;
  const steam = host && steamState?.adapter === 'steam';
  const offers = (capability) => steam && steamState.capabilities?.[capability] === true;
  return {
    desktopHost: host,
    steam,
    achievements: offers('achievements'),
    leaderboards: offers('leaderboards'),
    sharedFiles: offers('sharedFiles'),
    cloud: steam,
  };
}

const isSteamState = (state) => Boolean(state) && typeof state === 'object' && typeof state.adapter === 'string';

/**
 * The live flags: one getter per flag, `snapshot()` → the frozen flags now, `steamState()` → the
 * latest Steam state or null, `subscribe(listener(flags))` → unsubscribe, called after a change of
 * any flag, and `update(steamState)` → whether a flag changed (a malformed state changes nothing).
 */
export function createCapabilities({ desktopHost = false } = {}) {
  let state = null;
  let flags = Object.freeze(deriveFlags({ desktopHost }));
  const listeners = new Set();

  const capabilities = {
    snapshot: () => flags,
    steamState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    update(steamState) {
      if (!isSteamState(steamState)) return false;
      state = steamState;
      const next = Object.freeze(deriveFlags({ desktopHost, steamState }));
      if (CAPABILITY_FLAGS.every((flag) => next[flag] === flags[flag])) return false;
      flags = next;
      for (const listener of [...listeners]) listener(flags);
      return true;
    },
  };
  for (const flag of CAPABILITY_FLAGS) Object.defineProperty(capabilities, flag, { get: () => flags[flag], enumerable: true });
  return Object.freeze(capabilities);
}
