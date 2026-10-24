// Board identity, board key and display label: the board vocabulary of the records (no DOM).
//
// A board identity names one board, and every exact combination of its fields is its own board.
// It takes one of two forms, chosen by its mode:
//   2D — mode, grid, width, height, mines and noGuess. Beginner, Intermediate and Expert are
//        recognised from their exact size and mine count on the square grid (STANDARD_BOARDS), on
//        the hex grid (STANDARD_BOARDS_HEX) and on the tri grid (STANDARD_BOARDS_TRI), a hexagon
//        board being mode `hexagon`, grid `hex`, and a triangle board mode `triangle`, grid `tri`.
//   3D — mode `3d`, width (X), height (Y), depth (Z), mines and noGuess, with no grid. The presets,
//        "Cube" Intro, Beginner, Intermediate and Expert, are recognised from their exact size and
//        mine count; any other 3D board, a former preset's included, is a custom board.
// A name is never stored, so a custom board that matches a standard board or a preset is that
// board. Either form may carry `daily: true`: the mode's Daily board, the board the day's daily
// games are recorded on (js/records/board-code.js), a board of its own beside the plain one.
//
// Board key format (BOARD_KEY_FORMAT 2). Records are indexed by this key, so the format is
// part of the stored records and changes only together with a records format version:
//   2D     <mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>
//   3D     3d:<width>x<height>x<depth>:<mines>:<guess|no-guess>
//   Daily  daily:<the plain board's key>, e.g. `daily:classic-2d:square:30x16:99:no-guess`
// e.g. Expert with no-guess is `classic-2d:square:30x16:99:no-guess`, a 20 × 12 custom board
// with 50 mines `classic-2d:square:20x12:50:guess`, Hexagon Expert `hexagon:hex:30x16:100:guess`,
// Triangle Expert `triangle:tri:41x17:103:guess`, Cube Expert with no-guess
// `3d:10x10x10:100:no-guess`. mode and grid are lowercase tokens (letters, digits, single
// hyphens), so no field can contain the `:` separator; a 3D key has one field fewer than a 2D
// key, so the two never coincide.

export const BOARD_KEY_FORMAT = 2;

export const MODE_3D = '3d';

export const STANDARD_BOARDS = Object.freeze([
  Object.freeze({ name: 'Beginner', width: 9, height: 9, mines: 10 }),
  Object.freeze({ name: 'Intermediate', width: 16, height: 16, mines: 40 }),
  Object.freeze({ name: 'Expert', width: 30, height: 16, mines: 99 }),
]);

// The Hexagon standard boards, the sizes and mines of the Hexagon board setup
// (js/hexagon/board-setup.js, kept equal by a test).
export const STANDARD_BOARDS_HEX = Object.freeze([
  Object.freeze({ name: 'Beginner', width: 9, height: 9, mines: 13 }),
  Object.freeze({ name: 'Intermediate', width: 16, height: 16, mines: 50 }),
  Object.freeze({ name: 'Expert', width: 30, height: 16, mines: 100 }),
]);

// The Triangle standard boards, the sizes and mines of the Triangle board setup
// (js/triangle/board-setup.js, kept equal by a test).
export const STANDARD_BOARDS_TRI = Object.freeze([
  Object.freeze({ name: 'Beginner', width: 13, height: 7, mines: 8 }),
  Object.freeze({ name: 'Intermediate', width: 25, height: 13, mines: 36 }),
  Object.freeze({ name: 'Expert', width: 41, height: 17, mines: 103 }),
]);

// The 3D presets in menu order, the sizes and mines of the 3D board choice
// (js/mode3d/board-choice.js, kept equal by a test).
const preset = (family, name, width, height, depth, mines) => Object.freeze({ family, name, width, height, depth, mines });
export const PRESETS_3D = Object.freeze([
  preset('Cube', 'Intro', 6, 6, 6, 10),
  preset('Cube', 'Beginner', 6, 6, 6, 20),
  preset('Cube', 'Intermediate', 8, 8, 8, 40),
  preset('Cube', 'Expert', 10, 10, 10, 100),
]);

const STANDARD_BY_GRID = new Map([['square', STANDARD_BOARDS], ['hex', STANDARD_BOARDS_HEX], ['tri', STANDARD_BOARDS_TRI]]);
const DIM_MAX_3D = 100;
const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const token = (name, v) => {
  if (typeof v !== 'string' || !TOKEN.test(v)) {
    throw new RangeError(`board ${name} must be a lowercase token, got ${JSON.stringify(v)}`);
  }
  return v;
};

const dimension = (name, v, max = Infinity) => {
  if (!Number.isInteger(v) || v < 1 || v > max) {
    throw new RangeError(`board ${name} must be an integer ${max === Infinity ? '>= 1' : `from 1 to ${max}`}, got ${v}`);
  }
  return v;
};

const mineCount = (v, min, cells) => {
  if (!Number.isInteger(v) || v < min || v > cells - 1) {
    throw new RangeError(`board mines must be an integer from ${min} to ${cells - 1}, got ${v}`);
  }
  return v;
};

const flag = (v) => {
  if (typeof v !== 'boolean') throw new RangeError(`board noGuess must be a boolean, got ${v}`);
  return v;
};

// The daily flag: present only as true.
const dailyFlag = (v) => {
  if (v === undefined || v === false) return {};
  if (v !== true) throw new RangeError(`board daily must be true when given, got ${v}`);
  return { daily: true };
};

// Validates the fields and returns a frozen identity carrying exactly them, `daily` only when true.
// The first click is always safe, so a board holds at most every cell but one as a mine; a 3D board
// holds at least one.
export function createBoardIdentity(fields) {
  if (!fields || typeof fields !== 'object') throw new RangeError('board identity must be an object');
  const mode = token('mode', fields.mode);
  if (mode === MODE_3D) {
    if (fields.grid !== undefined) throw new RangeError(`a 3D board has no grid, got ${JSON.stringify(fields.grid)}`);
    const width = dimension('width', fields.width, DIM_MAX_3D);
    const height = dimension('height', fields.height, DIM_MAX_3D);
    const depth = dimension('depth', fields.depth, DIM_MAX_3D);
    const mines = mineCount(fields.mines, 1, width * height * depth);
    return Object.freeze({ mode, width, height, depth, mines, noGuess: flag(fields.noGuess), ...dailyFlag(fields.daily) });
  }
  const grid = token('grid', fields.grid);
  const width = dimension('width', fields.width);
  const height = dimension('height', fields.height);
  const mines = mineCount(fields.mines, 0, width * height);
  return Object.freeze({ mode, grid, width, height, mines, noGuess: flag(fields.noGuess), ...dailyFlag(fields.daily) });
}

const is3D = (id) => id.mode === MODE_3D;

// The standard 2D board an identity is on its grid, or null for a custom or 3D board, or a grid with
// no standard boards.
export function standardBoard(identity) {
  const id = createBoardIdentity(identity);
  const boards = is3D(id) ? null : STANDARD_BY_GRID.get(id.grid);
  return boards?.find((b) => b.width === id.width && b.height === id.height && b.mines === id.mines) ?? null;
}

// The 3D preset an identity is, or null for a custom 3D board or a 2D board.
export function preset3D(identity) {
  const id = createBoardIdentity(identity);
  if (!is3D(id)) return null;
  return PRESETS_3D.find((p) => p.width === id.width && p.height === id.height && p.depth === id.depth
    && p.mines === id.mines) ?? null;
}

const guess = (id) => (id.noGuess ? 'no-guess' : 'guess');

const DAILY = 'daily:';

export function boardKey(identity) {
  const id = createBoardIdentity(identity);
  if (id.daily) return `${DAILY}${boardKey({ ...id, daily: false })}`;
  if (is3D(id)) return `${id.mode}:${id.width}x${id.height}x${id.depth}:${id.mines}:${guess(id)}`;
  return `${id.mode}:${id.grid}:${id.width}x${id.height}:${id.mines}:${guess(id)}`;
}

const NUMBER = '(0|[1-9][0-9]*)';
const SIZE = '([1-9][0-9]*)';
const KEY = new RegExp(`^([^:]+):([^:]+):${SIZE}x${SIZE}:${NUMBER}:(guess|no-guess)$`);
const KEY_3D = new RegExp(`^${MODE_3D}:${SIZE}x${SIZE}x${SIZE}:${NUMBER}:(guess|no-guess)$`);

// The identity a board key names — the inverse of boardKey. A malformed key, or one naming an
// impossible board, throws a RangeError.
export function parseBoardKey(key) {
  if (typeof key === 'string' && key.startsWith(DAILY)) {
    const plain = key.slice(DAILY.length);
    if (plain.startsWith(DAILY)) throw new RangeError(`not a board key: ${JSON.stringify(key)}`);
    return createBoardIdentity({ ...parseBoardKey(plain), daily: true });
  }
  const m3 = typeof key === 'string' ? KEY_3D.exec(key) : null;
  if (m3) {
    return createBoardIdentity({
      mode: MODE_3D, width: Number(m3[1]), height: Number(m3[2]), depth: Number(m3[3]), mines: Number(m3[4]),
      noGuess: m3[5] === 'no-guess',
    });
  }
  const m = typeof key === 'string' ? KEY.exec(key) : null;
  if (!m) throw new RangeError(`not a board key: ${JSON.stringify(key)}`);
  return createBoardIdentity({
    mode: m[1], grid: m[2], width: Number(m[3]), height: Number(m[4]), mines: Number(m[5]), noGuess: m[6] === 'no-guess',
  });
}

const minesText = (mines) => `${mines} ${mines === 1 ? 'mine' : 'mines'}`;

// "Expert", "Expert · no-guess", "20 × 12 · 50 mines", "2 × 1 · 1 mine · no-guess";
// "Cube Expert", "Cube Beginner · no-guess", "10 × 10 × 10 · 80 mines"; a Daily board
// "Daily · Expert · no-guess", "Daily · 8 × 8 × 8 · 40 mines · no-guess" (a 3D board by its
// dimensions, as its code names it).
export function boardLabel(identity) {
  const id = createBoardIdentity(identity);
  let base;
  if (is3D(id)) {
    const p = id.daily ? null : preset3D(id);
    base = p ? `${p.family} ${p.name}` : `${id.width} × ${id.height} × ${id.depth} · ${minesText(id.mines)}`;
  } else {
    const standard = standardBoard(id);
    base = standard ? standard.name : `${id.width} × ${id.height} · ${minesText(id.mines)}`;
  }
  const label = id.noGuess ? `${base} · no-guess` : base;
  return id.daily ? `Daily · ${label}` : label;
}
