// Board metrics and click counts for one game over a cell graph (no DOM).
//
// 3BV is the fewest clicks that clear the board: each opening (a connected region of safe
// zero cells, joined through the graph's neighbours) counts once, and each safe cell outside
// every opening's reach (a number with no zero neighbour) counts once. createBoardMetrics
// computes it once the mines are placed and tracks 3BV solved as cells open: an opening is
// solved when every zero in it is open (a flag can hold one closed), a cell outside every
// opening when it opens. save() and restore() copy that progress out and back, for the rules
// engine's game snapshots. bbbvPartition is that definition as a per-cell region label, which
// createBoardMetrics counts and the replay viewer's Show 3BV paints.
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

// The board's 3BV partition, its regions as a per-cell label: each opening is one region (its safe
// zero cells and the safe numbers bordering it — a number bordering several openings takes the
// lowest), each safe number outside every opening's reach (an isolated number) is a region of its
// own. `label` holds an opening's id (0 .. openings - 1), an isolated number's id (openings ..
// bbbv - 1), or -1 for a mine. `zeros` is the number of zero cells in each opening. `mine` and
// `number` are the engine's flat per-cell arrays, with the mines already placed.
export function bbbvPartition(graph, mine, number) {
  const n = graph.count;
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  // One neighbour walk per cell into a buffer, not one graph call per neighbour slot.
  const nbBuf = new Int32Array(Math.max(1, graph.maxDegree));
  const fill = (c) => fillNeighbours(graph, c, nbBuf);
  const zeros = [];
  for (let s = 0; s < n; s++) {
    if (mine[s] || number[s] !== 0 || label[s] >= 0) continue;
    const id = zeros.length;
    let head = 0, tail = 0, size = 0;
    label[s] = id; queue[tail++] = s;
    while (head < tail) {
      const cur = queue[head++];
      size++;
      for (let k = 0, d = fill(cur); k < d; k++) {
        const nb = nbBuf[k];
        if (number[nb] === 0 && !mine[nb] && label[nb] < 0) { label[nb] = id; queue[tail++] = nb; }
      }
    }
    zeros.push(size);
  }
  const openings = zeros.length;
  let isolated = 0;
  for (let c = 0; c < n; c++) {
    if (mine[c] || number[c] === 0) continue;
    let near = -1;
    for (let k = 0, d = fill(c); k < d; k++) {
      const nb = nbBuf[k];
      if (!mine[nb] && number[nb] === 0 && (near < 0 || label[nb] < near)) near = label[nb];
    }
    label[c] = near >= 0 ? near : openings + isolated++;
  }
  return Object.freeze({ label, openings, isolated, bbbv: openings + isolated, zeros: Int32Array.from(zeros) });
}

// `mine` and `number` are the engine's flat per-cell arrays, with the mines already placed.
export function createBoardMetrics(graph, mine, number) {
  const { label, openings, isolated: isolatedCount, zeros } = bbbvPartition(graph, mine, number);
  const left = zeros.slice();

  const bbbv = openings + isolatedCount;
  let solved = 0;

  return {
    get bbbv() { return bbbv; },
    get solved() { return solved; },
    // A safe cell `c` has just opened.
    opened(c) {
      const id = label[c];
      if (id < 0) return;
      if (id >= openings) solved++;
      else if (number[c] === 0 && --left[id] === 0) solved++;
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
