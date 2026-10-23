# The design changelog

Authority for: reading the changelog, the shape of an entry, selecting the
entries a run catches up, and folding them into one change set. Read at steps
2 and 3.

---

## Reading

The changelog is a Claude Docs document: its content lives in the Claude Docs
service, never in the artifact's published files.

1. `read` it with the Claude Docs connector, `ref {"object":"project","id":"<id>"}`,
   where `<id>` is the artifact's Docs id (an Artifact `read` of the link names
   it); the result lists its tabs.
2. `read` the changelog tab's content node (`ref {"object":"node","id":"<node>"}`,
   `container {"kind":"project","id":"<id>"}`). The whole document comes back
   as one tree; nothing else is read from it.

## The entry

The document opens with a title, a byline and a paragraph of conventions,
then the entries, newest first. Each entry is:

- a level-2 heading `<YYYY-MM-DD HH:MM> — <title>` — the entry's identity,
  whole;
- three labelled bullets: **Screens / components**, **Themes**, **Design
  refs** (the canvas link and the artboards and components it names);
- a summary paragraph — what changes and why, and which earlier entries it
  supersedes or corrects;
- **Specification** and its bullets, one point each.

The level-2 heading whose timestamp is literally `YYYY-MM-DD HH:MM` is the
template, never an entry. A level-2 heading in another shape is reported in
*For the record* and skipped.

Entries are never edited once logged: a correction is a newer entry that says
what it supersedes or corrects. The skill relies on it — a caught-up entry is
never read for changes again.

## Selecting

The selection is every entry that is:

- at or after the floor — `since=` when given, else the ledger's `Since:`
  (`./ledger.md`); timestamps compare as written, so several entries sharing
  one minute are all in or all out;
- not in the ledger's caught-up set, compared by the whole heading.

Beside the selection, the run carries the ledger's open set and pending specs
into step 4: an open question is asked again at the gate, a pending spec gets
its catch-up step (`./routing.md` § *The plan*).

## Folding

Walk the selection oldest first, splitting each entry into points — one per
Specification bullet — and apply each newer entry onto the points so far:

- **Superseded** — a newer entry's summary or bullet that names an earlier
  entry by its time ("supersedes the main menu header of the 13:13 and 15:02
  entries", "corrects the 15:02 entry", "superseded by the 18:08 entry")
  replaces the points it names. The older point leaves the change set and is
  reported in *For the record* with the entry that superseded it. A bullet
  that only says it was superseded ("Window head and title: superseded by the
  18:08 title bar entry") is no point of its own.
- **Restated** — a bullet that says a point stays "as the 13:13 rule" or
  "unchanged" adds nothing; the earlier point carries it.
- **Earlier entry already caught up** — a superseding point whose earlier
  entry is in the ledger is an ordinary point: it changes what that entry
  planned or built, and `./routing.md` routes it like any other.

Then set aside, never plan:

- **In review** — a bullet that says the change is next, in review, or
  logged once confirmed. It is listed at the gate and recorded under `Open:`;
  the confirming entry, when logged, brings it in.
- **Open question** — a bullet that leaves a decision open ("Open question:
  whether …"). It becomes a gate question; answered, it is a point; left open,
  it is recorded under `Open:`.

Every remaining point carries its entry's heading, its **Themes** and its
**Design refs**, word for word: the documents and tasks the owners write cite
the canvas and the artboards from them, so the implementer reads the values
there.
