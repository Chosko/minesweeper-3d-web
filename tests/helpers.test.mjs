// The shared test helpers under tests/helpers/: the browser helper (the Playwright loader with its
// two global-install layouts, the SwiftShader launch flags, the run's one Chromium that every test
// file connects to, one static server per test file, a fresh context per test, and no browser test
// outside the runner) and the timing helper (the slack that timing assertions
// and waits get under load), plus the rule that every browser test file goes through the helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SWIFTSHADER_ARGS, SHARED_BROWSER_ARGS, SHARED_BROWSER_ENV, NOT_IN_RUNNER, globalPlaywrightPaths, serveRoot, browserSuite, launchSharedBrowser,
} from './helpers/browser.mjs';
import { timeSlack, TIME_SLACK, timed, patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const testFiles = () => readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'));
function join(...parts) { return path.join(...parts); }

// ---------------------------------------------------------------- the browser helper

test('the SwiftShader launch flags are one constant', () => {
  assert.deepEqual([...SWIFTSHADER_ARGS], ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
});

test('the Playwright fallback looks in both global-module layouts beside the Node binary', () => {
  const win = globalPlaywrightPaths('C:\\Program Files\\nodejs\\node.exe', path.win32);
  assert.ok(win.includes('C:\\Program Files\\nodejs\\node_modules\\playwright\\index.mjs'), `Windows layout in ${win}`);
  const posix = globalPlaywrightPaths('/opt/node22/bin/node', path.posix);
  assert.ok(posix.includes('/opt/node22/lib/node_modules/playwright/index.mjs'), `POSIX layout in ${posix}`);
  assert.equal(win.length, 2);
  assert.equal(posix.length, 2);
});

test('the static server serves the repository root with content types, extra pages and 404s', async () => {
  const server = await serveRoot({ pages: { '/previous': '<!doctype html><title>previous</title>' } });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await fetch(`${base}/index.html`);
    assert.equal(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.match(await html.text(), /<html/i);
    const js = await fetch(`${base}/js/main.js`);
    assert.match(js.headers.get('content-type'), /text\/javascript/);
    await js.arrayBuffer();
    const page = await fetch(`${base}/previous`);
    assert.equal(await page.text(), '<!doctype html><title>previous</title>');
    assert.equal((await fetch(`${base}/no-such-file.js`)).status, 404);
    assert.equal((await fetch(`${base}/js`)).status, 404, 'a directory is not served');
    assert.equal((await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`)).status, 404, 'nothing outside the root');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

/** A fake Playwright whose chromium counts connections and server launches and hands out recording contexts. */
function fakePlaywright({ fail = false } = {}) {
  const log = { connects: [], launches: [], contexts: [], browserClosed: 0, serverClosed: 0 };
  const browser = {
    async newContext(options) {
      const ctx = { options, closed: false, pages: [],
        async newPage() { const p = { context: () => ctx }; ctx.pages.push(p); return p; },
        async close() { ctx.closed = true; } };
      log.contexts.push(ctx);
      return ctx;
    },
    async close() { log.browserClosed++; },
  };
  return {
    log,
    playwright: { chromium: {
      async connect(endpoint) { log.connects.push(endpoint); if (fail) throw new Error('no chromium\nmore'); return browser; },
      async launchServer(options) {
        log.launches.push(options);
        if (fail) throw new Error('no chromium\nmore');
        return { wsEndpoint: () => 'ws://fake', process: () => ({ pid: 4242, kill() {} }), async close() { log.serverClosed++; } };
      },
    } },
  };
}
const fakeT = () => { const t = { skipped: [], skip(m) { t.skipped.push(m); } }; return t; };
const RUN_ENV = { [SHARED_BROWSER_ENV.endpoint]: 'ws://fake', [SHARED_BROWSER_ENV.runner]: String(process.pid) };

test('the runner launches the run\'s one Chromium with the SwiftShader flags and a software 2D canvas, or says why it cannot', async () => {
  const { log, playwright } = fakePlaywright();
  const shared = await launchSharedBrowser(async () => playwright);
  assert.deepEqual([...SHARED_BROWSER_ARGS], [...SWIFTSHADER_ARGS, '--disable-accelerated-2d-canvas']);
  assert.deepEqual(log.launches, [{ args: [...SHARED_BROWSER_ARGS] }]);
  assert.equal(shared.endpoint, 'ws://fake');
  assert.equal(shared.pid, 4242);
  await shared.close();
  assert.equal(log.serverClosed, 1);
  assert.deepEqual(await launchSharedBrowser(async () => null), { skip: 'Playwright is not installed' });
  const broken = fakePlaywright({ fail: true });
  assert.deepEqual(await launchSharedBrowser(async () => broken.playwright), { skip: 'chromium could not start: no chromium' });
});

test('a browser suite connects its file to the run\'s Chromium on first use, with a fresh context per page', async () => {
  const { log, playwright } = fakePlaywright();
  const suite = browserSuite({ load: async () => playwright, env: RUN_ENV, hooks: false });
  assert.equal(log.connects.length, 0, 'nothing connects before a test asks');
  const t1 = fakeT();
  const a = await suite.open(t1);
  const p1 = await a.browser.newPage({ viewport: { width: 800, height: 600 } });
  const p2 = await a.browser.newPage();
  const c3 = await a.browser.newContext({ deviceScaleFactor: 2 });
  assert.match(a.base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.deepEqual(log.connects, ['ws://fake'], 'one connection, to the runner\'s endpoint');
  assert.deepEqual(log.launches, [], 'no launch of its own');
  assert.notEqual(p1.context(), p2.context(), 'each page in its own context');
  assert.deepEqual(log.contexts[0].options, { viewport: { width: 800, height: 600 } }, 'the page options go to its context');
  assert.deepEqual(c3.options, { deviceScaleFactor: 2 });
  await a.browser.close();
  assert.equal(log.contexts.every((c) => c.closed), true, 'a test closes its contexts');
  assert.equal(log.browserClosed, 0, 'not the shared browser');

  const b = await suite.open(fakeT());
  await b.browser.newPage();
  assert.equal(log.connects.length, 1, 'the next test reuses the connection');
  assert.equal(b.base, a.base, 'and the server');
  await b.browser.close();
  await suite.close();
  await suite.close();
  assert.equal(log.browserClosed, 1, 'disconnected once, at the end of the file');
  assert.deepEqual(t1.skipped, []);
});

test('a browser test outside the runner fails, and never launches a browser', async () => {
  const { log, playwright } = fakePlaywright();
  const suite = browserSuite({ load: async () => playwright, env: {}, hooks: false });
  await assert.rejects(suite.open(fakeT()), { message: NOT_IN_RUNNER });
  const orphan = browserSuite({ load: async () => playwright, env: { ...RUN_ENV, [SHARED_BROWSER_ENV.runner]: '999999999' }, hooks: false });
  await assert.rejects(orphan.open(fakeT()), /the test runner \(pid 999999999\) is gone/);
  assert.deepEqual([log.launches, log.connects], [[], []]);
  await suite.close();
  await orphan.close();
});

test('a browser suite skips each test when the runner has no Chromium or Playwright is missing, and fails when the Chromium is gone', async () => {
  const none = browserSuite({ env: { [SHARED_BROWSER_ENV.skip]: 'Playwright is not installed' }, hooks: false });
  const t = fakeT();
  assert.equal(await none.open(t), null);
  assert.deepEqual(t.skipped, ['Playwright is not installed']);
  await none.close();

  const missing = browserSuite({ load: async () => null, env: RUN_ENV, hooks: false });
  const t0 = fakeT();
  assert.equal(await missing.open(t0), null);
  assert.deepEqual(t0.skipped, ['Playwright is not installed']);

  const { log, playwright } = fakePlaywright({ fail: true });
  const broken = browserSuite({ load: async () => playwright, env: RUN_ENV, hooks: false });
  await assert.rejects(broken.open(fakeT()), /the run's Chromium is gone: no chromium/);
  await assert.rejects(broken.open(fakeT()), /the run's Chromium is gone/);
  assert.equal(log.connects.length, 1, 'tried once');
  await broken.close();
});

test('every browser test file goes through the helper: no launch or server of its own', () => {
  for (const f of testFiles()) {
    const src = readFileSync(join(ROOT, 'tests', f), 'utf8');
    assert.doesNotMatch(src, /chromium\.(?:launch|launchServer|launchPersistentContext|connect|connectOverCDP)\(/, `${f} launches or connects to Chromium itself`);
    assert.doesNotMatch(src, /\bcreateServer\(/, `${f} runs its own server`);
    if (/test\(\s*['"`][^'"`]*in a browser/.test(src)) {
      assert.match(src, /from '\.\/helpers\/browser\.mjs'/, `${f} has browser tests but does not use the helper`);
    }
  }
});

// ---------------------------------------------------------------- the timing helper

test('the timing slack comes from MS_TIME_SLACK, at least 1, default 2', () => {
  assert.equal(timeSlack(undefined), 2);
  assert.equal(timeSlack(''), 2);
  assert.equal(timeSlack('3'), 3);
  assert.equal(timeSlack('1.5'), 1.5);
  assert.equal(timeSlack('0.5'), 1, 'never tighter than the budget');
  assert.equal(timeSlack('fast'), 2);
  assert.equal(TIME_SLACK, timeSlack(process.env.MS_TIME_SLACK));
});

test('timed keeps the fastest of a few attempts, stops at the first within the slackened budget, and returns the work\'s value', () => {
  let calls = 0;
  const quick = timed(1000, () => { calls++; return 'v'; });
  assert.equal(quick.ok, true);
  assert.equal(quick.value, 'v');
  assert.equal(calls, 1, 'one attempt when it is within budget');
  assert.equal(quick.limit, 1000 * TIME_SLACK);

  calls = 0;
  const spin = (ms) => { const end = performance.now() + ms; while (performance.now() < end); };
  const slow = timed(1, () => { calls++; spin(2 * TIME_SLACK + 2); return calls; });
  assert.equal(slow.ok, false, 'work several times over its budget fails');
  assert.equal(calls, 3, 'after three attempts');
  assert.equal(slow.value, 3);
  assert.ok(slow.ms >= 2 * TIME_SLACK + 2);
});

test('patience scales a wait\'s timeout by the slack and a generous factor', () => {
  assert.equal(patience(5000), 5000 * 4 * TIME_SLACK);
});
