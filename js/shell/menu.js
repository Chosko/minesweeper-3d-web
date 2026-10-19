// Main menu: its entries, where each leads, the last mode played and each mode's last board choice.
// DOM-free: the router, the mode host and the storage interface are handed in by the shell.

/**
 * The main menu's entries, in order, in three blocks (`block` 0, 1, 2: the modes; Daily, Records and
 * Settings; Quit). A mode entry opens that mode's board choice through the mode host; a screen entry
 * routes to its screen. While an entry's feature has not landed — its mode is not registered, or the
 * router has no such screen — it routes to the placeholder screen, titled with the entry's label. An
 * entry that `needs` a feature the build or the browser lacks is unavailable: it routes nowhere, and
 * its menu entry is disabled with the reason UNAVAILABLE_REASONS gives for that feature. Quit is the
 * desktop build's; on the web it is always unavailable.
 */
export const MENU_ENTRIES = Object.freeze([
  Object.freeze({ id: 'classic-2d', label: 'Classic 2D', mode: 'classic-2d', block: 0 }),
  Object.freeze({ id: 'hexagon', label: 'Hexagon', mode: 'hexagon', block: 0 }),
  Object.freeze({ id: 'triangle', label: 'Triangle', mode: 'triangle', block: 0 }),
  Object.freeze({ id: 'surface', label: 'Surface', mode: 'surface', block: 0 }),
  Object.freeze({ id: '3d', label: '3D', mode: '3d', needs: 'webgl2', block: 0 }),
  Object.freeze({ id: 'daily', label: 'Daily', screen: 'daily', block: 1 }),
  Object.freeze({ id: 'records', label: 'Records', screen: 'records', block: 1 }),
  Object.freeze({ id: 'settings', label: 'Settings', screen: 'settings', block: 1 }),
  Object.freeze({ id: 'quit', label: 'Quit', needs: 'desktop', block: 2 }),
]);

/** The line an unavailable entry shows under its label, by the feature it lacks. */
export const UNAVAILABLE_REASONS = Object.freeze({
  webgl2: 'Needs WebGL 2 — not available in this browser',
  desktop: 'Desktop build only',
});

/** What the web build always lacks: the desktop build's features. */
export const WEB_MISSING = Object.freeze(['desktop']);

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

/** The size of the demo board the shell builds for the backdrop and the 3D preview. */
export const DEMO_BOARD_3D = Object.freeze({ X: 7, Y: 7, Z: 7 });

/** The preview a mode with a board of its own shows, by mode; every other entry shows its badge. */
const BOARD_PREVIEWS = Object.freeze({
  'classic-2d': Object.freeze({ kind: 'board', tag: 'Classic 2D · Intermediate' }),
  '3d': Object.freeze({ kind: 'scene', tag: `3D · Demo board ${DEMO_BOARD_3D.X} × ${DEMO_BOARD_3D.Y} × ${DEMO_BOARD_3D.Z}` }),
});

/** The note under a badge preview: a mode not built yet, or an entry unavailable here. */
export const COMING_SOON = 'Coming soon';

/**
 * What the menu's preview shows for entry `id` in a browser lacking `missing`, as data the shell draws:
 *   { kind: 'board', tag }          Classic 2D: a board drawn by the Classic 2D board view;
 *   { kind: 'scene', tag }          3D: the 3D demo board, the renderer drawing into the panel;
 *   { kind: 'still', tag }          3D without WebGL 2: the panel's static themed background;
 *   { kind: 'daily', tag? }         Daily: today's daily Expert board, closed, its start cell marked
 *                                   (the shell names the date in the tag);
 *   { kind: 'badge', entry, label, note, locked }  every other entry: its badge and label, with the
 *                                   note COMING_SOON for a mode not registered (`hasMode`), the reason
 *                                   for an unavailable entry (`locked`), and none for a place
 *                                   (Records, Settings).
 */
export function menuPreview(id, { entries = MENU_ENTRIES, missing = [], hasMode = () => true } = {}) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`unknown menu entry "${id}"`);
  const reason = entryReason(entry, missing);
  if (entry.id === 'daily') return { kind: 'daily' };
  const board = entry.mode && BOARD_PREVIEWS[entry.mode];
  if (board) return reason ? { kind: 'still', tag: entry.label } : { ...board };
  const note = reason ?? (entry.mode && !hasMode(entry.mode) ? COMING_SOON : null);
  return { kind: 'badge', entry: entry.id, label: entry.label, note, locked: reason !== null };
}

/** The platform-storage document holding the last mode played: { mode }. */
export const LAST_MODE_DOC = 'shell.lastMode';
export const LAST_MODE_VERSION = 1;

/** Why `entry` cannot be opened in a build and browser lacking the features `missing`, or null when it can. */
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
 * The menu over a router ({ has, go }) and a mode host ({ has, openBoardChoice }), in a build and
 * browser lacking the features `missing` (e.g. ['desktop', 'webgl2']).
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
