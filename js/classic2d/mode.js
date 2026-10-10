// Classic 2D mode: the game session (js/classic2d/session.js), the board view and its pointer and
// cursor inputs behind the game shell's mode contract (js/shell/mode-host.js). DOM-free: the shell
// hands in its flow; the mounts default to the browser ones and are only called by start().
//
// createClassic2DMode(report, { flow, lastChoice, createClient?, mount?, clock?, randomSeed?,
//                               generatingDelayMs? }) → mode
//   flow        the shell's side:
//                 openBoardChoice(choice)  show the board choice preselected with `choice`
//                 show()                   show the board screen (the overlay bar above the area
//                                          container() fills)
//                 container()              the element the board view fills
//                 hud({ seconds, minesLeft })  the overlay bar's timer and mine counter
//                 board({ width, height, mines })  the board the overlay bar names
//                 generating(shown)        the "generating" state of a slow first click
//                 failed(failure | null)   a failed board and its offers, or none
//   lastChoice  createLastChoice (js/classic2d/board-setup.js): start() saves the choice played,
//               openBoardChoice() offers lastChoice.current; loadChoice() reads it from storage.
//   createClient  () → a generation client (js/generation/client.js), one per game.
//   mount       { board: mountBoardView, pointer: mountPointerInput, cursor: mountCursorInput,
//               sampler: mountSampler2D }; without `sampler`, no movement is recorded.
//   clock, randomSeed, generatingDelayMs  passed to the session.
//
// The contract: openBoardChoice(), start(choice), pause(), resume(), restart(), leave(), summary(),
// replay(summary). The mode reports started and canPause(true) when the first click's board
// arrives, and finished(summary, replay) and canPause(false) at a win or a loss; the host reports
// abandoned from summary() and replay(summary), the session's recording sealed with that summary
// (null before the first click). start() mounts a fresh board view, inputs and movement sampler in
// the container; restart() and leave() destroy them (releasing the canvas) and leave the session,
// cancelling a pending generation and discarding its recording; restart() then starts the same
// choice again — the session's, so a board played standard after a no-guess failure stays
// standard.
//
// Shell side: hideBoard(hidden) hides the board whenever the pause card shows — the session pauses
// with it (a no-op before the first click and after the end), the inputs drop what they hold and
// take nothing while it is hidden; pause() is hideBoard(true) and resume() hideBoard(false) plus
// flow.show(). tick() pushes the timer and mine counter to flow.hud when either changed and drives
// the movement sampler (call it every frame); every action pushes them at once. The cursor input's
// moves reach the sampler as well as the view. pad(poll, now) hands the shell's controller poll
// to the cursor input. retry() and playStandard() answer a failed board's offer. status() is
// { state: 'playing' | 'won' | 'lost', time (seconds), minesLeft } for the pause card.

import { createSession, SESSION_STATE } from './session.js';
import { normaliseChoice } from './board-setup.js';
import { mountBoardView } from './board-view.js';
import { mountPointerInput } from './pointer-input.js';
import { mountCursorInput } from './cursor-input.js';
import { mountSampler2D } from '../replay/sampler-2d.js';
import { createGenerationClient } from '../generation/client.js';

export const MODE_ID = 'classic-2d';

const BROWSER_MOUNTS = Object.freeze({ board: mountBoardView, pointer: mountPointerInput, cursor: mountCursorInput, sampler: mountSampler2D });

export function createClassic2DMode(report, {
  flow,
  lastChoice,
  createClient = () => createGenerationClient(),
  mount = BROWSER_MOUNTS,
  clock,
  randomSeed,
  generatingDelayMs,
}) {
  let game = null; // { session, view, pointer, cursor, sampler, offs }
  let hidden = false;
  let shown = { seconds: null, minesLeft: null };

  const push = () => {
    if (!game) return;
    const h = { seconds: game.session.seconds(), minesLeft: game.session.minesLeft };
    if (h.seconds === shown.seconds && h.minesLeft === shown.minesLeft) return;
    shown = h;
    flow.hud(h);
  };

  function drop() {
    if (!game) return;
    const g = game;
    game = null;
    g.session.leave();
    for (const off of g.offs) off();
    g.pointer.destroy();
    g.cursor.destroy();
    g.sampler?.destroy();
    g.view.destroy();
    flow.generating(false);
    flow.failed(null);
  }

  function open(choice) {
    const c = normaliseChoice(choice);
    if (!c) throw new RangeError(`invalid board choice: ${JSON.stringify(choice)}`);
    drop();
    const options = { choice: c, client: createClient() };
    if (clock) options.clock = clock;
    if (randomSeed) options.randomSeed = randomSeed;
    if (generatingDelayMs !== undefined) options.generatingDelayMs = generatingDelayMs;
    const session = createSession(options);
    hidden = false;
    shown = { seconds: null, minesLeft: null };
    flow.show();
    const { width, height, mines } = session.setup;
    flow.board({ width, height, mines });
    const view = mount.board({ container: flow.container(), grid: session.setup.grid });
    view.setGame(session.game);
    // The inputs see the board paused while it is hidden, whatever the session's own state. An
    // action before the first reveal (a flag) changes the board without a session event: redraw it.
    const act = (kind) => (c) => {
      const before = session.state;
      const r = session[kind](c);
      if (before === SESSION_STATE.READY && r && !(r instanceof Promise) && r.changed?.length) {
        view.update(r.changed);
        push();
      }
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
      session.on('finished', ({ summary, replay }) => { push(); report.canPause(false); report.finished(summary, replay); }),
      session.on('generating', ({ shown: on }) => flow.generating(on)),
      session.on('failed', (failure) => flow.failed(failure)),
    ];
    game = { session, view, pointer, cursor, sampler, offs };
    push();
  }

  function hideBoard(on) {
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
      drop();
    },
    summary() { return game ? game.session.summary() : null; },
    replay(summary) { return game ? game.session.replay(summary) : null; },

    hideBoard,
    tick() {
      push();
      game?.sampler?.tick();
    },
    pad(poll, now) { game?.cursor.pad(poll, now); },
    retry: () => answer('retry'),
    playStandard: () => answer('playStandard'),
    loadChoice: () => lastChoice.load(),
    status() {
      if (!game) return null;
      const s = game.session.state;
      const state = s === SESSION_STATE.WON ? 'won' : s === SESSION_STATE.LOST ? 'lost' : 'playing';
      return { state, time: game.session.elapsedMs() / 1000, minesLeft: game.session.minesLeft };
    },
    get boardHidden() { return hidden; },
  };
}
