// The bindings resolver: joins each action catalogue's defaults (js/settings/bindings.js CATALOGUES)
// with the player's overrides — the `bindings` setting of the settings document (OVERRIDES_KEY,
// js/settings/schema.js) — into the current bindings, answers both directions, and writes the
// player's changes through the settings store under the clash, reserved-input and last-binding
// rules. DOM-free.
//
// The overrides: { [catalogue]: { [device]: { [action]: inputs } } }, catalogue 'flat' or '3d',
// device 'keyboard', 'mouse' or 'controller', inputs up to two in slot order; only the actions the
// player changed are present, so an action back at its defaults leaves them.
//
// resolveBindings(overrides) → the current bindings, frozen, in DEFAULT_CURRENT's shape. One
//   catalogue and device whose overrides fail validation — an unknown action or input, more than two
//   inputs, a reserved input, two actions on one input — falls back to its defaults; the rest are kept.
// createBindings({ store }) → the resolver over a settings store (js/settings/store.js):
//   current                              the current bindings; a new object on each change.
//   actionFor(mode, device, input)       → the action `input` produces in `mode`'s catalogue, or null.
//   inputsFor(mode, device, action)      → the action's current inputs in slot order.
//   bind(mode, device, action, slot, input) → Promise of { ok: true, swapped } or { ok: false, reason }:
//                                          slot 0 or 1 (past the last input, the next one). An input
//                                          another action of the catalogue holds on that device moves
//                                          here, that action taking the input it replaces in its slot
//                                          (none when the slot was empty): swapped is { action, input }
//                                          (input null for none), else null. Reasons: 'reserved',
//                                          'unknown' (no such input or slot), 'last' (with `action`:
//                                          the swap would leave that action no input on its device).
//   clear(mode, device, action, slot)    → Promise of { ok: true } or { ok: false, reason }: 'empty'
//                                          (nothing in that slot), 'last' (the action's last input on
//                                          the keyboard and mouse together, or on the controller).
//   reset(mode, device)                  → Promise of { ok: true }: that catalogue's defaults on that device.
//   onChange(fn)                         → unsubscribe; fn(current) after each change of the overrides,
//                                          the store's load included.
// defaultBindings() → one resolver over no overrides, never changing: what an input layer handed no
//   resolver reads (made on the first call, so a module cycle through bindings.js never meets it
//   half-built).
// Classic 2D, Hexagon and Triangle resolve through the flat catalogue, so they give the same answers
// and a change made for one applies to all three. A write saves through the store like any setting:
// a save that fails keeps the change for the session and the store tells the player once. An
// unknown mode, device or action throws.

import {
  CATALOGUES, INPUT_DEVICES, DEFAULT_CURRENT, catalogueOf, catalogueAction, isInput, isReserved, canonicalInput,
} from './bindings.js';

/** The setting the overrides are kept in. */
export const OVERRIDES_KEY = 'bindings';

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const MODE_OF = Object.freeze({ flat: 'classic-2d', '3d': '3d' });
const GROUPS = Object.freeze({ keyboard: ['keyboard', 'mouse'], mouse: ['keyboard', 'mouse'], controller: ['controller'] });
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** One catalogue and device's actions → inputs with `overrides` laid over the defaults, or null when they fail validation. */
function group(catalogue, device, overrides) {
  if (!isObject(overrides)) return null;
  const merged = { ...DEFAULT_CURRENT[catalogue][device] };
  for (const [id, list] of Object.entries(overrides)) {
    if (!catalogueAction(catalogue, id) || !Array.isArray(list) || list.length > 2) return null;
    if (!list.every((input) => isInput(device, input) && !isReserved(MODE_OF[catalogue], device, input))) return null;
    merged[id] = Object.freeze(list.map((input) => canonicalInput(catalogue, device, input)));
  }
  const seen = new Set();
  for (const list of Object.values(merged)) {
    for (const input of list) {
      if (seen.has(input)) return null;
      seen.add(input);
    }
  }
  return Object.freeze(merged);
}

export function resolveBindings(overrides) {
  if (!isObject(overrides)) return DEFAULT_CURRENT;
  let changed = false;
  const current = Object.fromEntries(Object.keys(CATALOGUES).map((catalogue) => {
    const byCatalogue = isObject(overrides[catalogue]) ? overrides[catalogue] : {};
    return [catalogue, Object.freeze(Object.fromEntries(INPUT_DEVICES.map((device) => {
      const merged = Object.hasOwn(byCatalogue, device) ? group(catalogue, device, byCatalogue[device]) : null;
      if (merged) changed = true;
      return [device, merged ?? DEFAULT_CURRENT[catalogue][device]];
    })))];
  }));
  return changed ? Object.freeze(current) : DEFAULT_CURRENT;
}

/** The overrides that give `current`: each action whose inputs differ from its defaults. */
function overridesOf(current) {
  const out = {};
  for (const catalogue of Object.keys(CATALOGUES)) {
    for (const device of INPUT_DEVICES) {
      for (const [id, list] of Object.entries(current[catalogue][device])) {
        if (same(list, DEFAULT_CURRENT[catalogue][device][id])) continue;
        ((out[catalogue] ??= {})[device] ??= {})[id] = [...list];
      }
    }
  }
  return out;
}

export function createBindings({ store }) {
  let current = resolveBindings(store.get(OVERRIDES_KEY));
  const listeners = new Set();
  store.onChange(OVERRIDES_KEY, (value) => {
    current = resolveBindings(value);
    for (const fn of [...listeners]) {
      try { fn(current); } catch { /* a listener never stops the others */ }
    }
  });

  const where = (mode, device, act) => {
    const catalogue = catalogueOf(mode);
    if (!INPUT_DEVICES.includes(device)) throw new Error(`bindings: unknown device "${device}"`);
    if (act !== undefined && !catalogueAction(catalogue, act)) throw new Error(`bindings: unknown action "${act}"`);
    return catalogue;
  };
  // The inputs `act` has on its device's group, with `lists` standing for `device`'s.
  const inGroup = (catalogue, device, lists, act) => GROUPS[device]
    .reduce((n, d) => n + (d === device ? lists[act] : current[catalogue][d][act]).length, 0);
  // Saves `current` with `lists` as `catalogue` and `device`'s actions → inputs.
  const write = async (catalogue, device, lists) => {
    const next = { ...current, [catalogue]: { ...current[catalogue], [device]: lists } };
    await store.set(OVERRIDES_KEY, overridesOf(next));
  };
  const copy = (catalogue, device) => Object.fromEntries(Object.entries(current[catalogue][device]).map(([id, list]) => [id, [...list]]));

  return {
    get current() { return current; },
    actionFor(mode, device, input) {
      const catalogue = where(mode, device);
      const c = canonicalInput(catalogue, device, input);
      const found = CATALOGUES[catalogue].actions.find((a) => current[catalogue][device][a.id].includes(c));
      return found ? found.id : null;
    },
    inputsFor(mode, device, act) {
      return current[where(mode, device, act)][device][act];
    },
    async bind(mode, device, act, slot, raw) {
      const catalogue = where(mode, device, act);
      if (!isInput(device, raw) || (slot !== 0 && slot !== 1)) return { ok: false, reason: 'unknown' };
      if (isReserved(mode, device, raw)) return { ok: false, reason: 'reserved' };
      const input = canonicalInput(catalogue, device, raw);
      const lists = copy(catalogue, device);
      const own = lists[act];
      const at = Math.min(slot, own.length);
      const mine = own.indexOf(input);
      if (mine === at || (mine >= 0 && at === own.length)) return { ok: true, swapped: null };
      let swapped = null;
      if (mine >= 0) {
        [own[at], own[mine]] = [own[mine], own[at]];
      } else {
        const other = Object.keys(lists).find((id) => lists[id].includes(input)) ?? null;
        const replaced = at < own.length ? own[at] : null;
        own[at] = input;
        if (other) {
          const j = lists[other].indexOf(input);
          if (replaced === null) lists[other].splice(j, 1);
          else lists[other][j] = replaced;
          if (inGroup(catalogue, device, lists, other) === 0) return { ok: false, reason: 'last', action: other };
          swapped = { action: other, input: replaced };
        }
      }
      await write(catalogue, device, lists);
      return { ok: true, swapped };
    },
    async clear(mode, device, act, slot) {
      const catalogue = where(mode, device, act);
      const lists = copy(catalogue, device);
      if (!Number.isInteger(slot) || slot < 0 || slot >= lists[act].length) return { ok: false, reason: 'empty' };
      lists[act].splice(slot, 1);
      if (inGroup(catalogue, device, lists, act) === 0) return { ok: false, reason: 'last' };
      await write(catalogue, device, lists);
      return { ok: true };
    },
    async reset(mode, device) {
      const catalogue = where(mode, device);
      await write(catalogue, device, DEFAULT_CURRENT[catalogue][device]);
      return { ok: true };
    },
    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

let defaults = null;
export function defaultBindings() {
  defaults ??= createBindings({ store: { get: () => undefined, set: async () => {}, onChange: () => () => {} } });
  return defaults;
}
