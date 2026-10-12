import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRouter } from '../js/shell/router.js';
import { createHistorySync, storedSet, HISTORY_KEY } from '../js/shell/history.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------------------------------------------------------------- a fake session history

// The browser's session history for one tab: the previous page's entry, then this page's entries.
// pushState / replaceState are synchronous; go() is queued and lands at flush(), as a browser lands
// it later with a popstate. Entries of another document leave the page when reached.
function fakeHistory(entries = [{ doc: 'previous', state: null }, { doc: 'page', state: null }]) {
  const h = {
    entries: entries.map((e) => ({ ...e })),
    index: entries.length - 1,
    log: [],
    queued: [],
    left: false,
    sync: null,
    get state() { return h.entries[h.index].state; },
    get length() { return h.entries.length; },
    pushState(state, title, url) {
      h.log.push(['push', state?.depth, url]);
      h.entries.splice(h.index + 1);
      h.entries.push({ doc: 'page', state });
      h.index++;
    },
    replaceState(state, title, url) {
      h.log.push(['replace', state?.depth, url]);
      h.entries[h.index] = { doc: 'page', state };
    },
    go(delta) {
      h.log.push(['go', delta]);
      h.queued.push(delta);
    },
    /** Land every queued traversal: a popstate for an entry of this page, else the page is left. */
    flush() {
      while (h.queued.length) h.traverse(h.queued.shift());
    },
    traverse(delta) {
      const to = h.index + delta;
      if (to < 0 || to >= h.entries.length || h.left) return;
      h.index = to;
      // An entry whose document is gone (replaced by a reload, or dropped) loads the page afresh.
      if (h.entries[to].doc === 'gone') { h.entries[to].doc = 'page'; h.onLoad?.(); return; }
      if (h.entries[to].doc !== 'page') { h.left = true; return; }
      h.sync?.popstate(h.entries[to].state);
    },
    /** The browser's Back button (or a mouse's back button). */
    back() { h.traverse(-1); h.flush(); },
    forward() { h.traverse(1); h.flush(); },
  };
  return h;
}

// The shell's screens; Back on each follows the shell's rules for the browser's Back.
function harness({ entries, history = fakeHistory(entries), navigation = 'navigate', ending = () => false, session = 'now', superseded } = {}) {
  const screens = {};
  for (const name of ['menu', 'board-choice', 'ready', 'playing', 'paused', 'results', 'records', 'settings', 'classic-2d']) {
    screens[name] = { show() {} };
  }
  screens.results.back = ({ router }) => router.go('menu');
  const router = createRouter({ screens, onChange: () => sync.sync() });
  const backs = [];
  // The shell's browser Back: the board pauses, the pause card holds the game, the end delay ignores it.
  const onBack = () => {
    backs.push(router.current);
    if (ending()) return;
    if (router.current === 'playing' || router.current === 'classic-2d') { router.go('paused'); return; }
    if (router.current === 'paused') return;
    router.back('history');
  };
  const sync = createHistorySync({ router, history, onBack, session, ...(superseded ? { superseded } : {}) });
  history.sync = sync;
  const started = sync.start(navigation);
  if (started) router.go('menu');
  return { router, history, sync, backs, session, started };
}

/** A tab's session storage. */
function fakeStorage() {
  const items = new Map();
  return { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => { items.set(k, String(v)); } };
}

/** This page's entries above its base, up to the current one. */
const depthAbove = (h, session = 'now') => h.index - h.entries.findIndex((e) => e.doc === 'page' && e.state?.[HISTORY_KEY] === session && e.state.depth === 0);
const settled = ({ router, history, session }) => {
  history.flush();
  assert.equal(depthAbove(history, session), router.stack.length, `history depth ${depthAbove(history, session)} mirrors the stack ${router.stack}`);
  assert.equal(history.state?.depth, router.stack.length);
};

// ---------------------------------------------------------------- the mirror

test('start stamps the current entry as the base, and the main menu pushes nothing', () => {
  const t = harness();
  assert.deepEqual(t.history.state, { [HISTORY_KEY]: 'now', depth: 0 });
  t.router.go('menu');
  assert.equal(t.history.log.filter(([op]) => op !== 'replace').length, 0, 'nothing pushed on the menu');
  assert.equal(t.history.length, 2);
  settled(t);
});

test('a stacked screen pushes one entry, a replace replaces it, and the URL never changes', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('board-choice');
  assert.deepEqual(t.history.log.at(-1), ['push', 1, undefined]);
  t.router.go('ready');
  assert.deepEqual(t.history.log.at(-1), ['push', 2, undefined]);
  t.router.go('playing', { replace: true });
  assert.deepEqual(t.history.log.at(-1), ['replace', 2, undefined], 'replace swaps the entry, as the router swaps the screen');
  settled(t);
  t.router.go('paused');
  settled(t);
  assert.ok(t.history.log.every(([op, , url]) => op === 'go' || url === undefined), 'state only: no URL is ever given');
});

test('an in-app Back and an unwind consume the matching entries, without running Back again', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('board-choice');
  t.router.back('key');
  assert.deepEqual(t.history.log.at(-1), ['go', -1]);
  settled(t);
  assert.deepEqual(t.backs, [], 'the consumed entry is not a second Back');
  t.router.go('board-choice');
  t.router.go('ready');
  t.router.go('playing', { replace: true });
  t.router.go('paused');
  settled(t);
  t.router.go('menu'); // back to menu from the pause card: the stack unwinds
  assert.deepEqual(t.history.log.at(-1), ['go', -3]);
  settled(t);
  assert.equal(t.router.current, 'menu');
  assert.deepEqual(t.backs, []);
});

test('a screen stacked while a traversal is in flight waits for it, then pushes', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('board-choice');
  t.router.back('key');
  t.router.go('settings');
  assert.deepEqual(t.history.log.at(-1), ['go', -1], 'nothing pushed before the traversal lands');
  settled(t);
  assert.deepEqual(t.history.log.at(-1), ['push', 1, undefined]);
  assert.equal(t.router.current, 'settings');
});

test('the browser\'s Back runs the shell\'s Back: board choice to menu, Records back to results', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('board-choice');
  t.history.back();
  assert.deepEqual(t.backs, ['board-choice']);
  assert.equal(t.router.current, 'menu');
  settled(t);

  t.router.go('classic-2d');
  t.router.go('results');
  t.router.go('records');
  settled(t);
  t.history.back();
  assert.equal(t.router.current, 'results', 'Records returns to where it came from');
  settled(t);
  t.history.back();
  assert.equal(t.router.current, 'menu', 'results → menu');
  settled(t);
  assert.equal(t.history.left, false);
});

test('on the board the browser\'s Back pauses, and the consumed entry is restored', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('classic-2d');
  settled(t);
  t.history.back();
  assert.equal(t.router.current, 'paused');
  settled(t);
  assert.equal(t.history.left, false);
});

test('on the pause card the browser\'s Back keeps the game where it is, every time', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('classic-2d');
  t.router.go('paused');
  settled(t);
  const length = t.history.length;
  for (let i = 0; i < 3; i++) {
    t.history.back();
    assert.equal(t.router.current, 'paused', 'never resumes');
    settled(t);
    assert.equal(t.history.length, length, 'the entry is restored in place');
  }
  assert.deepEqual(t.backs, ['paused', 'paused', 'paused']);
  assert.equal(t.history.left, false, 'never leaves');
});

test('during the 3D end delay the browser\'s Back does nothing, and the entry is restored', () => {
  let ending = true;
  const t = harness({ ending: () => ending });
  t.router.go('menu');
  t.router.go('board-choice');
  t.router.go('ready');
  t.router.go('playing', { replace: true });
  settled(t);
  t.history.back();
  assert.equal(t.router.current, 'playing');
  settled(t);
  ending = false;
  t.history.back();
  assert.equal(t.router.current, 'paused');
  settled(t);
});

test('only the main menu lets the browser\'s Back leave the page', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('settings');
  t.history.back();
  assert.equal(t.history.left, false);
  assert.equal(t.router.current, 'menu');
  settled(t);
  t.history.back();
  assert.equal(t.history.left, true, 'from the menu, Back leaves for the previous page');
  assert.deepEqual(t.backs, ['settings'], 'the menu runs no Back of its own');
});

test('a browser Forward never shows a screen: it is undone', () => {
  const t = harness();
  t.router.go('menu');
  t.router.go('board-choice');
  t.history.back();
  assert.equal(t.router.current, 'menu');
  settled(t);
  t.history.forward();
  assert.equal(t.router.current, 'menu', 'Forward shows nothing');
  settled(t);
  assert.deepEqual(t.backs, ['board-choice'], 'and runs no Back');
  // A Forward after an in-app Back is undone the same way.
  t.router.go('records');
  t.router.back('pointer');
  settled(t);
  t.history.forward();
  settled(t);
  assert.equal(t.router.current, 'menu');
});

test('after a reload the page\'s earlier entries are walked past, and the menu\'s Back leaves', () => {
  const old = (depth) => ({ doc: 'page', state: { [HISTORY_KEY]: 'before', depth } });
  const t = harness({ entries: [{ doc: 'previous', state: null }, old(0), old(1), old(2)], navigation: 'reload' });
  assert.deepEqual(t.history.state, { [HISTORY_KEY]: 'now', depth: 0 }, 'the reloaded entry is the new base');
  t.router.go('menu');
  settled(t);
  t.history.back();
  assert.equal(t.history.left, true, 'the earlier entries are walked past to the previous page');
  assert.deepEqual(t.backs, [], 'no Back runs on them');
  assert.equal(t.router.current, 'menu', 'and they never show a screen');
});

// A tab: each page load is a fresh history sync over the same session history and session storage.
function tab(entries) {
  const history = fakeHistory(entries);
  const store = fakeStorage();
  const superseded = storedSet(() => store, 'ms3d.history.superseded');
  const loads = [];
  const load = (navigation, session) => {
    const t = harness({ history, navigation, session, superseded });
    loads.push(t);
    return t;
  };
  history.onLoad = () => load('back_forward', `load-${loads.length}`);
  return { history, load, loads, store };
}

test('after a reload whose earlier entries load afresh, a Back from the menu walks past them, at any depth', () => {
  for (const deep of [1, 3]) {
    const tb = tab([{ doc: 'previous', state: null }, { doc: 'page', state: null }]);
    const a = tb.load('navigate', 'A');
    for (let i = 0; i < deep; i++) a.router.go(['settings', 'records', 'results'][i]);
    settled(a);
    // The reload replaces the current entry's document; every other entry of load A is now gone.
    for (const e of tb.history.entries) if (e.doc === 'page') e.doc = 'gone';
    tb.history.entries[tb.history.index].doc = 'page';
    const b = tb.load('reload', 'B');
    assert.equal(b.router.current, 'menu', 'a reload opens the main menu');
    const before = tb.history.log.length;
    tb.history.back();
    tb.history.flush();
    assert.equal(tb.history.left, true, `from the menu, Back leaves past load A's ${deep} earlier entries`);
    assert.equal(tb.loads.length, 3, 'load A\'s entry loads once, and walks out at once');
    assert.equal(tb.loads[2].started, false, 'it shows no screen');
    assert.deepEqual(tb.history.log.slice(before), [['go', -deep]], 'and stamps nothing');
  }
});

test('a return through the history after the page was dropped opens the menu, and its Back then leaves', () => {
  const tb = tab([{ doc: 'previous', state: null }, { doc: 'page', state: null }]);
  const a = tb.load('navigate', 'A');
  a.router.go('settings');
  settled(a);
  // The player went elsewhere from Settings, and the page was dropped from the back-forward cache.
  for (const e of tb.history.entries) if (e.doc === 'page') e.doc = 'gone';
  tb.history.entries.push({ doc: 'elsewhere', state: null });
  tb.history.index = tb.history.entries.length - 1;
  tb.history.back();
  const b = tb.loads.at(-1);
  assert.equal(b.started, true, 'the page comes back');
  assert.equal(b.router.current, 'menu', 'on the main menu');
  assert.equal(tb.history.left, false);
  tb.history.back();
  tb.history.flush();
  assert.equal(tb.history.left, true, 'its Back walks past the dropped load\'s menu entry and leaves');
});

test('superseded loads are kept in the tab\'s session storage, newest only; unusable storage keeps nothing', () => {
  const store = fakeStorage();
  const set = storedSet(() => store, 'k', 3);
  for (const id of ['a', 'b', 'c', 'd']) set.add(id);
  assert.deepEqual(JSON.parse(store.getItem('k')), ['b', 'c', 'd']);
  assert.equal(set.has('a'), false);
  assert.equal(set.has('d'), true);
  const blocked = storedSet(() => { throw new Error('blocked'); }, 'k');
  blocked.add('x');
  assert.equal(blocked.has('x'), false);
});

test('a reload opens the menu on a fresh base, with a fresh page\'s history unchanged', () => {
  const fresh = harness({ navigation: 'navigate' });
  assert.equal(fresh.history.length, 2, 'the first load adds nothing');
  const reload = harness({ entries: [{ doc: 'previous', state: null }, { doc: 'page', state: { [HISTORY_KEY]: 'before', depth: 3 } }], navigation: 'reload' });
  assert.deepEqual(reload.history.state, { [HISTORY_KEY]: 'now', depth: 0 });
  reload.router.go('menu');
  settled(reload);
});

test('the history sync is DOM-free', () => {
  const src = read('js/shell/history.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator|location)\b/);
  assert.doesNotMatch(src, /^\s*import\s/m);
});

// ---------------------------------------------------------------- the shell's wiring

const MAIN = read('js/main.js');

test('the shell mirrors its stack in window.history and routes popstate to the browser\'s Back', () => {
  assert.match(MAIN, /createHistorySync\(\{ router: SHELL, history: window\.history, onBack: /);
  assert.match(MAIN, /superseded: storedSet\(\(\) => window\.sessionStorage, 'ms3d\.history\.superseded'\)/,
    'superseded page loads are kept for the tab\'s life');
  assert.match(MAIN, /addEventListener\('popstate', \(e\) => HISTORY\.popstate\(e\.state\)\)/);
  assert.match(MAIN, /onChange: \(\) => \{[^\n]*HISTORY\.sync\(\)/, 'every router change syncs the history');
  assert.match(MAIN, /HISTORY\.start\(performance\.getEntriesByType\?\.\('navigation'\)\[0\]\?\.type\)/);
  const back = MAIN.slice(MAIN.indexOf('function historyBack('), MAIN.indexOf('\n}\n', MAIN.indexOf('function historyBack(')));
  assert.match(back, /if \(ending3D\(\)\) return;/, 'nothing during the 3D end delay');
  assert.match(back, /ui\.closeControls\(\) \|\| ui\.closeConfirm\(\)/, 'the controls modal or the confirmation closes first');
  assert.match(back, /S\.mode === 'playing' \|\| S\.mode === 'classic-2d'\) \{ pauseGame\('button'\)/, 'the board pauses as an asked-for pause');
  assert.match(back, /S\.mode === 'paused'/, 'the pause card holds the game');
  assert.match(back, /S\.mode === 'ready' && S\.game && S\.started/, 'a started game\'s ready card holds it');
  assert.match(back, /SHELL\.back\('history'\)/);
});

test('the leave-page guard is unchanged', () => {
  assert.match(MAIN, /guard: \(on\) => \(on \? window\.addEventListener\('beforeunload', guardLeave\) : window\.removeEventListener\('beforeunload', guardLeave\)\)/);
  assert.match(MAIN, /function guardLeave\(e\) \{\s*if \(reloading \|\| ending3D\(\)\) return;/);
});

// ---------------------------------------------------------------- browser: page.goBack()

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/previous') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>previous</title><p>previous page</p>');
      return;
    }
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

test('in a browser, Back steps back inside the game and leaves only from the main menu', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fixed board: every board seed the session draws is 12345.
    await page.addInitScript(() => {
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
    });
    await page.goto(`${base}/previous`);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const back = async (expected) => {
      await page.goBack();
      if (expected) await page.waitForFunction((m) => globalThis.__ms.state.mode === m, expected);
      await page.waitForTimeout(150); // the restored or consumed entries settle
    };
    const depth = () => page.evaluate(() => history.state?.depth);

    // board choice → menu
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.equal(await depth(), 1, 'one entry per stacked screen');
    await back('menu');
    assert.equal(page.url(), `${base}/index.html`, 'the URL never changes');

    // A Classic 2D Beginner board on seed 12345, first click on the centre cell.
    const startBeginner = async () => {
      await page.click('#menu-entry-classic-2d');
      if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
      await page.click('#c2d-choice [data-size="beginner"]');
      assert.equal(await mode(), 'classic-2d');
      const centres = await page.evaluate(async () => {
        const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
        const L = globalThis.__ms.board2D.layout;
        return Array.from({ length: 81 }, (_, c) => ({
          x: r.left + L.offsetX + ((c % 9) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / 9) + 0.5) * L.tile,
        }));
      });
      await page.mouse.click(centres[40].x, centres[40].y);
      await page.waitForFunction(() => globalThis.__ms.modes.state.started);
      return centres;
    };

    // a started Classic 2D game: Back pauses, and a second Back keeps it paused
    await startBeginner();
    await back('paused');
    await back();
    assert.equal(await mode(), 'paused', 'the second Back stays paused');
    assert.equal(await page.evaluate(() => globalThis.__ms.modes.state.started), true, 'the game is kept');
    assert.equal(page.url(), `${base}/index.html`, 'and the page is kept');
    await page.click('#p-menu');
    await page.click('#p-confirm-yes');
    assert.equal(await mode(), 'menu', 'leaving a started game stays the pause card\'s, with its confirmation');

    // a lost game's results → Records → Back returns to the results, then Back to the menu
    const centres = await startBeginner();
    const mines = await page.evaluate(async () => {
      const { generate } = await import('/js/generation/generate.js');
      return [...generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: 40, noGuess: false, seed: 12345 }).mines];
    });
    await page.mouse.click(centres[mines[0]].x, centres[mines[0]].y);
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
    await page.click('#r-records');
    assert.equal(await mode(), 'records');
    await back('results');
    await back('menu');
    assert.equal(await depth(), 0, 'the menu is the base entry');

    // a reload on Settings opens the main menu; its Back walks past the earlier entries and leaves
    await page.click('#menu-entry-settings');
    assert.equal(await depth(), 1);
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    assert.equal(await depth(), 0, 'the reloaded entry is the new base');

    // from the main menu, Back leaves the page
    await page.goBack();
    await page.waitForURL(`${base}/previous`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
