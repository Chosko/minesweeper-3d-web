# Leaderboards — catalogue, eligibility, submission and outbox, Steam and local implementations

## OVERVIEW

`js/leaderboards/` is the leaderboard logic of both builds, DOM-free: which
boards are ranked and under what name, which finished games are submitted,
the verifier gate and the outbox a win waits in, the Steam submitter, best
cache, reader and replay fetcher over the desktop host's bridge client, and
the web build's local stand-in over the player's own wins. The platform
fills its `leaderboards` slot with one implementation at start-up — the
Steam leaderboards with the bridge, the stand-in without it
([platform.md](platform.md)) — and callers import `leaderboards` from
`js/platform/index.js`, never a file here. The results flow's end-of-game
hand-off calls `submit` ([app-shell-results.md](app-shell-results.md));
`js/main.js` hands the records store and the replay library in with
`leaderboards.connect({ records, replays })`, which only the stand-in reads.

| File | Responsibility |
| ---- | -------------- |
| `index.js` | `createSteamLeaderboards` — the Steam build's interface, wiring the submission, submitter, best cache, reader and fetcher over one leaderboard finder —, `watchLoggedOn`, and the re-export of `createLocalLeaderboards`. Head comment documents the interface both builds share. |
| `catalogue.js` | `CATALOGUE` and `leaderboardFor(board)`: the ranked boards and their stable names. |
| `eligibility.js` | `eligible(summary, replay, knownBest)`. |
| `details.js` | The score (`scoreOf`), the details array (`DETAILS_FORMAT_VERSION`, `encodeDetails`, `detailsFor`, `decodeDetails`) and the stats derived from them (`statsOf`). |
| `state.js` | The submission state per summary id (`SUBMISSION`, `createSubmissionState`). |
| `submit.js` | `createLeaderboardSubmission`: `submit`, the verifier gate, the outbox's flush through a submitter, start-up. |
| `outbox.js` | `createOutbox`: the `leaderboards.outbox` document and its own blob store. |
| `steam-submitter.js` | `createSteamSubmitter`, `replayFileName`: one outbox entry sent to Steam. |
| `best-cache.js` | `createBestCache`: the player's Steam best per leaderboard, for the session. |
| `reader.js` | `createFinder`, `reasonOf`, `createReader`: entries and own standing. |
| `replay-fetch.js` | `createReplayFetcher`, `REPLAY_REASONS`: an entry's shared replay, checked against its entry. |
| `local.js` | `createLocalLeaderboards`, `LOCAL_PLAYER`: the web build's stand-in. |

## PUBLIC API

The interface (`index.js` head), the same on both builds:
- `submit(summary, replay)` → true when the game is eligible, at once;
  `state(id)` → the submission state or null; `onChange(fn)` → unsubscribe,
  `fn(id, state)` after each change; `flush()`, `started`, `settled()`.
- `entries(board, scope, range)` → Promise of `{ total, entries }`, scope
  `'global'` (`range { start, end }`, ranks from 1), `'friends'` or
  `'around'` (range relative to the player's rank); each entry
  `{ leaderboard, rank, playerId, playerName, score, details, replay }`,
  `details` decoded (null when unreadable), `replay` the attached file's
  handle (Steam) or the summary id (local), else null.
- `standing(board)` → Promise of `{ score, globalRank, friendsRank }` or
  null when the player has no entry.
- `replayFor(entry)` → Promise of `{ ok: true, replay }` (decoded) or
  `{ ok: false, reason }`, reason one of `REPLAY_REASONS`: `no-replay`,
  `download-failed`, `unreadable`, `mismatch`.
- Queries reject with `{ reason }`: `'no-leaderboard'` for a board outside
  the catalogue, `'unavailable'` with the capability off (or, locally,
  before `connect`), else the bridge's typed error code (`reasonOf`:
  `offline`, `not-found`, `invalid`, `failed`) — locally `'invalid'` for an
  unknown scope, `'failed'` for a history that cannot be read. Nothing
  throws.
- `local` — false on Steam, true for the stand-in; `connect({ records,
  replays })` — a no-op on Steam.

Catalogue (`catalogue.js`)
- `CATALOGUE` — `[{ name, board }]`: Classic 2D's square Beginner,
  Intermediate and Expert (`STANDARD_BOARDS`) and the 3D Cube Beginner,
  Intermediate and Expert presets (`PRESETS_3D`), each with no-guess off and
  on. Every other board has none — custom, Cube Intro, other 3D sizes,
  Hexagon, Triangle and every Daily board.
- Name rule `<mode>-<standard size>-<guess|no-guess>`, e.g.
  `classic-2d-expert-no-guess`, `3d-cube-beginner-guess`. A published name
  never changes; the catalogue test pins every one.
- `leaderboardFor(board)` → the name, or null for anything else (never
  throws).

Eligibility (`eligibility.js`) — `eligible(summary, replay, knownBest)` is
true only for a won game that is not a challenge, on a catalogue board,
with its sealed replay (`{ blob, listing }`, the listing naming the
summary's id), whose time is strictly below the known Steam best, or with
no known best. An equal time is not eligible: Steam keeps the earlier
entry.

Score and details (`details.js`) — the score is the elapsed time in integer
ms, ranked ascending. The details array: `[details format version, replay
format version, rules version, 3BV, 3BV solved, then effective and wasted
clicks per kind in CLICK_KINDS order]`, each a signed 32-bit integer.
`encodeDetails` throws a `RangeError` on a field it cannot write;
`decodeDetails` returns null for details it cannot read and ignores padding;
`statsOf(score, details)` → `{ bbbvPerSecond, efficiency }` through
game-summary's own derivations.

Submission state (`state.js`) — a frozen `{ status, ... }`, status one of
`SUBMISSION`:
- `not-eligible` — no `reason` when never eligible; else `replaced` (a
  better game took its outbox place), `beaten` (one already pending is as
  good), `invalid` (score or details could not be written), `no-replay` (its
  pending replay was lost before sending), or the submitter's drop reason
  (`not-found`, `beaten`);
- `pending` — verifying, or waiting in the outbox;
- `submitted` — `{ rankBefore, rankAfter }`, Steam's global rank before
  (null on a first entry) and after;
- `rejected` — `{ reason }` from the verifier gate: `refused` (the replay
  cannot be read or played), `differs` (does not reproduce), `outcome`,
  `board` or `time`.

Outbox (`outbox.js`) — `OUTBOX_DOC` `'leaderboards.outbox'`,
`OUTBOX_VERSION`; data `{ entries: { <leaderboard>: { id, score, details,
replay } } }`, `replay` the blob name (the summary id) in a blob store
opened under the same name. `load()`, `entries()`, `has(id)`,
`offer(leaderboard, entry, bytes)` → `{ queued, replaced }`,
`replay(leaderboard)`, `remove(leaderboard)`.

Steam pieces — `createSteamLeaderboards({ client, capabilities, storage,
openBlobStore, log? })`; `watchLoggedOn(client)` → `onLoggedOn(listener)`,
called each time the Steam state goes from not logged on to logged on
(at start-up too when already logged on); `replayFileName(leaderboard)` →
`<leaderboard>.msrp`, the remote storage file a leaderboard's replay is
shared under.

Local stand-in — `createLocalLeaderboards({ records?, replays?,
playerName? })`, `LOCAL_PLAYER` `{ id: 'local', name: 'You' }`.

## INTERNAL PATTERNS

- **Submit.** `submit` answers at once from eligibility, reading the best
  cache as `knownBest`; an eligible game turns `pending`, an ineligible one
  `not-eligible`. A second call for the same summary id answers what the
  first did. In the background the **verifier gate** decodes the replay and
  runs `verify` ([replay-playback.md](replay-playback.md)); the game goes
  ahead only when it reproduces, its outcome is a win, its header's board
  has the summary's leaderboard and its elapsed time equals the summary's.
  The details come from the verified replay's check values and its
  header's rules version. Every operation — the outbox's load first — runs
  one after another on one queue.
- **Outbox.** At most one pending game per leaderboard: a better (lower)
  score replaces the held one, whose blob is deleted and whose state becomes
  `replaced`; an equal or worse one is `beaten`. Its blob store is its own,
  never the replay library's, whose start-up reconciliation would delete its
  blobs; on Steam it is a Steam blob store in the save directory, synced
  like the document. `load()` deletes every blob no entry names, except
  when the storage refused the document (newer, unreadable, corrupt), so a
  pending replay is never lost to a document this session could not read.
  A replay whose write fails is held in memory for the session.
- **Flush.** At `start()` the stored entries become `pending` again and the
  outbox flushes; it flushes again after each queued game and each time
  Steam reports it is logged on — at start-up and on every reconnect while
  the game runs. A submitter answer `submitted` or `dropped` removes the
  entry and its replay; `retry`, any other answer, a throw or a rejection
  leaves it for the next flush. Without a submitter entries wait.
- **Steam submitter.** A score the best cache already beats is dropped
  (`beaten`) before anything is written. Otherwise: write and share the
  replay under `replayFileName`, upload score and details keeping the best,
  and on an improved upload attach the shared file — an improved upload
  clears the entry's attachment — answering Steam's ranks. On an unchanged
  upload it reads the player's entry: the same score with no file is this
  game's earlier upload whose attach failed, attached now; the same score
  with a file is submitted already; a better score drops it (`beaten`).
  `not-found` drops it and is logged once per leaderboard; every other
  error is `retry`. Re-sharing under the same name gives a new handle while
  an earlier handle keeps returning the earlier file.
- **The Steam leaderboards are found, never created.** One finder per
  `createSteamLeaderboards` (`createFinder`) finds each leaderboard's handle
  once and shares it; a failed find is asked again. The leaderboards
  themselves are made from a Steam client by `dev/steam/create-boards.mjs`
  ([desktop.md](desktop.md)).
- **Best cache.** Read each time Steam reports it is logged on, one
  leaderboard at a time, each read once — a failed read is retried on the
  next log-on — and updated after each upload, keeping the lower score.
  Without a player id it reads nothing.
- **Reader.** With the `leaderboards` capability off every query rejects
  `unavailable` and asks nothing. `friends` reads a fixed range; player
  names come from the bridge in chunks of the request limit, all null when
  any chunk fails. `standing` reads the player's own entry, then the
  friends list for the friends rank.
- **Replay fetcher.** Needs both the `leaderboards` and `sharedFiles`
  capabilities. It downloads the entry's shared file, decodes it and checks
  its header's board against the entry's leaderboard and its check-value
  time against the entry's score; the viewer verifies again before playing.
- **Local stand-in.** Ranks the board's won games from the records' history
  by `rankedGames(…, 'time')` ([records-history.md](records-history.md)),
  so it never disagrees with the Top 10; every scope returns that list,
  `global` cut to its range when given; each entry is the local player,
  details `{ detailsVersion, replayFormatVersion: null, rulesVersion: null,
  bbbv, bbbvSolved, clicks }`, linked to its replay when the library `has`
  it. History and library are read at each query. `submit` sets
  `not-eligible` and returns false — the history already holds the game.

## DOMAIN DEPENDENCIES

- [../domain/features/steam-leaderboards.md](../domain/features/steam-leaderboards.md)
  — catalogue, eligibility, verifier gate, outbox, submitter, best cache,
  reader, replay fetcher, local stand-in, the interface.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the bridge's leaderboard, shared-file and identity requests, the
  capability flags, logged-on events.
- [../domain/features/steam-cloud-saves.md](../domain/features/steam-cloud-saves.md)
  — the Steam blob store the outbox's replays live in.

## CROSS-REFERENCES

- [platform.md](platform.md) — the `leaderboards` slot, the capability
  flags, storage and the blob store; [desktop.md](desktop.md) — the bridge's
  leaderboard requests and `dev/steam/`.
- [app-shell-results.md](app-shell-results.md) — the end-of-game hand-off
  that calls `submit`.
- [records.md](records.md) — board identities, `STANDARD_BOARDS`,
  `PRESETS_3D`; [records-history.md](records-history.md) — `rankedGames`.
- [replay.md](replay.md) — the sealed replay and its decoder;
  [replay-playback.md](replay-playback.md) — `verify`;
  [replay-library.md](replay-library.md) — the kept replays the stand-in
  links.
- [testing.md](testing.md) — `tests/leaderboards-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the interface either build offers: the head comments of
  `index.js` and `local.js` together, which must stay alike.
- A submission stuck pending, dropped or rejected: `submit.js`'s `gate`,
  `send` and `queueGame`, then `steam-submitter.js`'s `send`.
- Adding a ranked board: `catalogue.js` and the pinned names in
  `tests/leaderboards-catalogue.test.mjs` — a new name needs its Steam
  leaderboard made by `dev/steam/create-boards.mjs`.
- Changing what is uploaded with a score: `details.js`, bumping
  `DETAILS_FORMAT_VERSION`.
