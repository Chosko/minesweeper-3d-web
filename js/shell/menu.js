// Main menu: its entries, where each leads, the last mode played and each mode's last board choice.
// DOM-free: the router, the mode host and the storage interface are handed in by the shell.

/**
 * The main menu's entries, in order, in two blocks (`block` 0, 1): the play tiles — the five modes
 * and Daily, two by two —, then Records and Settings, the small entries. A mode entry opens that
 * mode's board choice through the mode host; a screen entry routes to its screen. While an entry's
 * feature has not landed — its mode is not registered, or the router has no such screen — it routes
 * to the placeholder screen, titled with the entry's label. An entry that `needs` a feature the
 * browser lacks is unavailable: it routes nowhere, and its menu button is disabled with the reason
 * UNAVAILABLE_REASONS gives for that feature (the short one, UNAVAILABLE_SHORT_REASONS, on a phone
 * row). Quit is no entry: it is the title bar's.
 */
export const MENU_ENTRIES = Object.freeze([
  Object.freeze({ id: 'classic-2d', label: 'Classic 2D', mode: 'classic-2d', block: 0 }),
  Object.freeze({ id: 'hexagon', label: 'Hexagon', mode: 'hexagon', block: 0 }),
  Object.freeze({ id: 'triangle', label: 'Triangle', mode: 'triangle', block: 0 }),
  Object.freeze({ id: 'surface', label: 'Surface', mode: 'surface', block: 0 }),
  Object.freeze({ id: '3d', label: '3D', mode: '3d', needs: 'webgl2', block: 0 }),
  Object.freeze({ id: 'daily', label: 'Daily', screen: 'daily', block: 0 }),
  Object.freeze({ id: 'records', label: 'Records', screen: 'records', block: 1 }),
  Object.freeze({ id: 'settings', label: 'Settings', screen: 'settings', block: 1 }),
]);

/** The line an unavailable entry shows under its label, by the feature it lacks. */
export const UNAVAILABLE_REASONS = Object.freeze({
  webgl2: 'Needs WebGL 2 — not available in this browser',
});

/** The same line, short, as a phone row shows it. */
export const UNAVAILABLE_SHORT_REASONS = Object.freeze({
  webgl2: 'Needs WebGL 2',
});

/** The main menu's build label: the web build and the release `version` (`js/version.js`). */
export function buildLabel(version) {
  return `Web · v${version}`;
}

/** The one "coming soon" screen every entry without its feature routes to. */
export const PLACEHOLDER_SCREEN = 'coming-soon';

/**
 * The entry the menu opens on: the entry of `lastMode` (the last mode played), else — nothing played,
 * or that entry unavailable in a browser lacking `missing` — the first available entry.
 */
export function openingEntry(lastMode, { entries = MENU_ENTRIES, missing = [] } = {}) {
  const open = entries.filter((e) => !entryReason(e, missing));
  return (open.find((e) => lastMode && e.mode === lastMode) ?? open[0] ?? entries[0]).id;
}

/** The size of the demo board the shell builds for the backdrop and the menu's 3D still shows. */
export const DEMO_BOARD_3D = Object.freeze({ X: 7, Y: 7, Z: 7 });

/** The line a mode not built yet reads where the Daily screen lists it. */
export const COMING_SOON = 'Coming soon';

/** Each play tile's own preview, by entry: what it draws and on which ground. */
const TILE_PREVIEWS = Object.freeze({
  'classic-2d': Object.freeze({ kind: 'board', grid: 'square', ground: 'dark' }),
  hexagon: Object.freeze({ kind: 'board', grid: 'hex', ground: 'dark' }),
  triangle: Object.freeze({ kind: 'board', grid: 'tri', ground: 'dark' }),
  surface: Object.freeze({ kind: 'still', still: 'surface', ground: 'light' }),
  '3d': Object.freeze({ kind: 'still', still: '3d', ground: 'light' }),
  daily: Object.freeze({ kind: 'icon', ground: 'light' }),
});

/**
 * The preview play tile `id` shows at once, in a browser lacking `missing`, as data the shell draws —
 * every tile its own, none following the selection, each cropped from the middle of its art:
 *   { kind: 'board', grid, ground: 'dark' }  Classic 2D ('square'), Hexagon ('hex') and Triangle
 *                                        ('tri'): the mode's Intermediate demo game in progress on
 *                                        that grid (js/shell/menu-preview.js demoBoard2D), drawn by
 *                                        the flat board view on the dark scene ground;
 *   { kind: 'still', still, ground: 'light' }  Surface the torus, 3D the menu's demo board, each a
 *                                        still image cut out on translucent white;
 *   { kind: 'icon', ground: 'light' }    Daily: a calendar icon;
 *   { kind: 'locked', ground: 'locked' } an unavailable tile (3D without WebGL 2): the lock.
 * A small entry (Records, Settings) has no preview: null.
 */
export function menuPreview(id, { entries = MENU_ENTRIES, missing = [] } = {}) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`unknown menu entry "${id}"`);
  const preview = TILE_PREVIEWS[entry.id];
  if (!preview) return null;
  return entryReason(entry, missing) ? { kind: 'locked', ground: 'locked' } : { ...preview };
}

/** The platform-storage document holding the last mode played: { mode }. */
export const LAST_MODE_DOC = 'shell.lastMode';
export const LAST_MODE_VERSION = 1;

/** Why `entry` cannot be opened in a browser lacking the features `missing`, or null when it can. */
export function entryReason(entry, missing = []) {
  return entry.needs && missing.includes(entry.needs) ? UNAVAILABLE_REASONS[entry.needs] : null;
}

/** The short reason a phone row shows for `entry` in a browser lacking `missing`, or null when it can open. */
export function entryShortReason(entry, missing = []) {
  return entryReason(entry, missing) && UNAVAILABLE_SHORT_REASONS[entry.needs];
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
 * `current` is `fallback` until a choice is loaded or saved.
 * `load()` reads the stored choice (`fallback` when there is none or it is malformed);
 * `save(choice)` records a valid choice at once and rejects an invalid one with a RangeError.
 */
export function createLastBoardChoice({ storage, doc, version = 1, normalise, fallback }) {
  storage.register(doc, version);
  let current = fallback;
  return {
    get current() { return current; },
    async load() {
      const c = normalise(await storage.load(doc));
      if (c) current = c;
      return current;
    },
    async save(choice) {
      const c = normalise(choice);
      if (!c) throw new RangeError(`invalid board choice: ${JSON.stringify(choice)}`);
      current = c;
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
