---
name: game-review
version: 0.1.0
type: skill
description: Review a game from the player's side with a panel of role-based reviewer agents, merge their findings into one numbered report, take the owner's decisions, and turn the approved items into backlog tasks and an implementation runbook; use it for a full UX pass on a playable build.
requires: skill:interaction-engine, command:task-add, command:runbook-create, skill:pipeline-revise
---

# /game-review
# Global skill: a conversation-scoped review. This session acts as the game
# director: it opens the report document, serves the build, launches one
# reviewer agent per role, merges their reports into numbered problems (P-nn)
# and improvements (I-nn), records the owner's decisions and a work plan
# (W-nn), commits a repository copy, then writes one backlog task per
# work-plan row through /task-add and the implementation runbook through
# /runbook-create. It reads reports, never transcripts or source.
# Usage: /game-review [<report name>] [--roles <a,b,c>] [--model <m>] [--review-only] [--tasks-only]
#        /game-review --off
#        /game-review <any of the above> --attended | --unattended
# Examples: /game-review
#           /game-review UX_REVIEW --roles first-run,game-design,mode-3d
#           /game-review UX_REVIEW --tasks-only

GOAL
Turn a playable build into a review the owner can decide on, and the
decisions into work that later sessions run without this conversation. Every
finding keeps one stable id from the review, through the task that closes it,
to the drift check that verifies it.

---

SUPPORTING FILES (read on demand)

| Read this file | Exactly when |
| -------------- | ------------ |
| `../interaction-engine/references/policy.md` | At ARGUMENTS, to resolve the interaction policy. |
| `../interaction-engine/references/messages.md` | Before the first report, gate or question. |
| `../interaction-engine/references/gates.md` | The policy resolved to `unattended`. |
| `../interaction-engine/references/mode.md` | At PANEL and TASKS, to know whether orchestrate mode is on. |
| `./references/report-shape.md` | When the document opens, and at MERGE, OWNER'S FINDINGS, DECISIONS and REPOSITORY COPY. |
| `./references/roles.md` | At ARGUMENTS to check `--roles`, and at PANEL for each role brief. |
| `./references/reviewer-brief.md` | Each time a reviewer or an analysis agent is launched. |
| `./references/task-author-brief.md` | Each time a task author is launched. |
| `./references/runbook-brief.md` | At RUNBOOK, and when a later task joins the runbook. |

---

ARGUMENTS

- `<report name>` — upper snake case, default `UX_REVIEW`. It names the
  repository copy `docs/<NAME>.md`, the working-material folder
  `docs/<name>/` (lower case, underscores as hyphens) and the drift report
  `docs/<NAME>_DRIFT.md`.
- `--roles <a,b,c>` — role ids from `./references/roles.md`; default every
  role it lists for this game. An unknown id stops the run:
  `Unknown role "<id>". Roles: <ids>.`
- `--model <m>` — the model of reviewer and analysis agents; default `fable`.
  Task authors run `opus`.
- `--review-only` — stop after DECISIONS.
- `--tasks-only` — start at TASKS from an existing report. `docs/<NAME>.md`
  must hold an approved work plan, else the run stops:
  `docs/<NAME>.md has no work plan — run /game-review <NAME> first.`
  REPOSITORY COPY runs first when the living document holds changes the copy
  lacks.
- `--review-only` beside `--tasks-only` stops the run:
  `--review-only and --tasks-only cannot be combined. Pick one.`
- `--off` ends the review (THE REVIEW IS CONVERSATION-SCOPED).
- `--attended` / `--unattended` — per
  `../interaction-engine/references/policy.md`.

---

THE REVIEW IS CONVERSATION-SCOPED

The review spans many owner turns: notes, answers, approvals. From launch to
the closing report, or to `--off`, this session is the director. Any context
summary keeps the line `game review: <NAME>, phase <PHASE>`, so the review
survives compaction. `--off` confirms in one line:
`Game review off — this session works as usual again.` Agents already
launched finish and report; nothing new launches.

---

THE DIRECTOR'S LIMITS

- It reads `CLAUDE.md`, the navigation and domain indexes, the context files
  a brief needs, the review document and the agents' reports. What it needs
  from source or from a screenshot, it asks an agent.
- It writes the review document, its repository copy and the working-material
  README. Everything else is written by a command or an agent.
- It asks the owner at the DECISIONS gate and for real questions, nowhere
  else.

---

SETUP

1. **Open the report document first**, before any review work. With the
   Claude Docs connector available, it is a Docs document made as the
   connector's instructions prescribe, and that document is the review's
   home. Otherwise the home is `docs/<NAME>.md`. Its skeleton is
   `./references/report-shape.md` § *Skeleton*.
2. **Serve the build** in the background:
   `python3 -m http.server 8080` from the folder holding the static build.
   A taken port moves to the next free one, and the briefs carry that URL.
3. **Prove the browser.** Headless Chromium through Playwright, imported from
   `/opt/node-tools/node_modules/playwright/index.js` where the environment
   installs it there, launched with `--use-gl=angle --use-angle=swiftshader
   --enable-unsafe-swiftshader --ignore-gpu-blocklist`. One smoke screenshot
   of the main menu, looked at. A build that does not render stops the run:
   `The build does not render headless: <reason>.`

---

PANEL

- One fresh agent per role, all launched in one message, on `fable` or
  `--model`.
- Each brief is `./references/reviewer-brief.md` filled in, followed by the
  role's section of `./references/roles.md` with its path written against
  this game's screens and modes.
- Each agent works in its own scratch folder and writes `report.md` there.
- The director reads each report whole, and nothing else the agent made.
- An agent that returns no report is relaunched once with the same brief. A
  second failure leaves its area uncovered, and *At a glance* says so.

---

MERGE

- Deduplicate across reports: one row per problem, with the count of
  reviewers who saw it. Observed beats read; a measured number beats an
  estimate.
- Number and write the rows per `./references/report-shape.md`.
- Fill the document one section per call: the area sections, then
  Improvements, then Priorities with the decisions needed, then *At a glance*.
- Then report per `../interaction-engine/references/messages.md` and open
  the DECISIONS gate.

---

OWNER'S FINDINGS

The owner may add notes at any point before TASKS. For each note, per
`./references/report-shape.md` § *Owner's findings*:

1. deduplicate it against the existing rows first;
2. a note overlapping a row extends that row's solution;
3. a new note becomes a new row with the next free number, in the section it
   belongs to, in the reviewers' voice;
4. the counts in *At a glance* follow.

A note that settles a decision goes to DECISIONS. The reply is one line per
row changed or added.

---

DECISIONS — gate: `design`

The owner answers the numbered decisions and marks items fix, don't fix or
conditioned.

- **A claim that needs evidence** goes to an analysis agent (`fable` or
  `--model`), briefed per `./references/reviewer-brief.md` § *The analysis
  variant*. It measures the claim with the game's own engine, generator and
  solver. The director brings the numbers back; the owner decides; the answer
  is recorded in the item's row and in the decisions table.
- **Recorded in the document:** the *Decisions taken* table, the *Approved
  scope* paragraph and the work plan, shaped per
  `./references/report-shape.md`.
- The gate passes when every decision is answered and the owner approves the
  work plan. Under `unattended` the run stops here with the questions.

`--review-only` ends the run here with the closing report.

---

REPOSITORY COPY — gate: `confirmation`

- From a Docs home, export the document to `docs/<NAME>.md` with the header
  comment of `./references/report-shape.md` § *Repository copy*.
- Keep the working material under `docs/<name>/`: one folder per agent with
  its `report.md`, scripts and measured outputs; the common brief as
  `reviewer-brief.md`; a `README.md` saying what is there and that the
  screenshots are not kept, with their count and size.
- Commit the copy before any task is written, so task bodies cite it by path
  and id. Each later change to the document refreshes the copy in a commit of
  its own.

---

TASKS

- Build a launch table in the scratchpad: order, W row, ids closed, context
  files, preconditions, task number. Order follows the phases, and a row
  comes after the rows it depends on.
- One fresh `opus` agent per W row, in launch-table order. The next author
  launches when the previous has reported, because the backlog assigns
  sequential numbers.
- Each brief is `./references/task-author-brief.md` filled in. The author
  runs `/task-add --no-split --attended <description>` and answers its gate
  per the brief.
- Each report's task number goes into the W row and the launch table.
- **A real question** an author reports is answered from the document when
  the owner already decided it, citing the decision. Otherwise it goes to the
  owner with a recommendation, and the other rows continue. The blocked row
  re-runs with the answer and takes the next free number.
- After the last author, refresh the repository copy.

---

RUNBOOK — gate: `confirmation`

- Run `/runbook-create --attended <description>` in from-scratch mode, the
  description carrying the six interview answers of
  `./references/runbook-brief.md`, so the interview is settled.
- The runbook's title names the review and no task range: no command changes
  an index heading.
- A task written later joins with
  `/runbook-create --append <id> --before <final step>`.
- A change to a written task, or to a written step, goes through
  `/pipeline-revise`, which strikes the step and re-inserts its corrected
  copy beside it. When a later task makes the final step's `Depends on`
  grow, the final step is struck and re-inserted the same way.
- The runbook's id, name and path go into the work plan's closing paragraph,
  and the repository copy is refreshed.

---

REPORTING

Every report — after MERGE, at the DECISIONS gate, and at the close — follows
`../interaction-engine/references/messages.md`: outcome first, one bullet per
area, decisions needed flagged. The closing report also lists:

- each judgment call the director made on the owner's behalf, so it can be
  reversed;
- each point an author flagged, with a proposed answer.

---

GATES

Class tags per `../interaction-engine/references/gates.md`.

| Phase | Gate | Class |
| ----- | ---- | ----- |
| SETUP, PANEL, MERGE, OWNER'S FINDINGS | none | — |
| DECISIONS | the decisions and the work plan | `design`: waits under every policy |
| REPOSITORY COPY | each commit of the copy | `confirmation` |
| TASKS | each author's `/task-add` gate | `confirmation` when the document settles every diverging point; otherwise a real question (`gates.md` § *Real decisions*) |
| RUNBOOK | `/runbook-create`'s shape confirmation | `confirmation` |

---

THE BOUNDARY WITH OTHER COMMANDS

- **`/task-add`** owns each task: its investigation, body, gate and commit.
  This skill supplies the description and the rules its author applies at
  the gate.
- **`/runbook-create`** owns the runbook: file, index block, step ids and
  commit. This skill supplies the interview answers.
- **`/pipeline-revise`** owns every change to a written task or runbook step.
- **`/task-implement`** and **`/runbook-run`** carry out the runbook in later
  sessions. This skill implements nothing, and the runbook's final step fixes
  nothing.
- **Orchestrate mode.** When it is on
  (`../interaction-engine/references/mode.md`), the reviewer, analysis and
  author agents stand in for its area agents: briefed by this skill, with no
  area split and no handoff file. `/runbook-create` runs in a fresh subagent
  with its questions relayed. The orchestrator never reads source.

---

NEVER

- renumber an id;
- read a reviewer's transcript;
- let two task authors run at once;
- edit an existing runbook step;
- keep screenshots in the repository;
- decide a design question the owner has not decided, except by citing a
  decision already recorded.
