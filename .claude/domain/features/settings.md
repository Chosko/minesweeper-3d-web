# Settings

The Settings page and the settings behind it: controls, graphics, theme and
audio, each with a default, kept between sessions and applied the moment the
player changes it.

## Purpose

[product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)
lists controls, graphics, the light or dark theme, audio and accessibility as
the game's settings. Today the look sensitivity, invert Y and volume live in
the pause card and the theme does not exist; this feature gives them one
page reached from the main menu, one store with defaults and validation, and
one way for the rest of the game to read a value and hear when it changes.

## Scope and non-goals

In scope (m1-classic-2d):

- The Settings page, reached from the main menu, built from
  `screen-components` and fully operable by mouse, keyboard and controller.
- Controls: look sensitivity and invert Y, which apply to mouse and
  controller look in 3D, and a read-only list of the bindings for each mode
  and input device, drawn from the same source as the in-game help.
- Graphics: fullscreen, and the 3D render resolution — Auto (the current
  adaptive pixel-ratio cap), Sharp (the highest the screen allows) and Fast
  (one device pixel per CSS pixel).
- Theme: Light or Dark, Light until the player picks. Changing it applies
  at once through `design-tokens-and-themes`.
- Audio: volume and mute, the values the existing sound module keeps.
- The settings store: defaults, validation, persistence through
  `platform-storage`, and change notification.
- Carrying over the values players already have from the current web build
  (look sensitivity, invert Y, volume, mute), so nobody loses them.

Non-goals:

- Rebinding keys, mouse buttons or controller buttons — `input-rebinding`,
  in `m3-on-steam`. Here the bindings are shown, not edited.
- A "Match system" theme option — the theme is Light or Dark only.
- The colour-blind-safe number set and its accessibility setting — deferred
  to `m6-launch`, unless it falls out of the base palette in m1.
- Steam Cloud sync of settings — `m3-on-steam`, through `platform-storage`.
- The look of the page's controls — `screen-components`.

## Architecture

Built within the recorded technical direction — plain DOM and ES modules in
the game shell, with storage behind the platform layer (see
[technical-direction.md](../technical-direction.md)). It takes over the
settings handling now spread across the shell's UI module and the sound
module ([app-shell.md](../../context/app-shell.md),
[audio.md](../../context/audio.md)).

- **Settings schema.** One declaration of every setting: its key, type,
  allowed values or range, and default. Validation and the page's controls
  are both driven from it, so a setting is added in one place.
- **Settings store.** Loads the saved settings at start-up, before the
  first screen shows, fills anything missing or invalid with its default,
  and holds the values in memory. Writes go through the store, which validates, saves
  through `platform-storage` and notifies subscribers.
- **Appliers.** Each setting's effect is applied by its owner subscribing to
  the store: the theme applier of `design-tokens-and-themes`, the sound
  module's volume and mute, the 3D camera's sensitivity and invert Y, the
  3D renderer's pixel ratio, and the browser's fullscreen state. The store
  knows none of them.
- **Settings page.** The page itself: sections for controls, graphics,
  theme and audio, each control bound to one schema entry, with Back to the
  screen it was opened from. The bindings list reads the same source as the
  in-game help, so the two never disagree.
- **Pause-card shortcuts.** The pause card keeps quick access to
  sensitivity, invert Y and volume, bound to the same store.

## Data and state

- **Saved settings** — one versioned settings document: look sensitivity
  (0.25–3, default 1), invert Y (default off), fullscreen (default off),
  render resolution (Auto, Sharp or Fast; default Auto), theme (light or
  dark; default light), volume (0–1, default 0.7) and mute (default off).
  Persisted through `platform-storage`.
- **In memory** — the validated current values, the single source of truth
  while the game runs.
- **Carried-over values** — on first start with no settings document, the
  store reads the current build's separate keys for sensitivity, invert Y,
  volume and mute once, writes them into the new document, and from then on
  reads only the document.
- **Fullscreen** — the browser can leave fullscreen on its own (the player
  presses Esc); the store follows the browser's state rather than fighting
  it.

## Interfaces and contracts

- **Read** — `get(key)` returns the current, always valid value.
- **Write** — `set(key, value)` validates, stores and notifies; an invalid
  value is rejected and the old value kept, never saved.
- **Subscribe** — `onChange(key, listener)` fires after a value changes,
  including at start-up for the loaded value, so an applier needs no
  separate initial read.
- **Start-up order** — the store finishes loading before the shell shows
  its first screen, so the theme applier never shows the wrong theme.
- **Failure** — when storage cannot be read, every setting takes its
  default; when it cannot be written, the change still applies for the
  session and the player is told once that settings will not be kept.

## Dependencies

- `platform-storage` — loading and saving the settings document.
- `design-tokens-and-themes` — the theme applier the theme setting drives.
- `screen-components` — the page's components: toggles, sliders, segmented
  choices, menu lists.
- `game-shell` — routes to the page from the main menu and back.
- No external libraries.
