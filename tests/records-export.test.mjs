// Records export (js/records/export.js): the CSV of every game of both modes (header, order,
// rounding, RFC 4180 escaping, the replay columns), the JSON of the history and the replays'
// listing, the file names, the disabled empty export, the injected download through a Blob and an
// object URL, and the export actions' binder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPORT_FORMAT, CSV_HEADERS, NOTHING_TO_EXPORT, csvField, dateStamp, exportGames, exportCsv, exportJson, createRecordsExport, bindExportActions,
} from '../js/records/export.js';
import { createRecordsModel } from '../js/records/model.js';
import { createBoardIdentity } from '../js/records/board.js';
import { bbbvPerSecond, efficiency } from '../js/records/summary.js';
import { PIN_BEST, PIN_HAND } from '../js/replay/library.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const CUBE_NG = createBoardIdentity({ mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: true });
const clicks = (r, f = 0, c = 0, w = 0) => ({ reveal: { effective: r, wasted: w }, flag: { effective: f, wasted: 0 }, chord: { effective: c, wasted: 1 } });
const NO_CLICKS = { reveal: { effective: 0, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
const summary = (board, over = {}) => {
  const outcome = over.outcome ?? 'won';
  const s = {
    id: over.id, board: { ...board }, outcome, elapsedMs: 47380, bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 5, clicks: clicks(20, 3, 2, 1),
    seed: 1, generatorVersion: 1, endedAt: '2026-10-01T12:00:00.000Z', ...over,
  };
  return { ...s, bbbvPerSecond: bbbvPerSecond(s), efficiency: efficiency(s) };
};
function store(games) {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  return model;
}
const GAMES = [
  summary(BEGINNER, { id: 'a', endedAt: '2026-10-01T12:00:00.000Z' }),
  summary(CUBE_NG, { id: 'b', outcome: 'lost', elapsedMs: 12345, endedAt: '2026-10-03T08:30:00.000Z' }),
  summary(BEGINNER, { id: 'c', outcome: 'abandoned', elapsedMs: 0, clicks: NO_CLICKS, endedAt: '2026-10-02T09:00:00.000Z' }),
];
const library = (entries) => ({ entries: () => entries.map((e) => Object.freeze({ ...e, pins: Object.freeze([...e.pins]) })) });
const LIBRARY = library([
  { id: 'b', boardKey: '3d:6x6x6:10:no-guess', mode: '3d', outcome: 'lost', elapsedMs: 12345, bbbvPerSecond: 0.4, efficiency: 20, endedAt: '2026-10-03T08:30:00.000Z', size: 900, pins: [PIN_BEST, PIN_HAND] },
  { id: 'a', boardKey: 'classic-2d:square:9x9:10:guess', mode: 'classic-2d', outcome: 'won', elapsedMs: 47380, bbbvPerSecond: 0.42, efficiency: 76.9, endedAt: '2026-10-01T12:00:00.000Z', size: 400, pins: [] },
]);
const NOW = new Date(2026, 9, 14, 9, 5);
const parseCsv = (text) => text.trimEnd().split('\r\n').map((line) => line.split(','));

test('the export gathers every game of every board in both modes, newest first', () => {
  const games = exportGames(store(GAMES));
  assert.deepEqual(games.map((g) => g.entry.id), ['b', 'c', 'a']);
  assert.equal(games[0].board.mode, '3d');
  assert.deepEqual(exportGames({ boardsPlayed() { throw new Error('unreadable'); } }), [], 'an unreadable store exports nothing');
});

test('the CSV: its header, one row per game newest first, rounding and the replay columns', () => {
  const file = exportCsv({ records: store(GAMES), replays: LIBRARY, now: NOW });
  assert.equal(file.name, 'minesweeper-3d-history-2026-10-14.csv');
  assert.equal(file.type, 'text/csv');
  assert.ok(file.text.endsWith('\r\n'), 'CRLF line ends');
  const [header, ...rows] = parseCsv(file.text);
  assert.deepEqual(header, [...CSV_HEADERS]);
  assert.deepEqual(header, ['ended_at', 'mode', 'board_key', 'board_label', 'no_guess', 'outcome', 'time_s', 'bbbv', 'bbbv_solved', 'bbbv_per_s',
    'efficiency_pct', 'counted_clicks', 'reveal_effective', 'reveal_wasted', 'flag_effective', 'flag_wasted', 'chord_effective', 'chord_wasted',
    'replay_kept', 'replay_pins']);
  assert.equal(rows.length, 3);
  const row = (id) => Object.fromEntries(header.map((h, i) => [h, rows[['b', 'c', 'a'].indexOf(id)][i]]));
  assert.deepEqual(row('a'), {
    ended_at: '2026-10-01T12:00:00.000Z', mode: 'classic-2d', board_key: 'classic-2d:square:9x9:10:guess', board_label: 'Beginner', no_guess: 'no',
    outcome: 'won', time_s: '47.380', bbbv: '20', bbbv_solved: '20', bbbv_per_s: (20 / 47.38).toFixed(3), efficiency_pct: (2000 / 27).toFixed(1),
    counted_clicks: '27', reveal_effective: '20', reveal_wasted: '1', flag_effective: '3', flag_wasted: '0', chord_effective: '2', chord_wasted: '1',
    replay_kept: 'yes', replay_pins: '',
  });
  assert.equal(row('b').board_label, 'Cube Intro · no-guess');
  assert.deepEqual([row('b').mode, row('b').no_guess, row('b').time_s, row('b').replay_kept, row('b').replay_pins], ['3d', 'yes', '12.345', 'yes', 'best;hand']);
  assert.deepEqual([row('c').bbbv_per_s, row('c').efficiency_pct, row('c').replay_kept, row('c').time_s], ['', '', 'no', '0.000'], 'no stat: an empty field');
});

test('CSV fields are quoted and escaped per RFC 4180', () => {
  assert.equal(csvField('plain'), 'plain');
  assert.equal(csvField('a,b'), '"a,b"');
  assert.equal(csvField('say "hi"'), '"say ""hi"""');
  assert.equal(csvField('two\nlines'), '"two\nlines"');
  assert.equal(csvField(null), '');
  assert.equal(csvField(12), '12');
  const custom = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 20, height: 12, mines: 50, noGuess: false });
  const text = exportCsv({ records: store([summary(custom, { id: 'q"1' })]), now: NOW }).text;
  assert.match(text, /\r\n2026-10-01T12:00:00\.000Z,classic-2d,classic-2d:square:20x12:50:guess,20 × 12 · 50 mines,no,won,/);
  assert.equal(parseCsv(text)[1].at(-2), 'no', 'no library: no replay kept');
});

test('the JSON carries the history with labels and unrounded stats, and the replays\' listing with pins', () => {
  const records = store(GAMES);
  const file = exportJson({ records, replays: LIBRARY, now: NOW });
  assert.equal(file.name, 'minesweeper-3d-records-2026-10-14.json');
  assert.equal(file.type, 'application/json');
  const data = JSON.parse(file.text);
  assert.deepEqual(Object.keys(data), ['format', 'exportedAt', 'games', 'replays']);
  assert.equal(data.format, EXPORT_FORMAT);
  assert.equal(EXPORT_FORMAT, 1);
  assert.equal(data.exportedAt, NOW.toISOString());
  assert.deepEqual(data.games.map((g) => g.id), ['b', 'c', 'a']);
  const a = data.games[2];
  assert.deepEqual(a, { ...records.history(BEGINNER).find((e) => e.id === 'a'), boardLabel: 'Beginner', bbbvPerSecond: 20 / 47.38, efficiency: 2000 / 27 });
  assert.equal(data.games[1].bbbvPerSecond, null);
  assert.deepEqual(data.replays, LIBRARY.entries().map((e) => ({ ...e, pins: [...e.pins] })));
  const failed = JSON.parse(exportJson({ records, replays: { entries() { throw new Error('not loaded'); } }, now: NOW }).text);
  assert.deepEqual(failed.replays, [], 'a library that failed to load exports an empty replay list');
  assert.deepEqual(JSON.parse(exportJson({ records, now: NOW }).text).replays, []);
});

test('the files are named by the local date', () => {
  assert.equal(dateStamp(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
  assert.equal(dateStamp(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('saving goes through a Blob and an object URL handed to the injected trigger, and writes nothing', async () => {
  const records = store(GAMES);
  const record = records.record;
  records.record = () => { throw new Error('the export must not record'); };
  const triggered = [];
  const urls = [];
  const exporter = createRecordsExport({
    records, replays: LIBRARY, now: () => NOW,
    trigger: (file) => triggered.push(file),
    objectUrl: { create: (blob) => { urls.push(['create', blob]); return 'blob:x'; }, revoke: (url) => urls.push(['revoke', url]) },
  });
  assert.equal(exporter.hasGames(), true);
  const csv = exporter.save('csv');
  assert.equal(triggered.length, 1);
  assert.equal(triggered[0].url, 'blob:x');
  assert.equal(triggered[0].name, 'minesweeper-3d-history-2026-10-14.csv');
  assert.ok(triggered[0].blob instanceof Blob);
  assert.equal(await triggered[0].blob.text(), csv.text);
  assert.equal(triggered[0].blob.type, 'text/csv');
  const json = exporter.save('json');
  assert.equal(triggered[1].name, json.name);
  assert.equal(JSON.parse(await triggered[1].blob.text()).games.length, 3);
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(urls.filter((u) => u[0] === 'revoke').map((u) => u[1]), ['blob:x', 'blob:x'], 'each object URL revoked');
  assert.throws(() => exporter.save('xml'), RangeError);
  records.record = record;
});

test('with no game recorded there is nothing to export: save does nothing', () => {
  const triggered = [];
  const exporter = createRecordsExport({ records: store([]), trigger: (f) => triggered.push(f), objectUrl: { create: () => 'u', revoke() {} } });
  assert.equal(exporter.hasGames(), false);
  assert.equal(exporter.save('csv'), null);
  assert.deepEqual(triggered, []);
});

/** A minimal element: listeners, disabled, textContent and a class list. */
function element() {
  const listeners = {};
  const classes = new Set(['hidden']);
  return {
    disabled: false, textContent: '',
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    click() { if (!this.disabled) for (const fn of listeners.click ?? []) fn(); },
    classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
  };
}

test('the export actions: both call the one exporter; disabled with a line when there is nothing to export', () => {
  const els = { csv: element(), json: element(), note: element() };
  const asked = [];
  const actions = bindExportActions(els, { onExport: (format) => asked.push(format) });
  actions.show(false);
  assert.deepEqual([els.csv.disabled, els.json.disabled], [true, true]);
  assert.equal(els.note.textContent, NOTHING_TO_EXPORT);
  assert.equal(els.note.classList.contains('hidden'), false);
  els.csv.click();
  assert.deepEqual(asked, [], 'a disabled action does nothing');
  actions.show(true);
  assert.deepEqual([els.csv.disabled, els.json.disabled, els.note.classList.contains('hidden')], [false, false, true]);
  els.csv.click();
  els.json.click();
  assert.deepEqual(asked, ['csv', 'json']);
  const bare = { csv: element(), json: element() };
  const noLine = bindExportActions(bare, { onExport: () => {} });
  noLine.show(false);
  assert.deepEqual([bare.csv.disabled, bare.json.disabled], [true, true], 'without a note line only the buttons follow');
  noLine.show(true);
  assert.deepEqual([bare.csv.disabled, bare.json.disabled], [false, false]);
});

test('the export module reads through the summary derivations and keeps no rank, no storage write', () => {
  const src = read('js/records/export.js').replace(/\/\/[^\n]*/g, '');
  assert.match(src, /import \{[^}]*bbbvPerSecond[^}]*efficiency[^}]*\} from '\.\/summary\.js'/);
  assert.doesNotMatch(src, /storage|\.save\(|\.record\(/);
});
