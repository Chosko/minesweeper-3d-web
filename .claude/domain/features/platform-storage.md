# Platform storage

The storage half of the platform layer: one interface through which the game
saves and loads its documents — settings, personal bests, stats history and
later replays and progress — with a browser implementation for the web
build and room for the Steam implementation.

## Purpose

[technical-direction.md](../technical-direction.md) makes the platform layer
the one boundary to storage and to Steam, with a local implementation for the
web build and a Steam implementation inside Electron. m1-classic-2d is the
first milestone that persists more than a few loose values: settings, the
last mode and board choice, personal bests and stats history. Putting them
behind one interface now means the m3-on-steam build swaps the
implementation instead of touching every caller, and every saved document
carries the format version the direction requires from the start.

## Scope and non-goals

In scope (m1-classic-2d):

- The storage interface: named documents, loaded and saved whole, each with
  a format version.
- The browser implementation for the web build.
- Version handling: each document's owner declares its current version and
  how to upgrade every earlier one; the storage layer applies the upgrades
  on load.
- Failure handling: unavailable, full or corrupt storage never stops the
  game.

Non-goals:

- The Steam implementation (files in the user-data directory, Steam Cloud
  sync) and the IPC surface to Electron — `m3-on-steam`.
- Steam achievements, leaderboards and the overlay, the other half of the
  platform layer — `m3-on-steam`.
- What each document holds — the owning feature (`settings`, Results and
  records, `classic-2d-square-play`, `game-shell`) defines its own content.
- Replay storage — `replay-library` (m2-3d-joins) adds a large-binary
  replay store beside this document interface.

## Architecture

Built within the recorded technical direction — the platform layer as the
one boundary to storage, with a local implementation for the web build (see
[technical-direction.md](../technical-direction.md)). It replaces the
try/catch-wrapped `localStorage` helpers spread across the shell and the
sound module ([app-shell.md](../../context/app-shell.md),
[audio.md](../../context/audio.md)).

- **Storage interface.** The only API callers use to persist anything. It
  deals in named documents of plain data, not in keys and strings.
- **Browser implementation.** Keeps each document in browser storage under
  one namespaced key per document, serialised as text with its version.
- **Implementation selection.** Chosen once at start-up: the browser
  implementation on the web build; the Steam build later selects its own.
  Callers never know which is active.
- **Document versioning.** Each owner registers its document name, current
  version and an upgrade step per earlier version. Loading an older document
  runs the steps in order and saves the result; loading a newer one than the
  game knows is refused and the document left untouched.

## Data and state

- **Documents** — one per concern: settings, personal records, stats
  history, the last mode played, each mode's last board choice. Each is
  stored as `{ version, data }`.
- **Source of truth** — the stored document between sessions; the owning
  feature's in-memory copy while the game runs. The storage layer caches
  nothing.
- **Legacy keys** — the current build's loose `ms3d.*` keys are left in
  place; the owning feature reads them once to carry values over, and this
  layer does not interpret them.

## Interfaces and contracts

- **Register** — `register(name, currentVersion, upgrades)` declares a
  document before it is loaded.
- **Load** — `load(name)` returns the upgraded data, or nothing when the
  document does not exist. It is asynchronous, since the Steam
  implementation reads files.
- **Save** — `save(name, data)` writes the whole document at its current
  version; it is asynchronous and reports success or failure.
- **Availability** — `available()` says whether anything will persist this
  session, so a caller can tell the player once.
- **Failure** — storage that cannot be read behaves as empty; a corrupt or
  unreadable document is reported as missing and kept aside rather than
  overwritten until the owner saves a new one; a refused newer version is
  reported to the owner; a failed save is reported, never thrown. In every
  case the game goes on playing.

## Dependencies

- No other feature; every persisting feature depends on this one.
- No external libraries.

## Open questions

- Whether the start-up load is fast enough to stay asynchronous before first
  paint once the Steam implementation reads files. Blocks nothing in m1;
  settled when `m3-on-steam` is architected.
