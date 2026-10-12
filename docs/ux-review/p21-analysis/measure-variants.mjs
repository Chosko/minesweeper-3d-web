// Supplementary P-21 measurements: spam efficiency vs 3BV, flags per anti-chord click, and
// tighter anti-chord gates (variants for alternative D). No-guess and standard boards.
import { generate } from '/home/user/minesweeper-3d-web/js/generation/generate.js';
import { createGame, PHASE } from '/home/user/minesweeper-3d-web/js/engine/rules.js';
import { createBoxGrid } from '/home/user/minesweeper-3d-web/js/engine/box-grid.js';
import { PROFILE_3D } from '/home/user/minesweeper-3d-web/js/engine/profiles.js';

const PRESETS = [
  { name: 'Cube Beginner 6x6x6/10', X: 6, Y: 6, Z: 6, mines: 10 },
  { name: 'Cube Beginner re-tune 6x6x6/16', X: 6, Y: 6, Z: 6, mines: 16 },
  { name: 'Cube Intermediate 8x8x8/40', X: 8, Y: 8, Z: 8, mines: 40 },
  { name: 'Cube re-tune 10x10x10/100', X: 10, Y: 10, Z: 10, mines: 100 },
  { name: 'Cube Expert 12x12x8/130', X: 12, Y: 12, Z: 8, mines: 130 },
];
const q = (arr, p) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;
const pct = (x) => `${(x * 100).toFixed(0)} %`;

// gate(closed, remaining) decides whether the anti-chord fires (closed === remaining is always required).
const GATES = {
  'anti-chord (P-21)': () => true,
  'only 2+ flags': (closed) => closed >= 2,
  'only 3+ flags': (closed) => closed >= 3,
  'only <= 3 closed': (closed) => closed <= 3,
};

function spam(game, n, graph, gate) {
  const st = game.state;
  let passes = 0, flagClicks = 0, flagsPlaced = 0, chords = 0; const perClick = [];
  for (;;) {
    passes++;
    let changed = false;
    for (let c = 0; c < n; c++) {
      if (game.phase !== PHASE.PLAYING) break;
      if (!st.revealed[c] || st.hidden[c] || st.number[c] === 0) continue;
      let closed = 0, flags = 0;
      graph.forEachNeighbour(c, (nb) => { if (st.flagged[nb]) flags++; else if (!st.revealed[nb]) closed++; });
      const rem = st.number[c] - flags;
      if (closed > 0 && closed === rem && gate(closed, rem)) { game.toggleFlag(c); flagClicks++; flagsPlaced += closed; perClick.push(closed); flags += closed; closed = 0; changed = true; }
      if (game.phase !== PHASE.PLAYING || !st.revealed[c] || st.hidden[c]) continue;
      if (flags === st.number[c] && closed > 0) { game.chord(c); chords++; changed = true; }
    }
    if (game.phase !== PHASE.PLAYING || !changed) break;
  }
  return { passes, flagClicks, flagsPlaced, chords, perClick };
}

const seeds = Number(process.argv[2] ?? 100);
for (const p of PRESETS) {
  const box = createBoxGrid(p.X, p.Y, p.Z), graph = box.graph, n = graph.count, safe = n - p.mines;
  const first = box.index(Math.floor(p.X / 2), Math.floor(p.Y / 2), p.Z - 1);
  for (const noGuess of [false, true]) {
    console.log(`\n=== ${p.name} — ${noGuess ? 'NO-GUESS' : 'STANDARD'}`);
    for (const [label, gate] of Object.entries(GATES)) {
      const frac = [], solved = [], eff = [], perClick = [], clicksPerMine = [], bbbvs = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const r = generate({ graph: { kind: 'box', X: p.X, Y: p.Y, Z: p.Z }, mineCount: p.mines, firstClick: first, noGuess, seed: seed * 7919 + 13 });
        if (!r.ok) continue;
        const game = createGame({ graph, profile: PROFILE_3D, mineCount: p.mines, dimensions: { width: p.X, height: p.Y, depth: p.Z } });
        game.supplyBoard(first, r.mines);
        const s = spam(game, n, graph, gate);
        let rev = 0; for (let c = 0; c < n; c++) rev += game.state.revealed[c];
        frac.push(rev / safe); solved.push(game.phase === PHASE.WON ? 1 : 0);
        const counts = game.counts();
        const clicks = 1 + s.flagClicks + s.chords; // first click included
        eff.push(counts.bbbvSolved / clicks); bbbvs.push(counts.bbbv);
        perClick.push(...s.perClick);
        if (s.flagsPlaced) clicksPerMine.push(s.flagClicks / s.flagsPlaced);
      }
      console.log(`  ${label.padEnd(20)} revealed mean ${pct(mean(frac))} (median ${pct(q(frac, 0.5))}), solved ${pct(mean(solved))}, spam efficiency median ${pct(q(eff, 0.5))} (3BV median ${q(bbbvs, 0.5)}), flags per auto-flag click mean ${mean(perClick).toFixed(2)} (median ${q(perClick, 0.5)}, p90 ${q(perClick, 0.9)}, max ${Math.max(...perClick)}), share of auto-flag clicks placing 1 flag ${pct(perClick.filter((x) => x === 1).length / perClick.length)}`);
    }
  }
}
