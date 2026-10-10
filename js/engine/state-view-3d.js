// The 3D state view: the read surface the 3D renderer, picking and HUD consume, served from a
// game of the shared rules engine (js/engine/rules.js) on the box graph (js/engine/box-grid.js)
// (no DOM).
//
// It mirrors what those modules read from js/logic.js's Game, under the same names, so they
// change only where they obtain the game:
//   X, Y, Z, n, idx(i, j, k), coords(c)  — the box and its index layout;
//   number    Int8Array, -1 on a mine, else the neighbouring mine count (all 0 until the
//             mines are placed);
//   pressed   revealed cells; flagged — flagged cells; unlinked — hidden (auto-hidden) cells.
//             Each is the engine's own Uint8Array while the game is not lost;
//   state     'playing' (awaiting the first click included) | 'won' | 'lost'; phase — the
//             engine's PHASE value;
//   explodedIdx (-1 until a loss), minesLeft (may go negative);
//   version   a change counter, moved by every action that changed a cell;
//   dirty     a copy of the cells changed since the last consumeDirty(); consumeDirty() returns
//             that copy and clears the set. One consumer drains it: the renderer.
//
// A loss reads as the 3D engine presented it: every cell pressed, no cell flagged or unlinked,
// and every cell dirty. The engine's own arrays are left as the loss left them.
//
// The view learns of changes through apply(result): whoever drives the game passes it the
// result of every action — view.apply(game.reveal(c)) — and gets that result back. Arrays are
// read-only for callers.

import { PHASE } from './rules.js';

export function createStateView3D(game, box) {
  if (!game || !box || game.graph !== box.graph) {
    throw new RangeError('the 3D state view needs a game played on the given box graph');
  }
  const { X, Y, Z } = box;
  const n = box.graph.count;
  const st = game.state;

  const number = new Int8Array(n);
  let numbered = false;
  const dirtyList = new Int32Array(n);
  const dirtyMark = new Uint8Array(n);
  let dirtyLen = 0;
  let version = 0;
  let lostPressed = null, lostClear = null; // the loss presentation, built at the loss

  const lost = () => game.phase === PHASE.LOST;

  // Fills `number` once the mines are placed.
  function numberNow() {
    if (!numbered && game.phase !== PHASE.AWAITING_FIRST_CLICK) {
      for (let c = 0; c < n; c++) number[c] = st.mine[c] ? -1 : st.number[c];
      numbered = true;
    }
    return number;
  }

  function mark(c) {
    if (!dirtyMark[c]) { dirtyMark[c] = 1; dirtyList[dirtyLen++] = c; }
  }

  const view = {
    X,
    Y,
    Z,
    n,
    idx: (i, j, k) => box.index(i, j, k),
    coords: (c) => box.coords(c),

    get number() { return numberNow(); },
    get pressed() { return lost() ? lostPressed : st.revealed; },
    get flagged() { return lost() ? lostClear : st.flagged; },
    get unlinked() { return lost() ? lostClear : st.hidden; },

    get phase() { return game.phase; },
    get state() {
      const p = game.phase;
      return p === PHASE.WON ? 'won' : p === PHASE.LOST ? 'lost' : 'playing';
    },
    get explodedIdx() { return game.explodedCell; },
    get minesLeft() { return game.minesLeft; },
    get version() { return version; },

    get dirty() { return dirtyList.slice(0, dirtyLen); },
    consumeDirty() {
      const out = dirtyList.slice(0, dirtyLen);
      for (let t = 0; t < dirtyLen; t++) dirtyMark[dirtyList[t]] = 0;
      dirtyLen = 0;
      return out;
    },

    // Folds an action's result into the change set; returns the result.
    apply(result) {
      const changed = result.changed;
      if (changed.length === 0) return result;
      numberNow();
      if (lost() && !lostPressed) {
        lostPressed = new Uint8Array(n).fill(1);
        lostClear = new Uint8Array(n);
        for (let c = 0; c < n; c++) mark(c);
      } else {
        for (let t = 0; t < changed.length; t++) mark(changed[t]);
      }
      version++;
      return result;
    },
  };

  return Object.freeze(view);
}
