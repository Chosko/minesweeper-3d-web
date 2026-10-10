// Mode host: the registry of mode front-ends and the one way the shell reaches a mode.
// DOM-free: a mode brings its own screens and input; the host only routes the contract.
//
// The mode contract. A mode is registered by id as a factory `(report) => mode`; the mode provides
//   openBoardChoice()   show the mode's board choice
//   start(choice)       start a new game with this board choice
//   pause(opts)         stop the mode's timer and stop it accepting board input
//   resume(opts)        continue the paused game; opts.source is the input that asked
//                       ('pointer' | 'key' | 'pad')
//   restart(opts)       discard the game and start a new one with the same board choice;
//                       opts.source as for resume
//   leave()             discard the game and release everything the mode holds
//                       (pointer lock, canvas, worker requests)
//   summary()           the game's summary so far: null before the first click
//   replay(summary)     optional: the game's replay sealed with that summary (js/replay/recorder.js),
//                       or null; a mode without it records no replays
//   failureScreen       the router screen the shell shows when the mode reports a failure
// and reports back through `report`:
//   report.started()                  the first click started the game
//   report.finished(summary, replay)  the game ended; the summary carries its outcome, the
//                                     replay is the sealed recording or absent
//   report.canPause(bool)             whether a pause now stops a running game
//   report.failed(reason)             the mode cannot run (it failed to start, or lost what it
//                                     runs on)
// The host reports `abandoned` on the mode's behalf: restart(), leave() and a new start() on a
// started, unfinished game first report `abandoned` with summary(), outcome abandoned — the
// outcome summary() also has for such a game at any moment — and replay(summary). A game left
// before its first click reports nothing. Reports from a mode that is not the active one are
// ignored. The shell listens with on(event, listener): `started` ({ mode, summary }), `finished`
// and `abandoned` ({ mode, summary, replay }, replay null when the mode passed none), `canPause`
// ({ mode, canPause }) and `failed` ({ mode, reason, screen }).

/** The methods every mode provides. */
export const MODE_METHODS = Object.freeze(['openBoardChoice', 'start', 'pause', 'resume', 'restart', 'leave', 'summary']);
/** The reports the host passes on to the shell. */
export const MODE_EVENTS = Object.freeze(['started', 'finished', 'abandoned', 'canPause', 'failed']);

export function createModeHost() {
  const modes = new Map();
  const listeners = Object.fromEntries(MODE_EVENTS.map((t) => [t, new Set()]));
  let active = null;
  let game = { started: false, finished: false, canPause: false };

  const emit = (type, payload) => {
    for (const fn of [...listeners[type]]) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  };
  const lookup = (id) => {
    if (!modes.has(id)) throw new Error(`unknown mode "${id}"`);
    return modes.get(id);
  };
  const current = () => (active === null ? null : modes.get(active));
  const fresh = () => { game = { started: false, finished: false, canPause: false }; };
  const inProgress = () => active !== null && game.started && !game.finished;
  const summary = () => {
    const mode = current();
    if (!mode || (!game.started && !game.finished)) return null;
    const s = mode.summary();
    if (!s) return null;
    return inProgress() ? { ...s, outcome: 'abandoned' } : s;
  };
  const replayOf = (mode, s) => {
    if (!s || typeof mode?.replay !== 'function') return null;
    try { return mode.replay(s) ?? null; } catch (err) { console.error(err); return null; }
  };
  const abandonIfInProgress = () => {
    if (!inProgress()) return;
    const s = summary();
    emit('abandoned', { mode: active, summary: s, replay: replayOf(current(), s) });
  };
  const setCanPause = (id, value) => {
    if (game.canPause === value) return;
    game.canPause = value;
    emit('canPause', { mode: id, canPause: value });
  };

  const reportFor = (id) => {
    const live = () => active === id;
    return {
      started() {
        if (!live()) return;
        game.started = true;
        emit('started', { mode: id, summary: summary() });
      },
      finished(s, replay) {
        if (!live()) return;
        game.finished = true;
        emit('finished', { mode: id, summary: s ?? modes.get(id).summary(), replay: replay ?? null });
      },
      canPause(value) { if (live()) setCanPause(id, !!value); },
      failed(reason) {
        if (!live()) return;
        emit('failed', { mode: id, reason: String(reason), screen: modes.get(id).failureScreen ?? null });
      },
    };
  };

  const host = {
    /** Register a mode factory under `id`; returns the mode it built. */
    register(id, factory) {
      if (modes.has(id)) throw new Error(`mode "${id}" is already registered`);
      if (typeof factory !== 'function') throw new Error(`mode "${id}" must be registered as a factory (report) => mode`);
      const mode = factory(reportFor(id));
      const missing = MODE_METHODS.filter((m) => typeof mode?.[m] !== 'function');
      if (missing.length) throw new Error(`mode "${id}" lacks ${missing.join(', ')}`);
      modes.set(id, mode);
      return mode;
    },
    has: (id) => modes.has(id),
    get ids() { return [...modes.keys()]; },
    /** The id of the mode whose game the shell is hosting, or null. */
    get active() { return active; },
    /** Whether the active mode's game is started, finished and pausable, as the mode reported it. */
    get state() { return { mode: active, ...game }; },
    on(type, listener) {
      if (!listeners[type]) throw new Error(`unknown mode event "${type}"`);
      listeners[type].add(listener);
      return () => listeners[type].delete(listener);
    },
    openBoardChoice(id) { lookup(id).openBoardChoice(); },
    /** Start a game in mode `id`; a game in progress in any mode is abandoned and left first. */
    start(id, choice) {
      const mode = lookup(id);
      if (active !== null) host.leave();
      active = id;
      fresh();
      try { mode.start(choice); } catch (err) { reportFor(id).failed(err?.message ?? err); }
    },
    pause(opts) { current()?.pause(opts); },
    resume(opts) { current()?.resume(opts); },
    restart(opts) {
      const mode = current();
      if (!mode) return;
      abandonIfInProgress();
      setCanPause(active, false);
      fresh();
      mode.restart(opts);
    },
    leave() {
      const mode = current();
      if (!mode) return;
      const id = active;
      abandonIfInProgress();
      setCanPause(id, false);
      mode.leave();
      active = null;
      fresh();
    },
    summary,
  };
  return host;
}
