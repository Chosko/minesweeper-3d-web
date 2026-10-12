// Main menu: its entries, where each leads, the last mode played and each mode's last board choice.
// DOM-free: the router, the mode host and the storage interface are handed in by the shell.

/**
 * The main menu's entries, in order. A mode entry opens that mode's board choice through the mode
 * host; a screen entry routes to its screen. While an entry's feature has not landed — its mode
 * is not registered, or the router has no such screen — it routes to the placeholder screen. An
 * entry that `needs` a browser feature the browser lacks is unavailable: it routes nowhere, and
 * its menu item is disabled with the reason UNAVAILABLE_REASONS gives for that feature.
 */
export const MENU_ENTRIES = Object.freeze([
  Object.freeze({ id: 'classic-2d', label: 'Classic 2D', mode: 'classic-2d' }),
  Object.freeze({ id: '3d', label: '3D', mode: '3d', needs: 'webgl2' }),
  Object.freeze({ id: 'records', label: 'Records', screen: 'records' }),
  Object.freeze({ id: 'settings', label: 'Settings', screen: 'settings' }),
]);

/** The line an unavailable entry shows under its label, by the browser feature it lacks. */
export const UNAVAILABLE_REASONS = Object.freeze({
  webgl2: 'Needs WebGL 2 — not available in this browser',
});

/** The one "coming soon" screen every entry without its feature routes to. */
export const PLACEHOLDER_SCREEN = 'coming-soon';

/** The platform-storage document holding the last mode played: { mode }. */
export const LAST_MODE_DOC = 'shell.lastMode';
export const LAST_MODE_VERSION = 1;

/** Why `entry` cannot be opened in a browser lacking the features `missing`, or null when it can. */
export function entryReason(entry, missing = []) {
  return entry.needs && missing.includes(entry.needs) ? UNAVAILABLE_REASONS[entry.needs] : null;
}

/**
 * Where `entry` leads now: null for an unavailable entry (entryReason), { mode } for a registered
 * mode's board choice, { screen } for a screen the router has, else
 * { screen: PLACEHOLDER_SCREEN, data: { entry, title } }.
 */
export function entryRoute(entry, { hasMode, hasScreen, missing = [] }) {
  if (entryReason(entry, missing)) return null;
  if (entry.mode && hasMode(entry.mode)) return { mode: entry.mode };
  if (entry.screen && hasScreen(entry.screen)) return { screen: entry.screen };
  return { screen: PLACEHOLDER_SCREEN, data: { entry: entry.id, title: entry.label } };
}

/**
 * The menu over a router ({ has, go }) and a mode host ({ has, openBoardChoice }), in a browser
 * lacking the features `missing` (e.g. ['webgl2']).
 */
export function createMenu({ router, modes, entries = MENU_ENTRIES, missing = [] }) {
  const find = (id) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) throw new Error(`unknown menu entry "${id}"`);
    return entry;
  };
  const route = (id) => entryRoute(find(id), { hasMode: (m) => modes.has(m), hasScreen: (s) => router.has(s), missing });
  return {
    entries,
    route,
    /** Why entry `id` is unavailable in this browser, or null. */
    unavailable: (id) => entryReason(find(id), missing),
    /** Follow entry `id`; returns the route taken, null for an unavailable entry, which opens nothing. */
    open(id) {
      const r = route(id);
      if (!r) return null;
      if (r.mode) modes.openBoardChoice(r.mode);
      else router.go(r.screen, r.data === undefined ? undefined : { data: r.data });
      return r;
    },
  };
}

/**
 * A mode's last board choice, kept in that mode's own platform-storage document `doc`. Registers
 * the document with `storage`; `normalise(choice)` returns a valid choice as a plain copy or null.
 * `current` is `fallback` until a choice is loaded or saved; `played` says whether one was.
 * `load()` reads the stored choice (`fallback` when there is none or it is malformed);
 * `save(choice)` records a valid choice at once and rejects an invalid one with a RangeError.
 */
export function createLastBoardChoice({ storage, doc, version = 1, normalise, fallback }) {
  storage.register(doc, version);
  let current = fallback;
  let played = false;
  return {
    get current() { return current; },
    get played() { return played; },
    async load() {
      const c = normalise(await storage.load(doc));
      if (c) [current, played] = [c, true];
      else if (!played) current = fallback;
      return current;
    },
    async save(choice) {
      const c = normalise(choice);
      if (!c) throw new RangeError(`invalid board choice: ${JSON.stringify(choice)}`);
      [current, played] = [c, true];
      return storage.save(doc, c);
    },
  };
}

/**
 * The last mode played, kept in the `shell.lastMode` document. Registers the document with
 * `storage` (the platform-storage interface) and records the mode each time the mode host
 * reports a game started. `load()` reads the stored mode (null when there is none or it is
 * malformed, keeping what this session already recorded); `current` is the latest known.
 */
export function createLastMode({ storage, modes }) {
  storage.register(LAST_MODE_DOC, LAST_MODE_VERSION);
  let current = null;
  const record = (mode) => {
    current = mode;
    return storage.save(LAST_MODE_DOC, { mode });
  };
  const off = modes.on('started', ({ mode }) => { record(mode); });
  return {
    get current() { return current; },
    record,
    async load() {
      const data = await storage.load(LAST_MODE_DOC);
      if (data && typeof data === 'object' && typeof data.mode === 'string' && data.mode) current = data.mode;
      return current;
    },
    dispose: off,
  };
}
