# The runbook brief

Authority for: the six interview answers `/runbook-create` receives for the
implementation runbook, and the prompt of its final drift-check step.

Read by `../SKILL.md` at RUNBOOK, and when a later task joins the runbook.

---

## Filling it in

| Placeholder | Filled with |
| ----------- | ----------- |
| `{{TITLE}}` | The review's title, as the document's heading gives it. |
| `{{DOC}}` | The repository copy, `docs/<NAME>.md`. |
| `{{DRIFT}}` | The drift report, `docs/<NAME>_DRIFT.md`. |
| `{{CONDITIONS}}` | The conditions of the "Approved scope and work plan" paragraph, one clause each, verbatim. |
| `{{PLAYWRIGHT}}` | The Playwright module path proven at SETUP. |
| `{{DRIVE}}` | The tests that show how the project drives the game: debug hook, faked gamepad. |
| `{{TESTS}}` | The project's full test command. |

## The six answers

The description handed to `/runbook-create --attended` carries these, in
this order:

1. **End state.** Every task of the {{TITLE}} work plan is implemented and
   committed, and `{{DRIFT}}` records how the built game compares with
   `{{DOC}}`.
2. **Steps, in order.** One step per task, in work-plan phase order, titled
   `Implement task N — <title>`, its prompt the bare
   `/task-implement N --review`, with `--rounds 2` for a Large task or one
   the document asks two review rounds of. Then the final step,
   `Check the result against the {{TITLE}}`, whose prompt is below.
3. **Order and edges.** Each step's `Depends on` mirrors its task's
   `Preconditions:`; the final step depends on every task step. One
   `Sequencing:` line names the shared files that make the list order safer
   than the edges alone, and the component later tasks build on, which goes
   first.
4. **Documents to read.** None for a task step: its task body is complete.
   The final step reads `{{DOC}}`.
5. **Do not re-propose.** Everything in the document's "Decisions taken"
   table and "Approved scope and work plan" is settled; list each rejected
   alternative with its id and the option chosen instead.
6. **Needs.** `agent+human` for the step of each Iterative task; `agent`
   for every other step.

The model is the default, `opus`; the runbook carries no `Execution policy:`
line unless the owner asks for one.

## The final step's prompt

````
Audit the implemented game against the {{TITLE}} and write the findings
down. This step reports; it fixes nothing — no code, test, task or
feature-document edit.

Read first: {{DOC}} in full. For navigation in the codebase, read CLAUDE.md
and .claude/context/INDEX.md, then only the context files you need. The
backlog tasks that implemented the review are in .claude/TASKS.md (bodies in
.claude/tasks/<N>.md); each body names the P-nn / I-nn items it closes and
the files it touched, which tells you where to look.

What to check, three groups:
1. Every P-nn and I-nn row that § "Approved scope and work plan" approves
   (its opening paragraph lists the exclusions; everything else numbered is
   approved). For each, compare the implemented game with the row's proposed
   solution and with any decision that bears on it.
2. Every row of the "Decisions taken" table (under § Priorities): does the
   game follow the decision and its stated effect?
3. The conditions in the opening paragraph of § "Approved scope and work
   plan" ({{CONDITIONS}}), and the "What not to break" list under
   § Priorities.

How to check: read the code the relevant tasks touched, and play the build.
Serve the build as static files with `python3 -m http.server <port>` (in the
background) and drive it in headless Chromium with Playwright, imported from
{{PLAYWRIGHT}}, launching Chromium with the args `--use-gl=angle
--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
{{DRIVE}} show how the project drives the game; reuse their patterns. Keep
any scratch scripts out of the repository.

Classify each item as exactly one of:
- implemented as specified;
- implemented with drift — say what differs from the proposed solution or
  decision;
- missing;
- defective — a bug found while checking it, with steps to reproduce.
Also list (a) defects found outside the numbered items, with steps to
reproduce, and (b) every feature document under .claude/domain/ left
inconsistent with what the code does, naming the passage and the behaviour.

Run the project's full test suite (`{{TESTS}}`) and record the result:
pass/fail counts and the names of any failing tests.

Write the report to {{DRIFT}}: a short verdict on top (overall state and the
counts per status), then tables with the columns item, status, evidence
(file:line or the observed in-game behaviour), what to do — one table per
group above, one for the outside defects, one for the inconsistent feature
documents — and the test-suite result. Commit only that file and push the
current branch.

The closing report names the counts per status and the five most important
findings.
````
