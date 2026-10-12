// The returning player's surfaces, as text (no DOM): the detail line of each preset on both board
// choices, and the main menu's session strip and Play again over the last board played. Every
// figure comes from the records' queries handed in (`bests`, `counters`, `history` — the records
// store or a records model); nothing is stored here.
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
//   lastBoard(mode, choices)      the last board played: { mode, choice, board } for `mode`, the last
//                                 mode played, whose entry in `choices` ({ [mode]: { choice, played } })
//                                 was played; null otherwise.
//   sessionStrip(board, records, now?)  'Expert · best 13.343 s · today 7 games · streak 2': the
//                                 board's label, its best time ('best —' with none), its games that
//                                 ended on now's local calendar day, and its current streak; null
//                                 with no board.
//   playAgainLabel(board)         'Play again: Expert · no-guess'.
//   returningMenu({ last, records, missing?, now? })  { strip, again }: the strip's text and Play
//                                 again's label, each null when not shown — Play again is not
//                                 offered for a 3D board in a browser lacking WebGL 2 (`missing`).
//
// The streak is the reference current streak (counters().currentStreak), in which an abandoned game
// is a loss; the time is the results screen's format (formatTime, js/results/view.js).

import { boardLabel, createBoardIdentity, MODE_3D } from '../records/board.js';
import { typicalBbbv } from '../records/typical-bbbv.js';
import { formatTime, DASH } from '../results/view.js';
import { boardSetup, MODE as MODE_2D, GRID, STANDARD_SIZES } from '../classic2d/board-setup.js';
import { boardOf, PRESETS } from '../mode3d/board-choice.js';

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

const BOARD_OF = {
  [MODE_2D]: (choice) => boardSetup(choice).identity,
  [MODE_3D]: (choice) => {
    const { X, Y, Z, mines, noGuess } = boardOf(choice);
    return createBoardIdentity({ mode: MODE_3D, width: X, height: Y, depth: Z, mines, noGuess });
  },
};

export function lastBoard(mode, choices) {
  const last = choices?.[mode];
  if (!BOARD_OF[mode] || !last?.played) return null;
  try {
    return { mode, choice: last.choice, board: BOARD_OF[mode](last.choice) };
  } catch {
    return null;
  }
}

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const count = (n, noun) => `${n} ${n === 1 ? noun : `${noun}s`}`;

export function sessionStrip(board, records, now = new Date()) {
  if (!board) return null;
  const best = records.bests(board).time;
  const today = records.history(board).filter((e) => sameDay(new Date(e.endedAt), now)).length;
  const { currentStreak } = records.counters(board);
  return `${boardLabel(board)} · best ${best ? formatTime(best.value) : DASH} · today ${count(today, 'game')} · streak ${currentStreak}`;
}

export function playAgainLabel(board) {
  return `Play again: ${boardLabel(board)}`;
}

export function returningMenu({ last, records, missing = [], now = new Date() }) {
  if (!last) return { strip: null, again: null };
  const offered = !(last.mode === MODE_3D && missing.includes('webgl2'));
  return { strip: sessionStrip(last.board, records, now), again: offered ? playAgainLabel(last.board) : null };
}
