# Settings — map and schema

## OVERVIEW

The player's settings: one schema declaring every setting, one store holding
the validated values and persisting them through platform storage
([settings-store.md](settings-store.md)), the
appliers that carry each value to its owner
([settings-appliers.md](settings-appliers.md)), the Settings page
([settings-page.md](settings-page.md)) with Reset all data
([settings-reset.md](settings-reset.md)), and the action catalogues and the
bindings resolver ([settings-bindings.md](settings-bindings.md)) with the
bindings source every help surface reads
([settings-bindings-rows.md](settings-bindings-rows.md)). Every
module is DOM-free; `js/main.js` wires them ([app-shell.md](app-shell.md)).
Each module's head comment states its full contract.

| File | Responsibility |
| --- | --- |
| `js/settings/schema.js` | each setting's key, type, range or values, default; drives both validation and the page's controls, so a setting is added here and nowhere else |
| `js/settings/store.js` | the two documents — settings and machine settings — loaded at start-up, the settings document's format steps, validated writes, whole-document saves, change notification, the one-time carry-overs ([settings-store.md](settings-store.md)) |
| `js/settings/appliers.js` | each setting's effect, applied by its owner subscribing to the store; the render-resolution pixel-ratio rule ([settings-appliers.md](settings-appliers.md)) |
| `js/settings/page.js` | the Settings page and the control binder ([settings-page.md](settings-page.md)), the Data panel's binder ([settings-reset.md](settings-reset.md)) |
| `js/settings/reset.js` | Reset all data ([settings-reset.md](settings-reset.md)) |
| `js/settings/bindings.js` | the action catalogues and the active device ([settings-bindings.md](settings-bindings.md)), the bindings source ([settings-bindings-rows.md](settings-bindings-rows.md)) |
| `js/settings/resolver.js` | the bindings resolver: the catalogues' defaults joined with the `bindings` setting, both directions, bind / clear / reset through the store ([settings-bindings.md](settings-bindings.md)) |

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
| `bindings` | overrides | a plain object: catalogue → device → action → inputs, only the actions the player changed; the resolver validates the rest | `{}` | the bindings resolver (`js/settings/resolver.js`), which every help surface reads ([settings-bindings.md](settings-bindings.md)) |
| `camera` | choice | `fly`, `orbit` | `fly` | the 3D camera's mode: `js/main.js`'s `setCameraMode`, also mid-game ([app-shell-3d-camera.md](app-shell-3d-camera.md)), and the 3D rows every help surface shows ([settings-bindings-rows.md](settings-bindings-rows.md)) |

## PUBLIC API

- Schema: `SCHEMA` (frozen `{ key, type: 'number' | 'boolean' | 'choice' | 'overrides',
  min?, max?, values?, default, known? }` per setting; a choice with
  `known(value)` accepts what it accepts — the theme's `values` are
  `THEMES`' ids in catalogue order, its `known` is `isRegisteredTheme`),
  `SETTING_KEYS`, `DEFAULTS`, `isValid(key, value)`.
- Store (`createSettingsStore`, the document names, `MACHINE_KEYS`, the
  legacy keys): [settings-store.md](settings-store.md).
- Appliers, `pixelRatioFor` and `applySettings`:
  [settings-appliers.md](settings-appliers.md).

## INTERNAL PATTERNS

- **One schema.** Validation, defaults and the page's controls all read
  `SCHEMA`; the store's own rules — start-up order, the two documents, the
  carry-overs, one owner per value — are
  [settings-store.md](settings-store.md)'s.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  settings, their ranges and defaults, and the page.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme preference.

## CROSS-REFERENCES

- [settings-store.md](settings-store.md) — the store, its documents, start-up
  order and carry-overs.
- [settings-appliers.md](settings-appliers.md) — each setting's applier,
  the theme list, fullscreen and the render resolution.
- [settings-page.md](settings-page.md) — the page, the control binder, the
  Data panel; [settings-reset.md](settings-reset.md) — Reset all data.
- [settings-bindings.md](settings-bindings.md) — the catalogues, the resolver
  and the active device; [settings-bindings-rows.md](settings-bindings-rows.md)
  — the bindings source.
- [app-shell.md](app-shell.md) — wiring in `js/main.js`.
- [app-shell-themes.md](app-shell-themes.md) — the theme registry;
  [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the pre-paint
  script and the theme applier.
- [testing-files.md](testing-files.md) — `tests/settings-store.test.mjs`,
  `tests/settings-page.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting: `SCHEMA`, then its section, label and (for a number) a
  `SLIDERS` entry in `page.js` ([settings-page.md](settings-page.md)), and
  its applier ([settings-appliers.md](settings-appliers.md)); its storage
  rules are [settings-store.md](settings-store.md)'s.
