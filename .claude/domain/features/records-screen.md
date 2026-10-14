# Records screen

The Records screen reached from the main menu: for each board the player has
played, its three personal bests, win rate and streaks, and the stats
history — 3BV/s and efficiency over time, the best time by date, averages,
a personal Top 10 and the recent games — with filters and an export.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
puts personal bests per board and stats history behind the results screen,
on a Records screen the main menu leads to. It is where the enthusiast sees
progress over many games rather than one. This feature is that screen's
behaviour and content, read from `personal-records`.

## Scope and non-goals

In scope (m1-classic-2d):

- A board picker: Beginner, Intermediate and Expert, each with and without
  no-guess, then the mode's Daily board ("Daily · Expert · no-guess"), then
  every custom board played, labelled by its size and mine count. The Daily
  board's figures show its days in a row (current and longest) in place of
  the win streak.
- For the chosen board: the three bests with their dates, games played,
  wins, win rate, current and longest streak, with the completed games'
  win rate beside the win rate and their best streak beside the longest
  streak, labelled for what they leave out ("Win rate, completed games",
  "Best streak, completed games").
- The Classic 2D overall figures: games, wins, win rate, current and
  longest streak, with the same two completed games' figures.
- Stats history for the chosen board: 3BV/s and efficiency of won games
  over time as a chart, the best time by date as a second chart, the mean
  time, 3BV/s and efficiency over the last 10, last 50 and all won games,
  the win rate over the last 50 games, and two tabs — a list of recent
  games with the date and time each ended, its outcome, time, 3BV, 3BV/s
  and efficiency, and a Top 10 of the board's best won games. Every row
  that names one game — the recent games, the Top 10 and the library
  view's rows — shows its board code with Copy and Copy link, none for a
  game from before codes; the Top 10 leaves challenges out, as the
  results screen's rank does.
- Filters by period and by outcome over the stats history.
- An export of the history of every board in both modes and the replay
  library's listing of kept replays, as a CSV and a JSON file.
- An empty state for a board with no games, and a notice when records are
  not being saved this session.
- Mouse, keyboard and controller operation, per the shell's navigation.

Non-goals:

- The replay library and watching replays — deferred to `m2-3d-joins`.
- 3D boards and a 2D/3D switch — deferred to `m2-3d-joins`.
- Steam leaderboards — the Leaderboards entry, deferred to `m3-on-steam`.
- Resetting or deleting records.
- Exporting or importing the replay files themselves.

## Architecture

Built within the recorded technical direction — plain DOM in the game shell,
no framework and no external chart library (see
[technical-direction.md](../technical-direction.md)), composed from the
`screen-components` kit.

- **Records view.** The board picker, the figures panel and the history
  area, from `screen-components`' segmented choice, cards, stat readouts
  and column composition. The three bests are stat tiles — the label, the
  figure large, and beneath it the date the best was set; under them the
  board's counters are one row and the mode's overall figures a row of
  their own. At about 1024 px wide and more the screen lays out in two
  columns: the picker, the bests, both rows of figures and the averages on
  one side, the period and outcome filters, both charts, the Recent games |
  Top 10 tabs and the replays on the other; narrower, one column in that
  order. Opens on the board it was asked for, otherwise on
  the last board played. The fastest-time best is shown in
  `results-screen`'s time format (47.380 s), and the efficiency best to one
  decimal (94.7%).
- **History chart.** A small line chart of 3BV/s and efficiency per won
  game, drawn on a canvas from the active theme's tokens, redrawn on
  theme change. It follows the kit's conventions and is owned here; it is
  read as a picture, with the figures panel and the games list carrying the
  same numbers in text for accessibility. Its horizontal axis is per game,
  since a dated axis would stack a day's games into one column.
- **Best-time chart.** Beside the history chart (side by side in the wide
  layout, stacked below it), a step line of the standing best time,
  stepping down at each new best with a marker there, against a dated
  axis — the first and last date of the shown games and evenly spaced
  dates between ("9 Oct") — and a time axis from 0, drawn and redrawn as
  the history chart is. Its text alternative names each new best and its
  date; without a won game it shows an honest empty line.
- **Hover values.** On both charts a pointer over the plot, or a tap,
  shows the nearest point's values in a small readout with a marker on the
  point — on the history chart that game's date, 3BV/s and efficiency, on
  the best-time chart its date and best time; it goes when the pointer
  leaves. The charts take no focus stop: keyboard and controller players
  read the same numbers in the text alternatives and the lists.
- **Averages.** Under the board's counters, a small table of the mean
  time, 3BV/s and efficiency over the board's last 10, last 50 and all won
  games in the results formats — a column with fewer games than it holds
  averages what there is and says how many ("Last 50 (12)"), no won game
  shows dashes — and the win rate over its last 50 games of every outcome,
  with the completed games' win rate over the same games beside it. Derived
  from the history on every draw and stored nowhere.
- **Top 10.** A tab beside Recent games: the board's ten best won games
  under a Time · 3BV/s · Efficiency choice (Time by default), each with its
  rank, time, 3BV/s, efficiency, date and time, the board's 3BV, the
  counted clicks and *Watch* where its replay is kept. The ranking is one
  pure function in the records code — lower time, higher 3BV/s or
  efficiency, a tie to the earlier game, a game without the stat left out —
  which `results-screen`'s "#4 of 57" reads too, so the two never disagree;
  rank 1 by each stat is the game holding that best. A no-guess board ranks
  only its own games; with no won game the tab says so.
- **Filters.** Above the history area, a period choice (All time · 12
  months · 30 days · 7 days, back from now on each game's end date) and an
  outcome choice (All · Won · Lost · Abandoned). The period filters every
  history view — the recent games, the Top 10, the averages, the recent
  win rate and both charts; the outcome filters the recent games, the one
  view of every outcome, and the won-only views say they count won games.
  The bests, the board's counters and the mode's overall figures stay
  all-time, since they are the records themselves. A filter change starts
  the recent games on their first page; a filter that leaves nothing shows
  each view's empty line, never the board's empty state.
- **Export.** One export module builds two files from `personal-records`'
  history of every board in both modes and `replay-library`'s listing of
  every kept replay: a JSON file (`minesweeper-3d-records-<date>.json`, the
  history entries with their board labels and derived stats, and the
  replays' listing with pins) and a CSV file
  (`minesweeper-3d-history-<date>.csv`, one row per game, newest first,
  with the replay state as columns, RFC 4180 quoting, a dot decimal and no
  units). It exports everything, not the filtered view, and writes no
  document; with no game recorded the actions are disabled and say there is
  nothing to export yet. The actions sit below the lists, beside Back, and
  in `settings`' Data panel, both through the one module.
- **Recent games list.** The newest games first, ten to a page, with a
  pager of First, at most five numbered pages around the current one and
  Last, hidden when one page holds everything, so a long history stays
  responsive. Each row reads the date and local time the game ended
  ("11 Oct 2026 14:32", 24-hour), its outcome, its time to the thousandth
  of a second in `results-screen`'s time format (47.380 s), the board's
  3BV, 3BV/s, and its efficiency to one decimal.
- **Live update.** Subscribes to `personal-records`' change notification
  while open, redrawing through the filters.

## Data and state

- One persisted state: the replays list's Pinned first filter, in its own
  small document, remembered across visits and reloads. The chosen board,
  the list pages, the filters, the tab and the Top 10's stat are screen
  state, kept across board and mode changes while open and back to All
  time · All, Recent games and Time on each open; all figures are read from
  `personal-records` on show and on change.

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
- `replay-library` — the kept replays' listing the export carries.
- `game-summary` — board labels and derived stats.
- `results-screen` — the time format.
- `screen-components` — every control and surface.
- `theme-system` — the charts' colours through the token reader, and
  theme-change notification.
- `game-shell` — routing from the menu and the results screen, navigation.
- No external libraries.
