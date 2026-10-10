// The 3D state view (js/engine/state-view-3d.js): the read surface the 3D renderer, picking and
// HUD consume, served from the shared engine under the 3D profile — per-cell arrays by linear
// index, the phase, exploded cell, mines left, a change counter and a drained change set — after
// reveal, flag, chord, hide and un-hide, the loss presentation, the first-click hand-off, and the
// 100 x 100 x 100 memory figures recorded in .claude/domain/features/3d-board-graph.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v8 from 'node:v8';
import vm from 'node:vm';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { PROFILE_3D } from '../js/engine/profiles.js';
import { createGame, createGameWithMines, PHASE } from '../js/engine/rules.js';
import { createStateView3D } from '../js/engine/state-view-3d.js';

const arr = (a) => Array.from(a);
const sorted = (a) => arr(a).sort((x, y) => x - y);

// A 3D game on an X x Y x Z box from a fixed mine set, with its view.
function setup(X, Y, Z, mines) {
  const box = createBoxGrid(X, Y, Z);
  const game = createGameWithMines({ graph: box.graph, profile: PROFILE_3D, mines, dimensions: { X, Y, Z } });
  return { box, game, view: createStateView3D(game, box) };
}

// A 4 x 1 x 1 row: cells 0 (0), 1 (1), 2 (mine), 3 (1).
const row = () => setup(4, 1, 1, [2]);

test('geometry mirrors the 3D engine: X, Y, Z, n, idx and coords', () => {
  const { view } = setup(3, 4, 5, [7]);
  assert.equal(view.X, 3); assert.equal(view.Y, 4); assert.equal(view.Z, 5); assert.equal(view.n, 60);
  assert.equal(view.idx(2, 3, 4), 2 + 3 * (3 + 4 * 4));
  assert.deepEqual(view.coords(view.idx(1, 2, 3)), [1, 2, 3]);
});

test('a fresh view: typed arrays by linear index, playing, nothing changed', () => {
  const { view, game } = row();
  assert.ok(view.number instanceof Int8Array);
  assert.deepEqual(arr(view.number), [0, 1, -1, 1]);
  for (const k of ['pressed', 'flagged', 'unlinked']) {
    assert.ok(view[k] instanceof Uint8Array, k);
    assert.deepEqual(arr(view[k]), [0, 0, 0, 0], k);
  }
  // per-cell revealed, flagged and hidden are the engine's own arrays while the game is not lost
  assert.equal(view.pressed, game.state.revealed);
  assert.equal(view.flagged, game.state.flagged);
  assert.equal(view.unlinked, game.state.hidden);
  assert.equal(view.state, 'playing');
  assert.equal(view.phase, PHASE.PLAYING);
  assert.equal(view.explodedIdx, -1);
  assert.equal(view.minesLeft, 1);
  assert.equal(view.version, 0);
  assert.deepEqual(arr(view.dirty), []);
  assert.ok(Object.isFrozen(view));
});

test('reveal: opened cells read as pressed, a satisfied zero as unlinked, and are dirty', () => {
  const { view, game } = row();
  const r = view.apply(game.reveal(0));
  assert.equal(r.ended, false, 'apply returns the action result');
  assert.deepEqual(arr(view.pressed), [1, 1, 0, 0]);
  assert.deepEqual(arr(view.unlinked), [1, 0, 0, 0]);
  assert.equal(view.version, 1);
  assert.deepEqual(sorted(view.dirty), [0, 1]);
});

test('flag hides a satisfied number; unflag un-hides it; minesLeft follows the flags', () => {
  const { view, game } = row();
  view.apply(game.reveal(0));
  view.consumeDirty();
  view.apply(game.toggleFlag(2));
  assert.deepEqual(arr(view.flagged), [0, 0, 1, 0]);
  assert.deepEqual(arr(view.unlinked), [1, 1, 0, 0], 'cell 1 hides once its mine is flagged');
  assert.equal(view.minesLeft, 0);
  assert.deepEqual(sorted(view.consumeDirty()), [1, 2]);
  view.apply(game.toggleFlag(2));
  assert.deepEqual(arr(view.flagged), [0, 0, 0, 0]);
  assert.deepEqual(arr(view.unlinked), [1, 0, 0, 0], 'unflagging un-hides its neighbours');
  assert.equal(view.minesLeft, 1);
  assert.deepEqual(sorted(view.consumeDirty()), [1, 2]);
  assert.equal(view.version, 3);
});

test('a flag click on a revealed cell flags its closed neighbours', () => {
  const { view, game } = row();
  view.apply(game.reveal(0));
  view.consumeDirty();
  view.apply(game.toggleFlag(1));
  assert.deepEqual(arr(view.flagged), [0, 0, 1, 0]);
  assert.ok(sorted(view.consumeDirty()).includes(2));
});

test('chord opens the unflagged neighbours and the win reads as won', () => {
  const { view, game } = setup(3, 1, 1, [0]); // 0 (mine), 1 (1), 2 (0)
  view.apply(game.reveal(1));
  view.apply(game.toggleFlag(0));
  view.consumeDirty();
  const r = view.apply(game.chord(1));
  assert.equal(r.ended, true);
  assert.equal(view.state, 'won');
  assert.equal(view.phase, PHASE.WON);
  assert.deepEqual(arr(view.pressed), [0, 1, 1]);
  assert.ok(sorted(view.consumeDirty()).includes(2));
});

test('a loss reads as the 3D front-end presents it: every cell pressed, no flag, none unlinked, all dirty', () => {
  const { view, game } = setup(5, 1, 1, [2, 4]); // 0 (0), 1 (1), 2 (mine), 3 (2), 4 (mine)
  view.apply(game.reveal(0));
  view.apply(game.toggleFlag(3)); // a wrong flag
  view.consumeDirty();
  const v = view.version;
  view.apply(game.reveal(2));
  assert.equal(view.state, 'lost');
  assert.equal(view.phase, PHASE.LOST);
  assert.equal(view.explodedIdx, 2);
  assert.deepEqual(arr(view.pressed), [1, 1, 1, 1, 1]);
  assert.deepEqual(arr(view.flagged), [0, 0, 0, 0, 0]);
  assert.deepEqual(arr(view.unlinked), [0, 0, 0, 0, 0]);
  assert.deepEqual(arr(view.number), [0, 1, -1, 2, -1]);
  assert.equal(view.version, v + 1);
  assert.deepEqual(sorted(view.consumeDirty()), [0, 1, 2, 3, 4]);
  // the engine's own state is untouched by the presentation
  assert.equal(game.state.revealed[4], 0);
  assert.equal(game.state.flagged[3], 1);
});

test('awaiting the first click reads as playing; the supplied board fills the numbers', () => {
  const box = createBoxGrid(4, 1, 1);
  const game = createGame({ graph: box.graph, profile: PROFILE_3D, mineCount: 1 });
  const view = createStateView3D(game, box);
  assert.equal(view.state, 'playing');
  assert.equal(view.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.deepEqual(arr(view.number), [0, 0, 0, 0]);
  const req = view.apply(game.reveal(0));
  assert.equal(req.boardNeeded, 0);
  assert.equal(view.version, 0, 'a board request changes nothing');
  view.apply(game.supplyBoard(0, [2]));
  assert.equal(view.phase, PHASE.PLAYING);
  assert.deepEqual(arr(view.number), [0, 1, -1, 1]);
  assert.deepEqual(arr(view.pressed), [1, 1, 0, 0]);
  assert.equal(view.version, 1);
});

test('drain: dirty is a copy that does not drain; consumeDirty drains once; a cell appears once', () => {
  const { view, game } = row();
  view.apply(game.reveal(0));
  view.apply(game.toggleFlag(2));
  view.apply(game.toggleFlag(2)); // cell 2 and 1 change twice
  const peek = view.dirty;
  assert.ok(peek instanceof Int32Array);
  assert.deepEqual(sorted(peek), [0, 1, 2]);
  peek[0] = 3;
  assert.deepEqual(sorted(view.dirty), [0, 1, 2], 'the peek is a copy');
  const d = view.consumeDirty();
  assert.deepEqual(sorted(d), [0, 1, 2]);
  assert.deepEqual(arr(view.consumeDirty()), [], 'drained');
  assert.deepEqual(arr(view.dirty), []);
  assert.deepEqual(sorted(d), [0, 1, 2], 'the drained set is the consumer\'s own copy');
});

test('the change counter moves only when an action changed something', () => {
  const { view, game } = row();
  view.apply(game.reveal(0));
  const v = view.version;
  view.apply(game.reveal(0)); // wasted reveal on a revealed cell
  view.apply(game.chord(3)); // chord on a closed cell
  assert.equal(view.version, v);
  assert.deepEqual(sorted(view.consumeDirty()), [0, 1]);
  view.apply(game.toggleFlag(3));
  assert.equal(view.version, v + 1);
});

test('the view rejects a game whose graph is not the box\'s', () => {
  const box = createBoxGrid(4, 1, 1);
  const other = createBoxGrid(2, 2, 1);
  const game = createGameWithMines({ graph: other.graph, profile: PROFILE_3D, mines: [0] });
  assert.throws(() => createStateView3D(game, box), RangeError);
  assert.throws(() => createStateView3D(null, box), RangeError);
});

// ---------- the large-board memory check (100 x 100 x 100) ----------
// Bytes retained in ArrayBuffers by what `build` returns: the growth of
// process.memoryUsage().arrayBuffers across the build, after a full collection either side so
// transient buffers do not count. The figures are recorded in the feature document.
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const MB = 1e6;
function retainedBytes(build) {
  gc(); gc();
  const before = process.memoryUsage().arrayBuffers;
  const kept = build();
  gc(); gc();
  return { kept, bytes: process.memoryUsage().arrayBuffers - before };
}

test('memory: a 100 x 100 x 100 game on the shared engine', () => {
  const S = 100, n = S * S * S;
  const mines = [];
  for (let c = 1; c < n; c += 50) mines.push(c); // 20 000 mines, cell 0 safe
  const box = retainedBytes(() => createBoxGrid(S, S, S));
  const game = retainedBytes(() => createGameWithMines({ graph: box.kept.graph, profile: PROFILE_3D, mines }));
  const view = retainedBytes(() => {
    const v = createStateView3D(game.kept, box.kept);
    v.apply(game.kept.reveal(0));
    v.number; // the view's number array is built
    return v;
  });
  assert.ok(view.kept);
  // Box graph 0, game with the 3D profile and its counts 31 bytes a cell, state view 6 bytes a
  // cell — 37 in all.
  const near = (m, perCell, what) => assert.ok(Math.abs(m.bytes - perCell * n) < 0.5 * MB, `${what} retained ${m.bytes} bytes`);
  near(box, 0, 'box graph');
  near(game, 31, 'shared engine game');
  near(view, 6, '3D state view');
});
