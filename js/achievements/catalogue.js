// The Steam achievement catalogue: each achievement's API name and its rule (no DOM).
//
// Every rule is a predicate over one won game on a standard board, read through the game view the
// evaluator builds (js/achievements/evaluate.js):
//   { classic, cube, noGuess, bbbvPerSecond, efficiency, flagClicks }
// classic is the Classic 2D standard board's name ('Beginner', 'Intermediate', 'Expert') or null,
// cube the 3D cube preset's name or null; bbbvPerSecond and efficiency are game-summary's
// derivations at the results screen's precision, null when not available; flagClicks counts every
// flag click of the game, a removed flag's included. A lost or abandoned game, a custom board and a
// Daily board earn nothing, so no rule restates that.
//
// The API names are the Steamworks app settings' names, and a name never changes once published; a
// test pins them. A tier's name carries its rank, never its threshold, so calibrating a threshold
// renames nothing.

// The thresholds, provisional until calibrated against real play: 3BV/s for the speed tiers,
// efficiency as a percentage.
export const THRESHOLDS = Object.freeze({
  expertSpeed: Object.freeze([1, 2, 3]),
  efficiency: Object.freeze([100, 150]),
  cubeExpertSpeed: 0.5,
});

const atLeast = (value, threshold) => value !== null && value >= threshold;
const isIntermediateOrExpert = (g) => g.classic === 'Intermediate' || g.classic === 'Expert';

const entry = (name, rule) => Object.freeze({ name, rule });

export const CATALOGUE = Object.freeze([
  entry('CLASSIC_BEGINNER_WIN', (g) => g.classic === 'Beginner'),
  entry('CLASSIC_INTERMEDIATE_WIN', (g) => g.classic === 'Intermediate'),
  entry('CLASSIC_EXPERT_WIN', (g) => g.classic === 'Expert'),
  entry('CLASSIC_EXPERT_HARD_WAY', (g) => g.classic === 'Expert' && !g.noGuess),
  ...THRESHOLDS.expertSpeed.map((t, i) => entry(`CLASSIC_EXPERT_SPEED_${i + 1}`,
    (g) => g.classic === 'Expert' && atLeast(g.bbbvPerSecond, t))),
  ...THRESHOLDS.efficiency.map((t, i) => entry(`CLASSIC_EFFICIENCY_${i + 1}`,
    (g) => isIntermediateOrExpert(g) && atLeast(g.efficiency, t))),
  entry('CLASSIC_NO_FLAGS', (g) => isIntermediateOrExpert(g) && g.flagClicks === 0),
  entry('CUBE_BEGINNER_WIN', (g) => g.cube === 'Beginner'),
  entry('CUBE_INTERMEDIATE_WIN', (g) => g.cube === 'Intermediate'),
  entry('CUBE_EXPERT_WIN', (g) => g.cube === 'Expert'),
  entry('CUBE_EXPERT_SPEED', (g) => g.cube === 'Expert' && atLeast(g.bbbvPerSecond, THRESHOLDS.cubeExpertSpeed)),
]);
