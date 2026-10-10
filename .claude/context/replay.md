# Replay — format, recorder and sealer, movement samplers, library

## OVERVIEW

Replay recording and the replay library: every Classic 2D and 3D game that
ends in play — won, lost, or abandoned after its first click — becomes one
compact, versioned binary replay holding the board's mines, the rules
version, every action with its time and the player's movement, sealed at
the end of the game and handed on beside its summary; the library keeps it,
pinning personal bests and the replays the player pins and keeping the
newest 100 others. A replay plays back on the engine, so nothing in it
depends on the generator. All of `js/replay/` is DOM-free, apart from the
2D sampler's browser wiring.

- `js/replay/format.js` — the replay object, the binary blob's layout, the
  encoder, and the decoder `replay-playback` shares: one decoder per format
  version plus the upgrade steps to the current one; the final-state digest.
- `js/replay/recorder.js` — the recorder and sealer: one recorder per game
  session, fed actions and movement on the game clock, sealing to the blob
  and its listing fields; the movement cap.
- `js/replay/sampler-2d.js` — the Classic 2D movement sampler: the pointer
  in board coordinates on a schedule and the keyboard and controller
  cursor's cell, and `mountSampler2D`, its browser wiring.
- `js/replay/sampler-3d.js` — the 3D movement sampler: the camera position,
  yaw and pitch on a schedule and the view mode.
- `js/replay/library.js` — the replay library: the one owner and only
  writer of the replay store (the platform blob store) and of the library
  index document, `replays.library`; retention, pinning, start-up
  reconciliation and the failure rules. Storage and the blob store are
  handed in.

The sessions own their recorder and the modes their sampler
([classic2d.md](classic2d.md), [mode3d.md](mode3d.md)); the sealed replay
travels on the mode contract's `finished` and `abandoned` reports and the
pause controller's hand-offs to the results flow, which adds it to the
library once its summary is recorded ([app-shell.md](app-shell.md)).
`js/main.js` builds the one library (`REPLAYS`) over the platform `storage`
and `blobStore` ([platform.md](platform.md)); the Records screen's library
view lists, pins and unpins its replays ([records.md](records.md)).
Watching them is `replay-playback`.

## PUBLIC API

`js/replay/format.js`
- A replay is `{header, actions, movement, check}`; the module head comment
  is the authority for every field and for the blob layout.
  - `header` — `{id, mode, graph, board, mines, profile, seed,
    generatorVersion, endedAt, movementEndedAt}`: `id` the summary's id,
    `graph` `{kind: 'square', width, height}` or `{kind: 'box', x, y, z}`
    matching the board identity, `mines` ascending cell indices, `profile`
    `{id, version}` (the rule profile and its rules version), `seed` and
    `generatorVersion` for reference only, `endedAt` ISO 8601,
    `movementEndedAt` the game-clock time a capped movement stream stopped,
    or null.
  - `actions` — `[{time, kind, cell}]`, kind one of `ACTION_KINDS`.
  - `movement` — `[{time, type: 'sample', values} | {time, type: 'cursor',
    cell} | {time, type: 'view', mode}]`; a sample holds
    `SAMPLE_ARITY[graph kind]` quantised integers, `cursor` is 2D only and
    `view` 3D only.
  - `check` — `{outcome, elapsedMs, bbbv, bbbvSolved, clicks: {reveal, flag,
    chord: {effective, wasted}}, digest}`.
- `REPLAY_FORMAT_VERSION` (1), `ACTION_KINDS` (the engine's `CLICK_KINDS`),
  `MOVEMENT_TYPES` (`sample`, `cursor`, `view`), `SAMPLE_ARITY` (`square`
  2, `box` 5).
- `encodeReplay(replay, {version?})` → `Uint8Array`; a `RangeError` on a
  replay it cannot write. `version` stamps another version on the current
  body, for the decoder's version tests only.
- `decodeReplay(blob)` — `Uint8Array` or `ArrayBuffer` → the replay at the
  current version; throws `ReplayNewerVersionError` (`storedVersion`,
  `currentVersion`) for a newer blob and `ReplayUnreadableError` for
  anything else it cannot read.
- `createReplayDecoder({current, decoders, upgrades})` — a decoder over a
  set of versions; `decodeReplay` is it over this build's.
- `cellStateDigest({revealed, flagged, hidden})` → a 32-bit FNV-1a of one
  byte per cell (revealed, flagged, hidden as bits 0–2; no `hidden` reads as
  all shown).

`js/replay/recorder.js`
- `MOVEMENT_CAP_BYTES` — 2 MB (2 × 1024 × 1024) of encoded movement.
- `startRecording({mode, graph, board, profile}, {onFailure?,
  movementCap?})` → recorder: `boardArrived({mines, seed,
  generatorVersion})`, `action(kind, cell, time)`, `sample(values, time)`,
  `cursor(cell, time)`, `view(mode, time)`, `seal(summary, final)` →
  `{blob, listing}` or null, `stats()` → `{actions, movement,
  movementBytes}`, `failed`. `final` is the engine game at its end or its
  state arrays.
- The listing is `{id, boardKey, mode, outcome, elapsedMs, bbbvPerSecond,
  efficiency, endedAt, size}`, `size` the blob's bytes.

`js/replay/sampler-2d.js`
- `SAMPLE_INTERVAL_MS` (50), `SAMPLE_STEPS` (64: a value is 1/64 of a cell).
- `boardPoint(layout, scroll, x, y, steps?)` → `[bx, by]`: a canvas
  position in cell units from the board's top-left corner, quantised; off
  the board the values run below 0 or past the board's size.
- `createSampler2D({session, point, interval?})` → `{tick(), cursor(c)}`;
  `point()` → `[bx, by]` or null while no pointer position is known.
- `mountSampler2D({view, session, win?, interval?})` → `{sampler, tick(),
  cursor(c), destroy()}`: the last `mousemove` position over the page, read
  through the board view's canvas rectangle, layout and scroll.

`js/replay/sampler-3d.js`
- `SAMPLE_INTERVAL_MS` (100), `POSITION_STEPS` (16: 1/16 of a cell),
  `ANGLE_STEPS` (8192: 1/8192 of a turn), `VIEW_MODE` (`shift` 1, `space`
  2, `ctrl` 4).
- `cameraSample(camera, {X, Y, Z}, spacing, steps?)` → `[x, y, z, yaw,
  pitch]`: cell `(i, j, k)`'s centre is `(i, j, k)` at any spacing; the yaw
  keeps its whole turns.
- `viewMode({shift, space, ctrl})` → 0..7.
- `createSampler3D({session, camera, controls, spacing, interval?, steps?})`
  → `{tick()}`; `spacing` is a getter.

`js/replay/library.js`
- `LIBRARY_DOC` (`'replays.library'`), `LIBRARY_VERSION` (1),
  `RETAINED_UNPINNED` (100), `PIN_BEST` (`'best'`), `PIN_HAND` (`'hand'`).
- `createReplayLibrary({storage, blobStore, onNotSaved?})` → library;
  registers `LIBRARY_DOC` at creation. `onNotSaved({reason})` is called at
  most once, the first time a blob write or an index save fails.
  - `load()` → Promise, awaited before use; repeated calls share it.
  - `add(blob, listing, setBest)` → Promise; `listing` the recorder's
    listing fields, `setBest` pins with `PIN_BEST`. An id already added is a
    no-op.
  - `pin(id)` adds `PIN_HAND`; `unpin(id)` clears every reason, then
    applies retention; both → Promise, and change nothing for an unknown id.
  - `forBoard(boardKey)` → frozen entries `{id, boardKey, mode, outcome,
    elapsedMs, bbbvPerSecond, efficiency, endedAt, size, pins}`, newest end
    date first; `has(id)`; `bytes(id)` → Promise of the bytes or
    `undefined`, rejecting when the store cannot read.
  - `onChange(fn)` → unsubscribe; `fn` gets `{kind: 'add' | 'pin' |
    'unpin', id}` or `{kind: 'remove', ids}` (oldest first).
  - `available()` → whether replays are saved this session; `settled()` →
    Promise of every queued operation finishing.
  - `add`, `pin` and `unpin` before `load()` throw.

## INTERNAL PATTERNS

- **The blob.** `'MSRP'`, the format version, the body, then a CRC-32 of
  everything before it. Integers are LEB128 varints, signed ones
  zigzag-encoded; times are deltas, cells and sample values deltas from the
  previous event of their kind. Format version 1 is not compressed — a
  compressed body would be a new format version.
- **Versioning.** The envelope is the same for every version, so the
  checksum is verified and a newer version recognised before its body is
  read; a damaged blob is never taken for a newer one. Each version keeps
  its decoder (`DECODERS`), and `UPGRADES[v]` turns a version-v replay into
  v + 1; a new version adds a decoder and an upgrade step, never edits an
  old one.
- **The game clock.** Every time is the session timer's elapsed time,
  floored, so paused time is absent from a replay; a time that runs
  backwards is held at its stream's previous time. Actions before the timer
  starts carry 0 and keep their order.
- **What is recorded.** Every action the session hands to the engine while
  the game accepts actions, including those that change nothing (wasted
  clicks count in efficiency). The sessions call `action` at that point;
  the samplers call the session's `recordSample` / `recordCursor` /
  `recordView`, which record only while the game is started, unpaused and
  unfinished.
- **Typed buffers.** Events live in typed arrays that double when full, so
  recording allocates nothing per event; a sample's values are copied, so a
  sampler may reuse one array. A sample equal to the previous one, a cursor
  cell or view mode equal to the last, is not stored.
- **The movement cap.** The recorder counts the bytes each movement event
  will encode to; the first event past the cap sets `movementEndedAt` to its
  time and the rest of the game is recorded as actions only. Actions are
  never dropped.
- **Sealing.** `seal` closes the streams: the check values are the
  summary's outcome, elapsed time, 3BV, 3BV solved and clicks plus the
  digest of the engine's final state, and the header takes the summary's id
  and end date. A null summary (a game left before its first click) seals to
  null; sealing again returns the same object.
- **Failure never interrupts play.** Any error — bad header fields, a bad
  feed, a summary for another board, a replay that cannot be encoded — drops
  the replay, is reported once through `onFailure` (a console warning by
  default) and turns every later call into a no-op; `seal` then returns
  null and the summary goes on without a replay.
- **The schedule.** Both samplers take a sample once the interval of game
  time has passed since the last, keeping to the schedule across frame
  jitter and starting it afresh after a gap; the 2D cursor and the 3D view
  mode are offered every tick and stored only on a change.
- **Determinism.** Applying the action stream to a game created from the
  header's graph, mine set, profile and rules version reproduces the check
  values exactly; recorded games under `tests/fixtures/replays/` keep a
  replay recorded by an earlier build reproducing.
- **The library index.** One document, `{entries: [...]}`, each entry the
  listing fields plus `pins`, the list of its reasons; saved whole after
  every change. The index says which replays are kept and pinned, the blob
  store holds their bytes under the replay id; the view and retention read
  only the index. Operations run one after another in a queue, in the order
  asked, and subscribers are told after each change; one that throws is
  logged and the others still run.
- **Adding.** The blob is written first, then the index entry, then the
  index saved, then retention applied. A failed blob write leaves no entry,
  is reported once and keeps the bytes for `bytes(id)` this session.
- **Retention.** After each add and unpin, unpinned entries beyond the
  newest `RETAINED_UNPINNED` by end date, across both modes, leave the
  index, the index is saved, then their blobs are deleted, oldest first. A
  blob whose delete fails is an orphan the next start-up deletes. Pinned
  replays are never removed by retention or by a storage failure; a best
  pin stays when the best is later beaten.
- **Start-up.** `load()` reads the index once and reconciles it with the
  store: a blob with no entry is deleted, an entry with no blob dropped and
  the index saved; a store that cannot list skips reconciliation, so a read
  failure drops nothing.
- **Not saving.** When the storage or the blob store does not persist, or
  the stored index is newer than this build, unreadable or corrupt, the
  session runs an in-memory library that saves nothing (`available()`
  false) and leaves the stored index and blobs untouched, so a newer
  build's library and every pinned replay survive.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the format, capture, movement sampling, size limit, sealing, the mode
  contract extension, determinism and failure contracts, and the measured
  recording constants.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store, the library index, retention, best and hand pinning,
  the hand-off, availability and the failure rules.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  format versions on every saved file, and the engine keeping every shipped
  rules version.

## CROSS-REFERENCES

- [engine.md](engine.md) — `CLICK_KINDS`, rule profiles and their versions,
  the game's state arrays the digest reads.
- [records.md](records.md) — the board identity, `boardKey` and the summary
  record a replay is sealed with; the comparison whose new bests pin a
  replay; the Records screen's library view.
- [platform.md](platform.md) — the storage interface the index is a
  document of, and the blob store the replays are kept in.
- [classic2d.md](classic2d.md) — the 2D session's recorder and the mode's
  sampler.
- [mode3d.md](mode3d.md) — the 3D session's recorder and the adapter's
  sampler.
- [app-shell.md](app-shell.md) — the replay on the mode contract, the
  hand-offs, the results flow that adds it to the library, `REPLAYS` in
  `js/main.js`, and the frame loop that ticks the 3D sampler.
- [testing.md](testing.md) — `tests/replay-*.test.mjs`,
  `tests/fixtures/replays/` and `dev/measure-replays.mjs`.

## WHEN TO READ THE SOURCE

- Changing the blob layout or a field: add a format version — a decoder and
  an upgrade step in `format.js` — and read its head comment and
  `readBodyV1` first; regenerate the fixtures only for a new format.
- Changing a sampling interval, a quantisation step, the movement cap or
  compression: re-run `node dev/measure-replays.mjs` and read its head
  comment (how the constants are chosen).
- Changing what a session records or when: the recording paragraph in the
  head comment of `js/classic2d/session.js` or `js/mode3d/session.js`.
- A determinism failure: read `tests/replay-determinism.test.mjs` and the
  failing fixture's entry in `tests/fixtures/replays/index.json`.
- Changing an index entry's fields: bump `LIBRARY_VERSION` and register its
  upgrade step in `createReplayLibrary`; read `entryOf`, `isEntry` and
  `doLoad` in `library.js`.
- Changing retention, pinning or the failure rules: `retain`, `reconcile`
  and `doLoad` in `library.js`, and its head comment.
