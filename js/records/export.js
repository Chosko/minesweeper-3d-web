// Records export: two files built from the records store's history of every board in both modes and
// the replay library's listing of every kept replay — the history as one CSV table for a
// spreadsheet, and everything as one JSON file. The replay files themselves are not exported.
// Exporting reads only: it writes no document. The builders are DOM-free; the download goes
// through a Blob and an object URL handed to an injected trigger, so tests observe the file
// without downloading.
//
// exportGames(records) → every game of every board played in both modes, newest end first:
//   [{ entry, board }], entry the history entry, board its parsed board identity. A query that
//   throws leaves its games out.
// exportCsv({ records, replays?, now? }) → { name, type, text }: minesweeper-3d-history-<date>.csv,
//   CSV_HEADERS then one row per game (exportGames' order), fields quoted and escaped per RFC 4180
//   (csvField), CRLF line ends, a dot decimal and no units: the end as ISO 8601, mode, board key,
//   board label, no-guess (yes / no), outcome, time in seconds (three decimals), 3BV, 3BV solved,
//   3BV/s (three decimals), efficiency (one decimal), counted clicks, then each click kind's
//   effective and wasted counts, replay kept (yes / no) and the replay's pins (joined by ";").
//   A stat that is not available is an empty field.
// exportJson({ records, replays?, now? }) → { name, type, text }: minesweeper-3d-records-<date>.json,
//   { format: EXPORT_FORMAT, exportedAt, games, replays }: each game its history entry plus
//   boardLabel and its unrounded bbbvPerSecond and efficiency; each replay its listing fields and
//   pins (library.entries()). A library that failed to load, or none, gives an empty list.
// dateStamp(now) → "YYYY-MM-DD", the local date the files are named by.
// createRecordsExport({ records, replays?, now?, trigger?, objectUrl? }) → { hasGames(), csv(),
//   json(), save(format) }: save('csv' | 'json') builds that file, makes a Blob and an object URL
//   (objectUrl: { create(blob), revoke(url) }, URL's by default) and calls trigger({ url, name,
//   blob }) — by default a link click in the page — then revokes the URL; it returns the file, or
//   null when no game is recorded, saving nothing.
// bindExportActions({ csv, json, note }, { onExport }) → { show(exportable) }: the two export
//   buttons call onExport('csv') and onExport('json'); show(false) disables both and shows
//   NOTHING_TO_EXPORT in the note line, show(true) enables them and hides it. Settings' Data panel
//   and the Records screen bind theirs through it, over the one createRecordsExport.

import { CLICK_KINDS } from '../engine/metrics.js';
import { boardLabel, parseBoardKey } from './board.js';
import { bbbvPerSecond, countedClicks, efficiency } from './summary.js';

export const EXPORT_FORMAT = 1;
export const EXPORT_MODES = Object.freeze(['classic-2d', '3d']);
export const NOTHING_TO_EXPORT = 'Nothing to export yet: no game is recorded.';
export const EXPORT_LINE = 'Save your game history as a spreadsheet table (CSV), or your history and the list of kept replays as one file (JSON).';
export const CSV_HEADERS = Object.freeze([
  'ended_at', 'mode', 'board_key', 'board_label', 'no_guess', 'outcome', 'time_s', 'bbbv', 'bbbv_solved', 'bbbv_per_s', 'efficiency_pct',
  'counted_clicks', ...CLICK_KINDS.flatMap((k) => [`${k}_effective`, `${k}_wasted`]), 'replay_kept', 'replay_pins',
]);

const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const endTime = (e) => { const t = Date.parse(e?.endedAt); return Number.isNaN(t) ? -Infinity : t; };
const fixed = (v, digits) => (v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(digits));
const two = (n) => String(n).padStart(2, '0');

export function dateStamp(now = new Date()) {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

export function exportGames(records) {
  const games = [];
  for (const mode of EXPORT_MODES) {
    for (const { key } of attempt(() => records.boardsPlayed(mode), [])) {
      const board = attempt(() => parseBoardKey(key), null);
      if (!board) continue;
      for (const entry of attempt(() => records.history(key), [])) games.push({ entry, board });
    }
  }
  return games.map((g, i) => ({ g, i })).sort((a, b) => endTime(b.g.entry) - endTime(a.g.entry) || a.i - b.i).map(({ g }) => g);
}

const keptReplays = (replays) => {
  const list = attempt(() => replays?.entries?.() ?? [], []);
  return Array.isArray(list) ? list : [];
};

/** One CSV field per RFC 4180: quoted when it holds a comma, a quote or a line break, quotes doubled. */
export function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvRow({ entry, board }, pinsOf) {
  const pins = pinsOf.get(entry.id);
  const clicks = entry.clicks ?? {};
  return [
    entry.endedAt, board.mode, entry.boardKey, boardLabel(board), board.noGuess ? 'yes' : 'no', entry.outcome,
    fixed(entry.elapsedMs / 1000, 3), entry.bbbv, entry.bbbvSolved, fixed(attempt(() => bbbvPerSecond(entry), null), 3),
    fixed(attempt(() => efficiency(entry), null), 1), attempt(() => countedClicks(clicks), ''),
    ...CLICK_KINDS.flatMap((k) => [clicks[k]?.effective ?? '', clicks[k]?.wasted ?? '']),
    pins ? 'yes' : 'no', pins ? pins.join(';') : '',
  ].map(csvField).join(',');
}

export function exportCsv({ records, replays = null, now = new Date() }) {
  const pinsOf = new Map(keptReplays(replays).map((r) => [r.id, [...(r.pins ?? [])]]));
  const lines = [CSV_HEADERS.join(','), ...exportGames(records).map((g) => csvRow(g, pinsOf))];
  return { name: `minesweeper-3d-history-${dateStamp(now)}.csv`, type: 'text/csv', text: `${lines.join('\r\n')}\r\n` };
}

export function exportJson({ records, replays = null, now = new Date() }) {
  const games = exportGames(records).map(({ entry, board }) => ({
    ...entry, boardLabel: boardLabel(board),
    bbbvPerSecond: attempt(() => bbbvPerSecond(entry), null), efficiency: attempt(() => efficiency(entry), null),
  }));
  const data = {
    format: EXPORT_FORMAT, exportedAt: now.toISOString(), games,
    replays: keptReplays(replays).map((r) => ({ ...r, pins: [...(r.pins ?? [])] })),
  };
  return { name: `minesweeper-3d-records-${dateStamp(now)}.json`, type: 'application/json', text: `${JSON.stringify(data, null, 2)}\n` };
}

/** The page's download: a link to the object URL, clicked. */
function clickLink({ url, name }) {
  const doc = globalThis.document;
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  doc.body.append(a);
  a.click();
  a.remove();
}

const URLS = Object.freeze({ create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) });

export function createRecordsExport({ records, replays = null, now = () => new Date(), trigger = clickLink, objectUrl = URLS }) {
  const hasGames = () => EXPORT_MODES.some((mode) => attempt(() => records.boardsPlayed(mode), [])
    .some(({ key }) => attempt(() => records.history(key).length > 0, false)));
  const build = { csv: () => exportCsv({ records, replays, now: now() }), json: () => exportJson({ records, replays, now: now() }) };
  return {
    hasGames,
    csv: build.csv,
    json: build.json,
    save(format) {
      if (!build[format]) throw new RangeError(`unknown export format "${format}"`);
      if (!hasGames()) return null;
      const file = build[format]();
      const blob = new Blob([file.text], { type: file.type });
      const url = objectUrl.create(blob);
      try {
        trigger({ url, name: file.name, blob });
      } finally {
        setTimeout(() => objectUrl.revoke(url), 0);
      }
      return file;
    },
  };
}

export function bindExportActions({ csv, json, note }, { onExport }) {
  csv.addEventListener('click', () => onExport('csv'));
  json.addEventListener('click', () => onExport('json'));
  return {
    show(exportable) {
      csv.disabled = !exportable;
      json.disabled = !exportable;
      note.textContent = exportable ? '' : NOTHING_TO_EXPORT;
      note.classList.toggle('hidden', !!exportable);
    },
  };
}
