// Learn 3D: the guided board and its prompt sequence. DOM-free.
//
// LEARN_BOARD — the one guided board, a frozen constant: First box 1's size and mine count
//   (4 × 4 × 3 · 4, js/mode3d/board-choice.js), the seed and generator version it was generated
//   with, its start cell (the box's marked start cell, js/generation/start-cell.js: the centre cell
//   floor(X / 2), floor(Y / 2), floor(Z / 2)), its mine positions, the lesson number (`lessonNumber`,
//   L) and the lesson mine (`lessonMine`, M), with the revealed 1 that proves M a mine
//   (`proofNumber`, P). Found by dev/find-learn-3d.mjs, which takes the first seed from 1 upwards
//   whose no-guess board, after the first reveal on the start cell, meets lessonCells(): First box 1's
//   count 4, seed 75, generator version 1, mines 1, 2, 3, 40 (cells i + 4 × (j + 4 × k)), start cell
//   26 (2, 2, 1), P 36 (0, 1, 2), L 25 (1, 2, 1), M 40 (0, 2, 2). The mine positions are
//   committed, so a later GENERATOR_VERSION changes no lesson; the seed and version stay recorded.
//
// lessonCells(view, startCell) → { proofNumber, lessonNumber, lessonMine } or null: the board
//   conditions on a 3D state view after its first reveal — the reveal did not win; auto-hide hid at
//   least one cube; a revealed 1, P, has exactly one closed neighbour, M (so M must be a mine); a
//   revealed 1 other than P, L, has M and at least one other closed cube among its neighbours (all
//   of them safe, since L counts one mine), so a chord on L once M is flagged opens cubes. Among
//   the candidates, L is the one nearest the start cell (then the lowest L, M and P index).
//
// learnChoice() → the start the 3D mode plays the guided board from: { X, Y, Z, mines,
//   minePositions, noGuess: false, learn: true, forced: { startCell, seed, learn: true } } — a fixed
//   board (the session's minePositions path, no generation request) with the forced, marked start
//   cell of a daily or a challenge (js/mode3d/session.js `forced`).
//
// LEARN_PROMPTS — the prompt line's names in order: 'start' until the first reveal, then 'shift',
//   'ctrl', 'flag', 'chord', and 'rest' once all four are done. LEARN_HINTS maps each to its text in
//   the bindings source (js/settings/bindings.js HINT_TEXT), so a controller player reads the
//   controller's inputs.
// createLearnPrompts({ lessonNumber, lessonMine }) → the prompt sequence of one guided game:
//   started()               the first reveal: the prompts begin;
//   shift(selected)         Shift (or its controller button) is held with the crosshair on `selected`:
//                           prompt 1 is done when it is L;
//   ctrl()                  Ctrl (or its button) is held: prompt 2;
//   flagged(cells)          the cells an action newly flagged: prompt 3 when they include M;
//   chorded(cell, revealed) a chord on `cell` opened `revealed` cubes: prompt 4 when it is L and
//                           opened at least one;
//   lessonClosed(count)     L's closed, unflagged neighbour count after a board action: prompt 4
//                           when it is 0, since a chord on L can then open nothing.
//   Each returns whether the prompt line changed. An action before the first reveal does nothing;
//   after it, each prompt is done by its action at any time, and one already done when its turn
//   comes is skipped. `current` is the prompt line's name, `done(name)` whether a prompt is done, and
//   `tinted` the cell carrying the start-cell tint: L while prompt 1 or 4 shows, M while prompt 3
//   shows, else -1.
// closedAround(view, cell) → how many of `cell`'s neighbours on a 3D state view are neither revealed
//   nor flagged: the count the shell hands lessonClosed for L.

import { createBoxGrid } from '../engine/box-grid.js';

export const LEARN_BOARD = Object.freeze({
  X: 4,
  Y: 4,
  Z: 3,
  mines: 4,
  seed: 75,
  generatorVersion: 1,
  startCell: 26,
  minePositions: Object.freeze([1, 2, 3, 40]),
  proofNumber: 36,
  lessonNumber: 25,
  lessonMine: 40,
});

/** The board readout, the pause card's board line and the ready card's name for the guided board. */
export const LEARN_TITLE = 'Learn 3D';

export const LEARN_PROMPTS = Object.freeze(['start', 'shift', 'ctrl', 'flag', 'chord', 'rest']);
const STEPS = Object.freeze(['shift', 'ctrl', 'flag', 'chord']);

/** Each prompt's one-time hint name in the bindings source (js/settings/bindings.js HINT_TEXT). */
export const LEARN_HINTS = Object.freeze({
  start: 'learnStart', shift: 'learnShift', ctrl: 'learnCtrl', flag: 'learnFlag', chord: 'learnChord', rest: 'learnRest',
});

// Whether key a sorts before key b, element by element.
const before = (a, b) => {
  for (let t = 0; t < a.length; t++) if (a[t] !== b[t]) return a[t] < b[t];
  return false;
};

export function lessonCells(view, startCell) {
  if (view.state === 'won' || view.state === 'lost') return null;
  const { X, Y, Z, n } = view;
  const { graph, coords } = createBoxGrid(X, Y, Z);
  const { pressed, number, unlinked } = view;
  let hid = false;
  for (let c = 0; c < n; c++) if (unlinked[c]) { hid = true; break; }
  if (!hid) return null;
  const closedOf = (c) => {
    const out = [];
    graph.forEachNeighbour(c, (nb) => { if (!pressed[nb]) out.push(nb); });
    return out;
  };
  const ones = [];
  for (let c = 0; c < n; c++) if (pressed[c] && number[c] === 1) ones.push(c);
  const [si, sj, sk] = coords(startCell);
  const dist = (c) => { const [i, j, k] = coords(c); return (i - si) ** 2 + (j - sj) ** 2 + (k - sk) ** 2; };
  let best = null;
  for (const p of ones) {
    const pc = closedOf(p);
    if (pc.length !== 1) continue;
    const m = pc[0];
    for (const l of ones) {
      if (l === p) continue;
      const lc = closedOf(l);
      if (lc.length < 2 || !lc.includes(m)) continue;
      const key = [dist(l), l, m, p];
      if (!best || before(key, best.key)) best = { key, proofNumber: p, lessonNumber: l, lessonMine: m };
    }
  }
  return best ? { proofNumber: best.proofNumber, lessonNumber: best.lessonNumber, lessonMine: best.lessonMine } : null;
}

export function learnChoice(board = LEARN_BOARD) {
  return {
    X: board.X, Y: board.Y, Z: board.Z, mines: board.mines, minePositions: [...board.minePositions], noGuess: false, learn: true,
    forced: { startCell: board.startCell, seed: board.seed, learn: true },
  };
}

export function closedAround(view, cell) {
  const { graph } = createBoxGrid(view.X, view.Y, view.Z);
  const { pressed, flagged } = view;
  let count = 0;
  graph.forEachNeighbour(cell, (nb) => { if (!pressed[nb] && !flagged[nb]) count++; });
  return count;
}

export function createLearnPrompts({ lessonNumber, lessonMine } = LEARN_BOARD) {
  let begun = false;
  const done = new Set();
  const current = () => (!begun ? 'start' : STEPS.find((s) => !done.has(s)) ?? 'rest');
  const mark = (step) => {
    if (!begun || done.has(step)) return false;
    const before = current();
    done.add(step);
    return current() !== before;
  };
  return {
    get current() { return current(); },
    done: (name) => done.has(name),
    get tinted() {
      const c = current();
      if (c === 'shift' || c === 'chord') return lessonNumber;
      if (c === 'flag') return lessonMine;
      return -1;
    },
    started() {
      if (begun) return false;
      begun = true;
      return true;
    },
    shift(selected) { return selected === lessonNumber ? mark('shift') : false; },
    ctrl() { return mark('ctrl'); },
    flagged(cells) { return Array.from(cells ?? []).includes(lessonMine) ? mark('flag') : false; },
    chorded(cell, revealed) { return cell === lessonNumber && revealed > 0 ? mark('chord') : false; },
    lessonClosed(count) { return count === 0 ? mark('chord') : false; },
  };
}
