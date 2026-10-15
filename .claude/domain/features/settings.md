# Settings

The Settings page and the settings behind it: controls, graphics, theme and
audio, each with a default, kept between sessions and applied the moment the
player changes it.

## Purpose

[product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)
lists controls, graphics, the theme, audio and accessibility as
the game's settings. This feature gives them one page reached from the main
menu, one store with defaults and validation that keeps them in one settings
document, and one way for the rest of the game to read a value and hear when
it changes; the pause card keeps quick access to volume in both modes, and to
look sensitivity and invert Y on a 3D game's pause card only, through the
same store.

## Scope and non-goals

In scope (m1-classic-2d):

- The Settings page, reached from the main menu, built from
  `screen-components` and fully operable by mouse, keyboard and controller.
- Controls: look sensitivity and invert Y, which apply to mouse, keyboard,
  controller and touch look in 3D; "Camera: Fly | Orbit", default Fly, which
  chooses between the 3D game's first-person flight and an orbit around the
  board's centre; "Always ask before restarting", which brings back
  the confirmation before a restart abandons a started game (`game-shell`
  § Restart); and a read-only list of the bindings for each mode and input
  device, touch included for both modes, drawn from the same source as the in-game
  help.
- Graphics: fullscreen; the 3D render resolution — Auto (the current
  adaptive pixel-ratio cap), Sharp (the highest the screen allows) and Fast
  (one device pixel per CSS pixel); and the 2D board scale — Fit, 100 % and
  125 %, the cap on the Classic 2D tile (`classic-2d-square-play`
  § Architecture, "Board view"), applied at once to an open board and to
  the replay viewer; the 3D neighbour count — the readout beside the
  crosshair in 3D play — on by default; and the field of view — the 3D
  camera's vertical field of view, 45 to 90°, 60 by default — applied at
  once in play, behind the menu and in the replay viewer.
- Theme: one of the catalogue's themes, picked from a list, *Joyful tiles*
  until the player picks; the list and the carry-over of a stored light or
  dark choice are `theme-system`'s. Changing it
  applies at once.
- Audio: Sound (the on/off control, on while sound plays, stored as mute)
  and Volume, the values the existing sound module keeps.
- The settings store: defaults, validation, persistence through
  `platform-storage`, and change notification.
- Carrying over the values players already have from the current web build
  (look sensitivity, invert Y, volume, mute), so nobody loses them.

Non-goals:

- Rebinding keys, mouse buttons or controller buttons — `input-rebinding`,
  in `m3-on-steam`. Here the bindings are shown, not edited.
- A "Match system" theme option — each theme is one fixed look.
- The colour-blind-safe number set and its accessibility setting — deferred
  to `m6-launch`, unless it falls out of the base palette in m1.
- Steam Cloud sync of settings — `m3-on-steam`, through `platform-storage`.
- The look of the page's controls — `screen-components`.

## Architecture

Built within the recorded technical direction — plain DOM and ES modules in
the game shell, with storage behind the platform layer (see
[technical-direction.md](../technical-direction.md)). It takes over the
settings handling for the shell's UI module and the sound module ([app-shell.md](../../context/app-shell.md),
[audio.md](../../context/audio.md)).

- **Settings schema.** One declaration of every setting: its key, type,
  allowed values or range, and default. Validation and the page's controls
  are both driven from it, so a setting is added in one place.
- **Settings store.** Loads the saved settings at start-up, before the
  first screen shows, fills anything missing or invalid with its default —
  except the field of view of an existing install (a saved document
  without it, or a first start that carries over a legacy value), which
  loads as 45° — and holds the values in memory. Writes go through the store, which validates, saves
  through `platform-storage` and notifies subscribers.
- **Appliers.** Each setting's effect is applied by its owner subscribing to
  the store: the theme applier of `theme-system`, the sound
  module's volume and mute, the 3D camera's sensitivity, invert Y and mode, the
  3D renderer's pixel ratio and field of view, and the browser's fullscreen
  state. The store
  knows none of them.
- **Settings page.** The page itself: sections for controls, graphics,
  theme and audio, each control bound to one schema entry, then the
  bindings list, and last a Data panel, with Back to the screen it was
  opened from in a sticky action row at the bottom of the page, so Back
  stays in view at any scroll position and a focused control is never under
  it. At about 1024 px wide and more the page widens and shows its
  sections side by side in as many columns as fit, the bindings list with
  its mode × device lists side by side, and the Data panel and Back across
  the full width at the bottom; narrower, one column. The layout is
  generated from the section list and the bindings source, so a section
  or setting added later joins a column with no layout of its own. The
  bindings list reads the same source as the in-game help, so the two
  never disagree.
- **Export.** The Data panel offers `records-screen`'s two exports first —
  "Export history (CSV)" and "Export all (JSON)", with a line saying what
  they save — before "Reset all data…", so the player can keep a copy
  before deleting; both call the one export module the Records screen
  uses, and with no game recorded they are disabled with a line saying
  there is nothing to export yet.
- **Reset all data.** The Data panel's last action. Its confirmation, in the
  panel, names what goes — records, game history, replays, settings, the
  last board choices (Classic 2D and 3D) and the first-use hints — and says
  it is deleted from this browser for good; focus moves to Cancel, and
  Cancel, Back or leaving the page change nothing. Confirming waits for the
  replay library's start-up load, then clears every document and kept-aside
  copy (`platform-storage`'s clear), every replay blob and the carried-over
  legacy keys with the old first-use key, and reloads the page, so every
  owner starts from nothing as a new player's game does. A part that cannot
  be deleted is named in a warning line in place of the confirmation, the
  rest is still cleared, nothing reloads and the action stays available.
- **Pause-card shortcuts.** The pause card keeps quick access to volume in
  both modes, and to look sensitivity and invert Y on a 3D game's pause card
  only, bound to the same store.

## Data and state

- **Saved settings** — one versioned settings document: look sensitivity
  (0.25–3, default 1), invert Y (default off), fullscreen (default off),
  render resolution (Auto, Sharp or Fast; default Auto), 2D board scale
  (Fit, 100 % or 125 %; default 100 %), theme (a theme id, default
  *Joyful tiles*), volume (0–1, default 0.7), mute (default off), always
  ask before restarting (default off), field of view (45–90°, default
  60; 45 for a document saved without it) and camera (Fly or Orbit; default
  Fly, also for a document saved without it). Persisted through
  `platform-storage`.
- **In memory** — the validated current values, the single source of truth
  while the game runs.
- **Carried-over values** — on first start with no settings document, the
  store reads the current build's separate keys for sensitivity, invert Y,
  volume and mute once, writes them into the new document — with the field
  of view at 45° when it carried any of them over — and from then on reads
  only the document. Reset all data removes those keys, so the start
  after a reset carries nothing over and every setting takes its default.
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
- `theme-system` — the theme applier the theme setting drives, and the
  theme list.
- `screen-components` — the page's components: toggles, sliders, segmented
  choices, menu lists.
- `game-shell` — routes to the page from the main menu and back.
- `records-screen` — the export module the Data panel's export actions call.
- No external libraries.
