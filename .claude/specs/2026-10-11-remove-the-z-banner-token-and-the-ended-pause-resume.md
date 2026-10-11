# Remove the z-banner token and the ended pause card's resume

## Goal
Remove two leftovers nothing uses. The `--z-banner` z-layer token served the
3D end banner, which the results takeover replaced; it goes, with its entry in
the tokens test. The pause card's "Keep looking around" action resumed an
ended game; only a fixed debug 3D board (no seed, no summary, so no results
screen) still ends on the pause card. On an ended game the card offers Play
again and Main menu only, as the game shell's pause rules say, and Back from
it goes to the main menu instead of resuming the ended game.

## Acceptance criteria
- `css/tokens.css` declares no `--z-banner`; the tokens test's z-layer order
  no longer lists `banner` and asserts the token is absent.
- `js/ui.js` contains no "Keep looking around"; `showPause` hides `#p-resume`
  when the game has ended and shows it while playing, its label always
  "Resume".
- On an ended game the pause card leads with Play again (primary), then Main
  menu; Resume is not shown.
- Back (Esc or the controller) on an ended game's pause card goes to the main
  menu with no confirmation; on an unfinished game it resumes as before.
- The pause card while playing is unchanged: Resume (primary, default focus),
  Restart, Main menu.

## Decisions
- Back on an ended card goes to the main menu: resuming would reach the same
  removed look-around state, and the card's other non-replay action is Main
  menu.

## Hints
- `css/tokens.css` (z-layers block)
- `tests/tokens.test.mjs` ("the z-layers stack the overlays in order")
- `js/ui.js` (`showPause`)
- `js/main.js` (`resumeFromPause`, `gameOver`, the `paused` screen's `back`)
- `tests/components.test.mjs` (the ended-game pause card check)

## Drift
- `.claude/domain/features/game-shell.md` § Pause rules — settles: after the game ends the pause card offers restart and back to menu; the change removes the resume that went beyond that.
- `.claude/context/app-shell.md` § Pause card — settles: "Resume while playing, Play again once ended" stays true; Resume is now hidden once ended.
- `.claude/context/app-shell.md` § Back stack — diverges: says `paused` Back is `resumeFromPause`; on an ended game it now goes to the main menu.
- `.claude/context/app-shell.md` § Design tokens — settles: the z-layer list already omits the banner.
