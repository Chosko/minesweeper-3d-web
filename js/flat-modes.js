// Flat mode configuration: what differs between the flat modes built on the Classic 2D flow
// (js/classic2d/), so one mode, board setup, board choice binder and last-choice store serve every
// flat grid. DOM-free at import.
//
// defineFlatMode(spec) → a frozen configuration; the step a flat mode is registered through.
//   id             the mode id: the mode host's, the board identity's `mode` and the records'.
//   name           the mode's display name.
//   grid           the grid kind: 'square', 'hex' or 'tri' (js/geometry/index.js GRID_KINDS) — its
//                  graph provider (js/engine/) and its geometry.
//   standardSizes  { beginner, intermediate, expert }, each { width, height, mines }: copied and
//                  frozen.
//   validateCustom, maxMines  the mode's custom limits, in Classic 2D board setup's shape
//                  (js/classic2d/board-setup.js): validateCustom(custom) → { ok } or { ok: false,
//                  field, reason }; maxMines(width, height) → the most mines that board takes.
//   lastChoiceDoc  the platform-storage document its last board choice lives in.
//   codeToken      the board-code token prefix of its boards (js/records/board-code.js): '' for
//                  the square grid, one capital letter otherwise.
// The configuration adds createGrid(width, height) → the grid's graph provider result, and
// createGeometry(width, height) → its flat grid geometry. An unknown grid kind, a malformed field,
// or a standard size its own validateCustom refuses throws a RangeError.
//
// CLASSIC_2D is the square configuration, from Classic 2D's board setup values; HEXAGON and TRIANGLE
// are the hex and tri configurations, from their board setups (js/hexagon/board-setup.js,
// js/triangle/board-setup.js), each with its own last-choice document. FLAT_MODES lists the three.

import { GRID_KINDS, createGeometry } from './geometry/index.js';
import { createSquareGrid } from './engine/square-grid.js';
import { createHexGrid } from './engine/hex-grid.js';
import { createTriGrid } from './engine/tri-grid.js';
import { MODE, GRID, STANDARD_SIZES, validateCustom, maxMines, LAST_CHOICE_DOC } from './classic2d/board-setup.js';
import * as hexagon from './hexagon/board-setup.js';
import * as triangle from './triangle/board-setup.js';

/** The standard sizes every flat mode offers, in order. */
export const FLAT_SIZES = Object.freeze(['beginner', 'intermediate', 'expert']);

const PROVIDERS = Object.freeze({ square: createSquareGrid, hex: createHexGrid, tri: createTriGrid });

const text = (field, v) => {
  if (typeof v !== 'string' || v === '') throw new RangeError(`a flat mode's ${field} must be a non-empty string, got ${JSON.stringify(v)}`);
  return v;
};
const fn = (field, v) => {
  if (typeof v !== 'function') throw new RangeError(`a flat mode's ${field} must be a function`);
  return v;
};

export function defineFlatMode(spec) {
  const { name, standardSizes, lastChoiceDoc, codeToken } = spec ?? {};
  const id = text('id', spec?.id);
  text('name', name);
  text('lastChoiceDoc', lastChoiceDoc);
  const grid = spec.grid;
  if (typeof grid !== 'string' || !GRID_KINDS.includes(grid) || !Object.hasOwn(PROVIDERS, grid)) {
    throw new RangeError(`flat mode ${id}: unknown grid kind ${JSON.stringify(grid)}`);
  }
  const validate = fn('validateCustom', spec.validateCustom);
  fn('maxMines', spec.maxMines);
  if (typeof codeToken !== 'string' || !/^[A-Z]?$/.test(codeToken)) {
    throw new RangeError(`flat mode ${id}: the code token must be '' or one capital letter, got ${JSON.stringify(codeToken)}`);
  }
  const sizes = {};
  for (const size of FLAT_SIZES) {
    const b = standardSizes?.[size];
    const v = b ? validate(b) : { ok: false, reason: 'missing' };
    if (!v.ok) throw new RangeError(`flat mode ${id}: standard size ${size} is outside its custom limits: ${v.reason}`);
    sizes[size] = Object.freeze({ width: b.width, height: b.height, mines: b.mines });
  }
  const provider = PROVIDERS[grid];
  return Object.freeze({
    id,
    name,
    grid,
    standardSizes: Object.freeze(sizes),
    validateCustom: validate,
    maxMines: spec.maxMines,
    lastChoiceDoc,
    codeToken,
    createGrid: (width, height) => provider(width, height),
    createGeometry: (width, height) => createGeometry(grid, width, height),
  });
}

/** Classic 2D: the square configuration. */
export const CLASSIC_2D = defineFlatMode({
  id: MODE,
  name: 'Classic 2D',
  grid: GRID,
  standardSizes: STANDARD_SIZES,
  validateCustom,
  maxMines,
  lastChoiceDoc: LAST_CHOICE_DOC,
  codeToken: '',
});

/** Hexagon: the hex configuration. */
export const HEXAGON = defineFlatMode({
  id: hexagon.MODE,
  name: 'Hexagon',
  grid: hexagon.GRID,
  standardSizes: hexagon.STANDARD_SIZES,
  validateCustom: hexagon.validateCustom,
  maxMines: hexagon.maxMines,
  lastChoiceDoc: 'hexagon.lastChoice',
  codeToken: 'H',
});

/** Triangle: the tri configuration. */
export const TRIANGLE = defineFlatMode({
  id: triangle.MODE,
  name: 'Triangle',
  grid: triangle.GRID,
  standardSizes: triangle.STANDARD_SIZES,
  validateCustom: triangle.validateCustom,
  maxMines: triangle.maxMines,
  lastChoiceDoc: 'triangle.lastChoice',
  codeToken: 'T',
});

/** Every flat mode's configuration, in the menu's order. */
export const FLAT_MODES = Object.freeze([CLASSIC_2D, HEXAGON, TRIANGLE]);
