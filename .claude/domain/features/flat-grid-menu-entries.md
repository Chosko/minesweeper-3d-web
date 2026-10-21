# Hexagon and Triangle menu entries

The main menu's Hexagon and Triangle entries open their own modes instead
of *Coming soon*. Each entry's preview shows its board, the menu opens on the
last mode played whichever of the five it is, and that mode's board choice
opens on its last board. Surface still opens *Coming soon*, and the Daily
screen keeps Hexagon and Triangle as *Coming soon*.

## Purpose

The game shell's slice of m2c: "the Hexagon and Triangle entries each open
its own mode instead of *Coming soon*, each keeps its last board choice, and
Continue counts each as a mode of its own"
([product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)).
The entries, their routes, the placeholder and the last-mode record are
shipped (`game-shell`, `shared-screen-layout`). This feature switches the two
entries from placeholder to mode and gives them the preview the canvas draws
for every focused entry.

## Scope and non-goals

In scope (m2c-flat-grids):

- **Routes.** Choosing Hexagon or Triangle opens its board choice through
  the mode host, as Classic 2D does, because both modes are registered
  (`flat-grid-modes`). Surface, which is not registered, stays on *Coming
  soon*.
- **Previews.** The focused entry's scene panel shows the mode's
  Intermediate board in its board frame, drawn by the flat board view over
  the grid's geometry. Its tag reads "Hexagon · Intermediate" or "Triangle ·
  Intermediate", and the board is the same on every load, like the Classic
  2D preview.
- **The last mode played.** The last-mode record takes `hexagon` and
  `triangle` like any mode. The Last played chip, the menu's opening
  selection and Records opening on the last board played and its mode all
  follow it. This is what "Continue counts each as a mode of its own" means
  until the Start / Continue entry exists.
- **Each mode's last board choice** opens its board choice, so Enter then
  Play replays it (the document is `flat-grid-modes`').
- **The Daily screen** lists Hexagon and Triangle as *Coming soon*, not
  playable, though both modes are registered.

Non-goals:

- The Start / Continue entry itself — deferred with the campaigns
  (`m4-campaigns`). When it lands, its "last mode played" reads the same
  record, so Hexagon and Triangle need nothing more.
- Daily boards for Hexagon and Triangle — not scheduled.
- The Surface entry as a mode — deferred to `m6-launch`.
- The demo's offers and locks on these entries — deferred to `m6-launch`.
- The menu's layout. The entries' column takes no new entry.

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
- **Preview binder** — mounts the flat board view for the grid the preview
  names. One view layer per board kind, kept mounted, as for Classic 2D.
- **Daily list** — one entry per menu mode. A mode with no daily board
  reads *Coming soon*, whether or not it is registered.

## Data and state

- **Last mode** — the shipped document, unchanged in shape; its value may
  be either new mode id. A stored value naming an unregistered mode reads
  as none.
- **Demo boards** — derived from a fixed seed, never stored.

## Interfaces and contracts

- **Menu** — `open(id)` for `hexagon` or `triangle` takes the mode route.
  An unavailable entry still opens nothing.
- **Preview** — gives the board kind with a grid and a game for the two
  entries. A preview that fails to mount shows the panel's card, as for any
  preview.
- **Daily** — a mode with no daily board is listed and never playable.

## Dependencies

- `game-shell` — the menu, mode host, routes, placeholder and last mode.
- `shared-screen-layout` — the menu's entries, scene panel and the Daily
  screen.
- `flat-grid-modes` — the two registered modes and their last board
  choices.
- `flat-grid-geometry` — the board view the previews draw with.
- `hexagon-grid`, `triangle-grid` — the demo boards' graphs.
