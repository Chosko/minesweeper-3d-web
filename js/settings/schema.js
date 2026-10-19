// The settings schema: one declaration of every setting — its key, type, range or allowed values,
// and default. The store's validation and the Settings page's controls are both driven from it, so
// a setting is added here and nowhere else. DOM-free.
//
// Types: 'number' ({ min, max }, finite, inclusive), 'boolean', 'choice' ({ values }).
//
// The theme is a choice among the theme registry's ids (js/themes/registry.js): its values are the
// catalogue's ids in order, and a choice carrying `known(value)` accepts what that predicate accepts —
// for the theme, any id the registry knows.

import { THEMES, DEFAULT_THEME_ID, isRegisteredTheme } from '../themes/registry.js';

const number = (key, min, max, def) => Object.freeze({ key, type: 'number', min, max, default: def });
const boolean = (key, def) => Object.freeze({ key, type: 'boolean', default: def });
const choice = (key, values, def, known) => Object.freeze({
  key, type: 'choice', values: Object.freeze(values), default: def, ...(known ? { known } : {}),
});

export const SCHEMA = Object.freeze({
  lookSensitivity: number('lookSensitivity', 0.25, 3, 1),
  invertY: boolean('invertY', false),
  fullscreen: boolean('fullscreen', false),
  renderResolution: choice('renderResolution', ['auto', 'sharp', 'fast'], 'auto'),
  boardScale: choice('boardScale', ['fit', '100', '125'], '100'),
  theme: choice('theme', THEMES.map((t) => t.id), DEFAULT_THEME_ID, isRegisteredTheme),
  volume: number('volume', 0, 1, 0.7),
  muted: boolean('muted', false),
  confirmRestart: boolean('confirmRestart', false),
  aimReadout: boolean('aimReadout', true),
  fieldOfView: number('fieldOfView', 45, 90, 60), // the 3D camera's vertical field of view, degrees
  camera: choice('camera', ['fly', 'orbit'], 'fly'), // the 3D camera: first-person flight or the orbit around the board centre
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
    case 'choice': return entry.known ? entry.known(value) : entry.values.includes(value);
    default: return false;
  }
}
