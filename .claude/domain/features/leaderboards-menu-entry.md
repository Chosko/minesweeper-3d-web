# Leaderboards tab and Quit

The m3-on-steam leaderboards in Records and the way out of the game: the
Records screen's Leaderboards tab, in both builds, which shows the rankings
of the board Records shows; and, in the desktop build, the title bar's
Quit, which closes the game with its saves flushed from any screen.

## Purpose

[product-design.md § User experience and key flows](../product-design.md#user-experience-and-key-flows)
puts the leaderboards in a tab of the Records screen, beside the player's
own figures, and puts Quit in the title bar of the game's own window. The m3-on-steam
milestone brings the leaderboards and the first desktop build, so the
Records screen's Leaderboards tab needs `leaderboard-screen`'s rankings and, now that the
game draws its own window with no system frame, the title bar's Quit is
the way out. The Leaderboards tab, with its coming-soon panel, and the
title bar's Quit button exist in the shared layout (`records-screen`,
`shared-screen-layout`); this feature makes both work.
The rankings are `leaderboard-screen`'s and the closing sequence is
`steam-desktop-host`'s.

## Scope and non-goals

In scope (m3-on-steam):

- The Records screen's Leaderboards tab, in the desktop and the web build
  alike, showing the rankings of the board Records shows in place of its
  coming-soon panel, inside Records, with no link out to the leaderboard
  screen.
- Quit in the title bar of every desktop window, working only when the
  game runs inside the desktop host and closing the game from any screen.
  While a game is in progress it first asks the existing leave-game
  confirmation; otherwise it closes the game at once. It asks the host to
  quit and the host runs its closing sequence. Its look and place are the
  canvas's: https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC,
  J-Components title-bar Quit.
- Both in the focus order and controller navigation of their screens.

Non-goals:

- The leaderboard screen and its rankings — the scope tabs, own standing,
  entry list, states and replays are `leaderboard-screen`'s; this feature
  places the rankings in the tab.
- The closing sequence itself — flushing saves, shutting Steam down and
  exiting are `steam-desktop-host`'s.
- Leaderboard ranks on the results screen, and a route from the results
  screen to the leaderboard screen — the Results and records slice of
  m3-on-steam.
- Hiding or disabling the Leaderboards tab when Steam is unavailable or
  offline — the tab is always shown and the leaderboards report those
  states.
- A working Quit in the web build — a web page cannot close its own tab;
  there Quit presses like any button and does nothing, with no lock, no
  *Desktop build only* and no message, and phones do not show it
  (`shared-screen-layout`).
- A confirmation of its own — Quit reuses the leave-game confirmation, and
  only while a game is in progress.
- Start / Continue and Campaign — deferred to `m4-campaigns`; the demo's
  entries — deferred to `m5-core-complete`.

## Architecture

Built within the recorded technical direction — plain DOM in the game shell
over ES modules, no framework (see
[technical-direction.md](../technical-direction.md)). It extends the
Records screen and the title bar `shared-screen-layout` composes and
`game-shell`'s screen router, and adds no component and no theme style of
its own.

- **Leaderboards tab.** The fourth tab of the Records screen
  (`records-screen` § Scope and non-goals), after Recent games, Top 10 and
  Replays. This feature replaces its coming-soon panel with
  `leaderboard-screen`'s rankings (§ Architecture, **Rankings**) for the
  board Records shows, following Records' board and no-guess choice; the
  tab adds no board picker and opens no other screen. A board with no
  leaderboard, such as a custom board, shows that it has none. Back from a
  replay watched from the tab returns to Records on this tab.
- **Quit.** The title bar's Quit button on every desktop window
  ([shared-screen-layout.md](./shared-screen-layout.md) § Scope and
  non-goals, the screen frame). It acts when the platform layer's
  capability flags report the desktop host — whether or not Steam itself
  started — and does nothing otherwise. Pressed while a game is in
  progress, it opens the leave-game confirmation (`game-shell`), and
  confirming quits; with no game in progress it quits at once. Quitting
  sends the host's quit request over the page bridge and disables the
  button until the window closes.

## Data and state

- **Quit availability** — derived from the capability flags. Nothing is
  persisted.
- **A game in progress** — the shell's own state, read when Quit is
  pressed to choose between the confirmation and quitting at once.
- **Quitting** — a flag held while the quit request is in flight, so a
  second activation sends nothing. In memory only.
- **Source of truth** — the capability flags, published by
  `steam-desktop-host`'s platform selection; Quit never tests for Electron
  or the bridge directly.

## Interfaces and contracts

- **Show rankings** — the Leaderboards tab composes `leaderboard-screen`'s
  Rankings for the board Records shows; it never routes to the leaderboard
  screen.
- **Quit** — the page bridge's quit request. The host answers it with the
  same sequence a window close runs: it asks the page to flush pending
  saves, waits bounded by its timeout, shuts Steam down and exits. The page
  sends nothing else and does no flushing of its own on Quit.
- **Navigation** — the tab and Quit are reachable by mouse, keyboard and
  controller in their screens' order. Esc and the controller's back button
  on the main menu have no screen to go back to and never quit.
- **Confirmation** — a game in progress counts as left, by `game-shell`'s
  leave rule, only once the confirmation is accepted; then the quit
  request is sent.
- **Failure** — a quit request that rejects re-enables Quit and leaves the
  screen usable; closing the window still quits. Leaderboards that cannot
  reach Steam report it where they show, never in the menu.

## Dependencies

- `records-screen` — the Records screen and its Leaderboards tab.
- `game-shell` — the screen router and its back stack, navigation, the
  game in progress and the leave-game confirmation.
- `leaderboard-screen` — the rankings the tab shows.
- `steam-desktop-host` — the desktop-host capability flag and the page
  bridge's quit request, run through its closing sequence.
- `shared-screen-layout` — the title bar and its Quit button, and the
  Records screen's tabs.
- `theme-system` — the kit catalogue Quit and the tabs are named in,
  and their styling by the active theme.
- No external libraries.

## Open questions

None.
