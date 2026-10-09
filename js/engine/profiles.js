// Rule profiles: the table of rulesets the engine plays, keyed by profile and rules version (no DOM).
//
// A profile entry holds its current version and every version it has; each version is a frozen
// record of the behaviours that ruleset marks. js/engine/rules.js and the Classic 2D input
// (js/classic2d/pointer-input.js) read the markers they branch on; the rest record the reference
// behaviour the engine implements, so a fidelity test can pin each one. `fidelity` maps every marker to the heading of its entry in
// tests/fidelity/minesweeper-online.md, the oracle for the reference profile.

export const REFERENCE_PROFILE = 'minesweeper-online';

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};

// Minesweeper Online with its default options.
const reference1 = {
  id: REFERENCE_PROFILE,
  version: 1,
  // Inputs that chord on a revealed number (left release, middle release, left + right).
  chordInputs: ['left', 'middle', 'left+right'],
  // A right press on a revealed number.
  rightPressOnNumber: 'nothing',
  // Mouse input on the Classic 2D board; js/classic2d/pointer-input.js reads these markers.
  // The buttons whose release opens a closed cell.
  revealInputs: ['left', 'middle'],
  // When the right button toggles a flag: on its press, also while left is held on a closed cell.
  flagToggle: 'right-press',
  // What shows pressed while a reveal button is held: a closed, unflagged cell itself; nothing on
  // a flag; a revealed number's closed, unflagged neighbours, whatever the flag count.
  pressFeedback: { closed: 'cell', flagged: 'none', number: 'closed-unflagged-neighbours' },
  // Moving while held presses the cell under the pointer and the release acts there; off the
  // board nothing is pressed and the release does nothing.
  releaseOffCell: 'press-follows-pointer',
  // A chord compares the flag count only: with a matching count a wrong flag opens a mine.
  chordCountsFlagsOnly: true,
  // A chord whose flag count differs from the number.
  chordOnFlagCountMismatch: 'nothing-opens',
  // Whether a revealed cell can be flagged.
  flagRevealedCell: false,
  // The board after a loss.
  lossView: {
    explodedMine: true,
    unflaggedMinesRevealed: true,
    wrongFlagsCrossed: true,
    correctFlagsKept: true,
    otherClosedKept: true,
  },
  // Only the first-click cell is guaranteed mine-free; board-generation implements it.
  firstClick: 'safe-cell',
  // What counts as a click for efficiency: every recorded reveal, flag and chord, wasted ones
  // included. A reveal or chord that opens nothing and a flag click that removes a flag are
  // wasted; a right click on a revealed cell is no click at all. js/engine/rules.js applies it.
  clickCounting: {
    counted: ['reveal', 'flag', 'chord'],
    wastedIncluded: true,
    wasted: { reveal: 'opens-nothing', flag: 'removes-a-flag', chord: 'opens-nothing' },
    flagOnRevealedCell: 'not-counted',
  },
  // The custom board limits board setup validates against: width and height `minSide` to `maxSide`;
  // boards of up to `everyCellUpTo` cells take a mine in every cell; above that the site's mine cap
  // is measured at `mineCaps` ([cells, cap], ascending) and interpolated by cell count between them.
  customLimits: {
    minSide: 1,
    maxSide: 100,
    everyCellUpTo: 36,
    mineCaps: [
      [49, 19], [64, 24], [81, 31], [100, 38], [256, 96], [400, 140], [480, 168],
      [2500, 712], [6400, 1659], [8100, 2051], [10000, 2480],
    ],
  },
  fidelity: {
    chordInputs: 'Chording: which inputs chord',
    rightPressOnNumber: 'Chording: which inputs chord',
    revealInputs: 'Chording: which inputs chord',
    flagToggle: 'Flag timing',
    pressFeedback: 'Pressed feedback',
    releaseOffCell: 'Releasing off the pressed cell',
    chordCountsFlagsOnly: 'Chording on a wrong flag',
    chordOnFlagCountMismatch: 'Chording with a wrong flag count',
    flagRevealedCell: 'Flagging a revealed cell',
    lossView: 'The board after a loss',
    firstClick: 'First-click guarantee',
    clickCounting: 'What counts as a click for efficiency',
    customLimits: 'Largest custom board',
  },
};

export const PROFILES = deepFreeze({
  [REFERENCE_PROFILE]: { current: 1, versions: { 1: reference1 } },
});

// The reference profile's custom board limits (its current version), for board setup.
export const CUSTOM_LIMITS = PROFILES[REFERENCE_PROFILE].versions[PROFILES[REFERENCE_PROFILE].current].customLimits;

// The rule profile `id` at `version` (its current version when omitted). An unknown profile or a
// version this build does not have is refused with a RangeError.
export function getRuleProfile(id, version) {
  const entry = Object.hasOwn(PROFILES, id) ? PROFILES[id] : undefined;
  if (!entry) throw new RangeError(`unknown rule profile "${id}"`);
  const v = version === undefined ? entry.current : version;
  const profile = Object.hasOwn(entry.versions, v) ? entry.versions[v] : undefined;
  if (!profile) throw new RangeError(`rule profile "${id}" has no rules version ${v}`);
  return profile;
}
