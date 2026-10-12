// First-use hints: what a new player has been taught, kept in the platform-storage document
// `shell.firstUse` beside `shell.lastMode`, and the rules for when each hint shows. DOM-free: the
// shell (js/main.js) hands in the storage interface and the records store, and draws the hints.
//
// The document: { games: { [mode]: count }, finished3D, autoHideToast, aimHint, scrollHint,
//                 dismissed: { [mode]: bool } } for the modes 'classic-2d' and '3d'.
//   games         games counted per mode: a game counts when its mode reports game started
//                 (an abandoned game counts too);
//   finished3D    a 3D game was finished, won or lost (an abandoned one does not count): the ready
//                 card's "How 3D works" block shows until then;
//   autoHideToast the toast at the first auto-hide was shown;
//   aimHint       the hint to hold Space at a number with a closed cube behind it was shown;
//   scrollHint    the Classic 2D hint beside a clipped board, "Wheel scrolls · Shift+wheel
//                 sideways", was dismissed or the player scrolled the board: it never shows again
//                 (a document without it reads as not yet);
//   dismissed     the mode's hint strip was dismissed, for good.
// When the document is first created it is seeded from the records store's per-mode game
// counters: a returning player's recorded games count toward the three, and any recorded 3D game
// counts as the finished one, so a returning player is not taught again. A malformed document is
// seeded afresh. Storage failure never blocks play: until the document loads, and when nothing
// can be read or saved, the hints behave as on first use for the session.
//
// createFirstUse({ storage, records }) → { load(), inFirstGames(mode), rules3D, gameStarted(mode),
//   gameFinished(mode), dismissed(mode), dismiss(mode), shown(name), once(name) }.
//   once(name) is true the first time only ('autoHideToast' | 'aimHint' | 'scrollHint') and
//   records it.
// stripShown({ mode, screen, eligible, used, dismissed }) — whether a mode's hint strip shows: in
//   a game that began inside the first FIRST_GAMES games of its mode (`eligible`, judged before its
//   game started), not dismissed; the 3D strip from the start of play (`playing`), the Classic 2D
//   strip on its board once a key or the controller was first used in the game (`used`).
// hidCube(view, changed) — an action's changed cells include one auto-hide hid (never at a loss).
// aimHintCell(view, selected, through) — the aimed cell when it is a revealed number and the cell
//   picked through numbers (`through`) is a closed cube, else null.
// createDwell(ms) → update(key, now): true once the same non-null key has been held `ms` long.

export const FIRST_USE_DOC = 'shell.firstUse';
export const FIRST_USE_VERSION = 1;
export const FIRST_GAMES = 3;
export const FIRST_USE_MODES = Object.freeze(['classic-2d', '3d']);
export const ONE_TIME_HINTS = Object.freeze(['autoHideToast', 'aimHint', 'scrollHint']);
export const AIM_DWELL_MS = 1000;

const perMode = (fn) => Object.fromEntries(FIRST_USE_MODES.map((m) => [m, fn(m)]));
const fresh = () => ({
  games: perMode(() => 0), finished3D: false, autoHideToast: false, aimHint: false, scrollHint: false, dismissed: perMode(() => false),
});
const copy = (s) => ({ ...s, games: { ...s.games }, dismissed: { ...s.dismissed } });
const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => Number.isInteger(v) && v >= 0;

/** A valid first-use document as a plain copy, or null. */
export function normaliseFirstUse(data) {
  if (!isObject(data) || !isObject(data.games) || !isObject(data.dismissed)) return null;
  if (!FIRST_USE_MODES.every((m) => isCount(data.games[m]) && typeof data.dismissed[m] === 'boolean')) return null;
  if (![data.finished3D, data.autoHideToast, data.aimHint].every((v) => typeof v === 'boolean')) return null;
  if (data.scrollHint !== undefined && typeof data.scrollHint !== 'boolean') return null;
  return {
    games: perMode((m) => data.games[m]), finished3D: data.finished3D, autoHideToast: data.autoHideToast,
    aimHint: data.aimHint, scrollHint: data.scrollHint ?? false, dismissed: perMode((m) => data.dismissed[m]),
  };
}

function seeded(records) {
  const s = fresh();
  try {
    for (const m of FIRST_USE_MODES) {
      const games = records.overall(m)?.games;
      s.games[m] = isCount(games) ? games : 0;
    }
    s.finished3D = s.games['3d'] > 0;
  } catch {
    return fresh();
  }
  return s;
}

export function createFirstUse({ storage, records }) {
  storage.register(FIRST_USE_DOC, FIRST_USE_VERSION);
  let state = fresh();
  // Every change saves the whole document; a save that fails keeps the state for the session.
  const save = () => {
    try {
      return Promise.resolve(storage.save(FIRST_USE_DOC, copy(state))).catch(() => {});
    } catch {
      return Promise.resolve(); // storage never blocks play
    }
  };
  const mode = (m) => {
    if (!FIRST_USE_MODES.includes(m)) throw new Error(`first use: unknown mode "${m}"`);
    return m;
  };
  return {
    async load() {
      let data;
      try { data = await storage.load(FIRST_USE_DOC); } catch { data = undefined; }
      const stored = normaliseFirstUse(data);
      if (stored) state = stored;
      else {
        state = seeded(records);
        await save();
      }
      return copy(state);
    },
    /** Whether a game of `mode` starting now is among its first FIRST_GAMES. */
    inFirstGames(m) { return state.games[mode(m)] < FIRST_GAMES; },
    /** Whether the ready card shows the "How 3D works" block: no 3D game finished yet. */
    get rules3D() { return !state.finished3D; },
    gameStarted(m) {
      if (!FIRST_USE_MODES.includes(m)) return;
      state.games[m] += 1;
      save();
    },
    gameFinished(m) {
      if (m !== '3d' || state.finished3D) return;
      state.finished3D = true;
      save();
    },
    dismissed(m) { return state.dismissed[mode(m)]; },
    dismiss(m) {
      if (state.dismissed[mode(m)]) return;
      state.dismissed[m] = true;
      save();
    },
    shown(name) {
      if (!ONE_TIME_HINTS.includes(name)) throw new Error(`first use: unknown hint "${name}"`);
      return state[name];
    },
    once(name) {
      if (this.shown(name)) return false;
      state[name] = true;
      save();
      return true;
    },
  };
}

export function stripShown({ mode, screen, eligible, used, dismissed }) {
  if (!eligible || dismissed) return false;
  if (mode === '3d') return screen === 'playing';
  if (mode === 'classic-2d') return screen === 'classic-2d' && !!used;
  return false;
}

export function hidCube(view, changed) {
  if (!changed || view.state === 'lost') return false;
  const hidden = view.unlinked;
  for (let i = 0; i < changed.length; i++) if (hidden[changed[i]]) return true;
  return false;
}

export function aimHintCell(view, selected, through) {
  if (selected < 0 || !view.pressed[selected] || !(view.number[selected] > 0)) return null;
  if (through < 0 || view.pressed[through]) return null;
  return selected;
}

export function createDwell(ms = AIM_DWELL_MS) {
  let key = null;
  let since = 0;
  return {
    update(k, now) {
      if (k === null || k === undefined) { key = null; return false; }
      if (k !== key) { key = k; since = now; return false; }
      return now - since >= ms;
    },
    reset() { key = null; },
  };
}
