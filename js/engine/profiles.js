// Rule profiles: the table of rulesets the engine plays, keyed by profile and rules version (no DOM).
//
// A profile entry holds its current version and every version it has; each version is a frozen
// record of the behaviours that ruleset marks. js/engine/rules.js and the Classic 2D input
// (js/classic2d/pointer-input.js) read the markers they branch on; the rest record the reference
// behaviour the engine implements, so a fidelity test can pin each one. `fidelity` maps every marker to the rule it was
// fixed against: for the reference profile the heading of its entry in tests/fidelity/minesweeper-online.md, for the 3D
// profile the rule of docs/ORIGINAL_SPEC.md (the original 3D game) it reproduces, or the deliberate difference of
// .claude/domain/features/3d-board-graph.md it follows.

export const REFERENCE_PROFILE = 'minesweeper-online';
export const PROFILE_3D = 'minesweeper-3d';

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

// The 3D game's rules (docs/ORIGINAL_SPEC.md § Rules) on the shared engine, with the m2 rules change:
// a safe first click, mines from board-generation, no action after the game ends.
const original3d1 = {
  id: PROFILE_3D,
  version: 1,
  // A flag click on a revealed cell flags every closed, unflagged neighbour, or unflags every closed
  // neighbour when all are already flagged.
  flagRevealedCell: 'neighbours',
  // A zero with a flagged neighbour does not spread a flood fill (or a chord's flood) further.
  zeroFloodStopsAtFlag: true,
  // A reveal on a revealed zero chords it: the original's left click on a pressed zero.
  revealOnRevealedZero: 'chord',
  // Auto-hide (unlinking), kept after every action while playing: a revealed, unflagged cell whose
  // flagged-neighbour count equals its number hides when it is a zero or when every neighbour is
  // revealed or flagged; unflagging a cell shows its hidden neighbours again.
  autoHide: true,
  // A chord compares the flag count only: with a matching count a wrong flag opens a mine.
  chordCountsFlagsOnly: true,
  // A chord whose flag count differs from the number.
  chordOnFlagCountMismatch: 'nothing-opens',
  // Won when every safe cell is revealed and no safe cell is flagged; flags on mines not required.
  win: 'safe-cells-revealed',
  // The board after a loss: every hidden cell is shown again; the engine's visual-state query
  // reports the exploded mine, the mines and the wrong flags as on every profile.
  lossView: {
    explodedMine: true,
    unflaggedMinesRevealed: true,
    wrongFlagsCrossed: true,
    correctFlagsKept: true,
    hiddenShown: true,
  },
  // Only the first-click cell is guaranteed mine-free; board-generation implements it.
  firstClick: 'safe-cell',
  // The reference rule applied to the 3D actions: every recorded reveal, flag and chord is one
  // click. A flag click on a revealed cell is one flag click however many neighbours it changes,
  // wasted when it flags none.
  clickCounting: {
    counted: ['reveal', 'flag', 'chord'],
    wastedIncluded: true,
    wasted: { reveal: 'opens-nothing', flag: 'flags-nothing', chord: 'opens-nothing' },
    flagOnRevealedCell: 'one-flag-click',
  },
  fidelity: {
    flagRevealedCell: 'Rules: rightClick',
    zeroFloodStopsAtFlag: 'Rules: chord',
    revealOnRevealedZero: 'Rules: leftClick',
    autoHide: 'Rules: Unlinking (auto-hide)',
    chordCountsFlagsOnly: 'Rules: chord',
    chordOnFlagCountMismatch: 'Rules: chord',
    win: 'Rules: Win',
    lossView: 'Rules: Lose',
    firstClick: '3d-board-graph: Deliberate differences',
    clickCounting: '3d-board-graph: Data and state',
  },
};

export const PROFILES = deepFreeze({
  [REFERENCE_PROFILE]: { current: 1, versions: { 1: reference1 } },
  [PROFILE_3D]: { current: 1, versions: { 1: original3d1 } },
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
