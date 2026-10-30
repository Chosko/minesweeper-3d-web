// Leaderboard submission: the end-of-game hand-off's submit(summary, replay), the verifier gate a
// win passes before it is queued, the outbox it waits in and its flush through a submitter, and
// the submission state screens read (no DOM). Nothing here throws into its caller or interrupts
// play: every failure is a state.
//
// createLeaderboardSubmission({ storage, openBlobStore, submitter?, knownBest?, onLoggedOn? }) → lb
//   storage, openBlobStore  the outbox's (js/leaderboards/outbox.js).
//   submitter   { submit({ leaderboard, id, score, details, replay }) → Promise of
//               { result: 'submitted', rankBefore, rankAfter } | { result: 'dropped', reason }
//               | { result: 'retry', reason } }, replay the bytes. Submitted and dropped take the
//               entry out of the outbox; retry, any other answer, a throw or a rejection leave it
//               for the next flush. The Steam submitter is js/leaderboards/steam-submitter.js;
//               without one (null, the default) entries wait.
//   knownBest   (leaderboard) → the player's known best score on it, or null; eligibility's
//               (js/leaderboards/eligibility.js). Default: none known.
//   onLoggedOn  (listener) → unsubscribe; each call of listener flushes the outbox.
//
//   submit(summary, replay) → true when the game is eligible, else false, at once; replay is the
//               recorder's sealed { blob, listing }. An eligible game is pending while the
//               verifier gate runs in the background: the replay is decoded and verified
//               (js/replay/verify.js) and the game goes ahead only when the replay reproduces,
//               its outcome is a win, its board has the summary's leaderboard and its elapsed
//               time equals the summary's; otherwise it is rejected (js/leaderboards/state.js).
//               A verified game is offered to the outbox with its score and details — the 3BV,
//               3BV solved and clicks from the verified replay's check values, the rules version
//               from its header's profile — then the outbox is flushed. A second
//               call for the same summary id, or for a game the outbox already holds, is a no-op
//               answering what the first did (true for a game found pending).
//   state(id)   → the submission state of a summary id, or null.
//   onChange(fn) → unsubscribe; fn(id, state) after each change of state.
//   start()     → Promise: loads the outbox (its pending games become pending), subscribes to
//               onLoggedOn, then flushes. Once; repeated calls return the first Promise.
//   flush()     → Promise; sends each pending game through the submitter, one after another.
//   settled()   → Promise that resolves once every operation queued so far has finished.
// Operations run one after another in the order they were asked for, the outbox's load first.

import { leaderboardFor } from './catalogue.js';
import { scoreOf, detailsFor } from './details.js';
import { eligible } from './eligibility.js';
import { createOutbox } from './outbox.js';
import { SUBMISSION, createSubmissionState } from './state.js';
import { decodeReplay } from '../replay/format.js';
import { verify } from '../replay/verify.js';

const lookup = (fn) => {
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
};

// The verifier gate: null when the replay may go ahead, else the rejection's reason.
function gate(summary, blob, leaderboard) {
  let replay;
  try {
    replay = decodeReplay(blob);
  } catch {
    return { reason: 'refused' };
  }
  const result = verify(replay);
  if (!result.ok) return { reason: result.result };
  if (replay.check.outcome !== 'won') return { reason: 'outcome' };
  if (leaderboardFor(replay.header.board) !== leaderboard) return { reason: 'board' };
  if (replay.check.elapsedMs !== summary.elapsedMs) return { reason: 'time' };
  return { replay };
}

export function createLeaderboardSubmission({
  storage, openBlobStore, submitter = null, knownBest = () => null, onLoggedOn = null,
}) {
  const outbox = createOutbox({ storage, openBlobStore });
  const states = createSubmissionState();
  const answers = new Map(); // summary id → submit's answer
  let queue = Promise.resolve();
  let starting = null;

  function run(op) {
    const result = queue.then(() => outbox.load()).then(op);
    queue = result.catch((err) => console.error(err));
    return queue;
  }

  async function send({ leaderboard, id, score, details }) {
    let answer;
    try {
      const replay = await outbox.replay(leaderboard);
      if (replay === undefined) {
        await outbox.remove(leaderboard);
        states.set(id, { status: SUBMISSION.NOT_ELIGIBLE, reason: 'no-replay' });
        return;
      }
      answer = await submitter.submit({ leaderboard, id, score, details, replay });
    } catch {
      return;
    }
    if (answer?.result === 'submitted') {
      await outbox.remove(leaderboard);
      states.set(id, { status: SUBMISSION.SUBMITTED, rankBefore: answer.rankBefore ?? null, rankAfter: answer.rankAfter ?? null });
    } else if (answer?.result === 'dropped') {
      await outbox.remove(leaderboard);
      states.set(id, { status: SUBMISSION.NOT_ELIGIBLE, reason: answer.reason ?? 'dropped' });
    }
  }

  async function flushNow() {
    if (!submitter) return;
    for (const entry of outbox.entries()) await send(entry);
  }

  async function queueGame(summary, blob, leaderboard) {
    if (outbox.has(summary.id)) return;
    const verdict = gate(summary, blob, leaderboard);
    if (verdict.reason) {
      states.set(summary.id, { status: SUBMISSION.REJECTED, reason: verdict.reason });
      return;
    }
    let score;
    let details;
    try {
      score = scoreOf(summary);
      const { bbbv, bbbvSolved, clicks } = verdict.replay.check;
      details = detailsFor({ bbbv, bbbvSolved, clicks }, { rulesVersion: verdict.replay.header.profile.version });
    } catch {
      states.set(summary.id, { status: SUBMISSION.NOT_ELIGIBLE, reason: 'invalid' });
      return;
    }
    const { queued, replaced } = await outbox.offer(leaderboard, { id: summary.id, score, details }, blob);
    if (!queued) {
      states.set(summary.id, { status: SUBMISSION.NOT_ELIGIBLE, reason: 'beaten' });
      return;
    }
    if (replaced) states.set(replaced, { status: SUBMISSION.NOT_ELIGIBLE, reason: 'replaced' });
    await flushNow();
  }

  return {
    submit(summary, replay) {
      const id = summary && typeof summary === 'object' && typeof summary.id === 'string' ? summary.id : null;
      if (id !== null && answers.has(id)) return answers.get(id);
      const leaderboard = id === null ? null : leaderboardFor(summary.board);
      const ok = id !== null && eligible(summary, replay, lookup(() => knownBest(leaderboard)));
      if (id === null) return false;
      answers.set(id, ok);
      if (!ok) {
        states.set(id, { status: SUBMISSION.NOT_ELIGIBLE });
        return false;
      }
      if (states.get(id)?.status !== SUBMISSION.PENDING) states.set(id, { status: SUBMISSION.PENDING });
      run(() => queueGame(summary, replay.blob, leaderboard));
      return true;
    },
    state: (id) => states.get(id),
    onChange: (fn) => states.onChange(fn),
    start() {
      starting ??= run(() => {
        for (const { id } of outbox.entries()) {
          answers.set(id, true);
          states.set(id, { status: SUBMISSION.PENDING });
        }
        if (typeof onLoggedOn === 'function') onLoggedOn(() => { run(flushNow); });
      }).then(() => run(flushNow));
      return starting;
    },
    flush: () => run(flushNow),
    settled: () => queue,
  };
}
