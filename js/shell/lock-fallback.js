// The pointer-lock fallback of the 3D ready card: counts the browser's refusals to lock the
// mouse and says, from the second, that the page is blocked, so the ready card can offer
// drag-to-look play and the controller instead. Pure: the shell hands in the clock and the
// time of the last lock release.
//
// A refusal inside RELOCK_COOLDOWN_MS of a release is the browser's re-lock delay after Esc, not
// a block: it is answered with its own message and not counted. An acquired lock resets the
// count. Once blocked, the page stays blocked for its session (nothing is kept across a reload),
// so every later ready card shows the explanation and the offer at once.
//
// createLockFallback({ cooldownMs? }) → fallback
//   refused(now, unlockedAt) → the ready card's message for this refusal
//   locked()                 an acquired lock: the count starts again
//   blocked                  whether the ready card offers drag-to-look and the controller
//   readyMessage(msg?)       a ready card's message: msg when given, else the block's explanation
//                            while blocked, else ''

export const RELOCK_COOLDOWN_MS = 1500;

export const LOCK_MESSAGES = Object.freeze({
  cooldown: 'The browser needs a moment before locking the mouse again. Click once more.',
  refused: 'Could not capture the mouse. Click once more.',
  blocked: 'The browser is blocking mouse capture on this page.',
});

/** Refusals in a row, outside the cooldown, that make the page blocked. */
const BLOCKED_AFTER = 2;

export function createLockFallback({ cooldownMs = RELOCK_COOLDOWN_MS } = {}) {
  let count = 0;
  let blocked = false;
  return {
    refused(now, unlockedAt) {
      if (now - unlockedAt < cooldownMs) return LOCK_MESSAGES.cooldown;
      count++;
      if (count >= BLOCKED_AFTER) blocked = true;
      return blocked ? LOCK_MESSAGES.blocked : LOCK_MESSAGES.refused;
    },
    locked() { count = 0; },
    get blocked() { return blocked; },
    readyMessage(msg = '') { return msg || (blocked ? LOCK_MESSAGES.blocked : ''); },
  };
}
