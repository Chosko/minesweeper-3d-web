import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_REASONS, DAILY_BOARDS, fnv1a, dailySeed, boardToken, encodeBoardCode, parseBoardCode, dailyGame,
  dailyBoardOf, codeOf, isDateText, dateText, graphOf,
} from '../js/records/board-code.js';
import { createBoardIdentity } from '../js/records/board.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { generate } from '../js/generation/generate.js';
import { startCell } from '../js/generation/start-cell.js';

const sq = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const hx = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'hexagon', grid: 'hex', width, height, mines, noGuess });
const tr = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'triangle', grid: 'tri', width, height, mines, noGuess });
const box = (width, height, depth, mines, noGuess = false) =>
  createBoardIdentity({ mode: '3d', width, height, depth, mines, noGuess });
const V = GENERATOR_VERSION;

// ---------- the hash and the daily seed ----------

test('board code: FNV-1a is the 32-bit FNV-1a hash', () => {
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a('a'), 0xe40c292c);
  assert.equal(fnv1a('foobar'), 0xbf9cf968);
});

test('board code: the daily seed hashes daily-<date>-<token>', () => {
  assert.equal(dailySeed('20261011', 'EN'), fnv1a('daily-20261011-EN'));
  assert.equal(dailySeed('20261011', 'EN'), 444544172);
  assert.equal(dailySeed('20261011', '8X8X8M40N'), 449335490);
});

// ---------- the board token ----------

test('board code: tokens for the standard boards, other 2D boards and every 3D board', () => {
  assert.equal(boardToken(sq(9, 9, 10)), 'B');
  assert.equal(boardToken(sq(16, 16, 40, true)), 'IN');
  assert.equal(boardToken(sq(30, 16, 99, true)), 'EN');
  assert.equal(boardToken(sq(20, 12, 50)), '20X12M50');
  assert.equal(boardToken(sq(9, 9, 11, true)), '9X9M11N');
  assert.equal(boardToken(box(8, 8, 8, 40)), '8X8X8M40');
  assert.equal(boardToken(box(6, 6, 6, 10, true)), '6X6X6M10N');
  assert.equal(boardToken({ ...sq(30, 16, 99, true), daily: true }), 'EN');
});

// ---------- the grammar ----------

test('board code: the daily form and the game form, uppercase, the check carrying the version', () => {
  const daily = encodeBoardCode({ board: sq(30, 16, 99, true), generatorVersion: V, daily: '20261011' });
  assert.match(daily, /^EN-20261011-1[0-9A-F]{3}$/);
  assert.equal(daily.slice(-3), (fnv1a(`EN-20261011-${V}`) & 0xfff).toString(16).toUpperCase().padStart(3, '0'));
  const game = encodeBoardCode({ board: sq(30, 16, 99, true), seed: 0x9c41d07a, startCell: 247, generatorVersion: V });
  assert.match(game, /^EN-9C41D07A-247-1[0-9A-F]{3}$/);
  assert.equal(game.slice(-3), (fnv1a(`EN-9C41D07A-247-${V}`) & 0xfff).toString(16).toUpperCase().padStart(3, '0'));
  assert.equal(encodeBoardCode({ board: sq(9, 9, 10), seed: 0, startCell: 0, generatorVersion: V }).split('-')[1], '00000000');
});

test('board code: round trips for every board kind, both forms and the extreme seeds', () => {
  const boards = [sq(9, 9, 10), sq(9, 9, 10, true), sq(16, 16, 40), sq(30, 16, 99, true), sq(20, 12, 50), sq(1, 2, 1),
    sq(100, 100, 2000, false), box(8, 8, 8, 40, true), box(6, 6, 6, 10), box(12, 12, 8, 130, true), box(1, 1, 2, 1),
    box(100, 100, 100, 1000)];
  for (const board of boards) {
    const cells = board.width * board.height * (board.depth ?? 1);
    for (const seed of [0, 2 ** 32 - 1, 123456]) {
      for (const start of [0, cells - 1]) {
        const code = encodeBoardCode({ board, seed, startCell: start, generatorVersion: V });
        const parsed = parseBoardCode(code);
        assert.deepEqual(parsed, { ok: true, board, seed, startCell: start, generatorVersion: V }, code);
        assert.deepEqual(parseBoardCode(`  ${code.toLowerCase()}\n`), parsed);
      }
    }
    if (board.mode === '3d' && board.noGuess && board.width * board.height * board.depth > 8000) continue;
    const code = encodeBoardCode({ board, generatorVersion: V, daily: '20261231' });
    const token = boardToken(board);
    assert.deepEqual(parseBoardCode(code), {
      ok: true, board, seed: dailySeed('20261231', token), startCell: startCell(graphOf(board)), generatorVersion: V, daily: '20261231',
    }, code);
  }
});

test('board code: the check catches a typo before anything is generated', () => {
  const code = encodeBoardCode({ board: sq(30, 16, 99, true), seed: 0x9c41d07a, startCell: 247, generatorVersion: V });
  for (const typo of [code.replace('9C41', '9C42'), code.replace('-247-', '-248-'), code.replace(/.$/, (c) => (c === '0' ? '1' : '0')), code.replace('EN', 'IN')]) {
    assert.deepEqual(parseBoardCode(typo), { ok: false, reason: CODE_REASONS.typo }, typo);
  }
});

test('board code: malformed text is refused, never thrown', () => {
  for (const text of [undefined, null, 42, '', 'hello', 'EN', 'EN-1', 'X-20261011-1000', 'EN-2026101-1000', 'EN-20261301-1000',
    'EN-20260230-1000', 'EN-9C41D07-247-1000', 'EN-9C41D07A-0247-1000', 'EN-9C41D07A-247-1-1000', 'EN-9C41D07A-247-10',
    '30X16M99N-20261011-1000', '09X9M11-20261011-1000', 'EN--20261011-1000', 'EG-20261011-1000']) {
    const r = parseBoardCode(text);
    assert.equal(r.ok, false, String(text));
    assert.equal(r.reason, CODE_REASONS.malformed, String(text));
  }
});

test('board code: a code cut off before its check is refused as incomplete', () => {
  assert.match(CODE_REASONS.incomplete, /^This code is incomplete: it is missing its last part\.$/);
  const full = encodeBoardCode({ board: sq(16, 16, 40, true), seed: 3, startCell: 40, generatorVersion: V });
  const daily = encodeBoardCode({ board: sq(30, 16, 99, true), generatorVersion: V, daily: '20261011' });
  for (const text of [full.split('-').slice(0, 3).join('-'), `${full.split('-').slice(0, 3).join('-')}-`, daily.split('-').slice(0, 2).join('-'),
    `${daily.split('-').slice(0, 2).join('-')}-`, 'EN-9C41D07A-1486', ' i-00000003-40 ']) {
    assert.deepEqual(parseBoardCode(text), { ok: false, reason: CODE_REASONS.incomplete }, text);
  }
  assert.equal(parseBoardCode(full).ok, true);
  assert.equal(parseBoardCode(daily).ok, true, 'a daily code is complete in three parts');
});

// A code with a valid check over any text, the version chosen.
const withCheck = (canonical, version = V) => `${canonical}-${version}${(fnv1a(`${canonical}-${version}`) & 0xfff).toString(16).toUpperCase().padStart(3, '0')}`;

test('board code: a board outside the mode\'s custom limits is refused with its reason', () => {
  const cases = [
    ['101X5M3-00000000-0', /width must be a whole number from 1 to 100/i],
    ['1X1M0-00000000-0', /no room for a mine/],
    ['9X9M0-00000000-0', /Mines must be a whole number from 1/],
    ['9X9M81-00000000-0', /Mines must be a whole number from 1/],
    ['101X5X5M3-00000000-0', /Width must be a whole number from 1 to 100/],
    ['5X5X5M0-00000000-0', /Mines must be a whole number from 1/],
  ];
  for (const [canonical, reason] of cases) {
    const r = parseBoardCode(withCheck(canonical));
    assert.equal(r.ok, false, canonical);
    assert.match(r.reason, reason, canonical);
  }
});

test('board code: a 3D no-guess board the board choice refuses is refused', () => {
  assert.match(parseBoardCode(withCheck('21X20X20M100N-00000000-0')).reason, /available up to 8,000 cells/);
  assert.match(parseBoardCode(withCheck('2X8X8M10N-00000000-0')).reason, /a side is 2 cells/);
  assert.equal(parseBoardCode(withCheck('21X20X20M100-00000000-0')).ok, true);
});

test('board code: a start cell outside the board is refused', () => {
  assert.deepEqual(parseBoardCode(withCheck('B-00000000-81')), { ok: false, reason: CODE_REASONS.start });
  assert.equal(parseBoardCode(withCheck('B-00000000-80')).ok, true);
});

test('board code: an unknown generator version is refused in both directions', () => {
  assert.deepEqual(parseBoardCode(withCheck('EN-20261011', V + 1)), { ok: false, reason: CODE_REASONS.newer });
  assert.equal(CODE_REASONS.newer, 'This board code is from a newer version of the game. Reload the page to update.');
  const old = withCheck('EN-20261011', 1);
  assert.deepEqual(parseBoardCode(old, { generatorVersion: 2 }), { ok: false, reason: CODE_REASONS.older });
  assert.equal(CODE_REASONS.older, 'This board code is from an older version of the game. It cannot be played here.');
  assert.equal(parseBoardCode(old, { generatorVersion: 1 }).ok, true);
});

test('board code: the code of a recorded game carries its own generator version; none without a seed', () => {
  const game = { board: sq(9, 9, 10), seed: 5, startCell: 40, generatorVersion: V };
  assert.equal(codeOf(game), encodeBoardCode(game));
  assert.equal(codeOf({ ...game, board: { ...game.board, daily: true }, daily: '20261011' }), encodeBoardCode({ board: game.board, generatorVersion: V, daily: '20261011' }));
  assert.equal(codeOf({ board: game.board, seed: 5, generatorVersion: V }), null);
  assert.equal(codeOf({ board: game.board, generatorVersion: V }), null);
  assert.equal(codeOf(null), null);
});

// ---------- hexagon boards ----------

test('board code: a hexagon board is spelled H before the 2D token', () => {
  assert.equal(boardToken(hx(9, 9, 13)), 'HB');
  assert.equal(boardToken(hx(16, 16, 50, true)), 'HIN');
  assert.equal(boardToken(hx(30, 16, 100)), 'HE');
  assert.equal(boardToken(hx(30, 16, 100, true)), 'HEN');
  assert.equal(boardToken(hx(20, 12, 50)), 'H20X12M50');
  assert.equal(boardToken(hx(9, 9, 10, true)), 'H9X9M10N', 'a square standard size is a custom hexagon board');
  assert.equal(boardToken(hx(30, 16, 99)), 'H30X16M99');
  assert.equal(boardToken({ ...hx(30, 16, 100, true), daily: true }), 'HEN');
  assert.equal(boardToken(sq(9, 9, 13)), '9X9M13', 'a hexagon standard size is a custom square board');
});

test('board code: a hexagon board builds the hex graph', () => {
  assert.deepEqual(graphOf(hx(30, 16, 100)), { kind: 'hex', width: 30, height: 16 });
  assert.deepEqual(graphOf(sq(30, 16, 99)), { kind: 'square', width: 30, height: 16 });
});

test('board code: hexagon round trips, both forms', () => {
  for (const board of [hx(9, 9, 13), hx(16, 16, 50, true), hx(30, 16, 100, true), hx(20, 12, 50), hx(1, 2, 1), hx(100, 100, 2000, true)]) {
    const cells = board.width * board.height;
    for (const seed of [0, 2 ** 32 - 1]) {
      for (const start of [0, cells - 1]) {
        const code = encodeBoardCode({ board, seed, startCell: start, generatorVersion: V });
        assert.ok(code.startsWith('H'), code);
        assert.deepEqual(parseBoardCode(code), { ok: true, board, seed, startCell: start, generatorVersion: V }, code);
        assert.deepEqual(parseBoardCode(code.toLowerCase()), parseBoardCode(code));
      }
    }
    const code = encodeBoardCode({ board, generatorVersion: V, daily: '20261231' });
    assert.deepEqual(parseBoardCode(code), {
      ok: true, board, seed: dailySeed('20261231', boardToken(board)), startCell: startCell({ kind: 'hex', width: board.width, height: board.height }),
      generatorVersion: V, daily: '20261231',
    }, code);
  }
  assert.match(encodeBoardCode({ board: hx(30, 16, 100, true), generatorVersion: V, daily: '20261011' }), /^HEN-20261011-1[0-9A-F]{3}$/);
});

test('board code: a hexagon code is spelled canonically and checked against the hexagon custom limits', () => {
  for (const canonical of ['H30X16M100-00000000-0', 'H9X9M13N-00000000-0', 'HH-00000000-0', 'H-00000000-0', 'HX-00000000-0', 'H09X9M11-00000000-0']) {
    assert.deepEqual(parseBoardCode(withCheck(canonical)), { ok: false, reason: CODE_REASONS.malformed }, canonical);
  }
  const cases = [
    ['H101X5M3-00000000-0', /width must be a whole number from 1 to 100/i],
    ['H1X1M0-00000000-0', /no room for a mine/],
    ['H9X9M0-00000000-0', /Mines must be a whole number from 1/],
    ['H9X9M81-00000000-0', /Mines must be a whole number from 1/],
  ];
  for (const [canonical, reason] of cases) {
    const r = parseBoardCode(withCheck(canonical));
    assert.equal(r.ok, false, canonical);
    assert.match(r.reason, reason, canonical);
  }
  assert.deepEqual(parseBoardCode(withCheck('HB-00000000-81')), { ok: false, reason: CODE_REASONS.start });
  assert.equal(parseBoardCode(withCheck('H9X9M31N-00000000-80')).ok, true, 'no-guess is never refused up front');
});

test('board code: every square and 3D code keeps its meaning beside the hexagon shape', () => {
  for (const [code, board] of [
    [withCheck('EN-9C41D07A-247'), sq(30, 16, 99, true)], [withCheck('B-00000000-0'), sq(9, 9, 10)],
    [withCheck('20X12M50-00000000-0'), sq(20, 12, 50)], [withCheck('8X8X8M40N-00000000-0'), box(8, 8, 8, 40, true)],
  ]) {
    assert.deepEqual(parseBoardCode(code).board, board, code);
  }
  assert.notDeepEqual(parseBoardCode(withCheck('HB-00000000-0')).board, parseBoardCode(withCheck('B-00000000-0')).board);
  assert.equal(parseBoardCode('HEN-9C41D07A-247').reason, CODE_REASONS.incomplete);
});

// ---------- triangle boards ----------

test('board code: a triangle board is spelled T before the 2D token', () => {
  assert.equal(boardToken(tr(13, 7, 8)), 'TB');
  assert.equal(boardToken(tr(25, 13, 36, true)), 'TIN');
  assert.equal(boardToken(tr(41, 17, 103)), 'TE');
  assert.equal(boardToken(tr(41, 17, 103, true)), 'TEN');
  assert.equal(boardToken(tr(20, 12, 50)), 'T20X12M50');
  assert.equal(boardToken(tr(30, 16, 99, true)), 'T30X16M99N', 'a square standard size is a custom triangle board');
  assert.equal(boardToken(tr(30, 16, 100)), 'T30X16M100', 'a hexagon standard size is a custom triangle board');
  assert.equal(boardToken({ ...tr(41, 17, 103, true), daily: true }), 'TEN');
  assert.equal(boardToken(sq(13, 7, 8)), '13X7M8', 'a triangle standard size is a custom square board');
  assert.equal(boardToken(hx(41, 17, 103)), 'H41X17M103', 'a triangle standard size is a custom hexagon board');
});

test('board code: a triangle board builds the tri graph', () => {
  assert.deepEqual(graphOf(tr(41, 17, 103)), { kind: 'tri', width: 41, height: 17 });
  assert.deepEqual(graphOf(hx(30, 16, 100)), { kind: 'hex', width: 30, height: 16 });
});

test('board code: triangle round trips, both forms', () => {
  for (const board of [tr(13, 7, 8), tr(25, 13, 36, true), tr(41, 17, 103, true), tr(20, 12, 50), tr(1, 2, 1), tr(100, 100, 2000, true)]) {
    const cells = board.width * board.height;
    for (const seed of [0, 2 ** 32 - 1]) {
      for (const start of [0, cells - 1]) {
        const code = encodeBoardCode({ board, seed, startCell: start, generatorVersion: V });
        assert.ok(code.startsWith('T'), code);
        assert.deepEqual(parseBoardCode(code), { ok: true, board, seed, startCell: start, generatorVersion: V }, code);
        assert.deepEqual(parseBoardCode(code.toLowerCase()), parseBoardCode(code));
      }
    }
    const code = encodeBoardCode({ board, generatorVersion: V, daily: '20261231' });
    assert.deepEqual(parseBoardCode(code), {
      ok: true, board, seed: dailySeed('20261231', boardToken(board)), startCell: startCell({ kind: 'tri', width: board.width, height: board.height }),
      generatorVersion: V, daily: '20261231',
    }, code);
  }
  assert.match(encodeBoardCode({ board: tr(41, 17, 103, true), generatorVersion: V, daily: '20261011' }), /^TEN-20261011-1[0-9A-F]{3}$/);
});

test('board code: a triangle code is spelled canonically and checked against the triangle custom limits', () => {
  for (const canonical of ['T41X17M103-00000000-0', 'T13X7M8N-00000000-0', 'TT-00000000-0', 'T-00000000-0', 'TX-00000000-0', 'T013X7M9-00000000-0', 'THB-00000000-0', 'HTB-00000000-0', 'T8X8X8M40-00000000-0']) {
    assert.deepEqual(parseBoardCode(withCheck(canonical)), { ok: false, reason: CODE_REASONS.malformed }, canonical);
  }
  const cases = [
    ['T101X5M3-00000000-0', /width must be a whole number from 1 to 100/i],
    ['T5X101M3-00000000-0', /height must be a whole number from 1 to 100/i],
    ['T1X1M0-00000000-0', /no room for a mine/],
    ['T13X7M0-00000000-0', /Mines must be a whole number from 1/],
    ['T13X7M91-00000000-0', /Mines must be a whole number from 1/],
  ];
  for (const [canonical, reason] of cases) {
    const r = parseBoardCode(withCheck(canonical));
    assert.equal(r.ok, false, canonical);
    assert.match(r.reason, reason, canonical);
  }
  assert.deepEqual(parseBoardCode(withCheck('TB-00000000-91')), { ok: false, reason: CODE_REASONS.start });
  assert.equal(parseBoardCode(withCheck('TB-00000000-90')).ok, true);
  assert.equal(parseBoardCode(withCheck('T13X7M30N-00000000-90')).ok, true, 'no-guess is never refused up front');
});

test('board code: every square, hexagon and 3D code keeps its meaning beside the triangle shape', () => {
  for (const [code, board] of [
    [withCheck('EN-9C41D07A-247'), sq(30, 16, 99, true)], [withCheck('B-00000000-0'), sq(9, 9, 10)],
    [withCheck('20X12M50-00000000-0'), sq(20, 12, 50)], [withCheck('8X8X8M40N-00000000-0'), box(8, 8, 8, 40, true)],
    [withCheck('HB-00000000-0'), hx(9, 9, 13)], [withCheck('HEN-00000000-0'), hx(30, 16, 100, true)],
    [withCheck('H20X12M50-00000000-0'), hx(20, 12, 50)],
  ]) {
    assert.deepEqual(parseBoardCode(code).board, board, code);
  }
  assert.notDeepEqual(parseBoardCode(withCheck('TB-00000000-0')).board, parseBoardCode(withCheck('B-00000000-0')).board);
  assert.notDeepEqual(parseBoardCode(withCheck('TB-00000000-0')).board, parseBoardCode(withCheck('HB-00000000-0')).board);
  assert.equal(parseBoardCode('TEN-9C41D07A-247').reason, CODE_REASONS.incomplete);
});

// ---------- the daily boards ----------

test('daily: four boards a day in menu order, each named by its dimensions — Expert, Hexagon and Triangle Expert, all no-guess, and the cube 8 × 8 × 8 · 40 no-guess', () => {
  assert.deepEqual(DAILY_BOARDS.map((d) => [d.id, d.label, d.token]), [
    ['expert', 'Expert', 'EN'], ['hex-expert', 'Expert', 'HEN'], ['tri-expert', 'Expert', 'TEN'], ['cube', 'Cube', '8X8X8M40N'],
  ]);
  assert.deepEqual(DAILY_BOARDS.map((d) => [d.board.mode, graphOf(d.board).kind]), [
    ['classic-2d', 'square'], ['hexagon', 'hex'], ['triangle', 'tri'], ['3d', 'box'],
  ]);
  assert.equal(dailyBoardOf(sq(30, 16, 99, true)).id, 'expert');
  assert.equal(dailyBoardOf(hx(30, 16, 100, true)).id, 'hex-expert');
  assert.equal(dailyBoardOf(tr(41, 17, 103, true)).id, 'tri-expert');
  assert.equal(dailyBoardOf(box(8, 8, 8, 40, true)).id, 'cube');
  assert.equal(dailyBoardOf(sq(30, 16, 99, false)), null);
  assert.equal(dailyBoardOf(hx(30, 16, 100, false)), null, 'the daily board is the no-guess one');
  assert.equal(dailyBoardOf(hx(30, 16, 99, true)), null, 'Classic 2D\'s Expert on the hex grid is no daily board');
});

test('daily: the Classic 2D and 3D daily boards keep their seeds and codes', () => {
  const pinned = ['expert', 'cube'].map((id) => { const g = dailyGame(id, '20261011'); return [id, g.seed, g.code, g.startCell]; });
  assert.deepEqual(pinned, [['expert', 444544172, 'EN-20261011-184A', 255], ['cube', 449335490, '8X8X8M40N-20261011-1BDC', 292]]);
});

test('daily: the Hexagon and Triangle daily codes are the frozen daily form over HEN and TEN', () => {
  for (const [id, token, board, kind] of [['hex-expert', 'HEN', hx(30, 16, 100, true), 'hex'], ['tri-expert', 'TEN', tr(41, 17, 103, true), 'tri']]) {
    const g = dailyGame(id, '20261011');
    assert.match(g.code, new RegExp(`^${token}-20261011-${V}[0-9A-F]{3}$`));
    assert.equal(g.code, encodeBoardCode({ board, generatorVersion: V, daily: '20261011' }));
    assert.equal(g.seed, dailySeed('20261011', token));
    assert.equal(g.startCell, startCell({ kind, width: board.width, height: board.height }));
    assert.equal(g.request.graph.kind, kind);
    assert.deepEqual(g.board, board);
    const parsed = parseBoardCode(g.code);
    assert.deepEqual([parsed.ok, parsed.daily, parsed.seed, parsed.startCell], [true, '20261011', g.seed, g.startCell]);
    assert.deepEqual(parsed.board, board);
    assert.notEqual(dailyGame(id, '20261012').code, g.code, 'another day, another code');
  }
});

test('daily: each board is generated for its marked start cell with the daily seed', () => {
  for (const d of DAILY_BOARDS) {
    const g = dailyGame(d.id, '20261011');
    assert.equal(g.startCell, startCell(graphOf(d.board)));
    assert.deepEqual({ ...g.request }, {
      graph: graphOf(d.board), mineCount: d.board.mines, firstClick: g.startCell, noGuess: true, seed: dailySeed('20261011', d.token),
    });
    assert.equal(g.code, encodeBoardCode({ board: d.board, generatorVersion: V, daily: '20261011' }));
    const parsed = parseBoardCode(g.code);
    assert.equal(parsed.seed, g.seed);
    assert.equal(parsed.startCell, g.startCell);
  }
});

test('daily: the mines of 2026-10-11\'s Classic 2D and 3D boards are pinned', () => {
  const expert = generate(dailyGame('expert', '20261011').request);
  assert.deepEqual(Array.from(expert.mines), [3, 5, 17, 36, 39, 45, 65, 67, 71, 74, 76, 81, 82, 87, 95, 105, 110, 112, 115, 117,
    120, 122, 123, 126, 134, 135, 136, 137, 141, 144, 149, 155, 159, 162, 171, 173, 190, 191, 196, 197, 215, 218, 235, 236, 239,
    241, 246, 248, 261, 262, 263, 265, 275, 277, 287, 288, 293, 294, 296, 300, 303, 307, 312, 315, 316, 317, 318, 321, 334, 336,
    340, 341, 342, 343, 344, 346, 359, 367, 372, 378, 380, 386, 395, 396, 404, 418, 420, 428, 430, 432, 437, 438, 442, 448, 449,
    452, 471, 474, 478]);
  const cube = generate(dailyGame('cube', '20261011').request);
  assert.deepEqual(Array.from(cube.mines), [3, 5, 7, 14, 17, 29, 41, 47, 54, 64, 67, 70, 71, 75, 83, 87, 111, 132, 135, 182, 210,
    226, 247, 276, 304, 337, 340, 368, 389, 393, 412, 420, 422, 440, 455, 456, 463, 466, 486, 489]);
});

test('daily: dates are YYYYMMDD calendar dates, today the local one', () => {
  assert.equal(isDateText('20240229'), true);
  assert.equal(isDateText('20230229'), false);
  assert.equal(dateText(new Date(2026, 0, 5, 23, 59)), '20260105');
  assert.throws(() => dailyGame('expert', '2026-10-11'), RangeError);
  assert.throws(() => dailyGame('nope', '20261011'), RangeError);
});
