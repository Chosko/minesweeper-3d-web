// Leaderboard submission state: where each submitted game stands, by summary id, with change
// notification for the screens that show it (no DOM). Held in memory for the session; a game
// still waiting in the outbox at start-up is pending again (js/leaderboards/submit.js).
//
// A state is a frozen { status, ... }, status one of SUBMISSION:
//   not-eligible  { reason? } — never submitted: not eligible (no reason), or left out later —
//                 'replaced' by a better pending game, 'beaten' by one already pending, 'invalid'
//                 when its score or details cannot be written, 'no-replay' when its pending
//                 replay was lost before it was sent, or the submitter's reason for
//                 dropping it ('not-found', the score Steam already beat)
//   pending       verifying, or queued in the outbox until the submitter sends it
//   submitted     { rankBefore, rankAfter } — the global rank before and after the upload, as
//                 Steam reports them; rankBefore null on a first entry
//   rejected      { reason } — the verifier gate refused it: 'refused' (the replay cannot be
//                 read or played), 'differs' (it does not reproduce), 'outcome' (not a win),
//                 'board' (another leaderboard's board) or 'time' (another elapsed time)
//
// createSubmissionState() → { get, set, onChange }
//   get(id)        → the state of a summary id, or null when it was never submitted.
//   set(id, state) → stores a frozen copy and notifies every listener.
//   onChange(fn)   → unsubscribe; fn(id, state) after each change. A listener that throws is
//                    logged and never stops the others.

export const SUBMISSION = Object.freeze({
  NOT_ELIGIBLE: 'not-eligible',
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  REJECTED: 'rejected',
});

export function createSubmissionState() {
  const states = new Map();
  const listeners = new Set();

  return {
    get: (id) => states.get(id) ?? null,
    set(id, state) {
      const frozen = Object.freeze({ ...state });
      states.set(id, frozen);
      for (const fn of [...listeners]) {
        try { fn(id, frozen); } catch (err) { console.error(err); }
      }
    },
    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}
