// The achievement evaluator: the achievements one finished game earns (no DOM).
//
// earned(summary) takes a summary built by js/records/summary.js, or a compact history entry of
// js/records/model.js (its board named by `boardKey`), and returns the API names of the catalogue's
// achievements (js/achievements/catalogue.js) the game earns, in catalogue order. It is pure: the
// same game always earns the same names, whatever was unlocked before.
//
// Only a won game on a standard board earns anything: a Classic 2D standard board on the square
// grid, or one of the 3D cube presets Beginner, Intermediate and Expert of PRESETS_3D. A custom
// board — a former preset's size included —, a Daily board, a Hexagon or Triangle board and Cube
// Intro earn nothing. 3BV/s and efficiency are game-summary's derivations, judged at the results
// screen's precision (two decimals and one, js/results/view.js), so a threshold the screen shows
// is a threshold reached.

import { MODE_3D, parseBoardKey, preset3D, standardBoard } from '../records/board.js';
import { bbbvPerSecond, efficiency } from '../records/summary.js';
import { CATALOGUE } from './catalogue.js';

// The compact history keeps each game's clicks by kind (js/records/model.js), so catch-up judges
// every rule from the history, no flags included.
export const NO_FLAGS_FROM_HISTORY = true;

const CLASSIC_2D = 'classic-2d';
const CUBE_PRESETS = new Set(['Beginner', 'Intermediate', 'Expert']);
const RATE_DECIMALS = 2;
const EFFICIENCY_DECIMALS = 1;

const shown = (v, decimals) => (v === null ? null : Number(v.toFixed(decimals)));

// The standard board a game was played on: its Classic 2D name or its cube preset's, or neither.
function standardOf(board) {
  if (board.daily) return { classic: null, cube: null };
  if (board.mode === CLASSIC_2D && board.grid === 'square') return { classic: standardBoard(board)?.name ?? null, cube: null };
  const p = board.mode === MODE_3D ? preset3D(board) : null;
  return { classic: null, cube: p && p.family === 'Cube' && CUBE_PRESETS.has(p.name) ? p.name : null };
}

export function earned(summary) {
  if (summary.outcome !== 'won') return [];
  const board = summary.board ?? parseBoardKey(summary.boardKey);
  const { classic, cube } = standardOf(board);
  if (classic === null && cube === null) return [];
  const view = {
    classic,
    cube,
    noGuess: board.noGuess,
    bbbvPerSecond: shown(bbbvPerSecond(summary), RATE_DECIMALS),
    efficiency: shown(efficiency(summary), EFFICIENCY_DECIMALS),
    flagClicks: summary.clicks.flag.effective + summary.clicks.flag.wasted,
  };
  return CATALOGUE.filter((a) => a.rule(view)).map((a) => a.name);
}
