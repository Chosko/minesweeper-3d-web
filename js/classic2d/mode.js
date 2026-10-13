// Classic 2D mode: the game session (js/classic2d/session.js), the board view and its pointer and
// cursor inputs behind the game shell's mode contract (js/shell/mode-host.js). DOM-free: the shell
// hands in its flow; the mounts default to the browser ones and are only called by start().
//
// createClassic2DMode(report, { flow, lastChoice, createClient?, mount?, sound?, clock?, randomSeed?,
//                               generatingDelayMs?, place? }) → mode
//   flow        the shell's side:
//                 openBoardChoice(choice)  show the board choice preselected with `choice`
//                 show()                   show the board screen (the board's framed panel, its
//                                          edge carrying the overlay readouts, in the area
//                                          container() is)
//                 container()              the element the board view fills
//                 scale()?                 the board scale setting (js/classic2d/board-view.js
//                                          BOARD_SCALES) a new board opens at
//                 frame()?                 the room the panel's frame takes around the board,
//                                          { top, right, bottom, left, minWidth } (board-view.js)
//                 layout(layout)?          the board view's layout after every refit, to place
//                                          the panel (board-view.js panelRect) and to tell a
//                                          board that scrolls
//                 scrolled()?              the player scrolled the board (wheel or pan)
//                 hud({ seconds, minesLeft, clicks })  the overlay bar's timer, mine counter and
//                                          click counter (the session's clicks())
//                 board({ width, height, mines, noGuess })  the board the overlay bar names; again
//                                          when a failed board's offer plays it standard
//                 generating(shown)        the "generating" state of a slow first click
//                 progress(p | null)?      while it shows: { candidates, seconds }, again whenever
//                                          either changes; null when it hides
//                 failed(failure | null)   a failed board and its offers, or none
//   lastChoice  createLastChoice (js/classic2d/board-setup.js): start() saves the choice played,
//               openBoardChoice() offers lastChoice.current; loadChoice() reads it from storage.
//   createClient  () → a generation client (js/generation/client.js): called once, and the client
//               kept for the page and shared by every game of the mode.
//   mount       { board: mountBoardView, pointer: mountPointerInput, cursor: mountCursorInput,
//               sampler: mountSampler2D }; without `sampler`, no movement is recorded.
//   sound       the sound sink (js/audio.js's sfx: reveal, flag, chord, noop, explode, win); every
//               action the inputs take plays the 3D game's cue for its outcome (js/main.js), read
//               from the engine's changed cells: reveal(count) or chord(count) for the cells
//               opened, flag(on, count) for flags placed or removed, explode() alone for a loss,
//               noop() for an action while playing that changed no cell, then win() once at a
//               win. The first reveal's cue plays when its board arrives, not when the game was
//               restarted or left first; a flag or chord before the first reveal changes nothing
//               and a refused action (null) is silent. A cue never changes or gates an action;
//               without a sink nothing plays.
//   clock       { now, setTimeout, clearTimeout }: the session's and the end delay's; the global
//               ones by default.
//   randomSeed, generatingDelayMs, place  passed to the session; randomSeed also seeds the
//               pre-generated boards.
//
// warm() spawns and warms the client's worker (the board choice opening), so the first no-guess
// request of the page pays no worker start-up. When a game whose board was no-guess finishes (won
// or lost), the mode asks its worker for the next board of the same choice for its marked start
// cell (js/generation/start-cell.js) with a fresh seed, while the results screen shows; it holds
// that board until its next start or its leave. A start with the same choice — Play again, or
// Restart of the finished game — hands it to the new session, which marks the cell on the closed
// board (the view's setMark) until the first click; a start with any other choice, or the leave,
// discards it. Standard boards are never pre-generated, and an abandoned game pre-generates
// nothing.
//
// The contract: openBoardChoice(), start(choice), pause(), resume(), restart(), leave(), summary(),
// replay(summary). The mode reports started and canPause(true) when the first click's board
// arrives. At a win or a loss it reports canPause(false) at once and the end delay runs (`ending`
// true): for END_DELAY_MS, on the clock and so whether or not frames are drawn, the board plays
// the end effect (js/classic2d/end-effect.js) — the win pulse from the last action's cell and
// confetti, or the loss reveal wave from the exploded tile — then is drawn in its end state, and
// the mode reports finished(summary, replay) once, with the game's summary and replay at its end.
// During the delay a pause is ignored and the board takes no action; finishNow() ends it at once
// (any press of the player's, the page going away), so the game is reported finished, never left
// unfinished. The host reports abandoned from summary() and replay(summary), the session's
// recording sealed with that summary (null before the first click). start() mounts a fresh board
// view, inputs and movement sampler in the container; restart() and leave() destroy them
// (releasing the canvas) and leave the session, cancelling a pending generation or end delay and
// discarding its recording; restart() then starts the same choice again — the session's, so a
// board played standard after a no-guess failure stays standard.
//
// Shell side: setScale(scale) refits the open board at another board scale. hideBoard(hidden) hides
// the board whenever the pause card shows — the session pauses
// with it, its clock running on (a no-op before the first click and after the end), the inputs drop what they hold and
// take nothing while it is hidden; pause() is hideBoard(true) and resume() hideBoard(false) plus
// flow.show(); neither hides the board during the end delay. tick() pushes the timer, mine counter and click count to flow.hud when any changed,
// draws the end effect's frame during the end delay and drives the movement sampler (call it every
// frame); every action pushes them at once. The cursor input's
// ring reaches the sampler as well as the view: its cell while it shows, -1 when it hides. pad(poll, now) hands the shell's controller poll
// to the cursor input. retry() and playStandard() answer a failed board's offer; flow.failed's
// failure carries its `count` of failures in a row. cancelGeneration() cancels the first click's
// board while it is being generated, its card shown or not, back to the same closed board with
// nothing reported, and returns whether it did. status() is
// { state: 'playing' | 'won' | 'lost', time (seconds, the running time), minesLeft } for the pause
// card.

import { createSession, SESSION_STATE } from './session.js';
import { CELL, PHASE } from '../engine/rules.js';
import { normaliseChoice } from './board-setup.js';
import { mountBoardView } from './board-view.js';
import { mountPointerInput } from './pointer-input.js';
import { mountCursorInput } from './cursor-input.js';
import { mountSampler2D } from '../replay/sampler-2d.js';
import { createGenerationClient, pregenerate } from '../generation/client.js';
import { startCell } from '../generation/start-cell.js';
import { createEndEffect, WIN, LOSS } from './end-effect.js';

export const MODE_ID = 'classic-2d';

/** How long the end effect plays before the game is reported finished, for a win and a loss alike. */
export const END_DELAY_MS = 1000;

const BROWSER_MOUNTS = Object.freeze({ board: mountBoardView, pointer: mountPointerInput, cursor: mountCursorInput, sampler: mountSampler2D });
const globalClock = {
  now: () => globalThis.performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h),
};

// The exploded tile nearest the last action's cell (a chord can open more than one mine).
function explodedNear(game, cols, count, last) {
  let best = -1;
  let bestD = Infinity;
  for (let c = 0; c < count; c++) {
    if (game.cellState(c) !== CELL.EXPLODED) continue;
    const d = last < 0 ? 0 : Math.hypot((c % cols) - (last % cols), Math.floor(c / cols) - Math.floor(last / cols));
    if (d < bestD) { best = c; bestD = d; }
  }
  return best;
}

export function createClassic2DMode(report, {
  flow,
  lastChoice,
  createClient = () => createGenerationClient(),
  mount = BROWSER_MOUNTS,
  sound = null,
  clock,
  randomSeed,
  generatingDelayMs,
  place,
}) {
  const time = clock ?? globalClock;
  let game = null; // { session, view, pointer, cursor, sampler, offs, last, ending }
  let hidden = false;
  let shown = { seconds: null, minesLeft: null, clicks: null };
  let progressShown = null; // the progress last pushed to flow.progress
  let client = null; // the mode's one generation client, made on first use
  let ahead = null; // { choice, board }: the next no-guess board, pre-generated while the results show
  const clientOf = () => client ?? (client = createClient());
  const seedOf = randomSeed ?? (() => globalThis.crypto.getRandomValues(new Uint32Array(1))[0]);
  const sameChoice = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function discardAhead() {
    ahead?.board.discard();
    ahead = null;
  }

  // A finished no-guess game: the next board of the same choice, for its marked start cell.
  function pregenerateNext(session) {
    discardAhead();
    const { setup } = session;
    if (!setup.noGuess) return;
    const cell = startCell({ kind: 'square', width: setup.width, height: setup.height });
    ahead = { choice: session.choice, board: pregenerate(clientOf(), setup.request(cell, seedOf())) };
  }

  function pushProgress() {
    const p = game?.session.generatingShown ? game.session.progress : null;
    if (p === progressShown || (p && progressShown && p.candidates === progressShown.candidates && p.seconds === progressShown.seconds)) return;
    progressShown = p;
    flow.progress?.(p);
  }

  // The cue of an action's result, as the 3D game plays it; `before` is the session's state before it.
  function cue(session, kind, { changed, ended }, before) {
    const g = session.game;
    if (changed.length === 0) {
      if (before === SESSION_STATE.PLAYING && session.state === SESSION_STATE.PLAYING) sound.noop();
      return;
    }
    if (kind === 'toggleFlag') {
      let on = 0;
      for (const c of changed) if (g.cellState(c) === CELL.FLAGGED) on += 1;
      sound.flag(on >= changed.length - on, changed.length);
    } else if (g.phase === PHASE.LOST) {
      sound.explode();
    } else {
      let opened = 0;
      for (const c of changed) if (g.cellState(c) === CELL.REVEALED) opened += 1;
      if (opened > 0) sound[kind === 'chord' ? 'chord' : 'reveal'](opened);
    }
    if (ended && g.phase === PHASE.WON) sound.win();
  }

  const push = () => {
    if (!game) return;
    const h = { seconds: game.session.seconds(), minesLeft: game.session.minesLeft, clicks: game.session.clicks() };
    if (h.seconds === shown.seconds && h.minesLeft === shown.minesLeft && h.clicks === shown.clicks) return;
    shown = h;
    flow.hud(h);
  };

  function drop() {
    if (!game) return;
    const g = game;
    game = null;
    if (g.ending) { time.clearTimeout(g.ending.handle); g.ending = null; }
    g.session.leave();
    for (const off of g.offs) off();
    g.pointer.destroy();
    g.cursor.destroy();
    g.sampler?.destroy();
    g.view.destroy();
    flow.generating(false);
    if (progressShown) { progressShown = null; flow.progress?.(null); }
    flow.failed(null);
  }

  function open(choice) {
    const c = normaliseChoice(choice);
    if (!c) throw new RangeError(`invalid board choice: ${JSON.stringify(choice)}`);
    drop();
    const taken = ahead && sameChoice(ahead.choice, c) ? ahead.board : null;
    if (!taken) discardAhead();
    ahead = null;
    const options = { choice: c, client: clientOf(), pregenerated: taken };
    if (clock) options.clock = clock;
    if (randomSeed) options.randomSeed = randomSeed;
    if (generatingDelayMs !== undefined) options.generatingDelayMs = generatingDelayMs;
    if (place) options.place = place;
    const session = createSession(options);
    hidden = false;
    shown = { seconds: null, minesLeft: null, clicks: null };
    flow.show();
    const { width, height, mines, noGuess } = session.setup;
    flow.board({ width, height, mines, noGuess });
    const view = mount.board({
      container: flow.container(),
      grid: session.setup.grid,
      scale: flow.scale?.(),
      frame: flow.frame?.(),
      onLayout: (layout) => flow.layout?.(layout),
      onUserScroll: () => flow.scrolled?.(),
    });
    view.setGame(session.game);
    view.setMark(session.markedCell);
    // The inputs see the board paused while it is hidden, whatever the session's own state. An
    // action before the first reveal (a flag) changes the board without a session event: redraw it.
    let last = -1; // the cell of the last action the inputs took: the win pulse's origin
    const act = (kind) => (c) => {
      last = c;
      const before = session.state;
      const r = session[kind](c);
      if (r instanceof Promise) {
        if (sound) r.then((res) => { if (res) cue(session, kind, res, before); });
        return r;
      }
      if (before === SESSION_STATE.READY && r?.changed?.length) {
        view.update(r.changed);
        push();
      }
      if (sound && r) cue(session, kind, r, before);
      return r;
    };
    const gate = Object.create(session, {
      paused: { get: () => session.paused || hidden },
      reveal: { value: act('reveal') },
      toggleFlag: { value: act('toggleFlag') },
      chord: { value: act('chord') },
    });
    const sampler = mount.sampler ? mount.sampler({ view, session }) : null;
    const cursorView = Object.create(view, {
      setCursor: { value: (c) => { view.setCursor(c); sampler?.cursor(c); } },
    });
    const pointer = mount.pointer({ view, session: gate });
    const cursor = mount.cursor({ view: cursorView, session: gate });
    const offs = [
      session.on('started', () => { report.started(); report.canPause(true); }),
      session.on('changed', ({ changed }) => { view.update(changed); push(); }),
      session.on('finished', ({ summary, replay }) => {
        push();
        report.canPause(false);
        const g = game;
        if (g?.session !== session) return;
        pregenerateNext(session);
        const { width: cols, height: rows } = session.setup;
        const won = session.state === SESSION_STATE.WON;
        const origin = won ? last : explodedNear(session.game, cols, cols * rows, last);
        const effect = createEndEffect({ kind: won ? WIN : LOSS, cols, rows, origin, duration: END_DELAY_MS });
        g.ending = { summary, replay, effect, t0: time.now(), handle: time.setTimeout(() => finish(g), END_DELAY_MS) };
        view.showEffect(effect, 0);
      }),
      session.on('generating', ({ shown: on }) => { flow.generating(on); pushProgress(); }),
      session.on('mark', ({ cell }) => view.setMark(cell)),
      session.on('failed', (failure) => flow.failed(failure)),
    ];
    game = { session, view, pointer, cursor, sampler, offs, ending: null };
    push();
  }

  // The end delay is over, or cut short: the board in its end state, then game finished, once.
  function finish(g) {
    if (game !== g || !g.ending) return;
    const { summary, replay, handle } = g.ending;
    time.clearTimeout(handle);
    g.ending = null;
    g.view.showEffect(null);
    report.finished(summary, replay);
  }

  function hideBoard(on) {
    if (game?.ending) return; // the end delay: the board stays shown, playing its end effect
    hidden = !!on;
    if (!game) return;
    if (hidden) {
      game.session.pause();
      game.pointer.input.reset();
      game.cursor.input.reset();
    } else {
      game.session.resume();
    }
    game.view.setHidden(hidden);
  }

  const answer = (what) => {
    if (!game || game.session.state !== SESSION_STATE.FAILED) return null;
    flow.failed(null);
    return game.session[what]();
  };

  return {
    openBoardChoice() { flow.openBoardChoice(lastChoice.current); },
    /** The board choice opens: spawn and warm the worker, so the first no-guess board pays no start-up. */
    warm() { return clientOf().warm(); },
    start(choice) {
      open(choice);
      Promise.resolve(lastChoice.save(game.session.choice)).catch(() => {}); // storage never stops a game
    },
    pause() { hideBoard(true); },
    resume() {
      hideBoard(false);
      flow.show();
    },
    restart() {
      if (!game) return;
      open(game.session.choice);
    },
    leave() {
      hidden = false;
      discardAhead();
      drop();
    },
    summary() { return game ? game.session.summary() : null; },
    replay(summary) { return game ? game.session.replay(summary) : null; },
    /** Whether the end delay is running: the game is over and not yet reported finished. */
    get ending() { return !!game?.ending; },
    /** Ends a running end delay now (a press of the player's, the page going away): game finished, once. */
    finishNow() { if (game?.ending) finish(game); },

    hideBoard,
    setScale(scale) { game?.view.setScale(scale); },
    tick() {
      push();
      pushProgress();
      if (game?.ending) game.view.showEffect(game.ending.effect, time.now() - game.ending.t0);
      game?.sampler?.tick();
    },
    pad(poll, now) { game?.cursor.pad(poll, now); },
    retry: () => answer('retry'),
    cancelGeneration() { return game ? game.session.cancel() : false; },
    playStandard() {
      if (game?.session.state !== SESSION_STATE.GENERATING && game?.session.state !== SESSION_STATE.FAILED) return null;
      flow.failed(null);
      const r = game.session.playStandard();
      if (r && game) { const { width, height, mines, noGuess } = game.session.setup; flow.board({ width, height, mines, noGuess }); }
      return r;
    },
    loadChoice: () => lastChoice.load(),
    status() {
      if (!game) return null;
      const s = game.session.state;
      const state = s === SESSION_STATE.WON ? 'won' : s === SESSION_STATE.LOST ? 'lost' : 'playing';
      return { state, time: game.session.elapsedMs() / 1000, minesLeft: game.session.minesLeft };
    },
    get boardHidden() { return hidden; },
    /** The open board's view, or null: for the shell's debug hook. */
    get boardView() { return game?.view ?? null; },
  };
}
