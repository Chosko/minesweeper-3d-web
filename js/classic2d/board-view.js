// Classic 2D board view: the Canvas 2D board fitted to the area it is given, hit-testing,
// scrolling and per-cell redraw through the tile skin (js/classic2d/tile-skin.js). The skin owns
// how a tile looks; this module owns where tiles go. DOM-free at import: createBoardView takes its
// canvas and is driven by calls; mountBoardView is the browser wiring around it.
//
// Fit rule: the tile is the largest whole size at which the board fits the area, never below
// MIN_TILE_SIZE. A board that fits is centred; one that does not keeps the minimum tile, starts at
// its top-left corner and scrolls (wheel, drag with the pan modifier, ensureVisible for the cursor).
// Tiles sit edge to edge; the area around the board is the board background token.
//
// createBoardView({ canvas, grid, createSkin?, token? }) → view
//   canvas      a <canvas> or anything with width, height, style and getContext('2d').
//   grid        the square grid (js/engine/square-grid.js): width, height, index, colRow.
//   createSkin  ({ redraw }) → skin with drawTile and dispose; defaults to createTileSkin, whose
//               theme-change callback repaints the whole board.
//   token       the token reader's token(name); defaults to js/tokens.js.
//
//   resize(width, height, pixelRatio)  the area in CSS pixels; repaints when anything changed.
//   setGame(game)        the engine game whose cellState / cellNumber are drawn; repaints.
//   update(changed)      repaints only the cells listed (an action's `changed`).
//   repaint()            repaints the whole visible board.
//   cellAt(x, y)         the cell under a canvas position in CSS pixels, or -1.
//   cellRect(c)          { x, y, size } of a cell's tile in canvas CSS pixels.
//   scroll, scrollTo(x, y), scrollBy(dx, dy), pan(dx, dy), wheel(event), ensureVisible(c)
//   setHidden(hidden)    a hidden board shows the background only (the game is paused).
//   setPressed(cells)    the cells a held button presses (js/classic2d/pointer-input.js); a closed
//                        one is drawn in the skin's pressed state. setGame clears them.
//   layout, pixelRatio, hidden, pressed, canvas, dispose()

import { MIN_TILE_SIZE, createTileSkin } from './tile-skin.js';
import { token as readerToken } from '../tokens.js';
import { CELL } from '../engine/rules.js';

/** The design token the area around the board is filled with. */
export const BOARD_BACKGROUND = '--color-board-frame';

/** The key a pointer drag must hold to pan the board instead of playing it. */
export const PAN_MODIFIER = 'shiftKey';

const PRESSED = 'pressed';
const LINE = 1;
const PAGE = 2;

/** The largest whole tile size at which cols × rows fits width × height, never below `min`. */
export function fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE) {
  const fit = Math.floor(Math.min(width / cols, height / rows));
  return Number.isFinite(fit) ? Math.max(min, fit) : min;
}

/** Where the board sits in an area: tile size, board size, centring offsets and scroll range. */
export function boardLayout({ cols, rows, width, height, min = MIN_TILE_SIZE }) {
  const tile = fitTileSize(cols, rows, width, height, min);
  const boardWidth = cols * tile;
  const boardHeight = rows * tile;
  const maxScrollX = Math.max(0, boardWidth - width);
  const maxScrollY = Math.max(0, boardHeight - height);
  return Object.freeze({
    width,
    height,
    tile,
    boardWidth,
    boardHeight,
    offsetX: maxScrollX ? 0 : Math.floor((width - boardWidth) / 2),
    offsetY: maxScrollY ? 0 : Math.floor((height - boardHeight) / 2),
    maxScrollX,
    maxScrollY,
    scrolls: maxScrollX > 0 || maxScrollY > 0,
  });
}

/** The cell at canvas position x, y (CSS pixels) for a layout and scroll position, or -1. */
export function cellAtLayout(layout, scroll, cols, rows, x, y) {
  const bx = x - layout.offsetX + scroll.x;
  const by = y - layout.offsetY + scroll.y;
  if (!(bx >= 0 && by >= 0 && bx < layout.boardWidth && by < layout.boardHeight)) return -1;
  const col = Math.floor(bx / layout.tile);
  const row = Math.floor(by / layout.tile);
  return col + cols * row;
}

export function createBoardView({ canvas, grid, createSkin = createTileSkin, token = readerToken } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('createBoardView needs a canvas');
  if (!grid || !Number.isInteger(grid.width) || !Number.isInteger(grid.height)) throw new TypeError('createBoardView needs a square grid');
  const cols = grid.width;
  const rows = grid.height;
  const count = cols * rows;
  const ctx = canvas.getContext('2d');

  let layout = boardLayout({ cols, rows, width: 0, height: 0 });
  let ratio = 1;
  let sized = false;
  let game = null;
  let hidden = false;
  let pressed = new Set();
  const scroll = { x: 0, y: 0 };

  const skin = createSkin({ redraw: () => repaint() });

  const tileX = (col) => layout.offsetX + col * layout.tile - scroll.x;
  const tileY = (row) => layout.offsetY + row * layout.tile - scroll.y;

  function drawCell(c) {
    const col = c % cols;
    const row = (c - col) / cols;
    const x = tileX(col);
    const y = tileY(row);
    const t = layout.tile;
    if (x <= -t || y <= -t || x >= layout.width || y >= layout.height) return;
    const state = game.cellState(c);
    skin.drawTile(ctx, x, y, t, state === CELL.CLOSED && pressed.has(c) ? PRESSED : state, game.cellNumber(c), ratio);
  }

  function repaint() {
    if (!sized) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = token(BOARD_BACKGROUND);
    ctx.fillRect(0, 0, layout.width, layout.height);
    if (hidden || !game) return;
    const t = layout.tile;
    const c0 = Math.max(0, Math.floor((scroll.x - layout.offsetX) / t));
    const r0 = Math.max(0, Math.floor((scroll.y - layout.offsetY) / t));
    const c1 = Math.min(cols - 1, Math.floor((scroll.x - layout.offsetX + layout.width - 1) / t));
    const r1 = Math.min(rows - 1, Math.floor((scroll.y - layout.offsetY + layout.height - 1) / t));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) drawCell(col + cols * row);
    }
  }

  function update(changed) {
    if (!sized || hidden || !game) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    for (let i = 0; i < changed.length; i++) {
      const c = changed[i];
      if (c >= 0 && c < count) drawCell(c);
    }
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

  function resize(width, height, pixelRatio = 1) {
    const w = Math.max(0, Math.round(width));
    const h = Math.max(0, Math.round(height));
    if (sized && w === layout.width && h === layout.height && pixelRatio === ratio) return;
    sized = true;
    ratio = pixelRatio;
    layout = boardLayout({ cols, rows, width: w, height: h });
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    if (canvas.style) {
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    scroll.x = Math.min(layout.maxScrollX, scroll.x);
    scroll.y = Math.min(layout.maxScrollY, scroll.y);
    repaint();
  }

  // A wheel event's deltas in CSS pixels: a line is a tile, a page is the view; shift with a
  // vertical-only wheel scrolls horizontally. Returns true when the board scrolled or could.
  function wheel({ deltaX = 0, deltaY = 0, deltaMode = 0, shiftKey = false } = {}) {
    if (!layout.scrolls) return false;
    let dx = deltaX;
    let dy = deltaY;
    if (shiftKey && dx === 0) { dx = dy; dy = 0; }
    if (deltaMode === LINE) { dx *= layout.tile; dy *= layout.tile; }
    else if (deltaMode === PAGE) { dx *= layout.width; dy *= layout.height; }
    scrollTo(scroll.x + dx, scroll.y + dy);
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
    let sx = scroll.x;
    let sy = scroll.y;
    if (x < 0) sx += x;
    else if (x + size > layout.width) sx += x + size - layout.width;
    if (y < 0) sy += y;
    else if (y + size > layout.height) sy += y + size - layout.height;
    return scrollTo(sx, sy);
  }

  return {
    get canvas() { return canvas; },
    get layout() { return layout; },
    get pixelRatio() { return ratio; },
    get hidden() { return hidden; },
    get pressed() { return [...pressed]; },
    get scroll() { return { x: scroll.x, y: scroll.y }; },
    resize,
    setGame(next) {
      game = next ?? null;
      pressed = new Set();
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
    update,
    repaint,
    cellAt: (x, y) => cellAtLayout(layout, scroll, cols, rows, x, y),
    cellRect,
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
      skin.dispose();
      game = null;
    },
  };
}

// Browser wiring: a canvas filling `container`, sized on container resize and device pixel ratio
// change, scrolled by the wheel and panned by dragging with PAN_MODIFIER held. Returns the view
// with destroy(), which removes the canvas and every listener.
export function mountBoardView({ container, grid, win = globalThis, ...options }) {
  const canvas = win.document.createElement('canvas');
  canvas.style.display = 'block';
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
    if (view.wheel(event)) event.preventDefault();
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
    view.scrollTo(drag.scroll.x - (event.clientX - drag.x), drag.scroll.y - (event.clientY - drag.y));
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
