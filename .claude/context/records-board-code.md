# Records — board codes and the daily boards

## OVERVIEW

The text that rebuilds any board — its identity, seed, start cell and
generator version — and the daily seed with the two daily boards. Board
identity, the summary record and the records layer's map are in
[records.md](records.md). DOM-free.

| File | Responsibility |
| ---- | -------------- |
| `js/records/board-code.js` | Board codes (encode, parse, check), the daily seed and the two daily boards. |

## PUBLIC API

Board codes (`js/records/board-code.js`; its header states the frozen
grammar)
- `encodeBoardCode({ board, seed, startCell, generatorVersion, daily? })` →
  the game form `EN-9C41D07A-247-1486` or, with `daily` (YYYYMMDD), the daily
  form `EN-20261011-184A`; a hexagon board's token is the 2D token after an
  `H` (`HB`, `HI`, `HE`, `H20X12M50`, then `N` when no-guess), a triangle
  board's the same after a `T` (`TB`, `TI`, `TE`, `T20X12M50`, then `N`);
  `parseBoardCode(text, { generatorVersion? })` → `{ ok: true, board,
  seed, startCell, generatorVersion, daily? }` or `{ ok: false, reason }` (`CODE_REASONS`, among them `incomplete` for a code cut
  off before its check), never throwing; `codeOf(game)` — a
  summary's or history entry's code, null without what one needs.
- `boardToken`, `graphOf(identity)` (the `square`, `hex`, `tri` or `box`
  description), `fnv1a`, `dailySeed(date, token)`,
  `dateText(now)` (the local date), `isDateText`.
- `DAILY_BOARDS` (`expert` EN, `cube` 8X8X8M40N), `dailyBoardOf(identity)`,
  `dailyGame(id, date)` → `{ board, seed, startCell, code, request, … }`.

## INTERNAL PATTERNS

- **Codes are frozen.** The grammar, FNV-1a and the daily seed never
  change meaning; a code of another `GENERATOR_VERSION` is refused, never
  approximated. A code starting with `H` is a hexagon board's and one
  starting with `T` a triangle board's; no other code starts with either.
- **One table of the 2D modes.** Each 2D mode is one row of `board-code.js`'s
  table — its token prefix (`''` for Classic 2D, `H`, `T`), mode, grid,
  custom-limit validation and standard boards by name — which encoding,
  `graphOf`, parsing and the limits check all read. A new 2D mode is a new
  row.
- **Each mode's own limits.** The parser validates a board against its
  mode's custom limits: Classic 2D's (`js/classic2d/board-setup.js`),
  Hexagon's (`js/hexagon/board-setup.js`) and Triangle's
  (`js/triangle/board-setup.js`), both of which re-export Classic 2D's
  validation, or 3D's (`js/mode3d/board-choice.js`).

## DOMAIN DEPENDENCIES

- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — § Architecture, "Board code".
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — daily boards from the date and board codes that rebuild any board.
- [../domain/features/hexagon-grid.md](../domain/features/hexagon-grid.md)
  — § Data and state, the hexagon board-code token.
- [../domain/features/triangle-grid.md](../domain/features/triangle-grid.md)
  — § Data and state, the triangle board-code token.

## CROSS-REFERENCES

- [records.md](records.md) — the board identity a code carries, the summary
  `codeOf` reads.
- [generation.md](generation.md) — the seed and `GENERATOR_VERSION`.
- [app-shell-daily.md](app-shell-daily.md) — the Daily screen, board codes in
  the board choices and `#board=` links.
- [testing.md](testing.md) — `tests/records-board-code.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the code grammar, the daily seed or the daily boards: read
  `board-code.js` whole, starting with its header.
