// Board metrics and click counts for one game over a cell graph (no DOM).
//
// 3BV is the fewest clicks that clear the board: each opening (a connected region of safe
// zero cells, joined through the graph's neighbours) counts once, and each safe cell outside
// every opening's reach (a number with no zero neighbour) counts once. createBoardMetrics
// computes it once the mines are placed and tracks 3BV solved as cells open: an opening is
// solved when every zero in it is open (a flag can hold one closed), a cell outside every
// opening when it opens. save() and restore() copy that progress out and back, for the rules
// engine's game snapshots.
//
// Click counts tally effective and wasted clicks per action kind. Which clicks count and which
// are wasted is the rule profile's `clickCounting` marker (js/engine/profiles.js); the rules
// engine (js/engine/rules.js) classifies each action and adds it here.

export const CLICK_KINDS = Object.freeze(['reveal', 'flag', 'chord']);

// Writes cell c's neighbours into `buf` in the graph's order and returns their count; one
// module-level collector keeps the graph's callback site monomorphic.
let fillBuf = null, fillLen = 0;
function collect(x) { fillBuf[fillLen++] = x; }
function fillNeighbours(graph, c, buf) {
  fillBuf = buf; fillLen = 0;
  graph.forEachNeighbour(c, collect);
  return fillLen;
}

// `mine` and `number` are the engine's flat per-cell arrays, with the mines already placed.
export function createBoardMetrics(graph, mine, number) {
  const n = graph.count;
  const opening = new Int32Array(n).fill(-1); // opening id of each safe zero cell
  const queue = new Int32Array(n);
  // One neighbour walk per cell into a buffer, not one graph call per neighbour slot.
  const nbBuf = new Int32Array(Math.max(1, graph.maxDegree));
  const fill = (c) => fillNeighbours(graph, c, nbBuf);
  const closedZeros = [];
  for (let s = 0; s < n; s++) {
    if (mine[s] || number[s] !== 0 || opening[s] >= 0) continue;
    const id = closedZeros.length;
    let head = 0, tail = 0, size = 0;
    opening[s] = id; queue[tail++] = s;
    while (head < tail) {
      const cur = queue[head++];
      size++;
      for (let k = 0, d = fill(cur); k < d; k++) {
        const nb = nbBuf[k];
        if (number[nb] === 0 && !mine[nb] && opening[nb] < 0) { opening[nb] = id; queue[tail++] = nb; }
      }
    }
    closedZeros.push(size);
  }
  const left = Int32Array.from(closedZeros);

  // Safe numbers with no zero neighbour: one click each.
  const isolated = new Uint8Array(n);
  let isolatedCount = 0;
  for (let c = 0; c < n; c++) {
    if (mine[c] || number[c] === 0) continue;
    let reached = false;
    for (let k = 0, d = fill(c); k < d && !reached; k++) reached = opening[nbBuf[k]] >= 0;
    if (!reached) { isolated[c] = 1; isolatedCount++; }
  }

  const bbbv = left.length + isolatedCount;
  let solved = 0;

  return {
    get bbbv() { return bbbv; },
    get solved() { return solved; },
    // A safe cell `c` has just opened.
    opened(c) {
      const id = opening[c];
      if (id >= 0) { if (--left[id] === 0) solved++; } else if (isolated[c]) solved++;
    },
    // The progress so far as a frozen copy, and setting it back to one of this board's copies.
    save() { return Object.freeze({ left: left.slice(), solved }); },
    restore(saved) { left.set(saved.left); solved = saved.solved; },
  };
}

// Effective and wasted clicks per kind; snapshot() is a frozen copy; save() and restore() copy
// the tally out and back.
export function createClickCounts() {
  const tally = new Uint32Array(CLICK_KINDS.length * 2);
  return {
    save() { return tally.slice(); },
    restore(saved) { tally.set(saved); },
    add(kind, wasted) {
      const k = CLICK_KINDS.indexOf(kind);
      if (k < 0) throw new RangeError(`unknown click kind "${kind}"`);
      tally[k * 2 + (wasted ? 1 : 0)]++;
    },
    snapshot() {
      const out = {};
      CLICK_KINDS.forEach((kind, k) => {
        out[kind] = Object.freeze({ effective: tally[k * 2], wasted: tally[k * 2 + 1] });
      });
      return Object.freeze(out);
    },
  };
}
