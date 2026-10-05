// Pure game-rules engine for Minesweeper 3D (no DOM, no three.js).
// Mirrors the original XNA game (Cell.cs / Grid.cs / Minesweeper.cs); see docs/ORIGINAL_SPEC.md.
//
// Index layout: idx = i + X*(j + Y*k). i is the fastest-varying axis, which is also the
// first axis of the original linear probe, so "probe to the next cell" == idx+1 (wrapping to 0).
//
// Decisions / deviations (behaviourally invisible to the player unless noted):
// - Unlinking is run to its fixed point immediately after every action (the original evaluated
//   it once per frame). Because `unlinked` is only ever set on pressed cells, the "every
//   neighbour is pressed/flagged/unlinked" test is equivalent to "pressed/flagged", so a cell
//   becoming unlinked never enables another one: the fixed point equals repeated full passes.
// - settle() order: unlink propagation first, then the win check. Once the game has ended,
//   unlinking stops (original: TryUnlink gated by !endGame) but unflag still relinks neighbours.
// - Actions stay allowed after the game ended, as in the original. Left-clicking an unflagged mine
//   after a win reveals the whole board (loss reveal) but `state` stays 'won' (original: endGame
//   and Win stay true). After a loss, every cell is pressed, so re-clicking a mine is a no-op
//   (the original re-threw and re-applied an identical reveal).
// - Win check uses live counters (the original used counts from the previous frame).

const OFFS = [];
for (let di = -1; di <= 1; di++)
  for (let dj = -1; dj <= 1; dj++)
    for (let dk = -1; dk <= 1; dk++)
      if (di || dj || dk) OFFS.push([di, dj, dk]);

export class Game {
  constructor(X, Y, Z, mines, rng = Math.random, minePositions = null) {
    for (const v of [X, Y, Z]) {
      if (!Number.isInteger(v) || v < 1) throw new RangeError('grid dimensions must be integers >= 1');
    }
    const n = X * Y * Z;
    if (minePositions) mines = minePositions.length;
    if (!Number.isInteger(mines) || mines < 0 || mines > n) throw new RangeError('mines must be an integer in 0..X*Y*Z');
    this.X = X; this.Y = Y; this.Z = Z; this.n = n; this.mines = mines;
    this._XY = X * Y;
    // Neighbour index deltas in original loop order (di outer, dk inner), plus per-axis offsets.
    this._od = new Int32Array(26 * 4);
    OFFS.forEach(([di, dj, dk], t) => {
      this._od[t * 4] = di; this._od[t * 4 + 1] = dj; this._od[t * 4 + 2] = dk;
      this._od[t * 4 + 3] = di + X * dj + this._XY * dk;
    });
    this._nbBuf = new Int32Array(26);
    this._nbBuf2 = new Int32Array(26);

    this.number = new Int8Array(n);
    this.pressed = new Uint8Array(n);
    this.flagged = new Uint8Array(n);
    this.unlinked = new Uint8Array(n);
    this._flagNb = new Uint8Array(n); // # flagged neighbours (checkMines in O(1))

    this.state = 'playing';
    this.explodedIdx = -1;
    this.flagCount = 0;
    this.unpressedCount = n;
    this._flaggedNonMine = 0;
    this.version = 0;
    this._mods = 0;

    this._dirtyList = new Int32Array(n); this._dirtyMark = new Uint8Array(n); this._dirtyLen = 0;
    this._pendList = new Int32Array(n); this._pendMark = new Uint8Array(n); this._pendLen = 0;
    this._workList = new Int32Array(n); this._workMark = new Uint8Array(n);
    this._stack = new Int32Array(n);

    // ---- mine placement ----
    const num = this.number;
    if (minePositions) {
      for (const m of minePositions) {
        if (!Number.isInteger(m) || m < 0 || m >= n) throw new RangeError('mine index out of range');
        if (num[m] === -1) throw new RangeError('duplicate mine index');
        num[m] = -1;
      }
    } else if (mines > 0) {
      // Original: pick (x,y,z) (in that rng order), then linear probe i++ -> j++ -> k++ with wrap.
      // In our layout this is idx+1 mod n; a path-compressed "next free" table makes it O(n α).
      const next = new Int32Array(n);
      for (let t = 0; t < n; t++) next[t] = t;
      const find = (s) => {
        let r = s;
        for (;;) {
          if (r === n) r = 0;
          if (next[r] === r) break;
          r = next[r];
        }
        // path compression
        let p = s === n ? 0 : s;
        while (p !== r) { const q = next[p]; next[p] = r; p = q === n ? 0 : q; }
        return r;
      };
      for (let m = 0; m < mines; m++) {
        const x = Math.min(X - 1, Math.floor(rng() * X));
        const y = Math.min(Y - 1, Math.floor(rng() * Y));
        const z = Math.min(Z - 1, Math.floor(rng() * Z));
        const free = find(x + X * (y + Y * z));
        num[free] = -1;
        next[free] = free + 1; // may be n -> wraps in find()
      }
    }
    // ---- numbers ----
    const buf = this._nbBuf;
    for (let c = 0; c < n; c++) {
      if (num[c] !== -1) continue;
      const cnt = this._fillNb(c, buf);
      for (let t = 0; t < cnt; t++) if (num[buf[t]] !== -1) num[buf[t]]++;
    }

    this._settle();
    this.version = 0;
    this._clearDirty();
  }

  // ---------- geometry ----------
  idx(i, j, k) { return i + this.X * (j + this.Y * k); }
  coords(idx) {
    const i = idx % this.X, r = (idx - i) / this.X, j = r % this.Y;
    return [i, j, (r - j) / this.Y];
  }
  /** Fills buf with neighbour indices (original adjacent[] loop order), returns count. */
  _fillNb(c, buf) {
    const X = this.X, Y = this.Y, Z = this.Z;
    const i = c % X, r = (c - i) / X, j = r % Y, k = (r - j) / Y;
    const od = this._od;
    let cnt = 0;
    if (i > 0 && j > 0 && k > 0 && i < X - 1 && j < Y - 1 && k < Z - 1) {
      for (let t = 0; t < 26; t++) buf[t] = c + od[t * 4 + 3];
      return 26;
    }
    for (let t = 0; t < 26; t++) {
      const a = i + od[t * 4], b = j + od[t * 4 + 1], d = k + od[t * 4 + 2];
      if (a < 0 || b < 0 || d < 0 || a >= X || b >= Y || d >= Z) continue;
      buf[cnt++] = c + od[t * 4 + 3];
    }
    return cnt;
  }
  neighbors(idx) {
    const buf = new Int32Array(26);
    const cnt = this._fillNb(idx, buf);
    return cnt === 26 ? buf : buf.slice(0, cnt);
  }

  get minesLeft() { return this.mines - this.flagCount; }

  // ---------- dirty tracking ----------
  _markDirty(c) {
    this._mods++;
    if (!this._dirtyMark[c]) { this._dirtyMark[c] = 1; this._dirtyList[this._dirtyLen++] = c; }
  }
  _pend(c) {
    if (!this._pendMark[c]) { this._pendMark[c] = 1; this._pendList[this._pendLen++] = c; }
  }
  _clearDirty() {
    const l = this._dirtyList, m = this._dirtyMark;
    for (let t = 0; t < this._dirtyLen; t++) m[l[t]] = 0;
    this._dirtyLen = 0;
  }
  /** Indices changed (pressed/flagged/unlinked) since last consumeDirty(). Copy (Int32Array). */
  get dirty() { return this._dirtyList.slice(0, this._dirtyLen); }
  consumeDirty() { const d = this.dirty; this._clearDirty(); return d; }

  // ---------- primitive mutations ----------
  _press(c) {
    this.pressed[c] = 1;
    this.unpressedCount--;
    this._markDirty(c);
    this._pend(c);
  }
  _flag(c) { // Cell.flag(): only if !pressed (callers check)
    this.flagged[c] = 1;
    this.flagCount++;
    if (this.number[c] !== -1) this._flaggedNonMine++;
    const buf = this._nbBuf2, cnt = this._fillNb(c, buf);
    for (let t = 0; t < cnt; t++) this._flagNb[buf[t]]++;
    this._markDirty(c);
    this._pend(c);
  }
  _unflag(c) { // Cell.unFlag(): clears flag and relinks all neighbours
    this.flagged[c] = 0;
    this.flagCount--;
    if (this.number[c] !== -1) this._flaggedNonMine--;
    const buf = this._nbBuf2, cnt = this._fillNb(c, buf);
    for (let t = 0; t < cnt; t++) {
      const nb = buf[t];
      this._flagNb[nb]--;
      if (this.unlinked[nb]) { this.unlinked[nb] = 0; this._markDirty(nb); }
    }
    this._markDirty(c);
    this._pend(c);
  }
  _explode(c) {
    if (this.state === 'playing') { this.state = 'lost'; this._mods++; }
    this.explodedIdx = c;
    const n = this.n, P = this.pressed, F = this.flagged, U = this.unlinked;
    for (let t = 0; t < n; t++) {
      if (!P[t] || F[t] || U[t]) { P[t] = 1; F[t] = 0; U[t] = 0; this._markDirty(t); }
    }
    this._mods++;
    this.flagCount = 0; this._flaggedNonMine = 0; this.unpressedCount = 0;
    this._flagNb.fill(0);
  }

  // ---------- rules ----------
  /** Cell.leftClick + flood fill (iterative). Returns true if exploded. */
  _leftClickCore(c, res) {
    if (this.flagged[c]) return false;
    const num = this.number[c];
    if (num === -1) {
      if (this.pressed[c]) return false; // only possible after a loss reveal: no-op
      this._press(c); res.revealed++;
      this._explode(c); res.exploded = true;
      return true;
    }
    if (!this.pressed[c]) { this._press(c); res.revealed++; }
    if (num === 0) return this._chordCore(c, res);
    return false;
  }
  /** Cell.leftRightClick, iterative over an explicit stack. Returns true if exploded. */
  _chordCore(c0, res) {
    const P = this.pressed, F = this.flagged, N = this.number, FN = this._flagNb;
    const stack = this._stack, buf = this._nbBuf;
    let sp = 0;
    stack[sp++] = c0;
    while (sp > 0) {
      const c = stack[--sp];
      // checkMines: true for mines, else flagged neighbours == number
      if (!P[c] || (N[c] >= 0 && FN[c] !== N[c])) continue;
      const cnt = this._fillNb(c, buf);
      for (let t = 0; t < cnt; t++) {
        const nb = buf[t];
        if (P[nb] || F[nb]) continue;
        this._press(nb); res.revealed++;
        if (N[nb] === -1) { this._explode(nb); res.exploded = true; return true; }
        if (N[nb] === 0) stack[sp++] = nb; // each cell is pressed once -> pushed at most once
      }
    }
    return false;
  }

  leftClick(idx) {
    const res = { exploded: false, revealed: 0 };
    const m = this._mods;
    this._leftClickCore(idx, res);
    this._settle();
    if (this._mods !== m) this.version++;
    return res;
  }

  chord(idx) {
    const res = { exploded: false, revealed: 0 };
    const m = this._mods;
    this._chordCore(idx, res);
    this._settle();
    if (this._mods !== m) this.version++;
    return res;
  }

  rightClick(idx) {
    const res = { flagged: 0, unflagged: 0 };
    const m = this._mods;
    if (!this.pressed[idx]) {
      if (!this.flagged[idx]) { this._flag(idx); res.flagged++; }
      else { this._unflag(idx); res.unflagged++; }
    } else {
      const buf = new Int32Array(26), cnt = this._fillNb(idx, buf);
      let allFlagged = true;
      for (let t = 0; t < cnt; t++) {
        const nb = buf[t];
        if (!this.pressed[nb] && !this.flagged[nb]) { allFlagged = false; this._flag(nb); res.flagged++; }
      }
      if (allFlagged) {
        for (let t = 0; t < cnt; t++) {
          const nb = buf[t];
          if (!this.pressed[nb]) { this._unflag(nb); res.unflagged++; }
        }
      }
    }
    this._settle();
    if (this._mods !== m) this.version++;
    return res;
  }

  /** Cell.TryUnlink for one cell (assumes state === 'playing'). */
  _tryUnlink(c) {
    if (!this.pressed[c] || this.flagged[c] || this.unlinked[c]) return;
    const num = this.number[c];
    if (num < 0 || this._flagNb[c] !== num) return; // checkMines must hold
    if (num > 0) {
      // every neighbour pressed or flagged (or unlinked, which implies pressed)
      const P = this.pressed, F = this.flagged, buf = this._nbBuf2;
      const cnt = this._fillNb(c, buf);
      for (let t = 0; t < cnt; t++) { const nb = buf[t]; if (!P[nb] && !F[nb]) return; }
    }
    this.unlinked[c] = 1;
    this._markDirty(c);
  }

  /** Public settle: runs _settle() and bumps version if anything changed. Returns that boolean. */
  settle() {
    const changed = this._settle();
    if (changed) this.version++;
    return changed;
  }

  /** Unlink propagation to a fixed point (only while playing), then the win check. */
  _settle() {
    const m = this._mods;
    const pl = this._pendList, pm = this._pendMark;
    if (this.state === 'playing') {
      const wl = this._workList, wm = this._workMark, buf = this._nbBuf;
      let wn = 0;
      for (let t = 0; t < this._pendLen; t++) {
        const c = pl[t]; pm[c] = 0;
        if (!wm[c]) { wm[c] = 1; wl[wn++] = c; }
        const cnt = this._fillNb(c, buf);
        for (let u = 0; u < cnt; u++) { const nb = buf[u]; if (!wm[nb]) { wm[nb] = 1; wl[wn++] = nb; } }
      }
      this._pendLen = 0;
      // Unlinking a (pressed) cell never changes another cell's condition, so one pass is the fixed point.
      for (let t = 0; t < wn; t++) { const c = wl[t]; wm[c] = 0; this._tryUnlink(c); }
    } else {
      for (let t = 0; t < this._pendLen; t++) pm[pl[t]] = 0;
      this._pendLen = 0;
    }
    if (this.state === 'playing' && this.unpressedCount === this.mines && this._flaggedNonMine === 0) {
      this.state = 'won';
      this._mods++;
    }
    return this._mods !== m;
  }
}

export function createGameFromMinePositions(X, Y, Z, mineIdxList) {
  return new Game(X, Y, Z, mineIdxList.length, Math.random, Array.from(mineIdxList));
}
