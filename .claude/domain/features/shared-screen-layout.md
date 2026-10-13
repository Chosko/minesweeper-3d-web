# Shared screen layout

The redesigned arrangement every screen of the game shares, designed with
*Joyful tiles*: the page backdrop, the framed window each screen sits in, the
main menu, the board choice screens, and the pause, results, Records,
Settings and replay screens — the same layout under every theme, each theme
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
  by *Joyful tiles*:
  - the **page backdrop** behind every screen (a dotted paper in *Joyful
    tiles*, a gradient or a flat desktop colour in other themes);
  - the **screen frame** — a window with a head (back action left, title
    centre, screen action right), a body and a foot (a status line), and a
    decoration slot for window chrome such as a title bar's decorative
    buttons;
  - the **mode entry** — the main menu's large entry with icon, label and
    detail line, each mode with its own accent;
  - the **board option** — a board preset with its name, size line and best
    time, selectable, with the selected state;
  - the **section label**, the **key hint** (a key or controller button
    shown beside an action), the **stat tile** (label, figure, detail line)
    and the **list row** of recent games;
  - the **scene panel** — a framed region of a screen the 3D scene draws
    into.
- **Main menu** — the title block, the mode entries (Classic 2D, 3D,
  Records, Settings, in that order), a scene panel with the orbiting 3D demo
  board, a column of the player's headline bests and streak, the key hints
  for the active input device, the build label, and the existing Play again
  and last-played detail placed in the layout.
- **Board choice screens** — Classic 2D and 3D: the board options with each
  board's best time, the no-guess switch, the Play action with its key
  hint, and beside them the chosen board's bests (time, 3BV/s, efficiency
  with when each was set), its wins, win rate and streak, its recent games
  and a chart of its last 30 times, from the records store. Custom keeps
  its size fields, revealed when Custom is chosen.
- **Pause card, results screen, Records screen, Settings page, replay
  viewer, generating and failed-board cards, the placeholder screen and the
  confirmations** — each inside the screen frame, with the content their
  owning features define.
- **The 3D scene in a panel** — the 3D renderer draws into the scene panel's
  rectangle when a screen has one (the menu's demo board), and full-window
  in a 3D game and the 3D replay viewer as today.
- The shared layout at every window size the game supports, down to the
  1024 px-wide window the Classic 2D board is measured against.

Non-goals:

- The in-game screen of either mode — `in-game-layout`.
- What a screen does: entries and routing, pause and restart rules, results
  contents, records rules, settings behaviour — their owning features
  (`game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`). This feature arranges
  and styles them; it adds only the board choice screens' records panel and
  the menu's bests column, which are views over the records store.
- Menu entries the artboards draw but no milestone has built — Campaign,
  Daily, Hexagon, Triangle, Surface, Leaderboards, Quit and the demo's
  entries arrive with their milestones as ordinary mode entries.
- Text the artboards carry as placeholder (the number of 3D presets, the
  build label's version) — the screens show the game's real content.
- Theme styling beyond *Joyful tiles* — later themes style these components
  through the theme skill.
- Hexagon, Triangle and Surface screens — deferred to `m6-launch`.
- Amending the `[PLANNED]` m3-on-steam features this layout makes stale.
  Each describes its screen in the m1 layout and is amended to this layout
  and `in-game-layout` before m3-on-steam resumes:
  - `leaderboard-screen` — composed from the m1 kit; it moves into the
    screen frame with the board option, section label and list row;
  - `leaderboards-menu-entry` — Leaderboards and Quit are ordinary m1 menu
    list entries; they become mode entries with icon, detail line and
    accent;
  - `results-steam-rank` — its rank panel sits in the m1 results view; it
    moves into the framed results screen;
  - `input-rebinding` — its controls replace the m1 Settings page's
    bindings list, and the help it keeps current is the m1 overlay's; it
    moves into the framed Settings page and keeps every key hint and the
    in-game controls reminder current.

## Architecture

Built within the recorded technical direction — plain DOM, static markup
toggled by class, no framework (see
[technical-direction.md](../technical-direction.md)); the current shell and
kit are described in [app-shell.md](../../context/app-shell.md).

- **Kit additions.** Each new component is a documented markup pattern in
  the kit catalogue, with structure in the base stylesheet and every visual
  value in the theme stylesheet (`theme-system`). A screen uses components
  by their catalogued names only; it carries no styling of its own beyond
  placement.
- **Screen frame.** Every non-game screen's outer composition: the frame
  sits centred on the backdrop at a size bounded by the window, its head
  holding the screen's Back (with its key hint), its title and an optional
  action; its body scrolls when the content is taller than the window,
  head and foot staying in view.
- **Screen compositions.** The menu, board choice, pause, results, Records,
  Settings, replay viewer, cards and confirmations rebuilt inside the frame
  from kit components, keeping every element id, route, default focus and
  controller navigation target their owners and tests rely on, or moving
  them with their owners in the same change.
- **Records views.** The board choice screens' records panel and the
  menu's bests column read the records store through its existing read
  interface and its change notification; they hold no records of their own.
  The chart reuses the Records screen's chart component.
- **Scene panel.** The 3D renderer gains a target rectangle: the shell
  hands it the panel's rectangle while a screen with a scene panel shows,
  and the full window otherwise; it draws only there, with the panel's own
  frame and corners drawn by the theme stylesheet over it.
- **Mode entry list.** The menu's entries are an open-ended column: a mode
  joins it by adding one mode entry, with no change to the menu's
  composition. When the entries are taller than their column, the column
  scrolls on its own, keeping the scene panel, the bests column and the
  key hints in place, so the m4–m6 entries (Hexagon, Triangle and Surface
  among them) fit without a redesign.
- **Design status per screen.** The finished *Joyful tiles* artboards cover
  the main menu and the Classic 2D board choice (and the Classic 2D game,
  `in-game-layout`). Every other screen — the 3D board choice included — is
  built from its own artboard, which the owner supplies: a task for such a
  screen says that its artboard is not drawn yet and is `claude+human`,
  with supplying the artboard as its manual intervention.

## Data and state

- No new persisted state. The records panel and bests column are views over
  `personal-records` and `3d-game-records`; the last board choices and the
  last mode played stay with their owners.
- Component state (focus, selection, the open Custom fields) is DOM state of
  the hosting screen, as today.

## Interfaces and contracts

- **Kit catalogue additions** — the new components' names, parts and slots
  join the contract `theme-system` enforces.
- **Accessibility and controller parity** — every control has an accessible
  name, focus is always visible, every action is reachable by keyboard and
  controller, and the key hints follow the active input device from the
  bindings source, as every help surface does.
- **Stable hooks** — element ids, routes and default focus targets survive
  the recomposition, so the shell's navigation and the existing browser
  tests keep their footing.
- **Window sizes** — no screen scrolls horizontally at 1024 px wide; the
  frame's body scrolls vertically when needed.

## Dependencies

- `theme-system` — the kit catalogue the components join, the base and
  theme stylesheets, and *Joyful tiles*.
- `screen-components` — the existing kit components the screens keep using.
- `game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`, `3d-play-flow`,
  `classic-2d-square-play` — the screens' content and behaviour.
- `personal-records`, `3d-game-records` — the bests, streaks and recent
  games the records panel and the menu column show.
- No new libraries.

## Open questions

- Artboards for the 3D board choice, pause card, results screen, Records
  screen, Settings page, replay viewer and the cards are not drawn yet; the
  owner is designing them on the Claude Design canvas, with a components
  artboard. Their tasks wait on them as **Design status per screen** says.
- The menu artboard's bests column shows two Classic 2D bests, one 3D best
  and the win streak. Which boards it shows for a player with bests on
  several boards is decided here as: the last board played in each mode,
  plus the current streak; revisit when the menu's artboard is final.
