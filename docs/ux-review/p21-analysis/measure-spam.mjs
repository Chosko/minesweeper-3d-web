// P-21 analysis: what a blind "spam player" achieves with the anti-chord, with the current
// flag-all rule, and with alternative B, against a trivial-logic solver and the game's full solver.
// Uses the game's own engine, generator and solver. Usage: node measure-spam.mjs [seeds] [presetFilter]
import { generate } from '/home/user/minesweeper-3d-web/js/generation/generate.js';
import { solve } from '/home/user/minesweeper-3d-web/js/generation/solver.js';
import { createGame, PHASE } from '/home/user/minesweeper-3d-web/js/engine/rules.js';
import { createSquareGrid } from '/home/user/minesweeper-3d-web/js/engine/square-grid.js';
import { createBoxGrid } from '/home/user/minesweeper-3d-web/js/engine/box-grid.js';
import { REFERENCE_PROFILE, PROFILE_3D } from '/home/user/minesweeper-3d-web/js/engine/profiles.js';

const PRESETS = [
  { name: 'Cube Beginner 6x6x6/10', kind: 'box', X: 6, Y: 6, Z: 6, mines: 10 },
  { name: 'Cube Beginner re-tune 6x6x6/16', kind: 'box', X: 6, Y: 6, Z: 6, mines: 16 },
  { name: 'Cube Intermediate 8x8x8/40', kind: 'box', X: 8, Y: 8, Z: 8, mines: 40 },
  { name: 'Cube re-tune 10x10x10/100', kind: 'box', X: 10, Y: 10, Z: 10, mines: 100 },
  { name: 'Cube Expert 12x12x8/130', kind: 'box', X: 12, Y: 12, Z: 8, mines: 130 },
  { name: '2D Expert 30x16/99', kind: 'square', width: 30, height: 16, mines: 99 },
];

const q = (arr, p) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;
const pct = (x) => `${(x * 100).toFixed(0)} %`;
const pct1 = (x) => `${(x * 100).toFixed(1)} %`;

function build(p) {
  if (p.kind === 'square') {
    const g = createSquareGrid(p.width, p.height);
    return { graph: g.graph, cells: p.width * p.height, first: g.index(Math.floor(p.width / 2), Math.floor(p.height / 2)),
      desc: { kind: 'square', width: p.width, height: p.height }, profile: REFERENCE_PROFILE, dims: { width: p.width, height: p.height }, is3d: false };
  }
  const b = createBoxGrid(p.X, p.Y, p.Z);
  // The camera starts outside the box looking at a face: the natural first click is a face-centre cell.
  return { graph: b.graph, cells: p.X * p.Y * p.Z, first: b.index(Math.floor(p.X / 2), Math.floor(p.Y / 2), p.Z - 1),
    desc: { kind: 'box', X: p.X, Y: p.Y, Z: p.Z }, profile: PROFILE_3D, dims: { width: p.X, height: p.Y, depth: p.Z }, is3d: true };
}

function newGame(b, mines, first, mineCount) {
  const game = createGame({ graph: b.graph, profile: b.profile, mineCount, dimensions: b.dims });
  game.supplyBoard(first, mines);
  return game;
}

// Neighbour tallies of a revealed cell: closed-unflagged and flagged.
function tally(graph, st, c) {
  let closed = 0, flags = 0;
  graph.forEachNeighbour(c, (nb) => { if (st.flagged[nb]) flags++; else if (!st.revealed[nb]) closed++; });
  return { closed, flags };
}

const visibleNumbers = (b, game) => {
  const st = game.state, out = [];
  for (let c = 0; c < b.cells; c++) if (st.revealed[c] && !st.hidden[c] && st.number[c] > 0) out.push(c);
  return out;
};
const revealedCount = (b, game) => { let r = 0; const st = game.state; for (let c = 0; c < b.cells; c++) r += st.revealed[c]; return r; };
const flagStats = (b, game) => { let wrong = 0, right = 0; const st = game.state; for (let c = 0; c < b.cells; c++) if (st.flagged[c]) { if (st.mine[c]) right++; else wrong++; } return { wrong, right }; };

// Flags every closed, unflagged neighbour of revealed c. In 3D through the engine's own
// flag-on-a-number action (faithful: one flag click, auto-hide follows); in 2D the reference
// profile has no such action, so each neighbour is flagged by hand.
function flagAll(b, game, c) {
  if (b.is3d) return game.toggleFlag(c);
  const st = game.state, list = [];
  game.graph.forEachNeighbour(c, (nb) => { if (!st.revealed[nb] && !st.flagged[nb]) list.push(nb); });
  for (const nb of list) game.toggleFlag(nb);
  return { changed: list };
}

// The spam player. mode: 'anti' (gated flag-all = anti-chord), 'current' (unconditional flag-all /
// unflag-all, the rule today), 'B' (unconditional flag-all; a second right-click removes only the
// flags that number's own right-click added), 'chord' (chord only, no flagging — 2D today).
// Each pass: for every visible number, the flag action, then chord. Until a pass changes nothing,
// the game ends, or the cap.
function spam(b, game, mode, cap = 200, twoPhase = false) {
  const graph = game.graph, st = game.state;
  const own = mode === 'B' ? new Map() : null;
  let passes = 0, chordsFired = 0, flagClicks = 0, flagsPlaced = 0, flagsRemoved = 0, wrongFlagClicks = 0;
  const safeBefore = revealedCount(b, game);
  for (;;) {
    if (passes >= cap) return { passes, capped: true, chordsFired, flagClicks, flagsPlaced, flagsRemoved, wrongFlagClicks };
    passes++;
    let changed = false;
    const vis = visibleNumbers(b, game);
    const steps = twoPhase ? [...vis.map((c) => [c, 0]), ...vis.map((c) => [c, 1])] : vis.map((c) => [c, 2]);
    for (const [c, phaseKind] of steps) {
      if (game.phase !== PHASE.PLAYING) break;
      if (!st.revealed[c] || st.hidden[c]) continue; // hidden by an earlier action this pass
      const t = tally(graph, st, c);
      if (phaseKind !== 1) {
      const remaining = st.number[c] - t.flags;
      if (mode === 'anti') {
        if (t.closed > 0 && t.closed === remaining) {
          const r = flagAll(b, game, c); flagClicks++; flagsPlaced += t.closed; changed = true;
          if (t.closed !== remaining) wrongFlagClicks++;
        }
      } else if (mode === 'current') {
        if (t.closed > 0) {
          flagAll(b, game, c); flagClicks++; flagsPlaced += t.closed; changed = true;
          if (t.closed !== remaining) wrongFlagClicks++;
        } else {
          // flagAll on a number with nothing to flag unflags every closed neighbour (the engine's rule)
          const before = game.flagCount; game.toggleFlag(c); flagClicks++;
          const removed = before - game.flagCount; flagsRemoved += removed; if (removed) changed = true;
        }
      } else if (mode === 'B') {
        if (t.closed > 0) {
          const list = []; graph.forEachNeighbour(c, (nb) => { if (!st.revealed[nb] && !st.flagged[nb]) list.push(nb); });
          for (const nb of list) game.toggleFlag(nb);
          own.set(c, list); flagClicks++; flagsPlaced += list.length; changed = true;
          if (t.closed !== remaining) wrongFlagClicks++;
        } else if (own.has(c)) {
          let removed = 0;
          for (const nb of own.get(c)) if (st.flagged[nb] && !st.revealed[nb]) { game.toggleFlag(nb); removed++; }
          own.delete(c); flagClicks++; flagsRemoved += removed; if (removed) changed = true;
        }
      }
      }
      if (phaseKind === 0) continue;
      if (game.phase !== PHASE.PLAYING) break;
      if (!st.revealed[c] || st.hidden[c]) continue;
      const t2 = tally(graph, st, c);
      if (t2.flags === st.number[c] && t2.closed > 0) {
        const r = game.chord(c); chordsFired++; changed = true;
        if (game.phase !== PHASE.PLAYING) break;
      }
    }
    if (game.phase !== PHASE.PLAYING || !changed) return { passes, capped: false, chordsFired, flagClicks, flagsPlaced, flagsRemoved, wrongFlagClicks };
  }
}

// Trivial-only logic: single-constraint deductions over the mine set, independent of the engine.
// closed == remaining => all mines; remaining == 0 => all safe. Returns the safe cells opened.
function trivialSolve(graph, mines, first, n) {
  const isMine = new Uint8Array(n); for (const m of mines) isMine[m] = 1;
  const known = new Uint8Array(n); // 0 unknown, 1 open, 2 deduced mine
  const num = new Int16Array(n).fill(-1);
  const stack = [first];
  let opened = 0;
  const work = [];
  const openCell = (c) => {
    if (known[c]) return; known[c] = 1; opened++;
    let k = 0; graph.forEachNeighbour(c, (d) => { k += isMine[d]; }); num[c] = k;
    work.push(c);
    if (k === 0) graph.forEachNeighbour(c, (d) => { if (!known[d]) stack.push(d); });
    graph.forEachNeighbour(c, (d) => { if (num[d] >= 0) work.push(d); });
  };
  for (;;) {
    while (stack.length) openCell(stack.pop());
    if (!work.length) break;
    const c = work.pop();
    let closed = 0, mn = 0; const cl = [];
    graph.forEachNeighbour(c, (d) => { if (known[d] === 2) mn++; else if (!known[d]) { closed++; cl.push(d); } });
    if (!closed) continue;
    const rem = num[c] - mn;
    if (rem === 0) for (const d of cl) stack.push(d);
    else if (rem === closed) for (const d of cl) { known[d] = 2; graph.forEachNeighbour(d, (e) => { if (num[e] >= 0) work.push(e); }); }
  }
  return opened;
}

function run(p, noGuess, seeds) {
  const b = build(p);
  const safe = b.cells - p.mines;
  const A = { frac: [], solved: 0, passes: [], chords: [], flagClicks: [] };
  const C = { frac: [], lost: 0, solved: 0, capped: 0, wrongClicks: [], passes: [] };
  const B = { frac: [], lost: 0, solved: 0, capped: 0, passes: [] };
  const C2 = { frac: [], lost: 0, solved: 0, capped: 0, passes: [] };
  const B2 = { frac: [], lost: 0, solved: 0, capped: 0, passes: [] };
  const CH = { frac: [], solved: 0 };
  const T = { frac: [], cleared: 0, mismatch: 0 };
  const F = { cleared: 0, single: 0, subset: 0, global: 0, boardsNeedingMulti: 0, multiFrac: [] };
  const trap = { visibleNumbers: [], fireable: [], wrongPerClick: [], firstFrac: [] };
  let fails = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = generate({ graph: b.desc, mineCount: p.mines, firstClick: b.first, noGuess, seed: seed * 7919 + 13 });
    if (!r.ok) { fails++; continue; }
    const mines = r.mines;
    // After the first click: the trap's size and how often the anti-chord fires on first sight.
    {
      const g = newGame(b, mines, b.first, p.mines);
      const vis = visibleNumbers(b, g);
      trap.visibleNumbers.push(vis.length); trap.firstFrac.push(revealedCount(b, g) / safe);
      let fire = 0; const wrong = [];
      for (const c of vis) { const t = tally(g.graph, g.state, c); const rem = g.state.number[c] - t.flags; if (t.closed === rem) fire++; wrong.push(t.closed - rem); }
      if (vis.length) { trap.fireable.push(fire / vis.length); trap.wrongPerClick.push(mean(wrong)); }
    }
    // 1. Anti-chord spam.
    {
      const g = newGame(b, mines, b.first, p.mines);
      const s = spam(b, g, 'anti');
      const frac = revealedCount(b, g) / safe;
      A.frac.push(frac); if (g.phase === PHASE.WON) A.solved++; A.passes.push(s.passes); A.chords.push(s.chordsFired); A.flagClicks.push(s.flagClicks);
      if (g.phase === PHASE.LOST) throw new Error('anti-chord spam lost: impossible');
      // 3. Trivial solver, must match.
      const opened = trivialSolve(b.graph, mines, b.first, b.cells);
      T.frac.push(opened / safe); if (opened === safe) T.cleared++;
      if (opened !== revealedCount(b, g)) T.mismatch++;
    }
    // 2. Current rule spam.
    if (b.is3d) {
      const g = newGame(b, mines, b.first, p.mines);
      const s = spam(b, g, 'current');
      C.frac.push(revealedCount(b, g) / safe); if (g.phase === PHASE.LOST) C.lost++; if (g.phase === PHASE.WON) C.solved++; if (s.capped) C.capped++;
      C.wrongClicks.push(s.wrongFlagClicks); C.passes.push(s.passes);
      const g2 = newGame(b, mines, b.first, p.mines);
      const s2 = spam(b, g2, 'B');
      B.frac.push(revealedCount(b, g2) / safe); if (g2.phase === PHASE.LOST) B.lost++; if (g2.phase === PHASE.WON) B.solved++; if (s2.capped) B.capped++; B.passes.push(s2.passes);
      const g3 = newGame(b, mines, b.first, p.mines);
      const s3 = spam(b, g3, 'current', 200, true);
      C2.frac.push(revealedCount(b, g3) / safe); if (g3.phase === PHASE.LOST) C2.lost++; if (g3.phase === PHASE.WON) C2.solved++; if (s3.capped) C2.capped++; C2.passes.push(s3.passes);
      const g4 = newGame(b, mines, b.first, p.mines);
      const s4 = spam(b, g4, 'B', 200, true);
      B2.frac.push(revealedCount(b, g4) / safe); if (g4.phase === PHASE.LOST) B2.lost++; if (g4.phase === PHASE.WON) B2.solved++; if (s4.capped) B2.capped++; B2.passes.push(s4.passes);
    }
    // Chord-only spam (what 2D allows today, and what E gives 3D).
    {
      const g = newGame(b, mines, b.first, p.mines);
      spam(b, g, 'chord');
      CH.frac.push(revealedCount(b, g) / safe); if (g.phase === PHASE.WON) CH.solved++;
    }
    // Full solver.
    {
      const s = solve({ graph: b.graph, mines, firstClick: b.first });
      if (s.cleared) F.cleared++;
      F.single += s.deductions.single; F.subset += s.deductions.subset; F.global += s.deductions.global;
      const multi = s.deductions.subset + s.deductions.global;
      if (multi > 0) F.boardsNeedingMulti++;
      F.multiFrac.push(multi / Math.max(1, s.deductions.single + multi));
    }
  }
  const N = seeds - fails;
  const row = {
    preset: p.name, noGuess, N, fails, safe, cells: b.cells,
    firstClickFrac: mean(trap.firstFrac), visNums: q(trap.visibleNumbers, 0.5), fireable: mean(trap.fireable), wrongPerClick: mean(trap.wrongPerClick),
    anti: { meanFrac: mean(A.frac), medFrac: q(A.frac, 0.5), p10: q(A.frac, 0.1), p90: q(A.frac, 0.9), solved: A.solved / N, passes: q(A.passes, 0.5), passesMax: Math.max(...A.passes), chords: q(A.chords, 0.5), flagClicks: q(A.flagClicks, 0.5) },
    current: b.is3d ? { lost: C.lost / N, solved: C.solved / N, capped: C.capped / N, meanFrac: mean(C.frac), wrongClicks: q(C.wrongClicks, 0.5), passes: q(C.passes, 0.5) } : null,
    B: b.is3d ? { lost: B.lost / N, solved: B.solved / N, capped: B.capped / N, meanFrac: mean(B.frac), passes: q(B.passes, 0.5) } : null,
    current2: b.is3d ? { lost: C2.lost / N, solved: C2.solved / N, capped: C2.capped / N, meanFrac: mean(C2.frac), passes: q(C2.passes, 0.5) } : null,
    B2: b.is3d ? { lost: B2.lost / N, solved: B2.solved / N, capped: B2.capped / N, meanFrac: mean(B2.frac), passes: q(B2.passes, 0.5) } : null,
    chordOnly: { meanFrac: mean(CH.frac), solved: CH.solved / N },
    trivial: { meanFrac: mean(T.frac), cleared: T.cleared / N, mismatch: T.mismatch },
    full: { cleared: F.cleared / N, multiShare: (F.subset + F.global) / Math.max(1, F.single + F.subset + F.global), boardsNeedingMulti: F.boardsNeedingMulti / N, medMultiFrac: q(F.multiFrac, 0.5) },
  };
  return row;
}

const seeds = Number(process.argv[2] ?? 100);
const filter = process.argv[3] ?? '';
const rows = [];
for (const p of PRESETS) {
  if (filter && !p.name.includes(filter)) continue;
  for (const noGuess of [false, true]) {
    const t0 = performance.now();
    const r = run(p, noGuess, seeds);
    rows.push(r);
    console.error(`${p.name} ${noGuess ? 'no-guess' : 'standard'}: ${(performance.now() - t0).toFixed(0)} ms`);
    console.log(`\n=== ${r.preset} — ${noGuess ? 'NO-GUESS' : 'STANDARD'} (${r.N} boards${r.fails ? `, ${r.fails} generation failures` : ''}; ${r.cells} cells, ${r.safe} safe)`);
    console.log(`  first click reveals ${pct(r.firstClickFrac)} of safe cells; visible numbers after it (median) ${r.visNums}; anti-chord fires on ${pct(r.fireable)} of them at once; a flag-all right-click on one of them places ${r.wrongPerClick.toFixed(1)} wrong flags on average`);
    console.log(`  ANTI-CHORD spam: revealed when stuck mean ${pct(r.anti.meanFrac)} (median ${pct(r.anti.medFrac)}, p10 ${pct(r.anti.p10)}, p90 ${pct(r.anti.p90)}); boards fully solved ${pct(r.anti.solved)}; passes median ${r.anti.passes} (max ${r.anti.passesMax}); chords fired median ${r.anti.chords}; auto-flag clicks median ${r.anti.flagClicks}`);
    if (r.current) console.log(`  CURRENT-RULE spam: lost ${pct(r.current.lost)}, solved ${pct(r.current.solved)}, oscillating at cap ${pct(r.current.capped)}, revealed mean ${pct(r.current.meanFrac)}, wrong-flag clicks median ${r.current.wrongClicks}, passes median ${r.current.passes}`);
    if (r.B) console.log(`  ALTERNATIVE-B spam: lost ${pct(r.B.lost)}, solved ${pct(r.B.solved)}, oscillating at cap ${pct(r.B.capped)}, revealed mean ${pct(r.B.meanFrac)}, passes median ${r.B.passes}`);
    if (r.current2) console.log(`  CURRENT-RULE spam, two-phase (all right-clicks, then all chords): lost ${pct(r.current2.lost)}, solved ${pct(r.current2.solved)}, oscillating at cap ${pct(r.current2.capped)}, revealed mean ${pct(r.current2.meanFrac)}, passes median ${r.current2.passes}`);
    if (r.B2) console.log(`  ALTERNATIVE-B spam, two-phase: lost ${pct(r.B2.lost)}, solved ${pct(r.B2.solved)}, oscillating at cap ${pct(r.B2.capped)}, revealed mean ${pct(r.B2.meanFrac)}, passes median ${r.B2.passes}`);
    console.log(`  CHORD-ONLY spam (no flags): revealed mean ${pct(r.chordOnly.meanFrac)}, solved ${pct(r.chordOnly.solved)}`);
    console.log(`  TRIVIAL-LOGIC solver: resolved mean ${pct(r.trivial.meanFrac)}, cleared ${pct(r.trivial.cleared)}, boards differing from anti-chord spam: ${r.trivial.mismatch}`);
    console.log(`  FULL solver: cleared ${pct(r.full.cleared)}; deductions needing subset/global reasoning ${pct1(r.full.multiShare)} of all; boards needing at least one ${pct(r.full.boardsNeedingMulti)}; median per-board multi share ${pct1(r.full.medMultiFrac)}`);
  }
}
import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(rows, null, 1));
