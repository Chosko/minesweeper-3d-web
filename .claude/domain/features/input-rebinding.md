# Input rebinding

Rebinding the keys, mouse buttons and controller buttons that play Classic
2D and 3D, on the Settings page: each mode's actions listed per input
device, a new input captured for any of them, clashes resolved on the spot,
and every mode, the in-game help and the bindings list reading the one
current set of bindings.

## Purpose

[product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)
puts controls among the game's settings, and the m3-on-steam milestone adds
rebinding to them: a desktop game on Steam is expected to let the player
choose their own keys and buttons, and players with other layouts, a
left-handed mouse or a different controller need it to play comfortably.
`settings` already shows each mode's bindings, read-only, from one bindings
source shared with the in-game help; this feature makes that source
editable per player, and makes every mode's input read its actions through
it instead of from fixed keys and buttons.

## Scope and non-goals

In scope (m3-on-steam):

- An action catalogue per mode — Classic 2D and 3D — naming every
  rebindable action and, per input device, its default inputs.
- Rebinding keyboard keys, mouse buttons and controller buttons for those
  actions, with up to two inputs per action per device.
- Clash handling inside one mode and one device, reserved inputs that can
  never be bound, and reset to defaults per mode and device.
- The rebinding controls on the Settings page, in the place of the
  read-only bindings list, operable by mouse, keyboard and controller.
- Saving the player's bindings in the settings document, so they sync
  through Steam Cloud with the other settings in the desktop build.
- Classic 2D's pointer and cursor input and the 3D mode's keyboard, mouse
  and controller input reading their actions through the current bindings;
  the in-game help showing the current bindings.

Non-goals:

- Rebinding axes: mouse movement, the mouse wheel (3D spacing), the
  controller's sticks. They keep their fixed roles; the d-pad's cursor
  moves in Classic 2D are buttons and are rebindable.
- Rebinding the shell's inputs: menu navigation, Back and Pause (Esc, the
  controller's back and Start buttons) are fixed and reserved, so the
  player can never lose the way out of a screen.
- Changing what an action does. The rules, the release-based mouse actions
  and their chord gestures, the 3D view modes' held behaviour and every
  control the original spec pins stay as they are; rebinding changes only
  which physical input produces an action. The defaults are today's
  bindings, which reproduce the spec.
- Per-device or per-controller profiles, macros, and binding one input to
  several actions.
- Steam Input's own controller configuration — the game reads the
  controller through the browser's gamepad interface as before.
- Bindings for modes that do not exist yet — Surface, campaigns, daily
  boards — each adds its catalogue when it lands.
- The look of the page's controls — `screen-components`.

## Architecture

Built within the recorded technical direction — plain DOM and ES modules in
the game shell, settings stored behind the platform layer (see
[technical-direction.md](../technical-direction.md)). It extends the
`settings` store and page and the input layers of both modes
([input.md](../../context/input.md), [app-shell.md](../../context/app-shell.md)).

- **Action catalogue.** One declaration per mode of every rebindable
  action — its identifier, its label, whether it fires on press, on release
  or while held, and its default inputs per device (keyboard, mouse,
  controller). The 3D catalogue holds the six move directions, the three
  held view modes, reveal and flag; Classic 2D's holds reveal, flag, chord
  and the four cursor moves. It replaces the fixed bindings source the
  read-only list and the in-game help read today.
- **Bindings resolver.** Joins the catalogue's defaults with the player's
  overrides into the current bindings, and answers both directions: which
  action, if any, an input produces in a mode, and which inputs an action
  has, for display. It validates overrides and enforces the clash and
  reserved-input rules. It is DOM-free.
- **Input translation in each mode.** Each mode's input layer asks the
  resolver which action a key, mouse button or controller button means
  instead of testing fixed codes. Mouse buttons are translated to the
  logical buttons the release state machines already work on — the 3D
  mouse actions and Classic 2D's pointer input — so their chord gestures
  are untouched; a direct chord binding feeds the same actions. The 3D
  view-mode holds and move keys are translated before the controls union
  reads them, so a controller and a keyboard still combine as they do now.
- **Rebinding page.** On the Settings page, the Controls section's bindings
  list becomes one panel per mode with a tab per device. Each action shows
  its inputs as slots; choosing a slot starts capture, the next input of
  that device fills it, and the shell's Back input cancels. A clash, a
  reserved input or a last binding removed is reported in place. Each
  panel has Reset to defaults for its mode and device.
- **Help and glyphs.** The in-game help and the page draw labels from the
  current bindings: keys by their position code, shown with the
  keyboard layout's name for that key where the browser can tell it;
  controller buttons with the connected pad's glyphs.

## Data and state

- **Overrides** — one setting in the settings document, keyed by mode,
  device and action, holding the input list for every action the player
  changed; actions left at their default are absent, so a later change of
  defaults reaches every player who never touched that action. Saved,
  loaded and synced with the rest of the settings document through
  `settings` and `platform-storage`.
- **Input identity** — a key by its physical position code (so a layout
  change does not move bindings), a mouse button by its button number, a
  controller button by its standard-mapping index.
- **Current bindings** — derived in memory by the resolver from the
  catalogue and the overrides; rebuilt when the overrides change.
- **Capture state** — the slot being captured, held by the page only while
  capture is open.

## Interfaces and contracts

- **Resolve** — `actionFor(mode, device, input)` returns the action or
  none; `inputsFor(mode, device, action)` returns its current inputs in
  slot order.
- **Bind** — `bind(mode, device, action, slot, input)` writes through the
  settings store. An input already bound to another action of the same
  mode and device moves to the action being bound, and that other action
  takes the replaced input in its place, so no action loses its input
  silently; the page names the swap. Reserved inputs are refused.
- **Clear and reset** — clearing a slot is refused when it is the action's
  last input on keyboard and mouse together, or on the controller, so each
  mode stays playable on each device; reset restores the catalogue's
  defaults for one mode and device.
- **Reserved inputs** — Esc, the controller's back and Start buttons, the
  controller's home button, and keys the browser or the system keeps for
  itself (Tab, the Meta keys, function keys used for fullscreen and
  developer tools). Mouse movement, the wheel and the sticks are not inputs
  here at all.
- **Change notification** — the resolver subscribes to the overrides
  setting through the settings store; modes read the resolver on each
  input, so a change applies from the next input with no restart.
- **Held inputs** — an input held when its binding changes is dropped, not
  fired, as the input layers already drop held state on pause and focus
  loss.
- **Failure** — overrides that fail validation (an unknown action or input,
  a clash, a reserved input) are discarded for that mode and device, which
  fall back to defaults; the rest are kept. Storage failure follows
  `settings`: the change applies for the session and the player is told
  once that settings will not be kept.
- **Replays, records and leaderboards** — unaffected: they record and
  verify engine actions, never the inputs that produced them.

## Dependencies

- `settings` — the settings document and store the overrides live in, and
  the Settings page and bindings source this feature turns editable.
- `classic-2d-square-play` — the pointer state machine and cell cursor that
  read their actions through the resolver, and the default Classic 2D
  mapping.
- `3d-play-flow` — the 3D mode on the shared engine whose keyboard, mouse
  and controller input reads its actions through the resolver.
- `game-shell` — the reserved Back and Pause inputs and shell navigation on
  the page.
- `screen-components` — the tabs, list and capture prompt of the page.
- No external libraries.

## Open questions

- Whether the desktop build should turn Steam Input off for the game, so a
  Steam controller configuration never remaps buttons underneath the
  game's own bindings. Blocks nothing in this feature; settled with the
  Steamworks app configuration.
