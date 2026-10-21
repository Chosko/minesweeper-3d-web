# Area handoff — test-docs

Owner of the docs that describe running the tests, outside the rules'
authority. The running rules are `.claude/context/testing.md` § OVERVIEW and
`CLAUDE.md` § Tasks implementation (test-harness area); every doc here cites
them by path instead of restating them.

## Files and regions owned

- `README.md` § Tests (the run list and the paragraph under it).
- `.claude/context/testing-browser.md` § PUBLIC API and the "Browser
  environment" bullets.
- `.claude/context/INDEX.md` — the `testing.md` row's Covers text.
- `.claude/context/testing.md` — only the `[slow]` flavour-check list in
  § OVERVIEW's tiers and the `components-pause` clause of the `components-`
  prefix row, kept in step with the pruned browser tests.

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
