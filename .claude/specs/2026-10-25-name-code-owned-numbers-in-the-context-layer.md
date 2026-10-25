# Name code-owned numbers in the context layer

## Goal
Bring `.claude/context/` in line with CLAUDE.md's Editing Discipline rule 10
("No drifting numbers"): every timing, size, count, threshold, limit or
current-version value the code holds and can change is replaced by the name
of the constant (or the function, field or file) that holds it, so a context
file never restates a value that drifts when the code is tuned. Numbers fixed
by definition stay.

## Acceptance criteria
- No context file pairs a named code constant with its value (the
  `` `NAME` (value) `` / `` `NAME` = value `` / `` `NAME` — value `` shape),
  except where the value is an identifier the doc must name (an enum code, a
  bit flag, a format or profile version a behaviour is tied to).
- Tunable values without a named constant (audio gains and throttle gaps,
  the pixel-ratio steps, the gamepad repeat defaults, the mouse spike bound,
  the cue speed limit, the stylesheet's pixel sizes) are described by role
  and point at the function or file that holds them.
- Current-version values of documents and formats (`LAST_CHOICE_VERSION`,
  `LAST_MODE_VERSION`, `VIEW_PREFS_VERSION`, `LIBRARY_VERSION`,
  `IN_PROGRESS_VERSION`, `RECORDS_VERSION`, `HISTORY_VERSION`,
  `GENERATOR_VERSION`, `BOARD_KEY_FORMAT`, the blob store's `DB_VERSION`)
  are named without their value; upgrade-step ids and per-version behaviours
  keep their version numbers.
- Kept: geometry and rule definitions (neighbour counts, the 3 × 3 block,
  √3, the 45° cone, 4 × spacing as the lattice pitch, the side-of-2 rule,
  mines up to cells − 1, 0..1 ranges, 0–255 channels, 32-bit digests);
  enum and encoding values (buttons, view-mode bits, `uPass`, `uEff`,
  `renderOrder`, kinds, -1 sentinels); the original spec's must-preserve
  values in each § Domain dependencies; WCAG thresholds (4.5:1, 3:1, the
  44 px touch target); the standard gamepad's `NUM_BUTTONS`; output-format
  examples (board keys, labels, times, dates, the three-digit counter);
  former boards' identities (double layer, First box); product names
  ("Top 10", artboard names); environment facts (SwiftShader frame rate,
  Node version).
- Only files under `.claude/context/` change, plus this spec;
  `.claude/domain/`, specs and runbooks are untouched.

## Decisions
- The spec-fixed camera values (look rate, move speed, spacing range and
  start) stay in input-camera.md's § Domain dependencies, which quotes
  `docs/ORIGINAL_SPEC.md`; the constants list names them without values and
  points there.
- Spelled-out design counts ("the four cube presets", "the three
  configurations") are left: they are product structure, not tuning.
- settings.md's table keeps choice values and the boolean and choice
  defaults (identifiers); its numeric ranges and defaults point at `SCHEMA`.
- Illustrative magnitudes in prose (a 1000 × 1000 flood example) are kept
  where no constant or test holds them.

## Hints
- CLAUDE.md § Editing Discipline (rule 10)
- `.claude/context/*.md` (every file with a value-bearing constant)
- `js/audio.js`, `js/input.js`, `js/gamepad.js`, `js/settings/appliers.js`,
  `js/render.js`, `js/readability.js`, `js/replay/*.js`, `js/records/*.js`,
  `js/mode3d/board-choice.js`, `js/mode3d/learn.js` (the names cited)

## Drift
- `CLAUDE.md` § Editing Discipline — settles: which numbers count as
  "fixed by definition" in the context layer (the kept categories above).
