# Settings — action catalogues, bindings resolver and active device

## OVERVIEW

`js/settings/bindings.js` holds the two action catalogues — the flat modes'
(Classic 2D, Hexagon and Triangle share it) and 3D's — with each action's
default inputs, and the active device the help surfaces follow; the rows it
fills for every help surface are
[settings-bindings-rows.md](settings-bindings-rows.md)'s.
`js/settings/resolver.js` joins the catalogues' defaults with the player's
overrides, the `bindings` setting ([settings.md](settings.md)), into the
current bindings every help surface draws from. Both are DOM-free; each
module's head comment lists every function. Every mode's input layer reads
its actions through the resolver ([input.md](input.md),
[input-controller.md](input-controller.md),
[classic2d-input.md](classic2d-input.md), [classic2d-input-cursor.md](classic2d-input-cursor.md)).

## PUBLIC API

- **Catalogues.** `CATALOGUES.flat` / `CATALOGUES['3d']` — `{ id, label,
  actions }`, each action `{ id, label, fires: 'press' | 'release' | 'held',
  defaults: { keyboard, mouse, controller } }`, up to two inputs per device:
  a key by `KeyboardEvent.code`, a mouse button by number, a controller
  button by standard-mapping index (`BTN`). 3D: `forward`, `back`, `left`,
  `right`, `down`, `up`, `neighbours`, `aimThrough`, `showHidden`,
  `reveal`, `flag`; flat: `reveal`, `flag`, `chord`, `up`, `down`, `left`,
  `right`. `INPUT_DEVICES` (`keyboard`, `mouse`, `controller`),
  `catalogueOf(mode)` (`classic-2d`, `hexagon`, `triangle` → `flat`; `3d`),
  `catalogueAction`, `isInput(device, input)`, `canonicalInput` (Numpad
  Enter is Enter in the flat catalogue), `keyName(code)`, `RESERVED[catalogue][device]` and
  `isReserved(mode, device, input)`, `DEFAULT_CURRENT` (the current
  bindings with no override: catalogue → device → action → inputs).
- **Resolver** (`resolver.js`). `OVERRIDES_KEY` (`'bindings'`),
  `resolveBindings(overrides)` → the current bindings (an invalid
  catalogue × device falls back to its defaults, the rest kept),
  `createBindings({ store })` → `{ current, actionFor(mode, device, input),
  inputsFor(mode, device, action), bind(mode, device, action, slot, input),
  clear(mode, device, action, slot), reset(mode, device), onChange(fn) }`;
  `bind`'s swap and refusals (`reserved`, `unknown`, `last`) and `clear`'s
  (`empty`, `last`) are in its head comment; `defaultBindings()` — one
  resolver over no overrides, made on its first call, which an input layer
  handed no resolver reads.
- `createActiveDevice({ onChange })` → `current` (`'keyboard'` |
  `'controller'`), `input('pad' | 'keyboard' | 'pointer')`,
  `connected(on)`: the controller while the last input came from a
  connected controller, otherwise the keyboard and mouse (also on
  disconnect); `onChange(device)` once per change.

## INTERNAL PATTERNS

- **Current bindings everywhere.** `js/main.js` creates the resolver over
  the settings store before the input layers, hands it to each of them — the
  3D `Input` and `padActions3D`, every flat mode's pointer and cursor
  inputs — and to `UI.setBindings`, which redraws every bindings surface now
  and on each of the resolver's changes; the Settings page's list reads it
  through `bindingsSectionHtml`. An input layer asks on each input, so a
  change applies from the next one, and drops what is held on each change.
  No binding can hold a reserved input, so a lookup of one resolves to
  nothing; the shell acts on the reserved inputs itself, and tests the
  Start + Y chord before any button is looked up
  ([app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md)).
- **Resolver rules.** One catalogue and one device are validated and fall
  back together; a write stores only the actions that differ from their
  defaults (`overridesOf`), so stored garbage leaves at the first write.
  The last-binding rule counts the keyboard and the mouse together, the
  controller alone; a swap that would empty the other action is refused.

## DOMAIN DEPENDENCIES

- [../domain/features/input-rebinding.md](../domain/features/input-rebinding.md)
  — the catalogues, the resolver's contract, reserved inputs, overrides and
  their failure rule.

## CROSS-REFERENCES

- [settings-bindings-rows.md](settings-bindings-rows.md) — the bindings
  source: rows per device, strips, hints, reminders and key hints filled
  from the current bindings.
- [settings.md](settings.md) — the `bindings` setting and the store the
  resolver writes through.
- [app-shell-help.md](app-shell-help.md) — the surfaces that follow the
  active device.
- [input-controller.md](input-controller.md) — the controller buttons (`js/gamepad.js` `BTN`).
- [testing-files.md](testing-files.md) — `tests/settings-bindings.test.mjs` (catalogues,
  resolver).

## WHEN TO READ THE SOURCE

- Changing an action, its defaults or a reserved input: `CATALOGUES` and
  `RESERVED`; the swap, clear or validation rules: `resolver.js`.
