# Minesweeper 3D

Interaction policy: unattended

## Navigation

For any task involving the codebase, start by reading
`.claude/context/INDEX.md`. Then read only the context files relevant to your
task. Open source files only when the relevant context file's "When to read
the source" section indicates it is necessary.

For product and domain knowledge — what this product is, how its features
are designed, and why the architecture is what it is — read
`.claude/domain/INDEX.md`, then only the domain files relevant to your task.

## Tasks implementation

Testing policy for /task-implement: full-tdd

This project has a test suite. Always run the tests-first sequence.

<!-- chosko-llm:editing-discipline:begin v0.1.0 -->

## Editing Discipline

A rules document — a CLAUDE.md, a skill or command body, a feature document,
a context file — describes the current state. It is read by whoever comes
next, who needs the rule, not the road to it. Every edit follows these rules.

1. **Supersede.** A changed rule edits the sentence that states it. The old
   sentence goes; it is not kept beside the new one, qualified, or softened.
2. **No history in the body.** No "previously", "now", "no longer", "used
   to"; no dates or task ids as provenance. Git holds the history. The
   exceptions are the artifacts whose job is history: `CHANGELOG.md`, the
   task archive, session handoffs.
3. **State the rule, not the decision.** One reason clause, only when it
   changes how the rule applies. The rest of the reasoning belongs to the
   domain layer, not to the rule.
4. **One rule, one place.** Everywhere else cites it by path. A paraphrase is
   a second copy, and the second copy is the one that drifts.
5. **A rule misread once gets clearer wording**, not more adjectives and not
   a second bullet saying the same thing harder.
6. **A DO NOT bullet that negates a sentence already in the body is deleted.**
   The body already says it.
7. **Edit the section, not the sentence.** Read the whole section and rewrite
   it as if written fresh with the new rule in.
8. **Before finishing an edit**, for each sentence added, ask whether an
   existing sentence now overlaps it, contradicts it, or describes a state
   that no longer holds. If so, merge the two into one sentence carrying the
   whole current meaning. A sentence whose meaning is now fully carried
   elsewhere goes.
9. **A change carries its consequences.** Every passage the approved change
   makes stale is updated in the same edit, whoever owns the file. A new
   decision is never smuggled in as a consequence.
<!-- chosko-llm:editing-discipline:end -->

<!-- chosko-llm:git-commit-style:begin v0.1.2 -->

## Commit Message Style

Write each commit message so that `git log`, read one line at a time, stays
scannable.

**Local style wins.** The rules below are a default shape, not a mandate.
- A repo's own convention overrides them — a CONTRIBUTING rule, its
  CLAUDE.md, or simply the shape visible in its `git log`.
- A command's own prescribed message form overrides them too (e.g.
  task-engine's `Task <N>: …`, `Add task <N>: …`, `task-clean: archive tasks …`).
- The trailer threshold is a default the same way: a repo's own trailer
  convention, whether written down or just visible as an existing
  `Co-Authored-By` habit in `git log`, wins over the numbers below.

**Subject.** Always required; the only part that is.
- One line, imperative mood ("Add the changelog subcommand", not "Added" or
  "Adds").
- Short enough to read whole in `git log --oneline`.

**Body.** OPTIONAL; at most 2–3 lines when present.
- Write one only when it carries something the subject cannot — why the
  change was made, a constraint that forced this shape, a consequence a
  reader would otherwise miss.
- Never restate the diff: the diff is already in the commit.
- On a trivial commit, write no body at all.

**Prefix.** No type-prefix vocabulary is mandated — no `feat:` / `fix:`
requirement. Use whatever prefix convention the repo already uses.

**Trailers — only on big commits.**
- Add `Co-Authored-By: <model>` and `Claude-Session: <url>` only when the
  commit is big.
- "Big" is a size test, not a judgement call: **5 or more files changed, or
  200 or more changed lines (insertions + deletions)**.
- Below that threshold omit both trailers — not "optional", omitted.
- Check it mechanically before committing with `git diff --cached --shortstat`.
<!-- chosko-llm:git-commit-style:end -->

<!-- chosko-llm:tool-usage-policy:begin v0.2.0 -->

## CRITICAL: Tool Usage Policy

When reading, creating, or modifying files, always use the built-in tools
(Read, Write, Edit, MultiEdit) rather than shell commands (PowerShell, bash,
`cat`, `echo >`, `cp`, `mv`, etc.).

Prefer tools over shell for:
- Reading file contents → Read tool
- Writing or overwriting files → Write tool
- Patching files → Edit / MultiEdit tool
- Listing directory contents → LS tool

Use the PowerShell or Bash tool only when a task genuinely requires shell execution
(running a build, executing a test suite, invoking a CLI that has no
equivalent tool).

**IMPORTANT — use the right shell for each tool:** The Bash tool runs bash/sh.
The PowerShell tool runs PowerShell. Never pass PowerShell syntax
(`Get-Content`, `$env:VAR`, `| Select-Object`, etc.) to the Bash tool, and
never pass bash syntax to the PowerShell tool. Match the command syntax to
the tool you are calling.
<!-- chosko-llm:tool-usage-policy:end -->
