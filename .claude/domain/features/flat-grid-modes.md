# Hexagon and Triangle modes

Hexagon and Triangle as two playable modes of their own, each built from the
Classic 2D flow over its own grid. Each mode has a board choice screen with
Beginner, Intermediate, Expert, Custom and Insert Board Code and the no-guess
switch, and keeps its own last board choice. Play runs on the Classic 2D
session and timer, in the Classic 2D game window, by mouse, keyboard,
controller and touch, and a finished game goes to the shared results screen.

## Purpose

The m2c goal is two fresh flat boards, each "a full mode of its own with the
same exact rules, records and replays as Classic 2D"
([product-design.md § Hexagon](../product-design.md#hexagon),
[§ Triangle](../product-design.md#triangle)). The Classic 2D flow is shipped
and proven: board choice, start-of-game flow, generating state and failure
offer, pause, restart, the end delay and effect, the results hand-off. This
feature makes that flow a template that a mode configures with its grid,
rather than writing two more modes. The canvas draws both modes' screens as
the Classic 2D screens with the mode's name and boards: board choice, in
game, every state and window size.

## Scope and non-goals

In scope (m2c-flat-grids), for each of Hexagon and Triangle:

- **The mode** behind the shell's mode contract, registered with the mode
  host under the ids `hexagon` and `triangle` (the menu entries' ids).
- **Board setup** from the grid feature's standard sizes and custom limits,
  with the shared no-guess help text and density hint.
- **The board choice screen** in the Classic 2D board choice's composition,
  collapsible panel included (`shared-screen-layout`): by default the Board
  list and the foot only — the options (Beginner, Intermediate, Expert with
  their size, mines and density, Custom, and Insert Board Code), with no
  Last played chip —; the panel with the no-guess switch row, Custom's
  fields, info line, refusal and Random, the code field, the chosen board's
  three bests and *All records*; the panel toggle and its stored pin,
  shared with every mode; the panel opening on its own for Custom and
  Insert Board Code; the foot with only Play; and the phone drawer. The
  body heading is the mode's name. Its exact values are the canvas's:
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC, J-Hex and J-Tri board
  choice at -xl, -l, -m, -p and -states.
- **The last board choice**, one stored document per mode, normalised and
  falling back as Classic 2D's does.
- **Board codes and challenge links** for the mode's boards: Insert Board
  Code and `#board=` links start the coded board on its start cell, through
  the shell's code resolver. A code of another mode is refused with the
  other-mode hint, and a failed no-guess challenge board is never replaced
  by another board.
- **Play** on the Classic 2D session: safe first click, standard boards
  placed at once, no-guess boards from the mode's generation client with
  the generating card and failure offer, pre-generation for Play again, the
  timer from the first reveal, pause hiding the board, restart and leave
  counted as losses after the first click.
- **The game window**, Classic 2D's (`in-game-layout`): the title bar with
  Pause in Back's place; the counter strip with the icon-only Restart; the
  board in its board frame; the live figures panel against the board's
  bests, hidden by default under the stored open-or-closed preference every
  mode shares; the foot line led by the mode and difficulty, with Swap
  clicks and the live-figures toggle on its right; and the narrow and
  phone layouts. Its exact values are the canvas's:
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC, J-HexGame and J-TriGame
  at -xl, -l, -m, -p, -ls and -states.
- **Inputs**: the mouse with its button swap, the keyboard and controller
  cursor (moves from the grid's geometry), touch with the Tap choice,
  long-press flag, chord on a number, pan and pinch zoom. The bindings are
  Classic 2D's: the three flat modes share one set, the one
  `input-rebinding` makes rebindable.
- **Help and hints**: the controls list on the pause card, the H panel and
  the HUD strip follow the active device. The first-use hint strip and the
  one-time scroll hint share Classic 2D's first-use record, because the
  controls are the same.
- **Sound, rumble, end delay and end effect**: Classic 2D's per action. The
  win wave and confetti and the loss wave from the exploded tile spread by
  distance between tile centres.
- **Results**: the shared results screen with time, 3BV, 3BV/s, efficiency
  and the three-best comparison. Its board line leads with the mode's name.
  Play again, Records and Main menu work as they do after a Classic 2D
  game. These modes' replays and their place on the Records screen are
  `flat-grid-records-replays`', which builds on this feature: until it
  lands the replay recorder refuses the hexagon and triangle graphs and
  its failure never interrupts play, so a game ends without a replay and
  Watch replay is not offered, and Records opens on the last board played
  rather than on the game's board.

Non-goals:

- The Hexagon and Triangle daily boards and their Daily rows —
  `flat-grid-menu-entries`. A daily starts through the mode's coded start,
  as a challenge does.
- Leaderboards, achievements and the demo's Hexagon and Triangle offers and
  locks — deferred to `m6-launch`.
- Campaign levels on these grids — no milestone's slice gives either mode
  a campaign.
- Rebinding — `input-rebinding` (`m3-on-steam`).
- Records, the Records screen and replays — `flat-grid-records-replays`.
- The menu entries, their previews and the last mode played —
  `flat-grid-menu-entries`.
- A change to Classic 2D's behaviour. Classic 2D becomes the square
  configuration of the same template and plays as it does.

## Architecture

Built within the recorded technical direction: mode front-ends as a
renderer and input layer over the shared engine, Canvas 2D for the flat
grids, the game shell owning menus, results, records and replays (see
[technical-direction.md](../technical-direction.md)). It extends the shipped
Classic 2D mode and its shell wiring
([classic2d-mode.md](../../context/classic2d-mode.md),
[app-shell-2d.md](../../context/app-shell-2d.md)).

- **Flat mode configuration** — the values that differ between the three
  flat modes: mode id and display name, grid kind (graph provider and
  geometry), standard sizes and custom limits, the last-choice document,
  and the board-code token. The configuration has its own module,
  `js/flat-modes.js`. The Classic 2D mode, board setup and board choice
  binder take a configuration where they assume the square grid.
- **One mode instance per flat mode** — each with its own session per game,
  its own generation client (warmed when its board choice opens), and its
  own pre-generated board. They share the page's button swap and the board
  scale setting.
- **Board choice screens** — one screen per mode in the shared composition,
  each bound by the board choice binder over that mode's configuration and
  routed like Classic 2D's. The shell hands each its bests and its code
  resolver.
- **Game window** — the one Classic 2D window, its foot line led by the
  open mode's name. Only one flat game is open at a time.
- **Code resolution** — the shell's resolver tells a hexagon or triangle
  code apart by its token and routes it to its mode's forced start. The
  token is read from the board-code parser's own table of the 2D modes,
  which the configuration's token matches.

## Data and state

- **Last board choice** — one document per mode, holding the same shape as
  Classic 2D's (size, custom fields, no-guess), versioned through the
  platform layer. An invalid stored choice reads as the mode's default
  (Beginner, no-guess on) and is never saved.
- **Game state** — the session's, in memory, as for Classic 2D. The
  game-in-progress marker that turns a closed game into a loss covers these
  modes like every other.
- **Tap choice** — the page's one value, as for Classic 2D, never saved.

## Interfaces and contracts

- **Mode contract** — the shell's, unchanged: open the board choice, start,
  pause, restart, leave, finished report with summary and replay.
- **Configuration** — immutable; an unknown grid kind or a configuration
  whose standard sizes fall outside its own custom limits throws at
  registration.
- **Failure** — a no-guess board not found within the attempt budget gets
  the failure offer (retry or play a standard board); a coded board's
  failure offers no replacement. A generation worker failure is the same
  failure offer.

## Dependencies

- `classic-2d-square-play` — the session, timer, view, inputs, mode and
  board choice this feature turns into a template.
- `flat-grid-geometry` — layout, hit-testing, cursor moves and the floor.
- `hexagon-grid`, `triangle-grid` — the graphs, descriptions, sizes,
  limits, identities and code tokens.
- `hex-tri-board-art` — the tiles the board draws.
- `game-shell` — the mode host, routes, pause flow and the code resolver.
- `shared-screen-layout`, `in-game-layout` — the board choice and game
  window compositions.
- `results-screen` — the end-of-game hand-off.
- `game-summary` — the summary each finished game builds.

## Open questions

None.
