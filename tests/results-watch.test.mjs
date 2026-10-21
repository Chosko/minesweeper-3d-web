// Watch replay (replay-playback): the results screen's Watch replay action — its presence rules in
// the results flow and the screen's content, the route it opens with the finished game's own replay
// and the results screen to return to, the #r-watch markup and its wiring in js/main.js — and in a
// browser test of tests/results.test.mjs, which watches a game won through the real shell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resultsContent, createResultsView } from '../js/results/view.js';
import { createResultsFlow, RESULTS_SCREEN } from '../js/results/flow.js';
import { REPLAY_SCREEN } from '../js/records/replay-list.js';
import { createRouter } from '../js/shell/router.js';
import { createBoardIdentity } from '../js/records/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const summary = (over = {}) => ({
  id: 'g1', board: { ...BEGINNER }, outcome: 'won', elapsedMs: 47380, bbbv: 12, bbbvSolved: 12,
  clicks: { reveal: { effective: 14, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
  bbbvPerSecond: 12 / 47.38, efficiency: (100 * 12) / 14, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});
const sealed = () => ({ blob: new Uint8Array([1, 2, 3]), listing: { id: 'g1' } });
const fakeRecords = () => ({ record: () => null, available: () => true, counters: () => null, history: () => [] });
function fakeRouter(screens = ['results', 'records', REPLAY_SCREEN]) {
  const routes = [];
  return { routes, has: (n) => screens.includes(n), go: (n, o) => routes.push([n, o?.data]) };
}
const flowOver = ({ router = fakeRouter(), replays = null } = {}) => createResultsFlow({ records: fakeRecords(), replays, router, restart() {}, goMenu() {} });

// ---------------------------------------------------------------- presence rules

test('a finished game with its replay offers Watch replay', () => {
  const data = flowOver().finished(summary(), 'classic-2d', sealed());
  assert.equal(data.watch, true);
  assert.equal(resultsContent(data).watch, true);
});

test('a game whose replay was dropped shows no Watch replay', () => {
  const router = fakeRouter();
  const flow = flowOver({ router });
  const data = flow.finished(summary(), 'classic-2d', null);
  assert.equal(data.watch, false);
  assert.equal(resultsContent(data).watch, false);
  assert.equal(flowOver().finished(summary(), 'classic-2d').watch, false, 'no replay handed over');
  assert.equal(flowOver().finished(summary(), 'classic-2d', {}).watch, false, 'a replay without its blob');
  flow.watch();
  assert.deepEqual(router.routes.map(([n]) => n), ['results'], 'Watch does nothing without a replay');
});

test('without the replay viewer\'s route there is no Watch replay', () => {
  const router = fakeRouter(['results', 'records']);
  const flow = flowOver({ router });
  assert.equal(flow.finished(summary(), 'classic-2d', sealed()).watch, false);
  flow.watch();
  assert.deepEqual(router.routes.map(([n]) => n), ['results']);
});

test('the content carries no Watch replay unless it is offered', () => {
  assert.equal(resultsContent({ summary: summary() }).watch, false);
  assert.equal(resultsContent({ summary: summary(), watch: true }).watch, true);
});

test('Watch replay plays the finished game\'s own replay, saved or not, and returns to the results screen', async () => {
  const router = fakeRouter();
  const replays = { load: () => Promise.resolve(), add: () => Promise.reject(new Error('not saved')) };
  const flow = flowOver({ router, replays });
  const replay = sealed();
  const errors = console.error;
  console.error = () => {};
  try {
    flow.finished(summary(), 'classic-2d', replay);
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    console.error = errors;
  }
  flow.watch();
  const [screen, data] = router.routes.at(-1);
  assert.equal(screen, REPLAY_SCREEN);
  assert.equal(data.replay, replay, 'the replay from the hand-off, not the library');
  assert.equal(data.replayId, undefined);
  assert.deepEqual(data.returnTo, { screen: RESULTS_SCREEN });
});

test('Back from the viewer returns to the results screen, shown again from the flow', () => {
  const shown = [];
  let flow;
  const router = createRouter({
    screens: {
      menu: { show() {} },
      results: { show: (d) => shown.push(d ?? flow.current) },
      [REPLAY_SCREEN]: { show: (d) => shown.push(d), back: () => router.go(shown.at(-1).returnTo.screen, { data: shown.at(-1).returnTo.data }) },
    },
  });
  flow = createResultsFlow({ records: fakeRecords(), router, restart() {}, goMenu() {} });
  router.go('menu');
  const data = flow.finished(summary(), 'classic-2d', sealed());
  flow.watch();
  assert.equal(router.current, REPLAY_SCREEN);
  assert.equal(router.back('key'), true);
  assert.equal(router.current, 'results');
  assert.equal(shown.at(-1), data, 'the same results again');
  assert.deepEqual(router.stack, ['menu'], 'Back unwound to the results screen, not stacked it again');
});

// ---------------------------------------------------------------- Watch best

const bestRecords = (bestId) => ({ ...fakeRecords(), bests: () => ({ time: bestId ? { id: bestId, value: 40000, endedAt: '2026-10-01T10:00:00.000Z' } : null }) });
const keptReplays = (ids) => ({ load: () => Promise.resolve(), add: () => Promise.resolve(), has: (id) => ids.includes(id) });

test('Watch best shows when the board\'s fastest-time best has a kept replay and is not the game just shown', () => {
  const flow = (records, replays, router = fakeRouter()) => createResultsFlow({ records, replays, router, restart() {}, goMenu() {} });
  const shown = flow(bestRecords('best1'), keptReplays(['best1'])).finished(summary(), 'classic-2d', sealed());
  assert.equal(shown.watchBest, 'best1');
  assert.equal(resultsContent(shown).watchBest, true);
  assert.equal(flow(bestRecords('g1'), keptReplays(['g1'])).finished(summary(), 'classic-2d', sealed()).watchBest, null, 'the game shown is the best');
  assert.equal(flow(bestRecords('best1'), keptReplays([])).finished(summary(), 'classic-2d', sealed()).watchBest, null, 'its replay is not kept');
  assert.equal(flow(bestRecords(null), keptReplays(['best1'])).finished(summary(), 'classic-2d', sealed()).watchBest, null, 'no best yet');
  assert.equal(flow(bestRecords('best1'), keptReplays(['best1']), fakeRouter(['results'])).finished(summary(), 'classic-2d', sealed()).watchBest, null, 'no viewer');
  assert.equal(flow(bestRecords('best1'), null).finished(summary(), 'classic-2d', sealed()).watchBest, null, 'no library');
  assert.equal(resultsContent({ summary: summary() }).watchBest, false);
});

test('Watch best shows only after a win that set no new best: never after a loss, nor after a win that set any of the three bests', () => {
  const cmp = (set) => Object.fromEntries(['time', 'bbbvPerSecond', 'efficiency'].map((k) => [k, { best: { id: 'best1', value: 1 }, value: 1, difference: 0, newBest: k === set }]));
  const flow = (comparison) => createResultsFlow({ records: { ...bestRecords('best1'), record: () => comparison }, replays: keptReplays(['best1']), router: fakeRouter(), restart() {}, goMenu() {} });
  assert.equal(flow(cmp(null)).finished(summary(), 'classic-2d', sealed()).watchBest, 'best1', 'a win that set no best');
  assert.equal(flow(cmp(null)).finished(summary({ outcome: 'lost', bbbvSolved: 3 }), 'classic-2d', sealed()).watchBest, null, 'a loss');
  for (const set of ['time', 'bbbvPerSecond', 'efficiency']) {
    assert.equal(flow(cmp(set)).finished(summary(), 'classic-2d', sealed()).watchBest, null, `a win that set the ${set} best`);
  }
});

test('Watch best opens the viewer on the best\'s replay by id, returning to the results screen', () => {
  const router = fakeRouter();
  const flow = createResultsFlow({ records: bestRecords('best1'), replays: keptReplays(['best1']), router, restart() {}, goMenu() {} });
  flow.watchBest();
  assert.deepEqual(router.routes, [], 'nothing before a results screen');
  flow.finished(summary(), '3d', sealed());
  flow.watchBest();
  assert.deepEqual(router.routes.at(-1), [REPLAY_SCREEN, { replayId: 'best1', returnTo: { screen: RESULTS_SCREEN } }]);
});

test('the view shows Watch best beside Watch replay only when offered, and calls back on it', () => {
  const root = fakeRoot();
  const asked = [];
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {}, onWatchBest: () => asked.push('best') });
  view.show(resultsContent({ summary: summary(), watch: true, watchBest: 'b' }));
  assert.equal(root.el('r-watch-best').classList.contains('hidden'), false);
  root.el('r-watch-best').listeners.click();
  assert.deepEqual(asked, ['best']);
  view.show(resultsContent({ summary: summary(), watch: true, watchBest: null }));
  assert.equal(root.el('r-watch-best').classList.contains('hidden'), true);
  assert.match(RESULTS_HTML_ALL(), /id="r-watch"[^>]*>Watch replay<\/button>\s*<button type="button" id="r-watch-best" class="ui-button ui-button--secondary hidden" data-icon="trophy">Watch best<\/button>/);
  view.show(resultsContent({ summary: summary(), watch: true, watchBest: 'b' }));
  assert.equal(root.el('r-watch').classList.contains('ui-button--sm'), true, 'beside Watch best the secondary actions take their small size');
  assert.match(read('js/main.js'), /onWatchBest: \(\) => RESULTS\.watchBest\(\)/);
});
const RESULTS_HTML_ALL = () => { const html = read('index.html'); return html.slice(html.indexOf('<section id="results"'), html.indexOf('<!-- /Results -->')); };

// ---------------------------------------------------------------- the view

function fakeRoot() {
  const els = {};
  const el = (id) => {
    if (els[id]) return els[id];
    const classes = new Set(id === 'r-watch' ? ['hidden'] : []);
    const listeners = {};
    const kids = {};
    const node = {
      id, textContent: '', listeners,
      classList: {
        toggle: (c, on) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); },
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      toggleAttribute() {},
      setAttribute() {},
      removeAttribute() {},
      querySelector: (sel) => (kids[sel] ??= el(`${id} ${sel}`)),
    };
    els[id] = node;
    return node;
  };
  return { el, querySelector: (sel) => el(sel.replace(/^#/, '')), classList: el('root').classList };
}

test('the view shows Watch replay only when the content offers it, and calls back on it', () => {
  const root = fakeRoot();
  const asked = [];
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {}, onWatch: () => asked.push('watch') });
  view.show(resultsContent({ summary: summary(), watch: true }));
  assert.equal(root.el('r-watch').classList.contains('hidden'), false);
  root.el('r-watch').listeners.click();
  assert.deepEqual(asked, ['watch']);
  view.show(resultsContent({ summary: summary(), watch: false }));
  assert.equal(root.el('r-watch').classList.contains('hidden'), true);
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RESULTS_HTML = INDEX.slice(INDEX.indexOf('<section id="results"'), INDEX.indexOf('<!-- /Results -->'));

test('Watch replay sits on the right of the action bar before Records and Play again, a kit button hidden until offered', () => {
  const buttons = [...RESULTS_HTML.matchAll(/<button type="button" id="(r-[a-z-]+)" class="([^"]+)" data-icon="[a-z-]+">([^<]+)</g)].map((m) => [m[1], m[2], m[3].trim()]);
  assert.deepEqual(buttons.slice(-4), [
    ['r-watch', 'ui-button ui-button--secondary hidden', 'Watch replay'],
    ['r-watch-best', 'ui-button ui-button--secondary hidden', 'Watch best'],
    ['r-records', 'ui-button ui-button--secondary', 'Records'],
    ['r-again', 'ui-button ui-button--primary ui-button--lg', 'Play again'],
  ]);
});

test('the shell wires Watch replay to the flow and registers the viewer under the route it opens', () => {
  assert.match(MAIN, /onWatch: \(\) => RESULTS\.watch\(\)/);
  assert.match(MAIN, /\[REPLAY_SCREEN\]: \{/);
  assert.equal(REPLAY_SCREEN, 'replay');
});
