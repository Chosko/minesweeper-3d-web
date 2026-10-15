# shell-mode-3d tablet touch test robust under load

## Goal
The tablet touch test in `tests/shell-mode-3d.test.mjs` failed under
full-suite load at its Orbit check "rotated about the centre". Its one-finger
look drags and look-zone taps are sent as separate `Input.dispatchTouchEvent`
calls, so the time between a finger landing and its first move (or its lift)
is the test's round trip; on a loaded machine that passes the 400 ms
long-press, the touch machine flags instead of turning or revealing, and the
yaw never changes. The test sends those gestures as browser-synthesized
gestures, the convention `classic2d-touch` already follows.

## Acceptance criteria
- `fingers()` in `tests/shell-mode-3d.test.mjs` offers `tap` through
  `Input.synthesizeTapGesture` and `drag` through
  `Input.synthesizeScrollGesture`, both with `gestureSourceType: 'touch'`.
- The tablet test's Fly look drag and Orbit drag use `f.drag`; its two taps
  in the look zone (reveal 4, reveal 1) use `f.tap`. Multi-finger gestures,
  the stick, the long-press and taps on HUD buttons keep their current form.
- The Orbit drag asserts it adds no vibration to the long-press's one ('a drag, not a long-press'),
  as the Fly drag does, so a drag lost to the long-press is named as such.
- No retry, skip or timeout change is added; every assertion keeps its
  meaning and thresholds.
- The test passes repeatedly with `MS_TIME_SLACK=1` beside a parallel
  browser-tier run.
- `.claude/context/testing-conventions.md` § *Input that a round trip cannot
  stretch* names `shell-mode-3d` beside `classic2d-touch`.

## Decisions
- The look-zone taps change too: a tap held past 400 ms by the same round
  trip turns into a long-press flag, the same failure on a different check.

## Hints
- tests/shell-mode-3d.test.mjs (`fingers`, the tablet "3D plays by touch" test)
- tests/classic2d-touch.test.mjs (`fingers`: the synthesized `tap` and `drag`)
- js/touch-3d.js (`LONG_PRESS_MS`, the `PENDING` phase)
- .claude/context/testing-conventions.md § Input that a round trip cannot stretch

## Drift
- `.claude/context/testing-conventions.md` § Input that a round trip cannot stretch — settles: the 3D touch test follows the synthesized-gesture rule; the file names it as a second example.
