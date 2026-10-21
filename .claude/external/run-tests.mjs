// The test runner behind the run-*.sh scripts, except the fast tier's.
//
//   node .claude/external/run-tests.mjs <affected | full | browser | slow> [path...] [--node-test-flag...]
//
// Each mode is a fast part and a browser part. The fast part (tests not named "in a browser") runs
// as one parallel `node --test`, with no lock. The browser part takes the machine-wide browser lock
// (one browser run on the machine at a time, waiting for it), launches ONE Chromium, runs its test
// files strictly one after another (`--test-concurrency=1`), each connecting to that Chromium
// through tests/helpers/browser.mjs, then closes it. The Chromium dies with this process: on exit,
// on a signal, on an uncaught error, and when the parent process dies; a hard kill closes its pipe.
//
//   affected — the files affected-tests.mjs selects for the paths (git's changes when none): their
//              fast tests, the browser tests of the closure-reached files, [slow] included, and the
//              rule-selected files' browser tests less [slow].
//   full     — the whole fast tier, then the affected browser part: a task's test run.
//   browser  — every browser test less [slow]; refused unless MS3D_ALL_BROWSER=1 (milestone close).
//   slow     — every [slow] test; refused unless MS3D_ALL_BROWSER=1 (milestone close).
//
// An argument starting with `--` passes to every `node --test`; any other is a path.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changedFiles, isBrowserTest, selectRuns, testFiles } from './affected-tests.mjs';

export const BROWSER_NAME = 'in a browser';
export const SLOW_TAG = '\\[slow\\]';
export const TEST_TIMEOUT_MS = 180000;
export const ALL_BROWSER_OPT_IN = 'MS3D_ALL_BROWSER';
const POLL_MS = 2000;

const SERIAL_FLAGS = ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`];
const BROWSER_FLAGS = [...SERIAL_FLAGS, `--test-name-pattern=${BROWSER_NAME}`];
const FAST_FLAGS = ['--test', `--test-skip-pattern=${BROWSER_NAME}`];
const isSlowFile = (file, root) => readFileSync(join(root, file), 'utf8').includes('[slow]');

/**
 * The `node --test` argument lists a mode runs: `fast` (one list or null) and `browser` (lists run in
 * turn on one Chromium), or `refuse` with the reason.
 */
export function planRuns(mode, args, root, env = process.env, changed = changedFiles) {
  const flags = args.filter((a) => a.startsWith('--'));
  const paths = args.filter((a) => !a.startsWith('--'));
  const browserFiles = (files) => files.filter((f) => isBrowserTest(f, root));
  const affectedBrowser = (runs) => {
    const lists = [];
    const full = browserFiles(runs.full);
    const smoke = browserFiles(runs.smoke);
    if (full.length) lists.push([...BROWSER_FLAGS, ...full, ...flags]);
    if (smoke.length) lists.push([...BROWSER_FLAGS, `--test-skip-pattern=${SLOW_TAG}`, ...smoke, ...flags]);
    return lists;
  };
  if (mode === 'affected' || mode === 'full') {
    const runs = selectRuns(paths.length ? paths : changed(root), root);
    const fastFiles = mode === 'full' ? testFiles(root) : runs.full;
    return {
      fast: fastFiles.length ? [...FAST_FLAGS, ...fastFiles, ...flags] : null,
      browser: affectedBrowser(runs),
    };
  }
  if (mode === 'browser' || mode === 'slow') {
    if (env[ALL_BROWSER_OPT_IN] !== '1') {
      return { refuse: `run-${mode}-tests.sh runs every browser file: milestone close only, with ${ALL_BROWSER_OPT_IN}=1 set. `
        + 'For a change, run .claude/external/run-affected-tests.sh (its tests) or run-full-tests.sh (the fast tier and its browser tests).' };
    }
    const all = browserFiles(testFiles(root));
    const list = mode === 'browser'
      ? [...BROWSER_FLAGS, `--test-skip-pattern=${SLOW_TAG}`, ...all, ...flags]
      : [...SERIAL_FLAGS, `--test-name-pattern=${SLOW_TAG}`, ...all.filter((f) => isSlowFile(f, root)), ...flags];
    return { fast: null, browser: [list] };
  }
  return { refuse: `unknown mode "${mode}": affected, full, browser or slow` };
}

// ---------------------------------------------------------------- the machine-wide browser lock

/** Whether a process with this pid is running (EPERM: running, someone else's). */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** The lock directory, shared by every worktree and agent of this user: MS3D_BROWSER_LOCK, else under LOCALAPPDATA or the temp dir. */
export function lockPath(env = process.env) {
  return env.MS3D_BROWSER_LOCK ?? join(env.LOCALAPPDATA ?? tmpdir(), 'ms3d-browser-tests.lock');
}

const readOwner = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Takes the lock for `owner` ({ pid, ... }), or returns who holds it. A lock whose pid is dead, or
 * with no owner written for longer than a few seconds, is stale and reclaimed.
 */
export function tryLock(dir, owner, alive = isAlive) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(dir);
      writeFileSync(join(dir, 'owner.json'), JSON.stringify(owner));
      return { ok: true };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const held = readOwner(dir);
    if (held && alive(held.pid)) return { ok: false, held };
    if (!held) {
      let age = 0;
      try { age = Date.now() - statSync(dir).mtimeMs; } catch { continue; }
      if (age < 10000) return { ok: false, held: { pid: 'unknown' } };
    }
    rmSync(dir, { recursive: true, force: true });
  }
  return { ok: false, held: readOwner(dir) ?? { pid: 'unknown' } };
}

/** Releases the lock if `pid` holds it. */
export function releaseLock(dir, pid = process.pid) {
  if (readOwner(dir)?.pid === pid) rmSync(dir, { recursive: true, force: true });
}

/** Waits for the lock, saying once who holds it. */
export async function acquireLock(dir, owner, { poll = POLL_MS, log = console.error } = {}) {
  let said = false;
  for (;;) {
    const got = tryLock(dir, owner);
    if (got.ok) return;
    if (!said) {
      log(`waiting for the browser test lock ${dir}, held by pid ${got.held.pid}${got.held.cwd ? ` (${got.held.cwd})` : ''}`);
      said = true;
    }
    await new Promise((r) => setTimeout(r, poll));
  }
}

// ---------------------------------------------------------------- running

let child = null;
let browser = null;
let lockDir = null;

/** Stops whatever this run started: the current node --test tree, the Chromium, the lock. Synchronous, so it works on exit. */
function cleanup() {
  if (child && child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  child = null;
  if (browser) {
    try { browser.kill(); } catch { /* already gone */ }
    browser = null;
  }
  if (lockDir) {
    releaseLock(lockDir);
    lockDir = null;
  }
}

function runNode(args, root, env) {
  return new Promise((resolveRun) => {
    child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.on('error', (e) => { console.error(e.message); resolveRun(1); });
    child.on('close', (code) => { child = null; resolveRun(code ?? 1); });
  });
}

async function runBrowserPart(lists, root) {
  lockDir = lockPath();
  await acquireLock(lockDir, { pid: process.pid, cwd: root, start: new Date().toISOString() });
  const { launchSharedBrowser, SHARED_BROWSER_ENV } = await import(pathToFileURL(join(root, 'tests', 'helpers', 'browser.mjs')).href);
  const started = Date.now();
  const shared = await launchSharedBrowser();
  const env = { ...process.env, [SHARED_BROWSER_ENV.runner]: String(process.pid) };
  if (shared.skip) env[SHARED_BROWSER_ENV.skip] = shared.skip;
  else {
    browser = shared;
    env[SHARED_BROWSER_ENV.endpoint] = shared.endpoint;
  }
  const files = lists.reduce((n, l) => n + l.filter((a) => !a.startsWith('--')).length, 0);
  console.error(`browser part: ${files} file(s), one at a time, on ${shared.skip ? `no Chromium (${shared.skip})` : `one Chromium (pid ${shared.pid})`}`);
  let status = 0;
  for (const list of lists) status = (await runNode(list, root, env)) || status;
  if (browser) await browser.close().catch(() => {});
  browser = null;
  releaseLock(lockDir);
  lockDir = null;
  console.error(`browser part: done in ${((Date.now() - started) / 1000).toFixed(1)} s, Chromium closed`);
  return status;
}

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const [mode, ...args] = argv;
  const plan = planRuns(mode, args, root);
  if (plan.refuse) {
    console.error(plan.refuse);
    return 2;
  }
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { cleanup(); process.exit(130); });
  process.on('uncaughtException', (error) => { console.error(error); cleanup(); process.exit(1); });
  process.on('exit', cleanup);
  const parent = process.ppid;
  setInterval(() => {
    if (!isAlive(parent)) { console.error('run-tests: the parent process is gone, stopping'); cleanup(); process.exit(1); }
  }, POLL_MS).unref();
  if (!plan.fast && !plan.browser.length) {
    console.log('no affected tests');
    return 0;
  }
  let status = 0;
  if (plan.fast) status = await runNode(plan.fast, root, process.env);
  if (plan.browser.length) status = (await runBrowserPart(plan.browser, root)) || status;
  return status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
