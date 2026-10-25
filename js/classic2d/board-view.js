// Classic 2D board view: the Canvas 2D board fitted to the area it is given, hit-testing,
// scrolling and per-cell redraw through the tile skin (js/classic2d/tile-skin.js). The skin owns
// how a tile looks; this module owns where tiles go. DOM-free at import: createBoardView takes its
// canvas and is driven by calls; mountBoardView is the browser wiring around it.
//
// Geometry: where each cell sits is the board's grid geometry's (js/geometry/index.js) — the board's
// extent, each cell's outline and centre, the cell at a board point, the floor and the tile at each
// board scale; the square geometry is Classic 2D's. The view computes no column or row itself, and
// the board units it reports positions in (boardPoint) are the layout's pitch, the tile plus the gap.
//
// Fit rule: the tile is the largest whole size at which the board fits the area left inside the
// frame, at most the geometry's tile at the board scale (tileCap on the square geometry) and never
// below its floor (MIN_TILE_SIZE on the square geometry; minTile, for a board shown and not played:
// a preview fits whole at any tile). The board frame
// (BOARD_FRAME) pads the board by the gap on every side, counted in the fit. A board that fits
// is centred, frame and all, and never scrolls; one that does not keeps the minimum tile, fills the
// area inside the frame's fixed part with no gap padding — a viewport with no frame —, starts at its
// top-left corner and scrolls (wheel, drag with the pan modifier, ensureVisible for the cursor). Tiles sit where the geometry puts them for the tile and the gap the skin's
// board module sets — a fraction of the tile rounded to whole pixels, none without one; on the square
// geometry one pitch apart — inside the view rectangle
// (layout.viewX, viewY, viewWidth, viewHeight), which is filled with the board module's ground (the
// board background token while the skin has no module); the fit rule counts the gaps, and a cell's
// slot is the geometry's — on the square geometry its tile and the gap after it — so hit-testing
// maps a pointer in a gap to a cell. The
// canvas is left clear outside the view, for the frame a page draws there (panelRect).
// A board that scrolls marks what is hidden: an inset shadow on each edge beyond which cells are
// hidden (gone once scrolled to that edge) and a thin scroll bar per overflowing axis, its length
// and place the visible part's (clipMarks).
//
// Cell motion: a view given a `layer` canvas plays the active board module's cell motion on it
// (js/classic2d/motion-layer.js): the cell events of the pressed set — press or the event setPressed
// names for the cells gaining the press, release for the closed cells losing it — and of the
// engine's change lists update() draws — reveal, flag, unflag (changeEvent); a loss's change list
// starts none and drops any running on its cells, the end effect drawing it, and Classic 2D has no
// solved pulse. Only cells in view
// start an event. While a cell animates its slot is drawn empty, the layer drawing the cell; when
// it settles the board draws it again. Motion is visual only: hit-testing, the game and every input
// stay on the logical slot. setGame, hiding the board, a hand-off of board art (a theme change) and
// dropMotion() (a replay's seek) drop every animation.
//
// createBoardView({ canvas, grid, geometry?, createSkin?, token?, scale?, frame?, minTile?, onLayout?,
//                   layer?, overlay?, frames?, now?, onMotion?, timers? }) → view
//   canvas      a <canvas> or anything with width, height, style and getContext('2d').
//   grid        the board's cell graph provider (js/engine/square-grid.js): width, height.
//   geometry    the board's grid geometry (js/geometry/index.js), the square geometry of the grid's
//               size when not given; one built for another size than the grid is a RangeError.
//   createSkin  ({ redraw }) → skin with drawTile, dispose and optionally board() (the board module
//               it draws from: its gap, corner radius, ground and cursor ring); defaults to
//               createTileSkin, whose hand-off callback lays the board out again and repaints it.
//   token       the token reader's token(name); defaults to js/tokens.js.
//   scale       a BOARD_SCALES value, DEFAULT_BOARD_SCALE when not given.
//   frame       { top, right, bottom, left, minWidth, gaps }: the room a page's frame takes around
//               the view — a fixed part in CSS pixels, plus `gaps` of the module's gap on every side
//               of a board that fits (BOARD_FRAME) —, minWidth the frame's smallest width; none by
//               default. A function returning one is called again at every refit (resize, setScale).
//   minTile     the fit rule's smallest tile, the geometry's floor when not given; a smaller one lets a
//               board that is shown and not played fit whole instead of scrolling.
//   onLayout    (layout) → after every refit, the new layout.
//   layer       the motion layer's canvas, over the board canvas at the same size; none, no motion.
//   overlay     the ring layer's canvas, over the motion layer at the same size, which the cursor
//               ring is drawn on; none, no cursor ring.
//   frames, now the layer's frame scheduler ({ request, cancel }, the `timers` option's animation
//               frames by default) and clock (ms, performance.now by default).
//   onMotion    ({ cell, event, before, after }) → each cell event the layer started.
//
//   resize(width, height, pixelRatio)  the area in CSS pixels; repaints when anything changed.
//   setScale(scale)      refits at another board scale and repaints when the tile changes.
//   setGame(game)        the engine game whose cellState / cellNumber are drawn; repaints.
//   update(changed, { motion = true }?)  repaints only the cells listed (an action's `changed`),
//                        each first starting its cell event unless motion is false (a seek).
//   repaint()            repaints the whole visible board.
//   cellAt(x, y)         the cell under a canvas position in CSS pixels, or -1.
//   cellRect(c)          { x, y, size } of a cell's tile (its outline's box) in canvas CSS pixels.
//   scroll, scrollTo(x, y), scrollBy(dx, dy), pan(dx, dy), wheel(event), ensureVisible(c)
//   layout               boardLayout's: tile, gap and pitch (tile + gap), the frame's inset and
//                        radius (the module's frameRadius × the tile) among the rest.
//   extent(width, height)  boardExtent of the fit rule's layout in an area of width × height: the
//                        room the board would take there (a touch zoom aside).
//   zoomRange            { min, max }: the touch zoom's tiles, the geometry's floor to the fit-to-view
//                        tile (the whole board in the area inside the frame), whichever is larger.
//   boardPoint(x, y)     { u, v }: the board point under a canvas position, in board units — pitches —
//                        from the board's corner (on the square geometry cell c's slot is u from its
//                        column to the next).
//   zoom(tile, x, y, point?)  a touch pinch: the tile (whole, clamped to zoomRange) replaces the fit
//                        rule's for the view's life — kept through a resize, clamped to the new
//                        range — with `point` (the one under x, y by default) under x, y and the
//                        scroll clamped; true when the tile or the scroll changed. A new view opens
//                        at the fit rule's tile.
//   setHidden(hidden)    a hidden board shows the background only (the game is paused).
//   setPressed(cells, event = 'press')  the cells a held button presses
//                        (js/classic2d/pointer-input.js), `event` press or chordPress (a number's
//                        neighbours); a closed one is drawn in the skin's pressed state. setGame
//                        clears them.
//   dropMotion()         drops every running animation, the cells drawn in their state.
//   motion               the motion layer (has, cells, frame), or null without one.
//   setCursor(c)         the keyboard and controller cursor (js/classic2d/cursor-input.js), drawn
//                        as a focus ring outside cell c's tile on the ring layer — the board module's
//                        ring round its inner band, its corners following the tile's, along the
//                        cell's outline on a hexagon or triangle board — covering none
//                        of the tile's face and moving without redrawing a cell; -1 for none.
//   setMark(c)           the marked start cell a pre-generated board waits for: while closed, cell c
//                        is drawn as the skin's marked tile (the module's marked face under its
//                        dashed ring); -1 for none.
//   pulseMark()          the mark pulses: its ring is drawn twice as wide and back MARK_PULSE_STEPS
//                        times, MARK_PULSE_MS apart, on the view's timers — a first reveal off a
//                        forced start cell (js/classic2d/session.js START_HINT). markPulse is whether
//                        the ring is wide now.
//   showEffect(effect, t)  the end effect (js/classic2d/end-effect.js) at t ms: repaints the board
//                        with each tile as the effect shows it (a loss's pre-loss tiles before its
//                        wave arrives), each tile under its wave and the confetti over the
//                        board's rectangle, clipped to the view, all from the skin's board module
//                        (none without one); every redraw until the next call
//                        draws that moment. showEffect(null) repaints the board in its end state.
//                        The effect never touches the game: every tile is still read from it.
//   A won game's unflagged mines (its closed cells) are drawn as flags, the skin's static tile.
//   layout, pixelRatio, hidden, pressed, cursor, mark, markPulse, effect, scale, canvas, overlay, dispose()

import { MIN_TILE_SIZE, createTileSkin } from './tile-skin.js';
import { createMotionLayer, changeEvent } from './motion-layer.js';
import { token as readerToken } from '../tokens.js';
import { roundRect, drawMarkRing, inGlyphBox, outlinePath, growOutline } from '../tile-art.js';
import { CELL, PHASE } from '../engine/rules.js';
import { createGeometry } from '../geometry/index.js';
import {
  shownState, wonState, waveAt, confettiAt, drawWave, drawConfetti,
} from './end-effect.js';

/** The design token the board's ground is filled with while the skin has no board module. */
export const BOARD_BACKGROUND = '--color-board-frame';

/** The design token the cursor's focus ring is drawn in while the skin has no board module. */
export const CURSOR_RING = '--color-tile-cursor';

/** The mark's pulse: how many times its ring changes, and how far apart. */
export const MARK_PULSE_STEPS = 6;
export const MARK_PULSE_MS = 120;

/** The class of the motion layer's canvas mountBoardView puts over the board's. */
export const MOTION_LAYER_CLASS = 'board-motion';
/** The class of the ring layer's canvas mountBoardView puts over the motion layer's. */
export const RING_LAYER_CLASS = 'board-ring';

/** The key a pointer drag must hold to pan the board instead of playing it. */
export const PAN_MODIFIER = 'shiftKey';

/** The design tokens of a scrolling board's marks: the inset shadow and the scroll bars. */
export const BOARD_SHADOW = '--color-board-shadow';
export const BOARD_SCROLLBAR = '--color-board-scrollbar';

/** The board scales of the settings' boardScale: Fit, 100 % and 125 %. */
export const BOARD_SCALES = Object.freeze(['fit', '100', '125']);
export const DEFAULT_BOARD_SCALE = '100';
/** The default tile's cap: the largest tile at 100 %; 125 % scales it, Fit drops it. */
export const TILE_CAP = 48;

/** The depth of the inset shadow on a hidden edge, and a scroll bar's thickness and inset, in CSS px. */
export const SHADOW_DEPTH = 12;
export const SCROLLBAR = Object.freeze({ thickness: 4, inset: 2 });

const PRESSED = 'pressed';
const MARKED = 'marked';
const LINE = 1;
const PAGE = 2;
const NO_FRAME = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0, minWidth: 0, gaps: 0 });
// The share of its geometry's tile a grid's shape fractions (style2d.grids) are of: a triangle's
// height, √3 / 2 of the side the triangle geometry measures; the tile itself for the others. The
// board checks measure each grid's floor in it (js/themes/board-module.js).
export const GRID_UNIT = Object.freeze({ tri: Math.sqrt(3) / 2 });

/** The board frame (the kit's ui-board-frame) every Classic 2D board sits in: the module's gap on every side. */
export const BOARD_FRAME = Object.freeze({ gaps: 1 });

/** The largest tile a board scale allows: TILE_CAP at 100 %, 1.25 × it at 125 %, none at Fit. */
export function tileCap(scale = DEFAULT_BOARD_SCALE) {
  if (scale === 'fit') return Infinity;
  if (scale === '125') return Math.round(TILE_CAP * 1.25);
  return TILE_CAP;
}

/** The gap between tiles of `tile` px for a gap fraction: whole pixels, none for no fraction. */
export function gapPx(tile, gap = 0) {
  return gap > 0 ? Math.round(tile * gap) : 0;
}

/** The square geometry of a cols × rows board: what the exports taking cols and rows lay out on. */
const squareOf = (cols, rows) => createGeometry('square', cols, rows);

/**
 * The largest whole tile size at which a geometry's board, with the gaps between tiles (`gap`, a
 * fraction of the tile) and `edges` more gaps along each axis (a frame padded by the gap), fits
 * width × height, at most `max` and never below `min`.
 */
function fitTile(geometry, width, height, min, max, gap, edges) {
  const unit = geometry.extent(1, 0);
  let fit = Math.floor(Math.min(width / unit.width, height / unit.height));
  if (!Number.isFinite(fit)) return min;
  const over = (tile) => {
    const space = gapPx(tile, gap);
    const e = geometry.extent(tile, space);
    return e.width + edges * space > width || e.height + edges * space > height;
  };
  while (fit > min && over(fit)) fit--;
  return Math.max(min, Math.min(max, fit));
}

/**
 * The largest whole tile size at which a square board of cols × rows, with the gaps between tiles
 * (`gap`, a fraction of the tile) and `edges` more gaps along each axis, fits width × height, at
 * most `max` and never below `min`.
 */
export function fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max = Infinity, gap = 0, edges = 0) {
  return fitTile(squareOf(cols, rows), width, height, min, max, gap, edges);
}

const frameOf = (frame) => ({ ...NO_FRAME, ...(frame ?? {}) });

/**
 * Where the board sits in an area (the canvas): tile size, the gap between tiles (`gap` a fraction
 * of the tile) and the pitch, board size (the geometry's extent; a square cols × rows board without
 * one), the frame's inset on each side (`inset`: its fixed part,
 * plus its gaps around a board that fits with them) and corner radius (`frameRadius` a fraction of
 * the tile, in whole pixels), the view rectangle it shows through — centred with its frame when the board
 * fits, the area inside the frame when it scrolls — the board's offsets (its top-left corner at
 * scroll 0) and the scroll range.
 */
export function boardLayout({ geometry, cols, rows, width, height, min, max = Infinity, frame, gap = 0, frameRadius = 0 }) {
  const g = geometry ?? squareOf(cols, rows);
  const f = frameOf(frame);
  const roomWidth = Math.max(0, width - f.left - f.right);
  const roomHeight = Math.max(0, height - f.top - f.bottom);
  const tile = fitTile(g, roomWidth, roomHeight, min ?? g.minTile, max, gap, 2 * f.gaps);
  const space = gapPx(tile, gap);
  const { width: boardWidth, height: boardHeight } = g.extent(tile, space);
  // The frame's gaps pad a board that fits with them; a board that does not scrolls with none.
  const padded = space * f.gaps;
  const pad = boardWidth + 2 * padded <= roomWidth && boardHeight + 2 * padded <= roomHeight ? padded : 0;
  const inset = Object.freeze({ top: f.top + pad, right: f.right + pad, bottom: f.bottom + pad, left: f.left + pad });
  const availWidth = Math.max(0, width - inset.left - inset.right);
  const availHeight = Math.max(0, height - inset.top - inset.bottom);
  const maxScrollX = Math.max(0, boardWidth - availWidth);
  const maxScrollY = Math.max(0, boardHeight - availHeight);
  const viewWidth = Math.min(boardWidth, availWidth);
  const viewHeight = Math.min(boardHeight, availHeight);
  const viewX = maxScrollX ? inset.left : inset.left + Math.floor((availWidth - viewWidth) / 2);
  const viewY = maxScrollY ? inset.top : Math.floor((height - viewHeight - inset.top - inset.bottom) / 2) + inset.top;
  return Object.freeze({
    width,
    height,
    tile,
    gap: space,
    pitch: tile + space,
    inset,
    frameRadius: Math.round(frameRadius * tile),
    boardWidth,
    boardHeight,
    viewX,
    viewY,
    viewWidth,
    viewHeight,
    offsetX: viewX,
    offsetY: viewY,
    maxScrollX,
    maxScrollY,
    scrolls: maxScrollX > 0 || maxScrollY > 0,
  });
}

/**
 * The frame's rectangle around a layout's view, in canvas CSS pixels: the view widened by the
 * layout's frame inset on each side, at least frame.minWidth wide (centred on the view) and never
 * wider than the area.
 */
export function panelRect(layout, frame) {
  const f = layout.inset ?? frameOf(frame);
  const natural = layout.viewWidth + f.left + f.right;
  const width = Math.min(layout.width, Math.max(natural, frameOf(frame).minWidth));
  const x = Math.max(0, Math.min(layout.width - width, layout.viewX - f.left - Math.floor((width - natural) / 2)));
  return { x, y: layout.viewY - f.top, width, height: layout.viewHeight + f.top + f.bottom };
}

/**
 * The room a layout's board takes of its area, in CSS pixels: the view and the frame's inset on
 * each side — the frame's rectangle of a board that fits, the view alone of one that scrolls. An
 * area of exactly that size lays the board out at the same tile with nothing left over, so a
 * window that hugs its board sizes the board's area to it (js/ui.js sizeBoard2D).
 */
export function boardExtent(layout) {
  const { inset } = layout;
  return { width: layout.viewWidth + inset.left + inset.right, height: layout.viewHeight + inset.top + inset.bottom };
}

/**
 * What a scrolled board marks, in canvas CSS pixels: on each edge whether cells lie hidden beyond
 * it (its inset shadow), and per overflowing axis the scroll bar { x, y, width, height } — along
 * the bottom for x, the right for y — whose length and place are the visible part's; null where
 * the board does not overflow.
 */
export function clipMarks(layout, scroll) {
  const { viewX, viewY, viewWidth, viewHeight, boardWidth, boardHeight, maxScrollX, maxScrollY } = layout;
  const { thickness, inset } = SCROLLBAR;
  const barX = maxScrollX > 0 ? {
    x: viewX + (scroll.x / boardWidth) * viewWidth,
    y: viewY + viewHeight - inset - thickness,
    width: (viewWidth / boardWidth) * viewWidth,
    height: thickness,
  } : null;
  const barY = maxScrollY > 0 ? {
    x: viewX + viewWidth - inset - thickness,
    y: viewY + (scroll.y / boardHeight) * viewHeight,
    width: thickness,
    height: (viewHeight / boardHeight) * viewHeight,
  } : null;
  return {
    left: scroll.x > 0,
    right: scroll.x < maxScrollX,
    top: scroll.y > 0,
    bottom: scroll.y < maxScrollY,
    barX,
    barY,
  };
}

/**
 * The cell at canvas position x, y (CSS pixels) for a layout and scroll position, or -1: the cell
 * whose slot holds the position, as the geometry hit-tests it (on the square geometry its tile and
 * the gap after it). cellAtLayout(layout, scroll, geometry, x, y), or, for a square board,
 * cellAtLayout(layout, scroll, cols, rows, x, y).
 */
export function cellAtLayout(layout, scroll, ...args) {
  const [geometry, x, y] = typeof args[0] === 'object' ? args : [squareOf(args[0], args[1]), args[2], args[3]];
  if (!(x >= layout.viewX && y >= layout.viewY && x < layout.viewX + layout.viewWidth && y < layout.viewY + layout.viewHeight)) return -1;
  const bx = x - layout.offsetX + scroll.x;
  const by = y - layout.offsetY + scroll.y;
  if (!(bx >= 0 && by >= 0 && bx < layout.boardWidth && by < layout.boardHeight)) return -1;
  return geometry.cellAt(bx, by, layout.tile, layout.gap ?? 0);
}

export function createBoardView({
  canvas, grid, geometry: given = null, createSkin = createTileSkin, token = readerToken, scale: initialScale = DEFAULT_BOARD_SCALE,
  frame = null, minTile: floor = null, onLayout = () => {}, timers = globalThis, layer = null, overlay = null, onMotion = () => {},
  frames = { request: (fn) => timers.requestAnimationFrame(fn), cancel: (id) => timers.cancelAnimationFrame(id) }, now,
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('createBoardView needs a canvas');
  if (!grid || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) throw new TypeError('createBoardView needs a grid');
  const geometry = given ?? createGeometry('square', grid.width, grid.height);
  if (geometry.width !== grid.width || geometry.height !== grid.height) {
    throw new RangeError(`a ${geometry.width} × ${geometry.height} geometry for a ${grid.width} × ${grid.height} grid`);
  }
  const count = geometry.count;
  const minTile = floor ?? geometry.minTile;
  const ctx = canvas.getContext('2d');
  const octx = overlay ? overlay.getContext('2d') : null;

  let scale = BOARD_SCALES.includes(initialScale) ? initialScale : DEFAULT_BOARD_SCALE;
  let zoomTile = null; // a touch zoom's tile, or null for the fit rule's
  const measure = typeof frame === 'function' ? frame : () => frame;
  let f = frameOf(measure());
  // The board module the skin draws from (null for a skin without one), and what the view reads of
  // it: the grid's gap and corner radius as fractions of the tile — the hexagon's and triangle's
  // from `style2d.grids`, a triangle's of its height, which is GRID_UNIT of the side the geometry
  // measures its tile by; the square's the style's own —, the ground and the cursor ring.
  const boardOf = () => skin?.board?.() ?? null;
  const shapeOf2d = () => { const s = boardOf()?.style2d; return s?.grids?.[geometry.kind] ?? s?.params ?? null; };
  const gapOf = () => (shapeOf2d()?.gap ?? 0) * (GRID_UNIT[geometry.kind] ?? 1);
  const frameRadiusOf = () => boardOf()?.style2d?.params?.frameRadius ?? 0;
  // The zoom range for an area: the geometry's floor to the tile at which the whole board fits in its frame, either way round.
  const rangeOf = (width, height) => {
    const whole = Math.max(1, fitTile(geometry, width - f.left - f.right, height - f.top - f.bottom, 1, Infinity, gapOf(), 2 * f.gaps) || 1);
    return { min: Math.min(geometry.minTile, whole), max: Math.max(geometry.minTile, whole) };
  };
  const clampTile = (tile, range) => Math.max(range.min, Math.min(range.max, Math.round(tile)));
  const fit = (width, height) => {
    const options = { geometry, width, height, frame: f, gap: gapOf(), frameRadius: frameRadiusOf() };
    if (zoomTile === null) return boardLayout({ ...options, min: minTile, max: geometry.tileCap(scale) });
    zoomTile = clampTile(zoomTile, rangeOf(width, height));
    return boardLayout({ ...options, min: zoomTile, max: zoomTile });
  };
  // The skin first, so the first layout has its gap; a hand-off lays the board out again (its gap
  // may change) and repaints.
  let skin = null;
  skin = createSkin({ redraw: () => { motion?.dropAll(); if (sized) refit(layout.width, layout.height); } });
  let layout = fit(0, 0);
  let ratio = 1;
  let sized = false;
  let game = null;
  let hidden = false;
  let pressed = new Set();
  let cursor = -1;
  let mark = -1; // the marked start cell, or -1
  let markPulse = false; // the mark's ring drawn thick, during its pulse
  let pulseTimer = null;
  let marks = null; // the scrolled board's marks for the current layout and scroll, or null
  let effect = null; // the end effect playing, or null
  let effectT = 0; // the moment of it drawn, in ms
  const scroll = { x: 0, y: 0 };

  // Each cell's outline on the board (the geometry's, at the layout's tile and gap), asked the first
  // time the cell is placed at that tile and gap, and its shape — the outline with its glyph box —
  // that the skin draws its tile through.
  let outlines = [];
  let shapes = [];
  let outlinesAt = null;
  function outline(c) {
    if (outlinesAt?.tile !== layout.tile || outlinesAt?.gap !== layout.gap) {
      outlines = new Array(count);
      shapes = new Array(count);
      outlinesAt = { tile: layout.tile, gap: layout.gap };
    }
    return (outlines[c] ??= geometry.outline(c, layout.tile, layout.gap));
  }
  function shapeOf(c) {
    const o = outline(c);
    return (shapes[c] ??= { outline: o, glyphBox: geometry.glyphBox(c, layout.tile, layout.gap) });
  }

  // Cell c's tile — its outline's box — in canvas CSS pixels: { x, y, width, height }.
  function tileBox(c) {
    const o = outline(c);
    return { x: layout.offsetX + o.x - scroll.x, y: layout.offsetY + o.y - scroll.y, width: o.width, height: o.height };
  }

  // Whether cell c's tile is at least partly in view.
  function inView(c) {
    const { x, y, width, height } = tileBox(c);
    return !(x <= layout.viewX - width || y <= layout.viewY - height || x >= layout.viewX + layout.viewWidth || y >= layout.viewY + layout.viewHeight);
  }

  const motion = layer ? createMotionLayer({
    canvas: layer,
    frames,
    ...(now ? { now } : {}),
    place: (c) => {
      if (!inView(c)) return null;
      const centre = geometry.centre(c, layout.tile, layout.gap);
      return { ...tileBox(c), size: layout.tile, cx: layout.offsetX + centre.x - scroll.x, cy: layout.offsetY + centre.y - scroll.y };
    },
    paint: (lctx, c, face, x, y, size, depth) => skin.drawTile(lctx, x, y, size, face, game?.cellNumber(c) ?? 0, ratio, depth, shapeOf(c)),
    clip: () => (layout.scrolls ? { x: layout.viewX, y: layout.viewY, width: layout.viewWidth, height: layout.viewHeight } : null),
    onSettle: (cells) => draw(cells),
  }) : null;

  // Starts cell c's `event` from face `before` to `after`, as the board module describes it.
  function animate(c, event, before, after) {
    if (!motion || !inView(c)) return;
    if (motion.start(c, event, before, after, boardOf()?.motion?.[event] ?? null)) onMotion({ cell: c, event, before, after });
  }

  function clipTo(x, y, w, h) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }

  // The marks' rectangles: one shadow band per hidden edge, then the scroll bars.
  function markRects() {
    if (!layout.scrolls) return null;
    const m = clipMarks(layout, scroll);
    const { viewX: x, viewY: y, viewWidth: w, viewHeight: h } = layout;
    const dx = Math.min(SHADOW_DEPTH, w / 2);
    const dy = Math.min(SHADOW_DEPTH, h / 2);
    const bands = [];
    if (m.left) bands.push({ x, y, w: dx, h, from: [x, 0], to: [x + dx, 0] });
    if (m.right) bands.push({ x: x + w - dx, y, w: dx, h, from: [x + w, 0], to: [x + w - dx, 0] });
    if (m.top) bands.push({ x, y, w, h: dy, from: [0, y], to: [0, y + dy] });
    if (m.bottom) bands.push({ x, y: y + h - dy, w, h: dy, from: [0, y + h], to: [0, y + h - dy] });
    const bars = [m.barX, m.barY].filter(Boolean).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height }));
    return { bands, bars };
  }

  const meets = (r, x, y, w, h) => r.x < x + w && r.x + r.w > x && r.y < y + h && r.y + r.h > y;

  // Draws the marks that meet the rectangle x, y, w, h (the whole view by default), clipped to it.
  function drawMarks(x = layout.viewX, y = layout.viewY, w = layout.viewWidth, h = layout.viewHeight) {
    if (!marks) return;
    const bands = marks.bands.filter((r) => meets(r, x, y, w, h));
    const bars = marks.bars.filter((r) => meets(r, x, y, w, h));
    if (!bands.length && !bars.length) return;
    ctx.save();
    clipTo(x, y, w, h);
    if (bands.length) {
      const shade = token(BOARD_SHADOW);
      for (const b of bands) {
        const g = ctx.createLinearGradient(b.from[0], b.from[1], b.to[0], b.to[1]);
        g.addColorStop(0, shade);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    }
    if (bars.length) {
      ctx.fillStyle = token(BOARD_SCROLLBAR);
      for (const b of bars) ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.restore();
  }

  const ground = () => boardOf()?.palette?.boardGround ?? token(BOARD_BACKGROUND);

  // Cell c's outline corners in canvas CSS pixels.
  function outlineAt(c) {
    const o = outline(c);
    const { x, y } = tileBox(c);
    return o.points.map(([px, py]) => [x - o.x + px, y - o.y + py]);
  }

  // The ring layer: cleared, then the cursor's ring drawn round its tile while the board shows it —
  // the board module's ring, `width` px wide with its outer band of `inner` innerWidth px inside it,
  // the band's outer edge radius.px outside the tile and its corners tile × radius.tile + radius.px,
  // or, without a module, a square ring in CURSOR_RING a twelfth of the tile wide just outside it;
  // round a hexagon or triangle tile, either follows the cell's outline grown outward, its corners
  // measured on the outline's height (the module's) or straight (the fallback's) —
  // clipped to the view on a board that scrolls.
  function drawRing() {
    if (!octx || !sized) return;
    octx.setTransform(ratio, 0, 0, ratio, 0, 0);
    octx.clearRect(0, 0, layout.width, layout.height);
    if (hidden || !game || cursor < 0 || !inView(cursor)) return;
    const { x, y, size: t } = cellRect(cursor);
    const o = outline(cursor);
    const points = o.shape === 'square' ? null : outlineAt(cursor);
    octx.save();
    if (layout.scrolls) {
      octx.beginPath();
      octx.rect(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
      octx.clip();
    }
    const look = boardOf()?.cursor;
    if (!look) {
      const w = Math.max(2, Math.round(t / 12));
      octx.strokeStyle = token(CURSOR_RING);
      octx.lineWidth = w;
      if (points) {
        outlinePath(octx, growOutline(points, w / 2), 0);
        octx.stroke();
      } else {
        octx.strokeRect(x - w / 2, y - w / 2, t + w, t + w);
      }
    } else {
      const out = look.radius.px;
      const corner = (points ? o.height : t) * look.radius.tile + out;
      // A band whose centre line runs `d` px out from the band's box (negative: inside it).
      const band = (d, width, style) => {
        octx.strokeStyle = style;
        octx.lineWidth = width;
        if (points) outlinePath(octx, growOutline(points, out + d), Math.max(0, corner + d));
        else roundRect(octx, x - out - d, y - out - d, t + 2 * (out + d), t + 2 * (out + d), Math.max(0, corner + d));
        octx.stroke();
      };
      band(look.width / 2, look.width, look.color);
      band(-look.innerWidth / 2, look.innerWidth, look.inner);
    }
    octx.restore();
  }

  // A hexagon or triangle cell's shape for the end effect's wave: its outline, the geometry's centre
  // and the face's corner radius (the grid's radius × the outline's height), in canvas CSS pixels.
  function waveOutline(c) {
    const centre = geometry.centre(c, layout.tile, layout.gap);
    return {
      points: outlineAt(c),
      centre: [layout.offsetX + centre.x - scroll.x, layout.offsetY + centre.y - scroll.y],
      radius: outline(c).height * (shapeOf2d()?.radius ?? 0),
    };
  }

  // Paints cell c's tile (the marked tile for the closed start cell, its ring wide while it pulses);
  // returns false when it is out of view.
  function drawCell(c) {
    if (!inView(c)) return false;
    const { x, y } = tileBox(c);
    const t = layout.tile;
    const now = game.cellState(c);
    let state = now;
    if (effect) state = shownState(effect, c, state, effectT);
    else if (game.phase === PHASE.WON) state = wonState(state);
    const moving = motion?.has(c);
    const o = outline(c);
    const shaped = o.shape !== 'square';
    // A rounded or shaped tile leaves its corners to the ground: lay it again under the tile it
    // replaces — in a hexagon's or triangle's outline, whose box reaches its neighbours. An animating
    // cell's slot is the ground alone, the layer drawing the cell.
    if (moving || shaped || shapeOf2d()?.radius > 0) {
      ctx.fillStyle = ground();
      if (shaped) {
        outlinePath(ctx, outlineAt(c), 0);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, t, t);
      }
    }
    if (!moving) {
      let shown = state;
      if (state === CELL.CLOSED && pressed.has(c)) shown = PRESSED;
      else if (state === CELL.CLOSED && c === mark && !effect) shown = MARKED;
      const paint = () => skin.drawTile(ctx, x, y, t, shown, game.cellNumber(c), ratio, null, shapeOf(c));
      if (effect) drawWave(ctx, x, y, t, waveAt(effect, c, now, effectT, boardOf()?.end2d), boardOf(), paint, shaped ? waveOutline(c) : null);
      else paint();
      const ring = boardOf()?.palette?.faces2d?.marked?.ring;
      if (shown === MARKED && markPulse && ring) {
        ctx.save();
        ctx.translate(x, y);
        if (shaped) {
          const g = shapeOf(c).glyphBox;
          inGlyphBox(ctx, { x: g.x - o.x, y: g.y - o.y, width: g.width, height: g.height }, (S) => drawMarkRing(ctx, S, { color: ring, width: 4 }));
        } else {
          drawMarkRing(ctx, t, { color: ring, width: 4 });
        }
        ctx.restore();
      }
    }
    return true;
  }

  // The cells a repaint walks: the index span from the cell at the view's top-left corner to the one
  // at its bottom-right, widened by a row each way for a tile reaching into the view from a row
  // beyond (the grids' indices run row by row); the cells drawn are those of it in view.
  function viewSpan() {
    const { tile, gap, boardWidth, boardHeight } = layout;
    const at = (x, y) => geometry.cellAt(Math.max(0, Math.min(boardWidth - 1, x)), Math.max(0, Math.min(boardHeight - 1, y)), tile, gap);
    const top = at(scroll.x, scroll.y);
    const bottom = at(scroll.x + layout.viewWidth - 1, scroll.y + layout.viewHeight - 1);
    if (top < 0 || bottom < 0) return [0, count - 1];
    return [Math.max(0, top - geometry.width - 1), Math.min(count - 1, bottom + geometry.width + 1)];
  }

  function repaint() {
    if (!sized) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = ground();
    ctx.fillRect(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    marks = null;
    drawRing();
    if (hidden || !game) return;
    ctx.save();
    if (layout.scrolls) clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    const [first, last] = viewSpan();
    for (let c = first; c <= last; c++) drawCell(c);
    ctx.restore();
    if (effect) drawEffectLayer();
    marks = markRects();
    drawMarks();
  }

  // The end effect's confetti over the board's rectangle, clipped to the part in view.
  function drawEffectLayer() {
    const colours = boardOf()?.palette?.confetti;
    const pieces = confettiAt(effect, effectT, { width: layout.boardWidth, height: layout.boardHeight, tile: layout.tile, gap: layout.gap });
    if (!pieces.length || !colours?.length) return;
    ctx.save();
    clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    drawConfetti(ctx, pieces, colours, layout.offsetX - scroll.x, layout.offsetY - scroll.y);
    ctx.restore();
  }

  // The cells of an engine change list: each starts its cell event (none with `motion` false, and
  // a loss's drops any running on its cells), then is drawn.
  function update(changed, { motion: play = true } = {}) {
    if (!sized || hidden || !game) return;
    if (motion && game.phase === PHASE.LOST) {
      for (let i = 0; i < changed.length; i++) motion.drop(changed[i]);
    } else if (play && motion) {
      for (let i = 0; i < changed.length; i++) {
        const c = changed[i];
        if (!(c >= 0 && c < count)) continue;
        const after = game.cellState(c);
        const e = changeEvent(after, pressed.has(c));
        if (e) animate(c, e.event, e.before, after);
      }
    }
    draw(changed);
  }

  // Draws the cells listed, in view, with the marks over them.
  function draw(changed) {
    if (!sized || hidden || !game) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.save();
    if (layout.scrolls) clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    for (let i = 0; i < changed.length; i++) {
      const c = changed[i];
      if (c >= 0 && c < count && drawCell(c) && marks) {
        const { x, y, width, height } = tileBox(c);
        drawMarks(x, y, width, height);
      }
    }
    ctx.restore();
  }

  // Moves to x, y clamped to the scroll range; repaints and returns true when it moved.
  function scrollTo(x, y) {
    const nx = Math.round(Math.min(layout.maxScrollX, Math.max(0, x)));
    const ny = Math.round(Math.min(layout.maxScrollY, Math.max(0, y)));
    if (nx === scroll.x && ny === scroll.y) return false;
    scroll.x = nx;
    scroll.y = ny;
    repaint();
    return true;
  }

  // Lays the board out again over the same area; repaints and reports it.
  function refit(w, h) {
    f = frameOf(measure());
    layout = fit(w, h);
    scroll.x = Math.min(layout.maxScrollX, scroll.x);
    scroll.y = Math.min(layout.maxScrollY, scroll.y);
    repaint();
    onLayout(layout);
  }

  function resize(width, height, pixelRatio = 1) {
    const w = Math.max(0, Math.round(width));
    const h = Math.max(0, Math.round(height));
    if (sized && w === layout.width && h === layout.height && pixelRatio === ratio) return;
    sized = true;
    ratio = pixelRatio;
    motion?.resize(w, h, ratio);
    for (const c of overlay ? [canvas, overlay] : [canvas]) {
      c.width = Math.round(w * ratio);
      c.height = Math.round(h * ratio);
      if (c.style) {
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
      }
    }
    refit(w, h);
  }

  function setScale(next) {
    const s = BOARD_SCALES.includes(next) ? next : DEFAULT_BOARD_SCALE;
    if (s === scale) return;
    scale = s;
    if (sized) refit(layout.width, layout.height);
    else layout = fit(0, 0);
  }

  // A wheel event's deltas in CSS pixels: a line is a tile, a page is the view; shift with a
  // vertical-only wheel scrolls horizontally. Returns true when the board scrolled or could.
  function wheel({ deltaX = 0, deltaY = 0, deltaMode = 0, shiftKey = false } = {}) {
    if (!layout.scrolls) return false;
    let dx = deltaX;
    let dy = deltaY;
    if (shiftKey && dx === 0) { dx = dy; dy = 0; }
    if (deltaMode === LINE) { dx *= layout.pitch; dy *= layout.pitch; }
    else if (deltaMode === PAGE) { dx *= layout.viewWidth; dy *= layout.viewHeight; }
    scrollTo(scroll.x + dx, scroll.y + dy);
    return true;
  }

  // The board point under canvas position x, y, in board units (pitches) from the board's top-left corner.
  function boardPoint(x, y) {
    return { u: (x - layout.offsetX + scroll.x) / layout.pitch, v: (y - layout.offsetY + scroll.y) / layout.pitch };
  }

  // A touch zoom: the tile clamped to the zoom range, board point `point` (the one under x, y by
  // default) put under canvas position x, y, the scroll clamped; repaints, reports the layout and
  // returns true when the tile or the scroll changed.
  function zoom(tile, x, y, point = boardPoint(x, y)) {
    if (!Number.isFinite(tile)) return false;
    const before = { tile: layout.tile, x: scroll.x, y: scroll.y };
    zoomTile = clampTile(tile, rangeOf(layout.width, layout.height));
    layout = fit(layout.width, layout.height);
    scroll.x = Math.round(Math.min(layout.maxScrollX, Math.max(0, point.u * layout.pitch - (x - layout.offsetX))));
    scroll.y = Math.round(Math.min(layout.maxScrollY, Math.max(0, point.v * layout.pitch - (y - layout.offsetY))));
    if (layout.tile === before.tile && scroll.x === before.x && scroll.y === before.y) return false;
    repaint();
    onLayout(layout);
    return true;
  }

  function cellRect(c) {
    const { x, y } = tileBox(c);
    return { x, y, size: layout.tile };
  }

  // Scrolls just enough for cell c's whole tile to be in view; true when it scrolled.
  function ensureVisible(c) {
    if (!Number.isInteger(c) || c < 0 || c >= count) return false;
    const { x, y, size } = cellRect(c);
    const { viewX, viewY, viewWidth, viewHeight } = layout;
    let sx = scroll.x;
    let sy = scroll.y;
    if (x < viewX) sx += x - viewX;
    else if (x + size > viewX + viewWidth) sx += x + size - viewX - viewWidth;
    if (y < viewY) sy += y - viewY;
    else if (y + size > viewY + viewHeight) sy += y + size - viewY - viewHeight;
    return scrollTo(sx, sy);
  }

  return {
    get canvas() { return canvas; },
    get overlay() { return overlay; },
    get layout() { return layout; },
    get pixelRatio() { return ratio; },
    get hidden() { return hidden; },
    get pressed() { return [...pressed]; },
    get cursor() { return cursor; },
    get mark() { return mark; },
    get markPulse() { return markPulse; },
    get effect() { return effect; },
    get scale() { return scale; },
    get scroll() { return { x: scroll.x, y: scroll.y }; },
    /** The touch zoom's tile range for the current area: { min, max }. */
    get zoomRange() { return rangeOf(layout.width, layout.height); },
    /** The room the board takes of a width × height area at the fit rule's tile: { width, height }. */
    extent(width, height) {
      const w = Math.max(0, Math.round(width));
      const h = Math.max(0, Math.round(height));
      return boardExtent(boardLayout({ geometry, width: w, height: h, frame: f, gap: gapOf(), min: minTile, max: geometry.tileCap(scale) }));
    },
    resize,
    setScale,
    get motion() { return motion; },
    setGame(next) {
      motion?.dropAll();
      game = next ?? null;
      pressed = new Set();
      effect = null;
      repaint();
    },
    /**
     * Shows `cells` pressed, redrawing only the cells that gain or lose the press: a closed cell
     * gaining it plays `event` (press or chordPress), one losing it a release.
     */
    setPressed(cells, event = 'press') {
      const next = new Set(cells);
      const lost = [...pressed].filter((c) => !next.has(c));
      const gained = [...next].filter((c) => !pressed.has(c));
      pressed = next;
      if (motion && game && sized && !hidden) {
        for (const c of lost) if (game.cellState(c) === CELL.CLOSED) animate(c, 'release', PRESSED, CELL.CLOSED);
        for (const c of gained) if (game.cellState(c) === CELL.CLOSED) animate(c, event, CELL.CLOSED, PRESSED);
      }
      draw([...lost, ...gained]);
    },
    /** Drops every running animation (a replay's seek), drawing those cells in their state. */
    dropMotion() {
      if (motion) draw(motion.dropAll());
    },
    /** Moves the focus ring to cell c (-1 hides it), redrawing the ring layer alone. */
    setCursor(c) {
      const next = Number.isInteger(c) && c >= 0 && c < count ? c : -1;
      if (next === cursor) return;
      cursor = next;
      drawRing();
    },
    /** Marks cell c as the start cell a pre-generated board waits for (-1 for none), redrawing the cells it leaves and enters. */
    setMark(c) {
      const next = Number.isInteger(c) && c >= 0 && c < count ? c : -1;
      if (next === mark) return;
      const touched = [mark, next];
      mark = next;
      draw(touched);
    },
    /** The mark pulses: its ring widens and narrows MARK_PULSE_STEPS times. */
    pulseMark() {
      if (pulseTimer !== null) timers.clearTimeout(pulseTimer);
      let steps = MARK_PULSE_STEPS;
      const step = () => {
        markPulse = steps % 2 === 0;
        steps -= 1;
        if (mark >= 0) draw([mark]);
        pulseTimer = steps > 0 ? timers.setTimeout(step, MARK_PULSE_MS) : null;
        if (steps <= 0) {
          markPulse = false;
          if (mark >= 0) draw([mark]);
        }
      };
      step();
    },
    update,
    repaint,
    /** Draws the end effect at t ms over the whole board; null ends it in the board's end state. */
    showEffect(next, t = 0) {
      effect = next ?? null;
      effectT = t;
      repaint();
    },
    cellAt: (x, y) => cellAtLayout(layout, scroll, geometry, x, y),
    cellRect,
    boardPoint,
    zoom,
    scrollTo,
    scrollBy: (dx, dy) => scrollTo(scroll.x + dx, scroll.y + dy),
    /** The board follows a pointer that moved by dx, dy. */
    pan: (dx, dy) => scrollTo(scroll.x - dx, scroll.y - dy),
    wheel,
    ensureVisible,
    setHidden(next) {
      const was = hidden;
      hidden = Boolean(next);
      if (hidden) motion?.dropAll();
      if (hidden !== was) repaint();
    },
    dispose() {
      if (pulseTimer !== null) timers.clearTimeout(pulseTimer);
      motion?.dispose();
      skin.dispose();
      game = null;
    },
  };
}

// Browser wiring: a canvas filling `container` (above whatever the container already holds, such as
// a frame drawn behind the board) with the motion layer's canvas and then the ring layer's right
// after it, over it at the same place and size and taking no input, sized on container resize and device pixel ratio change,
// scrolled by the wheel and panned by dragging with PAN_MODIFIER held; onUserScroll() follows each
// scroll the player made that way. While the board scrolls the container carries data-board-clipped
// and its canvases are clipped to the view, rounded at the theme's --board-viewport-radius.
// `framed`: the view mounts its own board frame — a ui-board-frame first in the container, laid out
// in BOARD_FRAME unless `frame` is given, placed at panelRect with its corner radius
// (--board-frame-radius) at every layout and hidden while the board scrolls.
// onMount(view) runs once the view exists and before its first fit, so the page can size the
// container to the board (the view's extent) and the first layout is already the board's.
// Returns the view with destroy(), which removes what it added and every listener.
export function mountBoardView({ container, grid, win = globalThis, onUserScroll = () => {}, framed = false, onLayout = () => {}, onMount = () => {}, ...options }) {
  let frameEl = null;
  if (framed) {
    frameEl = win.document.createElement('div');
    frameEl.className = 'ui-board-frame hidden';
    frameEl.setAttribute('aria-hidden', 'true');
    container.prepend(frameEl);
  }
  const laidOut = (layout) => {
    container.toggleAttribute('data-board-clipped', layout.scrolls);
    if (frameEl) {
      const rect = panelRect(layout);
      Object.assign(frameEl.style, {
        left: `${canvas.offsetLeft + rect.x}px`, top: `${canvas.offsetTop + rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px`,
      });
      frameEl.style.setProperty('--board-frame-radius', `${layout.frameRadius}px`);
      frameEl.classList.toggle('hidden', layout.scrolls);
    }
    // A clipped board's viewport is the view, rounded at the theme's --board-viewport-radius.
    const clip = layout.scrolls
      ? `inset(${layout.viewY}px ${layout.width - layout.viewX - layout.viewWidth}px ${layout.height - layout.viewY - layout.viewHeight}px ${layout.viewX}px round var(--board-viewport-radius, 0px))`
      : '';
    for (const c of [canvas, layer, overlay]) c.style.clipPath = clip;
    onLayout(layout);
  };
  const canvas = win.document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.position = 'relative';
  canvas.style.touchAction = 'none';
  container.append(canvas);
  const layer = win.document.createElement('canvas');
  layer.className = MOTION_LAYER_CLASS;
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { display: 'block', position: 'absolute', pointerEvents: 'none' });
  canvas.after(layer);
  const overlay = win.document.createElement('canvas');
  overlay.className = RING_LAYER_CLASS;
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(overlay.style, { display: 'block', position: 'absolute', pointerEvents: 'none' });
  layer.after(overlay);
  const frames = { request: (fn) => win.requestAnimationFrame(fn), cancel: (id) => win.cancelAnimationFrame(id) };
  const view = createBoardView({ canvas, grid, layer, overlay, frames, ...options, frame: options.frame ?? (framed ? BOARD_FRAME : null), onLayout: laidOut });

  const fit = () => {
    const box = container.getBoundingClientRect();
    view.resize(box.width, box.height, win.devicePixelRatio || 1);
    for (const l of [layer, overlay]) {
      l.style.left = `${canvas.offsetLeft}px`;
      l.style.top = `${canvas.offsetTop}px`;
    }
  };
  const observer = new win.ResizeObserver(fit);
  observer.observe(container);

  let ratioQuery = null;
  const watchRatio = () => {
    ratioQuery?.removeEventListener('change', onRatio);
    ratioQuery = win.matchMedia(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    ratioQuery.addEventListener('change', onRatio);
  };
  function onRatio() {
    fit();
    watchRatio();
  }
  watchRatio();

  const onWheel = (event) => {
    const before = view.scroll;
    if (!view.wheel(event)) return;
    event.preventDefault();
    const after = view.scroll;
    if (after.x !== before.x || after.y !== before.y) onUserScroll();
  };
  let drag = null;
  const onDown = (event) => {
    if (!event[PAN_MODIFIER] || event.button !== 0 || !view.layout.scrolls) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: view.scroll };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const onMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (view.scrollTo(drag.scroll.x - (event.clientX - drag.x), drag.scroll.y - (event.clientY - drag.y))) onUserScroll();
  };
  const onUp = (event) => {
    if (drag && event.pointerId === drag.id) drag = null;
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  onMount(view);
  fit();

  return Object.assign(Object.create(view), {
    destroy() {
      observer.disconnect();
      ratioQuery?.removeEventListener('change', onRatio);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      view.dispose();
      canvas.remove();
      layer.remove();
      overlay.remove();
      frameEl?.remove();
      container.removeAttribute('data-board-clipped');
    },
  });
}
