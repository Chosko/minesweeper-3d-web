// The test runner scripts under .claude/external/: the fast and browser tiers split by test name, the
// full run's per-test timeout, the affected-tests mapping from changed files to the tests that
// import them, and that a bare `node --test` from the root finds only the suite's test files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importClosure, isBrowserTest, selectTests, testFiles } from '../.claude/external/affected-tests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = (name) => readFileSync(join(ROOT, '.claude', 'external', name), 'utf8');
const name = (file) => file.replace(/^tests\//, '').replace(/\.test\.mjs$/, '');

test('the fast tier skips the browser-named tests, the browser tier runs only them, both over the full glob', () => {
  const fast = script('run-fast-tests.sh');
  assert.match(fast, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/);
  assert.match(fast, /node --test --test-skip-pattern="in a browser" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
  const browser = script('run-browser-tests.sh');
  assert.match(browser, /cd "\$\(dirname "\$0"\)\/\.\.\/\.\."/);
  assert.match(browser, /node --test --test-concurrency=2 --test-name-pattern="in a browser" "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
});

test('the full run keeps the whole suite at concurrency 2 and adds a per-test timeout', () => {
  assert.match(script('run-full-tests.sh'), /node --test --test-concurrency=2 --test-timeout=180000 "tests\/\*\*\/\*\.test\.mjs" "\$@"/);
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

test('a change to js/main.js, index.html, css/ or js/render.js selects every browser test besides its importers', () => {
  const browser = testFiles(ROOT).filter((f) => isBrowserTest(f, ROOT));
  assert.ok(browser.length >= 30, 'the browser files are found');
  for (const changed of ['js/main.js', 'index.html', 'css/components.css', 'js/render.js']) {
    const picked = selectTests([changed], ROOT);
    for (const f of browser) assert.ok(picked.includes(f), `${changed} selects ${f}`);
    assert.ok(!picked.includes('tests/engine-rules.test.mjs'), `${changed} leaves the engine unit tests out`);
  }
  const render = selectTests(['js/render.js'], ROOT);
  const importers = testFiles(ROOT).filter((t) => importClosure(t, ROOT).has('js/render.js'));
  assert.ok(importers.includes('tests/render-3d-feedback.test.mjs'), 'the renderer tests import it');
  for (const f of importers) assert.ok(render.includes(f));
  assert.ok(selectTests(['js/textures.js'], ROOT).includes('tests/render-3d-feedback.test.mjs'), 'through render.js');
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
