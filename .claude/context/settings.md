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
| `js/settings/store.js` | load at start-up, the document's format steps, validated writes, whole-document saves, change notification, the one-time `ms3d.*` carry-over; knows none of the appliers |
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
| `theme` | choice | an id of the theme registry (`js/themes/registry.js`) | `joyful-tiles` | the theme applier's `setTheme` ([app-shell-kit.md](app-shell-kit.md)) |
| `volume` | number | 0–1 | 0.7 | `sfx.setVolume` |
| `muted` | boolean | | false | `sfx.setMuted`, the HUD strip (`UI.setSound`), the Sound switch of the page and the pause card (on while false) |
| `aimReadout` | boolean | | true | "3D neighbour count": the aimed-cell readout beside the crosshair, read each frame by `updateReadout` in `js/main.js` ([app-shell-3d-play.md](app-shell-3d-play.md)) |
| `fieldOfView` | number | 45–90 | 60 (45 for an existing install) | the 3D renderer camera's vertical `fov` and projection, then a redraw — play, the menu backdrop and the 3D replay viewer |
| `camera` | choice | `fly`, `orbit` | `fly` | the 3D camera's mode: `js/main.js`'s `setCameraMode`, also mid-game ([app-shell-3d-play.md](app-shell-3d-play.md)), and the 3D rows every help surface shows ([settings-bindings.md](settings-bindings.md)) |

## PUBLIC API

- Schema: `SCHEMA` (frozen `{ key, type: 'number' | 'boolean' | 'choice',
  min?, max?, values?, default, known? }` per setting; a choice with
  `known(value)` accepts what it accepts — the theme's `values` are
  `THEMES`' ids in catalogue order, its `known` is `isRegisteredTheme`),
  `SETTING_KEYS`, `DEFAULTS`, `isValid(key, value)`.
- Store: `SETTINGS_DOC` = `'settings'`, `SETTINGS_VERSION`;
  `LEGACY_KEYS` (`lookSensitivity`, `invertY`, `volume`, `muted` → their
  `ms3d.*` keys), `EXISTING_FIELD_OF_VIEW` = 45.
  `createSettingsStore({ storage, legacy?, onNotKept? })` →
  `{ load, get, set, onChange }`:
  - `load()` → one shared Promise; fills missing or invalid values with
    defaults, except that a stored document without `fieldOfView` loads it
    as `EXISTING_FIELD_OF_VIEW`, and a stored theme id the registry does
    not know loads as the default and is kept in the document, saves
    included, until the player sets the theme; unreadable, corrupt or newer
    storage gives every default.
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
  `applyTheme(store, theme)` (the theme applier's `setTheme`; a rejected
  switch is left to the applier, which has told the player), `applyAudio`, `applyLook`, `applyCamera(store, setMode)`
  (`setMode('fly' | 'orbit')`), `applyResolution`,
  `applyFullscreen(store, { doc, enter, exit })`, `applyFieldOfView(store,
  { camera, redraw })` (the renderer's `THREE.PerspectiveCamera`; `js/main.js`'s
  `redraw` sets `needRender`), and `applySettings(store, { theme?, sfx?,
  camera?, cameraMode?, resolution?, fullscreen?, fieldOfView? })` for all
  at once.

## INTERNAL PATTERNS

- **Start-up order.** `js/theme.js` runs before first paint and reads the
  theme straight from the saved document (`localStorage` key
  `ms3d:doc:settings`, `{ version, data }`, at the current version or the
  one before the format step), mapping it as the format step does, so the
  first paint is already the stored theme ([app-shell-kit.md](app-shell-kit.md)).
  `js/main.js` then starts the theme applier, creates the store, starts
  `load()`, calls `applySettings` and `bindSettingControls`, and awaits the
  load before `showMainMenu()`; the load's notification applies every value
  once.
- **Theme id and its format step.** The theme setting is a registry id. The
  store's format step (`UPGRADES`, run by platform storage on an older
  document) maps a stored `light` or `dark` to `joyful-tiles`, leaving every
  other value as it was; `js/theme.js` and the applier's `themeIdFor` map
  them the same way.
- **Theme list.** The Settings page's Theme section is a
  `ui-segmented--list`: one row per `THEMES` entry in catalogue order, its
  name after a swatch striped from that theme's own tokens, read from its
  stylesheet's text without applying it. The active theme is selected; a
  pick calls the applier's `setTheme` and saves the setting once the switch
  resolves, and a failed switch puts the selection back on the active
  theme. It reads the registry, so a new theme appears with no page change
  ([settings-page.md](settings-page.md)).
- **No reduced-motion setting.** There is no settings field, root marker
  or preference read for reduced motion until `m7-after-launch`: the base
  stylesheet's shipped `@media (prefers-reduced-motion: reduce)` rule
  (`css/style.css`), which stops every DOM animation and transition, is the
  one reduced-motion behaviour, and cell motion on the boards ignores the
  preference.
- **One owner per value.** The store is the only holder: the sound module
  starts at its own defaults and keeps no copy, the camera's fields are
  written only by `applyLook` and its mode only by `applyCamera`, and the
  theme script reads the document but never writes it.
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
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme preference, its carry-over, the theme applier the setting
  drives and the theme list.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioned document the store saves.

## CROSS-REFERENCES

- [settings-page.md](settings-page.md) — the page, the control binder, the
  Data panel and Reset all data.
- [settings-bindings.md](settings-bindings.md) — the bindings source and the
  active device.
- [app-shell.md](app-shell.md) — wiring in `js/main.js`.
- [app-shell-kit.md](app-shell-kit.md) — the theme registry, the pre-paint
  script and the theme applier.
- [platform.md](platform.md) — `register`/`load`/`save` and the browser key
  format `js/theme.js` reads.
- [audio.md](audio.md) — `setVolume`, `setMuted`, the module's defaults.
- [rendering.md](rendering.md) — `BoardRenderer.setPixelRatio`, its `camera`'s `fov`.
- [input-camera.md](input-camera.md) — `FlyCamera.sensitivity` / `invertY`; `OrbitCamera`, the Camera setting's Orbit.
- [testing.md](testing.md) — `tests/settings-store.test.mjs`,
  `tests/settings-appliers.test.mjs`, `tests/settings-page.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting: `SCHEMA`, then its section, label and (for a number) a
  `SLIDERS` entry in `page.js` ([settings-page.md](settings-page.md)), and
  its applier; a setting that changes the stored shape bumps
  `SETTINGS_VERSION` with an upgrade step.
- Changing load, carry-over, the format steps or save-failure behaviour:
  `doLoad`, `readLegacy`, `UPGRADES` and `persist` in `store.js`; a format
  step that maps a theme is mirrored in `js/theme.js` and
  `js/themes/applier.js`.
- Fullscreen state drifting from the browser: `applyFullscreen` and the
  `enterFullscreen` / `exitFullscreen` pair in `js/main.js`.
