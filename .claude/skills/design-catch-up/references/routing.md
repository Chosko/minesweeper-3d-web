# Routing the change set

Authority for: where each point lands, its route, the owner sequence the
routes build, and how the sequence runs. Read at steps 4–6 of a run without
`--quick`.

This file decides routes only. What an owner decides by its own rule —
whether an amend is editorial, which tasks go stale, a feature's status, a
task's placement — stays the owner's, and nothing here restates it.

---

## Locating

For each point, from its **Screens / components** bullet and its text:

1. **The documents.** Read `.claude/domain/INDEX.md` and `.claude/FEATURES.md`
   — index lines only — and name the feature documents whose *Covers* row
   holds the screens, components or behaviour the point changes. Open only
   those documents, and in them only the sections the point reaches, to tell
   what they already say. A rule across screens (a button colour rule, a
   kit-wide variant) lands in the feature that owns the kit or the rule and
   in the `product-design.md` section its `Source:` names.
2. **The milestone.** The milestone of each document's feature, from its
   `Source:` line; for a point no feature document covers, the milestone of
   `.claude/domain/product-roadmap.md` whose `Covers:` slices take the
   screens or modes it names, else the active milestone of `.claude/PLAN.md`.
3. **The themes.** A point whose **Themes** bullet names only some themes is
   that theme's look; the other themes keep theirs unless the point says the
   behaviour is shared.

## Routes

Each point takes exactly one route, tested in this order; the first that
matches wins:

1. **`none`** — the documents already state the point and the code is
   expected to do it (a bullet restating shipped behaviour). Recorded only.
2. **`theme`** — the point changes only how a theme draws parts its
   catalogue already has (a colour, a size, a radius, an edge, a timing), and
   the documents already state the behaviour. It becomes one runbook step per
   theme, `/theme-implement <canvas-url> <theme-id>`, which updates the theme
   from its canvas and stops, naming the task needed, when the contract
   cannot express it.
3. **`revise`** — the point changes what an architected feature document
   states or promises, whatever the feature's status: a behaviour, a
   component, a layout rule, a persistence or platform rule, a design rule in
   the section its `Source:` names. It becomes one item of the run's one
   `/pipeline-revise` change set, anchored `feature=<slug>`.
4. **`architect`** — no architected feature covers the point, and its
   milestone (Locating step 2) has architected features: the point is a new
   feature of that milestone. Points that form one separately designable unit
   share one `/architect` run.
5. **`design`** — no architected feature covers the point, and its milestone
   has none yet: the point is design input for a high-level feature not yet
   architected. It becomes one `/pipeline-revise` item anchored on that
   milestone, amending the `product-design.md` section the milestone's
   `Covers:` names, so `/architect` finds it when the milestone is planned.

A point whose route rests on judgement — `theme` against `revise` when the
documents state the behaviour only loosely, `revise` against `architect` when
the point could extend a feature or stand alone — is a gate question with the
two routes as answers and the recommended one first.

Every item handed to an owner carries the point's entry heading and its
**Design refs** word for word, so the documents and tasks it produces cite
the canvas artboards to read the values from.

## The plan

The owner sequence, in this order; a step with nothing to do is not in it:

1. **Pending specs** — one `/pipeline-revise --catch-up <spec>` per pending
   spec in the ledger (`./ledger.md` § *Reading*), oldest first: the code
   already landed, so its documentation comes first.
2. **New features** — one `/architect "<the points, as one feature>"
   <milestone-slug>` per `architect` unit.
3. **Revisions** — one `/pipeline-revise "<numbered change set>"`: every
   `revise` and `design` point, one numbered item each, in fold order, each
   naming its anchor, the change in the entry's words, and its design refs.
   Points of one entry that reach one section stay separate items; the owner
   merges them.
4. **Tasks of new features** — one `/task-add feature=<slug>` per feature
   step 2 wrote.
5. **The plan** — one `/production-plan amend "<place each new feature in its
   milestone, with its dependencies>"` when step 2 ran.
6. **The runbook** — one `/runbook-create design-catch-up-<YYYY-MM-DD>`
   (a `-2`, `-3` suffix when the name is taken) whose steps implement the
   work steps 3 and 4 created: `/task-implement <N> --review` per new task
   and per task left `[STALE]` for reconciliation, in plan order, then one
   `/theme-implement <canvas-url> <theme-id>` per theme a `theme` point
   reaches, last, so the theme reads a canvas whose new parts the tasks have
   built. The gate reply `runbook <id|name>` appends the same steps to that
   open runbook instead (`/runbook-create --append <id|name>`).

Task ids are unknown until steps 3 and 4 run: the plan names them as
`<ids from step 3>`, and step 6's follow-up list is written from the owners'
reports, with the real ids.

## Running

- Run each step as the user would invoke it, with `--no-commit` and the
  run's policy flag, so its own gate is asked exactly as the owner asks it.
  An owner's gate answered `stop`, or an owner that refuses, stops the
  sequence (`../SKILL.md` step 6).
- Record every path each step reports writing. A `/pipeline-revise
  --catch-up` step run with `--no-commit` leaves its spec in place: when the
  step completed, this run's commit deletes it (`git rm -- <spec>`), the
  deletion that catch-up's own commit would have made.
- Never add a step after the gate. What the owners name and no step covers —
  a `/pipeline-revise` closing follow-up left to its report, a reconciliation
  an owner names — goes to the closing report's *Follow-ups*.
