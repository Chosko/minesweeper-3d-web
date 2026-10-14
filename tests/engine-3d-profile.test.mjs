// The 3D rule profile (`minesweeper-3d`, versions 1 and 2) on the shared rules engine over the box
// graph: right-click on a revealed cell (version 1 unflags every neighbour, version 2 only the
// number's own batch), chord, the zero flood that stops at a flagged neighbour,
// auto-hide (unlinking), the 3D win rule, the loss, counts, and the rule cases of
// tests/logic.test.mjs ported onto fixed mine sets. docs/ORIGINAL_SPEC.md § Rules is the oracle;
// the deliberate differences of .claude/domain/features/3d-board-graph.md (no action after the
// game ends, at most every cell but one a mine, mines placed by board-generation) are tested as
// the new rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { PROFILES, PROFILE_3D, REFERENCE_PROFILE, getRuleProfile } from '../js/engine/profiles.js';
import { createGame, createGameWithMines, PHASE, CELL } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { timed } from './helpers/timing.mjs';

// ---------- helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const G = (X, Y, Z, mines) => createGameWithMines({
  graph: createBoxGrid(X, Y, Z).graph, profile: PROFILE_3D, mines, dimensions: { X, Y, Z },
});
// The same game under rules version 1, whose second right-click on a number unflags every neighbour.
const G1 = (X, Y, Z, mines) => createGameWithMines({
  graph: createBoxGrid(X, Y, Z).graph, profile: PROFILE_3D, version: 1, mines, dimensions: { X, Y, Z },
});
const arr = (a) => Array.from(a);
const sum = (a) => a.reduce((x, y) => x + y, 0);
const changedSet = (r) => new Set(arr(r.changed));
const sorted = (a) => arr(a).sort((x, y) => x - y);
// `count` distinct cells of 0..n-1 drawn from `rng`, ascending.
function drawMines(n, count, rng) {
  const cells = Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < count; t++) {
    const s = t + Math.floor(rng() * (n - t));
    [cells[t], cells[s]] = [cells[s], cells[t]];
  }
  return cells.slice(0, count).sort((a, b) => a - b);
}

// ---------- naive reference (direct port of Cell.cs / Grid.cs / Minesweeper.cs frame logic) ----------
class Exploded extends Error {}
class NaiveGame {
  constructor(X, Y, Z, mineIdx) {
    this.n = X * Y * Z; this.mines = mineIdx.length;
    this.endGame = false; this.win = false;
    const isMine = new Set(mineIdx);
    this.cells = [];
    for (let c = 0; c < this.n; c++) this.cells.push({ pressed: false, flagged: false, unlinked: false, number: 0, adj: [] });
    for (let c = 0; c < this.n; c++) {
      const i = c % X, j = Math.floor(c / X) % Y, k = Math.floor(c / (X * Y));
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        if (!di && !dj && !dk) continue;
        const a = i + di, b = j + dj, d = k + dk;
        if (a < 0 || b < 0 || d < 0 || a >= X || b >= Y || d >= Z) continue;
        this.cells[c].adj.push(a + X * (b + Y * d));
      }
    }
    for (const c of this.cells) c.adj = c.adj.map((x) => this.cells[x]);
    for (let c = 0; c < this.n; c++) {
      this.cells[c].number = isMine.has(c) ? -1 : this.cells[c].adj.filter((o) => isMine.has(this.cells.indexOf(o))).length;
    }
  }
  checkMines(c) { return c.number >= 0 ? c.adj.filter((o) => o.flagged).length === c.number : true; }
  leftRightClick(c) {
    if (c.pressed && this.checkMines(c)) for (const o of c.adj) if (!o.pressed) this.leftClick(o);
  }
  leftClick(c) {
    if (!c.flagged) {
      c.pressed = true;
      if (c.number === 0) this.leftRightClick(c);
      if (c.number === -1) throw new Exploded();
    }
  }
  flag(c) { if (!c.pressed) c.flagged = true; }
  unFlag(c) { if (!c.pressed) { c.flagged = false; for (const o of c.adj) o.unlinked = false; } }
  rightClick(c) {
    if (!c.pressed) { if (!c.flagged) this.flag(c); else this.unFlag(c); }
    else {
      let all = true;
      for (const o of c.adj) if (!o.pressed && !o.flagged) { all = false; this.flag(o); }
      if (all) for (const o of c.adj) if (!o.pressed) this.unFlag(o);
    }
  }
  tryUnlink(c) {
    if (!c.flagged && c.pressed) {
      let allPressed = true;
      if (c.number === 0 && c.pressed) c.unlinked = true;
      else for (const o of c.adj) if (!o.pressed && !o.flagged && !o.unlinked) { allPressed = false; break; }
      if (allPressed) c.unlinked = this.checkMines(c);
    }
  }
  frame(action) {
    try { action(); } catch (e) {
      if (!(e instanceof Exploded)) throw e;
      this.endGame = true;
      return;
    }
    for (;;) {
      let changed = false;
      for (const c of this.cells) {
        if (!c.unlinked && (c.pressed || c.flagged)) {
          const before = c.unlinked; this.tryUnlink(c); if (c.unlinked !== before) changed = true;
        }
      }
      if (!changed) break;
    }
    const unpressed = this.cells.filter((c) => !c.pressed).length;
    if (unpressed === this.mines && !this.cells.some((c) => c.flagged && c.number !== -1)) {
      this.endGame = true; this.win = true;
    }
  }
  get phase() { return this.win ? PHASE.WON : this.endGame ? PHASE.LOST : PHASE.PLAYING; }
}

// Version 2 on the naive port: a right-click on a pressed cell whose closed neighbours are all
// flagged unflags only the flags that cell's own flag-alls placed; every unflag drops its owner.
class NaiveGame2 extends NaiveGame {
  flag(c, owner = null) { if (!c.pressed) { c.flagged = true; c.owner = owner; } }
  unFlag(c) { super.unFlag(c); if (!c.pressed) c.owner = null; }
  rightClick(c) {
    if (!c.pressed) { if (!c.flagged) this.flag(c); else this.unFlag(c); }
    else {
      let all = true;
      for (const o of c.adj) if (!o.pressed && !o.flagged) { all = false; this.flag(o, c); }
      if (all) for (const o of c.adj) if (!o.pressed && o.owner === c) this.unFlag(o);
    }
  }
}

function assertSame(g, ng, msg) {
  const { revealed, flagged, hidden } = g.state;
  for (let c = 0; c < ng.n; c++) {
    const r = ng.cells[c];
    if (revealed[c] !== +r.pressed || flagged[c] !== +r.flagged || hidden[c] !== +r.unlinked) {
      assert.fail(`${msg}: cell ${c} engine r${revealed[c]} f${flagged[c]} h${hidden[c]} vs naive p${+r.pressed} f${+r.flagged} u${+r.unlinked}`);
    }
  }
  assert.equal(g.flagCount, ng.cells.filter((c) => c.flagged).length, msg + ' flagCount');
}

// ---------- performance (first, on a fresh JIT: the small boards below make the graph calls polymorphic) ----------
test('performance: 100x100x100 with 1000 mines, build + open a zero region < 2s, iteratively', () => {
  const rng = mulberry32(42), drawn = new Set();
  while (drawn.size < 1000) drawn.add(Math.floor(rng() * 1_000_000));
  const mines = [...drawn];
  const run = timed(2000, () => {
    const t0 = performance.now();
    const game = G(100, 100, 100, mines);
    const t1 = performance.now();
    let z = -1;
    for (let c = 0; c < 1_000_000; c++) if (!game.state.mine[c] && game.state.number[c] === 0) { z = c; break; }
    const opened = game.reveal(z);
    return { g: game, r: opened, build: t1 - t0, open: performance.now() - t1 };
  });
  const { g, r } = run.value;
  assert.equal(r.ended, false);
  assert.ok(r.changed.length > 900000, `changed ${r.changed.length}`);
  assert.ok(sum(arr(g.state.hidden)) > 800000, 'the opened zeros hide');
  console.log(`perf: build ${run.value.build.toFixed(0)}ms, open ${run.value.open.toFixed(0)}ms, changed ${r.changed.length}`);
  assert.ok(run.ok, `total ${run.ms.toFixed(0)}ms, limit ${run.limit}ms`);
  // a mass flag and unflag on the large box allocate no per-cell memory
  let target = -1;
  for (let c = 0; c < 1_000_000; c++) if (g.state.revealed[c] && g.state.number[c] > 0) { target = c; break; }
  const before = process.memoryUsage();
  for (let t = 0; t < 50; t++) g.toggleFlag(target);
  const after = process.memoryUsage();
  assert.ok(after.arrayBuffers - before.arrayBuffers < 1_000_000, `arrayBuffers grew ${after.arrayBuffers - before.arrayBuffers}`);
});

// ---------- the profile table ----------
test('profile: the 3D profile ships as its own entry, version 2 current, version 1 kept, beside the unchanged reference', () => {
  assert.equal(PROFILE_3D, 'minesweeper-3d');
  assert.deepEqual(Object.keys(PROFILES).sort(), [PROFILE_3D, REFERENCE_PROFILE].sort());
  assert.equal(PROFILES[PROFILE_3D].current, 2);
  assert.deepEqual(Object.keys(PROFILES[PROFILE_3D].versions), ['1', '2']);
  const p = getRuleProfile(PROFILE_3D);
  assert.equal(p.id, PROFILE_3D);
  assert.equal(p.version, 2);
  assert.equal(p, getRuleProfile(PROFILE_3D, 2));
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.fidelity));
  assert.equal(p.flagRevealedCell, 'neighbours');
  assert.equal(p.revealedUnflag, 'own-batch');
  assert.equal(p.fidelity.revealedUnflag, '3d-board-graph: Deliberate differences');
  assert.equal(p.autoHide, true);
  assert.equal(p.zeroFloodStopsAtFlag, true);
  assert.equal(p.clickCounting.flagOnRevealedCell, 'one-flag-click');
  const v1 = getRuleProfile(PROFILE_3D, 1);
  assert.equal(v1.version, 1);
  assert.equal(v1.revealedUnflag, undefined, 'version 1 is unchanged: it unflags every neighbour');
  for (const profile of [p, v1]) {
    for (const marker of Object.keys(profile)) {
      if (['id', 'version', 'fidelity'].includes(marker)) continue;
      assert.ok(profile.fidelity[marker], `version ${profile.version}: marker ${marker} cites its rule`);
    }
  }
  const { revealedUnflag, version, fidelity, ...rest2 } = p;
  const { version: _v, fidelity: f1, ...rest1 } = v1;
  assert.deepEqual(rest2, rest1, 'version 2 differs from version 1 only by the undo marker');
  const { revealedUnflag: _f, ...fid2 } = fidelity;
  assert.deepEqual(fid2, { ...f1 });
  assert.throws(() => getRuleProfile(PROFILE_3D, 3), RangeError);
  const ref = getRuleProfile(REFERENCE_PROFILE);
  assert.equal(ref.flagRevealedCell, false);
  assert.equal(ref.autoHide, undefined);
  assert.equal(ref.zeroFloodStopsAtFlag, undefined);
  assert.equal(ref.revealedUnflag, undefined);
});

test('reference profile: a wrong flag does not stop its flood fill and it never hides a cell', () => {
  // 3x3, mine at 8: numbers 0 0 0 / 0 1 1 / 0 1 -, a wrong flag on 1
  const grid = createSquareGrid(3, 3);
  const g = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines: [8] });
  g.toggleFlag(1);
  g.reveal(0);
  assert.deepEqual(arr(g.state.revealed), [1, 0, 0, 1, 1, 0, 1, 1, 0]);
  const h = createGameWithMines({ graph: grid.graph, profile: PROFILE_3D, mines: [8] });
  h.toggleFlag(1);
  h.reveal(0);
  assert.deepEqual(arr(h.state.revealed), [1, 0, 0, 0, 0, 0, 0, 0, 0]);
  const w = createGameWithMines({ graph: createSquareGrid(5, 5).graph, profile: REFERENCE_PROFILE, mines: [24] });
  w.reveal(0);
  assert.ok(arr(w.state.hidden).every((v) => v === 0));
  assert.equal(w.toggleFlag(0).changed.length, 0); // flagging a revealed cell: nothing
});

// ---------- geometry and numbers over the box graph ----------
test('numbers over the box graph', () => {
  const box = createBoxGrid(3, 3, 3);
  const g = G(3, 3, 3, [box.index(1, 1, 1)]);
  for (let c = 0; c < 27; c++) assert.equal(g.state.number[c], c === 13 ? 0 : 1);
  assert.equal(g.state.mine[13], 1);
  const h = G(3, 3, 1, [0, 1, 2]);
  assert.deepEqual(arr(h.state.number).slice(3), [2, 3, 2, 0, 0, 0]);
  const full = G(3, 3, 3, Array.from({ length: 27 }, (_, i) => i).filter((i) => i !== 13));
  assert.equal(full.state.number[13], 26);
});

// ---------- mines placed by board-generation (deliberate difference) ----------
test('mine placement: the engine places no mines, it asks for a board at the first reveal', () => {
  const g = createGame({ graph: createBoxGrid(3, 2, 2).graph, profile: PROFILE_3D, mineCount: 3 });
  assert.equal(g.phase, PHASE.AWAITING_FIRST_CLICK);
  const r = g.reveal(5);
  assert.equal(r.boardNeeded, 5);
  assert.equal(sum(arr(g.state.mine)), 0);
  g.supplyBoard(5, [0, 1, 11]);
  assert.equal(g.phase, PHASE.PLAYING);
  assert.equal(g.state.revealed[5], 1);
});

// ---------- mine cap (deliberate difference) ----------
test('mine cap: at most every cell but one is a mine', () => {
  assert.throws(() => G(2, 2, 2, [0, 1, 2, 3, 4, 5, 6, 7]), RangeError);
  assert.throws(() => createGame({ graph: createBoxGrid(2, 2, 2).graph, profile: PROFILE_3D, mineCount: 8 }), RangeError);
  const g = G(2, 2, 2, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(g.phase, PHASE.PLAYING);
  assert.equal(g.minesLeft, 7);
  const r = g.reveal(7);
  assert.equal(r.ended, true);
  assert.equal(g.phase, PHASE.WON);
});

// ---------- reveal / flood fill ----------
test('flood fill reveals the region and stops at a zero with a wrongly flagged neighbour', () => {
  // 5x1x1 line: mine at 4. numbers: 0 0 0 1 -
  const g = G(5, 1, 1, [4]);
  let r = g.reveal(0);
  assert.deepEqual(arr(g.state.revealed), [1, 1, 1, 1, 0]);
  assert.equal(r.ended, true);
  assert.equal(g.phase, PHASE.WON);

  const h = G(5, 1, 1, [4]);
  h.toggleFlag(2); // wrong flag
  r = h.reveal(0);
  // cell 0 opens, spreads to 1; 1 is a zero with a flagged neighbour -> stops there
  assert.deepEqual(arr(h.state.revealed), [1, 1, 0, 0, 0]);
  assert.equal(r.ended, false);
  // reveal on a flagged cell: nothing changes
  const r2 = h.reveal(2);
  assert.equal(r2.changed.length, 0);
  assert.equal(h.state.flagged[2], 1);
});

test('reveal on a number opens only itself', () => {
  const g = G(3, 3, 1, [0]);
  g.reveal(1);
  assert.equal(sum(arr(g.state.revealed)), 1);
});

test('reveal on a revealed zero spreads once its flagged neighbour is unflagged', () => {
  const g = G(5, 1, 1, [4]);
  g.toggleFlag(2);
  g.reveal(0);
  g.toggleFlag(2); // unflag
  const r = g.reveal(1);
  assert.deepEqual(arr(g.state.revealed), [1, 1, 1, 1, 0]);
  assert.equal(r.ended, true);
  assert.equal(g.phase, PHASE.WON);
  // a reveal on a revealed number still opens nothing
  const h = G(3, 3, 1, [0]);
  h.reveal(4);
  assert.equal(h.reveal(4).changed.length, 0);
  assert.equal(h.counts().clicks.reveal.wasted, 1);
});

// ---------- chord ----------
test('chord success, failure, and the wrong-flag explosion', () => {
  // 3x3x1, mine at 0. numbers: - 1 0 / 1 1 0 / 0 0 0
  const g = G(3, 3, 1, [0]);
  g.reveal(4); // centre, number 1
  assert.equal(g.chord(4).changed.length, 0); // no flags -> nothing
  assert.equal(g.chord(1).changed.length, 0); // not revealed -> nothing
  g.toggleFlag(0);
  const r = g.chord(4);
  assert.equal(r.ended, true);
  assert.equal(sum(arr(g.state.revealed)), 8);
  assert.equal(g.phase, PHASE.WON);

  const h = G(3, 3, 1, [0]);
  h.reveal(4);
  h.toggleFlag(8); // wrong flag
  const r2 = h.chord(4);
  assert.equal(r2.ended, true);
  assert.equal(h.phase, PHASE.LOST);
  assert.equal(h.explodedCell, 0);
  assert.ok(arr(h.state.hidden).every((v) => v === 0));
  assert.equal(h.cellState(0), CELL.EXPLODED);
  assert.equal(h.cellState(8), CELL.WRONG_FLAG);
});

test('chord through a zero neighbour floods, and the flood stops at a zero with a flagged neighbour', () => {
  // 6x1x1: mine at 0. numbers: - 1 0 0 0 0
  const g = G(6, 1, 1, [0]);
  g.reveal(1);
  g.toggleFlag(0);
  g.toggleFlag(4); // wrong flag
  g.chord(1);
  // 2 opens; 2 is a zero with no flagged neighbour -> 3 opens; 3 has flagged neighbour 4 -> stops
  assert.deepEqual(arr(g.state.revealed), [0, 1, 1, 1, 0, 0]);
});

// ---------- right-click ----------
test('version 1: toggle flag and mass flag / mass unflag on revealed cells', () => {
  const g = G1(3, 3, 1, [0, 2]);
  g.toggleFlag(0);
  assert.equal(g.state.flagged[0], 1); assert.equal(g.minesLeft, 1);
  g.toggleFlag(0);
  assert.equal(g.state.flagged[0], 0); assert.equal(g.minesLeft, 2);

  g.reveal(4); // number 2, all 8 neighbours unrevealed
  g.toggleFlag(0);
  const r = g.toggleFlag(4);
  assert.deepEqual(arr(r.changed).sort((a, b) => a - b), [1, 2, 3, 5, 6, 7, 8]);
  assert.equal(g.flagCount, 8);
  assert.equal(g.minesLeft, -6); // negative allowed
  const r2 = g.toggleFlag(4);
  assert.equal(r2.changed.length, 8);
  assert.equal(g.flagCount, 0);
  // revealed cell whose every unrevealed neighbour is flagged: unflags them
  const h = G1(2, 1, 1, [1]);
  h.reveal(0);
  h.toggleFlag(1);
  h.toggleFlag(0);
  assert.equal(h.state.flagged[1], 0);
  // a revealed cell with no unrevealed neighbour: nothing changes
  const k = G1(5, 1, 1, [2]); // 0 1 - 1 0
  k.reveal(0);
  assert.equal(k.phase, PHASE.PLAYING);
  assert.equal(k.state.revealed[1], 1);
  assert.equal(k.toggleFlag(0).changed.length, 0);
});

// ---------- version 2: a second right-click takes back only the number's own batch ----------
// 4 × 3 × 1, mines at the corners 0, 3, 8 and 11:
//   0* 1  2  3*
//   4  5  6  7        5 and 6 are 2s; 5's closed neighbours 0 1 2 4 8 9 10,
//   8* 9  10 11*      6's 1 2 3 7 9 10 11; they share 1 2 9 10.
const twoNumbers = () => {
  const g = G(4, 3, 1, [0, 3, 8, 11]);
  g.reveal(5); g.reveal(6);
  assert.equal(g.cellNumber(5), 2); assert.equal(g.cellNumber(6), 2);
  return g;
};
const flaggedCells = (g) => arr(g.state.flagged).flatMap((f, c) => (f ? [c] : []));

test('version 2: a flag-all flags every closed, unflagged neighbour; the undo takes back only that number\'s batch', () => {
  const g = twoNumbers();
  g.toggleFlag(4); // a hand-placed flag
  let r = g.toggleFlag(6); // 6's flag-all
  assert.deepEqual(sorted(r.changed), [1, 2, 3, 7, 9, 10, 11]);
  r = g.toggleFlag(5); // 5's flag-all: only its closed, unflagged neighbours
  assert.deepEqual(sorted(r.changed), [0, 8]);
  assert.deepEqual(flaggedCells(g), [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]);
  r = g.toggleFlag(5); // every closed neighbour of 5 is flagged: take back 5's batch only
  assert.deepEqual(sorted(r.changed), [0, 8]);
  assert.deepEqual(flaggedCells(g), [1, 2, 3, 4, 7, 9, 10, 11], 'the hand flag and 6\'s flags stay');
  r = g.toggleFlag(6); // 6's undo
  assert.deepEqual(sorted(r.changed), [1, 2, 3, 7, 9, 10, 11]);
  assert.deepEqual(flaggedCells(g), [4]);
  assert.equal(g.minesLeft, 3);
  assert.deepEqual({ ...g.counts().clicks.flag }, { effective: 3, wasted: 2 });
});

test('version 2: an undo whose batch is empty changes nothing and is one wasted flag click', () => {
  const g = twoNumbers();
  g.toggleFlag(6); // 6's batch: 1 2 3 7 9 10 11
  for (const c of [0, 4, 8]) g.toggleFlag(c); // the rest of 5's closed neighbours, by hand
  const before = arr(g.state.flagged);
  const r = g.toggleFlag(5);
  assert.equal(r.changed.length, 0);
  assert.equal(r.ended, false);
  assert.deepEqual(arr(g.state.flagged), before);
  assert.deepEqual(g.actions().at(-1), { kind: 'flag', cell: 5 }, 'the click is recorded');
  assert.deepEqual({ ...g.counts().clicks.flag }, { effective: 4, wasted: 1 });
});

test('version 2: an unflag of any kind drops the cell from its batch; flagged again by hand it is hand-placed', () => {
  const g = twoNumbers();
  g.toggleFlag(6);
  g.toggleFlag(7); // hand unflag: 7 leaves 6's batch
  assert.equal(g.state.flagged[7], 0);
  g.toggleFlag(7); // flagged again by hand
  const r = g.toggleFlag(6); // every closed neighbour flagged: the undo
  assert.deepEqual(sorted(r.changed), [1, 2, 3, 9, 10, 11]);
  assert.deepEqual(flaggedCells(g), [7], 'the hand flag stays');
  // an undo is an unflag too: the cells it took back are no longer in any batch
  g.toggleFlag(5); // 5's batch: 0 1 2 4 8 9 10
  g.toggleFlag(5); // taken back
  for (const c of [0, 1, 2, 4, 8, 9, 10]) g.toggleFlag(c); // all flagged again by hand
  assert.equal(g.toggleFlag(5).changed.length, 0, 'nothing of 5\'s is left to take back');
});

test('version 2: a flag-all over a live batch adds to it, and the undo takes back every flag of it still standing', () => {
  const g = twoNumbers();
  g.toggleFlag(6); // batch 1 2 3 7 9 10 11
  g.toggleFlag(1); g.toggleFlag(7); // hand unflags
  let r = g.toggleFlag(6); // flag-all again: 1 and 7 join the batch
  assert.deepEqual(sorted(r.changed), [1, 7]);
  g.toggleFlag(3); // a hand unflag of one more
  g.toggleFlag(3); // and a hand flag: 3 is hand-placed now
  r = g.toggleFlag(6);
  assert.deepEqual(sorted(r.changed), [1, 2, 7, 9, 10, 11]);
  assert.deepEqual(flaggedCells(g), [3]);
});

test('version 2: a number keeps its batch while hidden, and its batch applies once an unflag shows it again', () => {
  // 0* 1 2* 3 4: 1 is a 2, 3 a 1; 4 stays closed so the game goes on
  const g = G(5, 1, 1, [0, 2]);
  g.reveal(1); g.reveal(3);
  g.toggleFlag(1); // batch of 1: 0 and 2
  assert.equal(g.state.hidden[1], 1, 'satisfied with every neighbour flagged: hidden');
  g.toggleFlag(0); // a hand unflag of one batch flag shows 1 again
  assert.equal(g.state.hidden[1], 0);
  assert.equal(g.state.flagged[2], 1, 'the rest of the batch stays');
  let r = g.toggleFlag(1); // the flag-all adds 0 back to the batch it kept
  assert.deepEqual(sorted(r.changed), [0, 1]);
  assert.equal(g.state.hidden[1], 1);
  // Hidden cells cannot be picked; the engine call shows what the batch holds: 2 from before the hide.
  r = g.toggleFlag(1);
  assert.deepEqual(flaggedCells(g), []);
  assert.deepEqual(sorted(r.changed), [0, 1, 2]);
});

test('version 2: flags placed before the board arrives are hand-placed', () => {
  const box = createBoxGrid(4, 3, 1);
  const g = createGame({ graph: box.graph, profile: PROFILE_3D, mineCount: 4 });
  assert.equal(g.rulesVersion, 2, 'a new 3D game plays the current version');
  // the session replays the early flags onto the arrived board with ordinary flag clicks
  g.supplyBoard(5, [0, 3, 8, 11]);
  g.reveal(6);
  for (const c of [0, 1, 2, 4, 8, 9, 10]) g.toggleFlag(c);
  assert.equal(g.toggleFlag(5).changed.length, 0, 'no batch: the undo takes back nothing');
  assert.equal(flaggedCells(g).length, 7);
});

test('version 2: snapshot and restore carry every flag\'s batch membership', () => {
  const play = (g) => { g.toggleFlag(4); g.toggleFlag(6); g.toggleFlag(5); g.toggleFlag(7); g.toggleFlag(7); };
  const g = twoNumbers();
  play(g);
  const snap = g.snapshot();
  assert.equal(snap.cells.byteLength, 4 * 3, 'still one byte a cell');
  const took = (h) => [sorted(h.toggleFlag(5).changed), sorted(h.toggleFlag(6).changed), flaggedCells(h)];
  const expected = took(g);
  assert.deepEqual(expected, [[0, 8], [1, 2, 3, 9, 10, 11], [4, 7]]);
  g.restore(snap);
  assert.deepEqual(took(g), expected, 'the restored game takes back the same batches');
  g.restore(snap);
  g.toggleFlag(0); g.toggleFlag(0); // change 0's membership after the snapshot
  g.restore(snap);
  assert.deepEqual(took(g), expected);
  const fresh = twoNumbers();
  play(fresh);
  assert.deepEqual(took(fresh), expected, 'as the game that took the snapshot');
});

test('minesLeft goes negative', () => {
  const g = G(4, 1, 1, [0]);
  g.toggleFlag(1); g.toggleFlag(2); g.toggleFlag(3);
  assert.equal(g.minesLeft, -2);
});

// ---------- auto-hide (unlinking) ----------
test('auto-hide: a zero with no flagged neighbour hides at once; unflagging un-hides', () => {
  const g = G(5, 1, 1, [4]);
  g.toggleFlag(2);
  const r = g.reveal(0);
  assert.equal(g.state.hidden[0], 1); // zero, no flagged neighbour
  assert.equal(g.state.hidden[1], 0); // zero with a flagged neighbour
  assert.ok(changedSet(r).has(0));
  const r2 = g.toggleFlag(2); // unflag: 1 now has no flagged neighbour
  assert.equal(g.state.hidden[1], 1);
  assert.ok(changedSet(r2).has(1));
});

test('auto-hide: a number hides when satisfied with every neighbour revealed or flagged; unflag un-hides', () => {
  const g = G(4, 1, 1, [2]); // numbers 0 1 - 1
  g.reveal(1);
  assert.equal(g.state.hidden[1], 0); // neighbours 0 and 2 closed
  g.reveal(0);
  assert.equal(g.state.hidden[0], 1);
  assert.equal(g.state.hidden[1], 0); // neighbour 2 closed and unflagged
  const r = g.toggleFlag(2);
  assert.equal(g.state.hidden[1], 1); // every neighbour revealed or flagged, 1 flag == 1
  assert.ok(changedSet(r).has(1) && changedSet(r).has(2));
  const r2 = g.toggleFlag(2); // unflag -> un-hide
  assert.equal(g.state.hidden[1], 0);
  assert.equal(g.state.hidden[0], 1);
  assert.ok(changedSet(r2).has(1));
  // a wrong flag count keeps it shown
  const h = G(3, 3, 1, [0]);
  h.reveal(4);
  for (const c of [0, 1, 2, 3, 5, 6, 7, 8]) h.toggleFlag(c);
  assert.equal(h.state.hidden[4], 0); // 8 flags != 1
});

test('auto-hide runs on the winning action and nothing changes after the game ends', () => {
  const g = G(3, 1, 1, [2]); // numbers 0 1 -
  const r = g.reveal(0);
  assert.equal(g.phase, PHASE.WON);
  assert.equal(r.ended, true);
  assert.equal(g.state.hidden[0], 1);
  assert.equal(g.state.hidden[1], 0); // its mine neighbour is closed and unflagged
  const after = g.toggleFlag(2);
  assert.equal(after.changed.length, 0);
  assert.equal(g.state.flagged[2], 0);
  assert.equal(g.state.hidden[1], 0);
});

// ---------- win / loss ----------
test('win without flags; flags on mines are not required; a flagged safe cell blocks the win', () => {
  const g = G(3, 1, 1, [0]); // - 1 0
  g.reveal(2);
  assert.equal(g.phase, PHASE.WON);

  const h = G(4, 1, 1, [0]); // - 1 0 0
  h.toggleFlag(0); // a flag on a mine does not block the win
  h.toggleFlag(3); // a flagged safe cell
  h.reveal(2); // zero with a flagged neighbour -> no spread
  assert.equal(h.phase, PHASE.PLAYING);
  assert.equal(sum(arr(h.state.revealed)), 1);
  h.reveal(1);
  assert.equal(h.phase, PHASE.PLAYING); // the flagged safe cell stays closed
  h.toggleFlag(3);
  h.reveal(3);
  assert.equal(h.phase, PHASE.WON);
  assert.equal(h.state.flagged[0], 1);
});

test('loss: every hidden cell is shown again, and no action changes anything after a loss or a win', () => {
  // 3x3x1, mines at 0 and 8: numbers - 1 0 / 1 2 1 / 0 1 -
  const g = G(3, 3, 1, [0, 8]);
  g.reveal(2); // a zero: spreads to 1, 4, 5 and hides
  assert.equal(g.state.hidden[2], 1);
  g.toggleFlag(3); // a wrong flag
  const r = g.reveal(8);
  assert.equal(r.ended, true);
  assert.equal(g.phase, PHASE.LOST);
  assert.equal(g.explodedCell, 8);
  assert.ok(arr(g.state.hidden).every((v) => v === 0));
  assert.equal(g.minesLeft, 1);
  assert.equal(g.cellState(0), CELL.MINE);
  assert.equal(g.cellState(3), CELL.WRONG_FLAG);
  // after a loss: nothing
  for (const act of ['reveal', 'toggleFlag', 'chord']) {
    assert.equal(g[act](0).changed.length, 0);
    assert.equal(g[act](3).changed.length, 0);
  }
  assert.equal(g.phase, PHASE.LOST);
  assert.equal(g.explodedCell, 8);

  // after a win: a reveal on a mine changes nothing and the game stays won
  const w = G(3, 1, 1, [0]);
  w.reveal(2);
  assert.equal(w.phase, PHASE.WON);
  const r2 = w.reveal(0);
  assert.equal(r2.changed.length, 0);
  assert.equal(r2.ended, false);
  assert.equal(w.phase, PHASE.WON);
  assert.equal(w.explodedCell, -1);
  assert.equal(w.toggleFlag(0).changed.length, 0);
});

// ---------- changed cells (ported from the version / dirty tracking case) ----------
test('changed cells: each action reports the cells it opened, flagged, hid and un-hid', () => {
  const g = G(5, 1, 1, [4]);
  g.toggleFlag(4);
  const r = g.reveal(0);
  const d = changedSet(r);
  for (const c of [0, 1, 2, 3]) assert.ok(d.has(c));
  assert.equal(g.phase, PHASE.WON);

  const h = G(5, 1, 1, [4]);
  h.reveal(3);
  assert.equal(h.reveal(3).changed.length, 0); // no change
  const r2 = h.toggleFlag(4);
  assert.deepEqual(arr(r2.changed), [4]); // 3's neighbour 2 is still closed: 3 stays shown
  const r3 = h.reveal(2); // opens 2, 1, 0; hides them and the now-satisfied 3
  assert.deepEqual(arr(r3.changed).sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.deepEqual(arr(h.state.hidden), [1, 1, 1, 1, 0]);
  assert.equal(h.phase, PHASE.WON);
});

// ---------- counts ----------
test('counts: a right-click on a revealed cell is one flag click however many neighbours it flags', () => {
  const g = G(3, 3, 1, [0, 2]);
  g.reveal(4);
  g.toggleFlag(4); // flags 8 neighbours: one effective flag click
  let c = g.counts().clicks;
  assert.deepEqual({ ...c.flag }, { effective: 1, wasted: 0 });
  g.toggleFlag(4); // unflags all 8: one wasted flag click
  c = g.counts().clicks;
  assert.deepEqual({ ...c.flag }, { effective: 1, wasted: 1 });
  const k = G(5, 1, 1, [2]); // 0 1 - 1 0
  k.reveal(0);
  k.toggleFlag(0); // nothing to flag or unflag: one wasted flag click
  assert.deepEqual({ ...k.counts().clicks.flag }, { effective: 0, wasted: 1 });
  assert.deepEqual(k.actions().map((a) => a.kind), ['reveal', 'flag']);
});

test('counts: 3BV and 3BV solved over the box graph', () => {
  // 3x3x3 with the centre mine: every cell is a 1 with no zero neighbour -> 26 isolated numbers
  const box = createBoxGrid(3, 3, 3);
  const g = G(3, 3, 3, [box.index(1, 1, 1)]);
  assert.equal(g.counts().bbbv, 26);
  g.reveal(0);
  assert.equal(g.counts().bbbvSolved, 1);
  const h = G(5, 1, 1, [4]); // 0 0 0 1 -: one opening (cells 0..2, reaching 3)
  assert.equal(h.counts().bbbv, 1);
  h.reveal(0);
  assert.equal(h.counts().bbbvSolved, 1);
  const s = h.summary();
  assert.equal(s.outcome, 'won');
  assert.deepEqual({ ...s.dimensions }, { X: 5, Y: 1, Z: 1 });
});

// ---------- property test vs naive reference ----------
function randomized(makeGame, Naive) {
  let games = 0, actions = 0, ended = 0;
  for (let s = 1; s <= 400; s++) {
    const R = mulberry32(s);
    const X = 1 + Math.floor(R() * 5), Y = 1 + Math.floor(R() * 5), Z = 1 + Math.floor(R() * 4);
    const n = X * Y * Z;
    if (n < 2) continue;
    const count = Math.min(n - 1, Math.floor(R() * Math.max(1, n / 4)) + (R() < 0.05 ? n : 0));
    const mineIdx = drawMines(n, count, mulberry32(s * 31));
    const g = makeGame(X, Y, Z, mineIdx);
    const ng = new Naive(X, Y, Z, mineIdx);
    for (let c = 0; c < n; c++) assert.equal(g.state.mine[c] ? -1 : g.state.number[c], ng.cells[c].number);
    assertSame(g, ng, `seed ${s} init`);
    games++;
    for (let a = 0; a < 40; a++) {
      const c = Math.floor(R() * n), kind = R();
      if (kind < 0.35) {
        if (g.state.mine[c] && R() < 0.85) continue;
        g.reveal(c); ng.frame(() => ng.leftClick(ng.cells[c]));
      } else if (kind < 0.75) {
        g.toggleFlag(c); ng.frame(() => ng.rightClick(ng.cells[c]));
      } else {
        g.chord(c); ng.frame(() => ng.leftRightClick(ng.cells[c]));
      }
      actions++;
      assert.equal(g.phase, ng.phase, `seed ${s} action ${a} phase`);
      if (g.phase === PHASE.LOST) { ended++; break; }
      assertSame(g, ng, `seed ${s} action ${a}`);
      assert.equal(g.minesLeft, count - g.flagCount);
      if (g.phase === PHASE.WON) { ended++; break; }
    }
  }
  assert.ok(games > 350 && actions > 5000 && ended > 50, `games ${games} actions ${actions} ended ${ended}`);
}

test('randomized: the 3D profile, version 1 == the naive full-pass port of the original while the game is playing', () => {
  randomized(G1, NaiveGame);
});

test('randomized: version 2 == the naive port with each number\'s own batch while the game is playing', () => {
  randomized(G, NaiveGame2);
});
