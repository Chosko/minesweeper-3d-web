import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { cellGraphFromLists } from '../js/engine/graph.js';
import { createGame, createGameWithMines, PHASE, CELL } from '../js/engine/rules.js';
import { PROFILES, REFERENCE_PROFILE, getRuleProfile } from '../js/engine/profiles.js';

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
  const game = createGameWithMines({ graph: b.graph, profile: REF, mines: b.mines, ...opts });
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

// ---------- rule profiles ----------

test('profiles: a table keyed by profile and version; the reference profile ships as version 1', () => {
  assert.ok(PROFILES[REF], 'reference profile present');
  assert.equal(PROFILES[REF].current, 1);
  assert.ok(PROFILES[REF].versions[1]);
  const p = getRuleProfile(REF);
  assert.equal(p, PROFILES[REF].versions[1]);
  assert.equal(p.id, REF);
  assert.equal(p.version, 1);
  assert.equal(getRuleProfile(REF, 1), p);
  assert.ok(Object.isFrozen(PROFILES));
  assert.ok(Object.isFrozen(p));
});

test('profiles: the reference behaviours are marked, each citing its fidelity entry', () => {
  const p = getRuleProfile(REF, 1);
  assert.deepEqual([...p.chordInputs], ['left', 'middle', 'left+right']);
  assert.equal(p.rightPressOnNumber, 'nothing');
  assert.equal(p.chordCountsFlagsOnly, true);
  assert.equal(p.chordOnFlagCountMismatch, 'nothing-opens');
  assert.equal(p.flagRevealedCell, false);
  assert.deepEqual({ ...p.lossView }, {
    explodedMine: true, unflaggedMinesRevealed: true, wrongFlagsCrossed: true,
    correctFlagsKept: true, otherClosedKept: true,
  });
  assert.equal(p.firstClick, 'safe-cell');
  for (const key of ['chordInputs', 'rightPressOnNumber', 'chordCountsFlagsOnly', 'chordOnFlagCountMismatch',
    'flagRevealedCell', 'lossView', 'firstClick']) {
    assert.equal(typeof p.fidelity[key], 'string', `${key} cites a fidelity entry`);
  }
});

test('profiles: an unknown profile or rules version is refused', () => {
  assert.throws(() => getRuleProfile('no-such-profile'), RangeError);
  assert.throws(() => getRuleProfile(REF, 2), RangeError);
  assert.throws(() => getRuleProfile(REF, 0), RangeError);
});

// ---------- creation ----------

test('create from a mine count: awaiting first click, current rules version by default', () => {
  const { graph } = board(['...', '...', '...']);
  const game = createGame({ graph, profile: REF, mineCount: 3 });
  assert.equal(game.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.equal(game.profile, getRuleProfile(REF));
  assert.equal(game.rulesVersion, 1);
  assert.equal(game.mineCount, 3);
  assert.equal(game.minesLeft, 3);
  for (let i = 0; i < graph.count; i++) assert.equal(game.cellState(i), CELL.CLOSED);
  assert.equal(createGame({ graph, profile: REF, version: 1, mineCount: 3 }).rulesVersion, 1);
});

test('create from a full mine set: playing directly', () => {
  const { game, graph, mines } = playing(['*..', '...', '..*']);
  assert.equal(game.phase, PHASE.PLAYING);
  assert.equal(game.mineCount, mines.length);
  for (let i = 0; i < graph.count; i++) assert.equal(game.cellState(i), CELL.CLOSED);
  const v1 = createGameWithMines({ graph, profile: REF, version: 1, mines });
  assert.equal(v1.rulesVersion, 1);
});

test('create: an unknown profile or rules version is refused', () => {
  const { graph } = board(['...', '...']);
  assert.throws(() => createGame({ graph, profile: REF, version: 2, mineCount: 1 }), RangeError);
  assert.throws(() => createGame({ graph, profile: 'nope', mineCount: 1 }), RangeError);
  assert.throws(() => createGameWithMines({ graph, profile: REF, version: 7, mines: [0] }), RangeError);
});

test('create: a mine count the board and the first-click guarantee do not allow throws RangeError', () => {
  const { graph } = board(['...', '...']); // 6 cells: at most 5 mines (the first click is safe)
  assert.throws(() => createGame({ graph, profile: REF, mineCount: 6 }), RangeError);
  assert.throws(() => createGame({ graph, profile: REF, mineCount: -1 }), RangeError);
  assert.throws(() => createGame({ graph, profile: REF, mineCount: 1.5 }), RangeError);
  assert.throws(() => createGame({ graph, profile: REF }), RangeError);
  assert.equal(createGame({ graph, profile: REF, mineCount: 5 }).mineCount, 5);
  assert.equal(createGame({ graph, profile: REF, mineCount: 0 }).mineCount, 0);
});

test('create: a mine set out of range, repeated or too large throws RangeError', () => {
  const { graph } = board(['...', '...']);
  assert.throws(() => createGameWithMines({ graph, profile: REF, mines: [0, 6] }), RangeError);
  assert.throws(() => createGameWithMines({ graph, profile: REF, mines: [-1] }), RangeError);
  assert.throws(() => createGameWithMines({ graph, profile: REF, mines: [1.5] }), RangeError);
  assert.throws(() => createGameWithMines({ graph, profile: REF, mines: [2, 3, 2] }), RangeError);
  assert.throws(() => createGameWithMines({ graph, profile: REF, mines: [0, 1, 2, 3, 4, 5] }), RangeError);
  assert.throws(() => createGameWithMines({ graph, profile: REF }), RangeError);
});

// ---------- first-click hand-off ----------

test('first click: the first reveal asks for a board at that cell and changes nothing', () => {
  const { graph, at, grid } = board(['....', '....', '....']);
  const game = createGame({ graph, profile: REF, mineCount: 2 });
  const r = game.reveal(at(1, 1));
  assert.equal(r.boardNeeded, at(1, 1));
  assert.equal(r.changed.length, 0);
  assert.equal(r.ended, false);
  assert.equal(game.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.deepEqual(view(game, grid), ['....', '....', '....']);
  assert.equal(game.actions().length, 0);
});

test('first click: supplying the board applies the reveal', () => {
  const { graph, at, grid } = board(['...*', '....', '*...']);
  const mines = [at(3, 0), at(0, 2)];
  const game = createGame({ graph, profile: REF, mineCount: 2 });
  game.reveal(at(0, 0));
  const r = game.supplyBoard(at(0, 0), mines);
  assert.equal(r.boardNeeded, -1);
  assert.equal(game.phase, PHASE.PLAYING);
  assert.deepEqual(view(game, grid), ['001.', '111.', '....']);
  assert.equal(r.changed.length, 6);
  assert.deepEqual(game.actions(), [{ kind: 'reveal', cell: at(0, 0) }]);
});

test('first click: a supplied board that breaks the first-click guarantee is rejected, game unchanged', () => {
  const { graph, at, grid } = board(['...', '...', '...']);
  const game = createGame({ graph, profile: REF, mineCount: 2 });
  game.reveal(at(1, 1));
  assert.throws(() => game.supplyBoard(at(1, 1), [at(1, 1), at(0, 0)]), RangeError); // mine on the clicked cell
  assert.throws(() => game.supplyBoard(at(1, 1), [at(0, 0)]), RangeError); // wrong mine count
  assert.throws(() => game.supplyBoard(at(1, 1), [at(0, 0), at(0, 0)]), RangeError); // repeated
  assert.throws(() => game.supplyBoard(at(1, 1), [at(0, 0), 9]), RangeError); // out of range
  assert.equal(game.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.deepEqual(view(game, grid), ['...', '...', '...']);
  // mines beside the first-click cell are accepted: safe, not always an opening
  const r = game.supplyBoard(at(1, 1), [at(0, 0), at(2, 2)]);
  assert.equal(game.phase, PHASE.PLAYING);
  assert.deepEqual(sorted(r.changed), [at(1, 1)]);
  assert.equal(game.cellNumber(at(1, 1)), 2);
});

test('first click: a board is only accepted in awaiting first click', () => {
  const { game, at } = playing(['*..', '...']);
  assert.throws(() => game.supplyBoard(at(2, 1), [at(0, 0)]), Error);
});

// ---------- actions ----------

test('reveal: a number opens only itself; a zero flood-fills through zeros to the numbered rim', () => {
  const { game, at, grid } = playing(['....', '....', '..*.', '....']);
  let r = game.reveal(at(2, 1));
  assert.deepEqual(sorted(r.changed), [at(2, 1)]);
  assert.equal(r.ended, false);
  r = game.reveal(at(0, 0));
  assert.deepEqual(view(game, grid), ['0000', '0111', '01..', '01..']);
  assert.equal(r.changed.length, 11); // (2,1) was already open
  assert.equal(game.phase, PHASE.PLAYING);
});

test('reveal: flood fill leaves flagged cells closed', () => {
  const { game, at, grid } = playing(['....', '....', '...*']);
  game.toggleFlag(at(1, 0));
  game.reveal(at(0, 2));
  assert.deepEqual(view(game, grid), ['0F00', '0011', '001.']);
  assert.equal(game.phase, PHASE.PLAYING); // the flagged safe cell is still closed
});

test('reveal: on a flagged or revealed cell does nothing', () => {
  const { game, at } = playing(['*..', '...', '...']);
  game.toggleFlag(at(0, 0));
  assert.equal(game.reveal(at(0, 0)).changed.length, 0);
  assert.equal(game.phase, PHASE.PLAYING);
  game.reveal(at(1, 1));
  assert.equal(game.reveal(at(1, 1)).changed.length, 0);
});

test('reveal: opening a mine loses, with the loss view', () => {
  const { game, at, grid } = playing(['*.*', '...', '..*']);
  game.toggleFlag(at(2, 0)); // correct flag
  game.toggleFlag(at(1, 2)); // wrong flag
  game.reveal(at(0, 2));
  const r = game.reveal(at(0, 0));
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.LOST);
  assert.deepEqual(view(game, grid), ['X.F', '13.', '0W*']);
  assert.deepEqual(sorted(r.changed), [at(0, 0), at(1, 2), at(2, 2)]);
  assert.equal(game.explodedCell, at(0, 0));
});

test('reveal: opening the last safe cell wins', () => {
  const { game, at } = playing(['*.', '..']);
  game.reveal(at(1, 0));
  game.reveal(at(0, 1));
  const r = game.reveal(at(1, 1));
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.WON);
});

test('toggle flag: flags and unflags a closed cell; mines left may go negative', () => {
  const { game, at } = playing(['*..', '...']);
  let r = game.toggleFlag(at(1, 0));
  assert.deepEqual(sorted(r.changed), [at(1, 0)]);
  assert.equal(r.ended, false);
  assert.equal(game.cellState(at(1, 0)), CELL.FLAGGED);
  assert.equal(game.minesLeft, 0);
  game.toggleFlag(at(2, 0));
  assert.equal(game.minesLeft, -1);
  r = game.toggleFlag(at(2, 0));
  assert.equal(game.cellState(at(2, 0)), CELL.CLOSED);
  assert.equal(game.minesLeft, 0);
});

test('toggle flag: a revealed cell cannot be flagged (reference profile)', () => {
  const { game, at } = playing(['*..', '...']);
  game.reveal(at(1, 1));
  const r = game.toggleFlag(at(1, 1));
  assert.equal(r.changed.length, 0);
  assert.equal(game.cellState(at(1, 1)), CELL.REVEALED);
  assert.equal(game.minesLeft, 1);
});

test('chord: a matching flag count opens every unflagged closed neighbour', () => {
  const { game, at, grid } = playing(['*...', '....', '....']);
  game.reveal(at(1, 1));
  game.toggleFlag(at(0, 0));
  const r = game.chord(at(1, 1));
  assert.equal(r.ended, true); // every safe cell is open: the flood reached the rest
  assert.equal(game.phase, PHASE.WON);
  assert.deepEqual(view(game, grid), ['F100', '1100', '0000']);
});

test('chord: a matching count holding a wrong flag opens the mine and loses', () => {
  const { game, at, grid } = playing(['*..', '...', '...']);
  game.reveal(at(1, 1));
  game.toggleFlag(at(2, 2)); // wrong flag, count 1 == number 1
  const r = game.chord(at(1, 1));
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.LOST);
  assert.equal(game.explodedCell, at(0, 0));
  assert.equal(view(game, grid)[0][0], 'X');
  assert.equal(view(game, grid)[2][2], 'W');
});

test('chord: a differing flag count opens nothing', () => {
  const { game, at, grid } = playing(['*..', '..*', '...']);
  game.reveal(at(1, 1));
  game.toggleFlag(at(0, 0));
  const before = view(game, grid);
  const r = game.chord(at(1, 1));
  assert.equal(r.changed.length, 0);
  assert.equal(r.ended, false);
  assert.deepEqual(view(game, grid), before);
});

test('chord: on a closed or flagged cell does nothing', () => {
  const { game, at } = playing(['*..', '...']);
  assert.equal(game.chord(at(2, 1)).changed.length, 0);
  game.toggleFlag(at(2, 1));
  assert.equal(game.chord(at(2, 1)).changed.length, 0);
  assert.equal(game.phase, PHASE.PLAYING);
});

test('actions outside playing change and count nothing', () => {
  const { graph, at, grid } = board(['*..', '...']);
  const waiting = createGame({ graph, profile: REF, mineCount: 1 });
  assert.equal(waiting.toggleFlag(at(1, 1)).changed.length, 0);
  assert.equal(waiting.chord(at(1, 1)).changed.length, 0);
  assert.equal(waiting.minesLeft, 1);
  assert.equal(waiting.actions().length, 0);

  const { game } = playing(['*..', '...']);
  game.reveal(at(0, 0));
  assert.equal(game.phase, PHASE.LOST);
  const frozen = view(game, grid);
  const n = game.actions().length;
  for (const act of ['reveal', 'toggleFlag', 'chord']) {
    const r = game[act](at(2, 1));
    assert.equal(r.changed.length, 0);
    assert.equal(r.ended, false);
    assert.equal(r.boardNeeded, -1);
  }
  assert.deepEqual(view(game, grid), frozen);
  assert.equal(game.actions().length, n);
});

test('actions: a cell index out of range throws RangeError', () => {
  const { game } = playing(['*..', '...']);
  for (const act of ['reveal', 'toggleFlag', 'chord']) {
    assert.throws(() => game[act](6), RangeError);
    assert.throws(() => game[act](-1), RangeError);
  }
});

test('flood fill is iterative: a 1000 x 1000 zero board opens in one reveal', () => {
  const grid = createSquareGrid(1000, 1000);
  const game = createGameWithMines({ graph: grid.graph, profile: REF, mines: [grid.index(999, 999)] });
  const r = game.reveal(0);
  assert.equal(r.changed.length, 1000 * 1000 - 1);
  assert.equal(game.phase, PHASE.WON);
});

// ---------- queries ----------

test('queries: cell numbers only on revealed cells', () => {
  const { game, at } = playing(['*.', '..']);
  assert.equal(game.cellNumber(at(1, 1)), -1);
  game.reveal(at(1, 1));
  assert.equal(game.cellNumber(at(1, 1)), 1);
  assert.equal(game.cellState(at(0, 0)), CELL.CLOSED);
  assert.throws(() => game.cellState(4), RangeError);
});

test('queries: the cell-state vocabulary is the six states the tile skin paints', () => {
  assert.deepEqual(Object.keys(CELL).sort(), ['CLOSED', 'EXPLODED', 'FLAGGED', 'MINE', 'REVEALED', 'WRONG_FLAG']);
  assert.deepEqual(Object.keys(PHASE).sort(), ['AWAITING_FIRST_CLICK', 'LOST', 'PLAYING', 'WON']);
});

// ---------- state storage ----------

test('state: flat typed arrays over the cell index; changed cells reuse one buffer', () => {
  const grid = createSquareGrid(30, 16); // Expert
  const mines = [];
  for (let i = 0; i < 99; i++) mines.push((i * 37) % grid.graph.count);
  const game = createGameWithMines({ graph: grid.graph, profile: REF, mines: [...new Set(mines)] });
  const a = game.toggleFlag(0);
  const b = game.toggleFlag(0);
  assert.ok(a.changed instanceof Int32Array);
  assert.equal(a.changed.buffer, b.changed.buffer, 'changed cells are a view of one preallocated buffer');
  for (const name of ['mine', 'number', 'revealed', 'flagged']) {
    assert.ok(ArrayBuffer.isView(game.state[name]), `${name} is a typed array`);
    assert.equal(game.state[name].length, grid.graph.count);
  }
});

// ---------- action stream and determinism ----------

test('action stream: applied actions in order with their cell indices', () => {
  const { game, at } = playing(['*..', '...', '...']);
  game.toggleFlag(at(0, 0));
  game.reveal(at(1, 1));
  game.chord(at(1, 1));
  assert.deepEqual(game.actions(), [
    { kind: 'flag', cell: at(0, 0) },
    { kind: 'reveal', cell: at(1, 1) },
    { kind: 'chord', cell: at(1, 1) },
  ]);
});

test('determinism: the same board and actions always give the same game', () => {
  const rows = ['*.....', '...*..', '......', '.*....', '......'];
  const script = [['reveal', 23], ['toggleFlag', 0], ['reveal', 5], ['chord', 7], ['toggleFlag', 9], ['reveal', 29]];
  const play = () => {
    const { game, grid } = playing(rows);
    const results = script.map(([act, c]) => sorted(game[act](c).changed));
    return { results, view: view(game, grid), phase: game.phase, actions: game.actions() };
  };
  const a = play();
  const b = play();
  assert.deepEqual(a, b);
  // replaying the recorded stream on the same board reproduces it
  const { game, grid } = playing(rows);
  const method = { reveal: 'reveal', flag: 'toggleFlag', chord: 'chord' };
  for (const { kind, cell } of a.actions) game[method[kind]](cell);
  assert.deepEqual(view(game, grid), a.view);
});

test('engine runs over any cell graph, not only the square grid', () => {
  // a path 0-1-2-3 with a mine at 3
  const graph = cellGraphFromLists(4, [[1], [0, 2], [1, 3], [2]]);
  const game = createGameWithMines({ graph, profile: REF, mines: [3] });
  const r = game.reveal(0);
  assert.deepEqual(sorted(r.changed), [0, 1, 2]);
  assert.equal(game.cellNumber(2), 1);
  assert.equal(game.phase, PHASE.WON);
});
