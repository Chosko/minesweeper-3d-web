# Seed Classic 2D's first-use record from every mode sharing it

## Goal
Hexagon and Triangle share Classic 2D's first-use record (`FIRST_USE_RECORD`
in `js/shell/first-use.js`), but when the `shell.firstUse` document is first
created its seeding reads only Classic 2D's recorded game counter. Seeding
counts the recorded games of every mode whose games the record holds, so a
player who has only played Hexagon or Triangle is treated as one who played
that many Classic 2D games. 3D's record keeps being seeded from 3D's games
alone.

## Acceptance criteria
- A first-created document's `games['classic-2d']` is the sum of the records'
  overall game counters of Classic 2D, Hexagon and Triangle (every mode
  `FIRST_USE_RECORD` maps to `classic-2d`, plus Classic 2D itself).
- A player with recorded Hexagon or Triangle games only (no Classic 2D games)
  is seeded out of the first-games window once they total `FIRST_GAMES` or
  more, exactly as the same count of Classic 2D games would.
- `games['3d']` and `finished3D` are seeded from 3D's counter alone, as before.
- A missing or non-count counter for any mode counts as 0; a records store
  that throws still seeds a fresh document.
- The module's header comment states that the shared record is seeded from
  the games of every mode sharing it.
- A fast test in `tests/shell-first-use.test.mjs` covers the seeding from
  Hexagon and Triangle games.

## Hints
- js/shell/first-use.js (`seeded`, `FIRST_USE_RECORD`, `recordOf`, header comment)
- tests/shell-first-use.test.mjs (the `records` helper and the seeding test)

## Drift
- `.claude/domain/features/flat-grid-modes.md` § Help and hints — settles: the shared first-use record is seeded from the recorded games of all three flat modes.
- `.claude/context/app-shell-help.md` § First-use hints — settles: "seeding a new `shell.firstUse` from them" counts the games of every mode sharing a record.
