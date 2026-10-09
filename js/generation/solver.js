// Logic-only solver: plays a board from its first-click cell by deduction alone (no DOM).
//
// Its correctness is the no-guess promise: a board the solver clears never needs a guess.
// The solver never sees the mine set. It learns a cell's number only by opening it through an
// `open(c)` callback, and opens a cell only once it has deduced the cell is safe; a mine is
// known to it only once deduced. Works over any cell graph.
//
// Deduction runs in a fixed order, returning to the first stage after every deduction:
//   1. single — a number whose deduced mines equal it opens its other closed neighbours; a
//      number equal to its deduced mines plus its closed neighbours marks them all mines.
//   2. subset — pairs of numbers sharing closed neighbours: subset and overlapping-constraint
//      reasoning bounds the mines in the shared and the unshared cells of each pair.
//   3. global — the remaining-mine count over the frontier: each connected group of frontier
//      cells is enumerated exhaustively, and the groups' mine totals are combined with the
//      remaining-mine count and the closed cells off the frontier. A group whose enumeration
//      exceeds its node budget is treated as unconstrained, which can only lose deductions,
//      never make a wrong one.

const UNKNOWN = 0;
const SAFE = 1;
const MINE = 2;

// Enumeration nodes allowed per frontier group in the global stage.
const GROUP_BUDGET = 200000;

// solve({ graph, mines, firstClick }) → { cleared, unresolved, deductions }.
//   cleared     — true when every safe cell opens without a guess.
//   unresolved  — Int32Array, ascending: the cells neither opened nor deduced mines (empty
//                 when cleared).
//   deductions  — { single, subset, global }: how many cells each stage resolved (the
//                 first-click cell is not counted).
// Throws RangeError on a malformed request or a mine on the first-click cell.
export function solve({ graph, mines, firstClick } = {}) {
  if (!graph || !Number.isInteger(graph.count)) throw new RangeError('a cell graph is required');
  const n = graph.count;
  if (!mines || typeof mines.length !== 'number') throw new RangeError('a mine set is required');
  const isMine = new Uint8Array(n);
  for (const m of mines) {
    if (!Number.isInteger(m) || m < 0 || m >= n) throw new RangeError(`mine ${m} is out of range`);
    if (isMine[m]) throw new RangeError(`mine ${m} is listed twice`);
    isMine[m] = 1;
  }
  checkFirstClick(firstClick, n);
  if (isMine[firstClick]) throw new RangeError(`the first-click cell ${firstClick} holds a mine`);

  const open = (c) => {
    if (isMine[c]) throw new Error(`solver opened mine ${c}`);
    let k = 0;
    graph.forEachNeighbour(c, (d) => { k += isMine[d]; });
    return k;
  };
  return solveFrom({ graph, mineCount: mines.length, firstClick, open });
}

// solveFrom({ graph, mineCount, firstClick, open, groupBudget? }) — the solver itself, with the
// board behind `open(c)`, which returns the number of a safe cell. The solver calls it only on
// cells it has deduced safe, each at most once. Same result as solve(). groupBudget overrides
// the global stage's per-group enumeration budget.
export function solveFrom({ graph, mineCount, firstClick, open, groupBudget = GROUP_BUDGET } = {}) {
  if (!graph || !Number.isInteger(graph.count)) throw new RangeError('a cell graph is required');
  const n = graph.count;
  checkFirstClick(firstClick, n);
  if (!Number.isInteger(mineCount) || mineCount < 0 || mineCount > n - 1) {
    throw new RangeError(`mine count must be an integer 0 .. ${n - 1}`);
  }
  if (typeof open !== 'function') throw new RangeError('an open(cell) callback is required');
  if (!Number.isInteger(groupBudget) || groupBudget < 1) throw new RangeError('group budget must be an integer >= 1');

  const st = new Uint8Array(n); // UNKNOWN | SAFE | MINE
  const num = new Int16Array(n).fill(-1); // number of an opened cell, -1 while closed
  const mineNb = new Uint16Array(n); // deduced-mine neighbours
  const unkNb = new Uint16Array(n); // UNKNOWN neighbours
  for (let c = 0; c < n; c++) unkNb[c] = graph.degree(c);

  const toOpen = []; // cells deduced safe, not yet opened
  const work = []; // opened cells whose single-cell rule should be (re)checked
  const deductions = { single: 0, subset: 0, global: 0 };
  const safeTotal = n - mineCount;
  let opened = 0;
  let minesFound = 0;

  const inconsistent = () => { throw new Error('the board contradicts its numbers'); };

  const markSafe = (c, stage) => {
    if (st[c] === SAFE) return;
    if (st[c] === MINE) inconsistent();
    st[c] = SAFE;
    if (stage) deductions[stage]++;
    graph.forEachNeighbour(c, (d) => {
      unkNb[d]--;
      if (num[d] >= 0) work.push(d);
    });
    toOpen.push(c);
  };

  const markMine = (c, stage) => {
    if (st[c] === MINE) return;
    if (st[c] === SAFE) inconsistent();
    st[c] = MINE;
    minesFound++;
    deductions[stage]++;
    graph.forEachNeighbour(c, (d) => {
      unkNb[d]--;
      mineNb[d]++;
      if (num[d] >= 0) work.push(d);
    });
  };

  const unknownNeighbours = (c) => {
    const out = [];
    graph.forEachNeighbour(c, (d) => { if (st[d] === UNKNOWN) out.push(d); });
    return out;
  };

  // Stage 1, run to a standstill: open what is deduced safe and apply the single-cell rules.
  const drain = () => {
    while (toOpen.length || work.length) {
      while (toOpen.length) {
        const c = toOpen.pop();
        const k = open(c);
        if (!Number.isInteger(k) || k < 0 || k > graph.degree(c)) {
          throw new RangeError(`open(${c}) returned ${k}, not a number 0 .. ${graph.degree(c)}`);
        }
        num[c] = k;
        opened++;
        work.push(c);
      }
      while (work.length) {
        const c = work.pop();
        if (unkNb[c] === 0) continue;
        const r = num[c] - mineNb[c];
        if (r < 0 || r > unkNb[c]) inconsistent();
        if (r === 0) for (const d of unknownNeighbours(c)) markSafe(d, 'single');
        else if (r === unkNb[c]) for (const d of unknownNeighbours(c)) markMine(d, 'single');
      }
    }
  };

  // The current constraints: per opened cell with closed neighbours, those cells and the
  // mines left among them.
  const constraints = () => {
    const list = [];
    for (let c = 0; c < n; c++) {
      if (num[c] >= 0 && unkNb[c] > 0) list.push({ cells: unknownNeighbours(c), rem: num[c] - mineNb[c] });
    }
    return list;
  };

  // Deductions found against one snapshot of the constraints are applied together.
  const apply = (safe, mine, stage) => {
    let changed = false;
    for (const c of safe) if (st[c] === UNKNOWN) { markSafe(c, stage); changed = true; }
    for (const c of mine) if (st[c] === UNKNOWN) { markMine(c, stage); changed = true; }
    return changed;
  };

  // Membership marks for the pair under test; each A and each B takes a fresh tick, so no
  // mark survives into another pair or another pass.
  const markA = new Float64Array(n);
  const markB = new Float64Array(n);
  let tick = 0;

  // Stage 2: subset and overlapping-constraint reasoning between pairs of numbers.
  const subsetStep = () => {
    const cons = constraints();
    const byCell = new Map();
    cons.forEach((k, i) => {
      for (const c of k.cells) {
        let l = byCell.get(c);
        if (!l) byCell.set(c, (l = []));
        l.push(i);
      }
    });
    const safe = [], mine = [];
    const paired = new Int32Array(cons.length).fill(-1);
    for (let a = 0; a < cons.length; a++) {
      const A = cons[a];
      const ta = ++tick;
      for (const c of A.cells) markA[c] = ta;
      for (const c of A.cells) {
        for (const b of byCell.get(c)) {
          if (b <= a || paired[b] === a) continue;
          paired[b] = a;
          const B = cons[b];
          let common = 0;
          const tb = ++tick;
          for (const d of B.cells) { if (markA[d] === ta) common++; markB[d] = tb; }
          const aOnly = A.cells.length - common, bOnly = B.cells.length - common;
          const lo = Math.max(0, A.rem - aOnly, B.rem - bOnly);
          const hi = Math.min(common, A.rem, B.rem);
          if (lo > hi) inconsistent();
          const inA = (d) => markA[d] === ta;
          const inB = (d) => markB[d] === tb;
          // Mines in A's unshared cells range over [A.rem - hi, A.rem - lo]; likewise for B.
          if (aOnly > 0) {
            if (A.rem - lo === 0) for (const d of A.cells) { if (!inB(d)) safe.push(d); }
            else if (A.rem - hi === aOnly) for (const d of A.cells) { if (!inB(d)) mine.push(d); }
          }
          if (bOnly > 0) {
            if (B.rem - lo === 0) for (const d of B.cells) { if (!inA(d)) safe.push(d); }
            else if (B.rem - hi === bOnly) for (const d of B.cells) { if (!inA(d)) mine.push(d); }
          }
          if (common > 0 && lo === hi) {
            const target = lo === 0 ? safe : lo === common ? mine : null;
            if (target) for (const d of B.cells) if (inA(d)) target.push(d);
          }
        }
      }
    }
    return apply(safe, mine, 'subset');
  };

  // Stage 3: frontier enumeration with the remaining-mine count.
  const globalStep = () => {
    const cons = constraints();
    const remaining = mineCount - minesFound;
    // Frontier groups: cells joined by sharing a constraint (union-find over frontier cells).
    const parent = new Map();
    const find = (x) => {
      let r = x;
      while (parent.get(r) !== r) r = parent.get(r);
      while (parent.get(x) !== r) { const p = parent.get(x); parent.set(x, r); x = p; }
      return r;
    };
    for (const k of cons) {
      for (const c of k.cells) if (!parent.has(c)) parent.set(c, c);
      for (let i = 1; i < k.cells.length; i++) {
        const ra = find(k.cells[0]), rb = find(k.cells[i]);
        if (ra !== rb) parent.set(rb, ra);
      }
    }
    let interior = 0;
    for (let c = 0; c < n; c++) if (st[c] === UNKNOWN && !parent.has(c)) interior++;

    const groupOf = new Map();
    const groups = [];
    for (const c of parent.keys()) {
      const r = find(c);
      let g = groupOf.get(r);
      if (g === undefined) { g = groups.length; groupOf.set(r, g); groups.push({ cells: [], cons: [] }); }
      groups[g].cells.push(c);
    }
    for (const k of cons) groups[groupOf.get(find(k.cells[0]))].cons.push(k);
    const results = groups.map((g) => enumerate(g, remaining, groupBudget));

    // Totals the frontier can take that leave 0 .. interior mines for the cells off it.
    const lo = remaining - interior;
    let minSum = 0, maxSum = 0;
    for (const r of results) { minSum += r.minK; maxSum += r.maxK; }
    const allFree = minSum >= lo && maxSum <= remaining;
    const sumsWithout = allFree ? null : sumsExcluding(results, remaining);

    const safe = [], mine = [];
    results.forEach((r, j) => {
      const size = r.cells.length;
      const canMine = new Uint8Array(size), canSafe = new Uint8Array(size);
      for (let k = r.minK; k <= r.maxK; k++) {
        if (!r.ways[k]) continue;
        if (!allFree) {
          const others = sumsWithout[j];
          let ok = false;
          for (let s = Math.max(0, lo - k); s <= remaining - k; s++) if (others[s]) { ok = true; break; }
          if (!ok) continue;
        }
        for (let i = 0; i < size; i++) {
          if (r.canMine[k][i]) canMine[i] = 1;
          if (r.canSafe[k][i]) canSafe[i] = 1;
        }
      }
      for (let i = 0; i < size; i++) {
        if (!canMine[i] && !canSafe[i]) inconsistent();
        if (!canMine[i]) safe.push(r.cells[i]);
        else if (!canSafe[i]) mine.push(r.cells[i]);
      }
    });
    if (interior > 0) {
      const all = sumsExcluding(results, remaining, true);
      let any = false, onlyFull = true, onlyEmpty = true;
      for (let s = Math.max(0, lo); s <= remaining; s++) {
        if (!all[s]) continue;
        any = true;
        if (remaining - s !== 0) onlyEmpty = false;
        if (remaining - s !== interior) onlyFull = false;
      }
      if (!any) inconsistent();
      if (onlyEmpty || onlyFull) {
        const target = onlyEmpty ? safe : mine;
        for (let c = 0; c < n; c++) if (st[c] === UNKNOWN && !parent.has(c)) target.push(c);
      }
    }
    return apply(safe, mine, 'global');
  };

  drain();
  markSafe(firstClick, null);
  drain();
  while (opened < safeTotal) {
    if (subsetStep() || globalStep()) { drain(); continue; }
    break;
  }

  const cleared = opened === safeTotal;
  const unresolved = [];
  if (!cleared) for (let c = 0; c < n; c++) if (st[c] === UNKNOWN) unresolved.push(c);
  return { cleared, unresolved: Int32Array.from(unresolved), deductions };
}

function checkFirstClick(firstClick, n) {
  if (!Number.isInteger(firstClick) || firstClick < 0 || firstClick >= n) {
    throw new RangeError(`first-click cell ${firstClick} is out of range`);
  }
}

// Exhaustive enumeration of one frontier group. Returns, per mine total k of the group,
// whether any assignment has it (ways[k]) and which cells can be a mine or safe in one.
// Over budget, the group is reported as unconstrained (every total, every cell either way).
function enumerate(group, remaining, budget) {
  const cells = order(group);
  const size = cells.length;
  const index = new Map(cells.map((c, i) => [c, i]));
  const cons = group.cons.map((k) => ({ rem: k.rem, left: k.cells.length }));
  const cellCons = cells.map(() => []);
  group.cons.forEach((k, ci) => { for (const c of k.cells) cellCons[index.get(c)].push(ci); });

  const maxK = Math.min(size, remaining);
  const ways = new Uint8Array(maxK + 1);
  const canMine = Array.from({ length: maxK + 1 }, () => new Uint8Array(size));
  const canSafe = Array.from({ length: maxK + 1 }, () => new Uint8Array(size));
  const value = new Uint8Array(size);
  let nodes = 0;
  let over = false;

  const assign = (i, v) => {
    let ok = true;
    for (const ci of cellCons[i]) {
      const k = cons[ci];
      k.left--;
      k.rem -= v;
      if (k.rem < 0 || k.rem > k.left) ok = false;
    }
    return ok;
  };
  const unassign = (i, v) => {
    for (const ci of cellCons[i]) { cons[ci].left++; cons[ci].rem += v; }
  };
  const walk = (i, k) => {
    if (over) return;
    if (++nodes > budget) { over = true; return; }
    if (i === size) {
      ways[k] = 1;
      const m = canMine[k], s = canSafe[k];
      for (let j = 0; j < size; j++) { if (value[j]) m[j] = 1; else s[j] = 1; }
      return;
    }
    for (let v = 0; v <= 1; v++) {
      if (k + v > maxK) break;
      value[i] = v;
      if (assign(i, v)) walk(i + 1, k + v);
      unassign(i, v);
    }
  };
  walk(0, 0);

  if (over) {
    ways.fill(1);
    for (let k = 0; k <= maxK; k++) { canMine[k].fill(1); canSafe[k].fill(1); }
  }
  let minK = 0, maxFound = -1;
  while (minK <= maxK && !ways[minK]) minK++;
  for (let k = maxK; k >= 0; k--) if (ways[k]) { maxFound = k; break; }
  if (maxFound < 0) throw new Error('the board contradicts its numbers');
  return { cells, ways, canMine, canSafe, minK, maxK: maxFound };
}

// Breadth-first order through shared constraints, so each constraint closes early and prunes.
function order(group) {
  const byCell = new Map();
  for (const k of group.cons) for (const c of k.cells) {
    let l = byCell.get(c);
    if (!l) byCell.set(c, (l = []));
    l.push(k);
  }
  const seen = new Set([group.cells[0]]);
  const out = [group.cells[0]];
  for (let i = 0; i < out.length; i++) {
    for (const k of byCell.get(out[i])) for (const d of k.cells) {
      if (!seen.has(d)) { seen.add(d); out.push(d); }
    }
  }
  return out;
}

// Achievable frontier mine totals (0 .. cap) of every group but one (one array per group), or,
// with whole, of all groups together.
function sumsExcluding(results, cap, whole = false) {
  const add = (set, r) => {
    const out = new Uint8Array(cap + 1);
    for (let s = 0; s <= cap; s++) {
      if (!set[s]) continue;
      for (let k = r.minK; k <= r.maxK && s + k <= cap; k++) if (r.ways[k]) out[s + k] = 1;
    }
    return out;
  };
  const start = new Uint8Array(cap + 1);
  start[0] = 1;
  if (whole) return results.reduce(add, start);
  const m = results.length;
  const prefix = [start];
  for (let j = 0; j < m; j++) prefix.push(add(prefix[j], results[j]));
  const suffix = new Array(m + 1);
  suffix[m] = start;
  for (let j = m - 1; j >= 0; j--) suffix[j] = add(suffix[j + 1], results[j]);
  return results.map((_, j) => {
    const out = new Uint8Array(cap + 1);
    for (let a = 0; a <= cap; a++) {
      if (!prefix[j][a]) continue;
      for (let b = 0; a + b <= cap; b++) if (suffix[j + 1][b]) out[a + b] = 1;
    }
    return out;
  });
}
