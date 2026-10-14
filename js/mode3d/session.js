// 3D game session: owns one 3D game from a closed box to a result, and the 3D game itself on the
// shared rules engine (create3DGame). DOM-free.
//
// createSession({ board, client, clock?, randomSeed?, generatingDelayMs?, place?, pregenerated?, forced? }) → session.
//   board       { X, Y, Z, mines, noGuess } — boardOf(choice) of js/mode3d/board-choice.js; with
//               `minePositions` (the debug hook's fixed board) that mine set is played and no board
//               is requested. A box or mine count the engine refuses throws a RangeError.
//   client      the generation client (js/generation/client.js): { request, cancel }; asked for
//               no-guess boards only.
//   clock       { now(), setTimeout(fn, ms), clearTimeout(h) }; defaults to performance.now and the
//               global timers.
//   randomSeed  () → a seed 0 .. 2^32 - 1 for each board request; defaults to crypto.
//   place       (request) → result: the standard board's placement on the main thread; generate()
//               (js/generation/generate.js) by default, the same code path the worker runs.
//   pregenerated  a board the 3D mode pre-generated for this box's marked start cell
//               (js/generation/client.js pregenerate()), or null.
//   forced      a daily or a challenge: { startCell, seed, daily?, challenge? }, the board a board
//               code names (js/records/board-code.js), or null for free play. It forces its start
//               cell as Classic 2D's `fixed` does (js/classic2d/session.js): markedCell is that cell
//               until the first reveal, a first reveal anywhere else changes nothing (the result
//               of no change), is not recorded and emits `refused` { cell, hint: START_HINT }, the
//               board is the pre-generated one for the cell or the one generated with the forced
//               seed, and a failed board offers nothing. Flags before the first reveal are kept as
//               always. restart() once the board has arrived opens a free closed box of the same
//               board; before that it stays forced. startCell is the first reveal's cell, -1
//               before it.
//
// The session opens a closed box (state 'ready'): `view` is the 3D state view the renderer, picking
// and HUD read, the same object for the whole session. Flags may be placed before the first
// reveal and are kept; a left release on a flagged cell, and any chord, does nothing then. The
// first reveal of a closed, unflagged cell needs the board request for that cell — the box graph,
// the mine count, the first-click rule of Classic 2D (that cell alone is mine-free) and the
// no-guess setting. A standard board (no-guess off) is placed at once with place() and a fresh
// seed: no request goes to the client, the state never becomes 'generating', and the reveal is
// applied in the same call. A no-guess board is asked of the client (state 'generating');
// `generating` { shown: true } is emitted only when the answer takes longer than
// generatingDelayMs, and { shown: false } when it arrives; no board action is accepted meanwhile.
// While generating, progress is { candidates, seconds }: the worker's candidates tried so far and
// the whole seconds since the request began; null otherwise. A pre-generated board waits for its
// cell as Classic 2D's does (js/classic2d/session.js): markedCell is that cell until the first
// reveal (flags placed before it do not count) and while the board is usable, with `mark`
// { cell } on each change; a first reveal on it takes the board over, at once or waiting for that
// same request, a failed one is asked afresh, and a first reveal anywhere else discards it. On a board, the flags placed before are put on it in the
// order they were placed, the reveal is applied, the timer starts and `started` is emitted (state
// 'playing'); the board's seed and generator version are kept. A failed request (a no-guess board
// not found, a rejected request, the worker failing) emits `failed` { reason, offers, count }
// (state 'failed') and the timer never starts; `count` is the failures in a row since the closed
// box. retry() asks again with a new seed; playStandard() — after a failure, or while generating,
// which cancels the request — places the same size with no-guess off for the same first cell at
// once and plays it, as Classic 2D does. cancel() while generating — the card shown
// or not — cancels the request through the client and returns to the closed box awaiting its
// first click (state 'ready'), its flags kept, reporting nothing; it returns whether there was a
// request to cancel.
//
// Actions — reveal(c), toggleFlag(c), chord(c) — return { changed, ended, exploded, revealed,
// flagged, unflagged } (create3DGame's result); a first reveal that waits for the worker returns a
// Promise of it instead (null when the board failed or the request was cancelled). An action the session does not accept (while generating, failed, paused,
// ended or left) returns null. A win or loss stops the timer and emits `finished` { state }.
// counts() and engineSummary() are the engine's counts and summary of the game on the board
// (js/engine/rules.js), null before it arrives; the 3D mode builds the game's summary from them.
//
// pause() stops board input and leaves the clock running; during generation the request keeps
// running and the timer stays unstarted until the board arrives. Each pause, from the pause to
// resume() — the return to play — or to the end when the session is left, is one span on the game
// clock, one begun while generating counting from the board's arrival (js/classic2d/session.js
// createTimer); pauses(until?, count?) is the spans so far, the open one ending now (createTimer's
// pauses). restart() opens a fresh closed box and leave() ends the session; both cancel a pending
// generation, and a late answer is dropped, and discard a pre-generated board not taken over.
//
// Recording (js/replay/recorder.js): each closed box opens a recorder, which restart() discards and
// leave() stops, so a game left by the 3D mode (a lost graphics context) still seals what it
// recorded until then; it goes with the session. Every action the session hands to the engine
// while the game accepts actions is recorded at that point, at the timer's elapsed time, paused
// spans included: when the board arrives, the flags placed
// before the first reveal, in the order they were placed, then the first reveal, all at 0 (a
// reveal of a flagged cell or a chord before it changes nothing and is not recorded); the rest
// while playing. The board's mines, seed and generator version are added when it arrives, and a
// board played standard after a failure starts a new recording of the standard board. `recording`
// is true while the game is started, unpaused and unfinished, and only then do recordSample(values)
// and recordView(mode) — the movement sampler's feed (js/replay/sampler-3d.js) — record, at the
// timer's elapsed time. replay(summary) seals the recording with the game's summary (the 3D mode
// builds it): { blob, listing }, or null without a summary, before the board arrived or once the
// recorder failed; sealing again returns the same replay. The replay carries the pause spans the
// summary counted.

import { createBoxGrid } from '../engine/box-grid.js';
import { PROFILE_3D, getRuleProfile } from '../engine/profiles.js';
import { createGame, createGameWithMines, PHASE } from '../engine/rules.js';
import { createStateView3D } from '../engine/state-view-3d.js';
import { createTimer, FAILURE_OFFERS, GENERATING_DELAY_MS, START_HINT } from '../classic2d/session.js';
import { MODE_3D } from '../records/board.js';
import { startRecording } from '../replay/recorder.js';
import { generate } from '../generation/generate.js';

export { FAILURE_OFFERS, GENERATING_DELAY_MS, START_HINT };

export const SESSION_STATE = Object.freeze({
  READY: 'ready',
  GENERATING: 'generating',
  PLAYING: 'playing',
  FAILED: 'failed',
  WON: 'won',
  LOST: 'lost',
  LEFT: 'left',
});

export const SESSION_EVENTS = Object.freeze(['generating', 'started', 'failed', 'finished', 'mark', 'refused']);

const defaultClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

// The session's action names → the replay's action kinds.
const RECORDED_KIND = Object.freeze({ reveal: 'reveal', toggleFlag: 'flag', chord: 'chord' });

const defaultSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * A 3D game: the box graph and the 3D profile on the shared engine, with the 3D state view
 * (`view`) the renderer, picking and HUD read. From a mine count it awaits the first click: its
 * first reveal changes nothing and returns `boardNeeded`, the cell a board is needed around; from
 * a mine set (`minePositions`) it plays that board from the start. reveal(c), toggleFlag(c) and
 * chord(c) apply the action, pass its result to the view and return { changed, ended, exploded,
 * revealed, flagged, unflagged, boardNeeded }: the cells newly opened, flagged and unflagged by it.
 * `mines` is the board's mine count. counts() and engineSummary() are the engine's counts and its
 * summary at a win or a loss, whose dimensions are { width: X, height: Y, depth: Z }.
 */
export function create3DGame({ X, Y, Z, mines, minePositions }) {
  const box = createBoxGrid(X, Y, Z);
  const graph = box.graph;
  const dimensions = { width: X, height: Y, depth: Z };
  const game = minePositions
    ? createGameWithMines({ graph, profile: PROFILE_3D, mines: minePositions, dimensions })
    : createGame({ graph, profile: PROFILE_3D, mineCount: mines, dimensions });
  const view = createStateView3D(game, box);
  const { revealed: open, flagged: flags } = game.state;
  const opened = new Uint8Array(graph.count); // revealed as of the last action

  function apply(result) {
    view.apply(result);
    const ch = result.changed;
    let revealed = 0, flagged = 0, unflagged = 0;
    for (let t = 0; t < ch.length; t++) {
      const c = ch[t];
      if (open[c]) { if (!opened[c]) { opened[c] = 1; revealed++; } } else if (flags[c]) flagged++;
      else unflagged++;
    }
    const exploded = result.ended && game.phase === PHASE.LOST;
    return { changed: ch, ended: result.ended, exploded, revealed, flagged, unflagged, boardNeeded: result.boardNeeded };
  }

  return {
    view,
    get mines() { return game.mineCount; },
    reveal(c) { return apply(game.reveal(c)); },
    toggleFlag(c) { return apply(game.toggleFlag(c)); },
    chord(c) { return apply(game.chord(c)); },
    counts: () => game.counts(),
    engineSummary: () => game.summary(),
    /** The engine's per-cell state arrays (revealed, flagged, hidden, …), for sealing a replay. */
    engineState: game.state,
  };
}

const nothing = () => ({ changed: new Int32Array(0), ended: false, exploded: false, revealed: 0, flagged: 0, unflagged: 0 });

export function createSession({
  board: choice,
  client,
  clock = defaultClock,
  randomSeed = defaultSeed,
  generatingDelayMs = GENERATING_DELAY_MS,
  place = generate,
  pregenerated = null,
  forced: forcedStart = null,
}) {
  let pregen = pregenerated; // the pre-generated board waiting for its cell, until the first reveal
  let forced = forcedStart ? Object.freeze({ ...forcedStart }) : null; // a daily's or a challenge's start, or null
  const fixed = choice.minePositions ? Array.from(choice.minePositions) : null;
  const { X, Y, Z } = choice;
  let board = Object.freeze({ X, Y, Z, mines: fixed ? fixed.length : choice.mines, noGuess: !!choice.noGuess });
  const listeners = Object.fromEntries(SESSION_EVENTS.map((t) => [t, new Set()]));

  let closed; // the game awaiting its first click: its view shows the closed box
  let play; // the game on the board, once it arrives
  let n;
  let preFlags; // flags placed before the board arrives, and the order they were placed in
  let preOrder;
  let preCount;
  let state;
  let timer;
  let paused;
  let seed;
  let generatorVersion;
  let failure;
  let failures; // failures in a row since the closed box
  let firstCell;
  let token = 0; // identifies the board request in flight; a stale answer is dropped
  let delayHandle = null;
  let generatingShown = false;
  let since = 0; // clock time the request in flight began
  let candidates = 0; // the worker's candidates tried so far for it
  let recorder = null; // this box's recording

  function record() {
    const profile = getRuleProfile(PROFILE_3D);
    recorder = startRecording({
      mode: MODE_3D,
      graph: { kind: 'box', x: X, y: Y, z: Z },
      board: { mode: MODE_3D, width: X, height: Y, depth: Z, mines: board.mines, noGuess: board.noGuess },
      profile: { id: profile.id, version: profile.version },
    });
  }

  const recording = () => state === SESSION_STATE.PLAYING && !paused && recorder !== null;

  // The view: the closed box with the flags placed before the first reveal, then the board's own
  // view. One object, so its readers never change; version and dirty span the hand-over.
  let base = 0; // version moves of the closed box (its flags, the hand-over)
  let ownMark;
  let ownList = [];
  const inner = () => (play ?? closed).view;
  const markOwn = (c) => { if (!ownMark[c]) { ownMark[c] = 1; ownList.push(c); } };
  const merged = () => {
    const theirs = inner().dirty;
    const out = new Int32Array(ownList.length + theirs.length);
    out.set(ownList);
    let k = ownList.length;
    for (let t = 0; t < theirs.length; t++) if (!ownMark[theirs[t]]) out[k++] = theirs[t];
    return out.slice(0, k);
  };

  const emit = (type, payload) => {
    for (const fn of [...listeners[type]]) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  };

  function fresh() {
    closed = create3DGame({ X, Y, Z, mines: board.mines });
    play = null;
    n = closed.view.n;
    if (!ownMark) ownMark = new Uint8Array(n);
    preFlags = new Uint8Array(n);
    preOrder = [];
    preCount = 0;
    timer = createTimer({ now: clock.now });
    state = SESSION_STATE.READY;
    paused = false;
    seed = null;
    generatorVersion = null;
    failure = null;
    failures = 0;
    firstCell = -1;
    record();
  }

  function checkCell(c) {
    if (!Number.isInteger(c) || c < 0 || c >= n) throw new RangeError(`cell ${c} is not on the board`);
  }

  function hideGenerating() {
    if (delayHandle !== null) { clock.clearTimeout(delayHandle); delayHandle = null; }
    if (generatingShown) {
      generatingShown = false;
      emit('generating', { shown: false });
    }
  }

  function afterAction(result) {
    if (result.ended) {
      timer.stop();
      state = play.view.state === 'won' ? SESSION_STATE.WON : SESSION_STATE.LOST;
      emit('finished', { state });
    }
    return result;
  }

  // The board has arrived: the flags placed before go on it, then the first reveal.
  function begin(mines) {
    const before = base + inner().version;
    play = create3DGame({ X, Y, Z, minePositions: mines });
    recorder?.boardArrived({ mines, seed, generatorVersion });
    for (const c of preOrder) { recorder?.action('flag', c, 0); play.toggleFlag(c); markOwn(c); }
    base = before + 1;
    recorder?.action('reveal', firstCell, 0);
    const r = play.reveal(firstCell);
    state = SESSION_STATE.PLAYING;
    timer.start(); // a pause while generating counts from here
    emit('started', { changed: r.changed });
    return afterAction(r);
  }

  function fail(reason) {
    state = SESSION_STATE.FAILED;
    failures += 1;
    failure = { reason, offers: forced ? [] : [...FAILURE_OFFERS], count: failures };
    emit('failed', failure);
    return null;
  }

  const request = (cell, withSeed, noGuess = board.noGuess) => ({ graph: { kind: 'box', X, Y, Z }, mineCount: board.mines, firstClick: cell, noGuess, seed: withSeed });

  // A board has arrived (placed, or from the worker): the first reveal goes on it.
  function arrive(result) {
    seed = result.seed;
    generatorVersion = result.generatorVersion;
    return begin(result.mines);
  }

  // A standard board around `firstCell`, placed now on the main thread (with the forced seed, if any).
  function placeNow(fixedSeed = null) {
    seed = fixedSeed ?? randomSeed();
    failure = null;
    let result;
    try {
      result = place(request(firstCell, seed, false));
    } catch (error) {
      return fail(error?.message || String(error));
    }
    if (!result || !result.ok) return fail(result?.reason ?? 'no board');
    return arrive(result);
  }

  // Wait for a worker's board: `ask(onProgress)` → Promise of the result. Resolves with the first
  // reveal's result, or null.
  function wait(ask) {
    const mine = ++token;
    state = SESSION_STATE.GENERATING;
    failure = null;
    since = clock.now();
    candidates = 0;
    delayHandle = clock.setTimeout(() => {
      delayHandle = null;
      if (mine !== token || state !== SESSION_STATE.GENERATING) return;
      generatingShown = true;
      emit('generating', { shown: true });
    }, generatingDelayMs);
    const onProgress = (p) => { if (mine === token && Number.isInteger(p?.candidates)) candidates = p.candidates; };
    return ask(onProgress).then(
      (result) => {
        if (mine !== token) return null;
        hideGenerating();
        if (result?.cancelled) return null;
        if (!result || !result.ok) return fail(result?.reason ?? 'no board');
        return arrive(result);
      },
      (error) => {
        if (mine !== token) return null;
        hideGenerating();
        return fail(error?.message || String(error));
      },
    );
  }

  // Ask the worker for a no-guess board around `firstCell` with a new seed (or the forced one).
  function requestBoard(fixedSeed = null) {
    seed = fixedSeed ?? randomSeed();
    const req = request(firstCell, seed);
    return wait((onProgress) => client.request(req, { onProgress }));
  }

  function markedCell() {
    if (forced && state === SESSION_STATE.READY && firstCell < 0) return forced.startCell;
    if (!pregen || state !== SESSION_STATE.READY) return -1;
    if (pregen.settled && !pregen.result?.ok) return -1;
    return pregen.cell;
  }

  // Let go of the pre-generated board, cancelling its request when it is still in flight.
  function releasePregen({ discard }) {
    const pg = pregen;
    if (!pg) return null;
    const marked = markedCell();
    pregen = null;
    if (discard) pg.discard();
    if (marked >= 0) emit('mark', { cell: -1 });
    return pg;
  }

  // The first reveal's board: the pre-generated one on its cell, else placed or asked for.
  function firstBoard() {
    const pg = pregen && pregen.cell === firstCell ? releasePregen({ discard: false }) : null;
    if (!pg) releasePregen({ discard: true });
    if (pg) {
      if (pg.settled && pg.result?.ok) return arrive(pg.result);
      if (!pg.settled) {
        seed = pg.seed;
        return wait((onProgress) => { pg.listen(onProgress); return pg.promise; });
      }
    }
    const fixedSeed = forced ? forced.seed : null;
    return board.noGuess ? requestBoard(fixedSeed) : placeNow(fixedSeed);
  }

  // Drop whatever is pending: the request in flight and the "generating" state.
  function dropPending() {
    if (state === SESSION_STATE.GENERATING) {
      token += 1;
      hideGenerating();
      client.cancel();
    }
  }

  function flagBefore(c) {
    const on = preFlags[c] ^ 1;
    preFlags[c] = on;
    preCount += on ? 1 : -1;
    preOrder.push(c);
    markOwn(c);
    base += 1;
    return { changed: Int32Array.of(c), ended: false, exploded: false, revealed: 0, flagged: on, unflagged: on ^ 1 };
  }

  function act(kind, c) {
    checkCell(c);
    if (paused) return null;
    if (state === SESSION_STATE.READY) {
      if (kind === 'toggleFlag') return flagBefore(c);
      if (kind === 'chord' || preFlags[c]) return nothing(); // nothing happens before the first reveal
      if (forced && c !== forced.startCell) {
        emit('refused', { cell: c, hint: START_HINT });
        return nothing();
      }
      firstCell = c;
      if (forced && !pregen) emit('mark', { cell: -1 }); // the forced mark goes at the first reveal
      return fixed ? begin(fixed) : firstBoard();
    }
    if (state !== SESSION_STATE.PLAYING) return null;
    recorder?.action(RECORDED_KIND[kind], c, timer.elapsedMs());
    return afterAction(play[kind](c));
  }

  fresh();
  // A failed pre-generation leaves its cell unmarked: the first reveal there asks afresh.
  pregen?.promise.then(() => {
    if (!forced && pregen && pregen.settled && !pregen.result?.ok && state === SESSION_STATE.READY) emit('mark', { cell: -1 });
  });

  const view = Object.freeze({
    X: closed.view.X,
    Y: closed.view.Y,
    Z: closed.view.Z,
    n,
    idx: (i, j, k) => closed.view.idx(i, j, k),
    coords: (c) => closed.view.coords(c),
    get number() { return inner().number; },
    get pressed() { return inner().pressed; },
    get flagged() { return play ? play.view.flagged : preFlags; },
    get unlinked() { return inner().unlinked; },
    get phase() { return inner().phase; },
    get state() { return inner().state; },
    get explodedIdx() { return inner().explodedIdx; },
    get minesLeft() { return play ? play.view.minesLeft : board.mines - preCount; },
    get version() { return base + inner().version; },
    get dirty() { return merged(); },
    consumeDirty() {
      const out = merged();
      for (const c of ownList) ownMark[c] = 0;
      ownList = [];
      inner().consumeDirty();
      return out;
    },
  });

  return {
    view,
    get state() { return state; },
    get board() { return board; },
    get mines() { return board.mines; },
    get seed() { return seed; },
    get generatorVersion() { return generatorVersion; },
    get generatingShown() { return generatingShown; },
    get paused() { return paused; },
    get failure() { return failure; },
    /** A daily's or a challenge's forced start cell and seed, or null. */
    get forced() { return forced; },
    /** The first reveal's cell, -1 before it. */
    get startCell() { return firstCell; },
    /** The marked start cell a pre-generated board waits for, or -1. */
    get markedCell() { return markedCell(); },
    /** While generating: { candidates, seconds } — the worker's candidates so far, whole seconds since the request began. */
    get progress() {
      if (state !== SESSION_STATE.GENERATING) return null;
      return { candidates, seconds: Math.max(0, Math.floor((clock.now() - since) / 1000)) };
    },
    elapsedMs: () => timer.elapsedMs(),
    seconds: () => timer.seconds(),
    pauses: (until, count) => timer.pauses(until, count),
    counts: () => (play ? play.counts() : null),
    engineSummary: () => (play ? play.engineSummary() : null),
    get recording() { return recording(); },
    recordSample(values) { if (recording()) recorder.sample(values, timer.elapsedMs()); },
    recordView(mode) { if (recording()) recorder.view(mode, timer.elapsedMs()); },
    replay(summary) {
      if (!summary || !play || !recorder) return null;
      return recorder.seal(summary, play.engineState, timer.pauses(summary.elapsedMs, summary.pauses));
    },

    on(type, fn) {
      if (!listeners[type]) throw new Error(`unknown session event "${type}"`);
      listeners[type].add(fn);
      return () => listeners[type].delete(fn);
    },

    reveal: (c) => act('reveal', c),
    toggleFlag: (c) => act('toggleFlag', c),
    chord: (c) => act('chord', c),

    /** After a failure: ask again for the same cell with a new seed. */
    retry() {
      if (state !== SESSION_STATE.FAILED || forced) return null;
      return requestBoard();
    },
    /** After a failure, or while generating: the same size with no-guess off for the same cell, placed now. */
    playStandard() {
      if (forced) return null;
      if (state === SESSION_STATE.GENERATING) dropPending();
      else if (state !== SESSION_STATE.FAILED) return null;
      board = Object.freeze({ ...board, noGuess: false });
      record();
      return placeNow();
    },
    /** While generating: cancel the request and go back to the closed box, its flags kept. */
    cancel() {
      if (state !== SESSION_STATE.GENERATING) return false;
      dropPending();
      state = SESSION_STATE.READY;
      seed = null;
      failures = 0;
      firstCell = -1;
      return true;
    },

    pause() {
      if (state === SESSION_STATE.GENERATING || state === SESSION_STATE.PLAYING) {
        paused = true;
        timer.pause();
      }
    },
    resume() {
      if (!paused) return;
      paused = false;
      timer.resume();
    },

    /** Discard the game and open a fresh closed box of the same board. */
    restart() {
      if (state === SESSION_STATE.LEFT) return;
      if (play) forced = null; // a forced board, once started, is played once; the next one is free
      dropPending();
      releasePregen({ discard: true });
      base += 1 + inner().version;
      for (let c = 0; c < n; c++) markOwn(c);
      fresh();
    },
    /** End the session, releasing the pending request. */
    leave() {
      if (state === SESSION_STATE.LEFT) return;
      dropPending();
      releasePregen({ discard: true });
      timer.stop();
      state = SESSION_STATE.LEFT;
    },
  };
}
