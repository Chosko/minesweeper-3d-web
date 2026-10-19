# Shared screen layout

The redesigned arrangement every screen of the game shares, designed with
*Joyful tiles*: the page backdrop, the framed window each screen sits in, the
main menu, the board choice screens, the Daily screen, and the pause,
results, Records, Settings and replay screens with the cards, confirmations
and messages around them — the same layout under every theme, each theme
restyling it.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
gives the game one shared layout that every theme styles, designed together
with the first theme; later themes add styles, not layouts. The m1 screens
were composed from the kit in low fidelity. This feature recomposes them in
the shipping layout, before the Steam milestone adds its own screens, so
those are drawn once, in the layout that ships. The in-game screen, which
carries live figures of its own, is `in-game-layout`.

## Scope and non-goals

In scope (m2b-themes):

- **New kit components** the layout needs, added to the kit catalogue
  (`theme-system`) with their parts, states and decoration slots, and styled
  by *Joyful tiles* — every component the canvas's *J-Components* artboard
  draws that the kit lacks, among them:
  - the **page backdrop** behind every screen (a dotted paper in *Joyful
    tiles*, a gradient or a flat desktop colour in other themes);
  - the **screen frame** — a window with a head (back action left, title
    centre, screen action right), a body and a foot (a status line, or a
    bottom bar summarising the selection beside the screen's actions), and
    a decoration slot for window chrome such as a title bar's decorative
    buttons;
  - the **mode entry** — the main menu's large entry with icon and label,
    each mode with its own accent and the places (Records, Settings) a
    neutral one, a Last played chip, and a disabled state with its reason
    for an entry that cannot open here (3D without WebGL 2, Quit on the
    web);
  - the **board option** — a board preset with its name, size line, mine
    density and the Last played chip beside its name, selectable, with the
    chosen state (a fill and a check) apart from its selected state;
  - the **section label**, the **key hint** (a key or controller button
    shown beside an action), the **stat tile** (label, figure, detail line,
    an optional badge), the **chip** (a state, a rank or *Coming soon*) and
    the **list row** of recent games;
  - the **scene panel** — a framed region of a screen a mode's own renderer
    draws into.
- **The selected state** — buttons, menu entries and board options follow
  the kit's state model (`screen-components` § Scope and non-goals): *Joyful
  tiles* draws them raised by default, level with their surface when
  selected, sunk below it when pressed, and flat when disabled, as
  *J-Components* shows.
- **Main menu** — the game's title in one line at the top, centred; on the
  left the entries in three blocks — Classic 2D, Hexagon, Triangle, Surface
  and 3D; Daily, Records and Settings; Quit — with no group labels, every
  entry the same height but the selected one, which is taller with a bigger
  icon and label, the blocks together exactly as tall as the preview — the
  entries and the preview share one row of the menu, every entry growing
  from nothing to an equal share of the column and the selected one to a
  larger share; on
  the right the preview of the selected entry: a real Classic 2D board drawn
  by its board view, the real cube orbiting for 3D (a static themed
  background without WebGL 2), today's daily Expert board with its marked
  start cell for Daily, a colour badge with *Coming soon* for Hexagon,
  Triangle and Surface, a neutral badge for Records and Settings, and
  *Desktop build only* for Quit on the web. The menu opens on the last mode
  played (`game-shell`). Under the blocks, the key hints for the active
  input device — move and select, no Back — and the build label. No Play
  again, no session strip, no bests, no tagline and no credit line; the
  controls reference, the sound switch and the volume live on the Settings
  page only. On a phone: no preview — the title, the entries filling the
  screen, the touch note and the build label.
- **Board choice screens** — Classic 2D and 3D, one composition: the game's
  title above a window sized to its content, centred on the page and pushed
  below the title only when the page is too short for both — the 3D
  window, taller, always starting just under the title. On the left the
  section label *Board*, the board options, Custom, a divider and *Insert
  Board Code*; on the right what the selection needs: for a preset the
  no-guess switch under *Board settings* and the board's three bests —
  time, 3BV/s and efficiency, each with its date, a dash and "no best yet"
  when there is none — titled with the board and the switch's setting; for
  Custom the no-guess switch (with its hint or the reason it is
  unavailable), the size form with its info line, *Random* and the refusal
  line, then the bests for that size; for *Insert Board Code* only the code
  field and its one-line feedback. The foot is a bottom bar: the selected
  board summarised on the left — *<board> · <size> · <mines> mines*, with
  *· no-guess* when the switch is on and *Custom* as a custom board's name;
  *Board code · <the code's board>*, or *Board code · paste a code to play*
  while there is none; *Learn 3D · guided <size> box · no timer* —,
  *Records* (opening the Records screen on
  the selected board and switch) and *Play* with its key hint on the right,
  *Play* disabled while there is nothing valid to play. The window's option
  rows grow denser on the smaller desktop windows so the window fits them.
  On a phone: one column, full-bleed, no game title and no bests, with
  *Records* and *Play* pinned at the bottom.
  - **3D** — the options open with Learn 3D, outlined in its own accent,
    then the cube presets in one group (**3D presets** below); while Learn
    3D is selected the right side shows only how 3D works and that the
    lesson keeps no records.
- **3D presets** — the 3D board choice offers four presets in one group
  with no group label, named as results and Records name them: Cube Intro
  (6 × 6 × 6, 10 mines), Cube Beginner (6 × 6 × 6, 20), Cube Intermediate
  (8 × 8 × 8, 40) and Cube Expert (10 × 10 × 10, 100). The First box
  presets (4 × 4 × 3 with 4 mines, 5 × 5 × 3 with 6) are dropped: their
  records and replays stay in the history as custom boards, by
  `3d-play-flow`'s rule for dropped presets, and the start spacing only they
  had goes, every 3D board starting at the camera's ordinary spacing. A
  Learn 3D win offers *Play Cube Intro* in their place, with a line saying
  Cube Intro is a real board with a timer and records.
- **Daily screen** — the board choice composition: the title above a window
  sized to its content; on the left today's date, the intro line and one
  entry per mode in menu order (`game-shell`), Classic 2D and 3D with their
  state chip beside the name — a won row's time in the game's standard
  time format, to the thousandth of a second (*Won 48.213 s*), as the
  results, Records and leaderboard screens show it — and their board line,
  the others *Coming soon*; on the right the selected mode's board preview
  (the closed Expert board with its marked start cell, the cube for 3D),
  its state with the days in a row, and its code chip with Copy and Copy
  link, a coming-soon mode showing its colour badge; the bottom bar with
  the summary, *Watch replay* and *Play*. On a phone: one column, no title,
  no border and no preview, the code shown instead.
- **Results screen** — one column sized to its content, over the game it
  ended, in the order and with the content `results-screen` gives, and the
  3D changes `3d-results-records-screens` gives. On a phone the figure
  tiles go two by two, the code chip stacks, *Play again* runs full width,
  then *Watch replay* and *Records* side by side, then *Main menu*; the card
  scrolls.
- **Records screen** — the content `records-screen` gives, its tabs Recent
  games, Top 10, Replays and Leaderboards, the last showing its coming-soon
  panel with no pager.
- **Settings page** — the content `settings` gives; on a phone the bindings
  device choice spans the full width, each option's label wrapping inside
  it.
- **Pause card, replay viewer, generating and failed-board cards, the 3D
  ready card and its lock states, the Learn 3D prompts and end cards, the
  placeholder screen (*Coming soon*), the confirmations, the toasts, the
  fatal card, the no-JavaScript notice and the 404 page** — each in the
  frame or card the canvas draws for it, with the content its owning
  feature defines.
- **The 3D scene in a panel** — the 3D renderer draws into the scene panel's
  rectangle when a screen has one (the menu's 3D preview, the Daily
  screen's cube), and full-window in a 3D game and the 3D replay viewer as
  today.
- The shared layout at every window size the game supports, from the
  phone sizes to the largest desktop window the canvas draws.

Non-goals:

- The in-game screen of either mode — `in-game-layout`.
- What a screen does: entries and routing, pause and restart rules, results
  contents, records rules, settings behaviour — their owning features
  (`game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`, `3d-play-flow`,
  `classic-2d-square-play`). This feature arranges and styles them; it adds
  only the board choice screens' bests, a view over the records store, and
  changes only the 3D presets (**3D presets**).
- The Hexagon, Triangle and Surface modes and their screens — deferred to
  `m6-launch`; until then their entries open the placeholder screen. The
  Campaign and demo entries — each arrives with its milestone.
- Text the artboards carry as placeholder (sample figures, the build
  label's version) — the screens show the game's real content, and copy
  follows the owning features' wording where they state it.
- Theme styling beyond *Joyful tiles* — later themes style these components
  through the theme skill.
- The m3-on-steam screens and controls drawn in this layout — the
  leaderboards in Records' Leaderboards tab and Quit's action
  (`leaderboards-menu-entry`), the leaderboard screen in the screen frame
  (`leaderboard-screen`), the rank panel in the results screen
  (`results-steam-rank`), and the rebinding controls on the Settings page
  with every key hint and the in-game controls reminder reading the current
  bindings (`input-rebinding`) — each defined by its own feature.

## Architecture

Built within the recorded technical direction — plain DOM, static markup
toggled by class, no framework (see
[technical-direction.md](../technical-direction.md)); the current shell and
kit are described in [app-shell.md](../../context/app-shell.md) and
[app-shell-kit.md](../../context/app-shell-kit.md).

- **Kit additions.** Each new component is a documented markup pattern in
  the kit catalogue, with structure in the base stylesheet and every visual
  value in the theme stylesheet (`theme-system`). A screen uses components
  by their catalogued names only; it carries no styling of its own beyond
  placement.
- **Screen frame.** Every non-game screen's outer composition: the frame
  sits on the backdrop at a size bounded by the window — sized to its
  content where the screen says so — its head holding the screen's Back
  (with its key hint), its title and an optional action; its body scrolls
  when the content is taller than the window, head and foot staying in
  view.
- **Screen compositions.** The menu, board choice, Daily, pause, results,
  Records, Settings, replay viewer, cards, confirmations and messages
  rebuilt inside the frame from kit components, keeping every element id,
  route, default focus and controller navigation target their owners and
  tests rely on, or moving them with their owners in the same change.
- **Board choice bests.** The board choice screens read the records store
  through its existing read interface and its change notification; they
  hold no records of their own.
- **Scene panel.** The 3D renderer gains a target rectangle: the shell
  hands it the panel's rectangle while a screen with a scene panel shows —
  measured again on every screen change, window resize and change of the
  panel's own box, which a `ResizeObserver` reports —, and the full window
  otherwise; it draws only there, with the panel's own
  frame and corners drawn by the theme stylesheet over it. The Classic 2D
  preview is the Classic 2D board view drawing a board in the panel; the
  preview shown follows the menu's selection.
- **Mode entry list.** The menu's entries are an open-ended column: a mode
  joins it by adding one mode entry, with no change to the menu's
  composition, and the entries share the column's height.
- **Design status per screen.** The canvas's *Joyful tiles* page is the
  finished design: J-Tokens (every token) and J-Components (every kit
  component in every state) are the source of the theme's tokens and kit
  styles; J-BoardSheet and J-3DSheet are the boards'; and every screen is
  drawn at each supported window size (`J-<Screen>-xl`, `-l`, `-m`, `-p`,
  and `-ls` where a phone in landscape applies) with its states
  (`J-<Screen>-states`), the menu's previews on J-Menu-extra. A screen is
  built from its artboards, read as data from the canvas
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC; boards on its other
  pages are history, not design.

## Data and state

- No new persisted state. The board choice bests are a view over
  `personal-records` and `3d-game-records`; the last board choices and the
  last mode played stay with their owners.
- Component state (focus, selection, the open Custom fields) is DOM state of
  the hosting screen, as today.

## Interfaces and contracts

- **Kit catalogue additions** — the new components' names, parts and slots
  join the contract `theme-system` enforces: `ui-backdrop`; `ui-frame`
  (parts `head`, `back`, `title`, `action`, `body`, `foot`, `status`,
  `summary`; slot `window-chrome`); `ui-mode-entry` (`entry`, `icon`,
  `label`, `reason`, `last`, `lock`); `ui-option` (`option`, `badge`,
  `name`, `last`, `meta`, `size`, `density`, `check`; variant
  `ui-option--learn`); `ui-section-label` (`text`, `aside`);
  `ui-key-hint` (`key`, `label`; variant `ui-key-hint--pad`); `ui-chip`
  (variants `--won`, `--lost`, `--muted`, `--best`); `ui-list-row`
  (`date`, `board`, `figure`, `outcome`); `ui-scene-panel` (`stage`,
  `tag`, `card`, `badge`, `name`, `note`; variant `ui-scene-panel--live`);
  `ui-stat--tile` (with its `badge`); `ui-wordmark` (`word`);
  `ui-button--danger`; `ui-divider`; `ui-tabs` (`tab`); `ui-checkbox`;
  `ui-table`; `ui-toast` (`icon`, `text`); a message `ui-card`'s `icon`;
  and the compositions `ui-mode-list`, `ui-options`, `ui-key-hints` and
  `ui-list`.
- **Accessibility and controller parity** — every control has an accessible
  name, focus is always visible as `screen-components` § Interfaces and
  contracts, **Accessibility**, states it, every action is reachable by
  keyboard and controller, and the key hints follow the active input device
  from the bindings source, as every help surface does.
- **Stable hooks** — element ids, routes and default focus targets survive
  the recomposition, so the shell's navigation and the existing browser
  tests keep their footing.
- **Window sizes** — no screen scrolls horizontally at any supported window
  size; the frame's body scrolls vertically when needed. On a narrow or
  mobile window a screen may hide its non-vital parts, such as the in-game
  live figures panel, as its phone artboards show.

## Dependencies

- `theme-system` — the kit catalogue the components join, the base and
  theme stylesheets, and *Joyful tiles*.
- `screen-components` — the existing kit components and the kit's state
  model.
- `game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`, `3d-play-flow`,
  `classic-2d-square-play` — the screens' content and behaviour.
- `personal-records`, `3d-game-records` — the bests the board choice
  screens show.
- No new libraries.
