# Leaderboards — the Steam leaderboards and the local stand-in

## OVERVIEW

The two implementations of the leaderboards interface
([leaderboards.md](leaderboards.md) § PUBLIC API): the Steam submitter, best
cache, reader and replay fetcher over the desktop host's bridge client, and
the web build's local stand-in over the player's own wins. The catalogue,
eligibility and the details they share are [leaderboards.md](leaderboards.md)'s,
the submission, the verifier gate and the outbox
[leaderboards-submit.md](leaderboards-submit.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `index.js` | `createSteamLeaderboards` — the Steam build's interface, wiring the submission, submitter, best cache, reader and fetcher over one leaderboard finder —, `watchLoggedOn`, and the re-export of `createLocalLeaderboards`. Head comment documents the interface both builds share. |
| `steam-submitter.js` | `createSteamSubmitter`, `replayFileName`: one outbox entry sent to Steam. |
| `best-cache.js` | `createBestCache`: the player's Steam best per leaderboard, for the session. |
| `reader.js` | `createFinder`, `reasonOf`, `createReader`: entries and own standing. |
| `replay-fetch.js` | `createReplayFetcher`, `REPLAY_REASONS`: an entry's shared replay, checked against its entry. |
| `local.js` | `createLocalLeaderboards`, `LOCAL_PLAYER`: the web build's stand-in. |

## PUBLIC API

Steam pieces — `createSteamLeaderboards({ client, capabilities, storage,
openBlobStore, log? })`; `watchLoggedOn(client)` → `onLoggedOn(listener)`,
called each time the Steam state goes from not logged on to logged on
(at start-up too when already logged on); `replayFileName(leaderboard)` →
`<leaderboard>.msrp`, the remote storage file a leaderboard's replay is
shared under.

Local stand-in — `createLocalLeaderboards({ records?, replays?,
playerName? })`, `LOCAL_PLAYER` `{ id: 'local', name: 'You' }`.

## INTERNAL PATTERNS

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
  ([desktop-steam.md](desktop-steam.md)).
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
  — submitter, best cache, reader, replay fetcher, local stand-in.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the bridge's leaderboard, shared-file and identity requests, the
  capability flags, logged-on events.

## CROSS-REFERENCES

- [leaderboards.md](leaderboards.md) — the interface both implement and the
  catalogue; [leaderboards-submit.md](leaderboards-submit.md) — the
  submission and the outbox the submitter serves.
- [platform-host.md](platform-host.md) — the `leaderboards` slot, the
  capability flags; [desktop-steam.md](desktop-steam.md) — the bridge's
  leaderboard requests and `dev/steam/`.
- [records-history.md](records-history.md) — `rankedGames`;
  [replay.md](replay.md) — the replay decoder;
  [replay-library.md](replay-library.md) — the kept replays the stand-in
  links.
- [testing-files.md](testing-files.md) — `tests/leaderboards-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the interface either build offers: the head comments of
  `index.js` and `local.js` together, which must stay alike.
- A submission dropped or retried on Steam: `steam-submitter.js`'s `send`.
