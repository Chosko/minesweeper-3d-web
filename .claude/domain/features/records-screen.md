# Records screen

The Records screen reached from the main menu: for each board the player has
played, its three personal bests, win rate and streaks, and the stats
history — 3BV/s and efficiency over time and the recent games.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
puts personal bests per board and stats history behind the results screen,
on a Records screen the main menu leads to. It is where the enthusiast sees
progress over many games rather than one. This feature is that screen's
behaviour and content, read from `personal-records`.

## Scope and non-goals

In scope (m1-classic-2d):

- A board picker: Beginner, Intermediate and Expert, each with and without
  no-guess, then every custom board played, labelled by its size and mine
  count.
- For the chosen board: the three bests with their dates, games played,
  wins, win rate, current and longest streak.
- The Classic 2D overall figures: games, wins, win rate, current and
  longest streak.
- Stats history for the chosen board: 3BV/s and efficiency of won games
  over time as a chart, and a list of recent games with their outcome,
  time, 3BV/s and efficiency.
- An empty state for a board with no games, and a notice when records are
  not being saved this session.
- Mouse, keyboard and controller operation, per the shell's navigation.

Non-goals:

- The replay library and watching replays — deferred to `m2-3d-joins`.
- 3D boards and a 2D/3D switch — deferred to `m2-3d-joins`.
- Steam leaderboards — the Leaderboards entry, deferred to `m3-on-steam`.
- Resetting or deleting records.
- Filtering history by date range or exporting it.

## Architecture

Built within the recorded technical direction — plain DOM in the game shell,
no framework and no external chart library (see
[technical-direction.md](../technical-direction.md)), composed from the
`screen-components` kit.

- **Records view.** The board picker, the figures panel and the history
  area, from `screen-components`' segmented choice, cards and stat
  readouts. Opens on the board it was asked for, otherwise on the last
  board played. The fastest-time best is shown in `results-screen`'s time
  format (47.3 s).
- **History chart.** A small line chart of 3BV/s and efficiency per won
  game, drawn on a canvas from design tokens in both themes, redrawn on
  theme change. It follows the kit's conventions and is owned here; it is
  read as a picture, with the figures panel and the games list carrying the
  same numbers in text for accessibility.
- **Recent games list.** The newest games first, paged so a long history
  stays responsive. Each game's time is shown to the tenth of a second in
  `results-screen`'s time format (47.3 s).
- **Live update.** Subscribes to `personal-records`' change notification
  while open.

## Data and state

- No persisted state. The chosen board is screen state; all figures are
  read from `personal-records` on show and on change.

## Interfaces and contracts

- **Open** — from the game shell, optionally with a board key to open on.
- **Back** — returns through the shell's back stack to the menu or the
  results screen it came from.
- **Navigation** — every control reachable by keyboard and controller; the
  board picker takes default focus.
- **Failure** — with no readable records the screen shows the empty state;
  it never blocks Back.

## Dependencies

- `personal-records` — boards played, bests, counters, history, change
  notification and availability.
- `game-summary` — board labels and derived stats.
- `results-screen` — the time format.
- `screen-components` — every control and surface.
- `design-tokens-and-themes` — the chart's colours and theme-change
  notification.
- `game-shell` — routing from the menu and the results screen, navigation.
- No external libraries.
