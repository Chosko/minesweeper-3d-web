# The quick path

Read when `--quick` was passed. It replaces steps 4–6 and 8 of `../SKILL.md`:
the selected entries are implemented now, one `/quick-implement` run each,
and the documentation follows later, when a run without `--quick` catches up
the specs they leave.

`--quick` runs only because the user asked for it in their own words.
`--quick` with `--no-commit` stops before step 1 with
`--quick commits each change as /quick-implement does; drop --no-commit.`

---

## Planning

- **One change per entry.** Each selected entry's points that survived the
  fold are one `/quick-implement` change. An entry whose points all routed
  `none` by `./routing.md` § *Routes* is recorded only.
- **The change text** — the entry's heading, its points in the entry's
  words, and its **Design refs**, followed by: *Exact values come from the
  canvas: read the named artboards as data, as
  `../../theme-implement/references/reading.md` § Reading reads them.* When
  `./routing.md` § *Locating* names one feature document for the entry, the
  run passes it as `feature=<slug>`.
- **Order** — oldest entry first, so a later entry builds on an earlier one.
- Open questions and points in review are set aside exactly as
  `./changelog.md` § *Folding* says; an entry with an unanswered question
  that its other points depend on is left out whole and stays uncaught.

## The gate

`../SKILL.md` step 5's gate, with one sentence per entry: what the change
does and that it is implemented and committed now, its documentation caught
up later. The reply grammar is the same; `runbook` does not apply.

## Running

- Run `/quick-implement "<change text>" [feature=<slug>]` per entry, in
  order, with the run's policy flag. Each run holds its own spec
  conversation, drift check and gate, and makes its own commit holding the
  change and its spec.
- **Too big.** A `/quick-implement` that stops at its gate because the spec
  is too big for one commit leaves that entry uncaught: the run goes on with
  the next entry, and the report names the entry with
  `/design-catch-up` (without `--quick`) as the way to plan it.
- **Any other stop** — the user answers `stop`, a test cannot pass — ends the
  sequence there; the entries already committed stay committed.

## The ledger and its commit

Step 7 records each implemented entry with the route `quick` and its spec
path, and the entries left uncaught get no record. The ledger is then
committed alone — `Record the quick catch-up of <n> design changelog
entries` — and pushed per `../../task-engine/references/commit.md`.

The report's *Follow-ups* names the next step: `/design-catch-up`, whose plan
starts with one `/pipeline-revise --catch-up <spec>` per spec this run left
(`./routing.md` § *The plan*, step 1).
