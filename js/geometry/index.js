// Flat grid geometry: where a flat board's cells sit on the page, apart from the cell graph that
// says which cells are neighbours. Built from a grid kind, width and height; never stored — a
// replay or a summary rebuilds it from the board identity. DOM-free.
//
// The contract every geometry answers, in CSS pixels from the board's top-left corner, for a tile
// size `tile` (as the grid measures it: a square's side, a hexagon across the flats, a triangle's
// side) and a gap `gap` between tiles in whole pixels (a layout's `gap`):
//   kind, width, height, count       the grid kind, its size in cells, the cell count.
//   extent(tile, gap)                → { width, height }: the board's extent.
//   centre(c, tile, gap)             → { x, y }: cell c's centre, or null off the board.
//   outline(c, tile, gap)            → { shape, orientation, x, y, width, height, points }: the
//                                      outline the tile is drawn and hit-tested in — its shape, its
//                                      orientation ('up' or 'down' for a triangle, 'none' for a
//                                      shape with one), bounding box and corners — or null off
//                                      the board.
//   glyphBox(c, tile, gap)           → { x, y, width, height }: the box cell c's glyph is drawn in.
//   cellAt(x, y, tile, gap)          → the cell whose slot holds the board point, or -1 outside the
//                                      board; every point on the board belongs to exactly one slot.
//   neighbour(c, direction)          → the cursor's next cell 'up', 'down', 'left' or 'right' of c,
//                                      or -1 at the board's edge; another direction is a RangeError.
//   minTile                          the smallest tile the board shrinks to.
//   tileCap(scale)                   the largest tile at a board scale (the settings' boardScale).
//
// An unknown grid kind is a programming error: createGeometry throws a RangeError.

import { createSquareGeometry } from './square.js';
import { createHexGeometry } from './hex.js';
import { createTriGeometry } from './tri.js';

const BUILDERS = Object.freeze({ square: createSquareGeometry, hex: createHexGeometry, tri: createTriGeometry });

/** The grid kinds a geometry can be built for. */
export const GRID_KINDS = Object.freeze(Object.keys(BUILDERS));

/** The geometry of a `kind` board `width` × `height` cells; a RangeError for an unknown kind. */
export function createGeometry(kind, width, height) {
  if (typeof kind !== 'string' || !Object.hasOwn(BUILDERS, kind)) throw new RangeError(`unknown grid kind: ${kind}`);
  return BUILDERS[kind](width, height);
}
