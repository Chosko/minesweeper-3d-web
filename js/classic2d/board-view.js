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
// for the cursor). Tiles sit one pitch apart — the tile plus the gap the skin's board module sets,
// a fraction of the tile rounded to whole pixels, none without one — inside the view rectangle
// (layout.viewX, viewY, viewWidth, viewHeight), which is filled with the board module's ground (the
// board background token while the skin has no module); the fit rule counts the gaps, and a cell's
// slot is its tile and the gap after it, so hit-testing maps a pointer in a gap to a cell. The
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
// createBoardView({ canvas, grid, createSkin?, token?, scale?, frame?, minTile?, onLayout?, layer?,
//                   frames?, now?, onMotion? }) → view
//   canvas      a <canvas> or anything with width, height, style and getContext('2d').
//   grid        the square grid (js/engine/square-grid.js): width, height, index, colRow.
//   createSkin  ({ redraw }) → skin with drawTile, dispose and optionally board() (the board module
//               it draws from: its gap, corner radius, ground and cursor ring); defaults to
//               createTileSkin, whose hand-off callback lays the board out again and repaints it.
//   token       the token reader's token(name); defaults to js/tokens.js.
//   scale       a BOARD_SCALES value, DEFAULT_BOARD_SCALE when not given.
//   frame       { top, right, bottom, left, minWidth } in CSS pixels: the room a page's frame
//               takes around the view (minWidth the frame's smallest width); none by default.
//               A function returning one is called again at every refit (resize, setScale).
//   minTile     the fit rule's smallest tile, MIN_TILE_SIZE when not given; a smaller one lets a
//               board that is shown and not played fit whole instead of scrolling.
//   onLayout    (layout) → after every refit, the new layout.
//   layer       the motion layer's canvas, over the board canvas at the same size; none, no motion.
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
//   cellRect(c)          { x, y, size } of a cell's tile in canvas CSS pixels.
//   scroll, scrollTo(x, y), scrollBy(dx, dy), pan(dx, dy), wheel(event), ensureVisible(c)
//   layout               boardLayout's: tile, gap and pitch (tile + gap) among the rest.
//   zoomRange            { min, max }: the touch zoom's tiles, MIN_TILE_SIZE to the fit-to-view tile
//                        (the whole board in the area inside the frame), whichever is larger.
//   boardPoint(x, y)     { u, v }: the board point under a canvas position, in pitches (cell c's
//                        slot is u from its column to the next).
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
//                        as a focus ring inside cell c's tile — the board module's ring, its colour,
//                        width and hairline, its corners following the tile's; -1 for none.
//   setMark(c)           the marked start cell a pre-generated board waits for, drawn as a ring
//                        inside cell c's tile in the cursor ring's style, in START_MARK, under the
//                        cursor ring; -1 for none.
//   pulseMark()          the mark pulses: its ring thickens and thins MARK_PULSE_STEPS times,
//                        MARK_PULSE_MS apart, on the view's timers — a first reveal off a forced
//                        start cell (js/classic2d/session.js START_HINT). markPulse is whether the
//                        ring is thick now.
//   showEffect(effect, t)  the end effect (js/classic2d/end-effect.js) at t ms: repaints the board
//                        with each tile as the effect shows it (a loss's pre-loss tiles before its
//                        wave arrives), each tile under its wave and the confetti over the
//                        board's rectangle, clipped to the view, all from the skin's board module
//                        (none without one); every redraw until the next call
//                        draws that moment. showEffect(null) repaints the board in its end state.
//                        The effect never touches the game: every tile is still read from it.
//   A won game's unflagged mines (its closed cells) are drawn as flags, the skin's static tile.
//   layout, pixelRatio, hidden, pressed, cursor, mark, markPulse, effect, scale, canvas, dispose()

import { MIN_TILE_SIZE, createTileSkin } from './tile-skin.js';
import { createMotionLayer, changeEvent } from './motion-layer.js';
import { token as readerToken } from '../tokens.js';
import { roundRect } from '../tile-art.js';
import { CELL, PHASE } from '../engine/rules.js';
import {
  shownState, wonState, waveAt, confettiAt, drawWave, drawConfetti,
} from './end-effect.js';

/** The design token the board's ground is filled with while the skin has no board module. */
export const BOARD_BACKGROUND = '--color-board-frame';

/** The design token the cursor's focus ring is drawn in while the skin has no board module. */
export const CURSOR_RING = '--color-tile-cursor';

/** The design token the marked start cell's ring is drawn in: an existing token, apart from the cursor's. */
export const START_MARK = '--color-success';

/** The mark's pulse: how many times its ring changes, and how far apart. */
export const MARK_PULSE_STEPS = 6;
export const MARK_PULSE_MS = 120;

/** The class of the motion layer's canvas mountBoardView puts over the board's. */
export const MOTION_LAYER_CLASS = 'board-motion';

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

/** The gap between tiles of `tile` px for a gap fraction: whole pixels, none for no fraction. */
export function gapPx(tile, gap = 0) {
  return gap > 0 ? Math.round(tile * gap) : 0;
}

/** How far n tiles of `tile` px and the gaps between them reach. */
const spanOf = (n, tile, gap) => n * tile + (n - 1) * gapPx(tile, gap);

/**
 * The largest whole tile size at which cols × rows, with the gaps between tiles (`gap`, a fraction
 * of the tile), fits width × height, at most `max` and never below `min`.
 */
export function fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max = Infinity, gap = 0) {
  let fit = Math.floor(Math.min(width / cols, height / rows));
  if (!Number.isFinite(fit)) return min;
  while (fit > min && (spanOf(cols, fit, gap) > width || spanOf(rows, fit, gap) > height)) fit--;
  return Math.max(min, Math.min(max, fit));
}

const frameOf = (frame) => ({ ...NO_FRAME, ...(frame ?? {}) });

/**
 * Where the board sits in an area (the canvas): tile size, the gap between tiles (`gap` a fraction
 * of the tile) and the pitch, board size, the view rectangle it shows through — centred with its
 * frame when the board fits, the area inside the frame when it scrolls — the board's offsets (its
 * top-left corner at scroll 0) and the scroll range.
 */
export function boardLayout({ cols, rows, width, height, min = MIN_TILE_SIZE, max = Infinity, frame, gap = 0 }) {
  const f = frameOf(frame);
  const availWidth = Math.max(0, width - f.left - f.right);
  const availHeight = Math.max(0, height - f.top - f.bottom);
  const tile = fitTileSize(cols, rows, availWidth, availHeight, min, max, gap);
  const space = gapPx(tile, gap);
  const boardWidth = spanOf(cols, tile, gap);
  const boardHeight = spanOf(rows, tile, gap);
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
    gap: space,
    pitch: tile + space,
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

/**
 * The cell at canvas position x, y (CSS pixels) for a layout and scroll position, or -1: the cell
 * whose slot — its tile and the gap after it — holds the position.
 */
export function cellAtLayout(layout, scroll, cols, rows, x, y) {
  if (!(x >= layout.viewX && y >= layout.viewY && x < layout.viewX + layout.viewWidth && y < layout.viewY + layout.viewHeight)) return -1;
  const bx = x - layout.offsetX + scroll.x;
  const by = y - layout.offsetY + scroll.y;
  if (!(bx >= 0 && by >= 0 && bx < layout.boardWidth && by < layout.boardHeight)) return -1;
  const pitch = layout.pitch ?? layout.tile;
  const col = Math.min(cols - 1, Math.floor(bx / pitch));
  const row = Math.min(rows - 1, Math.floor(by / pitch));
  return col + cols * row;
}

export function createBoardView({
  canvas, grid, createSkin = createTileSkin, token = readerToken, scale: initialScale = DEFAULT_BOARD_SCALE, frame = null,
  minTile = MIN_TILE_SIZE, onLayout = () => {}, timers = globalThis, layer = null, onMotion = () => {},
  frames = { request: (fn) => timers.requestAnimationFrame(fn), cancel: (id) => timers.cancelAnimationFrame(id) }, now,
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
  // The board module the skin draws from (null for a skin without one), and what the view reads of
  // it: the gap and corner radius as fractions of the tile, the ground and the cursor ring.
  const boardOf = () => skin?.board?.() ?? null;
  const gapOf = () => boardOf()?.style2d?.params?.gap ?? 0;
  // The zoom range for an area: MIN_TILE_SIZE to the tile at which the whole board fits, either way round.
  const rangeOf = (width, height) => {
    const whole = Math.max(1, fitTileSize(cols, rows, width - f.left - f.right, height - f.top - f.bottom, 1, Infinity, gapOf()) || 1);
    return { min: Math.min(MIN_TILE_SIZE, whole), max: Math.max(MIN_TILE_SIZE, whole) };
  };
  const clampTile = (tile, range) => Math.max(range.min, Math.min(range.max, Math.round(tile)));
  const fit = (width, height) => {
    const gap = gapOf();
    if (zoomTile === null) return boardLayout({ cols, rows, width, height, min: minTile, max: tileCap(scale), frame: f, gap });
    zoomTile = clampTile(zoomTile, rangeOf(width, height));
    return boardLayout({ cols, rows, width, height, min: zoomTile, max: zoomTile, frame: f, gap });
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

  // Whether cell c's tile is at least partly in view.
  function inView(c) {
    const col = c % cols;
    const x = tileX(col);
    const y = tileY((c - col) / cols);
    const t = layout.tile;
    return !(x <= layout.viewX - t || y <= layout.viewY - t || x >= layout.viewX + layout.viewWidth || y >= layout.viewY + layout.viewHeight);
  }

  const motion = layer ? createMotionLayer({
    canvas: layer,
    frames,
    ...(now ? { now } : {}),
    place: (c) => (inView(c) ? cellRect(c) : null),
    paint: (lctx, c, face, x, y, size, depth) => skin.drawTile(lctx, x, y, size, face, game?.cellNumber(c) ?? 0, ratio, depth),
    clip: () => (layout.scrolls ? { x: layout.viewX, y: layout.viewY, width: layout.viewWidth, height: layout.viewHeight } : null),
    onSettle: (cells) => draw(cells),
  }) : null;

  // Starts cell c's `event` from face `before` to `after`, as the board module describes it.
  function animate(c, event, before, after) {
    if (!motion || !inView(c)) return;
    if (motion.start(c, event, before, after, boardOf()?.motion?.[event] ?? null)) onMotion({ cell: c, event, before, after });
  }

  const tileX = (col) => layout.offsetX + col * layout.pitch - scroll.x;
  const tileY = (row) => layout.offsetY + row * layout.pitch - scroll.y;

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

  // A ring inside the tile at x, y of `t` px, `w` wide, in `colour`: the board module's ring with
  // its hairline inside it, its corners following the tile's — concentric with the ring the module
  // describes (radius tile × radius.tile + radius.px, radius.px outside the tile), drawn inside the
  // tile so a cell's redraw moves or hides it — or, without a module, a square ring a twelfth of the
  // tile wide.
  function ring(x, y, t, colour, { wide = 1, hairline = true } = {}) {
    const look = boardOf()?.cursor;
    if (!look) {
      const w = Math.max(2, Math.round(t / 12)) * wide;
      ctx.strokeStyle = colour;
      ctx.lineWidth = w;
      ctx.strokeRect(x + w / 2, y + w / 2, t - w, t - w);
      return;
    }
    const w = look.width * wide;
    const corner = t * look.radius.tile;
    const stroke = (inset, width, style) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      roundRect(ctx, x + inset, y + inset, t - 2 * inset, t - 2 * inset, Math.max(0, corner - inset));
      ctx.stroke();
    };
    stroke(w / 2, w, colour);
    if (hairline) stroke(w + 0.5, 1, look.inner);
  }

  // Paints cell c's tile and the ring on it; returns false when it is out of view.
  function drawCell(c) {
    const col = c % cols;
    const row = (c - col) / cols;
    const x = tileX(col);
    const y = tileY(row);
    const t = layout.tile;
    if (!inView(c)) return false;
    const now = game.cellState(c);
    let state = now;
    if (effect) state = shownState(effect, c, state, effectT);
    else if (game.phase === PHASE.WON) state = wonState(state);
    const moving = motion?.has(c);
    // A rounded tile leaves its corners to the ground: lay it again under the tile it replaces. An
    // animating cell's slot is the ground alone, the layer drawing the cell.
    if (moving || boardOf()?.style2d?.params?.radius > 0) {
      ctx.fillStyle = ground();
      ctx.fillRect(x, y, t, t);
    }
    if (!moving) {
      const paint = () => skin.drawTile(ctx, x, y, t, state === CELL.CLOSED && pressed.has(c) ? PRESSED : state, game.cellNumber(c), ratio);
      if (effect) drawWave(ctx, x, y, t, waveAt(effect, c, now, effectT, boardOf()?.end2d), boardOf(), paint);
      else paint();
    }
    if (c === mark && c !== cursor) {
      ring(x, y, t, token(START_MARK), { hairline: false });
      if (markPulse) ring(x, y, t, token(START_MARK), { wide: 2, hairline: false });
    }
    if (c === cursor) ring(x, y, t, boardOf()?.cursor?.color ?? token(CURSOR_RING));
    return true;
  }

  function repaint() {
    if (!sized) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = ground();
    ctx.fillRect(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    marks = null;
    if (hidden || !game) return;
    const p = layout.pitch;
    const c0 = Math.max(0, Math.floor(scroll.x / p));
    const r0 = Math.max(0, Math.floor(scroll.y / p));
    const c1 = Math.min(cols - 1, Math.floor((scroll.x + layout.viewWidth - 1) / p));
    const r1 = Math.min(rows - 1, Math.floor((scroll.y + layout.viewHeight - 1) / p));
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
    const colours = boardOf()?.palette?.confetti;
    const pieces = confettiAt(effect, effectT, { width: layout.boardWidth, height: layout.boardHeight, tile: layout.tile });
    if (!pieces.length || !colours?.length) return;
    ctx.save();
    clipTo(layout.viewX, layout.viewY, layout.viewWidth, layout.viewHeight);
    drawConfetti(ctx, pieces, colours, tileX(0), tileY(0));
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
    motion?.resize(w, h, ratio);
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
    if (deltaMode === LINE) { dx *= layout.pitch; dy *= layout.pitch; }
    else if (deltaMode === PAGE) { dx *= layout.viewWidth; dy *= layout.viewHeight; }
    scrollTo(scroll.x + dx, scroll.y + dy);
    return true;
  }

  // The board point under canvas position x, y, in pitches from the board's top-left corner.
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
    /** Moves the focus ring to cell c (-1 hides it), redrawing the cells it leaves and enters. */
    setCursor(c) {
      const next = Number.isInteger(c) && c >= 0 && c < count ? c : -1;
      if (next === cursor) return;
      const touched = [cursor, next];
      cursor = next;
      draw(touched);
    },
    /** Marks cell c as the start cell a pre-generated board waits for (-1 for none), redrawing the cells it leaves and enters. */
    setMark(c) {
      const next = Number.isInteger(c) && c >= 0 && c < count ? c : -1;
      if (next === mark) return;
      const touched = [mark, next];
      mark = next;
      draw(touched);
    },
    /** The mark pulses: its ring thickens and thins MARK_PULSE_STEPS times. */
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
// a frame drawn behind the board) with the motion layer's canvas right after it, over it at the same
// place and size and taking no input, sized on container resize and device pixel ratio change,
// scrolled by the wheel and panned by dragging with PAN_MODIFIER held; onUserScroll() follows each
// scroll the player made that way. Returns the view with destroy(), which removes the canvas and
// every listener.
export function mountBoardView({ container, grid, win = globalThis, onUserScroll = () => {}, ...options }) {
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
  const frames = { request: (fn) => win.requestAnimationFrame(fn), cancel: (id) => win.cancelAnimationFrame(id) };
  const view = createBoardView({ canvas, grid, layer, frames, ...options });

  const fit = () => {
    const box = container.getBoundingClientRect();
    view.resize(box.width, box.height, win.devicePixelRatio || 1);
    layer.style.left = `${canvas.offsetLeft}px`;
    layer.style.top = `${canvas.offsetTop}px`;
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
      layer.remove();
    },
  });
}
