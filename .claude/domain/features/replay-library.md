# Replay library

Where replays are kept: every sealed replay is saved to a replay store
behind the platform layer, the newest 100 unpinned replays are kept and
older ones removed, and pinned replays — every personal-best game
automatically, and any replay the player pins — are never removed by
retention or a storage failure; only the player's confirmed Delete of that
replay, or the confirmed Reset all data (`settings`) with every other
replay, deletes them. The player browses, pins, watches and deletes them
from the Records screen.

## Purpose

[product-design.md § Replays](../product-design.md#replays) keeps replays in
a replay library that survives game updates, and the Records entry of the
main menu leads to it. Recording every game must not mean unbounded growth
in the web build's browser storage, nor later in Steam Cloud, and the games
that matter — personal bests, and the ones the player chooses — must never
be lost to that limit. This feature is the store, the retention rule and
the library view.

## Scope and non-goals

In scope (m2-3d-joins):

- The replay store: a large-binary store behind the platform layer, beside
  `platform-storage`'s document interface, with its browser implementation
  on IndexedDB.
- The library index: one versioned document listing every kept replay with
  the fields the library view shows.
- Retention: the newest 100 unpinned replays across both modes, plus every
  pinned replay.
- Pinning: automatic for a game that set any of its board's three personal
  bests; by hand for any replay; unpinning by hand.
- Deleting one kept replay, pinned or not, by hand behind a confirmation.
- The library view in the Records screen: the chosen board's replays,
  newest first, pinned ones marked, with *Watch*, *Download*, *Pin* /
  *Unpin* and *Delete*, and *Open replay file* for the view; the bests and
  the recent-games list linking to their replays where one is kept.

Non-goals:

- Syncing replays through Steam Cloud and the replay store's Steam
  implementation — deferred to `m3-on-steam`.
- Leaderboard replays — deferred to `m3-on-steam`.
- Deleting replays in bulk. Besides retention, a replay leaves the library
  only by the player's confirmed Delete of that one replay, or with the
  whole library, pinned replays included, by `settings`' Reset all data,
  which waits for the library's start-up load and then deletes every blob
  and the index.
- Sharing replay files — in no milestone's slice. A replay opened from a
  file is watched in `replay-playback`, never added to the library.
  `records-screen`'s export carries only the library's listing of kept
  replays.
- The Records screen's board picker, 2D and 3D switch and figures —
  `records-screen` and the Results and records slice of `m2-3d-joins`.

## Architecture

Built within the recorded technical direction — the platform layer as the
one boundary to storage, a local implementation for the web build and a
Steam implementation later (see
[technical-direction.md](../technical-direction.md)). The library logic is a
DOM-free ES module tested in Node against an in-memory store; the view is
plain DOM from the `screen-components` kit inside the Records screen.

- **Replay store.** A platform-layer interface for named binary blobs —
  put, get, delete and list — selected at start-up like
  `platform-storage`'s implementation. The browser implementation keeps
  each replay as one record in an IndexedDB object store; a replay is
  never held in `localStorage`, whose size limit it would exhaust.
- **Library index.** A document registered with `platform-storage`, with
  its own format version, listing each kept replay's id, board key, mode,
  outcome, time, 3BV/s, efficiency, end date, size, and pin state with its
  reason (best or by hand). The library view and retention read only the
  index, never the blobs.
- **Library.** The only writer of the store and the index. Adding a replay
  writes the blob, then the index entry, then applies retention. Loads the
  index once at start-up, and reconciles it with the store: a blob with no
  index entry is deleted, an index entry with no blob is dropped.
- **Retention.** After each add or unpin, unpinned replays beyond the
  newest 100, by end date, are deleted, oldest first. Pinned replays are
  never deleted by retention or by a storage failure; the player's
  confirmed Delete removes one, and a player-confirmed Reset all data
  deletes them with the rest.
- **Removal.** The player's Delete takes the replay's entry out of the
  index whatever its pins, saves the index, then deletes its blob; a blob
  whose delete fails is an orphan the next start-up's reconciliation
  deletes, as with retention.
- **Best pinning.** The end-of-game hand-off tells the library whether the
  game set any personal best, from the comparison `personal-records`
  returns; such a replay is pinned with the reason "best". The pin stays
  when the best is later beaten, so the player's progression stays
  watchable; the player can unpin it.
- **Library view.** In the Records screen, for the board the screen shows:
  a list of that board's kept replays with the date and local time each
  game ended ("11 Oct 2026 14:32"), outcome, time (in `results-screen`'s
  time format, 47.380 s), 3BV/s, efficiency (to one decimal) and pin
  state, pinned ones first under a filter the screen remembers, ten to a
  page with the same pager as the recent games (First, at most five
  numbered pages, Last; hidden on one page) and its range caption;
  *Watch* opens `replay-playback`, *Download* saves the replay's stored
  bytes as a `.msrp` file (`replay-playback` § Architecture, "Replay
  files"), *Pin* / *Unpin* toggles the hand pin, and *Delete* asks first, in the panel — naming the replay's date, time
  and outcome, whether it is pinned (as a best, by hand, or both), and
  that it cannot be undone — then removes it. *Open replay file* picks a
  replay file and opens it in `replay-playback`, Back returning to the
  view. The bests panel and the recent-games list show *Watch* on entries
  whose replay is kept.

## Data and state

- **Replay blobs** — in the replay store, keyed by replay id (the summary's
  id). Opaque to the library; the format belongs to `replay-recording`.
- **Library index** — in `platform-storage`, small, saved after every
  change. Source of truth for which replays are kept and pinned; the store
  is the source of truth for their bytes.
- **In memory** — the index for the whole session; blobs only while a
  replay is being saved or watched.
- **Session-only replays** — when nothing will persist, or a save fails,
  the just-finished replay stays in memory for the session so *Watch
  replay* on the results screen still works.

## Interfaces and contracts

- **Add** — `add(replay, listing fields, setBest)`, called by the game
  shell's end-of-game hand-off for finished and abandoned games, after the
  summary is recorded with `personal-records`. Adding the same id twice is
  a no-op.
- **Queries** — the replays kept for a board key; every kept replay across
  boards and modes, newest first (the listing `records-screen`'s export
  carries; a library that failed to load lists none); whether a summary id
  has a kept replay; a replay's bytes by id.
- **Pin / unpin** — by id; pinning sets the hand-pin reason, unpinning
  clears every reason and applies retention.
- **Remove** — by id; removes the replay whatever its pins (the player's
  confirmed Delete). An id with no entry changes nothing.
- **Change notification** — subscribers are told after each add, pin,
  unpin and removal, so an open Records screen stays current.
- **Availability** — when the replay store or the index cannot persist this
  session, the library works in memory and the Records screen says once
  that replays are not being saved.
- **Failure** — a failed blob write leaves no index entry and is reported
  once; the replay stays watchable this session. A refused newer index
  version leaves the stored index and blobs untouched and runs the session
  with an in-memory library that saves nothing, so a newer build's library
  is never overwritten. A replay that will not decode is listed and offered
  to watch; `replay-playback` reports why it cannot play.

## Dependencies

- `platform-storage` — registration, load and save of the index document,
  and the implementation selection the replay store follows.
- `replay-recording` — the sealed replay and its listing fields.
- `replay-playback` — watching a replay from the library.
- `personal-records` — whether a game set a best, from its comparison.
- `game-summary` — board keys and labels.
- `records-screen` — the screen the library view sits in.
- `results-screen` — the time format.
- `screen-components` — the list, buttons and empty state.
- `game-shell` — the end-of-game hand-off and routing.
- IndexedDB in the web build and in Electron's Chromium. No external
  libraries.

## Open questions

- How much browser storage the web build can count on, and whether 100
  unpinned replays of long 3D games fit within it. Measured once real
  replays exist; blocks only the retention constant.
- Whether Steam Cloud's quota fits the library as designed. Settled when
  `m3-on-steam` architects cloud saves; blocks nothing in m2.
