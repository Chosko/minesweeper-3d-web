# In-game layout

The redesigned screen around a board in play, designed with *Joyful tiles*:
the framed game window with its title and Pause, the counter strip with the
mines-left and time readouts and Restart, the board, a side panel of live
figures — 3BV progress, pace against the personal best, 3BV/s, clicks with
efficiency, flags — with the controls reminder, and a foot line naming the
board.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
names the in-game overlay that sits over a board as part of the shared
layout every theme styles. The *Joyful tiles* game artboard — drawn
identically in the two other sketched themes — replaces the m1 overlay bar
with a game window that also shows the figures enthusiasts track while they
play. This feature builds that window for Classic 2D and fits the 3D game's
overlay to it, so the two modes share one in-game layout.

## Scope and non-goals

In scope (m2b-themes):

- **Classic 2D game window** — inside the screen frame
  (`shared-screen-layout`): the head with the mode and board title and
  Pause with its key hint; the counter strip with mines left, Restart and
  the timer; the board in its themed frame; the side panel; the foot line
  (board size, mine count and no-guess).
- **Counter readouts** — new kit components (digits and icon as parts), so
  a theme can draw them as plain figures, LED digits on black or anything
  between. The timer and mine-counter formats and limits are unchanged
  (`screen-components` § Overlay bar).
- **Restart in the strip** — the shared restart of `game-shell`, with its
  confirmation rule unchanged.
- **Live figures** — derived each time the game's counts change, never on
  a timer tick except where the elapsed time is part of the figure:
  - *3BV* — 3BV solved over the board's 3BV, with a progress bar;
  - *pace vs PB* — how far ahead of or behind the personal best's pace the
    game is, shown only when this board has a personal best time;
  - *3BV/s* — 3BV solved per elapsed second, with the board's best 3BV/s
    as its detail line;
  - *clicks* — the counted clicks, with the live efficiency as its detail
    line;
  - *flags* — flags placed, with mines left as its detail line.
- **Controls reminder** — the side panel's foot lists the board's main
  bindings for the active input device, from the bindings source.
- **3D game** — the 3D overlay keeps the full-window scene and takes the
  same parts, over the scene on their own themed surfaces: the flags
  counter, Restart and the timer at the top centre; on the right, the
  figures panel headed by a bar with the title and Pause, the live figures
  below, the panel — and the help panel beside it — centred vertically. The
  title drops the difficulty when the full name does not fit on one line
  ("3D" for "3D · Cube Intermediate"), keeping the full name as its
  tooltip. On a phone in landscape the title is a pill at the top left, the
  counters and Restart at the top centre and Pause an icon button at the
  top right; in portrait the title and Pause bar sits on top with the
  counters below; both keep the full name, and the touch hint strip wraps
  onto a second line rather than overflowing.
- **Replay viewer** — shows the same live figures for the replayed game
  beside its playback controls, from the replay's frames.

Non-goals:

- The other screens and the screen frame itself — `shared-screen-layout`.
- New rules, new stats or a change to how 3BV, 3BV solved, clicks or
  efficiency are counted — the engine's counts and `game-summary`'s
  definitions are used as they are.
- A pace comparison against anything but the player's own best time on the
  same board (no Steam rank, no ghost).
- Showing the board's mine layout, 3BV per region or any figure that would
  help solve the board.
- Hexagon, Triangle and Surface game screens — deferred to `m6-launch`.

## Architecture

Built within the recorded technical direction — plain DOM over the Canvas
2D board and the WebGL scene (see
[technical-direction.md](../technical-direction.md)); the current overlay is
described in [app-shell-ui.md](../../context/app-shell-ui.md) and the Classic 2D
board view in [classic2d-board-view.md](../../context/classic2d-board-view.md).

- **Game window composition.** The Classic 2D layer becomes the framed
  window: head, counter strip, board area, side panel, foot. The board area
  keeps the board view's fit rule, minimum tile size and scrolling; the
  window's chrome reduces the space the fit rule works in, and the side
  panel moves under the board when the window is too narrow for both, and
  may be hidden on a narrow or mobile window
  ([shared-screen-layout.md](./shared-screen-layout.md) § Interfaces and
  contracts, **Window sizes**).
- **Live figures model.** A small DOM-free module that turns the game's
  counts (3BV, 3BV solved, clicks, flags, mines), the elapsed time and the
  board's bests into the figures and their detail lines. Both modes and the
  replay viewer feed it; the overlay writes a figure only when its text
  changes.
- **Pace vs PB.** The best time's pace prorated by progress: the elapsed
  time minus the personal best time scaled by the share of the board's 3BV
  already solved. Negative is ahead. It needs no stored history beyond the
  best time, works on every board with a best, and is hidden before the
  first 3BV is solved, when the share is zero.
- **Bests read once.** The board's best time and best 3BV/s are read from
  the records store when the game starts and held for the game; a best set
  by this game shows on the results screen, not mid-game.
- **3D overlay.** The 3D game's counters and figures panel with its title
  bar sit over the scene with their own themed surfaces so they stay
  readable over any sky; the crosshair readout, the HUD key strip and the
  first-use hints keep their places. Whether the title fits is measured
  against the panel's width, so the shortening follows the window.
- **Design source.** Every in-game screen is drawn on the canvas — the
  Classic 2D window, the 3D game and the replay viewer at every supported
  window size with their states — and is built from those artboards, as
  [shared-screen-layout.md](./shared-screen-layout.md) § Architecture,
  **Design status per screen**, says.

## Data and state

- No persisted state. The figures are derived per change from the live
  game's counts and the bests read at game start; the replay viewer derives
  them from the replay's frame and the bests as they stand.
- The engine already exposes 3BV, 3BV solved and the click counts at any
  time; nothing new is computed by the engine.

## Interfaces and contracts

- **Figures model** — given counts, elapsed time and bests, returns each
  figure's text and detail line; a board with no best returns no pace and
  no best 3BV/s line rather than zeros.
- **Overlay** — the existing hooks the shell and tests use (the time,
  mines and clicks readouts, Pause, the board-size label) keep their ids,
  or move with their owners in the same change.
- **Readability** — every readout meets the contrast contract against the
  surface it sits on, over the Classic 2D window and over any 3D sky, in
  every theme.
- **Never in the way** — no figure is announced to assistive technology on
  every change; the panel is a polite region updated at most once a second
  for screen readers.

## Dependencies

- `shared-screen-layout` — the screen frame and the kit additions.
- `theme-system` — the catalogue the counter readouts and the panel join,
  and their styling.
- `classic-2d-square-play`, `3d-play-flow` — the game sessions, their
  counts feed and their overlays.
- `cell-graph-rules-engine`, `game-summary` — 3BV, 3BV solved, clicks and
  the efficiency definition.
- `personal-records`, `3d-game-records` — the board's best time and 3BV/s.
- `replay-playback` — the viewer that shows the replayed figures.
- `game-shell` — Pause and Restart.

