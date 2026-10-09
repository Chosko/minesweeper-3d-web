# Steam leaderboards

Ranking free-play wins on Steam: each standard Classic 2D and 3D board, with
no-guess on and with it off, has a Steam leaderboard ranked by time; a won
game whose replay re-runs to the same result is submitted with that replay
attached, queued while offline; and the game can read global, friends and
around-me entries and fetch any entry's replay. The web build ranks the
player's own wins locally.

## Purpose

[product-design.md § Steam features](../product-design.md#steam-features)
gives every comparable board a Steam leaderboard with a replay attached to
each entry, and § Design decisions ranks free-play boards by time and gives
custom boards none. The m3-on-steam exit criteria require global, friends
and around-me leaderboards for the standard free-play boards of Classic 2D
and 3D, each entry carrying its replay, and local-only leaderboards on the
web preview. Steam trusts whatever the client uploads, so the game checks
each win against its own replay before uploading it, and a viewer checks a
downloaded replay against its entry before playing it. This feature is the
leaderboard logic; the screen is `leaderboard-screen`.

## Scope and non-goals

In scope (m3-on-steam):

- The leaderboard catalogue: 18 boards — Classic 2D square Beginner,
  Intermediate and Expert, and the six 3D presets (double layer and cube,
  Beginner, Intermediate and Expert), each with no-guess on and off — and
  the stable Steam leaderboard name of each.
- Eligibility: which finished games are submitted.
- Submission: replay verification, score and details upload, replay
  sharing and attachment.
- The offline outbox: pending submissions kept across sessions and sent
  when Steam is reachable.
- Queries: entries by scope and range, the player's own entry and rank, and
  an entry's replay.
- The local stand-in for the web build.

Non-goals:

- The flat 3D presets (9 × 9 × 1, 16 × 16 × 1, 30 × 16 × 1) — dropped from
  the 3D mode, and redundant with Classic 2D's boards.
- Campaign-level and daily-board leaderboards, ranked by 3BV/s — deferred
  to `m4-campaigns` and `m5-core-complete`; the catalogue gains entries,
  the mechanism stays.
- Hexagonal, triangle and Surface leaderboards — deferred to `m6-launch`.
- Custom boards — no leaderboard, by product decision.
- Showing leaderboards — `leaderboard-screen`.
- The Steam global and friends rank on the results screen —
  `results-steam-rank`; this feature provides the state and query it reads.
- Server-side anti-cheat — there is no server; client-side replay checks
  are the whole defence.

## Architecture

Built within the recorded technical direction — Steam leaderboards with
each entry's replay attached through Steam in the Steam build, local-only
leaderboards in the web build, all behind the platform layer (see
[technical-direction.md](../technical-direction.md)). The logic is a
DOM-free ES module tested in Node against a fake adapter; it reaches Steam
only through `steam-desktop-host`'s bridge and capability adapter.

- **Catalogue.** Maps a board identity from `game-summary` and
  `3d-game-records` to a leaderboard name, or to none. Names are derived
  from the board's mode, standard size and no-guess setting and never
  change once published. The leaderboards are created in the Steamworks app
  settings — ascending sort, time-in-milliseconds display — and the game
  only finds them, never creates them.
- **Eligibility.** A game is submitted when it was won, its board is in the
  catalogue, and a sealed replay exists for it. A won game without a replay
  is never submitted, because every entry carries its replay. A game that
  does not beat the player's known Steam best for that board is not
  submitted either, which keeps uploads well under Steam's rate limit.
- **Verifier gate.** Before queueing, `replay-playback`'s verifier re-runs
  the replay on the engine without drawing it; the submission goes ahead
  only when it reproduces, its outcome is a win, its board matches the
  leaderboard, and its elapsed time equals the summary's time.
- **Outbox.** Holds at most one pending submission per leaderboard — a
  better pending game replaces a worse one. Each entry keeps the score, the
  details and a reference to its replay, which is kept in a blob store of
  the outbox's own, separate from the replay library, so the library's
  retention and reconciliation never touch it. The outbox flushes at
  start-up and whenever Steam reports it is logged on again.
- **Submitter.** For one outbox entry: write the replay to Steam remote
  storage under a file name fixed per leaderboard and share it; upload the
  score with details, keeping the best; if Steam reports the score
  improved, attach the shared file to the entry. A score Steam already beat
  is dropped. A step that fails with `offline` or `failed` leaves the entry
  for the next flush; `not-found` (a leaderboard missing from the
  Steamworks settings) drops it and logs once.
- **Best cache.** The player's own score per leaderboard, read once Steam is
  logged on and updated after each upload. Used by eligibility and by
  `leaderboard-screen`'s own-entry highlight; Steam is its source of truth.
- **Reader.** Downloads entries for a leaderboard in a scope — global by
  rank range, friends, around the player by a range either side — with each
  entry's rank, player id and name, score, details and replay handle.
- **Replay fetcher.** Downloads an entry's shared replay, decodes it with
  `replay-recording`'s decoder, and checks that its header names the
  leaderboard's board and that its check-value time equals the entry's
  score; on a match it hands the replay to `replay-playback`, which runs its
  own verification before playing.
- **Local stand-in.** In the web build, the same interface over the
  player's own won games on the board, from `personal-records`' history,
  ranked by time; every scope returns that list, each entry named as the
  player and linked to its replay when `replay-library` keeps it. Submission
  is a no-op, since the history already holds the game.

## Data and state

- **Catalogue** — fixed in code: board identity → leaderboard name.
- **Score** — elapsed time in milliseconds, an integer.
- **Details** — a small integer array uploaded with the score: a details
  format version, the replay format version, the rules version, 3BV, 3BV
  solved, and clicks by kind, so the screen derives 3BV/s and efficiency
  without downloading the replay.
- **Outbox document** — registered with `platform-storage` under its own
  name and version: per leaderboard, the pending summary id, score, details
  and replay reference. Synced by `steam-cloud-saves` like any document; a
  pending entry submitted from two machines is harmless because Steam keeps
  the best.
- **Outbox blob store** — the pending replays, one per outbox entry, deleted
  once the entry is submitted or dropped.
- **Shared replay files** — in Steam remote storage, one per leaderboard,
  replaced when a new best is attached. At most 18 files.
- **Best cache** — in memory for the session.

## Interfaces and contracts

- **Submit** — `submit(summary, replay)`, called by the game shell's
  end-of-game hand-off for a finished game after the summary is recorded
  and the replay added to the library. Returns at once with eligible or not;
  verification and upload run in the background. Submitting the same
  summary id twice is a no-op.
- **Submission state** — for a summary id: not eligible, pending, submitted
  (with the global rank before and after the upload, as Steam reports
  them; none before on a first entry), or rejected by verification. Change
  notification after each state change, so a screen showing the game can
  update.
- **Entries** — `entries(board, scope, range)` → the entries and the
  leaderboard's total count, for global, friends and around-me.
- **Own standing** — `standing(board)` → the player's score and global and
  friends rank, or none. What the results screen's rank reads.
- **Replay** — `replayFor(entry)` → the decoded replay, or a reason:
  no replay attached, download failed, unreadable, or does not match the
  entry.
- **Availability** — the leaderboards capability flag from
  `steam-desktop-host`; when Steam is unavailable or offline, queries reject
  with that reason and submissions wait in the outbox.
- **Failure** — nothing here interrupts play or the results flow; every
  failure is a state or a rejected query, never a thrown error.

## Dependencies

- `steam-desktop-host` — the bridge, the adapter's leaderboard, shared-file
  and identity capabilities, logged-on events, and capability flags. Its
  binding spike must land before the Steam submitter and reader are built.
- `steam-cloud-saves` — the Steam blob store the outbox's replays live in,
  and syncing the outbox document.
- `replay-playback` — the headless verifier, and the viewer a fetched
  replay is handed to.
- `replay-recording` — the sealed replay, its decoder and check values.
- `replay-library` — the blob store interface, opened under the outbox's
  own name, and the kept replays the local stand-in links to.
- `game-summary` and `3d-game-records` — board identities, keys, standard
  board recognition and derived stats.
- `personal-records` — the history the local stand-in ranks.
- `game-shell` — the end-of-game hand-off that calls `submit`.
- `platform-storage` — the outbox document.

## Open questions

- Whether replacing a shared replay file under the same name keeps earlier
  attachments readable until their entry is replaced. Checked by the
  binding spike; if not, each best gets a new file name and the previous
  one is deleted after the new attachment succeeds.
- The size of the "around me" range and of a global page. Set with
  `leaderboard-screen`'s layout; blocks only the constants.
