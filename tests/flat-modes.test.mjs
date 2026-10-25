// Flat mode configuration (js/flat-modes.js): what differs between the three flat modes, its
// validation at registration, Classic 2D as the square configuration, and the Classic 2D board
// setup, last choice, session and mode built from a configuration.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defineFlatMode, CLASSIC_2D, HEXAGON, TRIANGLE, FLAT_MODES, FLAT_SIZES } from '../js/flat-modes.js';
import * as classic2d from '../js/classic2d/board-setup.js';
import { boardSetup, normaliseChoice, createLastChoice, DEFAULT_CHOICE } from '../js/classic2d/board-setup.js';
import * as hexagon from '../js/hexagon/board-setup.js';
import * as triangle from '../js/triangle/board-setup.js';
import { createSession } from '../js/classic2d/session.js';
import { createClassic2DMode } from '../js/classic2d/mode.js';
import { readChoice, customStatus } from '../js/classic2d/board-choice.js';
import { createModeHost } from '../js/shell/mode-host.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { startCell } from '../js/generation/start-cell.js';
import { generate } from '../js/generation/generate.js';
import { createButtonSwap } from '../js/classic2d/button-swap.js';
import { boardKey } from '../js/records/board.js';

const spec = (over = {}) => ({
  id: hexagon.MODE,
  name: 'Hexagon',
  grid: hexagon.GRID,
  standardSizes: hexagon.STANDARD_SIZES,
  validateCustom: hexagon.validateCustom,
  maxMines: hexagon.maxMines,
  lastChoiceDoc: 'hexagon.lastChoice',
  ...over,
});
const HEX = defineFlatMode(spec());
const TRI = defineFlatMode(spec({
  id: triangle.MODE, name: 'Triangle', grid: triangle.GRID, standardSizes: triangle.STANDARD_SIZES, lastChoiceDoc: 'triangle.lastChoice',
}));
const memoryStorage = (initial) => createStorage({ backend: createMemoryBackend({ initial }) });

// ---------------------------------------------------------------- the configuration

test('flat modes: Classic 2D is the square configuration, from Classic 2D\'s board setup values and the square geometry', () => {
  assert.equal(CLASSIC_2D.id, classic2d.MODE);
  assert.equal(CLASSIC_2D.name, 'Classic 2D');
  assert.equal(CLASSIC_2D.grid, 'square');
  assert.deepEqual(CLASSIC_2D.standardSizes, classic2d.STANDARD_SIZES);
  assert.equal(CLASSIC_2D.validateCustom, classic2d.validateCustom);
  assert.equal(CLASSIC_2D.maxMines, classic2d.maxMines);
  assert.equal(CLASSIC_2D.lastChoiceDoc, classic2d.LAST_CHOICE_DOC);
  for (const field of ['id', 'grid', 'standardSizes', 'validateCustom', 'maxMines', 'lastChoiceDoc']) {
    assert.deepEqual(classic2d.SQUARE_SETUP[field], CLASSIC_2D[field], `board setup's square values: ${field}`);
  }
  const geometry = CLASSIC_2D.createGeometry(9, 7);
  assert.equal(geometry.kind, 'square');
  assert.deepEqual([geometry.width, geometry.height, geometry.count], [9, 7, 63]);
  assert.equal(CLASSIC_2D.createGrid(9, 7).graph.count, 63);
});

test('flat modes: Hexagon and Triangle are the hex and tri configurations, from their board setups, each with its own last-choice document', () => {
  for (const [config, setup, name, doc] of [[HEXAGON, hexagon, 'Hexagon', 'hexagon.lastChoice'], [TRIANGLE, triangle, 'Triangle', 'triangle.lastChoice']]) {
    assert.equal(config.id, setup.MODE, 'the menu entry\'s id');
    assert.equal(config.name, name);
    assert.equal(config.grid, setup.GRID);
    assert.deepEqual(config.standardSizes, setup.STANDARD_SIZES);
    assert.equal(config.validateCustom, setup.validateCustom);
    assert.equal(config.maxMines, setup.maxMines);
    assert.equal(config.lastChoiceDoc, doc);
    assert.equal(config.createGeometry(4, 3).kind, setup.GRID);
  }
  assert.deepEqual(FLAT_MODES.map((c) => c.id), ['classic-2d', 'hexagon', 'triangle']);
  assert.equal(new Set(FLAT_MODES.map((c) => c.lastChoiceDoc)).size, 3, 'one document per mode');
  assert.ok(Object.isFrozen(FLAT_MODES));
  // A board's code prefix is the board-code table's (js/records/board-code.js), not the configuration's.
  for (const config of FLAT_MODES) assert.ok(!Object.hasOwn(config, 'codeToken'), `${config.id} carries no code token`);
});

test('flat modes: Hexagon\'s and Triangle\'s last board choices are stored in Classic 2D\'s shape; an invalid one reads as Beginner with no-guess on and is never saved', async () => {
  for (const config of [HEXAGON, TRIANGLE]) {
    const backend = createMemoryBackend({ initial: { [config.lastChoiceDoc]: JSON.stringify({ version: 1, data: { size: 'giant', noGuess: true } }) } });
    const storage = createStorage({ backend });
    const last = createLastChoice({ storage, config });
    assert.deepEqual(await last.load(), DEFAULT_CHOICE, `${config.id}: the default`);
    assert.deepEqual([DEFAULT_CHOICE.size, DEFAULT_CHOICE.noGuess], ['beginner', true]);
    assert.equal(JSON.parse(backend.documents.get(config.lastChoiceDoc)).data.size, 'giant', `${config.id}: an invalid choice is never saved`);
    await assert.rejects(() => last.save({ size: 'giant', noGuess: true }), RangeError);
    await last.save({ size: 'custom', custom: { width: 40, height: 20, mines: 120 }, noGuess: false });
    assert.deepEqual(JSON.parse(backend.documents.get(config.lastChoiceDoc)), { version: 1, data: { size: 'custom', custom: { width: 40, height: 20, mines: 120 }, noGuess: false } });
  }
});

test('flat modes: a configuration is immutable, its standard sizes copied and frozen', () => {
  const sizes = { beginner: { width: 9, height: 9, mines: 10 }, intermediate: { width: 16, height: 16, mines: 40 }, expert: { width: 30, height: 16, mines: 99 } };
  const config = defineFlatMode(spec({ standardSizes: sizes }));
  sizes.beginner.width = 50;
  assert.equal(config.standardSizes.beginner.width, 9);
  for (const c of [config, CLASSIC_2D, HEX, TRI]) {
    assert.ok(Object.isFrozen(c));
    assert.ok(Object.isFrozen(c.standardSizes));
    assert.ok(Object.values(c.standardSizes).every(Object.isFrozen));
    assert.deepEqual(Object.keys(c.standardSizes), FLAT_SIZES);
    assert.throws(() => { 'use strict'; c.grid = 'hex'; }, TypeError);
  }
});

test('flat modes: each grid kind builds its own graph provider and geometry', () => {
  for (const [config, kind] of [[CLASSIC_2D, 'square'], [HEX, 'hex'], [TRI, 'tri']]) {
    assert.equal(config.createGeometry(5, 4).kind, kind);
    assert.equal(config.createGrid(5, 4).graph.count, 20);
  }
});

test('flat modes: an unknown grid kind throws at registration', () => {
  for (const grid of ['octagon', 'box', '', undefined, 3]) {
    assert.throws(() => defineFlatMode(spec({ grid })), RangeError, String(grid));
  }
});

test('flat modes: standard sizes outside the configuration\'s own custom limits throw at registration', () => {
  const bad = [
    { ...hexagon.STANDARD_SIZES, expert: { width: 101, height: 16, mines: 100 } },
    { ...hexagon.STANDARD_SIZES, beginner: { width: 9, height: 9, mines: 0 } },
    { ...hexagon.STANDARD_SIZES, intermediate: { width: 16, height: 16, mines: 256 } },
  ];
  for (const standardSizes of bad) assert.throws(() => defineFlatMode(spec({ standardSizes })), RangeError);
  // The configuration's own limits decide: a validator that caps a side at 20 refuses Expert's 30.
  const narrow = (c) => (c.width > 20 ? { ok: false, field: 'width', reason: 'too wide' } : hexagon.validateCustom(c));
  assert.throws(() => defineFlatMode(spec({ validateCustom: narrow })), /expert/);
  // A missing standard size is refused too.
  const { expert, ...two } = hexagon.STANDARD_SIZES;
  assert.throws(() => defineFlatMode(spec({ standardSizes: two })), RangeError);
});

test('flat modes: a configuration needs its id, name, limits, last-choice document', () => {
  for (const over of [
    { id: '' }, { name: '' }, { lastChoiceDoc: '' }, { validateCustom: null }, { maxMines: 'x' },
  ]) {
    assert.throws(() => defineFlatMode(spec(over)), RangeError, JSON.stringify(over));
  }
});

// ---------------------------------------------------------------- board setup and last choice

test('flat modes: Classic 2D\'s board setup without a configuration is the square configuration\'s', () => {
  for (const choice of [
    { size: 'beginner', noGuess: true }, { size: 'expert', noGuess: false },
    { size: 'custom', custom: { width: 12, height: 5, mines: 9 }, noGuess: true },
  ]) {
    const a = boardSetup(choice);
    const b = boardSetup(choice, CLASSIC_2D);
    assert.deepEqual(b.choice, a.choice);
    assert.deepEqual([b.width, b.height, b.mines, b.noGuess], [a.width, a.height, a.mines, a.noGuess]);
    assert.deepEqual(b.identity, a.identity);
    assert.equal(boardKey(b.identity), boardKey(a.identity));
    assert.deepEqual(b.request(3, 42), a.request(3, 42));
    assert.equal(b.grid.graph.count, a.grid.graph.count);
  }
});

test('flat modes: a configured board setup takes the configuration\'s mode, grid and standard sizes', () => {
  const s = boardSetup({ size: 'expert', noGuess: false }, HEX);
  assert.deepEqual([s.width, s.height, s.mines], [30, 16, 100]);
  assert.equal(s.identity.mode, 'hexagon');
  assert.equal(s.identity.grid, 'hex');
  assert.deepEqual(s.request(5, 9).graph, { kind: 'hex', width: 30, height: 16 });
  assert.equal(s.grid.graph.count, 480);
  const t = boardSetup({ size: 'beginner', noGuess: true }, TRI);
  assert.deepEqual([t.identity.mode, t.identity.grid, t.width, t.height, t.mines], ['triangle', 'tri', 13, 7, 8]);
  assert.throws(() => boardSetup({ size: 'custom', custom: { width: 0, height: 3, mines: 1 }, noGuess: false }, HEX), RangeError);
  assert.deepEqual(normaliseChoice({ size: 'beginner', noGuess: true }, HEX), normaliseChoice({ size: 'beginner', noGuess: true }));
});

test('flat modes: the last board choice is one document per configuration, Classic 2D\'s unchanged', async () => {
  const backend = createMemoryBackend();
  const storage = createStorage({ backend });
  const square = createLastChoice({ storage });
  const hex = createLastChoice({ storage, config: HEX });
  assert.deepEqual(hex.current, DEFAULT_CHOICE);
  await hex.save({ size: 'expert', noGuess: false });
  await square.save({ size: 'intermediate', noGuess: true });
  assert.deepEqual(await storage.load('hexagon.lastChoice'), { size: 'expert', custom: DEFAULT_CHOICE.custom, noGuess: false });
  assert.deepEqual(await storage.load(classic2d.LAST_CHOICE_DOC), { size: 'intermediate', custom: DEFAULT_CHOICE.custom, noGuess: true });
  const again = createLastChoice({ storage: createStorage({ backend }), config: HEX });
  assert.equal((await again.load()).size, 'expert');
  const configured = createLastChoice({ storage: memoryStorage(), config: CLASSIC_2D });
  await configured.save({ size: 'beginner', noGuess: false });
  assert.equal(configured.current.size, 'beginner');
});

test('flat modes: the board choice\'s helpers read a configuration\'s limits', () => {
  const capped = defineFlatMode(spec({
    validateCustom: (c) => (c.mines > 120 ? { ok: false, field: 'mines', reason: 'at most 120 here' } : hexagon.validateCustom(c)),
    maxMines: (w, h) => Math.min(120, hexagon.maxMines(w, h)),
  }));
  const custom = { width: 30, height: 16, mines: 150 };
  assert.equal(customStatus(custom).ok, true);
  assert.equal(customStatus(custom, capped).ok, false);
  assert.equal(customStatus({ ...custom, mines: 10 }, capped).max, 120);
  assert.equal(readChoice({ size: 'custom', fields: custom, noGuess: false }, null, capped), null);
  assert.equal(readChoice({ size: 'custom', fields: custom, noGuess: false }).size, 'custom');
});

// ---------------------------------------------------------------- the session and the mode

const fakeClock = () => {
  let t = 1000;
  let next = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const h = next++; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout(h) { timers.delete(h); },
    advance(ms) { t += ms; for (const [h, x] of [...timers]) if (x.at <= t) { timers.delete(h); x.fn(); } },
  };
};
const defaultMines = (req) => {
  const out = [];
  for (let c = 0; out.length < req.mineCount; c++) if (c !== req.firstClick) out.push(c);
  return out;
};
const fakeClient = () => {
  const c = {
    requests: [],
    warm: () => Promise.resolve(true),
    request(req) { c.requests.push(req); return Promise.resolve({ ok: true, mines: defaultMines(req), seed: req.seed, generatorVersion: 1 }); },
    cancel() {},
  };
  return c;
};

test('flat modes: a configured session plays its grid, the first reveal\'s board placed on it', () => {
  const s = createSession({ choice: { size: 'beginner', noGuess: false }, config: HEX, client: fakeClient(), clock: fakeClock(), randomSeed: () => 5, place: generate });
  assert.equal(s.identity.mode, 'hexagon');
  assert.equal(s.setup.grid.graph.count, 81);
  const r = s.reveal(40);
  assert.ok(r && r.changed.length > 0);
  assert.equal(s.state, 'playing');
});

function fakeMounts() {
  const log = { boards: [], pointers: [], cursors: [] };
  const board = (options) => {
    const v = {
      options, update() {}, setGame() {}, setMark() {}, setHidden() {}, setScale() {}, showEffect() {}, setCursor() {}, destroy() {},
    };
    log.boards.push(v);
    return v;
  };
  const input = (list) => (opts) => {
    const m = { ...opts, input: { reset() {} }, destroy() {}, pad() {} };
    list.push(m);
    return m;
  };
  return { log, mount: { board, pointer: input(log.pointers), cursor: input(log.cursors) } };
}
const fakeFlow = (calls = []) => ({
  calls,
  openBoardChoice: (choice) => calls.push(['openBoardChoice', choice]),
  show() {}, container: () => ({}), hud() {}, board: (b) => calls.push(['board', b]), generating() {}, failed() {},
  scale: () => '150',
});

test('flat modes: each mode instance builds its session, view, inputs, generation client and pre-generated board from its configuration, sharing the button swap and the board scale', async () => {
  const host = createModeHost();
  const swap = createButtonSwap();
  const made = [];
  const createClient = () => { const c = fakeClient(); made.push(c); return c; };
  const square = { flow: fakeFlow(), ...fakeMounts() };
  const hex = { flow: fakeFlow(), ...fakeMounts() };
  const hexChoice = createLastChoice({ storage: memoryStorage(), config: HEX });
  let seed = 3;
  const common = { createClient, clock: fakeClock(), randomSeed: () => seed++, buttonSwap: swap };
  const squareMode = host.register('classic-2d', (report) => createClassic2DMode(report, {
    ...common, flow: square.flow, mount: square.mount, lastChoice: createLastChoice({ storage: memoryStorage() }),
  }));
  const hexMode = host.register('hexagon', (report) => createClassic2DMode(report, {
    ...common, config: HEX, flow: hex.flow, mount: hex.mount, lastChoice: hexChoice,
  }));

  host.start('hexagon', { size: 'beginner', noGuess: true });
  const view = hex.log.boards.at(-1).options;
  assert.equal(view.geometry.kind, 'hex');
  assert.equal(view.grid.graph.count, 81);
  assert.equal(view.scale, '150');
  assert.equal(hex.log.cursors.at(-1).geometry.kind, 'hex');
  assert.equal(hex.log.pointers.at(-1).swap, swap);
  const board = hex.flow.calls.find(([k]) => k === 'board')[1];
  assert.deepEqual([board.identity.mode, board.identity.grid, board.width, board.height, board.mines], ['hexagon', 'hex', 9, 9, 13]);
  await Promise.resolve();
  assert.equal(hexChoice.current.size, 'beginner');

  // A no-guess game asks the hexagon instance's own client for a hex board; losing it pre-generates
  // the next one for the hex grid's marked start cell.
  await hex.log.pointers.at(-1).session.reveal(40);
  assert.equal(made.length, 1);
  const [client] = made;
  assert.deepEqual(client.requests[0].graph, { kind: 'hex', width: 9, height: 9 });
  hex.log.pointers.at(-1).session.reveal(0); // a mine (the fake client puts them in the first cells)
  assert.equal(client.requests.length, 2);
  assert.deepEqual(client.requests[1].graph, { kind: 'hex', width: 9, height: 9 });
  assert.equal(client.requests[1].firstClick, startCell({ kind: 'hex', width: 9, height: 9 }));
  hexMode.finishNow();

  host.start('classic-2d', { size: 'beginner', noGuess: true });
  assert.equal(square.log.boards.at(-1).options.geometry.kind, 'square');
  assert.equal(square.log.boards.at(-1).options.scale, '150');
  assert.equal(square.log.pointers.at(-1).swap, swap);
  await square.log.pointers.at(-1).session.reveal(40);
  assert.equal(made.length, 2, 'each instance has its own generation client');
  assert.deepEqual(made[1].requests[0].graph, { kind: 'square', width: 9, height: 9 });
  assert.notEqual(squareMode.client, hexMode.client);
});
