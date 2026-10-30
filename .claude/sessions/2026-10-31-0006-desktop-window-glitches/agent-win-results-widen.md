# Agent handoff — win-results-widen

Problem (owner, Electron build on Steam): windowed, the results screen shown
over a finished flat game (Classic 2D, Hexagon, Triangle) widens the window.
3D is unaffected: during a 3D game, results included, `fullArea()` holds
(`js/main.js:437`) and the window is the whole work area.

## Root cause

- `js/platform/window-actions.js:139-172` `bindScreenSize().measure()`
  takes the bounding box of **every shown** `SCREEN_FRAMES` element
  (`:30`, `'.ui-frame, .ui-screen'`), reports its size and shifts the root
  by its corner (`--window-x/-y`). While results shows, both
  `#c2d-frame` (the game window, still laid out, with only its chrome made
  `visibility: hidden`, `css/style.css:532`) and `#results-frame` are
  shown, so the window is max(width) × max(height) of the two.
- `#results-frame` width: `min(1040px, 100%)`, 1000 below a 1440 root area,
  960 below 1200 (`css/style.css:302-304`). `100%` is the `#results`
  overlay (`position: fixed; inset: 0`, `css/style.css:42`), which is the
  root area (= display work area, `:root[data-host=desktop] { contain: layout }`).
- Game window: board at `TILE_CAP` = 48 (`js/classic2d/board-view.js:154`)
  plus chrome, so Beginner is about half the results width; the window
  roughly doubles in width. A board wider than the card keeps its width.
- The host (`desktop/window.js:51-67` `fit()`) keeps the window's top-left
  and only moves it to stay in the work area, so the window grows rightward
  and downward instead of staying centred.
- As built, this is deliberate: `.claude/context/platform.md:164-165` ("a
  card over the game window widening it") and
  `tests/platform-selection.test.mjs:446-463` pin it ("the wider results
  take the window with them", expected `[1040, 700]` = union).

## Domain position

- The domain says nothing about a screen over the game window. It says the
  window is "the screen's frame at its natural size"
  (`steam-desktop-host.md` § The desktop window;
  `shared-screen-layout.md` § Screen frame). The union is the context
  layer's and the test's reading, not a domain rule.
- `results-screen.md` § Results view: one column, its width by window size
  (the canvas draws 1040/1000/960). § Board shown behind: the finished
  board stays visible behind the screen.
- So any fix is a **new owner decision**, and it must be written into the
  domain (`steam-desktop-host.md`, `shared-screen-layout.md` § Screen
  frame) before code.

## Fix options (owner picks)

A. **The window keeps the game window's size, and the results card fits
   inside it.** This is what "widens = glitch" asks for. Not a
   quick-implement: it needs a narrow desktop results arrangement, which
   the canvas does not draw.
   - `bindScreenSize.measure`: when a base frame shows, leave out frames
     inside a shown `.overlay` (`#results`, `#pause`, cards). Also set
     `--window-w/--window-h` on the root.
   - `css/style.css:9-11`: add a windowed rule
     `.overlay { inset: auto; left: var(--window-x); top: var(--window-y); width: var(--window-w); height: var(--window-h); }`,
     so the overlay lays out in the window box.
   - Results arrangement: key the 2×2 tiles (`:331`, `@container root
     (max-width: 999px)`) and the phone block (`:335`, `@media
     (max-width: 719px)`) on the box the card lays out in. Add
     `#results { container: results / inline-size }` and use `@container
     results`. Keep the web thresholds equivalent: the content box is the
     viewport less the 32 px padding. The phone `@media` is settled to
     `not all` on desktop (`bindAreaMedia`), so it cannot be reused there.
   - Smallest game windows (a custom 5×5, the Pause+buttons floor) give a
     card about 300 px wide. The phone arrangement copes; check it.
B. **The window is the topmost screen's frame only** (results replaces the
   game window as the window). Small change in `measure()`: if any shown
   frame is inside a shown `.overlay`, measure only those. Results still
   widens a small board's window to 960–1040, and it shrinks an Expert
   window. The board behind is hidden. This does not satisfy the owner's
   complaint; it only drops the union's extra height and width.
C. Optional, either way: the host keeps the window centred on its old
   centre when the size changes (`desktop/window.js` `fit()`). This applies
   to every screen change, so it is out of this problem's scope unless the
   owner asks.

Recommendation: A, if the owner confirms "window keeps the game's size"
for every popup over the game window. This rule also covers the pause card
and status cards, so it is the same decision and fix as the in-game popup
problem.

## Overlap with "a popup during a game grows the whole window to fit both"

Same root cause: the same union in `measure()`
(`window-actions.js:159-168`), with `.ui-screen` cards (pause, status,
`width: min(560px, 100%)`, `css/components.css:2281-2287`) as the second
frame. One rule and one `measure()` change fix both. Coordinate so that
only one agent edits `window-actions.js`, `css/style.css:9-11` and
`platform-selection.test.mjs:446-463`.

## Tests

- Fast: `tests/platform-selection.test.mjs:446-463`. Change the expectation:
  under A, `[[600,600],[800,700]]` with the shift staying at the game frame
  and `--window-w/-h` = 800/700; under B, the results card alone. To mark a
  frame as inside an overlay, the fake frame (`fakeFrame`, near `:300-338`)
  needs `closest()`. Add a case where results is smaller than the game
  window.
- Browser (A only): one test in `tests/components-game-area.test.mjs`
  (desktop work-area harness: `openPage(browser, base, SMALL_WINDOW,
  WORK_AREA)`). Finish a Beginner board, show results, and assert that
  `#results-frame` lies within `#c2d-frame`'s box and its actions are
  reachable (body scrolls). Run it only through `.claude/external/` scripts.
- Docs stale under A or B: `.claude/context/platform.md:162-176`,
  `app-shell-results-view.md` § Over the board, the `css/style.css:290-301`
  comment, the doc comment in `window-actions.js:130-138`.

## Verification recipe

`node --test tests/platform-selection.test.mjs` (fast; 37/37 pass on the
current tree). Then `run-affected-tests.sh` for the browser file. The final
check is the owner's: a desktop run, windowed, Beginner win, and the window
size before and after results. Never run deploy-steam.sh or SteamCMD.

## Owner rules / rejected

- The window stays opaque (decided).
- The width-vs-height frame steps (shrinking by width while the title bar
  goes compact below an 820 px height) are deferred: not part of this fix.
- No Electron, browsers or browser tests run by investigation agents.

## Pitfalls

- `.overlay` is `position: fixed` but resolves against the root
  (`contain: layout`), which is shifted by `-window-x/-y`. Any overlay box
  must use the same vars.
- `bindAreaMedia` rewrites window-size `@media` to all/not all against the
  work area, so a `@media (max-width)` never helps on desktop. Use
  container queries.
- `#c2d-frame` keeps layout under results (its chrome is only
  `visibility: hidden`), so `getClientRects()` counts it as shown.
- The results card's tile font uses `cqi` (`css/style.css:318,344`). Under
  a new container, `cqi` reads that container.
