# Screen components

The kit of DOM components every screen of the game is built from — buttons,
menu lists, cards and panels, toggles, sliders, segmented choices, stat
readouts and the overlay bar — and the m1 screens composed from it: the main
menu, the in-game overlay and the results screen, in every theme.

The kit's component catalogue below still holds; its styling is superseded
by [theme-system](./theme-system.md), where every theme styles each
component's parts, and the arrangement of the screens by
[shared-screen-layout](./shared-screen-layout.md) and
[in-game-layout](./in-game-layout.md).

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
names the menus, the in-game overlay (timer, mine counter, click counter,
pause) and the
results screen as part of the one visual language, so moving between modes
never feels like moving between games. A shared kit gives every screen the
same controls, focus behaviour and controller navigation, instead of each
screen restyling buttons and lists of its own.

## Scope and non-goals

In scope (m1-classic-2d):

- Components: primary and secondary buttons, the vertical menu list, card
  and panel surfaces, toggle, slider, segmented choice (for sizes and
  options), numeric stat readout and its stat tile (a bordered readout:
  label, large figure, then a small detail line and an optional button),
  the pager (First, at most five numbered pages around the current one,
  Last; the current page marked, hidden on one page), and the in-game
  overlay bar.
- The column composition: one column below about 1024 px, side by side
  at that width and above, its one breakpoint stated once; the Records
  and Settings screens and the pause card lay out with it.
- States for every interactive component: default, hover, pressed, focused
  and disabled, and selected where it applies. On buttons, menu entries and
  board options, hover and focus are one *selected* state, drawn by the
  theme with no separate focus ring and shown on one control at a time
  (`theme-system` § Architecture, **One selected control**), and pressed is
  drawn apart from it; a board option's chosen board keeps its own mark
  beside that state, so a selected option and the chosen one stay
  distinguishable. Every other control (switches, fields, segmented
  choices, tabs) keeps its own hover and focus states.
- The m1 screens composed from the kit: the main menu, the in-game overlay
  over both the Classic 2D board and the 3D board, the pause card and the
  results screen.
- Every theme for all of the above, styled by `theme-system`.
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
- Campaign, Surface, Leaderboards and demo menu styling — deferred to the
  milestones that bring those entries. The Daily entry and the Daily
  screen are built from the kit, with its code chip (a board code with Copy
  and Copy link) on the results screen, the Daily screen, the Records rows
  and the replay viewer.
- The 3D scene behind the overlay: its sky and its cubes follow the theme
  through `themed-board-art-and-motion`.

## Architecture

Built within the recorded technical direction — the game shell is plain DOM
with no framework and no build step (see
[technical-direction.md](../technical-direction.md)); the current shell is
described in [app-shell.md](../../context/app-shell.md).

- **Component styles.** One stylesheet of component classes, each styled
  only from tokens. A component's look in each theme comes from that
  theme's stylesheet (`theme-system`).
- **Markup conventions.** Each component is a documented markup pattern —
  element, class and ARIA role — rather than a JavaScript widget, matching
  the shell's static-markup-toggled-by-class approach. Components that need
  behaviour (slider value display, segmented choice selection, the pager's
  buttons) get a small helper each.
- **Focus and navigation contract.** Every interactive component is
  reachable by keyboard and by the shell's controller navigation, shows its
  focused state when focused (the selected state, on the components Scope
  names), and declares its default focus target per screen
  in the way the shell's controller layer already expects.
- **Overlay bar.** The timer, mine counter and click counter as one
  component, which the replay viewer shows. In play, both modes take
  `in-game-layout`'s counter strip and figures panel in its place: over the
  3D board each part carries its own themed surface rather than drawing
  directly on the scene, and stays above the scene and the touch-controls
  layer during lockless and touch play, so Pause always takes a tap. On
  either board, the timer
  shows the elapsed time in whole seconds, zero-padded to three digits
  (047), and stops at 999 while the game's elapsed time keeps counting; the
  mine counter shows the real mines left in three digits, a negative count
  taking the minus in the first digit (−05), down to −99, where it stays
  for any lower count; on a
  board of more than 999 mines it is as wide as the board's mine count, so
  it does not shift as the count falls, and a board of up to 999 mines
  keeps the standard counter. The timer's 999 and the counter's −99
  copy the reference game's displays
  ([tests/fidelity/minesweeper-online.md](../../../tests/fidelity/minesweeper-online.md));
  the results, records and leaderboard screens show the real time. The
  click counter ("Clicks", in play the figures panel's clicks figure) shows the game's counted clicks — every click,
  wasted ones included, from the same engine click counts as the game's
  summary: 0 before the first click, each click as it is made, frozen with
  the timer when the game ends, and written only when it changes.
- **Screen compositions.** The main menu, pause card and results screen
  rebuilt from the kit, replacing the shell's existing one-off styles; and
  3D touch play's view-modes toolbar (three toggle buttons, pressed state
  shown) and stick, composed from it.

## Data and state

- No persisted state. Component state (focus, pressed, selected option) is
  DOM state owned by the screen that hosts the component.
- All visual values come from the active theme (`theme-system`).

## Interfaces and contracts

- **Component catalogue** — the class names and markup patterns are the
  contract screens build against; changing one is a breaking change for
  every screen that uses it.
- **Accessibility** — every control has an accessible name; keyboard and
  controller focus is always visible — on buttons, menu entries and board
  options as the selected state. Text meets the contrast contract of `theme-system`'s conformance
  tests in every theme. On every pointer, labels are at least 12 px and key caps at
  least 11 px. On a coarse pointer, and only there, switches (the Reveal /
  Flag switch included), slider thumbs, the 3D overlay's Pause and Restart,
  the Classic 2D game window's Pause and Restart and the 3D touch toolbar's buttons take
  a 44 px touch; a fine pointer keeps every
  hit area's size.
- **Overlay readability** — the 3D overlay's and the Classic 2D game
  window's readouts are `in-game-layout`'s Readability contract.
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
