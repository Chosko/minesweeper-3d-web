// The 3D mode behind the mode-host contract: an adapter over the 3D game session
// (js/mode3d/session.js) that js/main.js builds and shows. `flow` is the game's own screens and
// pointer-lock flow, handed in by js/main.js:
//   openBoardChoice()  show the 3D presets and custom board
//   start(choice)      open the board's session and show its click-to-play card; returns the session
//   pause(note)        show the pause card over the hidden board
//   resume(source)     'pad': lockless play; 'pointer': the click-to-play card re-acquires pointer
//                      lock; 'key': the click-to-play card
//   restart(source)    a new session of the same board, entered as resume(source) enters play;
//                      returns the session
//   leave()            drop the game, release pointer lock and lockless play
//   contextLost()      whether the WebGL context is gone
//   sampler(session)   optional: the session's movement sampler (js/replay/sampler-3d.js), or an
//                      object with tick() and optionally destroy(); without it, no movement is
//                      recorded
//   release()          optional: release pointer lock before the results screen takes over
//   clock              optional: { setTimeout(fn, ms), clearTimeout(h) } for the end delay; the
//                      global timers by default
//
// The adapter listens to the session it holds and to no other. At the session's `started` — the
// first reveal applied to the generated board — it reports started and canPause(true). At its
// `finished` — after the listeners js/main.js added before handing the session over have started
// the end effect — it reports canPause(false) and the end sequence runs (`ending` true): the
// summary is the game's at its end, a pause is ignored, and after END_DELAY_MS, on the clock and so
// whether or not the tab is drawing frames, it calls flow.release() and reports
// finished(summary, replay) once. The shell offers no restart or leave while `ending`. The host
// reports abandoned from summary() and replay(summary) when a started, unfinished game is
// restarted or left; a game left before its first applied reveal reports nothing. The replay is
// the session's recording sealed with the summary (js/mode3d/session.js), null when there is no
// summary. pause() pauses the session, so its timer stops and a pending board request keeps
// running; the timer resumes with play. restart() and leave() leave the session, cancelling a
// pending generation or end delay and discarding its recording, and drop its sampler. tick()
// drives the sampler (call it every frame). A lost graphics context — at start() or through
// contextLost() — is reported as failed, and leaves the session; during the end delay the game is
// first reported finished, so its summary is still recorded. finishNow() cuts a running end delay
// short — the page is going away — so the game is reported finished, never left unfinished.
//
// Summaries are built by js/records/summary.js's buildSummary from the session's engine counts
// (outcome abandoned) or engine summary (won or lost), its elapsed time, its board as the 3D board
// identity, its seed and its generator version: null before the first applied reveal, the summary
// so far while playing, the finished summary after the end. Every summary of one game carries the
// same id. A fixed board (the debug hook's mine set) was made by no generator, has no seed and so
// has no summary: null throughout.

import { MODE_3D } from '../records/board.js';
import { buildSummary } from '../records/summary.js';

/** How long the end effect plays before the results screen takes over, for a win and a loss alike. */
export const END_DELAY_MS = 1000;

const globalClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h),
};

/**
 * The 3D mode for `createModeHost().register('3d', (report) => create3DMode(flow, report))`.
 * js/main.js calls contextLost() when the WebGL context is lost during a 3D game.
 */
export function create3DMode(flow, report) {
  const clock = flow.clock ?? globalClock;
  let game = null; // { session, sampler, started, id, final, ending, offs }

  function drop() {
    if (!game) return;
    const g = game;
    game = null;
    if (g.ending) { clock.clearTimeout(g.ending.handle); g.ending = null; }
    for (const off of g.offs) off();
    g.sampler?.destroy?.();
    g.session.leave();
  }

  // The game's summary from the builder: the engine's summary once finished, its counts before.
  function build(g, engine) {
    const { session } = g;
    if (session.seed === null || session.generatorVersion === null) return null; // a fixed board
    const { X, Y, Z, mines, noGuess } = session.board;
    return buildSummary({
      engine,
      elapsedMs: session.elapsedMs(),
      board: { mode: MODE_3D, width: X, height: Y, depth: Z, mines, noGuess },
      seed: session.seed,
      generatorVersion: session.generatorVersion,
      id: g.id,
    });
  }

  function attach(session) {
    drop();
    const sampler = typeof flow.sampler === 'function' ? flow.sampler(session) : null;
    const g = { session, sampler, started: false, id: null, final: undefined, ending: null, offs: [] };
    g.offs.push(
      session.on('started', () => {
        g.started = true;
        g.id = globalThis.crypto.randomUUID();
        report.started();
        report.canPause(true);
      }),
      session.on('finished', () => {
        g.final = build(g, session.engineSummary());
        report.canPause(false);
        g.ending = { handle: clock.setTimeout(() => finish(g), END_DELAY_MS) };
      }),
    );
    game = g;
  }

  // The end delay is over (or cut short by a lost context): game finished, once.
  function finish(g) {
    if (game !== g || !g.ending) return;
    clock.clearTimeout(g.ending.handle);
    g.ending = null;
    flow.release?.();
    report.finished(g.final, replay(g.final));
  }

  function summary() {
    if (!game || !game.started) return null;
    if (game.final !== undefined) return game.final;
    return build(game, game.session.counts());
  }

  function replay(s) {
    if (!game || !s || typeof game.session.replay !== 'function') return null;
    return game.session.replay(s);
  }

  const failed = () => report.failed('graphics context lost');

  return {
    failureScreen: 'ctxlost',
    openBoardChoice() { flow.openBoardChoice(); },
    start(choice) {
      drop();
      if (flow.contextLost()) { failed(); return; }
      attach(flow.start(choice));
    },
    /** Whether the end sequence is running: the game is over and the results screen not yet shown. */
    get ending() { return !!game?.ending; },
    pause(opts = {}) {
      if (game?.ending) return;
      game?.session.pause();
      flow.pause(opts.note ?? '');
    },
    resume(opts = {}) { flow.resume(opts.source ?? 'pointer'); },
    restart(opts = {}) {
      drop();
      attach(flow.restart(opts.source ?? 'pointer'));
    },
    leave() {
      drop();
      flow.leave();
    },
    /** The page is going away: a running end delay ends now, so the game is reported finished. */
    finishNow() { if (game?.ending) finish(game); },
    summary,
    replay,
    tick() { game?.sampler?.tick(); },
    contextLost() {
      if (game?.ending) finish(game);
      game?.session.leave();
      failed();
    },
  };
}
