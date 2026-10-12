// Pause controller: the one owner of pause, resume, restart and back to menu for every mode, and
// the shell's hand-offs of a game's summary. DOM-free: the shell hands in the mode host, the pause
// card, the confirmation prompt and the leave-page guard.
//
// Pause rules. Pause applies only to a started, unfinished game (`inProgress`): it asks the active
// mode to pause (the mode stops its timer and board input), shows the pause card and passes the
// mode's summary() to the in-progress hand-off. Before the first click or after the game ends, an
// asked-for pause (key, controller, the overlay's pause button) opens the pause card only, with
// no timer to stop; an automatic pause (window blur, tab hidden) does nothing then, nor while the
// board is not in play. While the first click's board is being generated, Back (Esc, the
// controller's back button) cancels the generation instead of pausing; every pause source still
// pauses. The board is hidden whenever the pause card shows. Resume always goes through the mode.
// Main menu during a started, unfinished game asks for confirmation first, saying the game will
// count as a loss. Restart (the pause card's Restart, F2, Start + Y) of such a game proceeds at once
// and still reports it abandoned, a loss; the first such restart of the session (the controller's
// life, one load of the game) calls restarted() so the shell can say once that it counted as a loss
// (RESTART_NOTICE). Under the "Always ask before restarting" setting (askRestart()) restart asks
// the same confirmation first, from the pause card — a restart from play pauses to show it — and
// nothing is said after. A restart before the first click, while the first board is generated or
// after the end abandons nothing: it never asks and says nothing.
//
// The restart inputs (restartInput): F2 and the controller's Start + Y restart in play and on the
// pause card (RESTART_SCREENS); R on the results screen is Play again; nothing elsewhere, nor while
// the shell blocks them (the 3D end delay, an open confirmation or controls modal).
//
// Hand-offs, the attachment points later features fill (attach(name, listener)):
//   finished(summary, mode, replay)   every finished game; the results flow (js/results/flow.js)
//                                     records it, routes to the `results` screen and adds the
//                                     replay to the replay library
//   abandoned(summary, mode, replay)  every abandoned game (restart, back to menu, a replacing
//                                     start); no results screen. The records store records it and
//                                     the results flow adds the replay to the replay library
//   replay is the game's sealed replay ({ blob, listing }, js/replay/recorder.js), or null when
//   its mode passed none.
//   inProgress(summary, mode)  at game started, at every pause of a started, unfinished game and
//                              on pagehide, so a game ended by closing the page counts as a loss
// The leave-page guard is armed (guard(true)) at game started and disarmed when the game
// finishes, is abandoned or its mode fails.

/** The inputs that can ask for a pause. */
export const PAUSE_SOURCES = Object.freeze(['key', 'pad', 'button', 'blur', 'hidden']);
/** The pause sources that fire on their own: window blur and tab hidden. */
export const AUTO_SOURCES = Object.freeze(['blur', 'hidden']);
/** The hand-offs a feature can attach to. */
export const HAND_OFFS = Object.freeze(['finished', 'abandoned', 'inProgress']);
/** The confirmations back to menu, and restart under "Always ask", ask during a started, unfinished game. */
export const CONFIRMATIONS = Object.freeze({
  restart: Object.freeze({ action: 'restart', message: 'Restart this game? It will count as a loss.', confirmLabel: 'Restart' }),
  menu: Object.freeze({ action: 'menu', message: 'Leave this game for the main menu? It will count as a loss.', confirmLabel: 'Main menu' }),
});
/** What the shell says once per session, at the first restart that abandons a game. */
export const RESTART_NOTICE = 'That game counted as a loss. Turn on "Always ask before restarting" in Settings to be asked first.';
/** The shell screens where F2 and Start + Y restart: play in either mode and the pause card. */
export const RESTART_SCREENS = Object.freeze(['playing', 'classic-2d', 'paused']);

/**
 * What a restart input does on `screen`: 'restart' for F2 ('F2') or Start + Y ('pad') in play or
 * on the pause card, 'playAgain' for R ('KeyR') on the results screen, else null — and null for any
 * input while `blocked`.
 */
export function restartInput(input, { screen, blocked = false }) {
  if (blocked) return null;
  if ((input === 'F2' || input === 'pad') && RESTART_SCREENS.includes(screen)) return 'restart';
  if (input === 'KeyR' && screen === 'results') return 'playAgain';
  return null;
}

/**
 * modes: the mode host. showCard({ note }): show the pause
 * card over the hidden board. isPaused(): whether the pause card already shows. onBoard(): whether the board is in play.
 * confirm(request, proceed): ask `request` (one of CONFIRMATIONS) on the pause card and call proceed() on yes.
 * goMenu(): show the main menu. guard(on): arm or disarm the leave-page guard.
 * cancelGeneration(): cancel the active mode's board being generated; whether there was one.
 * askRestart(): whether the "Always ask before restarting" setting is on.
 * restarted(): the first restart of the session that abandoned a game without asking.
 */
export function createPauseController({
  modes, showCard, isPaused = () => false, onBoard = () => true, confirm, goMenu, guard = () => {},
  cancelGeneration = () => false, askRestart = () => false, restarted = () => {},
}) {
  const listeners = Object.fromEntries(HAND_OFFS.map((h) => [h, new Set()]));
  const handOff = (name, summary, mode, replay = null) => {
    for (const fn of [...listeners[name]]) {
      try { fn(summary, mode, replay); } catch (err) { console.error(err); }
    }
  };
  const inProgress = () => { const s = modes.state; return s.mode !== null && s.started && !s.finished; };
  const keep = () => { if (inProgress()) handOff('inProgress', modes.summary(), modes.active); };
  const guarded = (request, proceed) => { if (inProgress()) confirm(request, proceed); else proceed(); };
  let told = false; // restarted() is called once per session

  const offs = [
    modes.on('started', ({ mode, summary }) => { guard(true); handOff('inProgress', summary, mode); }),
    modes.on('finished', ({ mode, summary, replay }) => { guard(false); handOff('finished', summary, mode, replay); }),
    modes.on('abandoned', ({ mode, summary, replay }) => { guard(false); handOff('abandoned', summary, mode, replay); }),
    modes.on('failed', () => guard(false)),
  ];

  return {
    /** Whether the active mode's game is started and unfinished. */
    get inProgress() { return inProgress(); },
    /**
     * Pause from `source` (one of PAUSE_SOURCES); opts.note is shown on the card.
     * Returns whether the pause card was opened.
     */
    pause(source = 'key', { note = '' } = {}) {
      if (!PAUSE_SOURCES.includes(source)) throw new Error(`unknown pause source "${source}"`);
      if (modes.active === null || isPaused()) return false;
      const running = inProgress();
      if (AUTO_SOURCES.includes(source) && !(running && onBoard())) return false;
      if (running) modes.pause({ note, source });
      showCard({ note });
      keep();
      return true;
    },
    /**
     * Back on the board from `source` ('key' or 'pad'): cancels a board being generated, else
     * pauses. Returns whether the pause card was opened.
     */
    back(source = 'key') {
      if (cancelGeneration()) return false;
      return this.pause(source);
    },
    /** Resume through the mode; source is 'pointer' | 'key' | 'pad'. */
    resume(source = 'pointer') { if (modes.active !== null) modes.resume({ source }); },
    /**
     * A new game with the same board choice; source is 'pointer' | 'key' | 'pad'. A started,
     * unfinished game is abandoned at once, or after confirmation on the pause card under "Always ask".
     */
    restart(source = 'pointer') {
      if (modes.active === null) return;
      if (!inProgress()) { modes.restart({ source }); return; }
      if (askRestart()) {
        if (!isPaused()) this.pause(source === 'pointer' ? 'button' : source);
        confirm(CONFIRMATIONS.restart, () => modes.restart({ source }));
        return;
      }
      modes.restart({ source });
      if (!told) {
        told = true;
        restarted();
      }
    },
    /** Leave the mode for the main menu, after confirmation during a started, unfinished game. */
    toMenu() {
      guarded(CONFIRMATIONS.menu, () => { modes.leave(); goMenu(); });
    },
    /** The page is being hidden for good (pagehide): keep the game's summary so far. */
    pageHide() { keep(); },
    /** Attach a listener to a hand-off; returns its detach. */
    attach(name, listener) {
      if (!listeners[name]) throw new Error(`unknown hand-off "${name}"`);
      listeners[name].add(listener);
      return () => listeners[name].delete(listener);
    },
    dispose() { for (const off of offs) off(); },
  };
}
