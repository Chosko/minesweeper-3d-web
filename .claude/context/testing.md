# Testing — running the suite, tiers, the runner, the affected-tests mapping

## OVERVIEW

Two layers in one suite: Node unit tests for the DOM-free modules, and
Playwright browser checks for what needs WebGL, the DOM or computed styles.
Each test file is self-explanatory; this file covers how the suite runs. The
test files by name prefix, each prefix's context file and the data beside
the tests are [testing-files.md](testing-files.md).

Tiers — the three `CLAUDE.md` § Tasks implementation defines, split on the
test's name alone:
- **fast** — every test not named "…in a browser…";
- **browser** — tests named "…in a browser…" (a test that launches a
  browser carries that name, and no other test does, so a misnamed browser
  test lands in the fast tier);
- **slow** — browser tests whose name starts with the tag `[slow] ` ahead of
  "in a browser": the long controller and focus walks (`shell-pad-walk`,
  `shell-focus-containment`, the menu's controller walk and the router's
  arrow-key walk) and the flavour checks of animation timing, frame counts
  and motion (the menu backdrop's frame count, the 3D loss wave, the flag
  flash, the fixture replays played to the end, the Classic 2D flood's
  frame budget). A functional
  browser check stays untagged. No test name outside the slow tier carries
  the tag, since the runners match it anywhere in a name;
  `tests/affected-tests.test.mjs` pins that every tagged test is a browser
  test.

Running — the scripts under `.claude/external/`; each `cd`s to the repo
root, and an argument starting with `--` passes through to `node --test`. No
`package.json`, no dependencies (Node 22's `node:test`,
`node:assert/strict`). Browser tests run only where a change reaches them:
- `run-fast-tests.sh` — the fast tier over `tests/**/*.test.mjs`, in
  parallel; the regression tool to run after each change.
- `run-affected-tests.sh [path...]` — the tests covering the changed files
  (git's changes against `HEAD`, staged, unstaged and untracked, when no
  path is given): the selected files' fast tests, then their browser tests.
- `run-full-tests.sh [path...]` — a task's full test suite: the whole fast
  tier, then the browser tests `run-affected-tests.sh` would run.
- `run-browser-tests.sh` (every browser test less `[slow]`) and
  `run-slow-tests.sh` (every `[slow]` test) — milestone close only; both
  refuse to run unless `MS3D_ALL_BROWSER=1` is set.

Every script but the fast one ends by `exec`-ing the runner
`run-tests.mjs` in its mode. The runner runs the fast part as one parallel
`node --test`, with no lock, and the browser part as `node --test` with
concurrency 1 and a per-test timeout, so browser test files run strictly one
after another, all on ONE Chromium the runner launches and closes. Before
launching it the runner takes the machine-wide browser lock — a directory
under `%LOCALAPPDATA%` (else the temp directory) holding the owner's pid,
shared by every worktree and agent of the user, reclaimed when its pid is
dead — and waits for it, so one browser run at a time runs on the machine.
The Chromium never outlives its run: the runner closes it on exit, a
signal or an uncaught error, stops itself and its test processes when its
parent process dies, and a hard kill of the runner closes Playwright's pipe,
which ends Chromium.

`.claude/hooks/browser-tests-guard.mjs`, a PreToolUse hook on Bash and
PowerShell in `.claude/settings.json`, denies an agent's `node --test` that
may reach a browser test (no file named, a glob or directory, or a browser
test file) unless it skips them (`--test-skip-pattern="in a browser"`), and
the all-browser runs without `MS3D_ALL_BROWSER=1`, naming the script to use.

The affected-tests mapping (`affected-tests.mjs`): a `tests/*.test.mjs`
argument is selected as given; any other path is a changed file, mapped to
every test file whose import closure reaches it (relative static imports and
`import()` calls with a literal path, transitive). Those files run whole,
`[slow]` tests included. Two rules add the files the page loads rather than
a test importing them, run with `[slow]` skipped unless the closure also
reached them: a change to the page shell (`js/main.js`, `index.html`,
`css/**`) selects `SHELL_SMOKE` — the fewest browser files that open every
screen and play a game of each mode to its end — and a change to
`js/render.js` selects `RENDER_SMOKE` — the fewest browser files that draw a
3D game to its end; `affected-tests.mjs` lists both sets, each file holding
a test that runs with `[slow]` skipped.
No file outside `tests/` matches Node's default test patterns, so
a bare `node --test` from the root finds the suite's files.
`tests/affected-tests.test.mjs` pins the scripts, the runner's modes, the
lock, the hook, the mapping and the smoke sets.

## PUBLIC API

None: the scripts under `.claude/external/` and the hook under
`.claude/hooks/` above are the interface.

## INTERNAL PATTERNS

- The conventions every test follows — oracles, seeded randomness, fakes,
  static checks, timing slack — are
  [testing-conventions.md](testing-conventions.md); the browser layer — the
  local server, the browser environment, inputs, `__ms` — is
  [testing-browser.md](testing-browser.md).

## DOMAIN DEPENDENCIES

- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose
  acceptance criteria become the tests.

## CROSS-REFERENCES

- [testing-files.md](testing-files.md) — the test files by name prefix and
  each area's context file, which holds the contracts its tests pin.
- [app-shell.md](app-shell.md) holds `window.__ms`, the surface Playwright
  drives; [testing-conventions.md](testing-conventions.md) the conventions
  and tripwires; [testing-browser.md](testing-browser.md) the browser layer.

## WHEN TO READ THE SOURCE

- A test that trips on an unrelated-looking change: the tripwires in
  [testing-conventions.md](testing-conventions.md) § WHEN TO READ THE
  SOURCE.
- Choosing where a new test goes: [testing-files.md](testing-files.md)
  § WHEN TO READ THE SOURCE.
