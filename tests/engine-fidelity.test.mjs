// Fidelity tests: the reference ruleset (rule profile `minesweeper-online`, rules version 1)
// against tests/fidelity/minesweeper-online.md, the committed record of Minesweeper Online's
// behaviour with its default options. Each test cites its entry by heading and asserts the
// engine reproduces it. The file is the oracle: a failure here is fixed in the engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGame, createGameWithMines, PHASE, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE, getRuleProfile } from '../js/engine/profiles.js';

const REF = REFERENCE_PROFILE;
const PROFILE = getRuleProfile(REF, 1);

// The observation file's entries: heading (without its trailing "(task …)" parenthetical) →
// { tags, body }.
const FILE = readFileSync(new URL('./fidelity/minesweeper-online.md', import.meta.url), 'utf8');
const ENTRIES = new Map();
for (const part of FILE.split(/^### /m).slice(1)) {
  const nl = part.indexOf('\n');
  const line = part.slice(0, nl).trim();
  const m = /^(.*?)\s*\(([^)]*)\)$/.exec(line);
  ENTRIES.set(m ? m[1] : line, { tags: m ? m[2] : '', body: part.slice(nl + 1).trim() });
}

// The entry under `heading`; fails when the file has none.
function entry(heading) {
  const e = ENTRIES.get(heading);
  assert.ok(e, `tests/fidelity/minesweeper-online.md has no entry "${heading}"`);
  return e.body;
}

// The engine rules this file pins, one test each, by the heading of the entry it cites.
const PINNED = [
  'First-click guarantee',
  'Chording: which inputs chord',
  'Chording on a wrong flag',
  'Chording with a wrong flag count',
  'The board after a loss',
  'What counts as a click for efficiency',
  'Flagging a revealed cell',
];

// Hand-built square boards. `rows` are strings, '*' a mine, anything else safe.
function board(rows) {
  const height = rows.length, width = rows[0].length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '*') mines.push(x + width * y); }));
  return { grid, graph: grid.graph, mines, at: (x, y) => grid.index(x, y) };
}

function playing(rows) {
  const b = board(rows);
  const dimensions = { width: b.grid.width, height: b.grid.height };
  const game = createGameWithMines({ graph: b.graph, profile: REF, version: 1, mines: b.mines, dimensions });
  return { ...b, game };
}

// The board as the tile skin would paint it, one character per cell:
// '.' closed, 'F' flagged, digit revealed number, '*' mine, 'X' exploded, 'W' wrong flag.
const GLYPH = { [CELL.CLOSED]: '.', [CELL.FLAGGED]: 'F', [CELL.MINE]: '*', [CELL.EXPLODED]: 'X', [CELL.WRONG_FLAG]: 'W' };
function view(game, grid) {
  const out = [];
  for (let y = 0; y < grid.height; y++) {
    let s = '';
    for (let x = 0; x < grid.width; x++) {
      const i = grid.index(x, y);
      const st = game.cellState(i);
      s += st === CELL.REVEALED ? String(game.cellNumber(i)) : GLYPH[st];
    }
    out.push(s);
  }
  return out;
}

const sorted = (changed) => Array.from(changed).sort((a, b) => a - b);
const clicks = (game) => game.counts().clicks;
const total = (c) => Object.values(c).reduce((s, k) => s + k.effective + k.wasted, 0);

// ---------- the oracle ----------

test('fidelity: every engine rule the file records is pinned here, and every profile marker cites an entry', () => {
  const recorded = [...ENTRIES].filter(([, e]) => /\btask 7\b/.test(e.tags)).map(([h]) => h);
  assert.deepEqual([...recorded].sort(), [...PINNED].sort());
  for (const [marker, heading] of Object.entries(PROFILE.fidelity)) {
    assert.ok(ENTRIES.has(heading), `profile marker ${marker} cites a missing entry "${heading}"`);
  }
});

// ---------- First-click guarantee ----------

test('fidelity "First-click guarantee": safe, not always an opening', () => {
  assert.match(entry('First-click guarantee'), /always safe, but not always an opening/);
  assert.equal(PROFILE.firstClick, 'safe-cell');
  assert.equal(PROFILE.fidelity.firstClick, 'First-click guarantee');

  // A board with a mine on the first-click cell is rejected, and the game is unchanged.
  const b = board(['.....', '.....', '.....', '.....', '.....']);
  const c = b.at(2, 2);
  const game = createGame({ graph: b.graph, profile: REF, version: 1, mineCount: 8 });
  const req = game.reveal(c);
  assert.equal(req.boardNeeded, c);
  assert.equal(req.changed.length, 0);
  const ring = [...b.graph.neighbours(c)];
  const onFirst = [c, ...ring.slice(1)];
  assert.throws(() => game.supplyBoard(c, onFirst), RangeError);
  assert.equal(game.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.equal(game.actions().length, 0);
  assert.ok(Array.from(game.state.revealed).every((v) => v === 0));
  assert.ok(Array.from(game.state.mine).every((v) => v === 0));

  // A board that puts mines on every cell beside it is accepted: the first click is safe and
  // reveals a single number, not an opening.
  const r = game.supplyBoard(c, ring);
  assert.equal(game.phase, PHASE.PLAYING);
  assert.deepEqual(sorted(r.changed), [c]);
  assert.equal(game.cellNumber(c), 8);
  assert.equal(game.cellState(c), CELL.REVEALED);

  // The same guarantee can also land on an opening.
  const far = createGame({ graph: b.graph, profile: REF, version: 1, mineCount: 1 });
  far.reveal(c);
  const r2 = far.supplyBoard(c, [b.at(0, 0)]);
  assert.equal(far.cellNumber(c), 0);
  assert.equal(r2.changed.length, 24);
});

// ---------- Chording: which inputs chord ----------

test('fidelity "Chording: which inputs chord": a chord acts on a revealed number; a right press on one does nothing', () => {
  assert.match(entry('Chording: which inputs chord'), /A right press on a number does nothing/);
  assert.deepEqual([...PROFILE.chordInputs], ['left', 'middle', 'left+right']);
  assert.equal(PROFILE.rightPressOnNumber, 'nothing');
  assert.equal(PROFILE.fidelity.chordInputs, 'Chording: which inputs chord');
  assert.equal(PROFILE.fidelity.rightPressOnNumber, 'Chording: which inputs chord');

  const { game, grid, at } = playing(['*.*', '...', '...']);
  game.reveal(at(1, 1));
  assert.equal(game.cellNumber(at(1, 1)), 2);

  // A right press on the number: nothing changes, nothing is recorded.
  const before = game.actions().length;
  const f = game.toggleFlag(at(1, 1));
  assert.equal(f.changed.length, 0);
  assert.equal(game.cellState(at(1, 1)), CELL.REVEALED);
  assert.equal(game.actions().length, before);

  // A chord on a closed cell opens nothing: the engine opens a closed cell only by a reveal.
  const closed = game.chord(at(1, 2));
  assert.equal(closed.changed.length, 0);
  assert.equal(game.cellState(at(1, 2)), CELL.CLOSED);

  // A chord on the number with its flags placed opens every closed unflagged neighbour.
  game.toggleFlag(at(0, 0));
  game.toggleFlag(at(2, 0));
  const r = game.chord(at(1, 1));
  assert.deepEqual(sorted(r.changed), [at(1, 0), at(0, 1), at(2, 1), at(0, 2), at(1, 2), at(2, 2)]);
  assert.deepEqual(view(game, grid), ['F2F', '121', '000']);
  assert.equal(game.phase, PHASE.WON);
});

// ---------- Chording on a wrong flag ----------

test('fidelity "Chording on a wrong flag": a matching count with a wrong flag opens the mine and loses', () => {
  assert.match(entry('Chording on a wrong flag'), /opens the mine and the game is lost/);
  assert.equal(PROFILE.chordCountsFlagsOnly, true);
  assert.equal(PROFILE.fidelity.chordCountsFlagsOnly, 'Chording on a wrong flag');

  const { game, grid, at } = playing(['*..', '...', '...']);
  game.reveal(at(1, 1));
  assert.equal(game.cellNumber(at(1, 1)), 1);
  game.toggleFlag(at(2, 2)); // wrong: (2,2) is safe, the mine is (0,0)
  const r = game.chord(at(1, 1));
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.LOST);
  assert.equal(game.explodedCell, at(0, 0));
  assert.deepEqual(view(game, grid), ['X10', '110', '00W']);
  // Opening the mine is an effective chord.
  assert.deepEqual({ ...clicks(game).chord }, { effective: 1, wasted: 0 });
});

// ---------- Chording with a wrong flag count ----------

test('fidelity "Chording with a wrong flag count": nothing opens and a wasted chord is counted', () => {
  assert.match(entry('Chording with a wrong flag count'), /When the count differs, nothing opens/);
  assert.equal(PROFILE.chordOnFlagCountMismatch, 'nothing-opens');
  assert.equal(PROFILE.fidelity.chordOnFlagCountMismatch, 'Chording with a wrong flag count');

  const { game, grid, at } = playing(['*.*', '...', '...']);
  game.reveal(at(1, 1));
  assert.equal(game.cellNumber(at(1, 1)), 2);

  // Fewer flags than the number.
  game.toggleFlag(at(0, 0));
  const fewer = game.chord(at(1, 1));
  assert.equal(fewer.changed.length, 0);
  assert.equal(fewer.ended, false);
  assert.deepEqual(view(game, grid), ['F..', '.2.', '...']);
  assert.deepEqual({ ...clicks(game).chord }, { effective: 0, wasted: 1 });

  // More flags than the number.
  game.toggleFlag(at(2, 0));
  game.toggleFlag(at(1, 2));
  const more = game.chord(at(1, 1));
  assert.equal(more.changed.length, 0);
  assert.equal(game.phase, PHASE.PLAYING);
  assert.deepEqual(view(game, grid), ['F.F', '.2.', '.F.']);
  assert.deepEqual({ ...clicks(game).chord }, { effective: 0, wasted: 2 });
});

// ---------- The board after a loss ----------

test('fidelity "The board after a loss": exploded mine, mines shown, wrong flags crossed, the rest kept', () => {
  assert.match(entry('The board after a loss'), /A correct\s+flag stays a closed, flagged cell/);
  assert.deepEqual({ ...PROFILE.lossView }, {
    explodedMine: true,
    unflaggedMinesRevealed: true,
    wrongFlagsCrossed: true,
    correctFlagsKept: true,
    otherClosedKept: true,
  });
  assert.equal(PROFILE.fidelity.lossView, 'The board after a loss');

  const { game, grid, at } = playing(['*..*', '....', '*...']);
  game.reveal(at(3, 2));
  assert.deepEqual(view(game, grid), ['....', '.211', '.100']);
  game.toggleFlag(at(3, 0)); // correct
  game.toggleFlag(at(1, 0)); // wrong
  const r = game.reveal(at(0, 0));
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.LOST);
  assert.deepEqual(sorted(r.changed), [at(0, 0), at(1, 0), at(0, 2)]);
  assert.deepEqual(view(game, grid), ['XW.F', '.211', '*100']);
});

// ---------- What counts as a click for efficiency ----------

test('fidelity "What counts as a click for efficiency": every recorded click counts, wasted ones included', () => {
  const body = entry('What counts as a click for efficiency');
  assert.match(body, /wasted clicks included/);
  assert.match(body, /A\s+right click on a revealed cell is never sent and never counted/);
  assert.equal(PROFILE.fidelity.clickCounting, 'What counts as a click for efficiency');
  assert.deepEqual([...PROFILE.clickCounting.counted], ['reveal', 'flag', 'chord']);
  assert.equal(PROFILE.clickCounting.wastedIncluded, true);
  assert.equal(PROFILE.clickCounting.flagOnRevealedCell, 'not-counted');

  const { game, at } = playing(['*..*', '....', '*...']);
  game.reveal(at(3, 2));      // opens an area: effective reveal
  game.reveal(at(3, 2));      // opens nothing: wasted reveal
  game.chord(at(3, 2));       // a zero with nothing left to open: wasted chord
  game.chord(at(2, 0));       // on a closed cell: wasted chord
  game.toggleFlag(at(3, 0));  // places a flag: effective flag
  game.reveal(at(3, 0));      // on a flag, opens nothing: wasted reveal
  game.toggleFlag(at(2, 1));  // on a revealed cell: no click at all
  game.chord(at(2, 1));       // count matches, opens two cells: effective chord
  game.chord(at(1, 1));       // count differs: wasted chord
  game.toggleFlag(at(0, 1));  // places a (wrong) flag: effective flag
  game.toggleFlag(at(0, 1));  // removes it: wasted flag
  game.reveal(at(0, 0));      // opens a mine: effective reveal
  assert.equal(game.phase, PHASE.LOST);

  const c = clicks(game);
  assert.deepEqual({ ...c.reveal }, { effective: 2, wasted: 2 });
  assert.deepEqual({ ...c.flag }, { effective: 2, wasted: 1 });
  assert.deepEqual({ ...c.chord }, { effective: 1, wasted: 3 });
  assert.equal(total(c), 11);
  assert.equal(game.actions().length, 11);
  const s = game.summary();
  assert.deepEqual(s.clicks, c);
  assert.equal(s.bbbvSolved, game.counts().bbbvSolved);
});

test('fidelity "What counts as a click for efficiency": an opening is solved 3BV only when all its zeros are open', () => {
  entry('What counts as a click for efficiency');
  // Cells 0 1 2 3 4 in a row, the mine on 3: one opening {0, 1} and the number 4 → 3BV 2.
  const { game, at } = playing(['...*.']);
  assert.equal(game.counts().bbbv, 2);
  game.toggleFlag(at(0, 0));  // a flag holds one zero of the opening closed
  game.reveal(at(1, 0));
  assert.equal(game.cellState(at(0, 0)), CELL.FLAGGED);
  assert.equal(game.counts().bbbvSolved, 0);
  game.toggleFlag(at(0, 0));
  game.reveal(at(0, 0));
  assert.equal(game.counts().bbbvSolved, 1);
  game.reveal(at(4, 0));
  assert.equal(game.phase, PHASE.WON);

  // Efficiency = solved 3BV ÷ every recorded click: 2 ÷ (3 reveals + 2 flag clicks).
  const s = game.summary();
  assert.equal(s.bbbvSolved, 2);
  assert.equal(total(s.clicks), 5);
  assert.deepEqual({ ...s.clicks.flag }, { effective: 1, wasted: 1 });
});

// ---------- Flagging a revealed cell ----------

test('fidelity "Flagging a revealed cell": not possible, and not counted', () => {
  assert.match(entry('Flagging a revealed cell'), /Not possible/);
  assert.equal(PROFILE.flagRevealedCell, false);
  assert.equal(PROFILE.fidelity.flagRevealedCell, 'Flagging a revealed cell');

  const { game, grid, at } = playing(['*..*', '....', '*...']);
  game.reveal(at(3, 2));
  const counts = game.counts();
  const actions = game.actions().length;
  for (const c of [at(3, 2), at(1, 1)]) { // a revealed zero and a revealed number
    const r = game.toggleFlag(c);
    assert.equal(r.changed.length, 0);
    assert.equal(game.cellState(c), CELL.REVEALED);
  }
  assert.equal(game.flagCount, 0);
  assert.equal(game.actions().length, actions);
  assert.deepEqual(game.counts(), counts);
  assert.deepEqual(view(game, grid), ['....', '.211', '.100']);
});
