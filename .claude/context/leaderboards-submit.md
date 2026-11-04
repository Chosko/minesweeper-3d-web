# Leaderboards — submission, verifier gate and outbox

## OVERVIEW

How a finished game reaches a leaderboard on both builds: `submit`'s
answer, the submission state per summary id, the verifier gate, the outbox a
win waits in and its flush through a submitter. The interface, the
catalogue, eligibility and the details are [leaderboards.md](leaderboards.md)'s;
the Steam submitter the flush calls and the local stand-in are
[leaderboards-steam.md](leaderboards-steam.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `state.js` | The submission state per summary id (`SUBMISSION`, `createSubmissionState`). |
| `submit.js` | `createLeaderboardSubmission`: `submit`, the verifier gate, the outbox's flush through a submitter, start-up. |
| `outbox.js` | `createOutbox`: the `leaderboards.outbox` document and its own blob store. |

## PUBLIC API

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

## DOMAIN DEPENDENCIES

- [../domain/features/steam-leaderboards.md](../domain/features/steam-leaderboards.md)
  — verifier gate, outbox.
- [../domain/features/steam-cloud-saves.md](../domain/features/steam-cloud-saves.md)
  — the Steam blob store the outbox's replays live in.

## CROSS-REFERENCES

- [leaderboards.md](leaderboards.md) — the interface `submit` belongs to,
  eligibility and the details; [leaderboards-steam.md](leaderboards-steam.md)
  — the Steam submitter, the best cache read as `knownBest`.
- [platform.md](platform.md) and [platform-blobs.md](platform-blobs.md) —
  storage and the blob store.
- [app-shell-results.md](app-shell-results.md) — the end-of-game hand-off
  that calls `submit`.
- [replay.md](replay.md) — the sealed replay and its decoder;
  [replay-playback.md](replay-playback.md) — `verify`.
- [testing-files.md](testing-files.md) — `tests/leaderboards-*.test.mjs`.

## WHEN TO READ THE SOURCE

- A submission stuck pending, dropped or rejected: `submit.js`'s `gate`,
  `send` and `queueGame`, then `steam-submitter.js`'s `send`.
