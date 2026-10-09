# Screen components

The kit of DOM components every screen of the game is built from — buttons,
menu lists, cards and panels, toggles, sliders, segmented choices, stat
readouts and the overlay bar — and the m1 screens composed from it: the main
menu, the in-game overlay and the results screen, in both themes.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
names the menus, the in-game overlay (timer, mine counter, pause) and the
results screen as part of the one visual language, so moving between modes
never feels like moving between games. A shared kit gives every screen the
same controls, focus behaviour and controller navigation, instead of each
screen restyling buttons and lists of its own.

## Scope and non-goals

In scope (m1-classic-2d):

- Components: primary and secondary buttons, the vertical menu list, card
  and panel surfaces, toggle, slider, segmented choice (for sizes and
  options), numeric stat readout, and the in-game overlay bar.
- States for every interactive component: default, hover, pressed, focused
  (a visible focus ring for keyboard and controller) and disabled.
- The m1 screens composed from the kit: the main menu, the in-game overlay
  over both the Classic 2D board and the 3D board, the pause card and the
  results screen.
- Both themes for all of the above, from `design-tokens-and-themes`.
- Low-fidelity styling: plain, functional components and screens, every
  state distinct and legible, with simple placeholder values wherever a
  value is a visual-design judgement (relief, shadows, motion). The
  accessibility, overlay-readability and controller-parity contracts hold
  in full.

Non-goals:

- High-fidelity visual dressing — a later pass from the approved designs.
  The designs under iteration are not an input to this feature's tasks.
- The Settings page's layout and behaviour — the Main menu and game shell
  settings feature (m1-classic-2d) builds it from these components.
- What each screen does — menu entries and their flow, pause and restart
  behaviour, results contents and records — belongs to Main menu and game
  shell and to Results and records. This feature styles them.
- Steam rank on the results screen — deferred to `m3-on-steam`.
- Campaign, Daily, Surface, Leaderboards and demo menu styling — deferred to
  the milestones that bring those entries.
- The 3D scene behind the overlay, which keeps its current look under both
  themes.

## Architecture

Built within the recorded technical direction — the game shell is plain DOM
with no framework and no build step (see
[technical-direction.md](../technical-direction.md)); the current shell is
described in [app-shell.md](../../context/app-shell.md).

- **Component styles.** One stylesheet of component classes, each styled
  only from tokens. A component's look in either theme follows from the
  token values; no component carries theme-specific rules of its own.
- **Markup conventions.** Each component is a documented markup pattern —
  element, class and ARIA role — rather than a JavaScript widget, matching
  the shell's static-markup-toggled-by-class approach. Components that need
  behaviour (slider value display, segmented choice selection) get a small
  helper each.
- **Focus and navigation contract.** Every interactive component is
  reachable by keyboard and by the shell's controller navigation, shows the
  focus ring when focused, and declares its default focus target per screen
  in the way the shell's controller layer already expects.
- **Overlay bar.** The in-game overlay — timer, mine counter, pause — as one
  component that sits over either board and stays readable over the 3D
  scene's light sky in both themes, by carrying its own themed surface
  rather than drawing directly on the scene. Over either board, the timer
  shows the elapsed time in whole seconds, zero-padded to three digits
  (047).
- **Screen compositions.** The main menu, pause card and results screen
  rebuilt from the kit, replacing the shell's existing one-off styles.

## Data and state

- No persisted state. Component state (focus, pressed, selected option) is
  DOM state owned by the screen that hosts the component.
- All visual values come from `design-tokens-and-themes`.

## Interfaces and contracts

- **Component catalogue** — the class names and markup patterns are the
  contract screens build against; changing one is a breaking change for
  every screen that uses it.
- **Accessibility** — every control has an accessible name; focus is always
  visible; text meets the contrast contract of `design-tokens-and-themes` in
  both themes.
- **Overlay readability** — the overlay bar meets the contrast contract
  against its own surface whichever board and theme sit behind it.
- **Controller parity** — anything clickable is reachable and operable with
  a controller, per the shell's controller navigation.

## Dependencies

- `design-tokens-and-themes` — every colour, size, radius, shadow and motion
  value.
- Main menu and game shell (m1-classic-2d) — hosts the screens, owns their
  behaviour and controller navigation, and builds the Settings page from
  this kit.
- `results-screen` — supplies the content and behaviour of the results
  screen.
- No external libraries.
