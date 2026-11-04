// The settings store: the validated current value of every setting (js/settings/schema.js), the
// single source of truth while the game runs. It loads two versioned documents through platform
// storage — the machine settings document (MACHINE_KEYS: the values that belong to one machine) and
// the settings document (every other setting) —, validates every write, saves the whole document
// the setting belongs to and notifies subscribers. It knows none of the appliers. DOM-free apart
// from the default legacy reader.
//
// createSettingsStore({ storage, legacy?, onNotKept? }) → { load, get, set, onChange }
//   storage    the platform storage interface (js/platform/index.js's `storage`).
//   legacy     { get(key) → string | null } over the browser build's loose ms3d.* keys; defaults
//              to the global localStorage; null reads none (the Steam build). A reader that throws
//              counts as no value.
//   onNotKept  ({ reason }) — called at most once per store, the first time a save of either
//              document fails, so the player can be told once that settings will not be kept.
//
//   load()               → Promise, awaited by the shell before its first screen. Fills a missing
//                          or invalid value with its default, except the field of view of an
//                          existing install (EXISTING_FIELD_OF_VIEW). With no settings document it
//                          carries the legacy values over once and saves both documents; storage
//                          that cannot be read, a corrupt document or a newer one gives every default.
//                          With no machine settings document it takes the machine values from the
//                          loaded settings document when it holds valid ones and saves the machine
//                          settings document; a machine settings document that is present always
//                          wins, and one that cannot be used gives the machine defaults.
//                          A stored theme id the registry does not know reads as the default and is
//                          kept in the document, saves included, until the player sets the theme.
//                          Fires every listener once with the loaded value. Repeated calls return
//                          the first call's Promise.
//   get(key)             → the current value, always valid (the default before load).
//   set(key, value)      → Promise of { ok: true } or { ok: false, reason }: 'invalid' when the
//                          value is rejected (the old value kept, nothing saved or notified), else
//                          the save's own failure reason — the change still holds for the session.
//                          Setting the current value again saves and notifies nothing. A set
//                          while load() runs applies once it has finished; a set before load()
//                          has been called throws.
//   onChange(key, fn)    → unsubscribe. fn(value, key) fires after the value changes, and once
//                          with the loaded value — at load, or at once when added after it.
// An unknown key throws: that is a programming error.
//
// The settings document's format steps (UPGRADES), run by platform storage on an older document:
//   1 → 2   a stored theme `light` or `dark` becomes `joyful-tiles`.
// No step strips the machine values from a settings document: the machine carry-over reads them.

import { SCHEMA, SETTING_KEYS, DEFAULTS, isValid } from './schema.js';

export const SETTINGS_DOC = 'settings';
export const SETTINGS_VERSION = 2;

export const MACHINE_SETTINGS_DOC = 'settings.machine';
export const MACHINE_SETTINGS_VERSION = 1;

/** The settings the machine settings document holds; every other setting is the settings document's. */
export const MACHINE_KEYS = Object.freeze(['lookSensitivity', 'renderResolution']);

const UPGRADES = Object.freeze({
  1: (data) => (data && typeof data === 'object' && (data.theme === 'light' || data.theme === 'dark')
    ? { ...data, theme: 'joyful-tiles' }
    : data),
});

// The browser build's separate keys, read once to carry the player's values over.
export const LEGACY_KEYS = Object.freeze({
  lookSensitivity: 'ms3d.lookSens',
  invertY: 'ms3d.invertY',
  volume: 'ms3d.volume',
  muted: 'ms3d.muted',
});

// The field of view an existing install keeps — a stored document without it, or a first start that
// carries over a legacy value — instead of the default a new install gets.
export const EXISTING_FIELD_OF_VIEW = 45;

const LOAD_TROUBLE = new Set(['unreadable', 'corrupt', 'newer-version']);

const browserLegacy = {
  get(key) { return globalThis.localStorage.getItem(key); },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const isObject = (data) => Boolean(data) && typeof data === 'object' && !Array.isArray(data);

const SETTINGS_KEYS = SETTING_KEYS.filter((key) => !MACHINE_KEYS.includes(key));

// Legacy text → a value, read the way the old owners read it, or undefined to keep the default.
function legacyValue(key, text) {
  if (text === null || text === undefined) return undefined;
  const entry = SCHEMA[key];
  if (entry.type === 'boolean') return text === '1';
  if (text === '') return undefined;
  const n = key === 'lookSensitivity' ? parseFloat(text) : Number(text);
  return Number.isFinite(n) ? clamp(n, entry.min, entry.max) : undefined;
}

export function createSettingsStore({ storage, legacy = browserLegacy, onNotKept = () => {} }) {
  const trouble = { [SETTINGS_DOC]: false, [MACHINE_SETTINGS_DOC]: false };
  const onIssue = (name) => (issue) => { if (LOAD_TROUBLE.has(issue.kind)) trouble[name] = true; };
  storage.register(SETTINGS_DOC, SETTINGS_VERSION, UPGRADES, { onIssue: onIssue(SETTINGS_DOC) });
  storage.register(MACHINE_SETTINGS_DOC, MACHINE_SETTINGS_VERSION, {}, { onIssue: onIssue(MACHINE_SETTINGS_DOC) });

  const values = { ...DEFAULTS };
  const listeners = new Map(SETTING_KEYS.map((k) => [k, new Set()]));
  let loaded = false;
  let loading = null;
  let reported = false;
  // A stored theme id the registry does not know, saved back as stored until the player sets one.
  let keptTheme = null;

  const known = (key) => {
    if (!listeners.has(key)) throw new Error(`settings: unknown setting "${key}"`);
  };

  const call = (fn, key) => {
    try { fn(values[key], key); } catch { /* a listener never stops the others */ }
  };

  const notify = (key) => { for (const fn of [...listeners.get(key)]) call(fn, key); };

  const pick = (keys) => Object.fromEntries(keys.map((key) => [key, values[key]]));

  async function save(name, data) {
    const result = await storage.save(name, data);
    if (!result.ok && !reported) {
      reported = true;
      try { onNotKept({ reason: result.reason }); } catch { /* reporting never fails a save */ }
    }
    return result.ok ? result : { ok: false, reason: result.reason };
  }

  const persist = () => {
    const data = pick(SETTINGS_KEYS);
    return save(SETTINGS_DOC, keptTheme === null ? data : { ...data, theme: keptTheme });
  };

  const persistMachine = () => save(MACHINE_SETTINGS_DOC, pick(MACHINE_KEYS));

  function readLegacy() {
    let carried = false;
    for (const [key, name] of Object.entries(LEGACY_KEYS)) {
      let text;
      try { text = legacy.get(name); } catch { text = null; }
      const v = legacyValue(key, text);
      if (v !== undefined) { values[key] = v; carried = true; }
    }
    if (carried) values.fieldOfView = EXISTING_FIELD_OF_VIEW;
  }

  async function doLoad() {
    trouble[SETTINGS_DOC] = false;
    trouble[MACHINE_SETTINGS_DOC] = false;
    const data = await storage.load(SETTINGS_DOC);
    const machine = await storage.load(MACHINE_SETTINGS_DOC);
    if (data === undefined && !trouble[SETTINGS_DOC]) {
      if (legacy) readLegacy();
      await persist();
    } else if (isObject(data)) {
      for (const key of SETTING_KEYS) if (isValid(key, data[key])) values[key] = data[key];
      if (typeof data.theme === 'string' && data.theme !== '' && !isValid('theme', data.theme)) keptTheme = data.theme;
      if (!Object.hasOwn(data, 'fieldOfView')) values.fieldOfView = EXISTING_FIELD_OF_VIEW;
    }
    if (isObject(machine)) {
      for (const key of MACHINE_KEYS) values[key] = isValid(key, machine[key]) ? machine[key] : DEFAULTS[key];
    } else if (machine !== undefined || trouble[MACHINE_SETTINGS_DOC]) {
      for (const key of MACHINE_KEYS) values[key] = DEFAULTS[key];
    } else if (!trouble[SETTINGS_DOC]) {
      await persistMachine();
    }
    loaded = true;
    for (const key of SETTING_KEYS) notify(key);
  }

  return {
    load() {
      loading ??= doLoad();
      return loading;
    },
    get(key) {
      known(key);
      return values[key];
    },
    set(key, value) {
      known(key);
      if (!loading) throw new Error('settings: set before load()');
      if (!loaded) return loading.then(() => this.set(key, value));
      if (!isValid(key, value)) return Promise.resolve({ ok: false, reason: 'invalid' });
      if (key === 'theme' && keptTheme !== null) {
        keptTheme = null;
        if (Object.is(values[key], value)) return persist();
      }
      if (Object.is(values[key], value)) return Promise.resolve({ ok: true });
      values[key] = value;
      notify(key);
      return MACHINE_KEYS.includes(key) ? persistMachine() : persist();
    },
    onChange(key, fn) {
      known(key);
      listeners.get(key).add(fn);
      if (loaded) call(fn, key);
      return () => { listeners.get(key).delete(fn); };
    },
  };
}
