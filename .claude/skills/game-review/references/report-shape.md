# The report shape

Authority for: the review document's skeleton and sections, the row formats,
the numbering rules, the player-path table, the decisions tables, the
approved-scope paragraph, the work-plan columns and the repository copy's
header.

Read by `../SKILL.md` when the document opens, and at MERGE, OWNER'S
FINDINGS, DECISIONS and REPOSITORY COPY.

---

## Skeleton

The document opens with this skeleton, before any review work:

- **Title** — the game's name and the review's: `Minesweeper 3D UX Review`.
- **Byline** — the date and the owner: `Oct 11, 2026 · @owner`.
- **Lead** — one paragraph: what was reviewed, from the player's side only,
  naming the surfaces; then `Problems are numbered P-nn and improvements I-nn
  so each can become a task.`
- **One pending section per area**, in this order:
  1. At a glance
  2. First run and main menu
  3. `<Mode> play`, one section per mode
  4. Input methods
  5. Results, records and replays
  6. Settings, accessibility and presentation
  7. Improvements beyond fixes
  8. Priorities

A game without one of these surfaces drops its section. *Approved scope and
work plan* is added at DECISIONS, last.

## Area sections

Each opens with a one-paragraph verdict: what works, then what fails. The
tables a finding rests on follow, when there are any, with units in the
column names (a per-preset table of measured distributions, for instance).
Then the problem table:

| # | Problem | Severity | Who | Proposed solution |
| --- | --- | --- | --- | --- |

- **Problem** — the behaviour as played, with the measured numbers. More than
  one reviewer saw it: say how many. Only read, never observed: say so.
- **Severity** — `Blocker`, `Major` or `Minor`, as the brief in
  `./reviewer-brief.md` defines them.
- **Who** — the player paths it hits.
- **Proposed solution** — concrete and player-facing. When two are viable,
  give both: the second as `If <condition>, <alternative>.`

## Improvements beyond fixes

Opens with: `These are not repairs; they are the experiences the reviewers
would add, each tied to the player path it serves.` Then:

| # | Improvement | Player path | Why it matters | Sketch | Effort |
| --- | --- | --- | --- | --- | --- |

Effort is `Small` (a day or two), `Medium` (a week) or `Large` (more), with
`after I-nn` when it builds on another.

## At a glance

Written last, from the sections above:

1. One sentence of verdict.
2. The panel: reviewers by role, games played, viewports, devices, inputs and
   themes; what matched the references; what was not observed, and that
   browser timings are upper bounds.
3. `Five themes carry most of the weight:` — five numbered themes, each a
   bold claim and the evidence behind it.
4. The player-path table.
5. The counts: `Problems are numbered P-01 to P-nn …, improvements I-01 to
   I-nn …`, and the number of decisions they raised.

The player-path table has one row per path the roles walked: a new player
per mode and input, an enthusiast per mode, controller only, keyboard only,
touch, returning player, theme and accessibility needs.

| Player path | Reaches play? | First thing that breaks | Fix first |
| --- | --- | --- | --- |
| New player, Classic 2D, mouse | Yes, 2 clicks | Esc shows 3D controls | P-01, P-05 |
| Keyboard only | 2D yes, 3D no | No key to look, reveal or flag in 3D | P-40 |

*Fix first* lists ids, the most blocking first.

## Numbering

- Problems are `P-nn`, improvements `I-nn`, work-plan rows `W-nn`, decisions
  `1` to `n`. Two digits; three past 99.
- The first merge numbers problems in section order, top to bottom, and
  improvements in their table's order.
- Ids are stable. A later row takes the next free number of its kind and sits
  in the section it belongs to, so a section's numbers need not run on. A
  dropped item keeps its number and its row. No number is reused.
- Text cites ids, never positions.

## Owner's findings

A note the owner adds is written as a finding, in the reviewers' voice and the
row format above, with no attribution. A note overlapping a row extends that
row's solution. The counts in *At a glance* follow, and a theme or a
player-path row changes when the note changes it.

## Priorities

1. **Lead** — which quadrant is the first batch, and how many of its items
   need no decision.
2. **Impact-by-effort map** — a 2×2 of impact (high, low) by effort (small,
   large), every P and I placed by quadrant, items that need a decision in
   the accent colour. `Position within a quadrant is approximate; the
   quadrant is the claim.` In Docs it is a drawing; in a Markdown home, a
   2×2 table of ids.
3. **Recommended first batch** — the no-decision items of the top-left
   quadrant and the one-line polish items; then `As soon as decisions … land:`
   and `Projects next:`.
4. **Decisions needed** — a numbered list: the question, the options, the
   recommendation, the items it affects. At DECISIONS it becomes *Decisions
   taken*:

   | # | Question | Decision | Effect |
   | --- | --- | --- | --- |
   | 3 | Right-click on a number: keep flag-all or gate it on certainty? | Measured: … Decision: keep flag-all; … | P-21 proceeds as undo-last-batch plus visibility |

   *Effect* names each item and what happens to it: `P-19 dropped`,
   `P-21 proceeds as …`. A measured answer states its numbers.
5. **What not to break** — one paragraph, from the reports' *What works well*.

## Approved scope and work plan

Opens with one paragraph: `Everything numbered is approved except: <id>
(<reason>), …`, then each condition, verbatim from the decisions:
`<id> is built as …, never as …`.

The work plan follows, one row per backlog task:

| Task | Closes | Area | Size | Order and notes |
| --- | --- | --- | --- | --- |
| W-01 Mode-aware help and first-use hints · task 119 | P-01, P-02, I-17 | Shell | Medium | Phase 1, first: one bindings component … |
| W-21 Learn 3D guided board · task 153 | I-01 | 3D | Medium | Phase 3, after W-01 and W-17 |

- **Task** — `W-nn <title>`, and ` · task N` once the task is written.
- **Closes** — the P and I ids.
- **Area** — the part of the game: shell, a mode, input, results, Records,
  generation.
- **Size** — `Small`, `Medium`, `Large`, or `Iterative` for attended work
  accepted one iteration at a time.
- **Order and notes** — the phase, then `after W-nn` for each precondition,
  then a short scope note carrying any condition that bears on the row.

Grouping: items that change the same screen or component share a row; a
component later rows build on goes first in phase 1; an iterative item has a
row of its own.

The section closes with one line per phase, then where the tasks live and the
runbook that runs them: its id, name and path.

## Repository copy

`docs/<NAME>.md` exported from a Docs home starts with this comment:

```
<!-- Exported from the living document <url> (the review's home; edits land there first). The impact-by-effort map under Priorities is a drawing that does not export; its placements are restated in the work plan's phases. -->
```

A Markdown home is its own copy and carries no comment.
