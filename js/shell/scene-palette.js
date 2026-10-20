// The 3D scene's board art hand-off on the shell's side: the active theme's board module goes to the
// renderer's setBoard — its atlas, its sky, fog and clear colour, its selection outline and marked-cell
// tint — at start-up and on every theme change. It rides the board art hand-off (js/shell/board-art.js),
// which hands a module over only once its number font has loaded, so no atlas is drawn in a fallback
// font. The renderer never reads tokens, imports a theme or subscribes to theme changes itself.

import { BOARD_ART } from '../classic2d/tile-skin.js';

// The token reader's visible fallback colour, so an unreadable value is noticed instead of blending in.
const UNREADABLE = [255, 0, 255];

/** A token value (`#rgb`, `#rrggbb`, `rgb()` or `rgba()`) as [r, g, b] channels 0–255; alpha is dropped. */
export function parseRgb(value) {
  const v = String(value).trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return [...UNREADABLE];
}

/**
 * Hand the renderer the board module `art` holds now, if any, and each one handed over after it;
 * `onApplied` runs after each hand-off (the shell requests a redraw there). Returns the unsubscribe.
 */
export function bindScenePalette({ art = BOARD_ART, renderer, onApplied = () => {} }) {
  const apply = (current) => {
    if (!current?.board) return;
    renderer.setBoard(current.board);
    onApplied();
  };
  apply(art.current());
  return art.onChange(apply);
}
