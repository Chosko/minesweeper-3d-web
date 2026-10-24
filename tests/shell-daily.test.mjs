// The daily boards in the shell (js/shell/daily.js): each row's counted attempt and state from the
// records — across a reload and across midnight —, the days in a row, the boards pre-generated when
// the main menu shows and nothing asked for a used attempt, the Daily screen's entries — every mode
// in menu order, the modes not built coming soon — and its binding; its markup in index.html and its
// wiring in js/main.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAILY_SCREEN, NOT_PLAYED, WON, LOST, dailyIdentity, countedAttempt, dailyRows, dailyModes, dailyPanel, createDailyBoards, bindDailyScreen,
  dailyDateLabel,
} from '../js/shell/daily.js';
import { dailyGame } from '../js/records/board-code.js';
import { createRecordsModel } from '../js/records/model.js';
import { createRecordsStore, IN_PROGRESS_DOC } from '../js/records/store.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { buildSummary } from '../js/records/summary.js';
import { UNAVAILABLE_REASONS, MENU_ENTRIES, COMING_SOON } from '../js/shell/menu.js';
import { dateText } from '../js/records/board-code.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
let n = 0;
// A daily game's summary through the real builder: the Daily board, its date and start cell.
function daily(id, date, { outcome = 'won', ms = 48230, endedAt = new Date(2026, 9, 11, 12) } = {}) {
  const engine = { bbbv: 100, bbbvSolved: outcome === 'won' ? 100 : 40, clicks: clicks(120) };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  const g = dailyGame(id, date);
  return buildSummary({
    engine, elapsedMs: ms, board: dailyIdentity(id), seed: g.seed, generatorVersion: g.generatorVersion,
    endedAt, id: `d${++n}`, startCell: g.startCell, daily: date,
  });
}
const store = (games = []) => {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  return model;
};
const TODAY = new Date(2026, 9, 11, 9, 30);

test('daily rows: Expert and Cube, today\'s local date, not played, their codes, Play offered', () => {
  const rows = dailyRows({ records: store(), now: TODAY });
  assert.deepEqual(rows.map((r) => [r.id, r.label, r.board]), [['expert', 'Expert', 'Expert · no-guess'], ['cube', 'Cube', '8 × 8 × 8 · 40 mines · no-guess']]);
  for (const r of rows) {
    assert.equal(r.date, '20261011');
    assert.equal(r.dateLabel, '11 Oct 2026');
    assert.equal(r.state, 'unplayed');
    assert.equal(r.result, NOT_PLAYED);
    assert.equal(r.time, null, 'no time before a win');
    assert.equal(r.canPlay, true);
    assert.equal(r.code, dailyGame(r.id, '20261011').code);
    assert.equal(r.streak, 'Days in a row 0 · longest 0');
  }
  assert.equal(DAILY_SCREEN, 'daily');
  assert.equal(dailyDateLabel('20270105'), '5 Jan 2027');
});

test('daily rows: the counted attempt is the first daily game of the date; its result shows and Play is gone', () => {
  const won = daily('expert', '20261011', { ms: 48291 });
  const records = store([daily('cube', '20261010'), won, daily('cube', '20261011', { outcome: 'lost' })]);
  const [expert, cube] = dailyRows({ records, now: TODAY, replays: { has: () => true } });
  assert.deepEqual([expert.state, expert.result, expert.time, expert.canPlay, expert.attempt, expert.watch], ['won', 'Won 48.291 s', '48.291 s', false, won.id, won.id]);
  assert.deepEqual([cube.state, cube.result, cube.time, cube.canPlay, cube.watch], ['lost', LOST, null, false, null], 'a lost game\'s kept replay offers no Watch replay');
  assert.deepEqual([cube.current, cube.longest], [2, 2]);
  assert.equal(cube.streak, 'Days in a row 2 · longest 2');
  assert.equal(countedAttempt(records, 'expert', '20261011').id, won.id);
  assert.equal(countedAttempt(records, 'expert', '20261012'), null);
});

test('daily rows: the cube row is disabled with the 3D entry\'s reason when 3D cannot run', () => {
  const [expert, cube] = dailyRows({ records: store(), now: TODAY, unavailable: { '3d': UNAVAILABLE_REASONS.webgl2 } });
  assert.equal(expert.canPlay, true);
  assert.equal(cube.canPlay, false);
  assert.equal(cube.reason, UNAVAILABLE_REASONS.webgl2);
});

test('daily rows: a started daily left by a reload is that date\'s counted attempt, a loss', async () => {
  const backend = createMemoryBackend();
  const first = createRecordsStore({ storage: createStorage({ backend }) });
  await first.load();
  first.begin(daily('expert', '20261011', { outcome: 'abandoned', ms: 3000 })); // the marker of a started game
  await first.settled();
  assert.equal(dailyRows({ records: first, now: TODAY })[0].state, 'unplayed', 'still running in this page');
  const reloaded = createRecordsStore({ storage: createStorage({ backend }) });
  await reloaded.load();
  const [expert] = dailyRows({ records: reloaded, now: TODAY });
  assert.deepEqual([expert.state, expert.result, expert.canPlay], ['lost', LOST, false]);
  await reloaded.settled();
  assert.equal(JSON.parse(backend.documents.get(IN_PROGRESS_DOC) ?? 'null')?.data ?? null, null);
});

test('daily rows: a daily started before midnight is its own date\'s attempt; the new day is unplayed', () => {
  const late = daily('expert', '20261011', { endedAt: new Date(2026, 9, 12, 0, 4) });
  const records = store([late]);
  const [before] = dailyRows({ records, now: new Date(2026, 9, 11, 23, 59) });
  assert.equal(before.state, 'won', 'recorded on its own date');
  const [after] = dailyRows({ records, now: new Date(2026, 9, 12, 0, 5) });
  assert.equal(after.date, '20261012');
  assert.equal(after.state, 'unplayed');
  assert.equal(after.canPlay, true);
  assert.equal(after.current, 1, 'yesterday\'s daily keeps the run alive today');
});

test('daily modes: every mode in menu order; Classic 2D and 3D with their board, the others coming soon', () => {
  const modes = dailyModes({ records: store(), now: TODAY });
  assert.deepEqual(modes.map((m) => m.mode), MENU_ENTRIES.filter((e) => e.mode).map((e) => e.mode));
  assert.deepEqual(modes.map((m) => m.mode), ['classic-2d', 'hexagon', 'triangle', 'surface', '3d']);
  assert.deepEqual(modes.map((m) => [m.label, m.daily?.id ?? null, m.line]), [
    ['Classic 2D', 'expert', 'Expert · 30 × 16 · 99 mines · no-guess'],
    ['Hexagon', null, COMING_SOON],
    ['Triangle', null, COMING_SOON],
    ['Surface', null, COMING_SOON],
    ['3D', 'cube', 'Cube · 8 × 8 × 8 · 40 mines · no-guess'],
  ]);
  assert.deepEqual(modes.map((m) => m.title), [
    'Classic 2D · Expert · no-guess', 'Hexagon · daily', 'Triangle · daily', 'Surface · daily', '3D · Cube 8 × 8 × 8 · 40 mines · no-guess',
  ]);
  assert.deepEqual(modes.map((m) => m.summary), [
    'Daily · Classic 2D · Expert · no-guess', 'Daily · Hexagon · coming soon', 'Daily · Triangle · coming soon', 'Daily · Surface · coming soon',
    'Daily · 3D · Cube 8 × 8 × 8 · 40 mines · no-guess',
  ]);
  assert.equal(modes[1].note, 'Hexagon gets its own daily board when the mode arrives.');
  assert.equal(modes[0].note, null);
  assert.deepEqual(modes.map((m) => m.canPlay), [true, false, false, false, true], 'a coming-soon mode cannot be played');
});

test('daily modes: a played row says so in the summary; 3D without WebGL 2 reads its reason and cannot be played', () => {
  const records = store([daily('expert', '20261011', { ms: 48213 })]);
  const [two, , , , three] = dailyModes({ records, now: TODAY, unavailable: { '3d': UNAVAILABLE_REASONS.webgl2 } });
  assert.deepEqual([two.daily.result, two.summary, two.canPlay], ['Won 48.213 s', 'Daily · Classic 2D · played today', false]);
  assert.deepEqual([three.line, three.summary, three.canPlay, three.daily.reason], [UNAVAILABLE_REASONS.webgl2, 'Daily · 3D · needs WebGL 2', false, UNAVAILABLE_REASONS.webgl2]);
});

test('daily panel: the closed Expert board for Classic 2D, the 3D scene for the cube (still without WebGL 2), a colour badge for a coming-soon mode', () => {
  const modes = dailyModes({ records: store(), now: TODAY });
  assert.deepEqual(dailyPanel(modes[0]), { kind: 'daily', tag: '' });
  assert.deepEqual(dailyPanel(modes[4]), { kind: 'scene', tag: '' });
  assert.deepEqual(dailyPanel(modes[4], { missing: ['webgl2'] }), { kind: 'still', tag: '' });
  assert.deepEqual(dailyPanel(modes[1]), { kind: 'badge', entry: 'hexagon', label: COMING_SOON, note: null, locked: false });
});

// ---------------------------------------------------------------- pre-generation

function fakeClient() {
  const c = {
    requests: [], cancels: 0, pending: [],
    request(req) { c.requests.push(req); return new Promise((resolve) => c.pending.push({ req, resolve })); },
    cancel() { c.cancels += 1; },
    answer(result) { const p = c.pending.shift(); p.resolve(result ?? { ok: true, mines: new Int32Array(0), seed: p.req.seed, generatorVersion: 1 }); },
  };
  return c;
}

test('pre-generation: when the menu shows, today\'s unused daily boards are asked of each mode\'s client, once', () => {
  const two = fakeClient();
  const three = fakeClient();
  const boards = createDailyBoards({ clients: { 'classic-2d': () => two, '3d': () => three } });
  boards.prepare(store(), TODAY);
  assert.deepEqual(two.requests, [dailyGame('expert', '20261011').request]);
  assert.deepEqual(three.requests, [dailyGame('cube', '20261011').request]);
  boards.prepare(store(), TODAY);
  assert.equal(two.requests.length + three.requests.length, 2, 'a board held or in flight is not asked again');
  assert.equal(boards.has(dailyGame('expert', '20261011').code), true);
});

test('pre-generation: nothing is asked for a used attempt; take hands a board over once; a failed one is asked again', async () => {
  const two = fakeClient();
  const three = fakeClient();
  const boards = createDailyBoards({ clients: { 'classic-2d': () => two, '3d': () => three } });
  boards.prepare(store([daily('cube', '20261011')]), TODAY);
  assert.equal(three.requests.length, 0, 'the cube was played today');
  assert.equal(two.requests.length, 1);
  const code = dailyGame('expert', '20261011').code;
  two.answer();
  await new Promise((r) => setImmediate(r));
  const pg = boards.take(code);
  assert.equal(pg.cell, dailyGame('expert', '20261011').startCell);
  assert.equal(pg.result.ok, true);
  assert.equal(boards.take(code), null, 'handed over once');
  boards.prepare(store(), TODAY);
  two.answer({ ok: false, cancelled: true, reason: 'cancelled' });
  await new Promise((r) => setImmediate(r));
  assert.equal(boards.take(code), null, 'a cancelled board is not handed over');
  boards.prepare(store(), TODAY);
  assert.equal(two.requests.length, 3, 'and is asked again at the next menu');
  boards.prepare(store(), new Date(2026, 9, 12, 9));
  assert.equal(boards.has(code), false, 'yesterday\'s board is dropped');
});

// ---------------------------------------------------------------- the screen

// A small element tree: enough of the DOM for the binder — attribute and class selectors, the
// disabled flag, attributes, listeners and keydown events.
function el(attrs = {}, ...children) {
  const classes = new Set((attrs.class ?? '').split(/\s+/).filter(Boolean));
  const e = {
    id: attrs.id ?? '', dataset: {}, attrs: {}, textContent: '', disabled: 'disabled' in attrs, listeners: {}, children,
    classList: { toggle: (c, on) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    setAttribute(k, v) { e.attrs[k] = String(v); },
    getAttribute(k) { return e.attrs[k] ?? null; },
    removeAttribute(k) { delete e.attrs[k]; },
    toggleAttribute(k, on) { if (on) e.attrs[k] = ''; else delete e.attrs[k]; },
    addEventListener(t, f) { (e.listeners[t] ??= []).push(f); },
    fire(t, props = {}) { const ev = { target: e, currentTarget: e, preventDefault() { ev.prevented = true; }, ...props }; for (const f of e.listeners[t] ?? []) f(ev); return ev; },
    click() { if (!e.disabled) e.fire('click'); },
    closest(sel) { for (let n = e; n; n = n.parent) if (matches(n, sel)) return n; return null; },
    querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (matches(c, sel)) out.push(c); walk(c); } }; walk(e); return out; },
    querySelector(sel) { return e.querySelectorAll(sel)[0] ?? null; },
    get classes() { return classes; },
  };
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('data-')) e.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    else if (k !== 'class' && k !== 'id' && k !== 'disabled') e.attrs[k] = v;
  }
  for (const c of children) c.parent = e;
  return e;
}
function matches(n, sel) {
  return sel.split(',').map((s) => s.trim()).some((one) => {
    if (one.startsWith('.')) return n.classList.contains(one.slice(1));
    if (one === 'button') return n.attrs.type === 'button';
    const m = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/.exec(one);
    if (!m) return false;
    const key = m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
    return n.dataset[key] !== undefined && (m[2] === undefined || n.dataset[key] === m[2]);
  });
}
// The Daily screen's markup as the binder reads it: the date, one option per mode (a chip and a meta
// line), the selected mode's title, reason, note, state and streak, code chip, summary, Watch replay,
// Play and Back.
function fakeScreen() {
  const option = (mode) => el({ class: 'ui-option', type: 'button', id: `daily-entry-${mode}`, 'data-mode': mode },
    el({ class: 'ui-option__line' }, el({ class: 'ui-chip hidden', 'data-state': '' }), el({ class: 'ui-text hidden', 'data-time': '' })),
    el({ class: 'ui-option__meta', 'data-line': '' }));
  const code = el({ 'data-code-group': '' }, el({ class: 'ui-code', 'data-code': '' }, el({ class: 'ui-code__value' }), el({ type: 'button', 'data-copy': 'code' }), el({ type: 'button', 'data-copy': 'link' })));
  return el({ id: 'daily' },
    el({ type: 'button', id: 'daily-back', 'data-back': '' }),
    el({ 'data-date': '' }),
    el({}, ...['classic-2d', 'hexagon', 'triangle', 'surface', '3d'].map(option)),
    el({ 'data-title': '' }),
    el({ class: 'hidden', 'data-reason': '' }),
    el({ class: 'hidden', 'data-note': '' }),
    el({ 'data-status': '' }, el({}, el({ class: 'ui-chip', 'data-result': '' }), el({ class: 'ui-text hidden', 'data-result-time': '' })), el({ 'data-streak': '' })),
    code,
    el({ 'data-summary': '' }),
    el({ type: 'button', class: 'hidden', id: 'daily-watch', 'data-watch': '' }),
    el({ type: 'button', id: 'daily-play', 'data-play': '' }));
}
const at = (root, sel) => root.querySelector(sel);

test('a won daily\'s time is the results screen\'s formatTime, never a local tenths format', () => {
  const src = read('js/shell/daily.js');
  assert.match(src, /import \{[^}]*\bformatTime\b[^}]*\} from '\.\.\/results\/view\.js'/);
  assert.doesNotMatch(src, /\btenths\b/);
});

test('the Daily screen lists every mode with its state chip and board line, selects the first playable one and focuses it', () => {
  const root = fakeScreen();
  const selected = [];
  const screen = bindDailyScreen({ root, onPlay: () => {}, onWatch: () => {}, onBack: () => {}, onSelect: (m) => selected.push(m.mode) });
  const won = daily('expert', '20261011', { ms: 47380 });
  screen.show(dailyModes({ records: store([won]), now: TODAY, replays: { has: () => true } }));
  const opt = (mode) => at(root, `[data-mode="${mode}"]`);
  assert.equal(at(root, '[data-date]').textContent, '11 Oct 2026');
  assert.equal(at(opt('classic-2d'), '[data-state]').textContent, WON, 'the Won badge holds the state alone');
  assert.equal(at(opt('classic-2d'), '[data-state]').classes.has('ui-chip--won'), true);
  assert.equal(at(opt('classic-2d'), '[data-time]').textContent, '47.380 s', 'the time apart from it: the results screen\'s formatTime, trailing zeros kept');
  assert.equal(at(opt('classic-2d'), '[data-time]').classes.has('hidden'), false);
  assert.equal(at(opt('3d'), '[data-time]').classes.has('hidden'), true, 'no time for a row not won');
  assert.equal(at(opt('3d'), '[data-state]').textContent, NOT_PLAYED);
  assert.equal(at(opt('3d'), '[data-state]').classes.has('ui-chip--muted'), true);
  for (const mode of ['hexagon', 'triangle', 'surface']) {
    assert.equal(at(opt(mode), '[data-state]').classes.has('hidden'), true, `${mode}: no state chip`);
    assert.equal(at(opt(mode), '[data-line]').textContent, COMING_SOON);
  }
  assert.equal(at(opt('classic-2d'), '[data-line]').textContent, 'Expert · 30 × 16 · 99 mines · no-guess');
  assert.equal(screen.selected, '3d', 'today\'s first playable mode');
  assert.deepEqual(selected, ['3d']);
  assert.deepEqual(['classic-2d', 'hexagon', 'triangle', 'surface', '3d'].map((m) => opt(m).attrs['aria-pressed']), ['false', 'false', 'false', 'false', 'true']);
  assert.equal(screen.defaultFocus(), '#daily-entry-3d');
  assert.equal(at(root, '[data-title]').textContent, '3D · Cube 8 × 8 × 8 · 40 mines · no-guess');
  assert.equal(at(root, '[data-streak]').textContent, 'Days in a row 0 · longest 0');
  assert.equal(at(root, '[data-result-time]').classes.has('hidden'), true);
  assert.equal(at(root, '[data-code-group]').classes.has('hidden'), false);
  assert.equal(at(root, '.ui-code__value').textContent, dailyGame('cube', '20261011').code);
  assert.equal(at(root, '[data-summary]').textContent, 'Daily · 3D · Cube 8 × 8 × 8 · 40 mines · no-guess');
  assert.equal(at(root, '[data-play]').disabled, false);
  assert.equal(at(root, '[data-watch]').classes.has('hidden'), true);
});

test('the Daily screen: Play plays the selected mode\'s board, Watch replay only for a won game the library kept, Play disabled once played and on a coming-soon mode', () => {
  const root = fakeScreen();
  const calls = [];
  const screen = bindDailyScreen({ root, onPlay: (id) => calls.push(['play', id]), onWatch: (id) => calls.push(['watch', id]), onBack: () => calls.push(['back']) });
  const won = daily('expert', '20261011', { ms: 47380 });
  const kept = new Set([won.id]);
  screen.show(dailyModes({ records: store([won]), now: TODAY, replays: { has: (id) => kept.has(id) } }));
  at(root, '[data-play]').click();
  at(root, '[data-mode="classic-2d"]').click();
  assert.equal(screen.selected, 'classic-2d');
  assert.equal(at(root, '[data-play]').disabled, true, 'today\'s try is used');
  assert.equal(at(root, '[data-watch]').classes.has('hidden'), false, 'its replay was kept');
  assert.deepEqual([at(root, '[data-result]').textContent, at(root, '[data-result-time]').textContent], [WON, '47.380 s'], 'a Won badge, then its time');
  assert.equal(at(root, '[data-result-time]').classes.has('hidden'), false);
  assert.equal(at(root, '[data-summary]').textContent, 'Daily · Classic 2D · played today');
  at(root, '[data-watch]').click();
  at(root, '[data-play]').click();
  at(root, '[data-mode="hexagon"]').click();
  assert.equal(at(root, '[data-play]').disabled, true, 'a coming-soon mode cannot be played');
  assert.equal(at(root, '[data-watch]').classes.has('hidden'), true);
  assert.equal(at(root, '[data-code]').classes.has('hidden'), true, 'no board, no code');
  assert.equal(at(root, '[data-code-group]').classes.has('hidden'), true, 'nor its label');
  assert.equal(at(root, '[data-status]').classes.has('hidden'), true, 'no state, no days in a row');
  assert.equal(at(root, '[data-note]').classes.has('hidden'), false);
  assert.equal(at(root, '[data-note]').textContent, 'Hexagon gets its own daily board when the mode arrives.');
  assert.equal(at(root, '[data-summary]').textContent, 'Daily · Hexagon · coming soon');
  at(root, '[data-back]').click();
  assert.deepEqual(calls, [['play', 'cube'], ['watch', won.id], ['back']]);
  kept.clear();
  screen.show(dailyModes({ records: store([won]), now: TODAY, replays: { has: (id) => kept.has(id) } }));
  assert.equal(screen.selected, 'hexagon', 'the selection stays across a refresh');
  screen.select('classic-2d');
  assert.equal(at(root, '[data-watch]').classes.has('hidden'), true, 'a replay the library no longer keeps');
});

test('the Daily screen: Enter on a mode selects it and plays it; 3D without WebGL 2 is disabled with its reason', () => {
  const root = fakeScreen();
  const calls = [];
  const screen = bindDailyScreen({ root, onPlay: (id) => calls.push(id), onWatch: () => {}, onBack: () => {} });
  screen.show(dailyModes({ records: store(), now: TODAY, unavailable: { '3d': UNAVAILABLE_REASONS.webgl2 } }));
  const three = at(root, '[data-mode="3d"]');
  assert.equal(three.disabled, true, 'the 3D entry is disabled');
  assert.equal(at(three, '[data-line]').textContent, UNAVAILABLE_REASONS.webgl2, 'with its reason');
  assert.equal(screen.selected, 'classic-2d');
  screen.select('3d');
  assert.equal(screen.selected, 'classic-2d', 'a disabled entry is never selected');
  const hex = at(root, '[data-mode="hexagon"]');
  const enter = (target) => root.fire('keydown', { key: 'Enter', target });
  assert.ok(enter(hex).prevented);
  assert.equal(screen.selected, 'hexagon');
  assert.deepEqual(calls, [], 'a coming-soon mode does not play');
  enter(at(root, '[data-mode="classic-2d"]'));
  assert.deepEqual(calls, ['expert']);
  assert.equal(enter(at(root, '[data-back]')).prevented, undefined, 'another button activates itself');
  root.fire('keydown', { key: 'Enter', target: hex, repeat: true });
  assert.equal(screen.selected, 'classic-2d', 'a held Enter does nothing');
  screen.show(dailyModes({ records: store([daily('expert', '20261011')]), now: TODAY, unavailable: { '3d': UNAVAILABLE_REASONS.webgl2 } }));
  assert.equal(screen.defaultFocus(), '#daily-entry-classic-2d', 'the selected entry, played or not');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const STYLE = read('css/style.css');
const DAILY_HTML = INDEX.slice(INDEX.indexOf('<section id="daily"'), INDEX.indexOf('<!-- /Daily -->'));

test('index.html holds the Daily screen in the board choice composition: the frame under its title bar, its heading, five mode options, the panel, code chip and bottom bar', () => {
  assert.ok(DAILY_HTML.length > 400, 'index.html has #daily');
  assert.match(DAILY_HTML, /^<section id="daily" class="overlay ui-backdrop hidden" aria-label="Daily">\s*<section class="ui-frame" id="daily-frame" aria-labelledby="daily-title">/, 'no game title above the window');
  assert.match(DAILY_HTML, /id="daily-back" class="ui-button ui-button--secondary ui-button--sm ui-frame__back" data-back data-icon="arrow-left" aria-label="Back to Main menu" title="Back"><\/button>/,
    'Back: the title bar\'s arrow alone, named Back to Main menu');
  assert.match(DAILY_HTML, /<div class="ui-frame__heading">\s*<h2 class="ui-frame__title" id="daily-title">Daily<\/h2>/, 'Daily its heading');
  const modes = [...DAILY_HTML.matchAll(/<button type="button" class="ui-option" aria-pressed="false" id="daily-entry-([\w-]+)" data-mode="([\w-]+)"/g)];
  assert.deepEqual(modes.map((m) => [m[1], m[2]]), MENU_ENTRIES.filter((e) => e.mode).map((e) => [e.mode, e.mode]), 'one option per mode, in menu order');
  for (const mode of ['classic-2d', '3d']) {
    assert.match(DAILY_HTML, new RegExp(`data-mode="${mode}"><span class="ui-option__line"><span class="ui-option__name">[^<]+</span><span class="ui-row" data-outcome><span class="ui-chip ui-chip--muted" data-state>Not played</span><span class="ui-text hidden" data-time></span></span></span>`),
      `${mode}: its state badge and, apart from it, the time, kept together in the name line`);
  }
  assert.match(DAILY_HTML, /<p class="ui-text ui-text--muted" id="daily-intro">The same boards/);
  assert.match(DAILY_HTML, /<figure class="ui-scene-panel" id="daily-preview"/);
  assert.match(DAILY_HTML, /<div class="ui-row" id="daily-status" data-status><span class="ui-row" id="daily-outcome"><span class="ui-chip ui-chip--muted" id="daily-result" data-result>Not played<\/span><span class="ui-text hidden" id="daily-time" data-result-time><\/span><\/span><span class="ui-text" id="daily-streak" data-streak><\/span><\/div>/,
    'the status row: the state (and a won time) at the left, the days in a row at the right');
  assert.match(DAILY_HTML, /<div id="daily-code-group" data-code-group><div class="ui-section-label"><h3 class="ui-section-label__text" id="daily-code-label">Board code<\/h3><\/div><div class="ui-code" id="daily-code" data-code role="group" aria-labelledby="daily-code-label">/,
    'the code chip under its "Board code" section label');
  assert.doesNotMatch(DAILY_HTML, /ui-code__label/, 'no label inside the chip');
  assert.match(DAILY_HTML, /id="daily-copy" class="ui-button ui-button--quiet ui-button--sm" data-copy="code" data-icon="copy">Copy<\/button>/);
  assert.match(DAILY_HTML, /id="daily-copy-link" class="ui-button ui-button--quiet ui-button--sm" data-copy="link" data-icon="link">Copy link<\/button>/);
  assert.match(DAILY_HTML, /<footer class="ui-frame__foot ui-frame__foot--action">\s*<p class="ui-frame__summary" id="daily-summary" data-summary><\/p>/);
  assert.match(DAILY_HTML, /id="daily-watch" class="ui-button ui-button--secondary hidden" data-watch data-icon="film">Watch replay<\/button>/);
  assert.match(DAILY_HTML, /id="daily-play" class="ui-button ui-button--primary ui-button--go ui-button--lg" data-play data-icon="play">Play <span class="ui-key-hint" data-action="confirm" aria-hidden="true"><\/span><\/button>/);
  assert.doesNotMatch(DAILY_HTML, /ui-card/, 'no card');
  const classes = [...DAILY_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
});

test('the Daily screen on a phone: one full-bleed column, no preview and no summary; Watch replay and Play pinned at the bottom', () => {
  const phone = STYLE.slice(STYLE.lastIndexOf('@media (max-width: 719px)'));
  assert.match(phone, /#daily-preview, #daily-summary[^{]*\{ display: none; \}/);
  assert.match(phone, /#daily-frame[^{]*\{[^}]*width: 100%[^}]*border-radius: 0[^}]*\}/);
  assert.match(phone, /#daily-frame > \.ui-frame__foot[^{]*\{[^}]*position: absolute[^}]*bottom: 0/, 'the bar pinned at the bottom');
});

test('the Daily screen\'s Back and Play carry their key hints', () => {
  const ui = read('js/ui.js');
  const roots = /for \(const id of \[([^\]]*)\]\) showKeyHints/.exec(ui);
  assert.ok(roots, 'js/ui.js fills the key hints of a list of roots');
  assert.match(roots[1], /'daily'/, '#daily is one of them');
});

test('the shell routes the Daily screen, pre-generates when the menu shows and starts a daily with its board', () => {
  assert.match(MAIN, /\[DAILY_SCREEN\]: \{ defaultFocus: \(\) => DAILY_VIEW\.defaultFocus\(\)/);
  assert.match(MAIN, /menu: \{[^\n]*DAILY_BOARDS_HELD\.prepare\(RECORDS\)/, 'the menu shows: the daily boards are asked for');
  assert.match(MAIN, /function playDaily\(id, source\)/);
  assert.match(MAIN, /DAILY_BOARDS_HELD\.take\(game\.code\)/);
  assert.match(MAIN, /dailyModes\(\{ records: RECORDS, replays: REPLAYS, unavailable: UNAVAILABLE_MODES \}\)/);
  assert.match(MAIN, /BACKDROP_SCREENS = new Set\(\[[^\]]*'daily'/, 'the Daily screen sits on the backdrop');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, the Daily screen matches its artboards at each size: key hints and icons, status row, board code, foot, panels and density; its Classic 2D preview is the whole board in its frame on the screen\'s body, with no scene panel behind it', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const open = async (options) => {
      const page = await browser.newPage(options);
      await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : get.call(this, kind, ...rest); };
      });
      await page.goto(`${base}/index.html`);
      await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
      await page.evaluate(() => document.getElementById('menu-entry-daily').click());
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'daily');
      return page;
    };
    // One mouse page resized through the desktop artboards, then a phone's.
    // [width, height, size, the Classic 2D preview's tile] per artboard (J-Daily-xl, -l, -m, -p)
    let page = await open({ viewport: { width: 1920, height: 1080 } });
    for (const [width, height, size, tile] of [[1920, 1080, 'xl', 17], [1366, 768, 'l', 16], [1024, 768, 'm', 15], [390, 844, 'p', null]]) {
      const phone = size === 'p';
      if (phone) {
        await page.close();
        page = await open({ viewport: { width, height }, hasTouch: true, isMobile: true });
      } else {
        await page.setViewportSize({ width, height });
      }
      const label = `${width} × ${height}`;
      // A won row's time in the option row, shown as the binder shows it after a win.
      await page.evaluate(() => { const t = document.querySelector('#daily-entry-classic-2d [data-time]'); t.textContent = '48.213 s'; t.classList.remove('hidden'); });
      const got = await page.evaluate(() => {
        const $ = (s) => document.querySelector(s);
        const css = (s) => getComputedStyle(typeof s === 'string' ? $(s) : s);
        const box = (s) => $(s).getBoundingClientRect();
        const shown = (s) => { const e = typeof s === 'string' ? $(s) : s; return !!e && e.getClientRects().length > 0; };
        const icon = (s) => { const i = $(`${s} > .ui-icon`); return i ? Math.round(i.getBoundingClientRect().width) : 0; };
        const hint = (s) => [...document.querySelectorAll(`${s} .ui-key-hint__key`)].map((k) => k.textContent).join(' ');
        const ink = css('#daily-title').color;
        const option = $('#daily-entry-classic-2d');
        const foot = $('#daily-frame > .ui-frame__foot');
        return {
          back: { text: $('#daily-back').innerText.trim(), name: $('#daily-back').getAttribute('aria-label'), hint: hint('#daily-back'), icon: icon('#daily-back') },
          play: { hint: hint('#daily-play'), icon: icon('#daily-play'), right: Math.round(box('#daily-play').right) },
          copy: [icon('#daily-copy'), icon('#daily-copy-link')],
          watch: $('#daily-watch').getAttribute('data-icon'),
          status: { justify: css('#daily-status').justifyContent, streakRight: Math.round(box('#daily-streak').right), statusRight: Math.round(box('#daily-status').right) },
          streak: { family: css('#daily-streak').fontFamily, size: css('#daily-streak').fontSize, weight: css('#daily-streak').fontWeight, colour: css('#daily-streak').color, ink },
          optionTime: (() => { const t = $('#daily-entry-classic-2d [data-time]'); const st = css(t); const c = $('#daily-entry-classic-2d [data-state]'); return { family: st.fontFamily, size: st.fontSize, weight: st.fontWeight, transform: st.textTransform, gap: Math.round(t.getBoundingClientRect().left - c.getBoundingClientRect().right), line: Math.abs(t.getBoundingClientRect().top - c.getBoundingClientRect().top) < 8 }; })(),
          time: { family: css('#daily-time').fontFamily, size: css('#daily-time').fontSize, weight: css('#daily-time').fontWeight, transform: css('#daily-time').textTransform },
          code: { labelBottom: box('#daily-code-label').bottom, chipTop: box('#daily-code').top, chip: Math.round(box('#daily-code').width), group: Math.round(box('#daily-code-group').width) },
          foot: { padding: css(foot).padding, height: Math.round(foot.getBoundingClientRect().height), bottom: Math.round(foot.getBoundingClientRect().bottom), right: Math.round(foot.getBoundingClientRect().right), summary: [css('#daily-summary').fontSize, css('#daily-summary').fontWeight], summaryShown: shown('#daily-summary') },
          rule: shown('#daily-body > .ui-divider--vertical') ? [Math.round(box('#daily-body > .ui-divider--vertical').width), Math.round(box('#daily-body > .ui-divider--vertical').height)] : null,
          intro: [css('#daily-intro').fontSize, css('#daily-intro').fontWeight],
          meta: css(option.querySelector('.ui-option__meta')).fontWeight,
          option: { padding: css(option).padding, minHeight: css(option).minHeight, name: css(option.querySelector('.ui-option__name')).fontSize, metaSize: css(option.querySelector('.ui-option__meta')).fontSize },
          modes: { width: Math.round(box('#daily-modes').width), padding: css('#daily-modes').padding },
          detail: { padding: css('#daily-detail').padding },
          body: css('#daily-body').padding,
          scroll: document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      assert.equal(got.back.name, 'Back to Main menu', `${label}: Back's name`);
      assert.equal(got.back.text, '', `${label}: Back shows its arrow alone`);
      assert.equal(got.back.icon, 20, `${label}: Back's 20 px arrow-left`);
      assert.equal(got.play.icon, 24, `${label}: Play's 24 px play triangle`);
      assert.deepEqual(got.copy, [14, 14], `${label}: Copy and Copy link's 14 px icons`);
      assert.equal(got.watch, 'film', `${label}: Watch replay's icon`);
      if (!phone) assert.deepEqual([got.back.hint, got.play.hint], ['', ''], `${label}: "←" and "▷ Play", with no key labels`);
      assert.equal(got.status.justify, 'space-between', `${label}: the status row spreads its two ends`);
      assert.ok(Math.abs(got.status.streakRight - got.status.statusRight) <= 1, `${label}: the days in a row at the right`);
      assert.match(got.streak.family, /JetBrains Mono/, `${label}: the days in a row in the mono face`);
      assert.deepEqual([got.streak.size, got.streak.weight, got.streak.colour], ['15px', '700', got.streak.ink], `${label}: 15 px bold ink`);
      assert.match(got.time.family, /JetBrains Mono/, `${label}: a won time in the mono face`);
      assert.deepEqual([got.time.size, got.time.weight, got.time.transform], ['15px', '700', 'none'], `${label}: 15 px bold, not uppercase`);
      assert.match(got.optionTime.family, /JetBrains Mono/, `${label}: the option row's won time in the mono face`);
      assert.deepEqual([got.optionTime.size, got.optionTime.weight, got.optionTime.transform, got.optionTime.gap, got.optionTime.line], ['15px', '700', 'none', 8, true], `${label}: 15 px bold, not uppercase, 8 px after its badge on its line`);
      assert.ok(got.code.labelBottom <= got.code.chipTop + 0.5, `${label}: "Board code" above the chip`);
      if (phone) assert.equal(got.code.chip, got.code.group, `${label}: the chip full width`);
      assert.equal(got.intro.join(' '), '14px 500', `${label}: the intro line 14 px, weight 500`);
      assert.equal(got.meta, '500', `${label}: the option meta weight 500`);
      if (size === 'xl') {
        assert.equal(got.foot.padding, '14px 24px 18px', `${label}: the foot's padding`);
        assert.equal(got.option.padding, '12px 18px', `${label}: the option's padding`);
        assert.deepEqual([got.modes.width, got.modes.padding, got.detail.padding], [480, '24px 26px', '24px 26px'], `${label}: the columns`);
      } else if (!phone) {
        assert.equal(got.foot.padding, '10px 20px 14px', `${label}: the foot's padding`);
        assert.deepEqual([got.option.padding, got.option.minHeight], ['6px 14px', '46px'], `${label}: the denser option rows`);
        assert.deepEqual([got.modes.width, got.modes.padding, got.detail.padding], [size === 'l' ? 460 : 420, '18px 22px', '18px 22px'], `${label}: the columns`);
      } else {
        assert.deepEqual([got.foot.height, got.foot.bottom], [92, height], `${label}: the 92 px bar fixed at the bottom`);
        assert.ok(Math.abs(got.play.right - (got.foot.right - 16)) <= 1, `${label}: Play at the right`);
        assert.equal(got.foot.summaryShown, false, `${label}: no summary`);
        assert.deepEqual(got.rule, [width - 36, 1], `${label}: a rule between the mode list and the detail`);
        assert.equal(got.body, '16px 18px 112px', `${label}: the content's padding`);
        assert.deepEqual([got.option.minHeight, got.option.padding, got.option.name, got.option.metaSize], ['56px', '9px 14px', '19px', '14px'], `${label}: the phone's option rows, never the desktop's dense rule`);
      }
      if (!phone) assert.deepEqual(got.foot.summary, ['16px', '700'], `${label}: the summary 16 px bold`);
      assert.equal(got.scroll, true, `${label}: no horizontal scroll`);
      if (!phone) {
        await page.click('#daily-entry-hexagon');
        const card = await page.waitForFunction(() => {
          const panel = document.getElementById('daily-preview');
          const badge = panel.querySelector('[data-preview="card"]:not([hidden]) .ui-scene-panel__badge');
          if (panel.dataset.shows !== 'badge' || !badge) return null;
          const s = getComputedStyle(panel);
          const b = getComputedStyle(badge);
          const name = getComputedStyle(panel.querySelector('.ui-scene-panel__name'));
          const detail = document.getElementById('daily-detail');
          const d = getComputedStyle(detail);
          const inner = detail.clientWidth - parseFloat(d.paddingLeft) - parseFloat(d.paddingRight);
          return {
            width: Math.round(panel.getBoundingClientRect().width), inner: Math.round(inner), height: Math.round(panel.getBoundingClientRect().height),
            radius: s.borderTopLeftRadius, shadow: s.boxShadow,
            badge: [Math.round(badge.getBoundingClientRect().width), Math.round(badge.getBoundingClientRect().height), b.borderTopLeftRadius],
            edge: /0px 8px 0px/.test(b.boxShadow),
            name: [name.fontSize, name.fontWeight], nameColour: name.color,
            scene: (() => { const p = document.createElement('span'); p.style.color = 'var(--color-scene-ink)'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c; })(),
            gap: getComputedStyle(panel.querySelector('.ui-scene-panel__card')).rowGap,
            note: getComputedStyle(document.getElementById('daily-note')).fontSize,
          };
        }, null, { polling: 100 }).then((h) => h.jsonValue());
        assert.deepEqual([card.width, card.height, card.radius, card.shadow], [card.inner, 280, '20px', 'none'], `${label}: the panel 100% wide, 280 px tall, radius 20, no edge and no elevation`);
        assert.deepEqual(card.badge, [96, 96, '24px'], `${label}: the coming-soon card's 96 px badge, radius 24`);
        assert.equal(card.edge, true, `${label}: its 8 px edge`);
        assert.deepEqual([...card.name, card.nameColour], ['20px', '800', card.scene], `${label}: "Coming soon" 20 px heavy in the scene ink`);
        assert.equal(card.gap, '12px', `${label}: the card's gap`);
        assert.equal(card.note, '15px', `${label}: the note line`);
        // The 3D panel's still (no WebGL 2) takes the same plain fixed-height panel; the cube's entry is disabled here, so the panel is set as the binder sets it.
        const still = await page.evaluate(() => {
          const panel = document.getElementById('daily-preview');
          panel.dataset.shows = 'still';
          const r = panel.getBoundingClientRect();
          const s = getComputedStyle(panel);
          return [Math.round(r.height), s.borderTopLeftRadius, s.boxShadow];
        });
        assert.deepEqual(still, [280, '20px', 'none'], `${label}: the still 3D panel 280 px tall, radius 20, no edge and no elevation`);
        // The Classic 2D preview, chosen again: the whole Expert board in its frame.
        await page.click('#daily-entry-classic-2d');
        const shown = await page.waitForFunction(() => {
          const panel = document.getElementById('daily-preview');
          const frame = panel.querySelector('[data-preview="daily"]:not([hidden]) > .ui-board-frame');
          if (!frame || frame.classList.contains('hidden') || frame.getBoundingClientRect().width === 0) return null;
          const r = frame.getBoundingClientRect();
          const box = panel.getBoundingClientRect();
          // Settled: the same frame on two polls running.
          const key = `${r.x} ${r.y} ${r.width} ${r.height} ${box.width} ${box.height}`;
          const same = globalThis.__framePoll === key;
          globalThis.__framePoll = key;
          if (!same) return null;
          const style = getComputedStyle(panel);
          return {
            shows: panel.dataset.shows, background: style.backgroundImage, colour: style.backgroundColor, shadow: style.boxShadow,
            inside: r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5,
            width: Math.round(r.width),
          };
        }, null, { polling: 100 }).then((h) => h.jsonValue());
        assert.deepEqual([shown.shows, shown.background, shown.colour, shown.shadow], ['daily', 'none', 'rgba(0, 0, 0, 0)', 'none'], `${label}: no dark scene panel behind the board`);
        assert.equal(shown.inside, true, `${label}: the whole board in the panel`);
        const at = Array.from({ length: 60 }, (_, i) => i + 1).find((x) => 30 * x + 31 * Math.round(x * 0.09) === shown.width);
        assert.ok(at && Math.abs(at - tile) <= 2, `${label}: the Expert board at about ${tile} px (${at})`);
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
});

test('in a browser, the menu pre-generates today\'s Expert, Daily plays it on the marked cell, and leaving it uses the day\'s attempt', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : get.call(this, kind, ...rest); };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const code = dailyGame('expert', dateText()).code;
    await page.waitForFunction((c) => globalThis.__ms.daily.has(c), code, { timeout: patience(10000) });
    // The Daily tile closes the play tiles, before Records.
    const entries = await page.evaluate(() => [...document.querySelectorAll('#menu [data-entry]')].map((b) => b.dataset.entry));
    assert.deepEqual(entries, ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily', 'records', 'settings']);
    await page.click('#menu-entry-daily');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'daily');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'daily-entry-classic-2d', 'the first playable mode has the focus');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#daily [data-mode]')].map((b) => b.dataset.mode)), ['classic-2d', 'hexagon', 'triangle', 'surface', '3d']);
    assert.equal(await page.evaluate(() => document.querySelector('#daily [data-code] .ui-code__value').textContent), code);
    assert.equal(await page.evaluate(() => document.getElementById('daily-entry-3d').disabled), true, 'no WebGL 2: the cube cannot be played');
    assert.equal(await page.evaluate(() => document.querySelector('#daily-entry-3d [data-line]').textContent), UNAVAILABLE_REASONS.webgl2);
    assert.equal(await page.evaluate(() => { const l = document.querySelector('#daily-preview [data-preview="daily"]'); return !!l && !l.hidden && !!l.querySelector('canvas'); }), true, 'the closed Expert board in the panel');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal scroll');
    // Hexagon and Triangle, playable modes with their board choices, have no daily yet: still Coming soon.
    assert.deepEqual(await page.evaluate(() => ['hexagon', 'triangle'].map((m) => [globalThis.__ms.modes.has(m), document.querySelector(`#daily-entry-${m} [data-line]`).textContent])),
      [[true, COMING_SOON], [true, COMING_SOON]]);
    await page.click('#daily-entry-hexagon');
    assert.equal(await page.evaluate(() => document.getElementById('daily-play').disabled), true, 'a coming-soon mode cannot be played');
    await page.click('#daily-entry-classic-2d');
    await page.click('#daily-play');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    const mark = dailyGame('expert', dateText()).startCell;
    assert.equal(await page.evaluate(() => globalThis.__ms.board2D.mark), mark);
    const at = await page.evaluate((cell) => {
      const v = globalThis.__ms.board2D;
      const r = v.cellRect(cell);
      const b = v.canvas.getBoundingClientRect();
      return { x: b.left + r.x + r.size / 2, y: b.top + r.y + r.size / 2 };
    }, mark);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started === true);
    assert.equal(await page.evaluate(() => document.getElementById('c2d-status').classList.contains('hidden')), true, 'the pre-generated board: no generating card');
    const summary = await page.evaluate(() => globalThis.__ms.modes.summary());
    assert.equal(summary.daily, dateText());
    assert.equal(summary.board.daily, true);
    // Leaving counts as a loss, on the day's Daily board.
    await page.keyboard.press('Escape');
    await page.click('#p-menu');
    await page.click('#p-confirm-yes');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    await page.click('#menu-entry-daily');
    assert.equal(await page.evaluate(() => document.querySelector('#daily-entry-classic-2d [data-state]').textContent), 'Lost');
    assert.equal(await page.evaluate(() => document.getElementById('daily-play').disabled), true, 'the counted attempt is used');
    assert.equal(await page.evaluate(() => globalThis.__ms.daily.has(document.querySelector('#daily [data-code] .ui-code__value').textContent)), false, 'nothing asked for a used attempt');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
