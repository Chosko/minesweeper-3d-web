import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, createGameFromMinePositions } from '../js/logic.js';

// ---------- helpers ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seq = (vals) => { let p = 0; return () => vals[p++]; };
const G = (X, Y, Z, mines) => createGameFromMinePositions(X, Y, Z, mines);

// ---------- naive reference (direct port of Cell.cs / Grid.cs / Minesweeper.cs frame logic) ----------
class Exploded extends Error {}
class NaiveGame {
  constructor(X, Y, Z, mineIdx) {
    this.X = X; this.Y = Y; this.Z = Z; this.n = X * Y * Z; this.mines = mineIdx.length;
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
        this.cells[c].adj.push(this.cells[a + X * (b + Y * d)]);
      }
    }
    for (let c = 0; c < this.n; c++) {
      this.cells[c].number = isMine.has(c) ? -1 : this.cells[c].adj.filter((o) => isMine.has(this.cells.indexOf(o))).length;
    }
    this.frame(() => {});
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
      for (const c of this.cells) { c.pressed = true; c.flagged = false; c.unlinked = false; }
      this.endGame = true;
    }
    // full passes in loop order until nothing changes
    for (;;) {
      let changed = false;
      for (const c of this.cells) {
        if (!this.endGame && !c.unlinked && (c.pressed || c.flagged)) {
          const before = c.unlinked; this.tryUnlink(c); if (c.unlinked !== before) changed = true;
        }
      }
      if (!changed) break;
    }
    const unpressed = this.cells.filter((c) => !c.pressed).length;
    if (!this.endGame && unpressed === this.mines && !this.cells.some((c) => c.flagged && c.number !== -1)) {
      this.endGame = true; this.win = true;
    }
  }
  get state() { return this.win ? 'won' : this.endGame ? 'lost' : 'playing'; }
}

function naivePlace(X, Y, Z, mines, rng) {
  // Grid.cs nextMine with the first array index = i (X)
  const m = new Set();
  const key = (i, j, k) => i + X * (j + Y * k);
  for (let q = 0; q < mines; q++) {
    const x = Math.floor(rng() * X), y = Math.floor(rng() * Y), z = Math.floor(rng() * Z);
    let i = x, j = y, k = z;
    while (m.has(key(i, j, k))) {
      i++;
      if (i >= X) { i = 0; j++; if (j >= Y) { j = 0; k++; if (k >= Z) k = 0; } }
    }
    m.add(key(i, j, k));
  }
  return m;
}

function assertSame(g, ng, msg) {
  for (let c = 0; c < g.n; c++) {
    const r = ng.cells[c];
    if (g.pressed[c] !== +r.pressed || g.flagged[c] !== +r.flagged || g.unlinked[c] !== +r.unlinked) {
      assert.fail(`${msg}: cell ${c} engine p${g.pressed[c]} f${g.flagged[c]} u${g.unlinked[c]} vs naive p${+r.pressed} f${+r.flagged} u${+r.unlinked}`);
    }
  }
  assert.equal(g.state, ng.state, msg + ' state');
  assert.equal(g.flagCount, ng.cells.filter((c) => c.flagged).length, msg + ' flagCount');
  assert.equal(g.unpressedCount, ng.cells.filter((c) => !c.pressed).length, msg + ' unpressed');
}

// ---------- geometry ----------
test('idx / coords roundtrip', () => {
  const g = G(3, 4, 5, []);
  for (let c = 0; c < g.n; c++) { const [i, j, k] = g.coords(c); assert.equal(g.idx(i, j, k), c); }
  assert.equal(g.idx(1, 2, 3), 1 + 3 * (2 + 4 * 3));
});

test('neighbour counts at corners/edges/faces/interior and 2D boards', () => {
  const g = G(4, 4, 4, []);
  assert.equal(g.neighbors(g.idx(0, 0, 0)).length, 7);
  assert.equal(g.neighbors(g.idx(1, 0, 0)).length, 11);
  assert.equal(g.neighbors(g.idx(1, 1, 0)).length, 17);
  assert.equal(g.neighbors(g.idx(1, 1, 1)).length, 26);
  assert.equal(g.neighbors(g.idx(3, 3, 3)).length, 7);
  const set = new Set(g.neighbors(g.idx(1, 1, 1)));
  assert.equal(set.size, 26); assert.ok(!set.has(g.idx(1, 1, 1)));
  const f = G(5, 5, 1, []);
  assert.equal(f.neighbors(f.idx(0, 0, 0)).length, 3);
  assert.equal(f.neighbors(f.idx(2, 0, 0)).length, 5);
  assert.equal(f.neighbors(f.idx(2, 2, 0)).length, 8);
  const line = G(1, 1, 3, []);
  assert.equal(line.neighbors(1).length, 2);
  assert.equal(G(1, 1, 1, []).neighbors(0).length, 0);
});

test('number computation', () => {
  const g = G(3, 3, 3, [G(3, 3, 3, []).idx(1, 1, 1)]);
  for (let c = 0; c < 27; c++) assert.equal(g.number[c], c === 13 ? -1 : 1);
  const h = G(3, 3, 1, [0, 1, 2]);
  assert.deepEqual(Array.from(h.number), [-1, -1, -1, 2, 3, 2, 0, 0, 0]);
  const full = G(3, 3, 3, Array.from({ length: 27 }, (_, i) => i).filter((i) => i !== 13));
  assert.equal(full.number[13], 26);
});

// ---------- placement ----------
test('linear probe placement with stubbed rng and collisions', () => {
  // 3x2x2: all mines target (2,1,1) = last cell -> probe wraps to 0, then 1, ...
  const r = seq([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
  const g = new Game(3, 2, 2, 3, r);
  const mines = [...g.number.keys()].filter((c) => g.number[c] === -1);
  assert.deepEqual(mines, [0, 1, 11]);
  // collision moving along i then j
  const g2 = new Game(3, 3, 1, 3, seq([2 / 3, 0, 0, 2 / 3, 0, 0, 2 / 3, 0, 0]));
  assert.deepEqual([...g2.number.keys()].filter((c) => g2.number[c] === -1), [2, 3, 4]);
  // mines == n fills everything
  const g3 = new Game(2, 2, 2, 8, () => 0.5);
  assert.ok(g3.number.every((v) => v === -1));
});

test('placement matches naive nested-loop probe over random seeds', () => {
  for (let s = 1; s < 200; s++) {
    const R = mulberry32(s), X = 1 + Math.floor(R() * 5), Y = 1 + Math.floor(R() * 5), Z = 1 + Math.floor(R() * 5);
    const n = X * Y * Z, mines = Math.floor(R() * (n + 1));
    const g = new Game(X, Y, Z, mines, mulberry32(s * 7));
    const ref = naivePlace(X, Y, Z, mines, mulberry32(s * 7));
    for (let c = 0; c < n; c++) assert.equal(g.number[c] === -1, ref.has(c));
  }
});

// ---------- leftClick / flood fill ----------
test('flood fill reveals region and stops at a zero with a wrongly flagged neighbour', () => {
  // 5x1x1 line: mine at 4. numbers: 0 0 0 1 -1
  const g = G(5, 1, 1, [4]);
  let r = g.leftClick(0);
  assert.deepEqual(Array.from(g.pressed), [1, 1, 1, 1, 0]);
  assert.deepEqual(r, { exploded: false, revealed: 4 });
  assert.equal(g.state, 'won');

  const h = G(5, 1, 1, [4]);
  h.rightClick(2); // wrong flag
  r = h.leftClick(0);
  // cell 0 pressed, cascades to 1; 1 is zero but has flagged neighbour 2 -> stops
  assert.deepEqual(Array.from(h.pressed), [1, 1, 0, 0, 0]);
  assert.equal(r.revealed, 2);
  // left-click on flagged cell: nothing
  const v = h.version;
  assert.deepEqual(h.leftClick(2), { exploded: false, revealed: 0 });
  assert.equal(h.version, v);
});

test('leftClick on number reveals only itself', () => {
  const g = G(3, 3, 1, [0]);
  g.leftClick(1);
  assert.equal(g.pressed.reduce((a, b) => a + b), 1);
});

// ---------- chord ----------
test('chord success, failure, and wrong-flags explosion', () => {
  // 3x3x1, mine at 0. numbers: -1 1 0 / 1 1 0 / 0 0 0
  const g = G(3, 3, 1, [0]);
  g.leftClick(4); // centre, number 1
  assert.deepEqual(g.chord(4), { exploded: false, revealed: 0 }); // no flags -> fails
  assert.equal(g.chord(1).revealed, 0); // not pressed -> fails
  g.rightClick(0);
  const r = g.chord(4);
  assert.equal(r.exploded, false);
  assert.equal(r.revealed, 7);
  assert.equal(g.state, 'won');

  const h = G(3, 3, 1, [0]);
  h.leftClick(4);
  h.rightClick(8); // wrong flag
  const r2 = h.chord(4);
  assert.equal(r2.exploded, true);
  assert.equal(h.state, 'lost');
  assert.equal(h.explodedIdx, 0);
  assert.ok(h.pressed.every((v) => v === 1));
  assert.ok(h.flagged.every((v) => v === 0));
  assert.ok(h.unlinked.every((v) => v === 0));
  assert.equal(h.flagCount, 0);
});

// ---------- rightClick ----------
test('rightClick toggle and mass flag / mass unflag on revealed cells', () => {
  const g = G(3, 3, 1, [0, 2]);
  assert.deepEqual(g.rightClick(0), { flagged: 1, unflagged: 0 });
  assert.equal(g.flagged[0], 1); assert.equal(g.minesLeft, 1);
  assert.deepEqual(g.rightClick(0), { flagged: 0, unflagged: 1 });
  assert.equal(g.flagged[0], 0); assert.equal(g.minesLeft, 2);

  g.leftClick(4); // number 2, all 8 neighbours unrevealed
  g.rightClick(0);
  assert.deepEqual(g.rightClick(4), { flagged: 7, unflagged: 0 });
  assert.equal(g.flagCount, 8);
  assert.equal(g.minesLeft, -6); // negative allowed
  assert.deepEqual(g.rightClick(4), { flagged: 0, unflagged: 8 });
  assert.equal(g.flagCount, 0);
  // revealed cell with no unrevealed neighbours: no-op
  const h = G(2, 1, 1, [1]);
  h.leftClick(0);
  h.rightClick(1);
  assert.deepEqual(h.rightClick(0), { flagged: 0, unflagged: 1 });
});

test('minesLeft goes negative', () => {
  const g = G(4, 1, 1, [0]);
  g.rightClick(1); g.rightClick(2); g.rightClick(3);
  assert.equal(g.minesLeft, -2);
});

// ---------- unlink ----------
test('unlink: zero cells unlink when no flagged neighbour; relink on unflag', () => {
  const g = G(5, 1, 1, [4]);
  g.rightClick(2);
  g.leftClick(0);
  assert.equal(g.unlinked[0], 1); // zero, no flagged neighbour
  assert.equal(g.unlinked[1], 0); // zero with flagged neighbour -> checkMines false
  g.rightClick(2); // unflag: relinks neighbours 1 and 3, then 1 re-unlinks (no flags now)
  assert.equal(g.unlinked[1], 1);
});

test('unlink: number cells require all neighbours pressed/flagged and checkMines; relink on unflag', () => {
  // 3x1x1: mine at 2. numbers 0 1 -1
  const g = G(4, 1, 1, [2]); // numbers 0 1 -1 1
  g.leftClick(1);
  assert.equal(g.unlinked[1], 0); // neighbour 0 and 2 unpressed
  g.leftClick(0);
  assert.equal(g.unlinked[0], 1);
  assert.equal(g.unlinked[1], 0); // neighbour 2 unpressed unflagged
  g.rightClick(2);
  assert.equal(g.unlinked[1], 1); // all neighbours pressed/flagged and 1 flag == 1
  g.rightClick(2); // unflag -> relink
  assert.equal(g.unlinked[1], 0);
  assert.equal(g.unlinked[0], 1);
  // wrong count -> stays linked
  const h = G(3, 3, 1, [0]);
  h.leftClick(4);
  for (const c of [0, 1, 2, 3, 5, 6, 7, 8]) h.rightClick(c);
  assert.equal(h.unlinked[4], 0); // 8 flags != 1
});

test('unlinking stops after the game ended', () => {
  const g = G(3, 1, 1, [2]); // numbers 0 1 -1
  g.leftClick(0);
  assert.equal(g.state, 'won');
  assert.equal(g.unlinked[1], 0);
  g.rightClick(2);
  assert.equal(g.unlinked[1], 0); // would unlink during play, but game ended
});

// ---------- win / lose ----------
test('win without flags; flags on mines ok; flagged non-mine blocks', () => {
  const g = G(3, 1, 1, [0]); // -1 1 0
  g.leftClick(2);
  assert.equal(g.state, 'won');

  const h = G(4, 1, 1, [0]); // -1 1 0 0
  h.rightClick(0); // flag on a mine does not block the win
  h.rightClick(3); // flagged non-mine
  h.leftClick(2); // zero with flagged neighbour -> no cascade
  assert.equal(h.state, 'playing');
  assert.equal(h.unpressedCount, 3);
  h.leftClick(1);
  assert.equal(h.state, 'playing'); // flagged non-mine keeps it unpressed
  h.rightClick(3);
  h.leftClick(3);
  assert.equal(h.state, 'won');
  assert.equal(h.flagged[0], 1);
});

test('loss reveal and explosion after a win keeps state won', () => {
  const g = G(3, 3, 1, [0, 8]);
  g.rightClick(4);
  const r = g.leftClick(8);
  assert.equal(r.exploded, true);
  assert.equal(g.state, 'lost'); assert.equal(g.explodedIdx, 8);
  assert.ok(g.pressed.every((v) => v === 1) && g.flagged.every((v) => !v) && g.unlinked.every((v) => !v));
  assert.equal(g.minesLeft, 2);
  // re-clicking a revealed mine after loss: no-op
  assert.equal(g.leftClick(0).exploded, false);

  const w = G(3, 1, 1, [0]);
  w.leftClick(2);
  assert.equal(w.state, 'won');
  assert.equal(w.leftClick(0).exploded, true);
  assert.equal(w.state, 'won');
  assert.equal(w.explodedIdx, 0);
  assert.ok(w.pressed.every((v) => v === 1));
});

test('mines == n is an immediate win after construction', () => {
  const g = new Game(2, 2, 2, 8);
  assert.equal(g.state, 'won');
  assert.equal(g.minesLeft, 8);
});

test('version and dirty tracking', () => {
  const g = G(5, 1, 1, [4]);
  assert.equal(g.version, 0);
  assert.equal(g.consumeDirty().length, 0);
  g.leftClick(0);
  assert.equal(g.version, 1);
  const d = new Set(g.consumeDirty());
  for (const c of [0, 1, 2, 3]) assert.ok(d.has(c));
  assert.equal(g.dirty.length, 0);
  g.leftClick(0); // no change
  assert.equal(g.version, 1);
  g.rightClick(4);
  assert.equal(g.version, 2);
  assert.ok(new Set(g.consumeDirty()).has(4));
});

// ---------- property test vs naive reference ----------
test('randomized: incremental engine == naive full-pass reference', () => {
  let games = 0, actions = 0;
  for (let s = 1; s <= 400; s++) {
    const R = mulberry32(s);
    const X = 1 + Math.floor(R() * 5), Y = 1 + Math.floor(R() * 5), Z = 1 + Math.floor(R() * 4);
    const n = X * Y * Z;
    const mines = Math.min(n, Math.floor(R() * Math.max(1, n / 4)) + (R() < 0.05 ? n : 0));
    const g = new Game(X, Y, Z, mines, mulberry32(s * 31));
    const mineIdx = [...g.number.keys()].filter((c) => g.number[c] === -1);
    const ng = new NaiveGame(X, Y, Z, mineIdx);
    for (let c = 0; c < n; c++) assert.equal(g.number[c], ng.cells[c].number);
    assertSame(g, ng, `seed ${s} init`);
    games++;
    for (let a = 0; a < 40; a++) {
      const c = Math.floor(R() * n), kind = R();
      // bias: avoid exploding too early by mostly clicking non-mines with left
      if (kind < 0.35) {
        if (g.number[c] === -1 && R() < 0.85) continue;
        g.leftClick(c); ng.frame(() => ng.leftClick(ng.cells[c]));
      } else if (kind < 0.75) {
        g.rightClick(c); ng.frame(() => ng.rightClick(ng.cells[c]));
      } else {
        g.chord(c); ng.frame(() => ng.leftRightClick(ng.cells[c]));
      }
      actions++;
      assertSame(g, ng, `seed ${s} action ${a}`);
      assert.equal(g.minesLeft, g.mines - g.flagCount);
    }
  }
  assert.ok(games === 400 && actions > 5000);
});

// ---------- performance ----------
test('performance: 100x100x100 with 1000 mines, construct + click a zero region < 2s', () => {
  const t0 = performance.now();
  const g = new Game(100, 100, 100, 1000, mulberry32(42));
  const t1 = performance.now();
  let z = -1;
  for (let c = 0; c < g.n; c++) if (g.number[c] === 0) { z = c; break; }
  const r = g.leftClick(z);
  const t2 = performance.now();
  assert.equal(r.exploded, false);
  assert.ok(r.revealed > 900000, `revealed ${r.revealed}`);
  assert.ok(t1 - t0 < 1000, `construct ${(t1 - t0).toFixed(0)}ms`);
  assert.ok(t2 - t0 < 2000, `total ${(t2 - t0).toFixed(0)}ms`);
  console.log(`perf: construct ${(t1 - t0).toFixed(0)}ms, click ${(t2 - t1).toFixed(0)}ms, revealed ${r.revealed}`);
  // mines == n on a large board stays fast (path-compressed probe)
  const t3 = performance.now();
  const f = new Game(100, 100, 100, 1000000, mulberry32(1));
  assert.equal(f.state, 'won');
  assert.ok(performance.now() - t3 < 2000);
});
