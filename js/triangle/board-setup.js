// Triangle board setup: the Triangle mode's standard boards and custom limits, read by its board
// choice and by the board-code parser (js/records/board-code.js). DOM-free.
//
// A triangle board is mode `triangle` on the `tri` grid (js/engine/tri-grid.js). The standard boards
// are those drawn on the Triangle board sheet; the records recognise them by their exact size and
// mine count on the tri grid through STANDARD_BOARDS_TRI (js/records/board.js), kept equal to
// STANDARD_SIZES by a test. They are fixed once records exist: a change would make earlier games
// custom-board records.
//
// Custom boards take Classic 2D's limits (js/classic2d/board-setup.js): 1 to 100 a side, and mines
// from 1 to Classic 2D's cap for the same cell count, at most cells − 1, so a 1 × 1 board is refused
// on the mines field. validateCustom gives a refusal's field and reason in Classic 2D's shape. No-guess
// is never refused up front: a no-guess board that fails generation gets the session's failure offer.

export { BOARD_SIZES, maxMines, validateCustom } from '../classic2d/board-setup.js';

export const MODE = 'triangle';
export const GRID = 'tri';

const size = (width, height, mines) => Object.freeze({ width, height, mines });
export const STANDARD_SIZES = Object.freeze({
  beginner: size(13, 7, 8),
  intermediate: size(25, 13, 36),
  expert: size(41, 17, 103),
});
