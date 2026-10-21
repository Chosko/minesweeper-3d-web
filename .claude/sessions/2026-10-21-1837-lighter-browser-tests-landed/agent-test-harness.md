# Area handoff — test-harness

Owner of how tests run: the runner scripts, the shared-Chromium runner, the
machine-wide browser lock, the guard hook and the affected-tests mapping.
The rules themselves are `.claude/context/testing.md` § Running and
`CLAUDE.md` § Tasks implementation; this file holds only what an agent
working the area needs beside them.

## Files and regions owned

- `tests/helpers/**` — `browser.mjs` (`browserSuite`, `launchSharedBrowser`,
  `SHARED_BROWSER_ARGS`, `SHARED_BROWSER_ENV`, `NOT_IN_RUNNER`, `serveRoot`,
  `loadPlaywright`), `timing.mjs`, `contrast.mjs`.
- `.claude/external/**` — `run-tests.mjs` (modes, `planRuns`, the lock:
  `lockPath`/`tryLock`/`acquireLock`/`releaseLock`/`isAlive`, cleanup,
  parent watch), `affected-tests.mjs` (`selectRuns`, `SHELL_SMOKE`,
  `RENDER_SMOKE`), the five `run-*.sh`.
- `.claude/hooks/browser-tests-guard.mjs` and its entry in
  `.claude/settings.json` (matcher `Bash|PowerShell`).
- `tests/affected-tests.test.mjs`, `tests/helpers.test.mjs` (the harness's
  own tests).
- `.claude/context/testing.md` § OVERVIEW's running part, and `CLAUDE.md`
  § Tasks implementation's tier list.

## Constants (the code holds the numbers)

- `TEST_TIMEOUT_MS` in `run-tests.mjs` — per-test timeout of browser runs.
- Browser runs: `--test-concurrency=1`; the fast part runs at Node's default.
- `ALL_BROWSER_OPT_IN` = `MS3D_ALL_BROWSER` (value `1`).
- Lock dir `%LOCALAPPDATA%\ms3d-browser-tests.lock` (override
  `MS3D_BROWSER_LOCK`), `owner.json` = `{ pid, cwd, start }`.
- Env handed to test files: `MS3D_BROWSER_WS`, `MS3D_BROWSER_SKIP`,
  `MS3D_RUNNER_PID`.

## Owner rules (from the owner, verbatim intent)

- Make the suite much lighter; ONE Chromium per run, browser files strictly
  sequential on it, never parallel browser tests.
- Browser tests run only when needed, enforced: task runs = fast tier +
  affected browser files; every browser file only at milestone close.
- At most one browser run on the machine at a time.
- Pruning redundant browser tests is a separate area (not this one).

## Rejected / not done

- `--experimental-test-isolation=none` (one process for every file): rejected
  for global-state leakage between files; the runner keeps one process per
  file and shares the browser over Playwright's `launchServer`/`connect`.
- Windows job object for Chromium: not needed — a hard kill of the runner
  closes Playwright's pipe and Chromium exits (verified).
- Per-file launch flags (`browserSuite({ args })`) removed: one browser, one
  flag set.

## Verification recipe

1. `bash .claude/external/run-fast-tests.sh` — must pass.
2. `bash .claude/external/run-affected-tests.sh tests/platform-browser.test.mjs tests/classic2d-view.test.mjs`
   — prints `browser part: N file(s) … on one Chromium (pid X)` and
   `Chromium closed`; count `chrome-headless-shell` before/after (0 → 0).
3. Two runs started together: the second prints `waiting for the browser
   test lock …`.
4. Hook: `node --test tests/shell-menu.test.mjs` in a tool call is denied.
5. Full proof (once, milestone only): `MS3D_ALL_BROWSER=1 bash .claude/external/run-browser-tests.sh`.

## Pitfalls

- Never run the runner's server side under `spawnSync`: Playwright's browser
  server lives on the runner's event loop and a sync spawn hangs every
  connect.
- `--disable-accelerated-2d-canvas` is in `SHARED_BROWSER_ARGS` because 2D
  canvas pixel checks (`classic2d-view`'s rounded corner) differ under
  SwiftShader's accelerated canvas.
- Over a connected browser `download.path()` throws; read a download through
  `download.createReadStream()` (as `records-screen` does).
- A test name containing the literal `[slow]` is picked up by the slow run;
  harness test names avoid it.
- `tests/affected-tests.test.mjs`'s bare-`node --test` walk skips
  `.claude/worktrees/` (other checkouts).
- `render-3d-feedback`'s `[slow]` pulse test ("…a hidden number pulses, then
  stops drawing") fails on this Windows machine at HEAD too, independent of
  the harness.
- Stale references outside this area: `README.md` (test script lines),
  `.claude/context/testing-browser.md` ("share the file's flagged browser"),
  `.claude/context/INDEX.md`'s testing row ("the shell's smoke set").
