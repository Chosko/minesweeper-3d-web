// Classic 2D board setup: turns a board choice into a board request, validates custom boards, and
// remembers the player's last choice. DOM-free.
//
// A board choice is { size, custom, noGuess }: `size` one of BOARD_SIZES; `custom` the custom
// board's { width, height, mines } (required when size is 'custom', and kept with a standard size
// so the custom fields reopen as the player left them); `noGuess` a boolean.
//
// Custom boards are validated against the reference profile's CUSTOM_LIMITS
// (js/engine/profiles.js, citing "Largest custom board" in tests/fidelity/minesweeper-online.md):
// width and height 1 to 100 each, and a mine count up to the smaller of the site's size-dependent
// cap and the cell count minus one. The site takes a mine in every cell on boards of up to 36
// cells; this game keeps one cell free so the first click is always safe. A dense custom board
// keeps the no-guess switch: a no-guess request that fails gets the session's failure offer.

import { CUSTOM_LIMITS } from '../engine/profiles.js';
import { createSquareGrid } from '../engine/square-grid.js';
import { STANDARD_BOARDS, createBoardIdentity } from '../records/board.js';

export const MODE = 'classic-2d';
export const GRID = 'square';

export const BOARD_SIZES = Object.freeze(['beginner', 'intermediate', 'expert', 'custom']);

const byName = (name) => STANDARD_BOARDS.find((b) => b.name === name);
const size = ({ width, height, mines }) => Object.freeze({ width, height, mines });
export const STANDARD_SIZES = Object.freeze({
  beginner: size(byName('Beginner')),
  intermediate: size(byName('Intermediate')),
  expert: size(byName('Expert')),
});

export const DEFAULT_CHOICE = Object.freeze({
  size: 'beginner',
  custom: Object.freeze({ width: 30, height: 16, mines: 99 }),
  noGuess: false,
});

// The site's mine cap for a width × height board: every cell up to CUSTOM_LIMITS.everyCellUpTo
// cells, then the measured caps, interpolated linearly by cell count (rounded down) between them.
export function customMineCap(width, height) {
  const cells = width * height;
  const { everyCellUpTo, mineCaps } = CUSTOM_LIMITS;
  if (cells <= everyCellUpTo) return cells;
  let [c0, m0] = [everyCellUpTo, everyCellUpTo];
  for (const [c1, m1] of mineCaps) {
    if (cells <= c1) return Math.floor(m0 + (cells - c0) * (m1 - m0) / (c1 - c0));
    [c0, m0] = [c1, m1];
  }
  return m0;
}

// The most mines a custom width × height board takes here: the site cap, keeping one cell free.
export function maxMines(width, height) {
  return Math.min(customMineCap(width, height), width * height - 1);
}

const side = (v) => Number.isInteger(v) && v >= CUSTOM_LIMITS.minSide && v <= CUSTOM_LIMITS.maxSide;

// { width, height, mines } → { ok: true } or { ok: false, field, reason }.
export function validateCustom(custom) {
  const { width, height, mines } = custom ?? {};
  const range = `${CUSTOM_LIMITS.minSide} to ${CUSTOM_LIMITS.maxSide}`;
  if (!side(width)) return { ok: false, field: 'width', reason: `width must be a whole number from ${range}` };
  if (!side(height)) return { ok: false, field: 'height', reason: `height must be a whole number from ${range}` };
  const max = maxMines(width, height);
  if (!Number.isInteger(mines) || mines < 0 || mines > max) {
    return { ok: false, field: 'mines', reason: `mines must be a whole number from 0 to ${max} on a ${width} × ${height} board` };
  }
  return { ok: true };
}

// A valid choice as a plain copy, or null. A missing `custom` with a standard size takes the
// default custom board.
export function normaliseChoice(choice) {
  if (!choice || typeof choice !== 'object') return null;
  if (!BOARD_SIZES.includes(choice.size) || typeof choice.noGuess !== 'boolean') return null;
  const custom = choice.custom ?? (choice.size === 'custom' ? null : DEFAULT_CHOICE.custom);
  if (!custom || !validateCustom(custom).ok) return null;
  return { size: choice.size, custom: { width: custom.width, height: custom.height, mines: custom.mines }, noGuess: choice.noGuess };
}

// choice → frozen { choice, width, height, mines, noGuess, identity, grid, request(firstClick, seed) }.
// `grid` is the square grid (its graph is the engine's), `identity` the records board identity, and
// request() the generation request for a first click at `firstClick`. A malformed choice or an
// invalid custom board throws a RangeError.
export function boardSetup(choice) {
  const c = normaliseChoice(choice);
  if (!c) {
    const v = choice && choice.size === 'custom' ? validateCustom(choice.custom) : null;
    throw new RangeError(`invalid board choice${v && !v.ok ? `: ${v.reason}` : ''}: ${JSON.stringify(choice)}`);
  }
  const { width, height, mines } = c.size === 'custom' ? c.custom : STANDARD_SIZES[c.size];
  const noGuess = c.noGuess;
  const identity = createBoardIdentity({ mode: MODE, grid: GRID, width, height, mines, noGuess });
  const grid = createSquareGrid(width, height);
  return Object.freeze({
    choice: c,
    width,
    height,
    mines,
    noGuess,
    identity,
    grid,
    request: (firstClick, seed) => ({
      graph: { kind: GRID, width, height }, mineCount: mines, firstClick, noGuess, seed,
    }),
  });
}

// ---------- the last board choice ----------

export const LAST_CHOICE_DOC = 'classic2d.lastChoice';
export const LAST_CHOICE_VERSION = 1;

// The last board choice as a platform-storage document. load() reads it when the mode opens
// (DEFAULT_CHOICE when there is none or it is malformed); save(choice) records a valid choice and
// throws a RangeError on an invalid one. Storage that does not persist never stops a game.
export function createLastChoice({ storage }) {
  storage.register(LAST_CHOICE_DOC, LAST_CHOICE_VERSION);
  let current = DEFAULT_CHOICE;
  return {
    get current() { return current; },
    async load() {
      current = normaliseChoice(await storage.load(LAST_CHOICE_DOC)) ?? DEFAULT_CHOICE;
      return current;
    },
    async save(choice) {
      const c = normaliseChoice(choice);
      if (!c) throw new RangeError(`invalid board choice: ${JSON.stringify(choice)}`);
      current = c;
      return storage.save(LAST_CHOICE_DOC, c);
    },
  };
}
