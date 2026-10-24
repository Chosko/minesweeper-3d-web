// Maps changed files to the test files that cover them, for run-affected-tests.sh.
//
//   node .claude/external/affected-tests.mjs [--full | --smoke] [path...]
//
// Prints one test file per line, repo-relative. A path under tests/ ending .test.mjs is selected as
// given while it exists; any other path is a changed file, selected through every test file whose
// import closure reaches it — static imports and import() calls with a literal relative path. Those
// two are the full group, run with their [slow] tests. The browser tests load the page shell
// (js/main.js, index.html, css/**) and js/render.js through the page rather than by import, so a
// change to the shell also selects the smoke set SHELL_SMOKE, and a change to js/render.js the 3D
// smoke set RENDER_SMOKE; those not in the full group are the smoke group, run with [slow] skipped. --full prints the full group, --smoke the smoke group, and
// no flag both. With no paths, the changed files are those git reports against HEAD: staged,
// unstaged and untracked.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_IMPORT = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1|\bimport\s*(['"])(\.{1,2}\/[^'"]+)\3|\bimport\(\s*(['"])(\.{1,2}\/[^'"]+)\5\s*\)/g;
const BROWSER_TEST = /\b(?:test|it|describe)\(\s*(['"`])[^'"`\n]*in a browser/;
const SHELL = (file) => file === 'js/main.js' || file === 'index.html' || file.startsWith('css/');
const RENDERER = 'js/render.js';

/**
 * The shell's smoke set: the page boots, every screen opens and lays out, and a game of each mode
 * plays to its end — the fewest browser files that cover it.
 */
export const SHELL_SMOKE = [
  'tests/components-menu-screens.test.mjs', // the main menu and every screen it opens
  'tests/components-pause.test.mjs', // the pause card, its confirmation, the status card
  'tests/results.test.mjs', // a Classic 2D game through the shell to its results
  'tests/flat-modes-play.test.mjs', // a Hexagon and a Triangle game through the shell to their results
  'tests/mode3d-end.test.mjs', // a 3D game through the worker to its end and its results
  'tests/replay-viewer.test.mjs', // the replay viewer
];

/** The 3D renderer's smoke set, beside its importers: a 3D game drawn to its end with its waves. */
export const RENDER_SMOKE = [
  'tests/mode3d-end.test.mjs',
];

const rel = (root, file) => relative(root, file).split('\\').join('/');
const clean = (file) => normalize(file).split('\\').join('/').replace(/^\.\//, '');

/** Every test file under tests/, the full run's glob `tests/**\/*.test.mjs`, sorted. */
export function testFiles(root) {
  return readdirSync(join(root, 'tests'), { recursive: true })
    .map((f) => `tests/${String(f).split('\\').join('/')}`)
    .filter((f) => f.endsWith('.test.mjs'))
    .sort();
}

/** The repo-relative files `file` reaches through relative static imports and literal-path import() calls, transitively (itself excluded). */
export function importClosure(file, root, cache = new Map()) {
  const seen = new Set();
  const walk = (current) => {
    let deps = cache.get(current);
    if (!deps) {
      deps = [];
      const text = readFileSync(join(root, current), 'utf8');
      for (const m of text.matchAll(STATIC_IMPORT)) {
        const spec = m[2] ?? m[4] ?? m[6];
        const target = resolve(root, dirname(current), spec.split(/[?#]/)[0]);
        if (existsSync(target)) deps.push(rel(root, target));
      }
      cache.set(current, deps);
    }
    for (const dep of deps) {
      if (seen.has(dep)) continue;
      seen.add(dep);
      if (/\.m?js$/.test(dep)) walk(dep);
    }
  };
  walk(clean(file));
  return seen;
}

/** Whether a test file holds a test named "in a browser", the browser tier's convention. */
export function isBrowserTest(file, root) {
  return BROWSER_TEST.test(readFileSync(join(root, file), 'utf8'));
}

/** The test files covering the changed paths: `full`, run whole, and `smoke`, run with [slow] skipped; sorted, disjoint. */
export function selectRuns(changed, root) {
  const full = new Set();
  const smoke = new Set();
  const sources = [];
  for (const path of changed.map(clean)) {
    if (path.startsWith('tests/') && path.endsWith('.test.mjs')) { if (existsSync(join(root, path))) full.add(path); }
    else sources.push(path);
  }
  if (sources.length) {
    const cache = new Map();
    const tests = testFiles(root);
    for (const t of tests) {
      const closure = importClosure(t, root, cache);
      if (sources.some((s) => closure.has(s))) full.add(t);
    }
    const addSmoke = (set) => { for (const t of set) if (existsSync(join(root, t))) smoke.add(t); };
    if (sources.some(SHELL)) addSmoke(SHELL_SMOKE);
    if (sources.includes(RENDERER)) addSmoke(RENDER_SMOKE);
  }
  for (const t of full) smoke.delete(t);
  return { full: [...full].sort(), smoke: [...smoke].sort() };
}

/** Every test file covering the changed paths, both groups together, sorted and without repeats. */
export function selectTests(changed, root) {
  const { full, smoke } = selectRuns(changed, root);
  return [...full, ...smoke].sort();
}

/** The files git reports changed against HEAD: staged, unstaged and untracked. */
export function changedFiles(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  return [...new Set([...git('diff', '--name-only', '--diff-filter=d', 'HEAD'), ...git('ls-files', '--others', '--exclude-standard')])];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  const group = args.find((a) => a === '--full' || a === '--smoke');
  const paths = args.filter((a) => a !== group);
  const runs = selectRuns(paths.length ? paths : changedFiles(root), root);
  const picked = group === '--full' ? runs.full : group === '--smoke' ? runs.smoke : [...runs.full, ...runs.smoke].sort();
  for (const f of picked) console.log(f);
}
