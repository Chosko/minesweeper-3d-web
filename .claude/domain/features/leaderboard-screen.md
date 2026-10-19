# Leaderboard screen

The screen where the player browses Steam leaderboards: pick Classic 2D or
3D, a standard board and the no-guess setting, then read the global,
friends or around-me ranking — rank, player, time, 3BV/s and efficiency —
and watch the replay attached to any entry. In the web build it shows the
player's own local ranking.

## Purpose

[product-design.md § User experience and key flows](../product-design.md#user-experience-and-key-flows)
gives the Records screen a Leaderboards tab with Steam global and friends
rankings and the replay attached to each entry, and
[§ Replays](../product-design.md#replays) lets the player watch a
leaderboard replay, their own or someone else's. The m3-on-steam exit
criteria require global, friends and around-me views of the free-play
leaderboards. `steam-leaderboards` provides the data and the replays; this
feature is the screen that shows them.

## Scope and non-goals

In scope (m3-on-steam):

- The leaderboard screen as a game-shell screen inside the screen frame of
  `shared-screen-layout`: board picker, scope tabs, entry list, own entry,
  and *Watch replay* per entry.
- Paging through the global ranking.
- Loading, empty, offline and Steam-unavailable states, and the web build's
  local-only state.
- Mouse, keyboard and controller operation, per the shell's navigation.

Non-goals:

- The way in from the Records screen's Leaderboards tab —
  `leaderboards-menu-entry`, whose open question decides whether the tab
  shows this screen's rankings in place or opens this screen.
- Ranks on the results screen — the Results and records slice of
  m3-on-steam.
- Campaign, daily, hexagonal, triangle and Surface leaderboards — deferred
  with their content; the board picker gains choices then.
- Player avatars, profiles, and opening a player's Steam profile — in no
  milestone's slice.
- Searching for a player or jumping to an arbitrary rank — in no
  milestone's slice; Around me covers finding one's own place.

## Architecture

Built within the recorded technical direction — plain DOM in the game
shell, no framework (see [technical-direction.md](../technical-direction.md)),
composed inside `shared-screen-layout`'s screen frame and routed by
`game-shell`'s screen router.

- **Composition.** The frame's head holds Back with its key hint and the
  screen's title; its body holds the board picker, a section label over the
  scope tabs, the own standing, the entry list and the states; its foot is
  the status line. The screen is built from catalogued kit components only,
  as [shared-screen-layout.md](./shared-screen-layout.md) § Architecture,
  **Kit additions**, requires — board options, switches, section label,
  tabs, stat tiles, list rows, buttons, key hints, empty and error states —
  and adds no component and no theme style of its own; the active theme
  styles it.
- **Board picker.** A 2D | 3D switch, the standard boards of the chosen
  mode (Beginner, Intermediate, Expert in Classic 2D; the three cube
  presets, Beginner, Intermediate and Expert, in 3D), each a board option,
  and a no-guess on/off switch. Only boards in
  `steam-leaderboards`' catalogue are offered. It opens on the board passed
  by the route, or else on the board last viewed here this session, or else
  Classic 2D Expert with no-guess off.
- **Scope tabs.** Global, Friends and Around me; Global is the default.
  Key hints beside the tabs show the inputs that switch scope.
- **Entry list.** One list row per entry: rank, player name, time to the
  thousandth of a second in `results-screen`'s time format (47.380 s), 3BV/s and
  efficiency derived from the entry's
  details by `game-summary`'s rules, and *Watch replay*, disabled when the
  entry has no replay. The player's own row is highlighted in every scope.
  Global loads one page at a time with *More* at the end; Friends shows the
  whole friends list; Around me shows a range either side of the player.
- **Own standing.** Above the list, stat tiles for the player's own time,
  in the same format as the rows, and global and friends rank on the chosen
  board, or "no time yet".
- **Watch replay.** Asks `steam-leaderboards` for the entry's replay and,
  on success, routes to `replay-playback`'s viewer with Back returning here
  on the same board, scope and position. A replay that fails is reported on
  the row with its reason; the list stays usable.
- **States.** Loading; empty ("no entries yet"); offline (Steam is running
  but not connected — with a retry); Steam unavailable (Steam did not
  start); and, in the web build, a "local only" label in the frame's foot
  over the player's own ranking, with the Friends and Around me tabs hidden.

## Data and state

- **Screen state** — chosen mode, board, no-guess, scope, loaded entries
  and page position, and the board last viewed this session. In memory
  only; nothing is persisted.
- **Source of truth** — Steam's leaderboards, through `steam-leaderboards`;
  entries are fetched each time a board or scope is chosen and not cached
  across visits.

## Interfaces and contracts

- **Open** — the shell routes to the screen with an optional board identity
  and returns to the caller on Back. The Records screen's Leaderboards tab
  reaches it as `leaderboards-menu-entry` settles; the results screen's *Leaderboard* action
  (`results-steam-rank`) opens it on the finished game's board.
- **Reads** — `steam-leaderboards`' entries, own standing, replay fetch and
  availability.
- **Navigation** — every control reachable by keyboard and controller;
  shoulder buttons switch scope; Esc and the controller's back button mean
  Back.
- **Failure** — a failed fetch shows the offline or unavailable state with a
  retry and never leaves the screen unusable; Back always works.

## Dependencies

- `steam-leaderboards` — catalogue, entries, own standing, replays,
  availability.
- `replay-playback` — the viewer an entry's replay opens in.
- `game-summary` and `3d-game-records` — board labels and the 3BV/s and
  efficiency derivations.
- `results-screen` — the time format.
- `shared-screen-layout` — the screen frame, board option, section label,
  stat tile, list row and key hint the screen is composed from.
- `theme-system` — the kit catalogue those components are named in, and
  their styling by the active theme.
- `screen-components` — tabs, switches, buttons, empty and error states.
- `game-shell` — routing, Back and controller navigation.
- No external libraries.

## Open questions

- The global page size and the Around me range. Set with the screen's
  layout at real list heights; blocks only the constants.
- The screen's *Joyful tiles* artboard is not drawn yet: the canvas draws
  only the Records tab's coming-soon panel. Its task waits on it as
  [shared-screen-layout.md](./shared-screen-layout.md) § Architecture,
  **Design status per screen**, says.
