// The 3D mode behind the mode-host contract: an adapter over the 3D game session
// (js/mode3d/session.js) that js/main.js builds and shows. `flow` is the game's own screens and
// pointer-lock flow, handed in by js/main.js:
//   openBoardChoice()  show the 3D presets and custom board
//   start(choice, pregenerated)  open the board's session — with the pre-generated board handed to
//                      it, or null — and show its click-to-play card; returns the session
//   pause(note)        show the pause card over the hidden board
//   resume(source)     'pad': lockless play; 'pointer': the click-to-play card re-acquires pointer
//                      lock; 'key': the click-to-play card
//   restart(source, pregenerated, forced?)  a new session of the same board, with the pre-generated
//                      board or null — and, for a daily or a challenge not yet started, its forced
//                      start — entered as resume(source) enters play; returns the session
//   client             the 3D game's generation client (js/generation/client.js), kept for the page
//   randomSeed         optional: () → a seed for a pre-generated board; crypto by default
//   leave()            drop the game, release pointer lock and lockless play
//   contextLost()      whether the WebGL context is gone
//   sampler(session)   optional: the session's movement sampler (js/replay/sampler-3d.js), or an
//                      object with tick() and optionally destroy(); without it, no movement is
//                      recorded
//   release()          optional: release pointer lock before the results screen shows
//   clock              optional: { setTimeout(fn, ms), clearTimeout(h) } for the end delay; the
//                      global timers by default
//
// The adapter listens to the session it holds and to no other. At the session's `started` — the
// first reveal applied to the generated board — it reports started and canPause(true). At its
// `finished` — after the listeners js/main.js added before handing the session over have started
// the end effect — it reports canPause(false) and the end sequence runs (`ending` true): the
// summary is the game's at its end, a pause is ignored, and after the board's end delay
// (endDelayMs(session.board)), on the clock and so whether or not the tab is drawing frames, it
// calls flow.release() and reports finished(summary, replay) once. The shell offers no restart or leave while `ending`. The host
// reports abandoned from summary() and replay(summary) when a started, unfinished game is
// restarted or left; a game left before its first applied reveal reports nothing. The replay is
// the session's recording sealed with the summary (js/mode3d/session.js), null when there is no
// summary. pause() pauses the session, which stops its board input and leaves its clock running,
// a pending board request running too; the pause ends with the return to play. cancelGeneration() cancels the session's first-click board
// while it is being generated, its card shown or not, back to the closed box with nothing
// reported, and returns whether it did. restart() and leave() leave the session, cancelling a
// pending generation or end delay and discarding its recording, and drop its sampler. tick()
// drives the sampler (call it every frame). A lost graphics context — at start() or through
// contextLost() — is reported as failed, and leaves the session; during the end delay the game is
// first reported finished, so its summary is still recorded. finishNow() cuts a running end delay
// short — a press of the player's (js/shell/end-skip.js), the page going away — so the game is
// reported finished, never left unfinished.
//
// When a game whose board was no-guess finishes (won or lost), the adapter asks flow.client for the
// next board of the same box for its marked start cell (js/generation/start-cell.js) with a fresh
// seed, while the results screen shows, and holds it until the next start or the leave: a start
// with the same board (Play again, or Restart of the finished game) hands it to the new session,
// which marks the cell until the first reveal; a start with any other board, the leave or a lost
// graphics context discards it. A standard, fixed or abandoned game pre-generates nothing.
//
// A daily or a challenge starts with start({ ...board, forced, pregenerated? }): `forced` the
// session's forced start cell and seed ({ startCell, seed, daily?, challenge? },
// js/mode3d/session.js), `pregenerated` its board when the shell pre-generated it; the board
// pre-generated after a game is discarded, and the session reaches flow.start with the board's
// `forced`. restart() keeps the forced start while the game has not started; once it has, restart()
// — the results screen's Play again — opens a free box of the same board with a fresh seed. forced
// is the open game's forced start, or null. A daily's summaries name its Daily board (the
// identity's daily flag) with its `daily` date, a challenge's carry `challenge: true`, and every
// summary carries the first reveal's startCell.
//
// Learn 3D (js/mode3d/learn.js learnChoice) starts the same way with a fixed board — its mine
// positions — and `forced` { startCell, seed, learn: true }: the guided board, made by no generator
// in the game, has no summary and so no replay, and every restart, Try again included, keeps its
// forced start, so the guided board opens closed again. `learn` is whether the open game is it.
//
// Summaries are built by js/records/summary.js's buildSummary from the session's engine counts
// (outcome abandoned) or engine summary (won or lost), its elapsed time and its pause spans up to
// it, its board as the 3D board identity, its seed and its generator version: null before the first applied reveal, the summary
// so far while playing, the finished summary after the end. Every summary of one game carries the
// same id. A fixed board (the debug hook's mine set) was made by no generator, has no seed and so
// has no summary: null throughout.

import { MODE_3D } from '../records/board.js';
import { buildSummary, countedClicks } from '../records/summary.js';
import { pregenerate } from '../generation/client.js';
import { startCell } from '../generation/start-cell.js';

// The end delay: how long the end effect plays before the results screen shows, for a win and a
// loss alike — one function of the board's size (endDelayMs), which the renderer's wave pacing
// (waveStepS, js/render.js) is derived from, so the wave and the delay cannot drift apart. It grows
// with the board's diagonal so that a loss wave from any cube reaches the farthest cell, and that
// cell's reveal (WAVE_CELL_S) completes, END_MARGIN_S before the delay ends; it never falls below
// END_DELAY_MS nor exceeds END_DELAY_MAX_MS, and on a board whose diagonal the cap cuts short the
// wave travels faster than WAVE_STEP_MAX_S per cell to fit inside it.

/** The shortest end delay: a small board's. */
export const END_DELAY_MS = 1000;
/** The longest end delay, whatever the board. */
export const END_DELAY_MAX_MS = 2500;
/** The slowest the end-of-game wave travels: seconds per cell of distance. */
export const WAVE_STEP_MAX_S = 0.06;
/** How long one cell's reveal plays once the loss wave reaches it (the shader's per-cell animation). */
export const WAVE_CELL_S = 0.3;
/** What is left of the delay after the farthest cell's reveal. */
export const END_MARGIN_S = 0.15;

const diagonal = ({ X, Y, Z }) => Math.hypot(X - 1, Y - 1, Z - 1);

/** The end delay of an X × Y × Z board in milliseconds: END_DELAY_MS..END_DELAY_MAX_MS, growing with its diagonal. */
export function endDelayMs(board) {
  const needed = Math.ceil((diagonal(board) * WAVE_STEP_MAX_S + WAVE_CELL_S + END_MARGIN_S) * 1000);
  return Math.min(END_DELAY_MAX_MS, Math.max(END_DELAY_MS, needed));
}

/** The end-of-game wave's seconds per cell of distance on an X × Y × Z board, so the loss wave fits its end delay. */
export function waveStepS(board) {
  const d = diagonal(board);
  if (d <= 0) return WAVE_STEP_MAX_S;
  return Math.min(WAVE_STEP_MAX_S, (endDelayMs(board) / 1000 - WAVE_CELL_S - END_MARGIN_S) / d);
}

const NO_CLICKS = Object.freeze({ reveal: { effective: 0, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });

/**
 * The 3D game's live figures feed (js/shell/live-figures.js's input), pushed every frame with the
 * session's engine counts (null before the board arrives), the flags placed, the board's mines and
 * the elapsed time in ms: when the counts change — 3BV, 3BV solved, the counted clicks, the flags —
 * it calls figures(input, { tick: false }) at once; otherwise only when the elapsed time's whole
 * second changes, figures(input, { tick: true }) with only elapsedMs moved. reset() makes the next
 * push feed afresh (a new board).
 */
export function createFiguresFeed(figures) {
  let key = null;
  let second = null;
  let input = null;
  return {
    push({ counts, flags, mines, elapsedMs }) {
      const bbbv = counts?.bbbv ?? null;
      const bbbvSolved = counts?.bbbvSolved ?? 0;
      const clicks = counts?.clicks ?? NO_CLICKS;
      const now = [bbbv, bbbvSolved, countedClicks(clicks), flags, mines].join('|');
      const s = Math.floor(elapsedMs / 1000);
      if (now !== key) {
        key = now;
        second = s;
        input = { bbbv, bbbvSolved, clicks, flags, mines, elapsedMs };
        figures(input, { tick: false });
      } else if (s !== second) {
        second = s;
        input = { ...input, elapsedMs };
        figures(input, { tick: true });
      }
    },
    reset() { key = null; },
  };
}

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
  const seedOf = flow.randomSeed ?? (() => globalThis.crypto.getRandomValues(new Uint32Array(1))[0]);
  let game = null; // { session, sampler, started, id, final, ending, offs }
  let ahead = null; // { board, pregen }: the next no-guess board, pre-generated while the results show

  const sameBoard = (a, b) => !!a && !!b && !b.minePositions && a.X === b.X && a.Y === b.Y && a.Z === b.Z
    && a.mines === b.mines && !!a.noGuess === !!b.noGuess;

  function discardAhead() {
    ahead?.pregen.discard();
    ahead = null;
  }
  // The pre-generated board for a start with `board`, or null; any other is discarded.
  function takeAhead(board) {
    const taken = ahead && sameBoard(ahead.board, board) ? ahead.pregen : null;
    if (!taken) discardAhead();
    ahead = null;
    return taken;
  }
  // A finished no-guess game: the next board of the same box, for its marked start cell.
  function pregenerateNext(session) {
    discardAhead();
    const board = session.board;
    if (!board?.noGuess || session.seed === null || !flow.client) return;
    const graph = { kind: 'box', X: board.X, Y: board.Y, Z: board.Z };
    const request = { graph, mineCount: board.mines, firstClick: startCell(graph), noGuess: true, seed: seedOf() };
    ahead = { board: { ...board }, pregen: pregenerate(flow.client, request) };
  }

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
    const elapsedMs = session.elapsedMs();
    const forced = session.forced ?? null;
    return buildSummary({
      engine,
      elapsedMs,
      pauses: session.pauses(elapsedMs),
      board: { mode: MODE_3D, width: X, height: Y, depth: Z, mines, noGuess, ...(forced?.daily ? { daily: true } : {}) },
      seed: session.seed,
      generatorVersion: session.generatorVersion,
      id: g.id,
      ...(Number.isInteger(session.startCell) && session.startCell >= 0 ? { startCell: session.startCell } : {}),
      ...(forced?.daily ? { daily: forced.daily } : {}),
      ...(forced?.challenge ? { challenge: true } : {}),
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
        pregenerateNext(session);
        report.canPause(false);
        g.ending = { handle: clock.setTimeout(() => finish(g), endDelayMs(session.board)) };
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
      const { forced = null, pregenerated = null, ...board } = choice ?? {};
      let taken;
      if (forced) { discardAhead(); taken = pregenerated; } else taken = takeAhead(board);
      if (flow.contextLost()) { taken?.discard(); failed(); return; }
      attach(flow.start(forced ? { ...board, forced } : board, taken));
    },
    /** The open game's forced start cell and seed (a daily, a challenge or Learn 3D), or null. */
    get forced() { return game?.session.forced ?? null; },
    /** Whether the open game is the Learn 3D guided board (js/mode3d/learn.js). */
    get learn() { return !!game?.session.forced?.learn; },
    /** Whether the end sequence is running: the game is over and the results screen not yet shown. */
    get ending() { return !!game?.ending; },
    cancelGeneration() { return game ? game.session.cancel() : false; },
    pause(opts = {}) {
      if (game?.ending) return;
      game?.session.pause();
      flow.pause(opts.note ?? '');
    },
    resume(opts = {}) { flow.resume(opts.source ?? 'pointer'); },
    restart(opts = {}) {
      const forced = game?.session.forced ?? null;
      const keep = game && (!game.started || forced?.learn) ? forced : null;
      const taken = keep ? (discardAhead(), null) : takeAhead(game?.session.board);
      drop();
      attach(keep ? flow.restart(opts.source ?? 'pointer', taken, keep) : flow.restart(opts.source ?? 'pointer', taken));
    },
    leave() {
      discardAhead();
      drop();
      flow.leave();
    },
    /** A press of the player's, or the page going away: a running end delay ends now, so the game is reported finished. */
    finishNow() { if (game?.ending) finish(game); },
    summary,
    replay,
    tick() { game?.sampler?.tick(); },
    contextLost() {
      if (game?.ending) finish(game);
      discardAhead();
      game?.session.leave();
      failed();
    },
  };
}
