# Centre the Classic 2D win confetti on gapped themes

## Goal
On a theme whose board module sets a gap between tiles, the Classic 2D win
confetti burst sits off the winning tile's centre: the end effect takes the
geometry's centre at a given tile size and gap, but the board view asks it for
the confetti with no gap. The board view passes its layout's gap, so the burst
leaves from the centre of the winning tile.

## Acceptance criteria
- `js/classic2d/board-view.js` asks `confettiAt` for the pieces at the layout's
  tile and gap.
- A fast test in `tests/classic2d-view.test.mjs` shows a win's confetti, at the
  moment of the burst, drawn at the centre of the origin cell (`cellRect`'s
  `cx`, `cy`) on a board whose layout has a gap.

## Hints
- js/classic2d/board-view.js (drawEffectLayer)
- js/classic2d/end-effect.js (confettiAt's `gap`)
- tests/classic2d-view.test.mjs (the win end effect test's fakes)

## Drift
- `.claude/context/classic2d-mode.md` § end effect — settles: the confetti "bursts from the origin's centre"; the view now asks for it at the layout's gap so that holds on gapped themes.
