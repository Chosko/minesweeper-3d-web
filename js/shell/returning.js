// The returning player's surface, as text (no DOM): the board's three bests on both board choices.
// Every figure comes from the records' queries handed in (`bests` — the records store or a records
// model); nothing is stored here.
//
//   boardBests(board, records)    [{ stat, label, value, note }]: the board's best time, 3BV/s and
//                                 efficiency in the results screen's formats (js/results/view.js),
//                                 each noted with the date it was set ('9 Oct 2026'), or DASH and
//                                 'no best yet'. A board and its no-guess twin are separate boards.

import { formatTime, formatRate, formatEfficiency, DASH } from '../results/view.js';
import { formatDate } from '../records/history-chart.js';

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
