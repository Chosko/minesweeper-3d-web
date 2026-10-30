// The leaderboard catalogue: the boards ranked on Steam and the stable leaderboard name of each (no DOM).
//
// The catalogue is Classic 2D's square Beginner, Intermediate and Expert (STANDARD_BOARDS) and the
// Cube Beginner, Intermediate and Expert presets of 3D (PRESETS_3D), each with no-guess off and on.
// Every other board has no leaderboard: custom boards, Cube Intro, any other 3D size, the Hexagon
// and Triangle boards and every Daily board.
//
// A name is derived from the board's mode, its standard size and its no-guess setting:
//   <mode>-<standard size>-<guess|no-guess>
// e.g. `classic-2d-expert-no-guess`, `3d-cube-beginner-guess`. The leaderboards are created under
// these names in the Steamworks app settings, so a published name never changes; the catalogue
// test pins every one.

import { createBoardIdentity, STANDARD_BOARDS, PRESETS_3D, MODE_3D } from '../records/board.js';
import { MODE_CLASSIC_2D } from '../records/model.js';

const CUBE_SIZES = ['Beginner', 'Intermediate', 'Expert'];

const slug = (text) => text.toLowerCase().replace(/\s+/g, '-');
const guess = (noGuess) => (noGuess ? 'no-guess' : 'guess');

const classic = STANDARD_BOARDS.map(({ name, width, height, mines }) => ({
  size: slug(name), board: { mode: MODE_CLASSIC_2D, grid: 'square', width, height, mines },
}));
const cubes = PRESETS_3D.filter((p) => p.family === 'Cube' && CUBE_SIZES.includes(p.name))
  .map(({ family, name, width, height, depth, mines }) => ({
    size: slug(`${family} ${name}`), board: { mode: MODE_3D, width, height, depth, mines },
  }));

// [{ name, board }] — every catalogue board identity and its leaderboard name.
export const CATALOGUE = Object.freeze([...classic, ...cubes].flatMap(({ size, board }) => [false, true].map((noGuess) => {
  const identity = createBoardIdentity({ ...board, noGuess });
  return Object.freeze({ name: `${identity.mode}-${size}-${guess(noGuess)}`, board: identity });
})));

const sameBoard = (a, b) => a.mode === b.mode && a.grid === b.grid && a.width === b.width && a.height === b.height
  && a.depth === b.depth && a.mines === b.mines && a.noGuess === b.noGuess && !a.daily;

// The leaderboard name of a board identity, or null for a board outside the catalogue or anything
// that is not a board identity.
export function leaderboardFor(board) {
  let id;
  try {
    id = createBoardIdentity(board);
  } catch {
    return null;
  }
  return CATALOGUE.find((entry) => sameBoard(id, entry.board))?.name ?? null;
}
