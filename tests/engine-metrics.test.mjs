import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { cellGraphFromLists } from '../js/engine/graph.js';
import { createGame, createGameWithMines, PHASE } from '../js/engine/rules.js';
import { REFERENCE_PROFILE, getRuleProfile } from '../js/engine/profiles.js';
import { createBoardMetrics, createClickCounts, CLICK_KINDS } from '../js/engine/metrics.js';

const REF = REFERENCE_PROFILE;

// Hand-built square boards. `rows` are strings, '*' a mine, anything else safe.
function board(rows) {
  const height = rows.length, width = rows[0].length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '*') mines.push(x + width * y); }));
  return { grid, graph: grid.graph, mines, at: (x, y) => grid.index(x, y) };
}

function playing(rows, opts = {}) {
  const b = board(rows);
  const dimensions = { width: b.grid.width, height: b.grid.height };
  const game = createGameWithMines({ graph: b.graph, profile: REF, mines: b.mines, dimensions, ...opts });
  return { ...b, game };
}

// 3BV the textbook way, independent of the engine: on a copy of the board, click every
// still-closed zero cell (flood-filling as the game would), then every safe cell still closed;
// each click is one.
function naiveBbbv(graph, mineList) {
  const n = graph.count;
  const mine = new Uint8Array(n);
  for (const m of mineList) mine[m] = 1;
  const num = new Uint8Array(n);
  for (let i = 0; i < n; i++) for (const j of graph.neighbours(i)) num[i] += mine[j];
  const open = new Uint8Array(n);
  let clicks = 0;
  const flood = (c) => {
    const stack = [c];
    open[c] = 1;
    while (stack.length) {
      const cur = stack.pop();
      if (num[cur] !== 0) continue;
      for (const nb of graph.neighbours(cur)) {
        if (!open[nb] && !mine[nb]) { open[nb] = 1; stack.push(nb); }
      }
    }
  };
  for (let i = 0; i < n; i++) if (!mine[i] && num[i] === 0 && !open[i]) { clicks++; flood(i); }
  for (let i = 0; i < n; i++) if (!mine[i] && !open[i]) clicks++;
  return clicks;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const zero = { effective: 0, wasted: 0 };
const clicksOf = (game) => game.counts().clicks;
const total = (clicks) => CLICK_KINDS.reduce((s, k) => s + clicks[k].effective + clicks[k].wasted, 0);

// ---------- 3BV ----------

test('3BV: a board with no openings counts every safe cell once', () => {
  const { game } = playing(['*.', '.*']);
  assert.equal(game.counts().bbbv, 2);
  const g2 = playing(['*.*', '.*.', '*.*']).game;
  assert.equal(g2.counts().bbbv, 4);
});

test('3BV: an all-opening board counts one', () => {
  assert.equal(playing(['....', '....', '....']).game.counts().bbbv, 1);
  // one mine whose numbers all touch the opening
  assert.equal(playing(['*....', '.....', '.....']).game.counts().bbbv, 1);
});

test('3BV: each opening once, each safe cell outside any opening\'s reach once', () => {
  // two openings either side of a mine wall
  assert.equal(playing(['...*...', '...*...', '...*...']).game.counts().bbbv, 2);
  // one opening (bottom row, reaching row 1) plus the isolated 2 between the mines
  assert.equal(playing(['*.*', '...', '...']).game.counts().bbbv, 2);
});

test('3BV: matches the textbook count on random boards', () => {
  const rnd = mulberry32(7);
  for (let t = 0; t < 200; t++) {
    const w = 1 + Math.floor(rnd() * 12), h = 1 + Math.floor(rnd() * 12);
    const grid = createSquareGrid(w, h);
    const n = w * h;
    const k = Math.floor(rnd() * n);
    const pool = [...Array(n).keys()];
    const mines = [];
    for (let i = 0; i < k; i++) mines.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    const game = createGameWithMines({ graph: grid.graph, profile: REF, mines });
    assert.equal(game.counts().bbbv, naiveBbbv(grid.graph, mines), `board ${w}x${h} mines ${mines}`);
  }
});

test('3BV: computed when the mines are placed — unknown while awaiting the first click', () => {
  const { graph, at } = board(['...*...', '...*...', '...*...']);
  const game = createGame({ graph, profile: REF, mineCount: 3 });
  assert.equal(game.counts().bbbv, null);
  assert.equal(game.counts().bbbvSolved, 0);
  game.reveal(at(0, 0));
  game.supplyBoard(at(0, 0), [at(3, 0), at(3, 1), at(3, 2)]);
  assert.equal(game.counts().bbbv, 2);
  assert.equal(game.counts().bbbvSolved, 1);
});

test('3BV: works over any cell graph', () => {
  // path 0-1-2-3-4, mine on 2: cells 0 and 4 are zeros reaching 1 and 3
  const graph = cellGraphFromLists(5, [[1], [0, 2], [1, 3], [2, 4], [3]]);
  const game = createGameWithMines({ graph, profile: REF, mines: [2] });
  assert.equal(game.counts().bbbv, 2);
});

test('board metrics: createBoardMetrics over the state arrays', () => {
  const { graph, mines } = board(['*.*', '...', '...']);
  const mine = new Uint8Array(graph.count);
  const number = new Uint8Array(graph.count);
  for (const m of mines) mine[m] = 1;
  for (const m of mines) for (const j of graph.neighbours(m)) number[j]++;
  const m = createBoardMetrics(graph, mine, number);
  assert.equal(m.bbbv, 2);
  assert.equal(m.solved, 0);
  m.opened(1); // the isolated 2
  assert.equal(m.solved, 1);
  m.opened(4); // a number in the opening's reach
  assert.equal(m.solved, 1);
  for (const c of [6, 7, 8]) m.opened(c); // the opening's zeros
  assert.equal(m.solved, 2);
});

// ---------- 3BV solved ----------

test('3BV solved: tracks progress, opening by opening and cell by cell', () => {
  const { game, at } = playing(['*.*', '...', '...']);
  assert.equal(game.counts().bbbvSolved, 0);
  game.reveal(at(1, 1)); // a number in the opening's reach: no 3BV
  assert.equal(game.counts().bbbvSolved, 0);
  game.reveal(at(1, 0)); // the isolated 2
  assert.equal(game.counts().bbbvSolved, 1);
  game.reveal(at(0, 2)); // the opening
  assert.equal(game.counts().bbbvSolved, 2);
  assert.equal(game.phase, PHASE.WON);
  assert.equal(game.counts().bbbvSolved, game.counts().bbbv);
});

test('3BV solved: an opening counts once every zero in it is open', () => {
  const { game, at } = playing(['....', '....', '...*']);
  assert.equal(game.counts().bbbv, 1);
  game.toggleFlag(at(0, 0));
  game.reveal(at(3, 0)); // the flood stops at the flagged zero
  assert.equal(game.counts().bbbvSolved, 0);
  game.toggleFlag(at(0, 0));
  game.reveal(at(0, 0));
  assert.equal(game.counts().bbbvSolved, 1);
  assert.equal(game.phase, PHASE.WON);
});

test('3BV solved: correct after a loss, chord openings included', () => {
  const { game, at } = playing(['...*...', '...*...', '...*...']);
  game.reveal(at(0, 0)); // left opening
  game.reveal(at(3, 1)); // mine
  assert.equal(game.phase, PHASE.LOST);
  assert.equal(game.counts().bbbvSolved, 1);

  // wrong flag on a zero, matching count: the chord opens safe cells, then the mine; the
  // flagged zero stays closed, so the board's one opening is not solved
  const c = playing(['*..', '...', '...']);
  assert.equal(c.game.counts().bbbv, 1);
  c.game.reveal(c.at(1, 1));
  c.game.toggleFlag(c.at(2, 2));
  c.game.chord(c.at(1, 1));
  assert.equal(c.game.phase, PHASE.LOST);
  assert.equal(c.game.counts().bbbvSolved, 0);

  // a loss by chord keeps the progress made before it
  const d = playing(['*.*', '...', '...']);
  d.game.reveal(d.at(0, 2)); // the opening
  d.game.toggleFlag(d.at(0, 0));
  d.game.toggleFlag(d.at(1, 0)); // wrong flag: (1,1) shows 2 and now sees 2 flags
  d.game.chord(d.at(1, 1)); // opens (2,0), a mine
  assert.equal(d.game.phase, PHASE.LOST);
  assert.equal(d.game.counts().bbbvSolved, 1);
});

// ---------- clicks ----------

test('clicks: a reveal that opens a cell is effective; one that opens nothing is wasted', () => {
  const { game, at } = playing(['*..', '...', '..*']);
  game.reveal(at(1, 0));
  game.reveal(at(1, 0)); // already open
  game.toggleFlag(at(0, 0));
  game.reveal(at(0, 0)); // flagged
  assert.deepEqual(clicksOf(game).reveal, { effective: 1, wasted: 2 });
});

test('clicks: a reveal that opens a mine is an effective click', () => {
  const { game, at } = playing(['*..', '...']);
  game.reveal(at(0, 0));
  assert.equal(game.phase, PHASE.LOST);
  assert.deepEqual(clicksOf(game).reveal, { effective: 1, wasted: 0 });
});

test('clicks: placing a flag is effective; removing one is a redundant, wasted flag click', () => {
  const { game, at } = playing(['*..', '...']);
  game.toggleFlag(at(0, 0));
  game.toggleFlag(at(2, 1));
  game.toggleFlag(at(2, 1));
  assert.deepEqual(clicksOf(game).flag, { effective: 2, wasted: 1 });
});

test('clicks: a right click on a revealed cell is never counted nor recorded', () => {
  const { game, at } = playing(['*..', '...']);
  game.reveal(at(1, 1));
  const n = game.actions().length;
  game.toggleFlag(at(1, 1));
  assert.deepEqual(clicksOf(game).flag, zero);
  assert.equal(game.actions().length, n);
});

test('clicks: a chord that opens cells is effective; a wrong flag count, nothing to open or a closed cell is wasted', () => {
  const { game, at } = playing(['*.*', '...', '...']);
  game.reveal(at(0, 2)); // the opening; (1,0) stays closed
  game.chord(at(1, 2)); // a zero with every neighbour open: nothing to open
  game.chord(at(0, 1)); // 1 with no flag: wrong flag count
  game.chord(at(1, 0)); // a closed cell
  assert.deepEqual(clicksOf(game).chord, { effective: 0, wasted: 3 });
  game.toggleFlag(at(0, 0));
  game.chord(at(0, 1)); // opens (1,0)
  assert.equal(game.phase, PHASE.WON);
  assert.deepEqual(clicksOf(game), {
    reveal: { effective: 1, wasted: 0 }, flag: { effective: 1, wasted: 0 }, chord: { effective: 1, wasted: 3 },
  });
});

test('clicks: a chord that opens a mine through a wrong flag is effective', () => {
  const { game, at } = playing(['*..', '...', '...']);
  game.reveal(at(1, 1));
  game.toggleFlag(at(2, 2));
  game.chord(at(1, 1));
  assert.equal(game.phase, PHASE.LOST);
  assert.deepEqual(clicksOf(game).chord, { effective: 1, wasted: 0 });
});

test('clicks: an action outside playing counts nothing; the first reveal counts once', () => {
  const { graph, at } = board(['*..', '...']);
  const game = createGame({ graph, profile: REF, mineCount: 1 });
  game.toggleFlag(at(1, 1));
  game.chord(at(1, 1));
  game.reveal(at(2, 1)); // board needed: not yet applied
  for (const k of CLICK_KINDS) assert.deepEqual(clicksOf(game)[k], zero);
  game.supplyBoard(at(2, 1), [at(0, 0)]);
  assert.deepEqual(clicksOf(game).reveal, { effective: 1, wasted: 0 });
  game.reveal(at(0, 0)); // lose
  const after = clicksOf(game);
  game.reveal(at(1, 0));
  game.toggleFlag(at(1, 0));
  game.chord(at(1, 1));
  assert.deepEqual(clicksOf(game), after);
});

test('clicks: every recorded action is exactly one counted click', () => {
  const rnd = mulberry32(11);
  for (let t = 0; t < 50; t++) {
    const { game } = playing(['*.....', '...*..', '......', '.*....', '.....*']);
    const acts = ['reveal', 'toggleFlag', 'chord'];
    for (let i = 0; i < 40 && game.phase === PHASE.PLAYING; i++) {
      game[acts[Math.floor(rnd() * 3)]](Math.floor(rnd() * 30));
    }
    assert.equal(total(clicksOf(game)), game.actions().length);
  }
});

test('click counts: createClickCounts tallies effective and wasted per kind', () => {
  assert.deepEqual([...CLICK_KINDS], ['reveal', 'flag', 'chord']);
  const c = createClickCounts();
  c.add('reveal', false);
  c.add('reveal', true);
  c.add('chord', true);
  const s = c.snapshot();
  assert.deepEqual(s, { reveal: { effective: 1, wasted: 1 }, flag: zero, chord: { effective: 0, wasted: 1 } });
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.reveal));
  c.add('flag', false);
  assert.deepEqual(s.flag, zero, 'a snapshot does not move');
  assert.throws(() => c.add('wave', false), RangeError);
});

test('profile: the click-counting rule is marked and cites its fidelity entry', () => {
  const p = getRuleProfile(REF, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(p.clickCounting)), {
    counted: ['reveal', 'flag', 'chord'],
    wastedIncluded: true,
    wasted: { reveal: 'opens-nothing', flag: 'removes-a-flag', chord: 'opens-nothing' },
    flagOnRevealedCell: 'not-counted',
  });
  assert.equal(p.fidelity.clickCounting, 'What counts as a click for efficiency');
});

// ---------- counts and the game summary ----------

test('counts: readable mid-game, for an abandoned game', () => {
  const { game, at } = playing(['*.*', '...', '...']);
  game.reveal(at(1, 0));
  game.toggleFlag(at(0, 0));
  const c = game.counts();
  assert.equal(game.phase, PHASE.PLAYING);
  assert.deepEqual(c, {
    bbbv: 2,
    bbbvSolved: 1,
    clicks: { reveal: { effective: 1, wasted: 0 }, flag: { effective: 1, wasted: 0 }, chord: zero },
  });
  assert.equal(game.summary(), null, 'no summary before a win or a loss');
});

test('summary: at a win — outcome, dimensions, mine count, 3BV, 3BV solved, clicks', () => {
  const { game, at } = playing(['*.*', '...', '...']);
  game.reveal(at(1, 0));
  game.reveal(at(0, 2));
  assert.equal(game.phase, PHASE.WON);
  const s = game.summary();
  assert.deepEqual(s, {
    outcome: 'won',
    dimensions: { width: 3, height: 3 },
    mineCount: 2,
    bbbv: 2,
    bbbvSolved: 2,
    clicks: { reveal: { effective: 2, wasted: 0 }, flag: zero, chord: zero },
  });
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.dimensions) && Object.isFrozen(s.clicks));
});

test('summary: at a loss, with the progress made', () => {
  const { game, at } = playing(['...*...', '...*...', '...*...']);
  game.reveal(at(6, 2));
  game.reveal(at(6, 2));
  game.reveal(at(3, 0));
  const s = game.summary();
  assert.equal(s.outcome, 'lost');
  assert.equal(s.mineCount, 3);
  assert.equal(s.bbbv, 2);
  assert.equal(s.bbbvSolved, 1);
  assert.deepEqual(s.clicks.reveal, { effective: 2, wasted: 1 });
});

test('summary: dimensions default to the cell count; invalid dimensions throw RangeError', () => {
  const graph = cellGraphFromLists(3, [[1], [0, 2], [1]]);
  const game = createGameWithMines({ graph, profile: REF, mines: [2] });
  game.reveal(0);
  assert.equal(game.phase, PHASE.WON);
  assert.deepEqual(game.summary().dimensions, { cells: 3 });
  for (const dimensions of [{ width: 0 }, { width: 1.5 }, { width: '3' }, {}, 5, []]) {
    assert.throws(() => createGameWithMines({ graph, profile: REF, mines: [2], dimensions }), RangeError);
    assert.throws(() => createGame({ graph, profile: REF, mineCount: 1, dimensions }), RangeError);
  }
});
