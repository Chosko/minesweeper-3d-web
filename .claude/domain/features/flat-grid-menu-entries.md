# Hexagon and Triangle menu entries

The main menu's Hexagon and Triangle entries open their own modes instead
of *Coming soon*. Each play tile's preview shows its board, the menu opens on the
last mode played whichever of the five it is, and that mode's board choice
opens on its last board. Hexagon and Triangle each get a daily board, played
from the Daily screen like the Classic 2D and 3D ones. Surface still opens
*Coming soon*, on the menu and on Daily.

## Purpose

The game shell's slice of m2c: "the Hexagon and Triangle entries each open
its own mode instead of *Coming soon*, each keeps its last board choice, and
Continue counts each as a mode of its own"
([product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)),
and a daily board for each playable mode
([§ Daily board](../product-design.md#daily-board)). The entries, their
routes, the placeholder, the last-mode record and the Daily screen are
shipped (`game-shell`, `shared-screen-layout`). This feature switches the two
entries from placeholder to mode, gives their play tiles the previews the
canvas draws, and adds the two daily boards the canvas's Daily
artboards draw.

## Scope and non-goals

In scope (m2c-flat-grids):

- **Routes.** Choosing Hexagon or Triangle opens its board choice through
  the mode host, as Classic 2D does, because both modes are registered
  (`flat-grid-modes`). Surface, which is not registered, stays on *Coming
  soon*.
- **Previews.** The Hexagon and Triangle entries are play tiles of the
  main menu (`shared-screen-layout`), each showing its own preview at once:
  the centre of the mode's Intermediate board, near playing size, drawn by
  the flat board view over the grid's geometry on the dark scene
  background and cropped so that no board edge shows; on a phone, a
  cropped strip inside the right end of the mode's row. The board is the
  same on every load, like the Classic 2D preview. No tile shows a Last
  played chip. Exact sizes and crops are the canvas's:
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC, J-Menu-xl, -l, -m,
  -p and -states, and J-Components *Main menu buttons*.
- **The last mode played.** The last-mode record takes `hexagon` and
  `triangle` like any mode. The menu's opening selection and Records
  opening on the last board played and its mode follow it. This is what "Continue counts each as a mode of its own" means
  until the Start / Continue entry exists.
- **Each mode's last board choice** opens its board choice, so Enter then
  Play replays it (the document is `flat-grid-modes`').
- **The Hexagon and Triangle daily boards.** Each mode's daily board is its
  Expert board with no-guess, worked out from the date like the Classic 2D
  and 3D ones: the daily seed over the board's token, started on the marked
  start cell, the same for everyone on that local date. Its daily code is
  the frozen daily form over the mode's token, as `hexagon-grid` and
  `triangle-grid` spell it; the canvas's `HX-…` codes stand for that form.
- **The Daily screen's Hexagon and Triangle rows**, in menu order, playable
  as the Classic 2D row is: board line, state, days in a row, the code chip
  with Copy and Copy link, one counted attempt, Play and Watch replay. The
  selected row's preview is the mode's closed daily board with its marked
  start cell, drawn by the flat board view. Today's unused boards are
  pre-generated when the menu shows, through each mode's warm client. Play
  starts the board through the mode's coded start (`flat-grid-modes`), and
  today's daily code typed into a board choice or a `#board=` link opens the
  Daily screen, as for every daily.
- **Records of a daily game**: its mode's Daily board, listed in that
  mode's Records picker after the standard boards, with its days in a row,
  as every mode's Daily board is (`flat-grid-records-replays`).

Non-goals:

- The Start / Continue entry itself — deferred with the campaigns
  (`m4-campaigns`). When it lands, its "last mode played" reads the same
  record, so Hexagon and Triangle need nothing more.
- Leaderboards for these daily boards — not in this milestone.
- The Surface entry as a mode — deferred to `m6-launch`.
- The demo's offers and locks on these entries — deferred to `m6-launch`.
- The menu's layout — `shared-screen-layout`. Its grid of play tiles
  already holds the Hexagon and Triangle tiles.

## Architecture

Built within the recorded technical direction: the game shell owns the
menus, shared by every mode (see
[technical-direction.md](../technical-direction.md)). It changes the
shipped menu, preview and Daily wiring in place
([app-shell-menu.md](../../context/app-shell-menu.md),
[app-shell-daily.md](../../context/app-shell-daily.md)).

- **Menu routes** — no change to the route rule: a registered mode opens
  its board choice. Registering the two modes is what moves them off the
  placeholder.
- **Preview data** — the preview for each entry becomes the board kind,
  with the mode's demo board. A seeded demo board per flat mode is built
  the way the Classic 2D one is: Intermediate, partly opened, the same on
  every load.
- **Preview binder** — mounts the flat board view for the grid each tile's
  preview names, cropped to the tile. One view layer per tile, kept
  mounted, as for Classic 2D.
- **Daily boards** — the daily board list gains a Hexagon and a Triangle
  entry, each named by its dimensions like the existing ones, one per mode
  in the menu's order, so the daily game, its code and its generation
  request come from the same rule and the Classic 2D and 3D boards keep
  their seeds and codes.
- **Daily list** — one entry per menu mode. A mode with no daily board
  reads *Coming soon*, whether or not it is registered, its note saying it
  has no daily board yet; Surface is the only one. The held daily boards
  are prepared through each mode's generation client, and Play generates
  a board none holds. The Daily preview mounts the flat board view for the
  selected row's grid, one view per grid kept mounted, as the menu's
  tiles do.

## Data and state

- **Last mode** — the shipped document, unchanged in shape; its value may
  be either new mode id. A stored value naming an unregistered mode reads
  as none.
- **Demo boards** — derived from a fixed seed, never stored.
- **Daily boards** — derived from the date, never stored. A daily game is
  recorded on its mode's Daily board, its identity carrying the daily flag.

## Interfaces and contracts

- **Menu** — `open(id)` for `hexagon` or `triangle` takes the mode route.
  An unavailable entry still opens nothing.
- **Preview** — gives the board kind with a grid and a game for the two
  entries. A Daily preview that fails to mount shows the mode's card in the
  panel; a play tile's leaves its plain ground.
- **Daily** — a mode with no daily board is listed and never playable. A
  Hexagon or Triangle daily follows the shipped daily rules: one counted
  attempt per date, a forced marked start, no last choice saved. Its mode's
  Records picker lists its Daily board whether or not it was played.

## Dependencies

- `game-shell` — the menu, mode host, routes, placeholder and last mode.
- `shared-screen-layout` — the menu's play tiles and the Daily screen.
- `flat-grid-modes` — the two registered modes and their last board
  choices.
- `flat-grid-geometry` — the board view the previews draw with.
- `hexagon-grid`, `triangle-grid` — the demo boards' graphs, and the board
  tokens the daily codes and seeds use.
- `flat-grid-records-replays` — the per-mode records and Records picker a
  daily game is recorded in.
- `game-summary`, `board-generation` — the daily code, seed and marked
  start cell, and the generation a daily board is made by.
