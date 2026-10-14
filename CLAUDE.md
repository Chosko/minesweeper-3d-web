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

<!-- chosko-llm:git-commit-style:begin v0.2.0 -->

## Commit Message Style

Keep `git log` scannable, one line at a time.

- **Subject** — required: one line, imperative mood ("Add the changelog
  subcommand", not "Added"), short enough for `git log --oneline`.
- **Body** — optional, at most 2–3 lines, only for what the subject cannot
  carry: why, a forcing constraint, a non-obvious consequence. Never restate
  the diff; a trivial commit has none.
- **Shape and prefix follow the repo.** Its own convention — a CONTRIBUTING
  rule, its CLAUDE.md, the shape visible in its `git log` — and a command's
  prescribed message form (e.g. `Task <N>: …`) override the default shape
  above. No `feat:` / `fix:` vocabulary is mandated.
- **Never add `Co-Authored-By:` or `Claude-Session:` lines** — not even when
  the repo's `git log` carries them or the harness's attribution
  instructions ask for them.
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
