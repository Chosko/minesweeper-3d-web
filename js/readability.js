// 3D readability aids: pure, DOM-free functions over the 3D state view (js/engine/state-view-3d.js),
// read the way js/picking.js reads it.

/**
 * The aimed-cell readout: the revealed number at `cell` and its neighbourhood, or null when there is
 * none to read (no cell, a closed cell, a flag, a zero, a hidden cell, or a game no longer playing).
 * `closed` counts neighbours neither revealed nor flagged, `flags` the flagged ones; revealed and
 * hidden (unlinked) neighbours count as neither. Only neighbours inside the box are walked.
 * @returns {{ number: number, closed: number, flags: number } | null}
 */
export function aimReadout(view, cell) {
  if (cell < 0 || view.state !== 'playing') return null;
  if (!view.pressed[cell] || view.flagged[cell] || view.unlinked[cell]) return null;
  const number = view.number[cell];
  if (!(number > 0)) return null;
  const { X, Y, Z } = view;
  const [ci, cj, ck] = view.coords(cell);
  let closed = 0, flags = 0;
  for (let k = Math.max(0, ck - 1); k <= Math.min(Z - 1, ck + 1); k++) {
    for (let j = Math.max(0, cj - 1); j <= Math.min(Y - 1, cj + 1); j++) {
      for (let i = Math.max(0, ci - 1); i <= Math.min(X - 1, ci + 1); i++) {
        const c = view.idx(i, j, k);
        if (c === cell) continue;
        if (view.flagged[c]) flags++;
        else if (!view.pressed[c] && !view.unlinked[c]) closed++;
      }
    }
  }
  return { number, closed, flags };
}

/**
 * The readout's text, "cubes 6 - flags 1": every unrevealed neighbour (closed and flagged), then the
 * flags only when there are any. The readout draws a cube icon and a flag icon in place of the words;
 * '' for no readout.
 */
export function readoutText(r) {
  if (!r) return '';
  const cubes = `cubes ${r.closed + r.flags}`;
  return r.flags > 0 ? `${cubes} - flags ${r.flags}` : cubes;
}

// ---- Space: numbers dimmed by their depth, so of two numbers in one screen column the nearer reads

/**
 * Alpha under Space at the box's nearest face (below 1: the crosshair passes through them); the front
 * layer's cube centres sit half a cell in, so its numbers draw at about 0.61.
 */
export const SPACE_NEAR_ALPHA = 0.7;
/** The alpha far numbers fall toward under Space, and never below. */
export const SPACE_FLOOR_ALPHA = 0.1;
/** How many lattice layers the alpha takes to fall about two thirds of the way to the floor. */
export const SPACE_FALLOFF = 3;

/**
 * A number's alpha under Space at lattice depth `d` behind the box's nearest face (0 at the face):
 * SPACE_NEAR_ALPHA there, falling toward SPACE_FLOOR_ALPHA, never increasing.
 */
export function spaceAlpha(d) {
  return SPACE_FLOOR_ALPHA + (SPACE_NEAR_ALPHA - SPACE_FLOOR_ALPHA) * Math.exp(-Math.max(0, d) / SPACE_FALLOFF);
}

/**
 * How far the camera at `cam` (lattice units, the box centred on the origin, a cell centre at its index
 * minus (side - 1) / 2) stands from the X × Y × Z box's nearest face: 0 inside it.
 */
export function boxDepth(cam, { X, Y, Z }) {
  const out = [X, Y, Z].map((n, a) => Math.max(0, Math.abs(cam[a]) - n / 2));
  return Math.hypot(out[0], out[1], out[2]);
}
