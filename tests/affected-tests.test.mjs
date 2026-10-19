// The test runner scripts under .claude/external/: the fast, browser and slow tiers split by test name,
// the full run's per-test timeout, the affected-tests mapping from changed files to the tests that
// import them and the shell's smoke set, and that a bare `node --test` from the root finds only the
// suite's test files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHELL_SMOKE, importClosure, isBrowserTest, selectRuns, selectTests, testFiles } from '../.claude/external/affected-tests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = (name) => readFileSync(join(ROOT, '.claude', 'external', name), 'utf8');
const name = (file) => file.replace(/^tests\//, '').replace(/\.test\.mjs$/, '');

test('the fast tier skips the browser-named tests, the browser tier runs only them less the slow ones, both over the full glob', () => {
  const fast = script('run-fast-tests.sh');
  assert.match(fast, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/);
  assert.match(fast, /node --test --test-skip-pattern="in a browser" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
  const browser = script('run-browser-tests.sh');
  assert.match(browser, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/);
  assert.match(browser, /node --test --test-concurrency=2 --test-name-pattern="in a browser" --test-skip-pattern="\\\[slow\\\]" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
});

test('the full run skips the slow tests, keeps the rest at concurrency 2 and adds a per-test timeout; the slow run takes only them', () => {
  assert.match(script('run-full-tests.sh'), /node --test --test-concurrency=2 --test-timeout=180000 --test-skip-pattern="\\\[slow\\\]" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
  const slow = script('run-slow-tests.sh');
  assert.match(slow, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/);
  assert.match(slow, /node --test --test-concurrency=2 --test-timeout=180000 --test-name-pattern="\\\[slow\\\]" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
});

test('the affected run takes the files a changed file reaches as they are, and the rule-selected ones with the slow tests skipped', () => {
  const affected = script('run-affected-tests.sh');
  assert.match(affected, /affected-tests\.mjs --full "\$@"/);
  assert.match(affected, /affected-tests\.mjs --smoke "\$@"/);
  assert.match(affected, /node --test --test-concurrency=2 "\$\{full\[@\]\}"/);
  assert.match(affected, /node --test --test-concurrency=2 --test-skip-pattern="\\\[slow\\\]" "\$\{smoke\[@\]\}"/);
});

// Each test's name, read from its call: test('…', …) with a literal or template name.
const TEST_NAME = /\b(?:test|it)\(\s*(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
const testNames = (file) => [...readFileSync(join(ROOT, file), 'utf8').matchAll(TEST_NAME)].map((m) => m[2]);

test('a slow-tagged test is a browser test, and the long walks and the timing and frame-count checks carry the tag', () => {
  const slow = testFiles(ROOT).flatMap((f) => testNames(f).filter((n) => n.includes('[slow]')).map((n) => [f, n]));
  for (const [f, n] of slow) assert.ok(n.startsWith('[slow] ') && n.includes('in a browser'), `${f}: ${n}`);
  const tagged = (file, part) => testNames(file).some((n) => n.startsWith('[slow] ') && n.includes(part));
  assert.ok(tagged('tests/shell-pad-walk.test.mjs', 'the D-pad walks every control'), 'the controller walk');
  assert.ok(tagged('tests/shell-focus-containment.test.mjs', 'focus stays inside the Controls modal'), 'the focus walk');
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

test('the shell smoke set is one browser test file per screen, each present', () => {
  assert.ok(SHELL_SMOKE.length >= 8 && SHELL_SMOKE.length < testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT)).length / 2, 'small');
  for (const f of SHELL_SMOKE) assert.ok(testFiles(ROOT).includes(f) && isBrowserTest(f, ROOT), `${f} is a browser test file`);
  for (const screen of ['shell-menu', 'records-screen', 'settings-page', 'results', 'replay-viewer', 'shell-pause']) {
    assert.ok(SHELL_SMOKE.includes(`tests/${screen}.test.mjs`), `${screen} stands for its screen`);
  }
});

test('a change to js/main.js, index.html or css/ selects the smoke set, slow tests skipped, not every browser test', () => {
  const browser = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  for (const changed of ['js/main.js', 'index.html', 'css/components.css']) {
    const { full, smoke } = selectRuns([changed], ROOT);
    assert.deepEqual(smoke, [...SHELL_SMOKE].sort(), `${changed} selects the smoke set`);
    for (const f of full) assert.ok(importClosure(f, ROOT).has(changed), `${changed}: ${f} reaches it`);
    assert.ok(!selectTests([changed], ROOT).includes('tests/shell-pad-walk.test.mjs'), `${changed} leaves the controller walk out`);
    assert.ok(selectTests([changed], ROOT).length < browser.length / 2, `${changed} selects a small set`);
    assert.ok(!selectTests([changed], ROOT).includes('tests/engine-rules.test.mjs'), `${changed} leaves the engine unit tests out`);
  }
  const both = selectRuns(['index.html', 'js/shell/menu.js'], ROOT);
  assert.ok(both.full.includes('tests/shell-menu.test.mjs') && !both.smoke.includes('tests/shell-menu.test.mjs'), 'a smoke file the change reaches runs in full');
  assert.deepEqual(selectTests(['index.html', 'js/shell/menu.js'], ROOT), [...new Set([...both.full, ...both.smoke])].sort(), 'the union');
});

test('a change to js/render.js selects every browser test, slow tests run only in the files that import it', () => {
  const browser = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  const { full, smoke } = selectRuns(['js/render.js'], ROOT);
  for (const f of browser) assert.ok(full.includes(f) || smoke.includes(f), `js/render.js selects ${f}`);
  const importers = testFiles(ROOT).filter((t) => importClosure(t, ROOT).has('js/render.js'));
  assert.ok(importers.includes('tests/render-3d-feedback.test.mjs'), 'the renderer tests import it');
  assert.deepEqual(full, importers, 'its importers run in full');
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
      if (e.isDirectory()) { if (e.name !== '.git' && e.name !== 'node_modules') walk(rel); } else files.push(rel);
    }
  };
  walk('');
  const outside = files.filter((f) => !f.startsWith('tests/') && NODE_DEFAULT_TEST.test(f));
  assert.deepEqual(outside, [], 'rename these so a bare node --test does not run them');
  const inside = files.filter((f) => f.startsWith('tests/') && NODE_DEFAULT_TEST.test(f)).sort();
  assert.deepEqual(inside, [...testFiles(ROOT)].sort(), 'inside tests/ the default patterns pick exactly the scripts\' glob');
});
