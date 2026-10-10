// 3D game session: owns one 3D game from a closed box to a result, and the 3D game itself on the
// shared rules engine (create3DGame). DOM-free.
//
// createSession({ board, client, clock?, randomSeed?, generatingDelayMs? }) → session.
//   board       { X, Y, Z, mines, noGuess } — boardOf(choice) of js/mode3d/board-choice.js; with
//               `minePositions` (the debug hook's fixed board) that mine set is played and no board
//               is requested. A box or mine count the engine refuses throws a RangeError.
//   client      the generation client (js/generation/client.js): { request, cancel }.
//   clock       { now(), setTimeout(fn, ms), clearTimeout(h) }; defaults to performance.now and the
//               global timers.
//   randomSeed  () → a seed 0 .. 2^32 - 1 for each board request; defaults to crypto.
//
// The session opens a closed box (state 'ready'): `view` is the 3D state view the renderer, picking
// and HUD read, the same object for the whole session. Flags may be placed before the first
// reveal and are kept; a left release on a flagged cell, and any chord, does nothing then. The
// first reveal of a closed, unflagged cell sends the board request for that cell — the box graph,
// the mine count, the first-click rule of Classic 2D (that cell alone is mine-free) and the
// no-guess setting — to the client (state 'generating'). `generating` { shown: true } is emitted
// only when the answer takes longer than generatingDelayMs, and { shown: false } when it arrives;
// no board action is accepted meanwhile. On a board, the flags placed before are put on it in the
// order they were placed, the reveal is applied, the timer starts and `started` is emitted (state
// 'playing'); the board's seed and generator version are kept. A failed request (a no-guess board
// not found, a rejected request, the worker failing) emits `failed` { reason, offers } (state
// 'failed') and the timer never starts; retry() asks again with a new seed, playStandard() asks
// for the same size with no-guess off — both for the same first cell, as Classic 2D does.
//
// Actions — reveal(c), toggleFlag(c), chord(c) — return { changed, ended, exploded, revealed,
// flagged, unflagged } (create3DGame's result); the first reveal returns a Promise of it instead
// (null when the board failed or the request was cancelled), except on a fixed board, which
// answers at once. An action the session does not accept (while generating, failed, paused,
// ended or left) returns null. A win or loss stops the timer and emits `finished` { state }.
// counts() and engineSummary() are the engine's counts and summary of the game on the board
// (js/engine/rules.js), null before it arrives; the 3D mode builds the game's summary from them.
//
// pause() stops the timer; during generation the request keeps running and the timer stays
// unstarted. restart() opens a fresh closed box and leave() ends the session; both cancel a
// pending generation, and a late answer is dropped.

import { createBoxGrid } from '../engine/box-grid.js';
import { PROFILE_3D } from '../engine/profiles.js';
import { createGame, createGameWithMines, PHASE } from '../engine/rules.js';
import { createStateView3D } from '../engine/state-view-3d.js';
import { createTimer, FAILURE_OFFERS, GENERATING_DELAY_MS } from '../classic2d/session.js';

export { FAILURE_OFFERS, GENERATING_DELAY_MS };

export const SESSION_STATE = Object.freeze({
  READY: 'ready',
  GENERATING: 'generating',
  PLAYING: 'playing',
  FAILED: 'failed',
  WON: 'won',
  LOST: 'lost',
  LEFT: 'left',
});

export const SESSION_EVENTS = Object.freeze(['generating', 'started', 'failed', 'finished']);

const defaultClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

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
  };
}

const nothing = () => ({ changed: new Int32Array(0), ended: false, exploded: false, revealed: 0, flagged: 0, unflagged: 0 });

export function createSession({
  board: choice,
  client,
  clock = defaultClock,
  randomSeed = defaultSeed,
  generatingDelayMs = GENERATING_DELAY_MS,
}) {
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
  let firstCell;
  let token = 0; // identifies the board request in flight; a stale answer is dropped
  let delayHandle = null;
  let generatingShown = false;

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
    firstCell = -1;
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
    for (const c of preOrder) { play.toggleFlag(c); markOwn(c); }
    base = before + 1;
    const r = play.reveal(firstCell);
    state = SESSION_STATE.PLAYING;
    timer.start();
    if (paused) timer.pause();
    emit('started', { changed: r.changed });
    return afterAction(r);
  }

  function fail(reason) {
    state = SESSION_STATE.FAILED;
    failure = { reason, offers: [...FAILURE_OFFERS] };
    emit('failed', failure);
    return null;
  }

  // Ask for a board around `firstCell`; resolves with the first reveal's result, or null.
  function requestBoard() {
    const mine = ++token;
    state = SESSION_STATE.GENERATING;
    failure = null;
    seed = randomSeed();
    delayHandle = clock.setTimeout(() => {
      delayHandle = null;
      if (mine !== token || state !== SESSION_STATE.GENERATING) return;
      generatingShown = true;
      emit('generating', { shown: true });
    }, generatingDelayMs);
    const request = { graph: { kind: 'box', X, Y, Z }, mineCount: board.mines, firstClick: firstCell, noGuess: board.noGuess, seed };
    return client.request(request).then(
      (result) => {
        if (mine !== token) return null;
        hideGenerating();
        if (result?.cancelled) return null;
        if (!result || !result.ok) return fail(result?.reason ?? 'no board');
        seed = result.seed;
        generatorVersion = result.generatorVersion;
        return begin(result.mines);
      },
      (error) => {
        if (mine !== token) return null;
        hideGenerating();
        return fail(error?.message || String(error));
      },
    );
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
      firstCell = c;
      return fixed ? begin(fixed) : requestBoard();
    }
    if (state !== SESSION_STATE.PLAYING) return null;
    return afterAction(play[kind](c));
  }

  fresh();

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
    elapsedMs: () => timer.elapsedMs(),
    seconds: () => timer.seconds(),
    counts: () => (play ? play.counts() : null),
    engineSummary: () => (play ? play.engineSummary() : null),

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
      if (state !== SESSION_STATE.FAILED) return null;
      return requestBoard();
    },
    /** After a failure: the same size with no-guess off, for the same cell. */
    playStandard() {
      if (state !== SESSION_STATE.FAILED) return null;
      board = Object.freeze({ ...board, noGuess: false });
      return requestBoard();
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
      dropPending();
      base += 1 + inner().version;
      for (let c = 0; c < n; c++) markOwn(c);
      fresh();
    },
    /** End the session, releasing the pending request. */
    leave() {
      if (state === SESSION_STATE.LEFT) return;
      dropPending();
      timer.stop();
      state = SESSION_STATE.LEFT;
    },
  };
}
