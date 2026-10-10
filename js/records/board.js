// Board identity, board key and display label: the board vocabulary of the records (no DOM).
//
// A board identity names one board, and every exact combination of its fields is its own board.
// It takes one of two forms, chosen by its mode:
//   2D — mode, grid, width, height, mines and noGuess. Beginner, Intermediate and Expert are
//        recognised from their exact size and mine count on the square grid.
//   3D — mode `3d`, width (X), height (Y), depth (Z), mines and noGuess, with no grid. The six
//        presets, "Double layer" and "Cube" each Beginner, Intermediate and Expert, are
//        recognised from their exact size and mine count.
// A name is never stored, so a custom board that matches a standard board or a preset is that
// board.
//
// Board key format (BOARD_KEY_FORMAT 1). Records are indexed by this key, so the format is
// part of the stored records and changes only together with a records format version:
//   2D  <mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>
//   3D  3d:<width>x<height>x<depth>:<mines>:<guess|no-guess>
// e.g. Expert with no-guess is `classic-2d:square:30x16:99:no-guess`, a 20 × 12 custom board
// with 50 mines `classic-2d:square:20x12:50:guess`, Cube Expert with no-guess
// `3d:12x12x8:130:no-guess`. mode and grid are lowercase tokens (letters, digits, single
// hyphens), so no field can contain the `:` separator; a 3D key has one field fewer than a 2D
// key, so the two never coincide.

export const BOARD_KEY_FORMAT = 1;

export const MODE_3D = '3d';

export const STANDARD_BOARDS = Object.freeze([
  Object.freeze({ name: 'Beginner', width: 9, height: 9, mines: 10 }),
  Object.freeze({ name: 'Intermediate', width: 16, height: 16, mines: 40 }),
  Object.freeze({ name: 'Expert', width: 30, height: 16, mines: 99 }),
]);

// The 3D presets in menu order, the sizes and mines of the 3D board choice
// (js/mode3d/board-choice.js, kept equal by a test).
const preset = (family, name, width, height, depth, mines) => Object.freeze({ family, name, width, height, depth, mines });
export const PRESETS_3D = Object.freeze([
  preset('Double layer', 'Beginner', 8, 8, 2, 10),
  preset('Double layer', 'Intermediate', 14, 14, 2, 60),
  preset('Double layer', 'Expert', 25, 16, 2, 130),
  preset('Cube', 'Beginner', 6, 6, 6, 10),
  preset('Cube', 'Intermediate', 8, 8, 8, 40),
  preset('Cube', 'Expert', 12, 12, 8, 130),
]);

const STANDARD_GRID = 'square';
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

// Validates the fields and returns a frozen identity carrying exactly them. The first click is
// always safe, so a board holds at most every cell but one as a mine; a 3D board holds at least
// one.
export function createBoardIdentity(fields) {
  if (!fields || typeof fields !== 'object') throw new RangeError('board identity must be an object');
  const mode = token('mode', fields.mode);
  if (mode === MODE_3D) {
    if (fields.grid !== undefined) throw new RangeError(`a 3D board has no grid, got ${JSON.stringify(fields.grid)}`);
    const width = dimension('width', fields.width, DIM_MAX_3D);
    const height = dimension('height', fields.height, DIM_MAX_3D);
    const depth = dimension('depth', fields.depth, DIM_MAX_3D);
    const mines = mineCount(fields.mines, 1, width * height * depth);
    return Object.freeze({ mode, width, height, depth, mines, noGuess: flag(fields.noGuess) });
  }
  const grid = token('grid', fields.grid);
  const width = dimension('width', fields.width);
  const height = dimension('height', fields.height);
  const mines = mineCount(fields.mines, 0, width * height);
  return Object.freeze({ mode, grid, width, height, mines, noGuess: flag(fields.noGuess) });
}

const is3D = (id) => id.mode === MODE_3D;

// The standard 2D board an identity is, or null for a custom or 3D board.
export function standardBoard(identity) {
  const id = createBoardIdentity(identity);
  if (is3D(id) || id.grid !== STANDARD_GRID) return null;
  return STANDARD_BOARDS.find((b) => b.width === id.width && b.height === id.height && b.mines === id.mines) ?? null;
}

// The 3D preset an identity is, or null for a custom 3D board or a 2D board.
export function preset3D(identity) {
  const id = createBoardIdentity(identity);
  if (!is3D(id)) return null;
  return PRESETS_3D.find((p) => p.width === id.width && p.height === id.height && p.depth === id.depth
    && p.mines === id.mines) ?? null;
}

const guess = (id) => (id.noGuess ? 'no-guess' : 'guess');

export function boardKey(identity) {
  const id = createBoardIdentity(identity);
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
// "Cube Expert", "Double layer Beginner · no-guess", "10 × 10 × 10 · 80 mines".
export function boardLabel(identity) {
  const id = createBoardIdentity(identity);
  let base;
  if (is3D(id)) {
    const p = preset3D(id);
    base = p ? `${p.family} ${p.name}` : `${id.width} × ${id.height} × ${id.depth} · ${minesText(id.mines)}`;
  } else {
    const standard = standardBoard(id);
    base = standard ? standard.name : `${id.width} × ${id.height} · ${minesText(id.mines)}`;
  }
  return id.noGuess ? `${base} · no-guess` : base;
}
