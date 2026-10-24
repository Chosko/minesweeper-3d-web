# In-game layout

The redesigned screen around a board in play, designed with *Joyful tiles*:
the framed game window with its title bar and Pause, the counter strip with
the mines-left and time readouts and Restart, the board, a side panel of live
figures, hidden until the player opens it — 3BV progress, pace against the personal best, 3BV/s, clicks with
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
  (`shared-screen-layout`), showing while playing only the board and the
  two counters. Its head is the title bar with Pause in Back's place, no
  mode or difficulty in it, and the body has no heading. Under the head,
  the counter strip with mines left, Restart and the timer; the board in
  its themed frame; the live figures panel when open; the foot line, led
  by the mode and difficulty, then the board line (board size, mine count
  and no-guess), with Swap clicks and the **live-figures toggle** on its
  right. The window hugs its content and centres on the page; the board
  starts just under the counter strip, left-aligned at the strip's width.
  On a phone, portrait and landscape alike, the head holds Pause and the
  logo, the mode and difficulty lead the foot line, and there is no
  live-figures toggle; the board sits directly under the counter strip
  with the Tap choice under it; held sideways, the board takes the left
  edge and a right column holds the mines, the time, Restart and the Tap
  choice.
- **The live figures panel** — hidden by default: the window then shrinks
  to the board and stays centred. The live-figures toggle (accessible name
  *Live figures*) opens it beside the board, where it was, as a flat
  column with no surface of its own after a divider, and is drawn sunk
  while it is open. Whether it is open is a stored preference, as the
  board choice panel's pin is (`shared-screen-layout`): it holds across
  sessions and across every mode until the player changes it. On the
  controller the View button (the back button) presses the toggle in
  every mode, Classic 2D and 3D alike, wherever the toggle shows; RB stays
  the 3D Space view mode.
- **Counter readouts** — new kit components: the counter readout
  `ui-counter` (its `digits` and an optional `icon` as parts), so a theme
  can draw it as plain figures, LED digits on black or anything between,
  in the `ui-counter-strip` with Restart between the two counters; and the
  figures panel `ui-figures` of `ui-figure` rows (label, figure, optional
  detail line, the 3BV's progress bar as `ui-figure--progress`), with an
  optional head bar (title and an action) and a foot for the controls
  reminder. The timer and mine-counter formats and limits are unchanged
  (`screen-components` § Overlay bar); a negative mine counter is drawn in
  the danger colour. The counters, the figures, the titles and the touch
  buttons follow the frame's size steps (`shared-screen-layout`), in the
  Classic 2D window and the 3D overlay alike.
- **Restart in the strip** — the shared restart of `game-shell`, with its
  confirmation rule unchanged: an icon-only button between the two
  counters, its accessible name and tooltip *Restart*, with no text and no
  F2 label; the F2 shortcut itself is unchanged.
- **Live figures** — derived each time the game's counts change, never on
  a timer tick except where the elapsed time is part of the figure:
  - *3BV* — 3BV solved over the board's 3BV, with a progress bar;
  - *pace vs PB* — how far ahead of or behind the personal best's pace the
    game is (*ahead of* or *behind* the time), shown only when this board
    has a personal best time;
  - *3BV/s* — 3BV solved per elapsed second, with the board's best 3BV/s
    as its *PB* detail line; the dash placeholder until time has elapsed;
  - *clicks* — the counted clicks, with the live *efficiency* (in lower
    case) as its detail line;
  - *flags* — flags placed, with mines left as its detail line.
- **Controls reminder** — the side panel's foot lists the board's main
  bindings for the active input device, from the bindings source.
- **First-use hint strip** — in Classic 2D laid over the board's foot
  inside the board area, so the board keeps its size, never overlapping
  the Tap choice or the figures panel when that panel sits under the
  board; in 3D over the scene. Every keyboard and controller input is
  shown whole in one key box, with no separators; on touch it names tap,
  long-press and the mode's chord gesture — a tap on a number in Classic
  2D, the two-finger tap in 3D — as words between dots.
- **Tap choice** — on touch, the Reveal / Flag choice for a tap is a
  two-option segmented choice (*Tap: Reveal*, *Tap: Flag*) under the
  board; touch input reads its value.
- **3D game** — the 3D overlay keeps the full-window scene and takes the
  same parts, over the scene on their own themed surfaces, with no title
  anywhere — no mode or difficulty label: Pause floats at the top left and
  the live-figures toggle at the top right; the flags counter, Restart and
  the timer stay at the top centre; the live figures panel is hidden by
  default and appears on the right when opened, under the same stored
  preference as Classic 2D's, the help panel beside it, both centred
  vertically. On a phone, in landscape and in Learn 3D only the floating
  Pause remains of these, with the counters and Restart at the top centre;
  the touch hint strip wraps onto a second line rather than overflowing. The aimed-cell readout
  carries outline cube and flag icons in the text colour; the crosshair
  draws its arms only while a cell is targeted, with no ring; the
  off-screen arrow sits by the crosshair; the HUD key strip's labels are in
  ink; the touch stick is drawn at rest and follows the thumb while used.
- **Learn 3D** — its own play layout: the floating Pause, a
  strip with mines and Restart only — no timer, so the pause card shows
  mines left alone —, no figures panel, Pause over the strip in a
  column at the top left above a phone and the phone layouts kept on a
  phone, and the lesson's prompt in its own strip with the step count and
  no close button. Its end cards carry a
  *Learn 3D* label above the title, ink body text, a line on a loss as well
  as on a win, and the icons the canvas draws.
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
- Hexagon and Triangle game screens — `flat-grid-modes` (`m2c-flat-grids`);
  the Surface game screen — deferred to `m6-launch`.
- The 3D game moving inside the window with the title bar — still in review
  on the canvas.

## Architecture

Built within the recorded technical direction — plain DOM over the Canvas
2D board and the WebGL scene (see
[technical-direction.md](../technical-direction.md)); the current overlay is
described in [app-shell-ui.md](../../context/app-shell-ui.md) and the Classic 2D
board view in [classic2d-board-view.md](../../context/classic2d-board-view.md).

- **Game window composition.** The Classic 2D layer becomes the framed
  window: title bar, counter strip, board area, side panel, foot. The board area
  keeps the board view's fit rule, minimum tile size and scrolling; the
  window's chrome reduces the space the fit rule works in, measured with
  the window at its largest, and the board area takes the board's extent
  there, so the window hugs the board and follows its size, the side
  panel widening it only while open; the open panel moves under the
  board, its figures in a row, below 1024 px wide, and is hidden on a phone — narrower than 720 px, or held sideways at
  500 px high or less
  ([shared-screen-layout.md](./shared-screen-layout.md) § Interfaces and
  contracts, **Window sizes**).
- **Live figures model.** A small DOM-free module,
  `js/shell/live-figures.js`, that turns the game's counts (3BV, 3BV
  solved, clicks, flags, mines), the elapsed time and the board's bests
  into the figures and their detail lines; a figure the inputs cannot yet
  produce — no time elapsed, no click, no 3BV yet — shows the dash
  placeholder, never `NaN` or `Infinity`. Both modes and the replay viewer
  feed it; the overlay writes a figure only when its text changes.
- **Pace vs PB.** The best time's pace prorated by progress: the elapsed
  time minus the personal best time scaled by the share of the board's 3BV
  already solved. Negative is ahead. It needs no stored history beyond the
  best time, works on every board with a best, and is hidden before the
  first 3BV is solved, when the share is zero.
- **Bests read once.** The board's best time and best 3BV/s are read from
  the records store when the game starts and held for the game; a best set
  by this game shows on the results screen, not mid-game.
- **3D overlay.** The 3D game's counters, floating Pause, live-figures
  toggle and figures panel sit over the scene with their own themed
  surfaces so they stay readable over any sky; the crosshair and its readout, the off-screen
  arrow, the view chips, the HUD key strip, the first-use hints, the toast
  and the touch controls take the places the 3D game's artboards draw — a
  hint stands above a view chip shown with it.
- **Design source.** Every in-game screen is drawn on the canvas — the
  Classic 2D window, the 3D game and the replay viewer at every supported
  window size with their states — and is built from those artboards, as
  [shared-screen-layout.md](./shared-screen-layout.md) § Architecture,
  **Design status per screen**, says. The in-game windows' title bar,
  footer, live-figures toggle, collapsed live figures panel and icon-only
  Restart take their exact sizes, colours and positions from the canvas
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC: J-Game2D, J-Game3D
  and J-Ready, each at -xl, -l, -m, -p, -ls and -states, where each states
  board's second frame shows the panel open.

## Data and state

- **Live figures panel open or closed** — one stored view preference,
  shared by every mode and kept across sessions, saved through the
  platform layer beside the board choice panel's pin
  (`shared-screen-layout` § Data and state); closed when nothing is
  stored.
- The figures are derived per change from the live game's counts and the bests read at game start; the replay viewer derives
  them from the replay's frame and the bests as they stand.
- The engine already exposes 3BV, 3BV solved and the click counts at any
  time; nothing new is computed by the engine.

## Interfaces and contracts

- **Figures model** — given counts, elapsed time and bests, returns each
  figure's text and detail line; a board with no best returns no pace and
  no best 3BV/s line rather than zeros.
- **Overlay** — the existing hooks the shell and tests use (the time,
  mines and clicks readouts, Pause, the board-size label) keep their ids,
  or move with their owners in the same change. The live-figures toggle
  exposes its pressed state, and Restart keeps its accessible name.
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

