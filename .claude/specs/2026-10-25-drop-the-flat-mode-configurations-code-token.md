# Drop the flat-mode configuration's code token

## Goal
The flat-mode configuration (`js/flat-modes.js`) carries a `codeToken` per
mode — `''` for the square grid, `H` hexagon, `T` triangle — that nothing
reads. Board codes route through `js/records/board-code.js`'s own table of
2D modes (prefix, mode, grid, custom-limit check, standard boards), so the
token lives in two places. Remove `codeToken` from the configuration, so the
board-code table is the one source of truth for a flat mode's code prefix.

## Acceptance criteria
- `defineFlatMode` neither reads nor validates a `codeToken`, and the frozen
  configuration it returns has no `codeToken` key; `CLASSIC_2D`, `HEXAGON`
  and `TRIANGLE` pass none.
- `js/flat-modes.js`'s head comment no longer lists `codeToken`.
- `tests/flat-modes.test.mjs` drops the code-token assertions and the
  malformed-token cases, and guards that no flat configuration carries a
  `codeToken`.
- `js/records/board-code.js` is unchanged; its tests (hexagon and triangle
  codes round-trip with their `H` / `T` prefixes) still pass.
- The context files that describe the configuration
  (`.claude/context/classic2d.md`, `.claude/context/testing.md`,
  `.claude/context/INDEX.md`) no longer name a code token in it.
- The fast tier and the browser tests the change reaches pass.

## Decisions
- Remove the token rather than derive or check it against the board-code
  table: nothing reads it, and either alternative needs one module to import
  the other — `js/flat-modes.js` importing `js/records/board-code.js` drags
  the records and the 3D board choice into the flat configuration, and the
  board-code table cannot take its prefixes from `js/flat-modes.js` without
  pulling the board view's grid and geometry into the records and the 3D
  tests (`tests/affected-tests.test.mjs`) — so removal is the least code and
  keeps the import graph as it is.

## Hints
- js/flat-modes.js (`defineFlatMode`, the three configurations, head comment)
- tests/flat-modes.test.mjs (`spec()`, the configuration tests, the
  malformed-field test)
- js/records/board-code.js (`SQUARE`, `PREFIXED` — the table that stays)
- .claude/context/classic2d.md, .claude/context/testing.md,
  .claude/context/INDEX.md (the configuration's description)

## Drift
- `.claude/domain/features/flat-grid-modes.md` § Technical shape (Flat mode
  configuration) — diverges: lists the board-code token among the
  configuration's values; the configuration no longer carries it, the
  board-code table in `js/records/board-code.js` holds it.
- `.claude/context/classic2d.md` § Files and § Public API — diverges: names
  `codeToken` in the configuration (updated in this change).
- `.claude/context/testing.md` § the `flat-modes` row — diverges: the
  configuration tests' code tokens (updated in this change).
- `.claude/context/INDEX.md` § the `classic2d.md` row — diverges: "each with
  its own last-choice document and code token" (updated in this change).
