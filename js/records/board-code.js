// Board codes: the text that names one board exactly, for the daily boards and for sharing any
// game as a challenge (no DOM).
//
// A code rebuilds its board from the board, the seed, the start cell and the generator version.
// The grammar, the hash and the daily seed are frozen: a later change is a new code shape, never a
// reinterpretation of an existing code. Output is uppercase; input is read case-insensitively,
// with surrounding whitespace ignored.
//
//   board token  B, I, E          the three 2D standard boards (recognised as standardBoard does)
//                <w>X<h>M<mines>   any other 2D square board, e.g. 20X12M50
//                <x>X<y>X<z>M<mines>  every 3D board, cube presets included, e.g. 8X8X8M40
//                + a trailing N when the board is no-guess: EN, 8X8X8M40N
//   daily code   <board>-<YYYYMMDD>-<check>        e.g. EN-20261011-1F3A
//                seed dailySeed(date, board token), start cell the board's marked start cell
//                (js/generation/start-cell.js)
//   game code    <board>-<seed>-<start>-<check>    e.g. EN-9C41D07A-247-1F3A
//                seed 8 hex digits, zero-padded; start the start cell's index in decimal, in the
//                graph's own coordinate order
//   check        <generatorVersion in decimal><3 hex digits>: the low 12 bits of the 32-bit
//                FNV-1a hash of the canonical text with the version appended,
//                <board>-<payload>[-<start>]-<version>, so a typo is caught before anything is
//                generated
//   daily seed   dailySeed(date, token) — the 32-bit FNV-1a hash of daily-<YYYYMMDD>-<token>
//
// parseBoardCode(text, { generatorVersion? }) → { ok: true, board, seed, startCell,
// generatorVersion, daily? } or { ok: false, reason }; it never throws. It refuses malformed text,
// a code cut off before its check (incomplete), a failed check, a generator version other than this build's (a newer or an older one, each
// with its own reason, and nothing is generated), a board outside its mode's custom limits, a 3D
// no-guess board the 3D board choice refuses, and a start cell outside the board. A code always
// spells its board canonically: a standard 2D board spelled out is malformed.
//
// The daily boards (DAILY_BOARDS): 2D Expert no-guess and the cube 8 × 8 × 8 · 40 no-guess, named
// by their dimensions so a preset re-tune changes neither. dailyGame(id, date) is one day's board:
// its seed, marked start cell, code and generation request.

import { createBoardIdentity, standardBoard, STANDARD_BOARDS, MODE_3D } from './board.js';
import { startCell as markedCell } from '../generation/start-cell.js';
import { GENERATOR_VERSION } from '../generation/placer.js';
import { validateCustom as validate2D, MODE as MODE_2D, GRID } from '../classic2d/board-setup.js';
import { validateCustom as validate3D, noGuessAvailable, noGuessReason } from '../mode3d/board-choice.js';

export const CODE_REASONS = Object.freeze({
  malformed: 'This isn\'t a board code.',
  incomplete: 'This code is incomplete: it is missing its last part.',
  typo: 'This board code has a typo — check it and try again.',
  newer: 'This board code is from a newer version of the game. Reload the page to update.',
  older: 'This board code is from an older version of the game. It cannot be played here.',
  start: 'This board code\'s start cell is outside the board.',
});

const LETTERS = Object.freeze({ Beginner: 'B', Intermediate: 'I', Expert: 'E' });

// The 32-bit FNV-1a hash of a string of ASCII characters.
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const DATE = /^([0-9]{4})([0-9]{2})([0-9]{2})$/;

// Whether `date` is a real calendar date written YYYYMMDD.
export function isDateText(date) {
  const m = typeof date === 'string' ? DATE.exec(date) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

// The local calendar date of `now` as YYYYMMDD.
export function dateText(now = new Date()) {
  const p = (v, n) => String(v).padStart(n, '0');
  return `${p(now.getFullYear(), 4)}${p(now.getMonth() + 1, 2)}${p(now.getDate(), 2)}`;
}

// The seed of a daily board: the FNV-1a hash of `daily-<YYYYMMDD>-<token>`.
export function dailySeed(date, token) {
  return fnv1a(`daily-${date}-${token}`);
}

const plain = (board) => {
  const { daily, ...rest } = board ?? {};
  return createBoardIdentity(rest);
};

// The board token of a board identity: B / I / E, <w>X<h>M<mines> or <x>X<y>X<z>M<mines>, + N.
export function boardToken(identity) {
  const id = plain(identity);
  let base;
  if (id.mode === MODE_3D) base = `${id.width}X${id.height}X${id.depth}M${id.mines}`;
  else {
    const standard = id.grid === GRID ? standardBoard(id) : null;
    base = standard ? LETTERS[standard.name] : `${id.width}X${id.height}M${id.mines}`;
  }
  return id.noGuess ? `${base}N` : base;
}

// The generation graph description of a board identity.
export function graphOf(identity) {
  const id = plain(identity);
  return id.mode === MODE_3D ? { kind: 'box', X: id.width, Y: id.height, Z: id.depth } : { kind: GRID, width: id.width, height: id.height };
}

const cellsOf = (id) => id.width * id.height * (id.depth ?? 1);
const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
const checkOf = (canonical, version) => `${version}${hex(fnv1a(`${canonical}-${version}`) & 0xfff, 3)}`;

// The code of a board: the daily form when `daily` (YYYYMMDD) is given, else the game form from
// the seed and the start cell. Throws a RangeError on fields no code can carry.
export function encodeBoardCode({ board, seed, startCell, generatorVersion, daily } = {}) {
  const token = boardToken(board);
  if (!Number.isInteger(generatorVersion) || generatorVersion < 0) throw new RangeError(`a board code needs a generator version, got ${generatorVersion}`);
  if (daily !== undefined && daily !== null) {
    if (!isDateText(daily)) throw new RangeError(`a daily code needs a YYYYMMDD date, got ${JSON.stringify(daily)}`);
    const canonical = `${token}-${daily}`;
    return `${canonical}-${checkOf(canonical, generatorVersion)}`;
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError(`a board code needs a 32-bit seed, got ${seed}`);
  const cells = cellsOf(plain(board));
  if (!Number.isInteger(startCell) || startCell < 0 || startCell >= cells) throw new RangeError(`a board code needs a start cell below ${cells}, got ${startCell}`);
  const canonical = `${token}-${hex(seed, 8)}-${startCell}`;
  return `${canonical}-${checkOf(canonical, generatorVersion)}`;
}

// The code of a recorded game — a summary, a history entry or anything carrying `board` (or a
// `boardKey` resolved by the caller), `seed`, `generatorVersion`, `startCell` and, for a daily, its
// `daily` date — or null when it lacks what a code needs (a game from before codes, a fixed board).
export function codeOf(game) {
  if (!game || typeof game !== 'object') return null;
  try {
    if (game.daily) return encodeBoardCode({ board: game.board, generatorVersion: game.generatorVersion, daily: game.daily });
    if (!Number.isInteger(game.seed) || !Number.isInteger(game.startCell)) return null;
    return encodeBoardCode(game);
  } catch {
    return null;
  }
}

const NUM = '(0|[1-9][0-9]*)';
const SIDE = '([1-9][0-9]*)';
const TOKEN_3D = new RegExp(`^${SIDE}X${SIDE}X${SIDE}M${NUM}(N?)$`);
const TOKEN_2D = new RegExp(`^${SIDE}X${SIDE}M${NUM}(N?)$`);
const TOKEN_STD = /^([BIE])(N?)$/;
const SEED = /^[0-9A-F]{8}$/;
const START = new RegExp(`^${NUM}$`);
const CHECK = /^(0|[1-9][0-9]*)([0-9A-F]{3})$/;

// The identity a board token names, or null.
function boardOfToken(token) {
  let m = TOKEN_STD.exec(token);
  if (m) {
    const name = Object.keys(LETTERS).find((k) => LETTERS[k] === m[1]);
    const s = STANDARD_BOARDS.find((b) => b.name === name);
    return { mode: MODE_2D, grid: GRID, width: s.width, height: s.height, mines: s.mines, noGuess: m[2] === 'N' };
  }
  m = TOKEN_3D.exec(token);
  if (m) return { mode: MODE_3D, width: +m[1], height: +m[2], depth: +m[3], mines: +m[4], noGuess: m[5] === 'N' };
  m = TOKEN_2D.exec(token);
  if (m) return { mode: MODE_2D, grid: GRID, width: +m[1], height: +m[2], mines: +m[3], noGuess: m[4] === 'N' };
  return null;
}

// Why a board is outside its mode's custom limits, or null when it is inside them.
function limitsReason(b) {
  if (b.mode === MODE_3D) {
    const custom = { X: b.width, Y: b.height, Z: b.depth, mines: b.mines };
    const v = validate3D(custom);
    if (!v.ok) return `${v.reason}.`;
    const choice = { size: 'custom', custom, noGuess: true };
    if (b.noGuess && !noGuessAvailable(choice)) return `${noGuessReason(choice)}.`;
    return null;
  }
  const v = validate2D({ width: b.width, height: b.height, mines: b.mines });
  return v.ok ? null : `${v.reason.charAt(0).toUpperCase()}${v.reason.slice(1)}.`;
}

const refuse = (reason) => ({ ok: false, reason });

// Whether `parts` are a code cut off before its check (a trailing hyphen allowed): a game code's
// board, seed and start cell, or a daily code's board and date, with nothing after. Eight digits
// and a check-shaped last part read as a daily code, whose date is then checked.
function incomplete(parts) {
  const p = parts.at(-1) === '' ? parts.slice(0, -1) : parts;
  if (!boardOfToken(p[0])) return false;
  if (p.length === 2) return isDateText(p[1]);
  if (p.length === 3) return SEED.test(p[1]) && START.test(p[2]) && !(/^[0-9]{8}$/.test(p[1]) && CHECK.test(p[2]));
  return false;
}

// text → { ok: true, board, seed, startCell, generatorVersion, daily? } or { ok: false, reason }.
// `generatorVersion` is this build's (GENERATOR_VERSION), the only one whose boards it rebuilds.
export function parseBoardCode(text, { generatorVersion: build = GENERATOR_VERSION } = {}) {
  if (typeof text !== 'string') return refuse(CODE_REASONS.malformed);
  const parts = text.trim().toUpperCase().split('-');
  if (incomplete(parts)) return refuse(CODE_REASONS.incomplete);
  if (parts.length !== 3 && parts.length !== 4) return refuse(CODE_REASONS.malformed);
  const fields = boardOfToken(parts[0]);
  const check = CHECK.exec(parts[parts.length - 1]);
  if (!fields || !check) return refuse(CODE_REASONS.malformed);
  const daily = parts.length === 3 ? parts[1] : null;
  if (daily !== null ? !isDateText(daily) : !SEED.test(parts[1]) || !START.test(parts[2])) return refuse(CODE_REASONS.malformed);
  let board;
  try {
    board = createBoardIdentity(fields);
  } catch {
    board = null;
  }
  const limits = board ? limitsReason(board) : limitsReason(fields);
  if (board && boardToken(board) !== parts[0]) return refuse(CODE_REASONS.malformed);
  const version = Number(check[1]);
  const canonical = parts.slice(0, -1).join('-');
  if (checkOf(canonical, version) !== parts[parts.length - 1]) return refuse(CODE_REASONS.typo);
  if (version > build) return refuse(CODE_REASONS.newer);
  if (version < build) return refuse(CODE_REASONS.older);
  if (limits) return refuse(limits);
  if (!board) return refuse(CODE_REASONS.malformed);
  if (daily !== null) {
    return { ok: true, board, seed: dailySeed(daily, parts[0]), startCell: markedCell(graphOf(board)), generatorVersion: version, daily };
  }
  const startCell = Number(parts[2]);
  if (startCell >= cellsOf(board)) return refuse(CODE_REASONS.start);
  return { ok: true, board, seed: parseInt(parts[1], 16), startCell, generatorVersion: version };
}

// The two daily boards, in the Daily screen's order.
const dailyBoard = (id, label, fields) => {
  const board = createBoardIdentity(fields);
  return Object.freeze({ id, label, board, token: boardToken(board) });
};
export const DAILY_BOARDS = Object.freeze([
  dailyBoard('expert', 'Expert', { mode: MODE_2D, grid: GRID, width: 30, height: 16, mines: 99, noGuess: true }),
  dailyBoard('cube', 'Cube', { mode: MODE_3D, width: 8, height: 8, depth: 8, mines: 40, noGuess: true }),
]);

// The daily board a board identity is (its token among DAILY_BOARDS), or null.
export function dailyBoardOf(identity) {
  try {
    const token = boardToken(identity);
    return DAILY_BOARDS.find((d) => d.token === token) ?? null;
  } catch {
    return null;
  }
}

// One day's board: { id, label, board, token, date, seed, startCell, generatorVersion, code,
// request } — request the generation request generate() takes for it.
export function dailyGame(id, date) {
  const d = DAILY_BOARDS.find((b) => b.id === id);
  if (!d) throw new RangeError(`unknown daily board ${JSON.stringify(id)}`);
  if (!isDateText(date)) throw new RangeError(`a daily board needs a YYYYMMDD date, got ${JSON.stringify(date)}`);
  const seed = dailySeed(date, d.token);
  const graph = graphOf(d.board);
  const startCell = markedCell(graph);
  return Object.freeze({
    id: d.id,
    label: d.label,
    board: d.board,
    token: d.token,
    date,
    seed,
    startCell,
    generatorVersion: GENERATOR_VERSION,
    code: encodeBoardCode({ board: d.board, generatorVersion: GENERATOR_VERSION, daily: date }),
    request: Object.freeze({ graph, mineCount: d.board.mines, firstClick: startCell, noGuess: true, seed }),
  });
}
