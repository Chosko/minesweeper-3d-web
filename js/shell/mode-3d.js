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
//
// The adapter listens to the session it holds and to no other. At the session's `started` — the
// first reveal applied to the generated board — it reports started and canPause(true); at its
// `finished` it reports canPause(false) and finished(summary), after the listeners js/main.js
// added before handing the session over have played the end effect. The host reports abandoned
// from summary() when a started, unfinished game is restarted or left; a game left before its
// first applied reveal reports nothing. pause() pauses the session, so its timer stops and a
// pending board request keeps running; the timer resumes with play. restart() and leave() leave
// the session, cancelling a pending generation. A lost graphics context — at start() or through
// contextLost() — is reported as failed, and leaves the session.
//
// Summaries are built by js/records/summary.js's buildSummary from the session's engine counts
// (outcome abandoned) or engine summary (won or lost), its elapsed time, its board as the 3D board
// identity, its seed and its generator version: null before the first applied reveal, the summary
// so far while playing, the finished summary after the end. Every summary of one game carries the
// same id. A fixed board (the debug hook's mine set) was made by no generator, has no seed and so
// has no summary: null throughout.

import { MODE_3D } from '../records/board.js';
import { buildSummary } from '../records/summary.js';

/**
 * The 3D mode for `createModeHost().register('3d', (report) => create3DMode(flow, report))`.
 * js/main.js calls contextLost() when the WebGL context is lost during a 3D game.
 */
export function create3DMode(flow, report) {
  let game = null; // { session, started, id, final, offs }

  function drop() {
    if (!game) return;
    const g = game;
    game = null;
    for (const off of g.offs) off();
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
    const g = { session, started: false, id: null, final: undefined, offs: [] };
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
        report.finished(g.final);
      }),
    );
    game = g;
  }

  function summary() {
    if (!game || !game.started) return null;
    if (game.final !== undefined) return game.final;
    return build(game, game.session.counts());
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
    pause(opts = {}) {
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
    summary,
    contextLost() {
      game?.session.leave();
      failed();
    },
  };
}
