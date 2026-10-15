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
  - the **mode entry** — the main menu's large entry with icon and label,
    each mode with its own accent, and a locked state, greyed with a lock,
    for an entry not built yet;
  - the **board option** — a board preset with its name, size line, mine
    density and the Last played mark, selectable, with the selected state;
  - the **section label**, the **key hint** (a key or controller button
    shown beside an action), the **stat tile** (label, figure, detail line)
    and the **list row** of recent games;
  - the **scene panel** — a framed region of a screen a mode's own renderer
    draws into.
- **Main menu** — the title block with the game's name and no tagline or
  page subtitle; the mode entries in this order — Classic 2D and 3D; then
  the entries of
  [product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)
  not built yet, locked: Hexagon, Triangle, Surface and Leaderboards; then
  Daily, Records and Settings — and Quit, locked until it is built, as the
  final control after Settings, set apart from the list; a scene panel, as
  tall as the column allows, showing a live preview of the focused mode
  drawn by that mode's own renderer — the real cube for 3D, a real board for
  Classic 2D, and each later mode's real board (a hexagon board for
  Hexagon, and so on) once that mode is built; while a locked entry or an
  entry that is not a mode has focus, what the panel shows follows the
  *Joyful tiles* design; the menu opens on its default focus; the key hints for the active input device, the build label, and
  the existing Play again and last-played detail placed in the layout. The
  menu shows no bests and no credit line; the controls reference, the sound
  switch and the volume live on the Settings page only.
- **Board choice screens** — Classic 2D and 3D, one composition: the board
  options, the no-guess switch, Play on the right with its key hint beside
  a non-accent *Records* action that opens the Records screen on the
  selected board, and beside them the selected board's records panel, from
  the records store. Custom keeps its size fields, revealed when Custom is
  chosen. The records panel shows the selected board under the no-guess
  switch's setting, its title naming both ("INTERMEDIATE · YOUR BESTS",
  "INTERMEDIATE · NO-GUESS · YOUR BESTS"): the bests (time, 3BV/s,
  efficiency with when each was set), wins, win rate and streak; the chart
  of the times of its last 30 won games and under it a chart of 3BV/s and
  efficiency over the same 30 wins, as the Records screen's history chart
  draws them; the recent games and under them a Top 5 table of its fastest
  wins. Every part follows the switch. The panel carries no trend figure.
  - **3D** — the board options open with Learn 3D and show the presets in
    two groups, First box and Cube (`3d-play-flow`); the panel follows the
    no-guess switch that governs the selected board. How the groups are
    labelled, and what the panel shows while Learn 3D, which keeps no
    records, is selected, follow the 3D board choice's *Joyful tiles*
    artboard.
- **Pause card, results screen, Records screen, Settings page, replay
  viewer, generating and failed-board cards, the placeholder screen and the
  confirmations** — each inside the screen frame, with the content their
  owning features define.
- **Daily screen** — a won row shows its time in the game's standard time
  format, to the thousandth of a second (*Won 48.213 s*), as the results,
  Records and leaderboard screens show it.
- **The 3D scene in a panel** — the 3D renderer draws into the scene panel's
  rectangle when a screen has one (the menu's 3D preview), and full-window
  in a 3D game and the 3D replay viewer as today.
- The shared layout at every window size the game supports, down to the
  1024 px-wide window the Classic 2D board is measured against.

Non-goals:

- The in-game screen of either mode — `in-game-layout`.
- What a screen does: entries and routing, pause and restart rules, results
  contents, records rules, settings behaviour — their owning features
  (`game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`). This feature arranges
  and styles them; it adds only the board choice screens' records panel, a
  view over the records store.
- What the locked entries open, and the Campaign and demo entries the
  artboards draw — each arrives with its milestone; Leaderboards and Quit
  unlock with `leaderboards-menu-entry`.
- Text the artboards carry as placeholder (the number of 3D presets, the
  build label's version) — the screens show the game's real content.
- Theme styling beyond *Joyful tiles* — later themes style these components
  through the theme skill.
- Hexagon, Triangle and Surface screens — deferred to `m6-launch`.
- The m3-on-steam screens and entries drawn in this layout — the
  leaderboard screen in the screen frame (`leaderboard-screen`), the
  Leaderboards and Quit mode entries (`leaderboards-menu-entry`), the rank
  panel in the framed results screen (`results-steam-rank`), and the
  rebinding controls on the framed Settings page with every key hint and
  the in-game controls reminder reading the current bindings
  (`input-rebinding`) — each defined by its own feature.

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
  sits centred on the backdrop at a size bounded by the window, its head
  holding the screen's Back (with its key hint), its title and an optional
  action; its body scrolls when the content is taller than the window,
  head and foot staying in view.
- **Screen compositions.** The menu, board choice, pause, results, Records,
  Settings, replay viewer, cards and confirmations rebuilt inside the frame
  from kit components, keeping every element id, route, default focus and
  controller navigation target their owners and tests rely on, or moving
  them with their owners in the same change.
- **Records views.** The board choice screens' records panel reads the
  records store through its existing read interface and its change
  notification; it holds no records of its own. Its charts reuse the
  Records screen's chart component.
- **Scene panel.** The 3D renderer gains a target rectangle: the shell
  hands it the panel's rectangle while a screen with a scene panel shows,
  and the full window otherwise; it draws only there, with the panel's own
  frame and corners drawn by the theme stylesheet over it. The Classic 2D
  preview is the Classic 2D board view drawing a board in the panel; the
  preview shown follows menu focus.
- **Mode entry list.** The menu's entries are an open-ended column: a mode
  joins it by adding one mode entry, with no change to the menu's
  composition. When the entries are taller than their column, the column
  scrolls on its own, keeping the scene panel and the key hints in place. A
  locked entry unlocks in its place when what it opens is built, with no change to the menu's
  composition.
- **Design status per screen.** The finished *Joyful tiles* artboards cover
  the main menu and the Classic 2D board choice (and the Classic 2D game,
  `in-game-layout`). Every other screen — the 3D board choice included — is
  built from its own artboard, which the owner supplies: a task for such a
  screen says that its artboard is not drawn yet and is `claude+human`,
  with supplying the artboard as its manual intervention.

## Data and state

- No new persisted state. The records panel is a view over
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
  frame's body scrolls vertically when needed. On a narrow or mobile window
  a screen may hide its non-vital parts, such as the in-game live figures
  panel.

## Dependencies

- `theme-system` — the kit catalogue the components join, the base and
  theme stylesheets, and *Joyful tiles*.
- `screen-components` — the existing kit components the screens keep using.
- `game-shell`, `settings`, `results-screen`, `records-screen`,
  `replay-playback`, `3d-results-records-screens`, `3d-play-flow`,
  `classic-2d-square-play` — the screens' content and behaviour.
- `personal-records`, `3d-game-records` — the bests, streaks, recent games
  and top games the records panel shows.
- No new libraries.

## Open questions

- Artboards for the 3D board choice, pause card, results screen, Records
  screen, Settings page, replay viewer and the cards are not drawn yet; the
  owner is designing them on the Claude Design canvas, with a components
  artboard. Their tasks wait on them as **Design status per screen** says.
