// The returning player's surface on the board choices (no DOM): the board's three bests, as text,
// and the board choice panel's pin. Every figure comes from the records' queries handed in
// (`bests` — the records store or a records model); the pin is the one thing stored here.
//
//   boardBests(board, records)    [{ stat, label, value, note }]: the board's best time, 3BV/s and
//                                 efficiency in the results screen's formats (js/results/view.js),
//                                 each noted with the date it was set ('9 Oct 2026'), or DASH and
//                                 'no best yet'. A board and its no-guess twin are separate boards.
//   createBoardPanelPin({ storage }) → { pinned, load(), setPinned(on) }
//                                 the board choice panel's pin, one view preference shared by every
//                                 mode's board choice, in its own platform-storage document as the
//                                 Records screen's view preferences are (js/records/view-prefs.js).
//                                 Registers BOARD_PANEL_DOC with storage. load() → Promise of the
//                                 stored pin, awaited before the first screen: a missing, malformed
//                                 or newer document gives unpinned. setPinned(on) keeps the pin in
//                                 memory, then saves it → the save's Promise of { ok }; a failed save
//                                 keeps the pin for the session. Reset all data clears the document.

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

export const BOARD_PANEL_DOC = 'shell.boardPanel';
export const BOARD_PANEL_VERSION = 1;

export function createBoardPanelPin({ storage }) {
  storage.register(BOARD_PANEL_DOC, BOARD_PANEL_VERSION);
  let pinned = false;
  return {
    get pinned() { return pinned; },
    async load() {
      const data = await storage.load(BOARD_PANEL_DOC);
      pinned = data !== null && typeof data === 'object' && typeof data.pinned === 'boolean' && data.pinned;
      return pinned;
    },
    async setPinned(on) {
      pinned = !!on;
      try {
        return await storage.save(BOARD_PANEL_DOC, { pinned });
      } catch (error) {
        return { ok: false, reason: 'write-failed', error };
      }
    },
  };
}
