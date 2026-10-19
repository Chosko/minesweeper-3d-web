// The returning player's surface, as text (no DOM): the detail line of each preset on the 3D board
// choice and the board's three bests on the Classic 2D one. Every figure comes from the records'
// queries handed in (`bests`, `counters` — the records store or a records model); nothing is stored
// here.
//
//   densityText(board)            '7.8 % mines': mines ÷ cells as a whole percent, one decimal below 10 %.
//   presetDetail(board, records)  '7.8 % mines · ~124 3BV · Best 48.213 s · 3 in a row': the density,
//                                 the typical 3BV (js/records/typical-bbbv.js; left out when the
//                                 table has none for the board), then the board's best time and
//                                 current streak — ' · <n> in a row' only from 1 — or DASH with no
//                                 best. A board and its no-guess twin are separate boards.
//   presetDetails(items, records) { [item]: { guess, noGuess } } — each item's line for either
//                                 position of its no-guess switch; `items` maps an item to its board
//                                 identity fields without noGuess, as CHOICE_ITEMS does.
//   CHOICE_ITEMS                  { [mode]: items }: each board choice's preset items — Classic 2D's
//                                 standard sizes, 3D's presets by id.
//   boardBests(board, records)    [{ stat, label, value, note }]: the board's best time, 3BV/s and
//                                 efficiency in the results screen's formats, each noted with the
//                                 date it was set ('9 Oct 2026'), or DASH and 'no best yet'.
//
// The streak is the reference current streak (counters().currentStreak), in which an abandoned game
// is a loss; the time is the results screen's format (formatTime, js/results/view.js).

import { createBoardIdentity, MODE_3D } from '../records/board.js';
import { typicalBbbv } from '../records/typical-bbbv.js';
import { formatTime, formatRate, formatEfficiency, DASH } from '../results/view.js';
import { formatDate } from '../records/history-chart.js';
import { MODE as MODE_2D, GRID, STANDARD_SIZES } from '../classic2d/board-setup.js';
import { PRESETS } from '../mode3d/board-choice.js';

const cellsOf = (b) => b.width * b.height * (b.mode === MODE_3D ? b.depth : 1);

export function densityText(board) {
  const pct = (board.mines / cellsOf(board)) * 100;
  const tenth = pct.toFixed(1);
  return `${Number(tenth) < 10 ? tenth : Math.round(pct)} % mines`;
}

function recordsText(board, records) {
  const best = records.bests(board).time;
  if (!best) return DASH;
  const streak = records.counters(board).currentStreak;
  return `Best ${formatTime(best.value)}${streak >= 1 ? ` · ${streak} in a row` : ''}`;
}

export function presetDetail(board, records) {
  const bbbv = typicalBbbv(board);
  return [densityText(board), ...(bbbv === null ? [] : [`~${bbbv} 3BV`]), recordsText(board, records)].join(' · ');
}

export function presetDetails(items, records) {
  const line = (fields, noGuess) => presetDetail(createBoardIdentity({ ...fields, noGuess }), records);
  return Object.fromEntries(Object.entries(items).map(([item, fields]) => [item, { guess: line(fields, false), noGuess: line(fields, true) }]));
}

export const CHOICE_ITEMS = Object.freeze({
  [MODE_2D]: Object.freeze(Object.fromEntries(Object.entries(STANDARD_SIZES)
    .map(([size, { width, height, mines }]) => [size, Object.freeze({ mode: MODE_2D, grid: GRID, width, height, mines })]))),
  [MODE_3D]: Object.freeze(Object.fromEntries(PRESETS
    .map((p) => [p.id, Object.freeze({ mode: MODE_3D, width: p.X, height: p.Y, depth: p.Z, mines: p.mines })]))),
});

const BEST_TILES = Object.freeze([
  { stat: 'time', label: 'Time', format: formatTime },
  { stat: 'bbbvPerSecond', label: '3BV/s', format: formatRate },
  { stat: 'efficiency', label: 'Efficiency', format: formatEfficiency },
]);
export const NO_BEST = 'no best yet';

export function boardBests(board, records) {
  const bests = records.bests(board);
  return BEST_TILES.map(({ stat, label, format }) => {
    const best = bests?.[stat] ?? null;
    return { stat, label, value: best ? format(best.value) : DASH, note: best ? formatDate(best.endedAt) : NO_BEST };
  });
}
