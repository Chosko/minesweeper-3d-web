// The replay verifier: whether a replay still reproduces on this build (no DOM).
//
// verify(input) — input a blob or a replay object, as js/replay/simulator.js's openReplay takes —
// runs the simulator to the end of the action stream, drawing nothing and keeping no snapshots
// but the start, and compares the game with the replay's check values in their order:
//   { ok: true, result: 'reproduces' }
//   { ok: false, result: 'differs', field, expected, actual }   the first check value that differs;
//       field is 'outcome', 'elapsedMs', 'bbbv', 'bbbvSolved', 'clicks.<kind>.<effective|wasted>'
//       or 'digest'
//   { ok: false, result: 'refused', reason, message }            the simulator refused the replay
//       (REFUSAL in js/replay/simulator.js)
// The outcome is won or lost from the game's phase, abandoned while it still plays. The elapsed
// time is at least the last action's time, whatever the outcome: a session stamps an action before
// the engine applies it and stops its timer after, so the time that ends a game can run past it.

import { createSimulator, ReplayRefusedError } from './simulator.js';
import { cellStateDigest } from './format.js';
import { CLICK_KINDS } from '../engine/metrics.js';
import { PHASE } from '../engine/rules.js';

const differs = (field, expected, actual) => ({ ok: false, result: 'differs', field, expected, actual });

export function verify(input) {
  let sim;
  try {
    sim = createSimulator(input, { snapshotMinCells: Infinity });
  } catch (err) {
    if (err instanceof ReplayRefusedError) return { ok: false, result: 'refused', reason: err.reason, message: err.message };
    throw err;
  }
  const { actions, check } = sim.replay;
  const end = sim.seekIndex(sim.length);

  const outcome = end.phase === PHASE.WON ? 'won' : end.phase === PHASE.LOST ? 'lost' : 'abandoned';
  if (outcome !== check.outcome) return differs('outcome', check.outcome, outcome);

  const last = actions.length ? actions[actions.length - 1].time : 0;
  if (check.elapsedMs < last) return differs('elapsedMs', check.elapsedMs, last);

  if (end.bbbv !== check.bbbv) return differs('bbbv', check.bbbv, end.bbbv);
  if (end.bbbvSolved !== check.bbbvSolved) return differs('bbbvSolved', check.bbbvSolved, end.bbbvSolved);
  for (const kind of CLICK_KINDS) {
    for (const part of ['effective', 'wasted']) {
      const expected = check.clicks[kind][part], actual = end.clicks[kind][part];
      if (expected !== actual) return differs(`clicks.${kind}.${part}`, expected, actual);
    }
  }
  const digest = cellStateDigest(end.state);
  if (digest !== check.digest) return differs('digest', check.digest, digest);
  return { ok: true, result: 'reproduces' };
}
