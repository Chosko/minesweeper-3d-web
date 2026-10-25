# Settings — appliers

## OVERVIEW

How each setting reaches its owner: `js/settings/appliers.js` holds each
setting's effect, applied by its owner subscribing to the store, and the
render-resolution pixel-ratio rule. DOM-free; `js/main.js` wires it
([app-shell.md](app-shell.md)). The schema, the store and the table of
every setting with what it is applied to are [settings.md](settings.md).
The module's head comment states its full contract.

## PUBLIC API

- Appliers (each returns its unsubscribe): `pixelRatioFor(resolution,
  devicePixelRatio, cells)` — `auto` the device ratio under a cap that
  steps down to 1 as the board's cell count grows (the steps are `pixelRatioFor`'s); `sharp` the
  full device ratio; `fast` 1.
  `applyTheme(store, theme)` (the theme applier's `setTheme`; a rejected
  switch is left to the applier, which has told the player), `applyAudio`, `applyLook`, `applyCamera(store, setMode)`
  (`setMode('fly' | 'orbit')`), `applyResolution`,
  `applyFullscreen(store, { doc, enter, exit })`, `applyFieldOfView(store,
  { camera, redraw })` (the renderer's `THREE.PerspectiveCamera`; `js/main.js`'s
  `redraw` sets `needRender`), and `applySettings(store, { theme?, sfx?,
  camera?, cameraMode?, resolution?, fullscreen?, fieldOfView? })` for all
  at once.

## INTERNAL PATTERNS

- **Theme list.** The Settings page's Theme section is a
  `ui-segmented--list`: one card per `THEMES` entry in catalogue order, its
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
- **Fullscreen follows the browser.** Setting it calls `enter()` / `exit()`
  synchronously, inside the gesture that set it, only when the browser is in
  the other state. On `fullscreenchange`, and when `enter()` or `exit()`
  throws or rejects, the store is set to whether `doc.fullscreenElement` is
  set. F in play sets the setting; `js/main.js`'s `enterFullscreen` also
  takes Keyboard Lock.
- **Resolution.** `js/main.js`'s `applyPixelRatio(n)` remembers the cell
  count of the board shown (game or menu demo) and calls `pixelRatioFor`
  with the current setting; the resolution applier re-runs it on change.
- **One writer per owner.** The camera's fields are written only by
  `applyLook` and its mode only by `applyCamera`
  ([settings.md](settings.md) § One owner per value).

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — what
  each setting does and the page.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme applier the setting drives and the theme list.

## CROSS-REFERENCES

- [settings.md](settings.md) — the schema, the store the appliers
  subscribe to, the settings table.
- [settings-page.md](settings-page.md) — the page the theme list sits on.
- [app-shell-themes.md](app-shell-themes.md) — the theme registry;
  [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the theme
  applier.
- [audio.md](audio.md) — `setVolume`, `setMuted`.
- [rendering.md](rendering.md) — `BoardRenderer.setPixelRatio`, its `camera`'s `fov`.
- [input-camera.md](input-camera.md) — `FlyCamera.sensitivity` / `invertY`; `OrbitCamera`, the Camera setting's Orbit.
- [testing.md](testing.md) — `tests/settings-appliers.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting's effect: its applier and its place in `applySettings`.
- Fullscreen state drifting from the browser: `applyFullscreen` and the
  `enterFullscreen` / `exitFullscreen` pair in `js/main.js`.
