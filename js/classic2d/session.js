// Classic 2D game session: owns one game from closed board to result. DOM-free.
//
// createSession({ choice, client, clock?, randomSeed?, generatingDelayMs? }) → session.
//   choice      a board choice (js/classic2d/board-setup.js); an invalid one throws a RangeError.
//   client      the generation client (js/generation/client.js): { request, cancel }.
//   clock       { now(), setTimeout(fn, ms), clearTimeout(h) }; defaults to performance.now and the
//               global timers.
//   randomSeed  () → a seed 0 .. 2^32 - 1 for each board request; defaults to crypto.
//
// The session opens a closed board (state 'ready'). The first reveal sends the board request for
// that cell to the client (state 'generating'); `generating` { shown: true } is emitted only when
// the answer takes longer than generatingDelayMs, and { shown: false } when it arrives. On a board,
// the reveal is applied, the timer starts and `started` { changed } is emitted (state 'playing').
// A failed request (a no-guess board not found, or the worker failing) emits `failed`
// { reason, offers } (state 'failed') and the timer never starts; retry() asks again with a new
// seed, playStandard() asks for the same size with no-guess off — both for the same first cell.
//
// Actions — reveal(c), toggleFlag(c), chord(c) — return the engine's result and emit `changed`
// { changed, ended }; the first reveal returns a Promise of its result instead (null when the
// board failed or the request was cancelled). An action the session does not accept (while
// generating, failed, paused, ended or left) returns null. `changed` is the engine's shared buffer:
// read or copy it before the next action.
//
// Win or loss stops the timer and emits `finished` { summary }. restart() and leave() after the
// first click and before the end emit `abandoned` { summary } first; before the first click nothing
// is reported. Both cancel a pending generation. summary() is the game's summary so far: null
// before the first click, outcome abandoned while playing, the finished summary after the end.
// Summaries are built by js/records/summary.js's buildSummary.

import { createGame, PHASE } from '../engine/rules.js';
import { getRuleProfile, REFERENCE_PROFILE } from '../engine/profiles.js';
import { buildSummary } from '../records/summary.js';
import { boardSetup } from './board-setup.js';

export const SESSION_STATE = Object.freeze({
  READY: 'ready',
  GENERATING: 'generating',
  PLAYING: 'playing',
  FAILED: 'failed',
  WON: 'won',
  LOST: 'lost',
  LEFT: 'left',
});

/** What a failed board offers: a new seed, or the same size with no-guess off. */
export const FAILURE_OFFERS = Object.freeze(['retry', 'standard']);

/** How long a board request may take before the "generating" state shows. */
export const GENERATING_DELAY_MS = 200;

export const SESSION_EVENTS = Object.freeze(['generating', 'started', 'changed', 'failed', 'finished', 'abandoned']);

const defaultClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
};

const defaultSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

// Elapsed play time: start(), pause(), resume(), stop(); elapsedMs() whole milliseconds for the
// result, seconds() whole seconds for display. A timer not yet started reads 0; a stopped one
// keeps its time.
export function createTimer({ now }) {
  let accumulated = 0;
  let since = null; // clock time of the running stretch's start
  let started = false;
  let stopped = false;
  const halt = () => {
    if (since !== null) { accumulated += now() - since; since = null; }
  };
  const elapsed = () => accumulated + (since === null ? 0 : now() - since);
  return {
    get started() { return started; },
    get running() { return since !== null; },
    get stopped() { return stopped; },
    start() {
      if (started) return;
      started = true;
      since = now();
    },
    pause() { halt(); },
    resume() {
      if (started && !stopped && since === null) since = now();
    },
    stop() {
      halt();
      stopped = true;
    },
    elapsedMs: () => Math.round(elapsed()),
    seconds: () => Math.floor(elapsed() / 1000),
  };
}

export function createSession({
  choice,
  client,
  clock = defaultClock,
  randomSeed = defaultSeed,
  generatingDelayMs = GENERATING_DELAY_MS,
}) {
  let setup = boardSetup(choice);
  const profile = getRuleProfile(REFERENCE_PROFILE);
  const listeners = Object.fromEntries(SESSION_EVENTS.map((t) => [t, new Set()]));

  let state;
  let game;
  let timer;
  let paused;
  let seed;
  let generatorVersion;
  let failure;
  let finalSummary;
  let firstCell;
  let token = 0; // identifies the board request in flight; a stale answer is dropped
  let delayHandle = null;
  let generatingShown = false;

  const emit = (type, payload) => {
    for (const fn of [...listeners[type]]) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  };

  function fresh() {
    game = createGame({ graph: setup.grid.graph, profile: profile.id, mineCount: setup.mines, dimensions: { width: setup.width, height: setup.height } });
    timer = createTimer({ now: clock.now });
    state = SESSION_STATE.READY;
    paused = false;
    seed = null;
    generatorVersion = null;
    failure = null;
    finalSummary = null;
    firstCell = -1;
  }

  function hideGenerating() {
    if (delayHandle !== null) { clock.clearTimeout(delayHandle); delayHandle = null; }
    if (generatingShown) {
      generatingShown = false;
      emit('generating', { shown: false });
    }
  }

  function summaryOf(engine) {
    return buildSummary({ engine, elapsedMs: timer.elapsedMs(), board: setup.identity, seed, generatorVersion });
  }

  function afterAction(result) {
    if (result.ended) {
      timer.stop();
      state = game.phase === PHASE.WON ? SESSION_STATE.WON : SESSION_STATE.LOST;
      finalSummary = summaryOf(game.summary());
      emit('finished', { summary: finalSummary });
    }
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
    return client.request(setup.request(firstCell, seed)).then(
      (result) => {
        if (mine !== token) return null;
        hideGenerating();
        if (result?.cancelled) return null;
        if (!result || !result.ok) return fail(result?.reason ?? 'no board');
        seed = result.seed;
        generatorVersion = result.generatorVersion;
        const r = game.supplyBoard(firstCell, result.mines);
        state = SESSION_STATE.PLAYING;
        timer.start();
        if (paused) timer.pause();
        emit('started', { changed: r.changed });
        emit('changed', { changed: r.changed, ended: r.ended });
        afterAction(r);
        return r;
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

  function abandonIfStarted() {
    if (state !== SESSION_STATE.PLAYING) return;
    const summary = summaryOf(game.counts());
    if (summary) emit('abandoned', { summary });
  }

  function act(kind, c) {
    if (paused) return null;
    if (state === SESSION_STATE.READY) {
      if (kind !== 'reveal') return game[kind](c); // nothing happens before the first reveal
      const r = game.reveal(c);
      if (r.boardNeeded < 0) return r;
      firstCell = r.boardNeeded;
      return requestBoard();
    }
    if (state !== SESSION_STATE.PLAYING) return null;
    const r = game[kind](c);
    emit('changed', { changed: r.changed, ended: r.ended });
    afterAction(r);
    return r;
  }

  fresh();

  return {
    get state() { return state; },
    get choice() { return setup.choice; },
    get setup() { return setup; },
    get game() { return game; },
    get seed() { return seed; },
    get generatorVersion() { return generatorVersion; },
    get generatingShown() { return generatingShown; },
    get paused() { return paused; },
    get failure() { return failure; },
    get minesLeft() { return game.minesLeft; },
    elapsedMs: () => timer.elapsedMs(),
    seconds: () => timer.seconds(),

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
      setup = boardSetup({ ...setup.choice, noGuess: false });
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

    /** Discard the game (reporting it abandoned if started) and open a new closed board. */
    restart() {
      if (state === SESSION_STATE.LEFT) return;
      abandonIfStarted();
      dropPending();
      fresh();
    },
    /** Discard the game (reporting it abandoned if started) and release the pending request. */
    leave() {
      if (state === SESSION_STATE.LEFT) return;
      abandonIfStarted();
      dropPending();
      timer.stop();
      state = SESSION_STATE.LEFT;
    },

    summary() {
      if (finalSummary) return finalSummary;
      if (state !== SESSION_STATE.PLAYING) return null;
      return summaryOf(game.counts());
    },
  };
}
