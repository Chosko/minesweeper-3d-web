// The test runner scripts under .claude/external/: the fast tier split by test name, the runner's
// modes (affected, full, and the all-browser runs behind their opt-in) with browser files one at a
// time, the machine-wide browser lock, the guard hook, the affected-tests mapping from changed files
// to the tests that import them with the shell's and the renderer's smoke sets, and that a bare
// `node --test` from the root finds only the suite's test files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_SMOKE, SHELL_SMOKE, importClosure, isBrowserTest, selectRuns, selectTests, testFiles } from '../.claude/external/affected-tests.mjs';
import { TEST_TIMEOUT_MS, isAlive, lockPath, planRuns, releaseLock, tryLock } from '../.claude/external/run-tests.mjs';
import { verdict } from '../.claude/hooks/browser-tests-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = (name) => readFileSync(join(ROOT, '.claude', 'external', name), 'utf8');
const name = (file) => file.replace(/^tests\//, '').replace(/\.test\.mjs$/, '');

test('the fast tier skips the browser-named tests over the full glob; every other script execs the runner in its mode', () => {
  const fast = script('run-fast-tests.sh');
  assert.match(fast, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/);
  assert.match(fast, /exec node --test --test-skip-pattern="in a browser" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
  for (const [file, mode] of [['run-affected-tests.sh', 'affected'], ['run-full-tests.sh', 'full'], ['run-browser-tests.sh', 'browser'], ['run-slow-tests.sh', 'slow']]) {
    const body = script(file);
    assert.match(body, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/, file);
    assert.match(body, new RegExp(`\\nexec node \\.claude/external/run-tests\\.mjs ${mode} "\\$@"\\n?$`), `${file} ends by exec-ing the runner`);
    assert.doesNotMatch(body, /^[^#\n]*node --test/m, `${file} runs no node --test of its own`);
  }
});

const fileArgs = (list) => list.filter((a) => !a.startsWith('--'));
const SERIAL = ['--test', '--test-concurrency=1', `--test-timeout=${TEST_TIMEOUT_MS}`];

test('an affected run: the reached files\' fast tests in parallel, their browser tests with the slow ones and the smoke files\' without, one file at a time', () => {
  const plan = planRuns('affected', ['js/shell/menu.js', 'index.html', '--test-reporter=dot'], ROOT);
  const runs = selectRuns(['js/shell/menu.js', 'index.html'], ROOT);
  assert.deepEqual(plan.fast, ['--test', '--test-skip-pattern=in a browser', ...runs.full, '--test-reporter=dot']);
  const [full, smoke] = plan.browser;
  assert.deepEqual(full.slice(0, 4), [...SERIAL, '--test-name-pattern=in a browser']);
  assert.deepEqual(fileArgs(full), runs.full.filter((f) => isBrowserTest(f, ROOT)));
  assert.ok(fileArgs(full).includes('tests/shell-menu.test.mjs'));
  assert.ok(smoke.includes('--test-skip-pattern=\\[slow\\]') && smoke.includes('--test-concurrency=1'));
  assert.deepEqual(fileArgs(smoke), runs.smoke);
  assert.equal(full.at(-1), '--test-reporter=dot', 'flags pass through');
  assert.deepEqual(planRuns('affected', ['docs/UX_REVIEW.md'], ROOT), { fast: null, browser: [] }, 'nothing reached, nothing run');
  assert.deepEqual(planRuns('affected', ['tests/engine-rules.test.mjs'], ROOT).browser, [], 'no browser file, no browser part');
  assert.deepEqual(planRuns('affected', [], ROOT, {}, () => ['tests/engine-rules.test.mjs']).fast.slice(2), ['tests/engine-rules.test.mjs'], 'no path: git\'s changes');
});

test('a full run is the whole fast tier, then the affected browser part', () => {
  const plan = planRuns('full', ['js/shell/menu.js'], ROOT);
  assert.deepEqual(plan.fast, ['--test', '--test-skip-pattern=in a browser', ...testFiles(ROOT)]);
  assert.deepEqual(plan.browser, planRuns('affected', ['js/shell/menu.js'], ROOT).browser);
  assert.deepEqual(planRuns('full', ['docs/UX_REVIEW.md'], ROOT).browser, [], 'a change no browser file reaches runs no browser');
});

test('every browser file runs only with the milestone opt-in: the browser tier less the slow tests, or the slow tests alone', () => {
  for (const mode of ['browser', 'slow']) {
    assert.match(planRuns(mode, [], ROOT, {}).refuse, /milestone close only, with MS3D_ALL_BROWSER=1/);
    assert.match(planRuns(mode, [], ROOT, { MS3D_ALL_BROWSER: 'yes' }).refuse, /MS3D_ALL_BROWSER=1/);
  }
  const browserFiles = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  const all = planRuns('browser', [], ROOT, { MS3D_ALL_BROWSER: '1' });
  assert.equal(all.fast, null);
  assert.deepEqual(all.browser, [[...SERIAL, '--test-name-pattern=in a browser', '--test-skip-pattern=\\[slow\\]', ...browserFiles]]);
  const [slow] = planRuns('slow', [], ROOT, { MS3D_ALL_BROWSER: '1' }).browser;
  assert.deepEqual(slow.slice(0, 4), [...SERIAL, '--test-name-pattern=\\[slow\\]'], 'the slow name pattern alone');
  assert.ok(fileArgs(slow).includes('tests/shell-pad-walk.test.mjs') && !fileArgs(slow).includes('tests/results.test.mjs'), 'only files holding a [slow] test');
  assert.match(planRuns('everything', [], ROOT).refuse, /unknown mode/);
});

test('the browser lock: one holder at a time, released only by its holder, a dead holder\'s lock reclaimed', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ms3d-lock-')), 'lock');
  try {
    assert.equal(lockPath({ MS3D_BROWSER_LOCK: dir }), dir);
    assert.equal(lockPath({ LOCALAPPDATA: 'C:/x' }).replaceAll('\\', '/'), 'C:/x/ms3d-browser-tests.lock');
    assert.deepEqual(tryLock(dir, { pid: process.pid }), { ok: true });
    assert.deepEqual(tryLock(dir, { pid: 1 }), { ok: false, held: { pid: process.pid } }, 'a live holder keeps it');
    releaseLock(dir, 12345);
    assert.equal(tryLock(dir, { pid: 1 }).ok, false, 'only the holder releases it');
    releaseLock(dir, process.pid);
    assert.deepEqual(tryLock(dir, { pid: 999999999 }), { ok: true });
    assert.deepEqual(tryLock(dir, { pid: process.pid }), { ok: true }, 'a dead holder\'s lock is reclaimed');
    releaseLock(dir, process.pid);
    assert.equal(isAlive(process.pid), true);
    assert.equal(isAlive(999999999), false);
  } finally {
    rmSync(dirname(dir), { recursive: true, force: true });
  }
});

test('the guard hook denies a node --test that may reach a browser test and the all-browser runs without the opt-in', () => {
  const denied = [
    'node --test',
    'node --test "tests/**/*.test.mjs"',
    'node --test tests/shell-menu.test.mjs',
    'cd /e/x && node --test --test-concurrency=2 tests/',
    'node.exe --test --test-name-pattern="in a browser" tests/results.test.mjs',
    'bash .claude/external/run-browser-tests.sh',
    'bash .claude/external/run-slow-tests.sh',
    'node .claude/external/run-tests.mjs slow',
  ];
  for (const c of denied) assert.ok(verdict(c, ROOT), `denies: ${c}`);
  const allowed = [
    'node --test tests/engine-rules.test.mjs',
    'node --test --test-skip-pattern="in a browser" "tests/**/*.test.mjs"',
    'bash .claude/external/run-fast-tests.sh',
    'bash .claude/external/run-affected-tests.sh js/render.js',
    'bash .claude/external/run-full-tests.sh',
    'MS3D_ALL_BROWSER=1 bash .claude/external/run-browser-tests.sh',
    '$env:MS3D_ALL_BROWSER = "1"; bash .claude/external/run-slow-tests.sh',
    'grep -rn "--test-concurrency" .claude',
    'git status',
  ];
  for (const c of allowed) assert.equal(verdict(c, ROOT), null, `allows: ${c}`);
  assert.match(verdict('node --test', ROOT), /run-affected-tests\.sh/, 'the denial names the right script');
});

// Each test's name, read from its call: test('…', …) with a literal or template name.
const TEST_NAME = /\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const testNames = (file) => [...readFileSync(join(ROOT, file), 'utf8').matchAll(TEST_NAME)].map((m) => m[2]);

test('a slow-tagged test is a browser test, and the long walks and the timing and frame-count checks carry the tag', () => {
  const slow = testFiles(ROOT).flatMap((f) => testNames(f).filter((n) => n.includes('[slow]')).map((n) => [f, n]));
  for (const [f, n] of slow) assert.ok(n.startsWith('[slow] ') && n.includes('in a browser'), `${f}: ${n}`);
  const tagged = (file, part) => testNames(file).some((n) => n.startsWith('[slow] ') && n.includes(part));
  assert.ok(tagged('tests/shell-pad-walk.test.mjs', 'the D-pad walks every control'), 'the controller walk');
  assert.ok(tagged('tests/shell-focus-containment.test.mjs', 'focus stays inside the pause card'), 'the focus walk');
  assert.ok(tagged('tests/shell-menu.test.mjs', 'the backdrop orbits and draws every frame'), 'the frame count');
  assert.ok(tagged('tests/mode3d-end.test.mjs', 'the loss wave reaches the far side'), 'the wave timing');
  assert.ok(tagged('tests/render-3d-flag-flash.test.mjs', 'flashes the cubes it changed'), 'the flash');
  assert.ok(tagged('tests/replay-viewer.test.mjs', 'plays from its fixture through to the end'), 'the playback timing');
  assert.ok(!testNames('tests/shell-menu.test.mjs').some((n) => n.includes('[slow]') && n.includes('nine entries')), 'a functional check stays untagged');
});

test('the import closure follows static imports and literal-path import() calls transitively, and ignores bare specifiers', () => {
  const closure = importClosure('tests/classic2d-session.test.mjs', ROOT);
  assert.ok(closure.has('js/classic2d/session.js'));
  assert.ok(closure.has('js/engine/index.js') || [...closure].some((f) => f.startsWith('js/engine/')), 'reached through session.js');
  assert.ok([...closure].every((f) => !f.includes('node_modules') && f !== 'three'));
  const skin = importClosure('tests/tile-skin.test.mjs', ROOT);
  assert.ok(skin.has('js/classic2d/tile-skin.js') && skin.has('js/tile-art.js'), 'reached through import()');
});

test('a browser test file is one holding a browser-named test', () => {
  assert.ok(isBrowserTest('tests/shell-menu.test.mjs', ROOT));
  assert.ok(isBrowserTest('tests/components.test.mjs', ROOT));
  assert.ok(!isBrowserTest('tests/engine-rules.test.mjs', ROOT));
});

test('a change under js/classic2d/ selects the tests reaching it, not the 3D renderer, camera or unrelated 3D mode tests', () => {
  const picked = selectTests(['js/classic2d/board-view.js'], ROOT).map(name);
  for (const t of ['classic2d-view', 'classic2d-mode', 'classic2d-pointer']) assert.ok(picked.includes(t), `${t} reaches it`);
  for (const t of picked) assert.ok(importClosure(`tests/${t}.test.mjs`, ROOT).has('js/classic2d/board-view.js'), `${t} reaches it`);
  assert.ok(!picked.some((t) => t.startsWith('render-3d-') || t.startsWith('mode3d-') || t === 'camera-spawn'));
  assert.ok(selectTests(['js/classic2d/tile-skin.js'], ROOT).includes('tests/tile-skin.test.mjs'), 'a test importing its subject by import() is selected');
  const session = selectTests(['js/classic2d/session.js'], ROOT).map(name);
  assert.ok(session.includes('classic2d-session') && session.includes('mode3d-session'), 'a 3D mode test that reaches it is selected');
  assert.ok(!session.includes('mode3d-end') && !session.some((t) => t.startsWith('render-3d-') || t === 'camera-spawn'));
  assert.ok(!picked.includes('engine-rules'));
});

test('the browser files split out of components.test.mjs are selected by every change that selects it', () => {
  const split = ['components-ready', 'components-learn-end', 'components-menu-screens', 'components-pause'].map((n) => `tests/${n}.test.mjs`);
  const reached = [...importClosure('tests/components.test.mjs', ROOT)].filter((f) => f.startsWith('js/'));
  assert.ok(reached.includes('js/ui.js') && reached.includes('js/ui/components.js'));
  for (const f of split) {
    assert.ok(testFiles(ROOT).includes(f) && isBrowserTest(f, ROOT), `${f} is a browser test file`);
    const closure = importClosure(f, ROOT);
    assert.deepEqual(reached.filter((r) => !closure.has(r)), [], `${f} reaches what components.test.mjs reaches`);
  }
  for (const changed of ['js/ui.js', 'js/ui/components.js', 'js/shell/navigation.js']) {
    const picked = selectTests([changed], ROOT);
    for (const f of ['tests/components.test.mjs', ...split]) assert.ok(picked.includes(f), `${changed} selects ${f}`);
  }
});

test('the smoke sets are small sets of present browser test files: the screens and both games for the shell, a 3D game, its end and a 3D replay for the renderer', () => {
  const browser = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  for (const set of [SHELL_SMOKE, RENDER_SMOKE]) {
    assert.ok(set.length < browser.length / 8, 'small');
    for (const f of set) assert.ok(browser.includes(f), `${f} is a browser test file`);
  }
  for (const f of ['components-menu-screens', 'components-pause', 'results', 'mode3d-session', 'replay-viewer']) {
    assert.ok(SHELL_SMOKE.includes(`tests/${f}.test.mjs`), `${f} stands for its screens`);
  }
  for (const f of ['mode3d-session', 'mode3d-end', 'replay-viewer-3d']) assert.ok(RENDER_SMOKE.includes(`tests/${f}.test.mjs`), f);
});

test('a change to js/main.js, index.html or css/ selects the smoke set, slow tests skipped, not every browser test', () => {
  const browser = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  for (const changed of ['js/main.js', 'index.html', 'css/components.css']) {
    const { full, smoke } = selectRuns([changed], ROOT);
    assert.deepEqual(smoke, [...SHELL_SMOKE].sort(), `${changed} selects the smoke set`);
    for (const f of full) assert.ok(importClosure(f, ROOT).has(changed), `${changed}: ${f} reaches it`);
    assert.ok(!selectTests([changed], ROOT).includes('tests/shell-pad-walk.test.mjs'), `${changed} leaves the controller walk out`);
    assert.ok(selectTests([changed], ROOT).length < browser.length / 4, `${changed} selects a small set`);
    assert.ok(!selectTests([changed], ROOT).includes('tests/engine-rules.test.mjs'), `${changed} leaves the engine unit tests out`);
  }
  const both = selectRuns(['index.html', 'js/results/view.js'], ROOT);
  assert.ok(both.full.includes('tests/results.test.mjs') && !both.smoke.includes('tests/results.test.mjs'), 'a smoke file the change reaches runs in full');
  assert.deepEqual(selectTests(['index.html', 'js/results/view.js'], ROOT), [...new Set([...both.full, ...both.smoke])].sort(), 'the union');
});

test('a change to js/render.js selects its importers in full and the 3D smoke set with slow tests skipped, not every browser test', () => {
  const browser = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  const { full, smoke } = selectRuns(['js/render.js'], ROOT);
  const importers = testFiles(ROOT).filter((t) => importClosure(t, ROOT).has('js/render.js'));
  assert.ok(importers.includes('tests/render-3d-feedback.test.mjs'), 'the renderer tests import it');
  assert.deepEqual(full, importers, 'its importers run in full');
  assert.deepEqual(smoke, RENDER_SMOKE.filter((f) => !full.includes(f)).sort(), 'the 3D smoke set beside them');
  assert.ok(full.length + smoke.length < browser.length / 2, 'a small set');
  assert.ok(!smoke.some((f) => full.includes(f)), 'the two groups are disjoint');
  assert.ok(selectTests(['js/textures.js'], ROOT).includes('tests/render-3d-feedback.test.mjs'), 'through render.js');
  assert.ok(!selectTests(['js/render.js'], ROOT).includes('tests/engine-rules.test.mjs'));
});

test('a changed test file selects itself, and a path no test reaches selects nothing', () => {
  assert.deepEqual(selectTests(['tests/engine-rules.test.mjs'], ROOT), ['tests/engine-rules.test.mjs']);
  assert.deepEqual(selectTests(['docs/UX_REVIEW.md'], ROOT), []);
  assert.deepEqual(selectTests(['./tests/engine-rules.test.mjs', 'tests/engine-rules.test.mjs'], ROOT), ['tests/engine-rules.test.mjs']);
  assert.deepEqual(selectTests(['tests/deleted.test.mjs'], ROOT), [], 'a test file that no longer exists is not run');
});

// Node 22's default `node --test` patterns, each over .js, .mjs and .cjs.
const NODE_DEFAULT_TEST = /(^|\/)test\/.*\.[cm]?js$|(\.test|-test|_test)\.[cm]?js$|(^|\/)test-[^/]*\.[cm]?js$|(^|\/)test\.[cm]?js$/;

test('a bare node --test from the root finds only the suite: no file outside tests/ matches the default patterns', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules' && rel !== '.claude/worktrees') walk(rel); } else files.push(rel);
    }
  };
  walk('');
  const outside = files.filter((f) => !f.startsWith('tests/') && NODE_DEFAULT_TEST.test(f));
  assert.deepEqual(outside, [], 'rename these so a bare node --test does not run them');
  const inside = files.filter((f) => f.startsWith('tests/') && NODE_DEFAULT_TEST.test(f)).sort();
  assert.deepEqual(inside, [...testFiles(ROOT)].sort(), 'inside tests/ the default patterns pick exactly the scripts\' glob');
});
