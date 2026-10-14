# Settings — schema, store, appliers

## OVERVIEW

The player's settings: one schema declaring every setting, one store holding
the validated values and persisting them through platform storage, the
appliers that carry each value to its owner, the Settings page with Reset
all data ([settings-page.md](settings-page.md)) and the bindings source every
help surface reads ([settings-bindings.md](settings-bindings.md)). Every
module is DOM-free; `js/main.js` wires them ([app-shell.md](app-shell.md)).
Each module's head comment states its full contract.

| File | Responsibility |
| --- | --- |
| `js/settings/schema.js` | each setting's key, type, range or values, default; drives both validation and the page's controls, so a setting is added here and nowhere else |
| `js/settings/store.js` | load at start-up, validated writes, whole-document saves, change notification, the one-time `ms3d.*` carry-over; knows none of the appliers |
| `js/settings/appliers.js` | each setting's effect, applied by its owner subscribing to the store; the render-resolution pixel-ratio rule |
| `js/settings/page.js` | the Settings page, the Data panel's binder, the control binder ([settings-page.md](settings-page.md)) |
| `js/settings/reset.js` | Reset all data ([settings-page.md](settings-page.md)) |
| `js/settings/bindings.js` | the bindings source and the active device ([settings-bindings.md](settings-bindings.md)) |

| Setting | Type | Range / values | Default | Applied to |
| --- | --- | --- | --- | --- |
| `lookSensitivity` | number | 0.25–3 | 1 | 3D camera `sensitivity` |
| `invertY` | boolean | | false | 3D camera `invertY` |
| `confirmRestart` | boolean | | false | "Always ask before restarting": the pause controller's `askRestart` ([app-shell-pause.md](app-shell-pause.md)) |
| `fullscreen` | boolean | | false | browser fullscreen |
| `renderResolution` | choice | `auto`, `sharp`, `fast` | `auto` | 3D renderer pixel ratio |
| `boardScale` | choice | `fit`, `100`, `125` | `100` | the Classic 2D tile's cap (`js/classic2d/board-view.js` `tileCap`): the open board (`mode2d.setScale`) and the replay viewer's 2D board (`REPLAY_VIEWER.setScale`), wired in `js/main.js` |
| `theme` | choice | `light`, `dark` | `light` | `msTheme.setTheme` |
| `volume` | number | 0–1 | 0.7 | `sfx.setVolume` |
| `muted` | boolean | | false | `sfx.setMuted`, the Sound buttons' label, the page's Sound toggle (on while false) |
| `aimReadout` | boolean | | true | "3D neighbour count": the aimed-cell readout beside the crosshair, read each frame by `updateReadout` in `js/main.js` ([app-shell-3d.md](app-shell-3d.md)) |
| `fieldOfView` | number | 45–90 | 60 (45 for an existing install) | the 3D renderer camera's vertical `fov` and projection, then a redraw — play, the menu backdrop and the 3D replay viewer |

## PUBLIC API

- Schema: `SCHEMA` (frozen `{ key, type: 'number' | 'boolean' | 'choice',
  min?, max?, values?, default }` per setting), `SETTING_KEYS`, `DEFAULTS`,
  `isValid(key, value)`.
- Store: `SETTINGS_DOC` = `'settings'`, `SETTINGS_VERSION` = 1;
  `LEGACY_KEYS` (`lookSensitivity`, `invertY`, `volume`, `muted` → their
  `ms3d.*` keys), `EXISTING_FIELD_OF_VIEW` = 45.
  `createSettingsStore({ storage, legacy?, onNotKept? })` →
  `{ load, get, set, onChange }`:
  - `load()` → one shared Promise; fills missing or invalid values with
    defaults, except that a stored document without `fieldOfView` loads it
    as `EXISTING_FIELD_OF_VIEW`; unreadable, corrupt or newer storage gives
    every default.
  - `get(key)` is always valid (the default before load).
  - `set(key, value)` → `{ ok: true }` or `{ ok: false, reason }` —
    `'invalid'` keeps the old value; a save failure keeps the change for the
    session and calls `onNotKept` once per store. A set before `load()` is
    called throws.
  - `onChange(key, fn)` → unsubscribe; `fn(value, key)` after each change
    and once with the loaded value. An unknown key throws everywhere.
- Appliers (each returns its unsubscribe): `pixelRatioFor(resolution,
  devicePixelRatio, cells)` — `auto` the device ratio capped at 2, at 1.5
  above 20³ cells and 1 above 50³; `sharp` the full device ratio; `fast` 1.
  `applyTheme`, `applyAudio`, `applyLook`, `applyResolution`,
  `applyFullscreen(store, { doc, enter, exit })`, `applyFieldOfView(store,
  { camera, redraw })` (the renderer's `THREE.PerspectiveCamera`; `js/main.js`'s
  `redraw` sets `needRender`), and `applySettings(store, { theme?, sfx?,
  camera?, resolution?, fullscreen?, fieldOfView? })` for all at once.

## INTERNAL PATTERNS

- **Start-up order.** `js/theme.js` runs before first paint and reads the
  theme straight from the saved document (`localStorage` key
  `ms3d:doc:settings`, `{ version, data }`, version 1 only), so a Dark player
  never sees Light. `js/main.js` then creates the store, starts `load()`,
  calls `applySettings` and `bindSettingControls`, and awaits the load before
  `showMainMenu()`; the load's notification applies every value once.
- **One owner per value.** The store is the only holder: the sound module
  starts at its own defaults and keeps no copy, the camera's fields are
  written only by `applyLook`, and the theme script reads the document but
  never writes it.
- **Fullscreen follows the browser.** Setting it calls `enter()` / `exit()`
  synchronously, inside the gesture that set it, only when the browser is in
  the other state. On `fullscreenchange`, and when `enter()` or `exit()`
  throws or rejects, the store is set to whether `doc.fullscreenElement` is
  set. F in play sets the setting; `js/main.js`'s `enterFullscreen` also
  takes Keyboard Lock.
- **Resolution.** `js/main.js`'s `applyPixelRatio(n)` remembers the cell
  count of the board shown (game or menu demo) and calls `pixelRatioFor`
  with the current setting; the resolution applier re-runs it on change.
- **Carry-over.** Only when `storage.load` returns no document and reported
  no load trouble: each legacy key is read the old owner's way (sensitivity
  `parseFloat`, volume `Number`, both clamped; booleans true only on `'1'`;
  a throwing reader counts as no value), `fieldOfView` is set to
  `EXISTING_FIELD_OF_VIEW` when any value was carried over, then the whole
  document is saved.
  The store never writes or deletes the legacy keys; Reset all data removes
  them, so the start after a reset carries nothing over.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  settings, their ranges and defaults, the store's read/write/subscribe and
  failure contracts, the start-up order, the carry-over and the page.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the theme applier the theme setting drives.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioned document the store saves.

## CROSS-REFERENCES

- [settings-page.md](settings-page.md) — the page, the control binder, the
  Data panel and Reset all data.
- [settings-bindings.md](settings-bindings.md) — the bindings source and the
  active device.
- [app-shell.md](app-shell.md) — wiring in `js/main.js`, the theme script.
- [platform.md](platform.md) — `register`/`load`/`save` and the browser key
  format `js/theme.js` reads.
- [audio.md](audio.md) — `setVolume`, `setMuted`, the module's defaults.
- [rendering.md](rendering.md) — `BoardRenderer.setPixelRatio`, its `camera`'s `fov`.
- [input.md](input.md) — `FlyCamera.sensitivity` / `invertY`.
- [testing.md](testing.md) — `tests/settings-store.test.mjs`,
  `tests/settings-appliers.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting: `SCHEMA`, then its section, label and (for a number) a
  `SLIDERS` entry in `page.js` ([settings-page.md](settings-page.md)), and
  its applier; a setting that changes the stored shape bumps
  `SETTINGS_VERSION` with an upgrade step.
- Changing load, carry-over or save-failure behaviour: `doLoad`,
  `readLegacy` and `persist` in `store.js`.
- Fullscreen state drifting from the browser: `applyFullscreen` and the
  `enterFullscreen` / `exitFullscreen` pair in `js/main.js`.
