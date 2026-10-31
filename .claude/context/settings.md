# Settings — schema and store

## OVERVIEW

The player's settings: one schema declaring every setting, one store holding
the validated values and persisting them through platform storage, the
appliers that carry each value to its owner
([settings-appliers.md](settings-appliers.md)), the Settings page
([settings-page.md](settings-page.md)) with Reset all data
([settings-reset.md](settings-reset.md)) and the bindings source every
help surface reads ([settings-bindings.md](settings-bindings.md)). Every
module is DOM-free; `js/main.js` wires them ([app-shell.md](app-shell.md)).
Each module's head comment states its full contract.

| File | Responsibility |
| --- | --- |
| `js/settings/schema.js` | each setting's key, type, range or values, default; drives both validation and the page's controls, so a setting is added here and nowhere else |
| `js/settings/store.js` | the two documents — settings and machine settings — loaded at start-up, the settings document's format steps, validated writes, whole-document saves, change notification, the one-time carry-overs (machine values from an old settings document, the browser build's `ms3d.*` keys); knows none of the appliers |
| `js/settings/appliers.js` | each setting's effect, applied by its owner subscribing to the store; the render-resolution pixel-ratio rule ([settings-appliers.md](settings-appliers.md)) |
| `js/settings/page.js` | the Settings page and the control binder ([settings-page.md](settings-page.md)), the Data panel's binder ([settings-reset.md](settings-reset.md)) |
| `js/settings/reset.js` | Reset all data ([settings-reset.md](settings-reset.md)) |
| `js/settings/bindings.js` | the bindings source and the active device ([settings-bindings.md](settings-bindings.md)) |

| Setting | Type | Range / values | Default | Applied to |
| --- | --- | --- | --- | --- |
| `lookSensitivity` | number | `SCHEMA`'s min–max | 1 (the original's rate) | 3D camera `sensitivity` |
| `invertY` | boolean | | false | 3D camera `invertY` |
| `confirmRestart` | boolean | | false | "Always ask before restarting": the pause controller's `askRestart` ([app-shell-pause.md](app-shell-pause.md)) |
| `fullscreen` | boolean | | false | browser fullscreen |
| `renderResolution` | choice | `auto`, `sharp`, `fast` | `auto` | 3D renderer pixel ratio |
| `boardScale` | choice | `fit`, `100`, `125` | `100` | the Classic 2D tile's cap (`js/classic2d/board-view.js` `tileCap`): the open board (`mode2d.setScale`) and the replay viewer's 2D board (`REPLAY_VIEWER.setScale`), wired in `js/main.js` |
| `theme` | choice | an id of the theme registry (`js/themes/registry.js`) | `joyful-tiles` | the theme applier's `setTheme` ([app-shell-theme-runtime.md](app-shell-theme-runtime.md)) |
| `volume` | number | 0–1 | `SCHEMA`'s | `sfx.setVolume` |
| `muted` | boolean | | false | `sfx.setMuted`, the HUD strip (`UI.setSound`), the Sound switch of the page and the pause card (on while false) |
| `aimReadout` | boolean | | true | "3D neighbour count": the aimed-cell readout beside the crosshair, read each frame by `updateReadout` in `js/main.js` ([app-shell-3d-camera.md](app-shell-3d-camera.md)) |
| `fieldOfView` | number | `SCHEMA`'s min–max (degrees) | `SCHEMA`'s (`EXISTING_FIELD_OF_VIEW` for an existing install) | the 3D renderer camera's vertical `fov` and projection, then a redraw — play, the menu backdrop and the 3D replay viewer |
| `camera` | choice | `fly`, `orbit` | `fly` | the 3D camera's mode: `js/main.js`'s `setCameraMode`, also mid-game ([app-shell-3d-camera.md](app-shell-3d-camera.md)), and the 3D rows every help surface shows ([settings-bindings.md](settings-bindings.md)) |

## PUBLIC API

- Schema: `SCHEMA` (frozen `{ key, type: 'number' | 'boolean' | 'choice',
  min?, max?, values?, default, known? }` per setting; a choice with
  `known(value)` accepts what it accepts — the theme's `values` are
  `THEMES`' ids in catalogue order, its `known` is `isRegisteredTheme`),
  `SETTING_KEYS`, `DEFAULTS`, `isValid(key, value)`.
- Store: `SETTINGS_DOC` = `'settings'`, `SETTINGS_VERSION`;
  `MACHINE_SETTINGS_DOC` = `'settings.machine'`, `MACHINE_SETTINGS_VERSION`;
  `MACHINE_KEYS` — the settings the machine settings document holds
  (`lookSensitivity`, `renderResolution`), every other setting being the
  settings document's; `LEGACY_KEYS` (`lookSensitivity`, `invertY`,
  `volume`, `muted` → their `ms3d.*` keys), `EXISTING_FIELD_OF_VIEW`.
  `createSettingsStore({ storage, legacy?, onNotKept? })` →
  `{ load, get, set, onChange }`; `legacy` is `{ get(key) }` over the
  loose keys, the global `localStorage` by default, `null` for none:
  - `load()` → one shared Promise; loads both documents and fills missing
    or invalid values with defaults, except that a stored settings document
    without `fieldOfView` loads it as `EXISTING_FIELD_OF_VIEW`, and a stored
    theme id the registry does not know loads as the default and is kept in
    the document, saves included, until the player sets the theme;
    unreadable, corrupt or newer storage gives that document's defaults.
  - `get(key)` is always valid (the default before load).
  - `set(key, value)` → `{ ok: true }` or `{ ok: false, reason }` —
    `'invalid'` keeps the old value; a valid change saves the whole document
    its key belongs to; a save failure of either document keeps the change
    for the session and calls `onNotKept` once per store. A set before
    `load()` is called throws.
  - `onChange(key, fn)` → unsubscribe; `fn(value, key)` after each change
    and once with the loaded value. An unknown key throws everywhere.
- Appliers, `pixelRatioFor` and `applySettings`:
  [settings-appliers.md](settings-appliers.md).

## INTERNAL PATTERNS

- **Start-up order.** `js/theme.js` runs before first paint and reads the
  theme straight from the saved document (`localStorage` key
  `ms3d:doc:settings`, `{ version, data }`, at the current version or the
  one before the format step), mapping it as the format step does, so the
  first paint is already the stored theme ([app-shell-theme-runtime.md](app-shell-theme-runtime.md)).
  `js/main.js` then starts the theme applier, creates the store, starts
  `load()`, calls `applySettings` and `bindSettingControls`, and awaits the
  load before `showMainMenu()`; the load's notification applies every value
  once.
- **Theme id and its format step.** The theme setting is a registry id. The
  store's format step (`UPGRADES`, run by platform storage on an older
  document) maps a stored `light` or `dark` to `joyful-tiles`, leaving every
  other value as it was; `js/theme.js` and the applier's `themeIdFor` map
  them the same way.
- **One owner per value.** The store is the only holder: the sound module
  starts at its own defaults and keeps no copy, the camera's fields are
  written only by `applyLook` and its mode only by `applyCamera`, and the
  theme script reads the document but never writes it.
- **Two documents.** The machine settings document holds `MACHINE_KEYS`,
  the values that belong to one machine; the settings document holds every
  other setting, the theme included, so `js/theme.js` reads only it. A
  write saves only its own document.
- **Machine carry-over.** When no machine settings document is stored and
  neither load reported trouble, the machine values loaded from the settings
  document (or their defaults) are saved as a new machine settings document,
  once; a stored machine settings document always wins, and one that cannot
  be used gives the machine defaults. No format step strips the machine
  values from a settings document, since this carry-over reads them.
- **Loose-key carry-over** — the browser build's alone: `js/main.js` hands
  the store and Reset all data `legacy: null` on the Steam build
  (`capabilities.desktopHost`), so neither reads nor removes the keys there.
  Only when `storage.load` returns no settings document and reported no load
  trouble: each legacy key is read the old owner's way (sensitivity
  `parseFloat`, volume `Number`, both clamped; booleans true only on `'1'`;
  a throwing reader counts as no value), `fieldOfView` is set to
  `EXISTING_FIELD_OF_VIEW` when any value was carried over, then both
  documents are saved.
  The store never writes or deletes the legacy keys; Reset all data removes
  them, so the start after a reset carries nothing over.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  settings, their ranges and defaults, the store's read/write/subscribe and
  failure contracts, the start-up order, the carry-over and the page.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme preference and its carry-over.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioned documents the store saves.

## CROSS-REFERENCES

- [settings-appliers.md](settings-appliers.md) — each setting's applier,
  the theme list, fullscreen and the render resolution.
- [settings-page.md](settings-page.md) — the page, the control binder, the
  Data panel; [settings-reset.md](settings-reset.md) — Reset all data.
- [settings-bindings.md](settings-bindings.md) — the bindings source and the
  active device.
- [app-shell.md](app-shell.md) — wiring in `js/main.js`.
- [app-shell-themes.md](app-shell-themes.md) — the theme registry;
  [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the pre-paint
  script and the theme applier.
- [platform.md](platform.md) — `register`/`load`/`save` and the browser key
  format `js/theme.js` reads.
- [audio.md](audio.md) — the sound module's defaults.
- [testing.md](testing.md) — `tests/settings-store.test.mjs`,
  `tests/settings-page.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting: `SCHEMA`, then its section, label and (for a number) a
  `SLIDERS` entry in `page.js` ([settings-page.md](settings-page.md)), and
  its applier ([settings-appliers.md](settings-appliers.md)); a setting that
  belongs to one machine joins `MACHINE_KEYS`; a setting that changes the
  stored shape bumps its document's version with an upgrade step.
- Changing load, the carry-overs, the format steps or save-failure
  behaviour: `doLoad`, `readLegacy`, `UPGRADES`, `save`, `persist` and
  `persistMachine` in `store.js`; a format
  step that maps a theme is mirrored in `js/theme.js` and
  `js/themes/applier.js`.
