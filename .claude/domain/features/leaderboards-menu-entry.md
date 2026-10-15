# Leaderboards menu entry

The m3-on-steam additions to the main menu: the Leaderboards entry, unlocked
in both builds, that opens the leaderboard screen; and, in the desktop build,
the Quit control, unlocked, that closes the game with its saves flushed.

## Purpose

[product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)
lists Leaderboards and Quit among the main menu's entries. The m3-on-steam
milestone brings the leaderboards and the first desktop build, so the menu
needs a way into `leaderboard-screen` and, now that the game runs fullscreen
in a window of its own, a way out that does not depend on the window's
frame. This feature adds both entries to the main menu of the shared
layout (`shared-screen-layout`); the screen itself is
`leaderboard-screen`'s and the closing sequence is `steam-desktop-host`'s.

## Scope and non-goals

In scope (m3-on-steam):

- The Leaderboards entry, in the desktop and the web build alike. It routes to the leaderboard screen with no board, so
  the screen opens on its own default; Back returns to the main menu.
- The Quit control, working only when the game runs inside the desktop
  host. It asks the host to quit and the host runs its closing
  sequence.
- Both entries as mode entries of the redesigned main menu, each with its
  icon, label and accent, as the main menu's artboard draws them.
- Both entries in the menu's focus order and controller navigation.

Non-goals:

- The leaderboard screen — its board picker, rankings, states and replays
  are `leaderboard-screen`'s.
- The closing sequence itself — flushing saves, shutting Steam down and
  exiting are `steam-desktop-host`'s.
- Leaderboard ranks on the results screen, and a route from the results
  screen to the leaderboard screen — the Results and records slice of
  m3-on-steam.
- Hiding or disabling the Leaderboards entry when Steam is unavailable or
  offline — the entry is always shown and the screen reports those states.
- A Quit entry in the web build — a web page cannot close its own tab.
- A confirmation before quitting — Quit is reachable only from the main
  menu, where no game is in progress and nothing is left unsaved once the
  host's flush completes.
- Start / Continue and Campaign — deferred to `m4-campaigns`; Daily and the
  demo's entries — deferred to `m5-core-complete`; Surface — deferred to
  `m6-launch`.

## Architecture

Built within the recorded technical direction — plain DOM in the game shell
over ES modules, no framework (see
[technical-direction.md](../technical-direction.md)). It extends the main
menu `shared-screen-layout` composes and `game-shell`'s screen router, and
adds no component and no theme style of its own.

- **Menu entries.** Leaderboards and Quit unlock in the places the main
  menu gives their locked entries
  ([shared-screen-layout.md](./shared-screen-layout.md) § Scope and
  non-goals, **Main menu**). Each is one mode entry — icon, label and one of
  the accents the kit catalogue declares for the mode entry — unlocking in
  the open-ended column with no change to the menu's composition
  ([shared-screen-layout.md](./shared-screen-layout.md) § Architecture,
  **Mode entry list**); the active theme styles it, and the menu's default
  focus stays on its first entry.
- **Leaderboards route.** The entry routes through `game-shell`'s screen
  router to the leaderboard screen with no board identity, pushing the menu
  on the back stack. Back from the screen pops to the menu with focus on the
  Leaderboards entry.
- **Quit action.** The entry is unlocked when the platform layer's capability
  flags report the desktop host — whether or not Steam itself started — and
  stays locked otherwise. Choosing it sends the
  host's quit request over the page bridge and disables the entry until the
  window closes.

## Data and state

- **Menu composition** — which entries are unlocked, derived at menu build from the
  capability flags. Nothing is persisted.
- **Quitting** — a flag held while the quit request is in flight, so a
  second activation sends nothing. In memory only.
- **Source of truth** — the capability flags, published by
  `steam-desktop-host`'s platform selection; the entry never tests for
  Electron or the bridge directly.

## Interfaces and contracts

- **Open leaderboards** — the router's ordinary route to
  `leaderboard-screen`'s Open, with no board. Every other caller passing a
  board is out of this feature.
- **Quit** — the page bridge's quit request. The host answers it with the
  same sequence a window close runs: it asks the page to flush pending
  saves, waits bounded by its timeout, shuts Steam down and exits. The page
  sends nothing else and does no flushing of its own on Quit.
- **Navigation** — both entries are reachable by mouse, keyboard and
  controller in column order. Esc and the controller's back button on the main
  menu have no screen to go back to and never quit.
- **Failure** — a quit request that rejects re-enables the entry and leaves
  the menu usable; closing the window still quits. A leaderboard screen that
  cannot reach Steam reports it on the screen, never in the menu.

## Dependencies

- `game-shell` — the main menu, the screen router and its back stack, and
  menu navigation.
- `leaderboard-screen` — the screen the Leaderboards entry opens.
- `steam-desktop-host` — the desktop-host capability flag and the page
  bridge's quit request, run through its closing sequence.
- `shared-screen-layout` — the redesigned main menu and the mode entry both
  entries are drawn as.
- `theme-system` — the kit catalogue the mode entry and its accents are
  named in, and their styling by the active theme.
- No external libraries.
