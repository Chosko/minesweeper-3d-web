# App shell — screen router, back stack, session history, Back inputs, focus

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/router.js` (the screen router and back stack),
`js/shell/history.js` (the session-history mirror through which the
browser's Back is a Back input; its rules in its head comment) and their
wiring in `js/main.js`: the router's screen table `SHELL`, Back inputs,
default focus, the open overlay's focus containment and the focus walk
(`navStep`). The shell navigation layer over the controller
(`js/shell/navigation.js`) is [input-controller.md](input-controller.md); the controller's menu
layers are [app-shell-ui.md](app-shell-ui.md) § Controller menus.

## PUBLIC API

`js/shell/router.js`
- `SHELL_SCREENS` — `menu`, `board-choice`, `playing`, `paused`, `results`,
  `records`, `settings`; a shell registers the ones it has.
- `createRouter({screens, focus?, onChange?})` — `screens[name]` =
  `{show(data, from), hide?(to), defaultFocus?: selector | null | () =>
  selector, back?({router, source})}`; `focus(target, name)` is the focus
  hand-off, `onChange({from, to})` runs after every change. Router:
  `current`, `stack` (copy), `has(name)`, `defaultFocus(name?)`, `go(name,
  {data, replace})`, `back(source)` → false with nowhere to go,
  `refocus()`. An unknown screen throws.

`js/shell/history.js`
- `HISTORY_KEY` (`'ms3d'`); entries carry `{ms3d: <page load>, depth}`.
- `createHistorySync({router, history, onBack, session?, superseded?})` →
  `start(navigationType)` (stamps the base entry; false for an entry of a
  superseded load, and the page walks out), `sync()` (push, replace or
  `history.go(-n)` until the depth equals `router.stack.length`),
  `popstate(state)`, `depth`, `pending`.
- `storedSet(getStorage, key, limit?)` → `{has, add}` — superseded loads in
  session storage (`ms3d.history.superseded`, newest 50); unusable storage
  reads as empty.

## INTERNAL PATTERNS

- **The router owns the screen.** Every screen change is `SHELL.go`;
  nothing else toggles a screen. `S.mode` is a getter over `SHELL.current`:
  `menu | board-choice | coming-soon | daily | records | classic-2d-choice |
  settings | ready | playing | classic-2d | paused | results | replay |
  ctxlost`. In the 3D game only `playing` moves the camera, runs the timer and
  accepts actions (`hasSelection`, `Input.isActive`); the Classic 2D board
  takes input and runs its timer on `classic-2d`. Every
  router change sets `needRender`, calls `HISTORY.sync()`, `layerChanged()`
  and `sync3D`, and refreshes the hint strip.
- **Back stack.** `go` stacks the screen it leaves; going to a stacked
  screen unwinds to it; `replace` swaps without stacking (`ready` hands over
  to `playing` that way). Back is the screen's own `back` when declared —
  `ready` → `readyBack` (board choice for a fresh board, pause for a
  started game; a keyboard Back within 500 ms of a lock release is
  ignored), `playing` / `classic-2d` → `backGame` (cancels a board being
  generated, else pause), `paused` → `resumeFromPause` (the menu once the
  game has ended, else resume), `results` → menu, `replay` → its `returnTo`
  (the menu when none), `ctxlost` → menu — else the stacked screen.
- **Board links.** The one URL the shell reads is a `#board=<code>` hash
  (`js/shell/challenge.js`, wired in `js/main.js` as `LINKS`): followed once
  at boot after the main menu shows and on `hashchange`, then removed with
  `history.replaceState(history.state, …)`, so the entry keeps its stamp and
  no entry is added. A hash entry the browser pushed carries no stamp, and
  `HISTORY.popstate` ignores it.
- **Session history.** `HISTORY` mirrors the back stack: the router's
  `onChange` calls `sync()`, the window's `popstate` goes to `popstate`, and
  `start` stamps the base entry at boot from the navigation entry's type.
  The URL never changes; a reload opens the menu.
- **The browser's Back** (and a mouse's back button) is `historyBack`, run
  by `HISTORY` on a `popstate` back: nothing during an end delay; the
  controls modal or either confirmation closes first; the board (`playing`,
  `classic-2d`) pauses through `pauseGame('button')`; the pause card of an
  unfinished game and a started game's ready card hold the game; anything
  else is `SHELL.back('history')`. `HISTORY` restores the consumed entry
  when the stack did not shrink.
- **Back inputs.** `shellBack(source)` does nothing during an end delay,
  else closes the controls modal, the pause confirmation or Reset all
  data's confirmation first, then calls `SHELL.back`. Esc (`isBackKey`)
  reaches it through `Input`'s `onKey`; the board choices', placeholder's
  and Settings page's Back buttons through `onBack`, the Records screen's
  `#records-back` through its view's `onBack`; controller back buttons
  through `padMenus` (on a board, `padBoard2D` and `padPlaying` turn them
  into `backGame('pad')`). Pointer-locked Esc:
  [app-shell-3d.md](app-shell-3d.md) § Pointer lock; Esc on the pause card:
  [app-shell-pause.md](app-shell-pause.md). Each Back Esc triggers carries
  an "Esc: Back" hint (`[data-esc-hint]`), except the coarse-only ready
  card's (`#ready.ready--touch` hides it); the 3D results card's hint:
  [app-shell-results.md](app-shell-results.md) § Look at the board.
- **Focus.** Each router entry declares `defaultFocus`; the `focus`
  hand-off (`focusScreen`) resolves it inside the screen's layer, falling
  back to its first focusable control. Defaults: menu the last mode played
  (`[data-entry][data-last]`); 3D board choice `[data-preset][data-last]`;
  Classic 2D board choice `[data-size][data-last]`; placeholder its Back;
  Records the chosen board (`#records-picker [aria-checked="true"]`);
  Settings `#set-lookSensitivity`; ready `#ready-btn`; pause Cancel while
  confirming, else Play again once ended, else Resume; results `#r-again`;
  replay `REPLAY_VIEWER.defaultFocus()`; Learn 3D's end card
  `#learn-end-primary`; the Daily screen `DAILY_VIEW.defaultFocus()`;
  ctx-lost its reload button; the status cards `statusFocus`.
- **Focus containment.** `holdInert(holder, els)` is the one owner of
  `inert`: each holder (`ctxlost`, `overlay`, `confirm` in `INERT_HOLDS`)
  names its elements, and an element is inert while any holder names it,
  so one holder letting go never lifts another's. `applyContainment()`
  (every router change and focus hand-off, and any `class` change through
  a `MutationObserver`) makes every other top-level section inert behind
  the open overlay — the topmost visible layer when it is one of
  `CONTAINED` (`controls-modal`, `pause`, `learn-end`, `results`, `replay`),
  the toast kept live — and the rest of the pause card inert behind its
  confirmation. The walk (`padFocusables`) skips inert subtrees, and a layer
  inside one is not open. Where the browser has no `inert`, Tab at the
  overlay's (or the confirmation's) edges wraps through `tabWrap`.
- **Focus walk.** `navStep(layer, items, cur, dir)` is the D-pad's and the
  arrow keys' move, `focusMove` ([input-controller.md](input-controller.md))
  with tables and `.ui-menu`s as groups, so their controls step in page
  order on Up / Down. Its spatial search (`pickInDirection`, the 45° rule):
  Up / Down treat a board choice's row of custom fields (`form .ui-row`) as
  one control, measured from the whole row and skipping its own controls;
  aim at a table's buttons by their row (`tr`), so a table is entered from
  above or below wherever its buttons sit; and inside a column layout
  (`.ui-column`, as Records) search only `cur`'s column, so the walk leaves
  a column at its ends in page order, and a move from outside enters the
  columns at their first control (Down) or last (Up). Left / Right on a
  range input step its value. The arrow keys do not walk on `playing`,
  `classic-2d`, `records`, the replay viewer or the look (`KEY_NAV_OFF`),
  which handle arrows of their own.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  screens, router and Back rules.

## CROSS-REFERENCES

- [input-controller.md](input-controller.md) — the navigation layer
  (`focusMove`, `inertSections`, `tabWrap`, `pickInDirection`);
  [input.md](input.md) — `escResumes`.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (router and its
  session-history mirror, navigation; `shell-pad-walk` the walk over every
  screen, `shell-focus-containment` the inert set and Tab wrap).

## WHEN TO READ THE SOURCE

- Adding a screen or changing a transition (pause, ready, lockless,
  ctxlost): the router's screen table (`SHELL`) in `js/main.js`, plus
  `LAYER_SCREEN` for controller navigation.
- Changing what the browser's Back does or how the session history mirrors
  the back stack: the head comment of `js/shell/history.js` and
  `historyBack` in `js/main.js`.
- Adding an overlay that should hold focus, or a new holder of `inert`:
  `CONTAINED`, `applyContainment` and `holdInert` in `js/main.js`.
- A control the D-pad or the arrows skip or reach in the wrong order:
  `navStep` and `padFocusables` in `js/main.js`.
