// The browser test helper: every browser test file loads Playwright, runs its static server and
// reaches Chromium through this module. The runner (.claude/external/run-tests.mjs) launches ONE
// Chromium per run (`launchSharedBrowser`) and hands its endpoint to every test file it runs, one
// file at a time; a file connects to it on its first test's `open` and disconnects after its last
// test. A browser test run any other way fails: no file launches a browser of its own. Every page or
// context a test opens is its own, and the test closes them.
//
//   const suite = browserSuite();                 // browserSuite({ pages }) adds served pages
//   test('in a browser, …', async (t) => {
//     const env = await suite.open(t);            // null, with t skipped, when Playwright or Chromium is missing
//     if (!env) return;
//     const { browser, base } = env;              // browser.newPage(options) / newContext(options) — fresh contexts
//     try { … } finally { await browser.close(); } // closes this test's contexts, not the shared browser
//   });
import { after } from 'node:test';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Chromium's flags for WebGL 2 without a GPU: ANGLE over SwiftShader. */
export const SWIFTSHADER_ARGS = Object.freeze(['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']);

/**
 * Where a global Playwright sits beside the Node binary: `node_modules` in the binary's own
 * directory (the Windows layout) and `../lib/node_modules` (the POSIX layout).
 */
export function globalPlaywrightPaths(execPath = process.execPath, pathApi = path) {
  const dir = pathApi.dirname(execPath);
  return [
    pathApi.join(dir, 'node_modules', 'playwright', 'index.mjs'),
    pathApi.join(dir, '..', 'lib', 'node_modules', 'playwright', 'index.mjs'),
  ];
}

/** Playwright: `import('playwright')`, else the global install beside the Node binary, else null. */
export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    for (const file of globalPlaywrightPaths()) {
      if (!existsSync(file)) continue;
      try {
        return await import(pathToFileURL(file).href);
      } catch {
        // try the other layout
      }
    }
    return null;
  }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

/**
 * A static server on a free port over the repository root (ES modules fail on `file://`); `pages`
 * maps a path to an HTML string served in place of a file.
 */
export function serveRoot({ pages = {} } = {}) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (Object.hasOwn(pages, url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(pages[url.pathname]);
      return;
    }
    let file;
    try {
      file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
    } catch {
      file = null;
    }
    if (!file || !file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** A test's view of the shared browser: every page and context it opens is fresh, and closed with it. */
function scopedBrowser(shared) {
  const contexts = [];
  return {
    async newContext(options) {
      const context = await shared.newContext(options);
      contexts.push(context);
      return context;
    },
    async newPage(options) {
      const context = await this.newContext(options);
      return context.newPage();
    },
    async close() {
      await Promise.all(contexts.splice(0).map((c) => c.close().catch(() => {})));
    },
  };
}

/**
 * The run's launch flags: WebGL 2 over SwiftShader, and the 2D canvas rasterised in software as in a
 * flagless launch, so pixel checks of 2D canvases read the same in every file.
 */
export const SHARED_BROWSER_ARGS = Object.freeze([...SWIFTSHADER_ARGS, '--disable-accelerated-2d-canvas']);

/** The variables the runner hands each test file: the shared Chromium's endpoint, a skip reason, the runner's pid. */
export const SHARED_BROWSER_ENV = Object.freeze({ endpoint: 'MS3D_BROWSER_WS', skip: 'MS3D_BROWSER_SKIP', runner: 'MS3D_RUNNER_PID' });

export const NOT_IN_RUNNER = 'browser tests run only through .claude/external/run-affected-tests.sh or run-full-tests.sh, '
  + 'which share one Chromium across the run; no test file launches its own';

/**
 * The run's one Chromium, launched with `SHARED_BROWSER_ARGS`: `{ endpoint, pid, close(), kill() }`, or
 * `{ skip }` when Playwright is missing or Chromium cannot start. It dies with the launching
 * process (Playwright drives it over a pipe).
 */
export async function launchSharedBrowser(load = loadPlaywright) {
  const playwright = await load();
  if (!playwright) return { skip: 'Playwright is not installed' };
  let server;
  try {
    server = await playwright.chromium.launchServer({ args: [...SHARED_BROWSER_ARGS] });
  } catch (error) {
    return { skip: `chromium could not start: ${error.message.split('\n')[0]}` };
  }
  return {
    endpoint: server.wsEndpoint(),
    pid: server.process()?.pid,
    close: () => server.close(),
    kill: () => server.process()?.kill(),
  };
}

const runnerAlive = (pid) => {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

/**
 * The calling test file's connection to the run's Chromium and its own static server. `pages` go to
 * the server. `load`, `env` and `hooks` exist for the helper's own tests.
 */
export function browserSuite({ pages, load = loadPlaywright, env = process.env, hooks = true } = {}) {
  let ready = null;
  const start = async () => {
    if (env[SHARED_BROWSER_ENV.skip]) return { skip: env[SHARED_BROWSER_ENV.skip] };
    const endpoint = env[SHARED_BROWSER_ENV.endpoint];
    if (!endpoint) return { fail: NOT_IN_RUNNER };
    const runner = env[SHARED_BROWSER_ENV.runner];
    if (runner && !runnerAlive(runner)) return { fail: `the test runner (pid ${runner}) is gone` };
    const playwright = await load();
    if (!playwright) return { skip: 'Playwright is not installed' };
    let browser;
    try {
      browser = await playwright.chromium.connect(endpoint);
    } catch (error) {
      return { fail: `the run's Chromium is gone: ${error.message.split('\n')[0]}` };
    }
    const server = await serveRoot({ pages });
    return { browser, server, base: `http://127.0.0.1:${server.address().port}` };
  };
  const suite = {
    /** This test's browser and the server's base URL, or null with `t` skipped; throws outside the runner. */
    async open(t) {
      ready ??= start();
      const env = await ready;
      if (env.fail) throw new Error(env.fail);
      if (env.skip) {
        t.skip(env.skip);
        return null;
      }
      return { browser: scopedBrowser(env.browser), base: env.base };
    },
    /** Disconnects from the run's Chromium (closing this file's contexts) and closes the server, once; registered to run after the file's tests. */
    async close() {
      if (!ready) return;
      const env = await ready;
      ready = Promise.resolve({ skip: 'the browser suite is closed' });
      if (env.skip || env.fail) return;
      await env.browser.close();
      env.server.closeAllConnections();
      await new Promise((resolve) => env.server.close(resolve));
    },
  };
  if (hooks) after(() => suite.close());
  return suite;
}
