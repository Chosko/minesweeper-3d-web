# Leaderboards — interface, catalogue, eligibility, score and details

## OVERVIEW

`js/leaderboards/` is the leaderboard logic of both builds, DOM-free: which
boards are ranked and under what name, which finished games are submitted,
the verifier gate and the outbox a win waits in, the Steam submitter, best
cache, reader and replay fetcher over the desktop host's bridge client, and
the web build's local stand-in over the player's own wins. The platform
fills its `leaderboards` slot with one implementation at start-up — the
Steam leaderboards with the bridge, the stand-in without it
([platform-host.md](platform-host.md)) — and callers import `leaderboards` from
`js/platform/index.js`, never a file here. The results flow's end-of-game
hand-off calls `submit` ([app-shell-results.md](app-shell-results.md));
`js/main.js` hands the records store and the replay library in with
`leaderboards.connect({ records, replays })`, which only the stand-in reads.

This file covers the shared interface, the catalogue, eligibility and the
score and details. The submission, the verifier gate and the outbox are
[leaderboards-submit.md](leaderboards-submit.md)'s; the Steam pieces and the
local stand-in [leaderboards-steam.md](leaderboards-steam.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `catalogue.js` | `CATALOGUE` and `leaderboardFor(board)`: the ranked boards and their stable names. |
| `eligibility.js` | `eligible(summary, replay, knownBest)`. |
| `details.js` | The score (`scoreOf`), the details array (`DETAILS_FORMAT_VERSION`, `encodeDetails`, `detailsFor`, `decodeDetails`) and the stats derived from them (`statsOf`). |

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

## INTERNAL PATTERNS

- **One interface, two implementations.** The interface lives in the head
  comments of `index.js` and `local.js`; callers reach it only through the
  platform's `leaderboards` slot, never a file here.

## DOMAIN DEPENDENCIES

- [../domain/features/steam-leaderboards.md](../domain/features/steam-leaderboards.md)
  — catalogue, eligibility, verifier gate, outbox, submitter, best cache,
  reader, replay fetcher, local stand-in, the interface.

## CROSS-REFERENCES

- [leaderboards-submit.md](leaderboards-submit.md) — the submission state,
  the verifier gate, the outbox and its flush;
  [leaderboards-steam.md](leaderboards-steam.md) — the Steam leaderboards
  (submitter, best cache, reader, replay fetcher) and the local stand-in.
- [platform-host.md](platform-host.md) — the `leaderboards` slot, the
  capability flags.
- [app-shell-results.md](app-shell-results.md) — the end-of-game hand-off
  that calls `submit`.
- [records.md](records.md) — board identities, `STANDARD_BOARDS`,
  `PRESETS_3D`; [records-summary.md](records-summary.md) — the derivations
  `statsOf` goes through.
- [testing-files.md](testing-files.md) — `tests/leaderboards-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the interface either build offers: the head comments of
  `index.js` and `local.js` together, which must stay alike
  ([leaderboards-steam.md](leaderboards-steam.md)).
- Adding a ranked board: `catalogue.js` and the pinned names in
  `tests/leaderboards-catalogue.test.mjs` — a new name needs its Steam
  leaderboard made by `dev/steam/create-boards.mjs`.
- Changing what is uploaded with a score: `details.js`, bumping
  `DETAILS_FORMAT_VERSION`.
