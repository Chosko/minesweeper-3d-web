# The task-author brief

Authority for: the brief each task author receives, its placeholders, the
rules the author applies at `/task-add`'s gate, and the author's report.

Read by `../SKILL.md` each time a task author is launched.

---

## Filling it in

| Placeholder | Filled with |
| ----------- | ----------- |
| `{{GAME}}` | The game's name. |
| `{{REPO}}` | The repository's absolute path. |
| `{{BRANCH}}` | The branch checked out, the only one pushed to. |
| `{{DOC}}` | The repository copy, `docs/<NAME>.md`. |
| `{{ROW}}` | The W row's id and title. |
| `{{AFTER}}` | The task numbers of the W rows it depends on, or `none`. |
| `{{ANSWER}}` | On a re-run, the answer to the question that stopped the first run, with the decision it cites; otherwise `none`. |

## The brief

````
# Brief: author one backlog task from the {{GAME}} review

You are a task author for {{GAME}} at `{{REPO}}` (branch `{{BRANCH}}`,
already checked out; never push to another branch). The game director
reviewed the game and the owner approved a work plan; every item is in
`{{DOC}}`. Turn ONE row of that plan, {{ROW}}, into one backlog task by
running this project's `/task-add` command.

Tasks this row depends on: {{AFTER}}.
Answer to an earlier question on this row: {{ANSWER}}.

## Read first

1. `CLAUDE.md`, then `.claude/context/INDEX.md`, then only the context files
   for the areas the row touches. Open source files only when a context file
   says so, or when `/task-add`'s own investigation needs it.
2. In `{{DOC}}`: the W row; every P-nn and I-nn row it closes (problem,
   severity, who, proposed solution); the "Decisions taken" table; the
   "Approved scope and work plan" paragraph and its conditions. These are the
   owner's decisions and are authoritative.

## Then run the command

Invoke the `task-add` skill as:

    /task-add --no-split --attended <description>

Compose `<description>` in prose, from the document:

- the title: the W row's title;
- what must change: each P and I row's problem and its approved solution,
  with the conditions of the decisions and the approved scope applied
  verbatim where they touch this task;
- what is out of scope: items the document dropped or gave to another W row;
- the player it serves;
- `Preconditions:` on the tasks this row depends on, when there are any;
- that the body must cite `{{DOC}}` and the P and I ids it closes, so the
  implementer and the drift check can trace it.

Let the command do its own investigation of files and acceptance criteria.

A row whose size is Iterative is attended work: describe the iteration
protocol — one iteration at a time, the owner looks and gives feedback before
the next — so the command authors a human-in-the-loop task (target
`claude+human`).

## At the command's gate

- **Feature attribution.** Attach the task to the feature whose document
  describes the screen or rule it changes, only when that feature is
  `[PLANNED]` in `.claude/FEATURES.md`; otherwise no feature. Do not stop for
  this.
- **Design-change check.** A diverging point that the "Decisions taken" table
  or the "Approved scope" paragraph settles is settled by prior instruction:
  the gate is confirmation-only, and the body records the agreement as the
  command prescribes, citing `{{DOC}}` (decision number or P/I id). A
  diverging point the document does not settle is a real question: stop with
  nothing written and report it verbatim.
- **Any other open question** the document does not answer: stop with
  nothing written and report it verbatim.

`/task-add` commits and pushes; let it. Apply `CLAUDE.md`'s trailer threshold
mechanically before its commit (`git diff --cached --shortstat`). Run no
other git command that changes state, touch no file the command does not
write, and leave the git index to the command.

## Report back (your final message, short)

- The task number and title, its `Files:`, `Preconditions:`, `Target:` and
  `Feature:`.
- Each design change recorded in the body, one line each, with the document
  row it cites.
- Each question that stopped the run, verbatim, with your recommended answer.
- The commit hash.
````
