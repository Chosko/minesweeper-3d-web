// Board identity, board key and display label: the board vocabulary of the records (no DOM).
//
// A board identity names one board by six fields — mode, grid, width, height, mines and
// noGuess — and every exact combination is its own board. Beginner, Intermediate and Expert
// are recognised from their exact size and mine count on the square grid, never stored as a
// name, so a custom board that matches a standard one is that standard board.
//
// Board key format (BOARD_KEY_FORMAT 1). Records are indexed by this key, so the format is
// part of the stored records and changes only together with a records format version:
//   <mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>
// e.g. Expert with no-guess is `classic-2d:square:30x16:99:no-guess`, a 20 × 12 custom board
// with 50 mines `classic-2d:square:20x12:50:guess`. mode and grid are lowercase tokens
// (letters, digits, single hyphens), so no field can contain the `:` separator.

export const BOARD_KEY_FORMAT = 1;

export const STANDARD_BOARDS = Object.freeze([
  Object.freeze({ name: 'Beginner', width: 9, height: 9, mines: 10 }),
  Object.freeze({ name: 'Intermediate', width: 16, height: 16, mines: 40 }),
  Object.freeze({ name: 'Expert', width: 30, height: 16, mines: 99 }),
]);

const STANDARD_GRID = 'square';
const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const token = (name, v) => {
  if (typeof v !== 'string' || !TOKEN.test(v)) {
    throw new RangeError(`board ${name} must be a lowercase token, got ${JSON.stringify(v)}`);
  }
  return v;
};

const dimension = (name, v) => {
  if (!Number.isInteger(v) || v < 1) throw new RangeError(`board ${name} must be an integer >= 1, got ${v}`);
  return v;
};

// Validates the fields and returns a frozen identity carrying exactly them. The first click is
// always safe, so a board holds at most every cell but one as a mine.
export function createBoardIdentity(fields) {
  if (!fields || typeof fields !== 'object') throw new RangeError('board identity must be an object');
  const mode = token('mode', fields.mode);
  const grid = token('grid', fields.grid);
  const width = dimension('width', fields.width);
  const height = dimension('height', fields.height);
  const { mines, noGuess } = fields;
  const cells = width * height;
  if (!Number.isInteger(mines) || mines < 0 || mines > cells - 1) {
    throw new RangeError(`board mines must be an integer from 0 to ${cells - 1}, got ${mines}`);
  }
  if (typeof noGuess !== 'boolean') throw new RangeError(`board noGuess must be a boolean, got ${noGuess}`);
  return Object.freeze({ mode, grid, width, height, mines, noGuess });
}

// The standard board an identity is, or null for a custom board.
export function standardBoard(identity) {
  const id = createBoardIdentity(identity);
  if (id.grid !== STANDARD_GRID) return null;
  return STANDARD_BOARDS.find((b) => b.width === id.width && b.height === id.height && b.mines === id.mines) ?? null;
}

export function boardKey(identity) {
  const id = createBoardIdentity(identity);
  return `${id.mode}:${id.grid}:${id.width}x${id.height}:${id.mines}:${id.noGuess ? 'no-guess' : 'guess'}`;
}

// "Expert", "Expert · no-guess", "20 × 12 · 50 mines", "2 × 1 · 1 mine · no-guess".
export function boardLabel(identity) {
  const id = createBoardIdentity(identity);
  const standard = standardBoard(id);
  const base = standard
    ? standard.name
    : `${id.width} × ${id.height} · ${id.mines} ${id.mines === 1 ? 'mine' : 'mines'}`;
  return id.noGuess ? `${base} · no-guess` : base;
}
