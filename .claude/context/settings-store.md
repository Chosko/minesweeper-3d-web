# Settings — store

## OVERVIEW

`js/settings/store.js`: the two documents — settings and machine settings —
loaded at start-up, the settings document's format steps, validated writes,
whole-document saves, change notification, the one-time carry-overs (machine
values from an old settings document, the browser build's `ms3d.*` keys); it
knows none of the appliers. The schema it validates against and the map of
the settings modules are [settings.md](settings.md)'s. DOM-free; the
module's head comment states its full contract.

## PUBLIC API

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

## INTERNAL PATTERNS

- **Start-up order.** `js/theme.js` runs before first paint and reads the
  theme straight from the saved document — on the web the `localStorage`
  key `ms3d:doc:settings`, `{ version, data }`, at the current version or
  the one before the format step; on the desktop host the theme id the host
  read from the document's file and handed over — mapping it as the format
  step does, so the first paint is already the stored theme ([app-shell-theme-runtime.md](app-shell-theme-runtime.md)).
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
  store's read/write/subscribe and failure contracts, the start-up order
  and the carry-over.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme preference and its carry-over.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioned documents the store saves.

## CROSS-REFERENCES

- [settings.md](settings.md) — the settings map and the schema the store
  validates against.
- [settings-appliers.md](settings-appliers.md) — the appliers subscribing
  to the store; [settings-reset.md](settings-reset.md) — Reset all data and
  the legacy keys it removes.
- [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the pre-paint
  script and the theme applier.
- [platform.md](platform.md) — `register`/`load`/`save` and the browser key
  format `js/theme.js` reads.
- [audio.md](audio.md) — the sound module's defaults.
- [testing-files.md](testing-files.md) — `tests/settings-store.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting that belongs to one machine: it joins `MACHINE_KEYS`; a
  setting that changes the stored shape bumps its document's version with an
  upgrade step.
- Changing load, the carry-overs, the format steps or save-failure
  behaviour: `doLoad`, `readLegacy`, `UPGRADES`, `save`, `persist` and
  `persistMachine` in `store.js`; a format
  step that maps a theme is mirrored in `js/theme.js` and
  `js/themes/applier.js`.
