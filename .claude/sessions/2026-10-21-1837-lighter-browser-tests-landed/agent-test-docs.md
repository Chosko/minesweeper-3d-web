# Area handoff — test-docs

Owner of the docs that describe running the tests, outside the rules'
authority. The running rules are `.claude/context/testing.md` § OVERVIEW and
`CLAUDE.md` § Tasks implementation (test-harness area); every doc here cites
them by path instead of restating them.

## Files and regions owned

- `README.md` § Tests (the run list and the paragraph under it).
- `.claude/context/testing-browser.md` § PUBLIC API and the "Browser
  environment" bullets.
- `.claude/context/testing-browser.md` § INTERNAL PATTERNS' "What earns a
  browser test" block — the one home of the authoring rules that keep the
  browser tier light (cited by `CLAUDE.md` § Tasks implementation's last
  clause and `testing.md` § WHEN TO READ THE SOURCE).
- `.claude/context/INDEX.md` — the `testing.md` and `testing-browser.md`
  rows' Covers text.
- `.claude/context/testing.md` — the `[slow]` flavour-check list in
  § OVERVIEW's tiers, the smoke sets' descriptions (the lists themselves
  are `affected-tests.mjs`'s), and the prefix rows' browser-test clauses
  (`classic2d-`, `shell-`, `components-`), kept in step with the pruned
  browser tests.
- The test-file lists in § CROSS-REFERENCES of `platform.md`,
  `app-shell-replay.md`, `app-shell-results.md`, `replay-viewer-screen.md`
  — which file holds an area's browser tests.

## State

Both prune passes are reflected in the docs (second pass: commit 5c5f5a2).
Fast tier green.

## Rules

- No test file names and no test counts in these docs (browser test files
  are being pruned by another area).
- `INDEX.md`'s Last updated line marks the code sync of `/context-update`;
  a doc-only fix leaves it.
- `docs/UX_REVIEW_DRIFT.md` is a dated review record: its run figures
  (`concurrency 2`, test counts) describe that run and stay.

## Verification

`bash .claude/external/run-fast-tests.sh` — must pass (`shell-menu` pins a
README sentence).
