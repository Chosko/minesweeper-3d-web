# Steam cloud saves

The Steam build's storage: every saved document — settings, records, stats
history, the replay library's index, the last mode played — and every kept
replay is a file in the game's save directory, written safely by the desktop
host, and Steam Cloud carries that directory between the player's machines.

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
  one file per document.
- The Steam implementation of `replay-library`'s replay store: one file per
  replay, and further named blob stores on the same pattern.
- The main-process file service behind them: safe writes, reads, listing,
  and keeping corrupt files aside.
- Steam Auto-Cloud configuration for the save directory: what syncs, the
  quota, and how conflicts are resolved.
- The flush of pending saves when the game quits.

Non-goals:

- What any document holds — its owning feature.
- Syncing machine-local state — window state and the crash log stay out of
  the save directory (`steam-desktop-host`).
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
  the save directory and reachable only through the bridge's storage and
  blob operations. Writes go to a temporary file and are renamed over the
  old one, so a crash mid-write never leaves a half-written save. Names are
  checked against a fixed pattern, so no request reaches outside the save
  directory.
- **Steam document storage.** Implements `platform-storage`'s interface:
  each document is one text file holding its version and data. Loading,
  version upgrades and refusal of a newer version stay `platform-storage`'s
  rules; only where the bytes live changes. A file that will not parse is
  renamed aside with a dated suffix and reported missing, which is the
  "kept aside rather than overwritten" rule of `platform-storage`.
- **Steam blob store.** Implements `replay-library`'s replay store
  interface — put, get, delete, list — as one binary file per blob in a
  subdirectory per named store. The replay library opens its store under
  its own name; `steam-leaderboards` opens a separate one for replays
  waiting to be submitted.
- **Quit flush.** On the host's flush request the page waits for every save
  in flight, then answers, so Auto-Cloud's exit upload sees the final files.

## Data and state

- **Save directory** — under the user-data directory: one file per
  document, a subdirectory per blob store, nothing else. Everything in it
  syncs; nothing outside it does.
- **Source of truth** — the files on the local disk while the game runs;
  Steam Cloud's copy between machines. Each owning feature keeps its
  in-memory copy as before.
- **Auto-Cloud configuration** — set in the Steamworks app settings: the
  Windows root that maps to the save directory, all files beneath it
  recursively, a byte quota and a file-count quota sized for the replay
  library's retention plus the documents.
- **Size** — documents are small apart from the stats history; the replay
  library dominates, at up to 100 unpinned replays plus pinned ones.

## Interfaces and contracts

- **Document storage** — exactly `platform-storage`'s register, load, save
  and availability, asynchronous, with its failure contract unchanged.
  Start-up loads stay asynchronous: they are reads of local files through
  the bridge, and no screen waits on more than the documents it shows.
- **Blob store** — exactly `replay-library`'s put, get, delete and list,
  plus opening a store by name.
- **Availability** — documents and blobs persist whenever the save
  directory is writable, whether or not Steam is running or online; cloud
  sync is Steam's and is invisible to the game.
- **Conflicts** — when both machines changed the save directory since the
  last sync, Steam asks the player at launch which copy to keep; the game
  then loads whichever set of files it finds.
- **Failure** — a disk that cannot be written reports failed saves through
  `platform-storage`'s and `replay-library`'s own failure contracts, and the
  game keeps playing; exceeding the cloud quota stops Steam syncing, never
  local saving.

## Dependencies

- `steam-desktop-host` — the main process, the bridge's storage and blob
  operations, platform selection and the quit hand-shake.
- `platform-storage` — the document interface implemented here.
- `replay-library` — the replay store interface implemented here; the
  library itself is unchanged.
- Steam Auto-Cloud — configured in the Steamworks app settings; no runtime
  dependency on the binding.

## Open questions

- The byte and file-count quota. Set by measuring real replay sizes against
  the library's retention of 100 unpinned replays plus pins; this also
  settles `replay-library`'s question of whether Steam Cloud fits the
  library as designed.
- Whether the settings document's machine-specific values (graphics
  quality, sensitivity) should stay per machine instead of syncing. Blocks
  nothing; until settled the whole settings document syncs.
