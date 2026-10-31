# Steam cloud saves

The Steam build's storage: every saved document and every kept replay is a
file written safely by the desktop host, and nothing is kept in browser
storage. Steam Cloud carries the save directory — settings, records, stats
history, the replay library's index, the last mode played and the replays —
between the player's machines; the machine settings document stays on the
machine that saved it.

## Purpose

[product-design.md § Steam features](../product-design.md#steam-features)
promises cloud saves for progress, records and replays, and the m3-on-steam
exit criteria require records, replays and settings to sync through Steam
Cloud while the game stays fully playable offline.
[technical-direction.md](../technical-direction.md) stores the Steam build's
data as files in the user-data directory, synced by Steam Cloud.
`platform-storage` and `replay-library` already put every save behind the
platform layer with a browser implementation; this feature is their Steam
implementation and the Steam Cloud configuration that syncs it, so no
feature that saves anything changes.

## Scope and non-goals

In scope (m3-on-steam):

- The Steam implementation of `platform-storage`'s document interface:
  one file per document, in the save directory or, for a machine-local
  document, in the machine prefs directory beside it.
- The Steam implementation of `replay-library`'s replay store: one file per
  replay, and further named blob stores on the same pattern.
- The main-process file service behind them: safe writes, reads, deletion,
  listing, and keeping corrupt files aside.
- The stored theme id handed to the page before first paint.
- No browser storage anywhere on the Steam build.
- Steam Auto-Cloud configuration for the save directory: what syncs, the
  quota, and how conflicts are resolved.
- The flush of pending saves when the game quits.

Non-goals:

- What any document holds, and which settings are machine-local — their
  owning feature (`settings` for the machine settings document).
- Syncing machine-local state — the machine prefs directory stays out of
  the save directory, as window state and the crash log do
  (`steam-desktop-host`).
- Leaderboard replay files — shared through Steam remote storage by
  `steam-leaderboards`, not part of the save directory.
- Moving web-preview data into the Steam build — browser storage belongs to
  another origin and is not read.
- In-game cloud controls (sync now, choose a version) — Steam's own launch
  dialog handles conflicts.
- The demo build's saves — deferred to `m5-core-complete`.

## Architecture

Built within the recorded technical direction — files in the user-data
directory synced by Steam Cloud, reached only through the platform layer and
the desktop host's fixed bridge (see
[technical-direction.md](../technical-direction.md)).

- **Sync mechanism: Steam Auto-Cloud.** Steam uploads the configured save
  directory when the game exits and downloads it before the game starts,
  and does so later on its own when the player was offline. It needs no
  binding call and no sync code in the game, and its launch-and-exit timing
  matches the platform layer, which loads each document once at start-up.
  The remote storage API is used only for leaderboard replay sharing, never
  for saves.
- **File service.** In the main process of `steam-desktop-host`, scoped to
  the save directory and the machine prefs directory and reachable only
  through the bridge's storage and blob operations: read, write, delete,
  list and set aside for documents, put, get, delete and list for blobs.
  Writes go to a temporary file and are renamed over the old one, so a
  crash mid-write never leaves a half-written save. Names are checked
  against a fixed pattern, so no request reaches outside those two
  directories.
- **Steam document storage.** Implements `platform-storage`'s interface:
  each document is one text file holding its version and data. Loading,
  version upgrades and refusal of a newer version stay `platform-storage`'s
  rules; only where the bytes live changes. The machine settings document
  is the one machine-local document: its file lives in the machine prefs
  directory, every other document's in the save directory. A file that will
  not parse is renamed aside with a dated suffix and reported missing, which
  is the "kept aside rather than overwritten" rule of `platform-storage`.
  Clear lists and deletes every document file and kept-aside copy in both
  directories, so `settings`' Reset all data removes everything the game
  stored for the player.
- **Steam blob store.** Implements `replay-library`'s replay store
  interface — put, get, delete, list — as one binary file per blob in a
  subdirectory per named store. The replay library opens its store under
  its own name; `steam-leaderboards` opens a separate one for replays
  waiting to be submitted.
- **Pre-paint theme.** Before the window loads, the main process reads the
  theme id from the settings document's file, and the preload script hands
  it to the page beside the bridge. `theme-system`'s pre-paint script
  prefers that id when present, so the chosen theme applies before first
  paint on the Steam build.
- **No browser storage.** Nothing on the Steam build reads or writes
  browser storage: documents and blobs go through the bridge, the pre-paint
  theme comes from the host, and the settings store's carried-over values
  and Reset all data's removal of loose keys, which exist only in the
  browser build, read and remove nothing.
- **Quit flush.** On the host's flush request the page waits for every save
  in flight, then answers, so Auto-Cloud's exit upload sees the final files.

## Data and state

- **Save directory** — under the user-data directory: one file per synced
  document, a subdirectory per blob store, nothing else. Everything in it
  syncs; nothing outside it does.
- **Machine prefs directory** — under the user-data directory, outside the
  save directory: the machine-local document's file, in the same format.
  It never syncs.
- **Source of truth** — the files on the local disk while the game runs;
  Steam Cloud's copy of the save directory between machines. Each owning
  feature keeps its in-memory copy as before.
- **Auto-Cloud configuration** — set in the Steamworks app settings: the
  Windows root that maps to the save directory, all files beneath it
  recursively, and a quota of 100 MB and 1000 files per user.
- **Size** — documents are small apart from the stats history; the replay
  library dominates, at up to 100 unpinned replays plus pinned ones.

## Interfaces and contracts

- **Document storage** — exactly `platform-storage`'s register, load, save,
  clear and availability, asynchronous, with its failure contract
  unchanged. Start-up loads stay asynchronous: they are reads of local
  files through the bridge, and no screen waits on more than the documents
  it shows.
- **Blob store** — exactly `replay-library`'s put, get, delete and list,
  plus opening a store by name.
- **Pre-paint theme id** — a theme id, or nothing when the settings file is
  absent or unreadable, present on the page before any page script runs.
  Read once when the window loads; at run time the settings store drives
  the theme.
- **Availability** — documents and blobs persist whenever the save
  directory and the machine prefs directory are writable, whether or not
  Steam is running or online; cloud sync is Steam's and is invisible to the
  game.
- **Conflicts** — when both machines changed the save directory since the
  last sync, Steam asks the player at launch which copy to keep; the game
  then loads whichever set of files it finds.
- **Failure** — a disk that cannot be written reports failed saves through
  `platform-storage`'s and `replay-library`'s own failure contracts, and the
  game keeps playing; clear fails only when an existing file cannot be
  deleted; exceeding the cloud quota stops Steam syncing, never local
  saving.

## Dependencies

- `steam-desktop-host` — the main process, the preload script, the bridge's
  storage and blob operations, platform selection and the quit hand-shake.
- `platform-storage` — the document interface implemented here.
- `replay-library` — the replay store interface implemented here; the
  library itself is unchanged.
- `settings` — the machine settings document, and the carried-over values
  and loose-key removal the Steam build skips.
- `theme-system` — the pre-paint script that prefers the handed-over theme
  id.
- Steam Auto-Cloud — configured in the Steamworks app settings; no runtime
  dependency on the binding.

## Open questions

- Whether the library as designed fits that quota, measured from real
  replay sizes against the library's retention of unpinned replays plus
  pins; this also settles `replay-library`'s question of whether Steam Cloud
  fits the library as designed.
