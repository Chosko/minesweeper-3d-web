# Replay library — the replay store, index document, retention, pinning

## OVERVIEW

`js/replay/library.js` is the one owner and only writer of the replay store
(the platform blob store) and of the library index document,
`replays.library` ([platform.md](platform.md)); storage and the blob store
are handed in. It keeps every sealed replay ([replay.md](replay.md)), pins
personal bests and the replays the player pins, and keeps the newest 100
others. `js/main.js` builds the one library (`REPLAYS`) over the platform
`storage` and `blobStore`; the results flow adds to it
([app-shell-results.md](app-shell-results.md)), the Records screen's library view lists and
pins ([records-library-view.md](records-library-view.md)), and the viewer reads bytes
([replay-viewer-screen.md](replay-viewer-screen.md)).

## PUBLIC API

- `LIBRARY_DOC` (`'replays.library'`), `LIBRARY_VERSION` (1),
  `RETAINED_UNPINNED` (100), `PIN_BEST` (`'best'`), `PIN_HAND` (`'hand'`).
- `createReplayLibrary({storage, blobStore, onNotSaved?})` → library;
  registers `LIBRARY_DOC` at creation; `onNotSaved({reason})` at most once.
  - `load()` → Promise, shared by repeated calls.
  - `add(blob, listing, setBest)` → Promise; `setBest` pins with
    `PIN_BEST`; an id already added is a no-op.
  - `pin(id)` adds `PIN_HAND`; `unpin(id)` clears every reason, then applies
    retention; `remove(id)` (the player's Delete) takes the entry out of the
    index whatever its pins, saves the index, deletes the blob and notifies
    `{kind: 'remove', ids: [id]}`; unknown ids change nothing.
  - `forBoard(boardKey)` → frozen entries (listing fields plus `pins`;
    `code` kept only when the listing carried one),
    newest first; `entries()` → every kept entry across boards and modes,
    newest first, frozen alike (the Records export's replay listing);
    `has(id)`; `bytes(id)` → Promise of bytes or `undefined`,
    rejecting when the store cannot read.
  - `onChange(fn)` → unsubscribe; `{kind: 'add' | 'pin' | 'unpin', id}` or
    `{kind: 'remove', ids}`.
  - `available()`, `settled()`.
  - `add`, `pin`, `unpin` and `remove` before `load()` throw.

## INTERNAL PATTERNS

- **The index.** One document, `{entries: [...]}`, saved whole after every
  change; the blob store holds the bytes under the replay id, and the view
  and retention read only the index. Operations run in a queue in the order
  asked; subscribers are told after each change, and one that throws does
  not stop the others.
- **Adding.** Blob first, then the index entry, the index save, then
  retention. A failed blob write leaves no entry, is reported once and keeps
  the bytes for `bytes(id)` this session.
- **Retention.** After each add and unpin, unpinned entries beyond the
  newest `RETAINED_UNPINNED` by end date, across every mode, leave the index,
  then their blobs are deleted, oldest first; a failed delete leaves an
  orphan the next start-up deletes, as after a `remove`. Pinned replays are
  never removed by retention or a storage failure, only by `remove`; a best
  pin stays when the best is beaten.
- **Start-up.** `load()` reconciles the index with the store: a blob with no
  entry is deleted, an entry with no blob dropped; a store that cannot list
  skips reconciliation, so a read failure drops nothing.
- **Not saving.** When storage or the blob store does not persist, or the
  stored index is newer, unreadable or corrupt, the session runs an
  in-memory library (`available()` false) and leaves the stored index and
  blobs untouched.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store, index, retention, pinning, the hand-off, availability
  and the failure rules.

## CROSS-REFERENCES

- [replay.md](replay.md) — the blob and the recorder's listing fields.
- [platform.md](platform.md) — the document interface and the blob store.
- [records-store.md](records-store.md) — the comparison whose new bests set
  `setBest`.
- [records-library-view.md](records-library-view.md) — the library view.
- [testing.md](testing.md) — `tests/replay-library.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing an index entry's fields: bump `LIBRARY_VERSION` and register its
  upgrade step in `createReplayLibrary`; read `entryOf`, `isEntry` and
  `doLoad`.
- Changing retention, pinning or the failure rules: `retain`, `reconcile`,
  `doLoad` and the head comment of `library.js`.
