// Results screen (js/results/): the time and stat formats, the screen's content from a summary and
// its comparison, the results flow over fakes, the #results markup and its wiring in js/main.js,
// and in a browser a fixed Beginner board won through the real shell, then Play again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formatTime, formatTimeDifference, formatRate, formatRateDifference, formatEfficiency,
  formatEfficiencyDifference, resultsContent, DASH, NOTES,
} from '../js/results/view.js';
import { createResultsFlow, RESULTS_SCREEN } from '../js/results/flow.js';
import { createBoardIdentity } from '../js/records/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
const summary = (over = {}) => ({
  id: 'g1', board: { ...BEGINNER }, outcome: 'won', elapsedMs: 47380, bbbv: 120, bbbvSolved: 120, clicks: clicks(138),
  bbbvPerSecond: 120 / 47.38, efficiency: (100 * 120) / 138, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});
const comparison = {
  time: { best: { id: 'a', value: 45120, endedAt: 'x' }, value: 47380, difference: 2260, newBest: false },
  bbbvPerSecond: { best: { id: 'b', value: 2.4, endedAt: 'x' }, value: 2.5327, difference: 0.1327, newBest: true },
  efficiency: { best: null, value: 86.96, difference: null, newBest: true },
};

// ---------------------------------------------------------------- formats

test('times show to the tenth of a second, truncated, never rounded', () => {
  assert.equal(formatTime(47380), '47.3 s');
  assert.equal(formatTime(47990), '47.9 s');
  assert.equal(formatTime(47999.9), '47.9 s');
  assert.equal(formatTime(0), '0.0 s');
  assert.equal(formatTime(99), '0.0 s');
  assert.equal(formatTime(100), '0.1 s');
  assert.equal(formatTime(4700), '4.7 s');
  assert.equal(formatTime(612345), '612.3 s');
  assert.equal(formatTime(null), DASH);
  assert.equal(formatTime(undefined), DASH);
  assert.equal(formatTime(Number.NaN), DASH);
});

test('a time difference is signed and truncated toward zero', () => {
  assert.equal(formatTimeDifference(2280), '+2.2 s');
  assert.equal(formatTimeDifference(-1270), '−1.2 s');
  assert.equal(formatTimeDifference(-50), '−0.0 s');
  assert.equal(formatTimeDifference(0), '0.0 s');
  assert.equal(formatTimeDifference(null), DASH);
});

test('3BV/s shows two decimals, efficiency a whole percentage, a missing stat a dash', () => {
  assert.equal(formatRate(2.5327), '2.53');
  assert.equal(formatRate(0), '0.00');
  assert.equal(formatRate(null), DASH);
  assert.equal(formatRateDifference(0.1327), '+0.13');
  assert.equal(formatRateDifference(-0.5), '−0.50');
  assert.equal(formatRateDifference(null), DASH);
  assert.equal(formatEfficiency(86.96), '87%');
  assert.equal(formatEfficiency(100), '100%');
  assert.equal(formatEfficiency(null), DASH);
  assert.equal(formatEfficiencyDifference(-4.6), '−5%');
  assert.equal(formatEfficiencyDifference(3), '+3%');
  assert.equal(formatEfficiencyDifference(null), DASH);
});

test('the time formatter is the one pure function: no other time format in the results view', () => {
  const src = read('js/results/view.js');
  assert.match(src, /export function formatTime\(/);
  assert.doesNotMatch(src, /toFixed\(1\)|Math\.round\([^)]*\/ ?100\)/, 'time is never rounded to the tenth');
  assert.doesNotMatch(src, /document|window/, 'the formats and the content are DOM-free at import');
});

// ---------------------------------------------------------------- content

const statValue = (content, key) => content.stats.find((s) => s.key === key);

test('a won game shows its outcome, board, stats and the three best comparisons', () => {
  const c = resultsContent({ summary: summary(), mode: 'classic-2d', comparison, saved: true, notSaved: false });
  assert.equal(c.outcome, 'won');
  assert.equal(c.title, 'You won!');
  assert.equal(c.board, 'Beginner');
  assert.deepEqual(c.stats.filter((s) => s.shown).map((s) => [s.key, s.label, s.value]), [
    ['time', 'Time', '47.3 s'],
    ['bbbv', '3BV', '120'],
    ['bbbvPerSecond', '3BV/s', '2.53'],
    ['efficiency', 'Efficiency', '87%'],
  ]);
  assert.equal(statValue(c, 'bbbvSolved').shown, false, '3BV solved only on a loss');
  assert.deepEqual(c.bests.map((b) => [b.stat, b.label, b.best, b.difference, b.newBest]), [
    ['time', 'Best time', '45.1 s', '+2.2 s', false],
    ['bbbvPerSecond', 'Best 3BV/s', '2.40', '+0.13', true],
    ['efficiency', 'Best efficiency', DASH, DASH, true],
  ]);
  assert.deepEqual(c.notes, []);
});

test('the best time and its difference are truncated like every other time', () => {
  const cmp = { ...comparison, time: { best: { id: 'a', value: 47389, endedAt: 'x' }, value: 46010, difference: -1379, newBest: true } };
  const c = resultsContent({ summary: summary({ elapsedMs: 46010 }), comparison: cmp, saved: true });
  assert.equal(statValue(c, 'time').value, '46.0 s');
  assert.deepEqual([c.bests[0].best, c.bests[0].difference, c.bests[0].newBest], ['47.3 s', '−1.3 s', true]);
});

test('a lost game shows 3BV solved and no comparison', () => {
  const lost = summary({ outcome: 'lost', bbbvSolved: 40, bbbvPerSecond: 40 / 47.38, efficiency: (100 * 40) / 60, clicks: clicks(60) });
  const lostComparison = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, value: null, difference: null, newBest: false }]));
  const c = resultsContent({ summary: lost, comparison: lostComparison, saved: true });
  assert.equal(c.title, 'Game over');
  assert.deepEqual([statValue(c, 'bbbv').value, statValue(c, 'bbbvSolved').value, statValue(c, 'bbbvSolved').shown], ['120', '40', true]);
  assert.equal(statValue(c, 'bbbvPerSecond').value, '0.84');
  assert.equal(c.bests, null);
});

test('a stat that is not available shows a dash', () => {
  const c = resultsContent({ summary: summary({ bbbvPerSecond: null, efficiency: null }), comparison, saved: true });
  assert.equal(statValue(c, 'bbbvPerSecond').value, DASH);
  assert.equal(statValue(c, 'efficiency').value, DASH);
});

test('a failed recording shows the game without a comparison and says it was not saved', () => {
  const c = resultsContent({ summary: summary(), comparison: null, saved: false, notSaved: false });
  assert.equal(c.bests, null);
  assert.equal(statValue(c, 'time').value, '47.3 s');
  assert.deepEqual(c.notes, [NOTES.notRecorded]);
  const told = resultsContent({ summary: summary(), comparison, saved: true, notSaved: true });
  assert.deepEqual(told.notes, [NOTES.notSaved]);
  assert.ok(told.bests, 'records kept for the session still compare');
});

// ---------------------------------------------------------------- flow

function fakeRecords({ fail = false, available = true } = {}) {
  const calls = [];
  return {
    calls,
    record(s) { calls.push(['record', s.id]); if (fail) throw new RangeError('broken'); return comparison; },
    available() { calls.push(['available']); return available; },
  };
}
function fakeRouter(screens = ['results', 'coming-soon']) {
  const routes = [];
  return { routes, has: (n) => screens.includes(n), go: (n, o) => routes.push([n, o?.data]) };
}
function fakePauser() {
  const hooks = {};
  return { hooks, attach(name, fn) { (hooks[name] ??= new Set()).add(fn); return () => hooks[name].delete(fn); } };
}

test('the flow records a finished game before the results screen shows, and routes with the comparison', () => {
  const records = fakeRecords();
  const router = fakeRouter();
  const order = [];
  const flow = createResultsFlow({
    records: { ...records, record: (s) => { order.push('record'); return records.record(s); } },
    router: { ...router, go: (n, o) => { order.push('route'); router.go(n, o); } },
    restart() {}, goMenu() {},
  });
  const pauser = fakePauser();
  const detach = flow.attach(pauser);
  assert.equal(pauser.hooks.finished.size, 1, 'attached to the game-finished hand-off');
  const s = summary();
  for (const fn of pauser.hooks.finished) fn(s, 'classic-2d');
  assert.deepEqual(order, ['record', 'route']);
  assert.equal(RESULTS_SCREEN, 'results');
  assert.deepEqual(router.routes, [['results', { summary: s, mode: 'classic-2d', comparison, saved: true, notSaved: false }]]);
  assert.equal(flow.current.summary, s);
  detach();
  assert.equal(pauser.hooks.finished.size, 0);
});

test('a finished 3D game is recorded and routed to the results screen like a 2D game', () => {
  const records = fakeRecords();
  const router = fakeRouter();
  const flow = createResultsFlow({ records, router, restart() {}, goMenu() {} });
  const board = createBoardIdentity({ mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: false });
  const s = summary({ id: 'g3', board: { ...board } });
  const data = flow.finished(s, '3d');
  assert.deepEqual(records.calls, [['record', 'g3'], ['available']]);
  assert.deepEqual(router.routes, [['results', { summary: s, mode: '3d', comparison, saved: true, notSaved: false }]]);
  assert.equal(data.summary, s);
});

test('a fixed 3D board\'s null summary is not a record: no recording, no results screen', () => {
  const records = fakeRecords();
  const router = fakeRouter();
  const flow = createResultsFlow({ records, router, restart() {}, goMenu() {} });
  assert.equal(flow.finished(null, '3d'), null);
  assert.deepEqual(records.calls, []);
  assert.deepEqual(router.routes, []);
});

test('a failed recording still routes, without a comparison', () => {
  const router = fakeRouter();
  const flow = createResultsFlow({ records: fakeRecords({ fail: true }), router, restart() {}, goMenu() {} });
  const data = flow.finished(summary(), 'classic-2d');
  assert.deepEqual([data.comparison, data.saved], [null, false]);
  assert.equal(router.routes.length, 1);
});

test('records not saved this session are told once', () => {
  const router = fakeRouter();
  const flow = createResultsFlow({ records: fakeRecords({ available: false }), router, restart() {}, goMenu() {} });
  assert.equal(flow.finished(summary({ id: 'g1' }), 'classic-2d').notSaved, true);
  assert.equal(flow.finished(summary({ id: 'g2' }), 'classic-2d').notSaved, false);
});

test('the actions: Play again restarts the same choice, Records opens this board, Back to menu goes home', () => {
  const asked = [];
  const router = fakeRouter();
  const flow = createResultsFlow({
    records: fakeRecords(), router, restart: (source, data) => asked.push(['restart', source, data.mode]), goMenu: () => asked.push(['menu']),
  });
  flow.finished(summary(), 'classic-2d');
  flow.playAgain('pad');
  flow.toMenu();
  assert.deepEqual(asked, [['restart', 'pad', 'classic-2d'], ['menu']]);
  flow.openRecords();
  assert.deepEqual(router.routes.at(-1), ['coming-soon', { entry: 'records', title: 'Records', boardKey: 'classic-2d:square:9x9:10:guess' }],
    'the placeholder while the records screen has not landed');
  const withRecords = fakeRouter(['results', 'records']);
  const flow2 = createResultsFlow({ records: fakeRecords(), router: withRecords, restart() {}, goMenu() {} });
  flow2.finished(summary(), 'classic-2d');
  flow2.openRecords();
  assert.deepEqual(withRecords.routes.at(-1), ['records', { boardKey: 'classic-2d:square:9x9:10:guess' }]);
});

test('the flow is DOM-free', () => {
  assert.doesNotMatch(read('js/results/flow.js'), /document|window/);
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RESULTS_HTML = INDEX.slice(INDEX.indexOf('<section id="results"'), INDEX.indexOf('<!-- /Results -->'));

test('the results screen is the kit composition: outcome, board, stats, bests, note and three actions', () => {
  assert.ok(RESULTS_HTML.length > 400, 'index.html holds #results');
  assert.match(RESULTS_HTML, /^<section id="results" class="overlay hidden"/);
  const classes = [...RESULTS_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
  for (const id of ['results-title', 'results-board', 'rs-time', 'rs-bbbv', 'rs-bbbvSolved', 'rs-bbbvPerSecond', 'rs-efficiency',
    'results-bests', 'rb-time', 'rb-bbbvPerSecond', 'rb-efficiency', 'results-note', 'r-again', 'r-records', 'r-menu']) {
    assert.ok(RESULTS_HTML.includes(`id="${id}"`), `#${id}`);
  }
  assert.match(RESULTS_HTML, /class="ui-card ui-screen" aria-labelledby="results-title"/);
  const buttons = [...RESULTS_HTML.matchAll(/<button type="button" id="(r-[a-z]+)" class="ui-button ([^"]+)">([^<]+)</g)]
    .map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(buttons, [
    ['r-again', 'ui-button--primary', 'Play again'],
    ['r-records', 'ui-button--secondary', 'Records'],
    ['r-menu', 'ui-button--secondary', 'Back to menu'],
  ]);
});

test('the shell registers the results screen, its focus, its controller layer and the flow on the hand-off', () => {
  assert.match(MAIN, /results: \{ defaultFocus: '#r-again'/, 'Play again has default focus');
  assert.match(MAIN, /LAYER_SCREEN = \{[^}]*results: 'results'/, 'the controller reaches the results layer');
  assert.match(MAIN, /RESULTS\.attach\(PAUSE\)/, 'the flow attaches to the pause controller');
  const pauseBlock = MAIN.slice(MAIN.indexOf('createPauseController({'), MAIN.indexOf('});', MAIN.indexOf('createPauseController({')));
  assert.doesNotMatch(pauseBlock, /router/, 'the flow, not the pause controller, routes to results');
  assert.match(read('js/shell/pause.js'), /results flow/i);
});

test('the kit catalogue documents the stat detail line the comparison uses', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-stat__detail/);
  assert.match(read('css/components.css'), /\.ui-stat__detail\s*\{/);
  assert.match(read('dev/components.html'), /ui-stat__detail/, 'the gallery shows it');
});

// ---------------------------------------------------------------- browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
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

test('in a browser, a fixed Beginner board won through the shell shows the results, then Play again', async (t) => {
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
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fixed board: every board seed the session draws is 12345.
    await page.addInitScript(() => {
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);

    await page.click('#menu-entry-classic-2d');
    if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
    await page.click('#c2d-choice [data-size="beginner"]');
    assert.equal(await mode(), 'classic-2d');

    // The cell centres, from the board view's own layout of the canvas.
    const centres = await page.evaluate(async () => {
      const { boardLayout } = await import('/js/classic2d/board-view.js');
      const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const L = boardLayout({ cols: 9, rows: 9, width: r.width, height: r.height });
      return Array.from({ length: 81 }, (_, c) => ({
        x: r.left + L.offsetX + ((c % 9) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / 9) + 0.5) * L.tile,
      }));
    });
    const first = 40;
    const mines = await page.evaluate(async (fc) => {
      const { generate } = await import('/js/generation/generate.js');
      const r = generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: fc, noGuess: false, seed: 12345 });
      return [...r.mines];
    }, first);
    await page.mouse.click(centres[first].x, centres[first].y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    for (let c = 0; c < 81 && (await mode()) === 'classic-2d'; c++) {
      if (mines.includes(c)) continue;
      await page.mouse.click(centres[c].x, centres[c].y);
    }
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');

    const shown = await page.evaluate(() => {
      const text = (id) => document.getElementById(id).textContent.trim();
      const value = (id) => document.querySelector(`#${id} .ui-stat__value`).textContent.trim();
      const visible = (id) => !document.getElementById(id).classList.contains('hidden') && document.getElementById(id).getBoundingClientRect().width > 0;
      return {
        title: text('results-title'), board: text('results-board'), time: value('rs-time'), bbbv: value('rs-bbbv'),
        rate: value('rs-bbbvPerSecond'), efficiency: value('rs-efficiency'), solvedShown: visible('rs-bbbvSolved'),
        bests: visible('results-bests'), bestTime: value('rb-time'), detail: document.querySelector('#rb-time .ui-stat__detail').textContent.trim(),
        board2d: visible('c2d'), focus: document.activeElement.id, games: globalThis.__ms.records.counters('classic-2d:square:9x9:10:guess').games,
      };
    });
    assert.equal(shown.title, 'You won!');
    assert.equal(shown.board, 'Beginner');
    assert.match(shown.time, /^\d+\.\d s$/);
    assert.match(shown.bbbv, /^\d+$/);
    assert.match(shown.rate, /^\d+\.\d\d$/);
    assert.match(shown.efficiency, /^\d+%$/);
    assert.equal(shown.solvedShown, false);
    assert.equal(shown.bests, true, 'the comparison shows on a win');
    assert.equal(shown.bestTime, '—', 'no standing best on a first win');
    assert.match(shown.detail, /New best/);
    assert.equal(shown.board2d, true, 'the finished board stays visible behind the screen');
    assert.equal(shown.focus, 'r-again', 'Play again has default focus');
    assert.equal(shown.games, 1, 'the game was recorded');

    // Records, then Back: the results screen shows again, and Play again still starts the same choice.
    await page.click('#r-records');
    assert.equal(await mode(), 'records', 'the records screen');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Beginner', 'on this board');
    assert.equal(await page.evaluate(() => document.querySelector('#rec-games .ui-stat__value').textContent), '1');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'results');
    assert.equal(await page.evaluate(() => document.getElementById('results-title').textContent), 'You won!');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-again');

    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d', 'Play again goes back to the board');
    assert.deepEqual(await page.evaluate(() => ({ ...globalThis.__ms.modes.state })),
      { mode: 'classic-2d', started: false, finished: false, canPause: false }, 'a fresh game of the same choice');
    assert.equal(await page.evaluate(() => document.getElementById('hud-size').textContent), '9 × 9');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
