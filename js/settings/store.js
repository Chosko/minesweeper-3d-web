// The settings store: the validated current value of every setting (js/settings/schema.js), the
// single source of truth while the game runs. It loads the versioned settings document through
// platform storage, validates every write, saves the whole document and notifies subscribers.
// It knows none of the appliers. DOM-free apart from the default legacy reader.
//
// createSettingsStore({ storage, legacy?, onNotKept? }) → { load, get, set, onChange }
//   storage    the platform storage interface (js/platform/index.js's `storage`).
//   legacy     { get(key) → string | null } over the current build's loose ms3d.* keys; defaults
//              to the global localStorage. A reader that throws counts as no value.
//   onNotKept  ({ reason }) — called at most once per store, the first time a save fails, so the
//              player can be told once that settings will not be kept.
//
//   load()               → Promise, awaited by the shell before its first screen. Fills a missing
//                          or invalid value with its default. With no settings document it carries
//                          the legacy values over once and saves the new document; storage that
//                          cannot be read, a corrupt document or a newer one gives every default.
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

import { SCHEMA, SETTING_KEYS, DEFAULTS, isValid } from './schema.js';

export const SETTINGS_DOC = 'settings';
export const SETTINGS_VERSION = 1;

// The current build's separate keys, read once to carry the player's values over.
export const LEGACY_KEYS = Object.freeze({
  lookSensitivity: 'ms3d.lookSens',
  invertY: 'ms3d.invertY',
  volume: 'ms3d.volume',
  muted: 'ms3d.muted',
});

const LOAD_TROUBLE = new Set(['unreadable', 'corrupt', 'newer-version']);

const browserLegacy = {
  get(key) { return globalThis.localStorage.getItem(key); },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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
  let loadTrouble = false;
  storage.register(SETTINGS_DOC, SETTINGS_VERSION, {}, {
    onIssue: (issue) => { if (LOAD_TROUBLE.has(issue.kind)) loadTrouble = true; },
  });

  const values = { ...DEFAULTS };
  const listeners = new Map(SETTING_KEYS.map((k) => [k, new Set()]));
  let loaded = false;
  let loading = null;
  let reported = false;

  const known = (key) => {
    if (!listeners.has(key)) throw new Error(`settings: unknown setting "${key}"`);
  };

  const call = (fn, key) => {
    try { fn(values[key], key); } catch { /* a listener never stops the others */ }
  };

  const notify = (key) => { for (const fn of [...listeners.get(key)]) call(fn, key); };

  async function persist() {
    const result = await storage.save(SETTINGS_DOC, { ...values });
    if (!result.ok && !reported) {
      reported = true;
      try { onNotKept({ reason: result.reason }); } catch { /* reporting never fails a save */ }
    }
    return result.ok ? result : { ok: false, reason: result.reason };
  }

  function readLegacy() {
    for (const [key, name] of Object.entries(LEGACY_KEYS)) {
      let text;
      try { text = legacy.get(name); } catch { text = null; }
      const v = legacyValue(key, text);
      if (v !== undefined) values[key] = v;
    }
  }

  async function doLoad() {
    loadTrouble = false;
    const data = await storage.load(SETTINGS_DOC);
    if (data === undefined && !loadTrouble) {
      readLegacy();
      await persist();
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const key of SETTING_KEYS) if (isValid(key, data[key])) values[key] = data[key];
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
      if (Object.is(values[key], value)) return Promise.resolve({ ok: true });
      values[key] = value;
      notify(key);
      return persist();
    },
    onChange(key, fn) {
      known(key);
      listeners.get(key).add(fn);
      if (loaded) call(fn, key);
      return () => { listeners.get(key).delete(fn); };
    },
  };
}
