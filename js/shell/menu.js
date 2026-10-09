// Main menu: its entries, where each leads, and the last mode played.
// DOM-free: the router, the mode host and the storage interface are handed in by the shell.

/**
 * The main menu's entries, in order. A mode entry opens that mode's board choice through the mode
 * host; a screen entry routes to its screen. While an entry's feature has not landed — its mode
 * is not registered, or the router has no such screen — it routes to the placeholder screen.
 */
export const MENU_ENTRIES = Object.freeze([
  Object.freeze({ id: 'classic-2d', label: 'Classic 2D', mode: 'classic-2d' }),
  Object.freeze({ id: '3d', label: '3D', mode: '3d' }),
  Object.freeze({ id: 'records', label: 'Records', screen: 'records' }),
  Object.freeze({ id: 'settings', label: 'Settings', screen: 'settings' }),
]);

/** The one "coming soon" screen every entry without its feature routes to. */
export const PLACEHOLDER_SCREEN = 'coming-soon';

/** The platform-storage document holding the last mode played: { mode }. */
export const LAST_MODE_DOC = 'shell.lastMode';
export const LAST_MODE_VERSION = 1;

/**
 * Where `entry` leads now: { mode } for a registered mode's board choice, { screen } for a screen
 * the router has, else { screen: PLACEHOLDER_SCREEN, data: { entry, title } }.
 */
export function entryRoute(entry, { hasMode, hasScreen }) {
  if (entry.mode && hasMode(entry.mode)) return { mode: entry.mode };
  if (entry.screen && hasScreen(entry.screen)) return { screen: entry.screen };
  return { screen: PLACEHOLDER_SCREEN, data: { entry: entry.id, title: entry.label } };
}

/** The menu over a router ({ has, go }) and a mode host ({ has, openBoardChoice }). */
export function createMenu({ router, modes, entries = MENU_ENTRIES }) {
  const find = (id) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) throw new Error(`unknown menu entry "${id}"`);
    return entry;
  };
  const route = (id) => entryRoute(find(id), { hasMode: (m) => modes.has(m), hasScreen: (s) => router.has(s) });
  return {
    entries,
    route,
    /** Follow entry `id`; returns the route taken. */
    open(id) {
      const r = route(id);
      if (r.mode) modes.openBoardChoice(r.mode);
      else router.go(r.screen, r.data === undefined ? undefined : { data: r.data });
      return r;
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
