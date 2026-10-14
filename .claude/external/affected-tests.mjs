// Maps changed files to the test files that cover them, for run-affected-tests.sh.
//
//   node .claude/external/affected-tests.mjs [path...]
//
// Prints one test file per line, repo-relative. A path under tests/ ending .test.mjs is selected as
// given while it exists; any other path is a changed file, selected through every test file whose
// import closure reaches it — static imports and import() calls with a literal relative path. js/main.js, index.html, css/** and js/render.js are what the browser tests load
// through the page rather than by import, so a change to one also selects every browser test (a test
// file holding a test named "in a browser"). With no paths, the changed files are those git reports
// against HEAD: staged, unstaged and untracked.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATIC_IMPORT = /\b(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])(\.{1,2}\/[^'"]+)\1|\bimport\s*(['"])(\.{1,2}\/[^'"]+)\3|\bimport\(\s*(['"])(\.{1,2}\/[^'"]+)\5\s*\)/g;
const BROWSER_TEST = /\b(?:test|it|describe)\(\s*(['"`])[^'"`\n]*in a browser/;
const PAGE_LOADED = (file) => file === 'js/main.js' || file === 'index.html' || file === 'js/render.js' || file.startsWith('css/');

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

/** The test files covering the changed paths, sorted and without repeats. */
export function selectTests(changed, root) {
  const picked = new Set();
  const sources = [];
  for (const path of changed.map(clean)) {
    if (path.startsWith('tests/') && path.endsWith('.test.mjs')) { if (existsSync(join(root, path))) picked.add(path); }
    else sources.push(path);
  }
  if (sources.length) {
    const cache = new Map();
    const tests = testFiles(root);
    for (const t of tests) {
      const closure = importClosure(t, root, cache);
      if (sources.some((s) => closure.has(s))) picked.add(t);
    }
    if (sources.some(PAGE_LOADED)) for (const t of tests) if (isBrowserTest(t, root)) picked.add(t);
  }
  return [...picked].sort();
}

/** The files git reports changed against HEAD: staged, unstaged and untracked. */
export function changedFiles(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  return [...new Set([...git('diff', '--name-only', '--diff-filter=d', 'HEAD'), ...git('ls-files', '--others', '--exclude-standard')])];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const args = process.argv.slice(2);
  for (const f of selectTests(args.length ? args : changedFiles(root), root)) console.log(f);
}
