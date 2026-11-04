import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoardIdentity, boardKey, STANDARD_BOARDS, PRESETS_3D } from '../js/records/board.js';
import { CATALOGUE, THRESHOLDS } from '../js/achievements/catalogue.js';
import { earned, NO_FLAGS_FROM_HISTORY } from '../js/achievements/evaluate.js';
import { compactSummary } from '../js/records/model.js';

const classic = (name, noGuess = true, extra = {}) => {
  const b = STANDARD_BOARDS.find((s) => s.name === name);
  return createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: b.width, height: b.height, mines: b.mines, noGuess, ...extra });
};
const cube = (name, noGuess = true, extra = {}) => {
  const p = PRESETS_3D.find((s) => s.family === 'Cube' && s.name === name);
  return createBoardIdentity({ mode: '3d', width: p.width, height: p.height, depth: p.depth, mines: p.mines, noGuess, ...extra });
};

// A slow, wasteful win by default: earns only the board's own win achievements. BBBV divides
// 100 × BBBV by every efficiency threshold, so a whole click count lands on each one exactly.
const BBBV = 390;
const clicks = ({ reveal = 1000, flag = 0, flagWasted = 0, chord = 0 } = {}) => ({
  reveal: { effective: reveal, wasted: 0 },
  flag: { effective: flag, wasted: flagWasted },
  chord: { effective: chord, wasted: 0 },
});
const game = (board, { outcome = 'won', elapsedMs = 10_000_000, bbbv = BBBV, bbbvSolved = bbbv, click = clicks(), ...rest } = {}) => ({
  id: 'g-1', board: { ...board }, outcome, elapsedMs, pauses: 0, pausedMs: 0, bbbv, bbbvSolved, clicks: click,
  seed: 1, generatorVersion: 1, endedAt: '2026-11-04T12:00:00.000Z', ...rest,
});
// An elapsed time giving `rate` 3BV/s on BBBV.
const msFor = (rate) => Math.round((BBBV * 1000) / rate);
const flagged = clicks({ flag: 1 });

const has = (s, name) => earned(s).includes(name);

// ---------- the catalogue ----------

test('the catalogue pins its fourteen API names, in order', () => {
  assert.deepEqual(CATALOGUE.map((a) => a.name), [
    'CLASSIC_BEGINNER_WIN', 'CLASSIC_INTERMEDIATE_WIN', 'CLASSIC_EXPERT_WIN',
    'CLASSIC_EXPERT_HARD_WAY',
    'CLASSIC_EXPERT_SPEED_1', 'CLASSIC_EXPERT_SPEED_2', 'CLASSIC_EXPERT_SPEED_3',
    'CLASSIC_EFFICIENCY_1', 'CLASSIC_EFFICIENCY_2',
    'CLASSIC_NO_FLAGS',
    'CUBE_BEGINNER_WIN', 'CUBE_INTERMEDIATE_WIN', 'CUBE_EXPERT_WIN',
    'CUBE_EXPERT_SPEED',
  ]);
  assert.ok(Object.isFrozen(CATALOGUE) && CATALOGUE.every(Object.isFrozen));
});

test('the thresholds are frozen constants in one place, ascending per tier', () => {
  assert.ok(Object.isFrozen(THRESHOLDS));
  assert.equal(THRESHOLDS.expertSpeed.length, 3);
  assert.equal(THRESHOLDS.efficiency.length, 2);
  for (const tiers of [THRESHOLDS.expertSpeed, THRESHOLDS.efficiency]) {
    assert.ok(Object.isFrozen(tiers));
    assert.ok(tiers.every((t, i) => i === 0 || t > tiers[i - 1]));
  }
  assert.equal(typeof THRESHOLDS.cubeExpertSpeed, 'number');
});

test('the thresholds hold the values calibrated for the published Steamworks text', () => {
  assert.deepEqual(THRESHOLDS.expertSpeed, [1, 1.5, 2.5]);
  assert.deepEqual(THRESHOLDS.efficiency, [100, 130]);
  assert.equal(THRESHOLDS.cubeExpertSpeed, 0.2);
});

// ---------- Classic 2D firsts and Expert the hard way ----------

test('a Classic 2D win earns its board\'s win, nothing more on a slow, flagged game', () => {
  const opts = { click: flagged };
  assert.deepEqual(earned(game(classic('Beginner'), opts)), ['CLASSIC_BEGINNER_WIN']);
  assert.deepEqual(earned(game(classic('Intermediate'), opts)), ['CLASSIC_INTERMEDIATE_WIN']);
  assert.deepEqual(earned(game(classic('Expert'), opts)), ['CLASSIC_EXPERT_WIN']);
});

test('Expert the hard way needs no-guess off', () => {
  assert.ok(has(game(classic('Expert', false)), 'CLASSIC_EXPERT_HARD_WAY'));
  assert.ok(!has(game(classic('Expert', true)), 'CLASSIC_EXPERT_HARD_WAY'));
  assert.ok(!has(game(classic('Intermediate', false)), 'CLASSIC_EXPERT_HARD_WAY'));
  assert.ok(has(game(classic('Beginner', false)), 'CLASSIC_BEGINNER_WIN'), 'a win counts with no-guess on or off');
});

// ---------- Expert speed ----------

test('Expert speed: each tier at, just above and just below its threshold', () => {
  THRESHOLDS.expertSpeed.forEach((t, i) => {
    const name = `CLASSIC_EXPERT_SPEED_${i + 1}`;
    const earns = (board, rate) => has(game(classic(board), { elapsedMs: msFor(rate) }), name);
    assert.ok(earns('Expert', t), `${name} at ${t}`);
    assert.ok(earns('Expert', t + 0.05), `${name} above ${t}`);
    assert.ok(!earns('Expert', t - 0.01), `${name} below ${t}`);
    assert.ok(!earns('Intermediate', t + 1), `${name} is Expert only`);
  });
});

test('3BV/s is judged at the results screen\'s two decimals, so a shown threshold earns its tier', () => {
  const t = THRESHOLDS.expertSpeed[0];
  const s = game(classic('Expert'), { elapsedMs: Math.floor((BBBV * 1000) / (t - 0.004)) });
  assert.ok(s.bbbvSolved / (s.elapsedMs / 1000) < t);
  assert.equal((s.bbbvSolved / (s.elapsedMs / 1000)).toFixed(2), t.toFixed(2));
  assert.ok(has(s, 'CLASSIC_EXPERT_SPEED_1'));
});

test('a faster tier implies the slower ones', () => {
  const top = THRESHOLDS.expertSpeed.at(-1);
  const got = earned(game(classic('Expert'), { elapsedMs: msFor(top) }));
  for (let i = 1; i <= THRESHOLDS.expertSpeed.length; i += 1) assert.ok(got.includes(`CLASSIC_EXPERT_SPEED_${i}`));
});

test('no elapsed time earns no speed tier', () => {
  assert.ok(!earned(game(classic('Expert'), { elapsedMs: 0 })).some((n) => n.startsWith('CLASSIC_EXPERT_SPEED')));
});

// ---------- Efficiency ----------

// Clicks giving `pct` efficiency on BBBV, all reveal clicks; never zero.
const clicksFor = (pct) => clicks({ reveal: Math.round((100 * BBBV) / pct) });

test('Efficiency: each tier at and around its threshold, on Intermediate or Expert', () => {
  THRESHOLDS.efficiency.forEach((t, i) => {
    const name = `CLASSIC_EFFICIENCY_${i + 1}`;
    const at = clicksFor(t).reveal.effective;
    assert.equal((100 * BBBV) / at, t, 'the fixture lands on the threshold');
    const earns = (board, reveal) => has(game(classic(board), { click: clicks({ reveal }) }), name);
    for (const board of ['Intermediate', 'Expert']) {
      assert.ok(earns(board, at), `${name} at ${t} on ${board}`);
      assert.ok(earns(board, at - 1), `${name} above ${t} on ${board}`);
      assert.ok(!earns(board, at + 1), `${name} below ${t} on ${board}`);
    }
    assert.ok(!earns('Beginner', at), `${name} is not a Beginner achievement`);
  });
});

test('efficiency counts every click, wasted flag clicks included', () => {
  const t = THRESHOLDS.efficiency[0];
  const at = clicksFor(t).reveal.effective;
  assert.ok(has(game(classic('Expert'), { click: clicks({ reveal: at - 1, flag: 1 }) }), 'CLASSIC_EFFICIENCY_1'));
  assert.ok(!has(game(classic('Expert'), { click: clicks({ reveal: at, flagWasted: 1 }) }), 'CLASSIC_EFFICIENCY_1'));
});

test('no counted click earns no efficiency tier', () => {
  const got = earned(game(classic('Expert'), { click: clicks({ reveal: 0 }) }));
  assert.ok(!got.some((n) => n.startsWith('CLASSIC_EFFICIENCY')));
});

// ---------- No flags ----------

test('No flags: an Intermediate or Expert win with no flag click at all', () => {
  assert.ok(has(game(classic('Intermediate')), 'CLASSIC_NO_FLAGS'));
  assert.ok(has(game(classic('Expert')), 'CLASSIC_NO_FLAGS'));
  assert.ok(!has(game(classic('Beginner')), 'CLASSIC_NO_FLAGS'));
  assert.ok(has(game(classic('Expert'), { click: clicks({ chord: 3 }) }), 'CLASSIC_NO_FLAGS'), 'chords are not flags');
});

test('No flags: a flag placed, even one placed and removed, disqualifies the game', () => {
  assert.ok(!has(game(classic('Expert'), { click: clicks({ flag: 1 }) }), 'CLASSIC_NO_FLAGS'));
  assert.ok(!has(game(classic('Expert'), { click: clicks({ flag: 1, flagWasted: 1 }) }), 'CLASSIC_NO_FLAGS'));
  assert.ok(!has(game(classic('Intermediate'), { click: clicks({ flagWasted: 1 }) }), 'CLASSIC_NO_FLAGS'));
});

// ---------- 3D cube presets ----------

test('a win on each cube preset earns its preset\'s win', () => {
  assert.deepEqual(earned(game(cube('Beginner'))), ['CUBE_BEGINNER_WIN']);
  assert.deepEqual(earned(game(cube('Intermediate'))), ['CUBE_INTERMEDIATE_WIN']);
  assert.deepEqual(earned(game(cube('Expert'))), ['CUBE_EXPERT_WIN']);
  assert.deepEqual(earned(game(cube('Beginner', false))), ['CUBE_BEGINNER_WIN'], 'no-guess on or off');
});

test('Cube Intro, a 3D board outside the three presets, earns nothing', () => {
  assert.deepEqual(earned(game(cube('Intro'))), []);
});

test('3D cube Expert speed at and around its threshold, cube Expert only', () => {
  const t = THRESHOLDS.cubeExpertSpeed;
  assert.ok(has(game(cube('Expert'), { elapsedMs: msFor(t) }), 'CUBE_EXPERT_SPEED'));
  assert.ok(has(game(cube('Expert'), { elapsedMs: msFor(t + 0.05) }), 'CUBE_EXPERT_SPEED'));
  assert.ok(!has(game(cube('Expert'), { elapsedMs: msFor(t - 0.01) }), 'CUBE_EXPERT_SPEED'));
  assert.ok(!has(game(cube('Intermediate'), { elapsedMs: msFor(t + 1) }), 'CUBE_EXPERT_SPEED'));
});

test('a 3D win earns no Classic 2D achievement, however fast, efficient or flagless', () => {
  const got = earned(game(cube('Expert'), { elapsedMs: msFor(10), click: clicks({ reveal: 1 }) }));
  assert.deepEqual(got, ['CUBE_EXPERT_WIN', 'CUBE_EXPERT_SPEED']);
});

// ---------- what earns nothing ----------

const BEST = { elapsedMs: msFor(100), click: clicks({ reveal: 1 }) };

test('losses and abandoned games earn nothing', () => {
  for (const outcome of ['lost', 'abandoned']) {
    assert.deepEqual(earned(game(classic('Expert', false), { ...BEST, outcome, bbbvSolved: BBBV - 1 })), []);
    assert.deepEqual(earned(game(cube('Expert'), { ...BEST, outcome, bbbvSolved: BBBV - 1 })), []);
  }
});

test('custom boards earn nothing, a standard size with another mine count or a former 3D preset included', () => {
  const customs = [
    createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 98, noGuess: false }),
    createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 5, height: 5, mines: 1, noGuess: false }),
    createBoardIdentity({ mode: '3d', width: 8, height: 8, depth: 2, mines: 10, noGuess: true }),
    createBoardIdentity({ mode: '3d', width: 25, height: 16, depth: 2, mines: 99, noGuess: false }),
    createBoardIdentity({ mode: '3d', width: 12, height: 12, depth: 8, mines: 130, noGuess: true }),
  ];
  for (const board of customs) assert.deepEqual(earned(game(board, BEST)), [], boardKey(board));
});

test('Hexagon and Triangle boards of the standard sizes earn nothing', () => {
  const hex = createBoardIdentity({ mode: 'hexagon', grid: 'hex', width: 30, height: 16, mines: 100, noGuess: false });
  const tri = createBoardIdentity({ mode: 'triangle', grid: 'tri', width: 41, height: 17, mines: 103, noGuess: false });
  assert.deepEqual(earned(game(hex, BEST)), []);
  assert.deepEqual(earned(game(tri, BEST)), []);
});

test('a Daily board is a board of its own, not a standard board, and earns nothing', () => {
  assert.deepEqual(earned(game(classic('Expert', true, { daily: true }), { ...BEST, daily: '20261104' })), []);
  assert.deepEqual(earned(game(cube('Intermediate', true, { daily: true }), { ...BEST, daily: '20261104' })), []);
});

// ---------- purity and the history form ----------

test('earned is pure and deterministic: same answer each time, the summary untouched', () => {
  const s = game(classic('Expert', false), BEST);
  const before = structuredClone(s);
  const first = earned(s);
  assert.deepEqual(earned(s), first);
  assert.deepEqual(s, before);
  assert.deepEqual(first, CATALOGUE.map((a) => a.name).filter((n) => n.startsWith('CLASSIC_EXPERT') || n.startsWith('CLASSIC_EFFICIENCY') || n === 'CLASSIC_NO_FLAGS'));
});

test('the compact history keeps clicks by kind, so a history entry is judged like its summary, no flags included', () => {
  assert.equal(NO_FLAGS_FROM_HISTORY, true);
  const cases = [
    game(classic('Expert', false), BEST),
    game(classic('Intermediate'), { click: clicks({ flag: 1, flagWasted: 1 }) }),
    game(cube('Expert'), { elapsedMs: msFor(THRESHOLDS.cubeExpertSpeed) }),
    game(classic('Expert', true, { daily: true }), { ...BEST, daily: '20261104' }),
    game(classic('Beginner'), { outcome: 'lost', bbbvSolved: BBBV - 1 }),
  ];
  for (const s of cases) {
    const entry = compactSummary(s);
    assert.equal(entry.board, undefined, 'a history entry names its board by key');
    assert.deepEqual(earned(entry), earned(s), entry.boardKey);
  }
});
