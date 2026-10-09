// The settings schema: one declaration of every setting — its key, type, range or allowed values,
// and default. The store's validation and the Settings page's controls are both driven from it, so
// a setting is added here and nowhere else. DOM-free.
//
// Types: 'number' ({ min, max }, finite, inclusive), 'boolean', 'choice' ({ values }).

const number = (key, min, max, def) => Object.freeze({ key, type: 'number', min, max, default: def });
const boolean = (key, def) => Object.freeze({ key, type: 'boolean', default: def });
const choice = (key, values, def) => Object.freeze({ key, type: 'choice', values: Object.freeze(values), default: def });

export const SCHEMA = Object.freeze({
  lookSensitivity: number('lookSensitivity', 0.25, 3, 1),
  invertY: boolean('invertY', false),
  fullscreen: boolean('fullscreen', false),
  renderResolution: choice('renderResolution', ['auto', 'sharp', 'fast'], 'auto'),
  theme: choice('theme', ['light', 'dark'], 'light'),
  volume: number('volume', 0, 1, 0.7),
  muted: boolean('muted', false),
});

export const SETTING_KEYS = Object.freeze(Object.keys(SCHEMA));

export const DEFAULTS = Object.freeze(Object.fromEntries(SETTING_KEYS.map((k) => [k, SCHEMA[k].default])));

// Whether `value` is a legal value of setting `key`; false for an unknown key.
export function isValid(key, value) {
  const entry = Object.hasOwn(SCHEMA, key) ? SCHEMA[key] : null;
  if (!entry) return false;
  switch (entry.type) {
    case 'number': return typeof value === 'number' && Number.isFinite(value) && value >= entry.min && value <= entry.max;
    case 'boolean': return typeof value === 'boolean';
    case 'choice': return entry.values.includes(value);
    default: return false;
  }
}
