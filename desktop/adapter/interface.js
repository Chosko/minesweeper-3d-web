// The Steamworks capability adapter: the one interface the main process uses for every Steam call.
// Steam is a set of capabilities, each reported available or not in `capabilities`; each carries
// the operations below. Operations are async and reject with a HostError; the `on…` subscriptions
// return their unsubscribe function. Every adapter also has `kind` ('steam' or 'unavailable') and
// `shutdown()`. A capability the binding lacks is reported unavailable — its callers never change.
//
//   identity      player() → { steamId, name }; personaNames(steamIds) → { [steamId]: name }
//   presence      loggedOn() → boolean; onPresenceChange(listener(loggedOn))
//   achievements  setAchievement(name); storeStats(); achievementsSet(names) → the names set
//   leaderboards  findLeaderboard(name) → handle; uploadScore(handle, score, details) keeping the best;
//                 downloadScores(handle, { scope: 'global' | 'friends' | 'around', start, end });
//                 downloadScoresForPlayers(handle, steamIds)
//   sharedFiles   writeAndShare(fileName, bytes) → file handle; downloadShared(fileHandle) → bytes;
//                 attachToLeaderboard(handle, fileHandle)
//   overlay       onOverlayActivated(listener(active)) — the overlay itself renders in the window
//
// Steam ids, leaderboard handles and file handles cross the interface as strings.

export const CAPABILITIES = Object.freeze(['identity', 'presence', 'achievements', 'leaderboards', 'sharedFiles', 'overlay']);

export const ADAPTER_OPERATIONS = Object.freeze({
  identity: Object.freeze(['player', 'personaNames']),
  presence: Object.freeze(['loggedOn', 'onPresenceChange']),
  achievements: Object.freeze(['setAchievement', 'storeStats', 'achievementsSet']),
  leaderboards: Object.freeze(['findLeaderboard', 'uploadScore', 'downloadScores', 'downloadScoresForPlayers']),
  sharedFiles: Object.freeze(['writeAndShare', 'downloadShared', 'attachToLeaderboard']),
  overlay: Object.freeze(['onOverlayActivated']),
});

/** The typed errors every adapter call and every bridge request rejects with. */
export const ERROR_CODES = Object.freeze(['unavailable', 'offline', 'not-found', 'invalid', 'failed']);

export const ERROR_MESSAGES = Object.freeze({
  unavailable: 'Steam unavailable',
  offline: 'Steam offline',
  'not-found': 'Not found',
  invalid: 'Invalid request',
  failed: 'Request failed',
});

export class HostError extends Error {
  constructor(code, message = ERROR_MESSAGES[code]) {
    if (!ERROR_CODES.includes(code)) throw new TypeError(`${code} is not a typed error`);
    super(message);
    this.name = 'HostError';
    this.code = code;
  }
}

/** The `{ code, message }` a request rejects with: a HostError's own, anything else `failed`. */
export function toTypedError(error) {
  if (error instanceof HostError) return { code: error.code, message: error.message };
  return { code: 'failed', message: ERROR_MESSAGES.failed };
}

/** What `adapter` lacks against this interface, one line each; empty when it is complete. */
export function adapterProblems(adapter) {
  const problems = [];
  if (typeof adapter?.kind !== 'string') problems.push('kind is not a string');
  for (const ops of Object.values(ADAPTER_OPERATIONS)) {
    for (const op of ops) if (typeof adapter?.[op] !== 'function') problems.push(`${op} is not a function`);
  }
  if (typeof adapter?.shutdown !== 'function') problems.push('shutdown is not a function');
  for (const capability of CAPABILITIES) {
    if (typeof adapter?.capabilities?.[capability] !== 'boolean') problems.push(`capability ${capability} is not a boolean`);
  }
  return problems;
}
