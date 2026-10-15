# Replay — format, recorder and sealer, the replay layer's map

## OVERVIEW

Every Classic 2D and 3D game that ends in play — won, lost, or abandoned
after its first click — becomes one compact, versioned binary replay: the
board's mines, the rules version, every action with its time and the
player's movement, sealed at the end of the game and handed on beside its
summary. The library keeps it ([replay-library.md](replay-library.md)); the
viewer verifies it and plays it back on the engine
([replay-playback.md](replay-playback.md)), so nothing depends on the
generator. All of `js/replay/` is DOM-free apart from the 2D sampler's
browser wiring, the viewer's binder and the 2D viewer's mount.

| File | Responsibility | Detail in |
| ---- | -------------- | --------- |
| `js/replay/format.js` | Replay object, blob layout, encoder, per-version decoders and upgrade steps, sampling intervals, final-state digest. Head comment is the authority for every field. | here |
| `js/replay/recorder.js` | Recorder and sealer: one per game session, game-clock feed, listing fields, movement cap. | here |
| `js/replay/sampler-2d.js` | Classic 2D pointer and cursor sampler; `mountSampler2D` browser wiring. | [replay-samplers.md](replay-samplers.md) |
| `js/replay/sampler-3d.js` | 3D camera and view-mode sampler. | [replay-samplers.md](replay-samplers.md) |
| `js/replay/library.js` | Replay library: only writer of the blob store and `replays.library`. | [replay-library.md](replay-library.md) |
| `js/replay/simulator.js` | Replay played on the engine, seeking with snapshots; `openReplay`. | [replay-playback.md](replay-playback.md) |
| `js/replay/verify.js` | Verifier against the check values. | [replay-playback.md](replay-playback.md) |
| `js/replay/clock.js` | Playback clock. | [replay-playback.md](replay-playback.md) |
| `js/replay/viewer.js` | Replay viewer screen and the `#replay` binder. | [replay-playback.md](replay-playback.md) |
| `js/replay/viewer-2d.js` | 2D viewer: read-only board view, recorded pointer and cursor. | [replay-playback.md](replay-playback.md) |
| `js/replay/viewer-3d.js` | 3D viewer: recorded camera and view mode. | [replay-playback.md](replay-playback.md) |

Wiring: the sessions own their recorder and the modes their sampler
([classic2d-session.md](classic2d-session.md), [classic2d-mode.md](classic2d-mode.md),
[mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md)); the sealed replay travels on the mode contract's
`finished` and `abandoned` reports and the pause controller's hand-offs to the results flow,
which adds it to the library once its summary is recorded ([app-shell-results.md](app-shell-results.md)).
`js/main.js` builds the one library (`REPLAYS`) and the one viewer
(`REPLAY_VIEWER`).

## PUBLIC API

`js/replay/format.js`
- A replay is `{header, actions, movement, check}` (fields in the head
  comment). `header.profile` is `{id, version}` — a 3D replay carries
  `minesweeper-3d` version 1 or 2; `header.pauses` the game's pause spans;
  `movementEndedAt` the time a capped movement stream stopped, or null.
  `sampleIntervalMs` exists on a decoded replay only.
- `REPLAY_FORMAT_VERSION` (2), `ACTION_KINDS` (the engine's `CLICK_KINDS`),
  `MOVEMENT_TYPES` (`sample`, `cursor`, `view`), `SAMPLE_ARITY` (`square`
  2, `box` 5).
- `sampleIntervalMs(version, mode)` → ms (2D 50, 3D 100), `undefined` for an
  unknown version.
- `encodeReplay(replay, {version?})` → `Uint8Array`; `version` 1 writes an
  old body for tests.
- `decodeReplay(blob)` → the replay at the current version; throws
  `ReplayNewerVersionError` or `ReplayUnreadableError`.
  `createReplayDecoder({current, decoders, upgrades})` underlies it.
- `cellStateDigest({revealed, flagged, hidden})` → 32-bit FNV-1a.

`js/replay/recorder.js`
- `MOVEMENT_CAP_BYTES` — 2 MB.
- `startRecording({mode, graph, board, profile}, {onFailure?,
  movementCap?})` → recorder: `boardArrived`, `action(kind, cell, time)`,
  `sample`, `cursor`, `view`, `seal(summary, final, pauses?)` → `{blob,
  listing}` or null, `stats()`, `failed`.
- The listing: `{id, boardKey, mode, outcome, elapsedMs, bbbvPerSecond,
  efficiency, endedAt, size, code?}` — `boardKey` the summary's board (a
  daily game's Daily board, `daily:…`, while the header keeps the plain
  board it was played on, which the seal compares), `code` the game's board
  code ([records-board-code.md](records-board-code.md) `codeOf`) when the summary carries what it
  needs.

## INTERNAL PATTERNS

- **The blob.** `'MSRP'`, the format version, the body, then a CRC-32.
  LEB128 varints, delta-coded times, cells and samples. Uncompressed — a
  compressed body would be a new format version.
- **Versioning.** The envelope never changes, so the checksum is verified
  and a newer version recognised before the body is read; a damaged blob is
  never taken for a newer one. A new version adds a decoder (`DECODERS`), an
  upgrade step (`UPGRADES`) and its intervals (`SAMPLE_INTERVALS_MS`), never
  edits an old one; a replay keeps the interval it was recorded at.
- **The game clock.** Every time is the session timer's elapsed time,
  floored; it runs through pauses, recorded in `header.pauses`. A backwards
  time is held at its stream's previous time.
- **What is recorded.** Every action handed to the engine while the game
  accepts actions, including those that change nothing. Samplers go through
  the session's `recordSample` / `recordCursor` / `recordView`, which record
  only while the game is started, unpaused and unfinished.
- **Typed buffers.** Events live in doubling typed arrays, so recording
  allocates nothing per event. A sample, cursor or view equal to the last is
  not stored; the cursor stream opens with -1.
- **The movement cap.** The first movement event past the cap sets
  `movementEndedAt`; the rest is actions only. Actions are never dropped.
- **Sealing.** Check values come from the summary plus the final-state
  digest; a null summary seals to null; sealing again returns the same
  object.
- **Failure never interrupts play.** Any error drops the replay, is
  reported once through `onFailure` and turns later calls into no-ops; the
  summary goes on without a replay.
- **Determinism.** The action stream applied to the header's graph, mines,
  profile and rules version reproduces the check values exactly;
  `tests/fixtures/replays/` keeps older builds' replays reproducing.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — format, capture, sampling, size limit, sealing, determinism, failure,
  the measured recording constants.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  format versions on every saved file; the engine keeps every rules version.

## CROSS-REFERENCES

- [replay-samplers.md](replay-samplers.md) — the 2D and 3D movement samplers.
- [replay-library.md](replay-library.md), [replay-playback.md](replay-playback.md).
- [engine.md](engine.md) — `CLICK_KINDS`, rule profiles and versions, the
  state arrays the digest reads.
- [records.md](records.md) — board identity, `boardKey`, the summary record.
- [classic2d-session.md](classic2d-session.md), [classic2d-mode.md](classic2d-mode.md),
  [mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md) — the sessions' recorders and the modes' samplers.
- [app-shell.md](app-shell.md), [app-shell-pause.md](app-shell-pause.md) — the replay on the mode
  contract and hand-offs; [app-shell-3d.md](app-shell-3d.md) — the frame loop that ticks the 3D sampler.
- [testing.md](testing.md) — `tests/replay-format`, `-recorder`, `-2d`,
  `-3d`, `-determinism` and `-handoff.test.mjs`, `tests/fixtures/replays/`,
  `dev/measure-replays.mjs`.

## WHEN TO READ THE SOURCE

- Changing the blob layout or a field: add a format version — a decoder and
  an upgrade step in `format.js` — after reading its head comment and
  `readBodyV1`. Fixtures stay at their version; add a fixture or a
  round-trip test for the new one.
- Changing a sampling interval, a quantisation step, the movement cap or
  compression: re-run `node dev/measure-replays.mjs` and read its head
  comment. The current version's intervals in `format.js` must equal the
  samplers' `SAMPLE_INTERVAL_MS` (`tests/replay-format.test.mjs`), so a new
  interval comes with a new format version.
- Changing what a session records or when: the recording paragraph in the
  head comment of `js/classic2d/session.js` or `js/mode3d/session.js`.
- A determinism failure: `tests/replay-determinism.test.mjs` and the
  fixture's entry in `tests/fixtures/replays/index.json`.
