// Measures, for every preset, what the first click gives the player: how often it is an opening,
// how many cells it reveals, how many stay visible in 3D (auto-hide), the board's 3BV, and how
// far pure logic gets on a standard board (how often a standard board is in fact no-guess).
import { generate } from '/home/user/minesweeper-3d-web/js/generation/generate.js';
import { solve } from '/home/user/minesweeper-3d-web/js/generation/solver.js';
import { createGame, PHASE } from '/home/user/minesweeper-3d-web/js/engine/rules.js';
import { createSquareGrid } from '/home/user/minesweeper-3d-web/js/engine/square-grid.js';
import { createBoxGrid } from '/home/user/minesweeper-3d-web/js/engine/box-grid.js';
import { REFERENCE_PROFILE, PROFILE_3D } from '/home/user/minesweeper-3d-web/js/engine/profiles.js';

const PRESETS = [
  { name: '2D Beginner', kind: 'square', width: 9, height: 9, mines: 10 },
  { name: '2D Intermediate', kind: 'square', width: 16, height: 16, mines: 40 },
  { name: '2D Expert', kind: 'square', width: 30, height: 16, mines: 99 },
  { name: '3D Cube Beginner', kind: 'box', X: 6, Y: 6, Z: 6, mines: 10 },
  { name: '3D Cube Intermediate', kind: 'box', X: 8, Y: 8, Z: 8, mines: 40 },
  { name: '3D Cube Expert', kind: 'box', X: 12, Y: 12, Z: 8, mines: 130 },
];

const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

function build(p) {
  if (p.kind === 'square') {
    const g = createSquareGrid(p.width, p.height);
    const cells = p.width * p.height;
    const centre = g.index ? g.index(Math.floor(p.width / 2), Math.floor(p.height / 2)) : Math.floor(p.height / 2) * p.width + Math.floor(p.width / 2);
    return { graph: g.graph, cells, centre, corner: 0, desc: { kind: 'square', width: p.width, height: p.height }, profile: REFERENCE_PROFILE, dims: { width: p.width, height: p.height }, box: null };
  }
  const b = createBoxGrid(p.X, p.Y, p.Z);
  const cells = p.X * p.Y * p.Z;
  const centre = b.index(Math.floor(p.X / 2), Math.floor(p.Y / 2), Math.floor(p.Z / 2));
  // The camera starts outside the box looking at a face: the natural first click is a face-centre cell.
  const face = b.index(Math.floor(p.X / 2), Math.floor(p.Y / 2), p.Z - 1);
  return { graph: b.graph, cells, centre, corner: 0, face, desc: { kind: 'box', X: p.X, Y: p.Y, Z: p.Z }, profile: PROFILE_3D, dims: { width: p.X, height: p.Y, depth: p.Z }, box: b };
}

function firstClickStats(p, b, firstClick, noGuess, seeds) {
  const opening = [], revealedN = [], visibleN = [], bbbv = [], cleared = [], unresolvedFrac = [], cand = [], ms = [], maxNum = [], visibleNumbers = [];
  let fails = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const r = generate({ graph: b.desc, mineCount: p.mines, firstClick, noGuess, seed: seed * 7919 + 13 });
    ms.push(performance.now() - t0);
    if (!r.ok) { fails++; continue; }
    if (noGuess) cand.push(r.candidates);
    const game = createGame({ graph: b.graph, profile: b.profile, mineCount: p.mines, dimensions: b.dims });
    const res = game.supplyBoard(firstClick, r.mines);
    const st = game.state;
    const n = b.cells;
    let rev = 0, vis = 0, nums = 0, mx = 0;
    for (let c = 0; c < n; c++) {
      if (st.revealed[c]) {
        rev++;
        if (!(st.hidden && st.hidden[c])) { vis++; if (st.number[c] > 0) nums++; }
      }
      if (!st.mine[c] && st.number[c] > mx) mx = st.number[c];
    }
    opening.push(st.number[firstClick] === 0 ? 1 : 0);
    revealedN.push(rev);
    visibleN.push(vis);
    visibleNumbers.push(nums);
    maxNum.push(mx);
    const summary = game.counts ? game.counts() : null;
    if (summary && summary.bbbv !== undefined) bbbv.push(summary.bbbv);
    else if (summary && summary['3bv'] !== undefined) bbbv.push(summary['3bv']);
    if (!noGuess) {
      const s = solve({ graph: b.graph, mines: r.mines, firstClick });
      cleared.push(s.cleared ? 1 : 0);
      unresolvedFrac.push(s.unresolved.length / (n - p.mines));
    }
  }
  return {
    fails,
    openingRate: mean(opening),
    revealed: { mean: mean(revealedN), median: q(revealedN, 0.5), p10: q(revealedN, 0.1), p90: q(revealedN, 0.9) },
    visible: { mean: mean(visibleN), median: q(visibleN, 0.5) },
    visibleNumbers: { mean: mean(visibleNumbers), median: q(visibleNumbers, 0.5) },
    bbbv: bbbv.length ? { mean: mean(bbbv), median: q(bbbv, 0.5) } : null,
    maxNumber: { median: q(maxNum, 0.5), max: Math.max(...maxNum) },
    standardIsNoGuess: cleared.length ? mean(cleared) : null,
    unresolvedFrac: unresolvedFrac.length ? { mean: mean(unresolvedFrac), median: q(unresolvedFrac, 0.5) } : null,
    candidates: cand.length ? { median: q(cand, 0.5), p90: q(cand, 0.9), worst: Math.max(...cand) } : null,
    ms: { median: q(ms, 0.5), p90: q(ms, 0.9), worst: Math.max(...ms) },
  };
}

const seeds = Number(process.argv[2] ?? 100);
for (const p of PRESETS) {
  const b = build(p);
  const density = p.mines / b.cells;
  const deg = p.kind === 'square' ? 8 : 26;
  console.log(`\n=== ${p.name}: ${b.cells} cells, ${p.mines} mines, density ${(density * 100).toFixed(2)} %, expected neighbours mined (interior) ${(density * deg).toFixed(2)}, P(zero | interior) ${(Math.pow(1 - density, deg) * 100).toFixed(1)} %`);
  // Number distribution for an interior safe cell (binomial approximation, 26 or 8 neighbours).
  const spots = p.kind === 'square' ? [['centre', b.centre], ['corner', b.corner]] : [['face-centre', b.face], ['corner', b.corner], ['centre', b.centre]];
  for (const [label, fc] of spots) {
    for (const noGuess of [false, true]) {
      const s = firstClickStats(p, b, fc, noGuess, seeds);
      console.log(`  first click ${label.padEnd(12)} ${noGuess ? 'no-guess' : 'standard'}: opening ${(s.openingRate * 100).toFixed(0)} %, revealed med ${s.revealed.median} (p10 ${s.revealed.p10}, p90 ${s.revealed.p90}), visible med ${s.visible.median}, visible numbers med ${s.visibleNumbers.median}, 3BV med ${s.bbbv?.median}, max number med/max ${s.maxNumber.median}/${s.maxNumber.max}` +
        (s.standardIsNoGuess !== null ? `, standard board solvable by logic ${(s.standardIsNoGuess * 100).toFixed(0)} %, unresolved by logic med ${(s.unresolvedFrac.median * 100).toFixed(0)} %` : '') +
        (s.candidates ? `, candidates med/p90/worst ${s.candidates.median}/${s.candidates.p90}/${s.candidates.worst}` : '') +
        `, gen ms med/p90/worst ${s.ms.median.toFixed(1)}/${s.ms.p90.toFixed(1)}/${s.ms.worst.toFixed(0)}` + (s.fails ? `, FAILS ${s.fails}` : ''));
    }
  }
}
