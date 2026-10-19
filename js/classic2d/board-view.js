// Classic 2D board view: the Canvas 2D board fitted to the area it is given, hit-testing,
// scrolling and per-cell redraw through the tile skin (js/classic2d/tile-skin.js). The skin owns
// how a tile looks; this module owns where tiles go. DOM-free at import: createBoardView takes its
// canvas and is driven by calls; mountBoardView is the browser wiring around it.
//
// Fit rule: the tile is the largest whole size at which the board fits the area left inside the
// frame, at most the board scale's cap (tileCap) and never below MIN_TILE_SIZE (minTile, for a board
// shown and not played: the main menu's preview fits whole at any tile). A board that fits
// is centred, frame and all, and never scrolls; one that does not keeps the minimum tile, fills the
// area, starts at its top-left corner and scrolls (wheel, drag with the pan modifier, ensureVisible
// for the cursor). Tiles sit edge to edge inside the view rectangle (layout.viewX, viewY,
// viewWidth, viewHeight), which is filled with the board background token; the canvas is left
// clear outside it, for the frame a page draws there (panelRect).
// A board that scrolls marks what is hidden: an inset shadow on each edge beyond which cells are
// hidden (gone once scrolled to that edge) and a thin scroll bar per overflowing axis, its length
// and place the visible part's (clipMarks).
//
// createBoardView({ canvas, grid, createSkin?, token?, scale?, frame?, minTile?, onLayout? }) → view
//   canvas      a <canvas> or anything with width, height, style and getContext('2d').
//   grid        the square grid (js/engine/square-grid.js): width, height, index, colRow.
//   createSkin  ({ redraw }) → skin with drawTile and dispose; defaults to createTileSkin, whose
//               theme-change callback repaints the whole board.
//   token       the token reader's token(name); defaults to js/tokens.js.
//   scale       a BOARD_SCALES value, DEFAULT_BOARD_SCALE when not given.
//   frame       { top, right, bottom, left, minWidth } in CSS pixels: the room a page's frame
//               takes around the view (minWidth the frame's smallest width); none by default.
//               A function returning one is called again at every refit (resize, setScale).
//   minTile     the fit rule's smallest tile, MIN_TILE_SIZE when not given; a smaller one lets a
//               board that is shown and not played fit whole instead of scrolling.
//   onLayout    (layout) → after every refit, the new layout.
//
//   resize(width, height, pixelRatio)  the area in CSS pixels; repaints when anything changed.
//   setScale(scale)      refits at another board scale and repaints when the tile changes.
//   setGame(game)        the engine game whose cellState / cellNumber are drawn; repaints.
//   update(changed)      repaints only the cells listed (an action's `changed`).
//   repaint()            repaints the whole visible board.
//   cellAt(x, y)         the cell under a canvas position in CSS pixels, or -1.
//   cellRect(c)          { x, y, size } of a cell's tile in canvas CSS pixels.
//   scroll, scrollTo(x, y), scrollBy(dx, dy), pan(dx, dy), wheel(event), ensureVisible(c)
//   zoomRange            { min, max }: the touch zoom's tiles, MIN_TILE_SIZE to the fit-to-view tile
//                        (the whole board in the area inside the frame), whichever is larger.
//   boardPoint(x, y)     { u, v }: the board point under a canvas position, in tiles.
//   zoom(tile, x, y, point?)  a touch pinch: the tile (whole, clamped to zoomRange) replaces the fit
//                        rule's for the view's life — kept through a resize, clamped to the new
//                        range — with `point` (the one under x, y by default) under x, y and the
//                        scroll clamped; true when the tile or the scroll changed. A new view opens
//                        at the fit rule's tile.
//   setHidden(hidden)    a hidden board shows the background only (the game is paused).
//   setPressed(cells)    the cells a held button presses (js/classic2d/pointer-input.js); a closed
//                        one is drawn in the skin's pressed state. setGame clears them.
//   setCursor(c)         the keyboard and controller cursor (js/classic2d/cursor-input.js), drawn
//                        as a focus ring inside cell c's tile; -1 for none.
//   setMark(c)           the marked start cell a pre-generated board waits for, drawn as a ring
//                        inside cell c's tile in the cursor ring's style, in START_MARK, under the
//                        cursor ring; -1 for none.
//   pulseMark()          the mark pulses: its ring thickens and thins MARK_PULSE_STEPS times,
//                        MARK_PULSE_MS apart, on the view's timers — a first reveal off a forced
//                        start cell (js/classic2d/session.js START_HINT). markPulse is whether the
//                        ring is thick now.
//   showEffect(effect, t)  the end effect (js/classic2d/end-effect.js) at t ms: repaints the board
//                        with each tile as the effect shows it (a loss's pre-loss tiles before its
//                        wave arrives), the win pulse over the tiles and the confetti over the
//                        board's rectangle, clipped to the view; every redraw until the next call
//                        draws that moment. showEffect(null) repaints the board in its end state.
//                        The effect never touches the game: every tile is still read from it.
//   A won game's unflagged mines (its closed cells) are drawn as flags, the skin's static tile.
//   layout, pixelRatio, hidden, pressed, cursor, mark, markPulse, effect, scale, canvas, dispose()

import { MIN_TILE_SIZE, createTileSkin } from './tile-skin.js';
import { token as readerToken } from '../tokens.js';
import { CELL, PHASE } from '../engine/rules.js';
import {
  shownState, wonState, pulseAlpha, confettiAt, drawPulse, drawConfetti, PULSE_COLOR, CONFETTI_COLORS,
} from './end-effect.js';

/** The design token the area around the board is filled with. */
export const BOARD_BACKGROUND = '--color-board-frame';

/** The design token the cursor's focus ring is drawn in, distinct from the tile's rim and lit bevel it covers. */
export const CURSOR_RING = '--color-tile-cursor';

/** The design token the marked start cell's ring is drawn in: an existing token, apart from the cursor's. */
export const START_MARK = '--color-success';

/** The mark's pulse: how many times its ring changes, and how far apart. */
export const MARK_PULSE_STEPS = 6;
export const MARK_PULSE_MS = 120;

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
const LINE = 1;
const PAGE = 2;
const NO_FRAME = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0, minWidth: 0 });

/** The largest tile a board scale allows: TILE_CAP at 100 %, 1.25 × it at 125 %, none at Fit. */
export function tileCap(scale = DEFAULT_BOARD_SCALE) {
  if (scale === 'fit') return Infinity;
  if (scale === '125') return Math.round(TILE_CAP * 1.25);
  return TILE_CAP;
}

/**
 * The largest whole tile size at which cols × rows fits width × height, at most `max` and never
 * below `min`.
 */
export function fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max = Infinity) {
  const fit = Math.floor(Math.min(width / cols, height / rows));
  return Number.isFinite(fit) ? Math.max(min, Math.min(max, fit)) : min;
}

const frameOf = (frame) => ({ ...NO_FRAME, ...(frame ?? {}) });

/**
 * Where the board sits in an area (the canvas): tile size, board size, the view rectangle it shows
 * through — centred with its frame when the board fits, the area inside the frame when it scrolls —
 * the board's offsets (its top-left corner at scroll 0) and the scroll range.
 */
export function boardLayout({ cols, rows, width, height, min = MIN_TILE_SIZE, max = Infinity, frame }) {
  const f = frameOf(frame);
  const availWidth = Math.max(0, width - f.left - f.right);
  const availHeight = Math.max(0, height - f.top - f.bottom);
  const tile = fitTileSize(cols, rows, availWidth, availHeight, min, max);
  const boardWidth = cols * tile;
  const boardHeight = rows * tile;
  const maxScrollX = Math.max(0, boardWidth - availWidth);
  const maxScrollY = Math.max(0, boardHeight - availHeight);
  const viewWidth = Math.min(boardWidth, availWidth);
  const viewHeight = Math.min(boardHeight, availHeight);
  const viewX = maxScrollX ? f.left : f.left + Math.floor((availWidth - viewWidth) / 2);
  const viewY = maxScrollY ? f.top : Math.floor((height - viewHeight - f.top - f.bottom) / 2) + f.top;
  return Object.freeze({
    width,
    height,
    tile,
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
 * The frame's rectangle around a layout's view, in canvas CSS pixels: the view widened by the frame
 * on each side, at least frame.minWidth wide (centred on the view) and never wider than the area.
 */
export function panelRect(layout, frame) {
  const f = frameOf(frame);
  const natural = layout.viewWidth + f.left + f.right;
  const width = Math.min(layout.width, Math.max(natural, f.minWidth));
  const x = Math.max(0, Math.min(layout.width - width, layout.viewX - f.left - Math.floor((width - natural) / 2)));
  return { x, y: layout.viewY - f.top, width, height: layout.viewHeight + f.top + f.bottom };
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

/** The cell at canvas position x, y (CSS pixels) for a layout and scroll position, or -1. */
export function cellAtLayout(layout, scroll, cols, rows, x, y) {
  if (!(x >= layout.viewX && y >= layout.viewY && x < layout.viewX + layout.viewWidth && y < layout.viewY + layout.viewHeight)) return -1;
  const bx = x - layout.offsetX + scroll.x;
  const by = y - layout.offsetY + scroll.y;
  if (!(bx >= 0 && by >= 0 && bx < layout.boardWidth && by < layout.boardHeight)) return -1;
  const col = Math.floor(bx / layout.tile);
  const row = Math.floor(by / layout.tile);
  return col + cols * row;
}

export function createBoardView({
  canvas, grid, createSkin = createTileSkin, token = readerToken, scale: initialScale = DEFAULT_BOARD_SCALE, frame = null,
  minTile = MIN_TILE_SIZE, onLayout = () => {}, timers = globalThis,
} = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('createBoardView needs a canvas');
  if (!grid || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) throw new TypeError('createBoardView needs a square grid');
  const cols = grid.width;
  const rows = grid.height;
  const count = cols * rows;
  const ctx = canvas.getContext('2d');

  let scale = BOARD_SCALES.includes(initialScale) ? initialScale : DEFAULT_BOARD_SCALE;
  let zoomTile = null; // a touch zoom's tile, or null for the fit rule's
  const measure = typeof frame === 'function' ? frame : () => frame;
  let f = frameOf(measure());
  // The zoom range for an area: MIN_TILE_SIZE to the tile at which the whole board fits, either way round.
  const rangeOf = (width, height) => {
    const whole = Math.max(1, Math.floor(Math.min((width - f.left - f.right) / cols, (height - f.top - f.bottom) / rows)) || 1);
    return { min: Math.min(MIN_TILE_SIZE, whole), max: Math.max(MIN_TILE_SIZE, whole) };
  };
  const clampTile = (tile, range) => Math.max(range.min, Math.min(range.max, Math.round(tile)));
  const fit = (width, height) => {
    if (zoomTile === null) return boardLayout({ cols, rows, width, height, min: minTile, max: tileCap(scale), frame: f });
    zoomTile = clampTile(zoomTile, rangeOf(width, height));
    return boardLayout({ cols, rows, width, height, min: zoomTile, max: zoomTile, frame: f });
  };
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
  let pulse = null; // the pulse colour, read with each effect frame
  const scroll = { x: 0, y: 0 };

  const skin = createSkin({ redraw: () => repaint() });

  const tileX = (col) => layout.offsetX + col * layout.tile - scroll.x;
  const tileY = (row) => layout.offsetY + row * layout.tile - scroll.y;

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

  // Paints cell c's tile and the ring on it; returns false when it is out of view.
  function drawCell(c) {
    const col = c % cols;
    const row = (c - col) / cols;
    const x = tileX(col);
    const y = tileY(row);
    const t = layout.tile;
    if (x <= layout.viewX - t || y <= layout.viewY - t || x >= layout.viewX + layout.viewWidth || y >= layout.viewY + layout.viewHeight) return false;
    let state = game.cellState(c);
    if (effect) state = shownState(effect, c, state, effectT);
    else if (game.phase === PHASE.WON) state = wonState(state);
    skin.drawTile(ctx, x, y, t, state === CELL.CLOSED && pressed.has(c) ? PRESSED : state, game.cellNumber(c), ratio);
    if (effect) drawPulse(ctx, x, y, t, pulseAlpha(effect, c, effectT), pulse ?? (pulse = token(PULSE_COLOR)));
    const w = Math.max(2, Math.round(t / 12));
    const ring = (colour) => {
      ctx.strokeStyle = token(colour);
      ctx.lineWidth = w;
      ctx.strokeRect(x + w / 2, y + w / 2, t - w, t - w);
    };
    if (c === mark && c !== cursor) {
      ring(START_MARK);
      if (markPulse) {
        ctx.lineWidth = w * 2;
        ctx.strokeRect(x + w, y + w, t - 2 * w, t - 2 * w);
      }
    }
    if (c === cursor) ring(CURSOR_RING);
    return true;
  }

  function repaint() {
    if (!sized) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = token(BOARD_BACKGROUND);
    ctx.fillRect(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    marks = null;
    if (hidden || !game) return;
    const t = layout.tile;
    const c0 = Math.max(0, Math.floor(scroll.x / t));
    const r0 = Math.max(0, Math.floor(scroll.y / t));
    const c1 = Math.min(cols - 1, Math.floor((scroll.x + layout.viewWidth - 1) / t));
    const r1 = Math.min(rows - 1, Math.floor((scroll.y + layout.viewHeight - 1) / t));
    ctx.save();
    if (layout.scrolls) clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) drawCell(col + cols * row);
    }
    ctx.restore();
    if (effect) drawEffectLayer();
    marks = markRects();
    drawMarks();
  }

  // The end effect's confetti over the board's rectangle, clipped to the part in view.
  function drawEffectLayer() {
    const pieces = confettiAt(effect, effectT, { width: layout.boardWidth, height: layout.boardHeight, tile: layout.tile });
    if (!pieces.length) return;
    ctx.save();
    clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    drawConfetti(ctx, pieces, CONFETTI_COLORS.map((name) => token(name)), tileX(0), tileY(0));
    ctx.restore();
  }

  function update(changed) {
    if (!sized || hidden || !game) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.save();
    if (layout.scrolls) clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    for (let i = 0; i < changed.length; i++) {
      const c = changed[i];
      if (c >= 0 && c < count && drawCell(c) && marks) {
        const col = c % cols;
        drawMarks(tileX(col), tileY((c - col) / cols), layout.tile, layout.tile);
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
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    if (canvas.style) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
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
    if (deltaMode === LINE) { dx *= layout.tile; dy *= layout.tile; }
    else if (deltaMode === PAGE) { dx *= layout.viewWidth; dy *= layout.viewHeight; }
    scrollTo(scroll.x + dx, scroll.y + dy);
    return true;
  }

  // The board point under canvas position x, y, in tiles from the board's top-left corner.
  function boardPoint(x, y) {
    return { u: (x - layout.offsetX + scroll.x) / layout.tile, v: (y - layout.offsetY + scroll.y) / layout.tile };
  }

  // A touch zoom: the tile clamped to the zoom range, board point `point` (the one under x, y by
  // default) put under canvas position x, y, the scroll clamped; repaints, reports the layout and
  // returns true when the tile or the scroll changed.
  function zoom(tile, x, y, point = boardPoint(x, y)) {
    if (!Number.isFinite(tile)) return false;
    const before = { tile: layout.tile, x: scroll.x, y: scroll.y };
    zoomTile = clampTile(tile, rangeOf(layout.width, layout.height));
    layout = fit(layout.width, layout.height);
    scroll.x = Math.round(Math.min(layout.maxScrollX, Math.max(0, point.u * layout.tile - (x - layout.offsetX))));
    scroll.y = Math.round(Math.min(layout.maxScrollY, Math.max(0, point.v * layout.tile - (y - layout.offsetY))));
    if (layout.tile === before.tile && scroll.x === before.x && scroll.y === before.y) return false;
    repaint();
    onLayout(layout);
    return true;
  }

  function cellRect(c) {
    const col = c % cols;
    return { x: tileX(col), y: tileY((c - col) / cols), size: layout.tile };
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
    resize,
    setScale,
    setGame(next) {
      game = next ?? null;
      pressed = new Set();
      effect = null;
      repaint();
    },
    /** Shows `cells` pressed, redrawing only the cells that gain or lose the press. */
    setPressed(cells) {
      const next = new Set(cells);
      const touched = [...pressed].filter((c) => !next.has(c));
      for (const c of next) if (!pressed.has(c)) touched.push(c);
      pressed = next;
      update(touched);
    },
    /** Moves the focus ring to cell c (-1 hides it), redrawing the cells it leaves and enters. */
    setCursor(c) {
      const next = Number.isInteger(c) && c >= 0 && c < count ? c : -1;
      if (next === cursor) return;
      const touched = [cursor, next];
      cursor = next;
      update(touched);
    },
    /** Marks cell c as the start cell a pre-generated board waits for (-1 for none), redrawing the cells it leaves and enters. */
    setMark(c) {
      const next = Number.isInteger(c) && c >= 0 && c < count ? c : -1;
      if (next === mark) return;
      const touched = [mark, next];
      mark = next;
      update(touched);
    },
    /** The mark pulses: its ring thickens and thins MARK_PULSE_STEPS times. */
    pulseMark() {
      if (pulseTimer !== null) timers.clearTimeout(pulseTimer);
      let steps = MARK_PULSE_STEPS;
      const step = () => {
        markPulse = steps % 2 === 0;
        steps -= 1;
        if (mark >= 0) update([mark]);
        pulseTimer = steps > 0 ? timers.setTimeout(step, MARK_PULSE_MS) : null;
        if (steps <= 0) {
          markPulse = false;
          if (mark >= 0) update([mark]);
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
      pulse = null; // read again each frame: the theme may have changed
      repaint();
    },
    cellAt: (x, y) => cellAtLayout(layout, scroll, cols, rows, x, y),
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
      if (hidden !== was) repaint();
    },
    dispose() {
      if (pulseTimer !== null) timers.clearTimeout(pulseTimer);
      skin.dispose();
      game = null;
    },
  };
}

// Browser wiring: a canvas filling `container` (above whatever the container already holds, such as
// a frame drawn behind the board), sized on container resize and device pixel ratio change,
// scrolled by the wheel and panned by dragging with PAN_MODIFIER held; onUserScroll() follows each
// scroll the player made that way. Returns the view with destroy(), which removes the canvas and
// every listener.
export function mountBoardView({ container, grid, win = globalThis, onUserScroll = () => {}, ...options }) {
  const canvas = win.document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.position = 'relative';
  canvas.style.touchAction = 'none';
  container.append(canvas);
  const view = createBoardView({ canvas, grid, ...options });

  const fit = () => {
    const box = container.getBoundingClientRect();
    view.resize(box.width, box.height, win.devicePixelRatio || 1);
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
    },
  });
}
