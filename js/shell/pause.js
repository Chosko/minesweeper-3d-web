// Pause controller: the one owner of pause, resume, restart and back to menu for every mode, and
// the shell's hand-offs of a game's summary. DOM-free: the shell hands in the mode host, the pause
// card, the confirmation prompt, the router and the leave-page guard.
//
// Pause rules. Pause applies only to a started, unfinished game (`inProgress`): it asks the active
// mode to pause (the mode stops its timer and board input), shows the pause card and passes the
// mode's summary() to the in-progress hand-off. Before the first click or after the game ends, an
// asked-for pause (key, controller, the overlay's pause button) opens the pause card only, with
// no timer to stop; an automatic pause (window blur, tab hidden) does nothing then, nor while the
// board is not in play. The board is hidden whenever the pause card shows. Resume always goes through the mode.
// Restart and back to menu during a started, unfinished game ask for confirmation first, saying
// the game will count as a loss.
//
// Hand-offs, the attachment points later features fill (attach(name, listener)):
//   finished(summary, mode)    every finished game; the shell then routes to the `results` screen
//                              with { summary, mode } once the router has one
//   abandoned(summary, mode)   every abandoned game (restart, back to menu, a replacing start);
//                              no results screen
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
/** The confirmations restart and back to menu ask during a started, unfinished game. */
export const CONFIRMATIONS = Object.freeze({
  restart: Object.freeze({ action: 'restart', message: 'Restart this game? It will count as a loss.', confirmLabel: 'Restart' }),
  menu: Object.freeze({ action: 'menu', message: 'Leave this game for the main menu? It will count as a loss.', confirmLabel: 'Main menu' }),
});

/**
 * modes: the mode host. router: { has, go } (the results route). showCard({ note }): show the pause
 * card over the hidden board. isPaused(): whether the pause card already shows. onBoard(): whether the board is in play.
 * confirm(request, proceed): ask `request` (one of CONFIRMATIONS) and call proceed() on yes.
 * goMenu(): show the main menu. guard(on): arm or disarm the leave-page guard.
 */
export function createPauseController({
  modes, router = null, showCard, isPaused = () => false, onBoard = () => true, confirm, goMenu, guard = () => {},
}) {
  const listeners = Object.fromEntries(HAND_OFFS.map((h) => [h, new Set()]));
  const handOff = (name, summary, mode) => {
    for (const fn of [...listeners[name]]) {
      try { fn(summary, mode); } catch (err) { console.error(err); }
    }
  };
  const inProgress = () => { const s = modes.state; return s.mode !== null && s.started && !s.finished; };
  const keep = () => { if (inProgress()) handOff('inProgress', modes.summary(), modes.active); };
  const guarded = (request, proceed) => { if (inProgress()) confirm(request, proceed); else proceed(); };

  const offs = [
    modes.on('started', ({ mode, summary }) => { guard(true); handOff('inProgress', summary, mode); }),
    modes.on('finished', ({ mode, summary }) => {
      guard(false);
      handOff('finished', summary, mode);
      if (router?.has('results')) router.go('results', { data: { summary, mode } });
    }),
    modes.on('abandoned', ({ mode, summary }) => { guard(false); handOff('abandoned', summary, mode); }),
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
    /** Resume through the mode; source is 'pointer' | 'key' | 'pad'. */
    resume(source = 'pointer') { if (modes.active !== null) modes.resume({ source }); },
    /** A new game with the same board choice, after confirmation during a started, unfinished game. */
    restart(source = 'pointer') {
      if (modes.active === null) return;
      guarded(CONFIRMATIONS.restart, () => modes.restart({ source }));
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
