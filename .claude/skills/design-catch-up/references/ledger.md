# The design ledger

Authority for: `.claude/DESIGN-LEDGER.md` — its shape, how a run reads it and
when a run writes it. Read at steps 1, 2 and 7.

The ledger is the repository's record of which changelog entries it has
caught up with, and how. It is a history artifact: records are appended and
never rewritten, except the header lines below and a record's `Open:` lines
a later run answers.

---

## Shape

```
# Design ledger

Changelog: <claude.ai artifact link of the design changelog>
Since: <YYYY-MM-DD HH:MM>

---

## <entry heading, exactly as in the changelog>

Caught up: <YYYY-MM-DD> — <commit> | uncommitted
Points:
- <point, in a few words> — <route>: <what it produced>
Open:
- <point set aside> — <in review | open question: …>
```

- **`Changelog:`** — the changelog every run reads unless given a URL.
- **`Since:`** — the floor: no entry older than it is ever selected. Written
  by the first run that catches up an entry, from its `since=` argument;
  a later `since=` older than it lowers it, a newer one narrows only that run.
- **A record** — one per caught-up entry, newest first, headed by the entry's
  heading text. That text is the entry's identity: entries are never edited
  once logged, and several entries can share a timestamp, so the whole
  heading — timestamp and title — names one.
- **`Points:`** — one line per point of the entry, the route
  (`./routing.md` § *Routes*) and what it produced: feature documents
  amended, task ids, runbook and steps, a spec path under `--quick`, or the
  entry and point that superseded it.
- **`Open:`** — only when the entry had points set aside; omitted otherwise.

## Reading

- No ledger file, or no `Changelog:` line: the run needs a URL, per
  `../SKILL.md` § ARGUMENT PARSING; step 7 creates the file.
- No `Since:` line and no `since=` argument stops with
  `First run: give since="<YYYY-MM-DD HH:MM>" for the earliest entry to catch up.`
- The **caught-up set** is every record heading.
- The **open set** is every `Open:` line still in the ledger, with its entry.
- The **pending specs** are the spec paths `Points:` lines name under the
  `quick` route whose file still exists under `.claude/specs/`: the
  documentation catch-up of those changes has not run
  (`../../quick-implement/spec.md` § *Its lifecycle*).

## Writing

At step 7 only, after the owner sequence completed:

- set `Changelog:` to the run's changelog, and `Since:` per the rule above;
- add one record per selected entry, newest first, above the older records;
- an open question the gate answered removes its `Open:` line from the record
  that holds it, and the answering run's record names it under `Points:`;
- a pending spec the run caught up keeps its `Points:` line: its deletion from
  `.claude/specs/` is the record.

A run that stops writes no ledger line, so its entries are selected again by
the next run.
