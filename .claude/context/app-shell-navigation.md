# App shell — screen router, back stack, session history, Back inputs

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/router.js` (the screen router and back stack),
`js/shell/history.js` (the session-history mirror through which the
browser's Back is a Back input; its rules in its head comment) and their
wiring in `js/main.js`: the router's screen table `SHELL`, Back inputs and
board links. Default focus, the open overlay's focus containment and the
focus walk (`navStep`) are [app-shell-focus.md](app-shell-focus.md). The
shell navigation layer over the controller (`js/shell/navigation.js`) is
[input-controller.md](input-controller.md); the controller's menu layers
are [app-shell-ui.md](app-shell-ui.md) § Controller menus.

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
  (`js/shell/challenge.js`, wired in `js/main.js` as `LINKS`,
  [app-shell-daily.md](app-shell-daily.md)): followed once
  at boot after the main menu shows and on `hashchange`, then removed with
  `history.replaceState(history.state, …)`, so the entry keeps its stamp and
  no entry is added. A hash entry the browser pushed carries no stamp, and
  `HISTORY.popstate` ignores it.
- **Session history.** `HISTORY` mirrors the back stack: the router's
  `onChange` calls `sync()`, the window's `popstate` goes to `popstate`, and
  `start` stamps the base entry at boot from the navigation entry's type.
  The URL never changes; a reload opens the menu.
- **The browser's Back** (and a mouse's back button) is `historyBack`, run
  by `HISTORY` on a `popstate` back: nothing during an end delay; either
  confirmation closes first; the board (`playing`,
  `classic-2d`) pauses through `pauseGame('button')`; the pause card of an
  unfinished game and a started game's ready card hold the game; anything
  else is `SHELL.back('history')`. `HISTORY` restores the consumed entry
  when the stack did not shrink.
- **Back inputs.** `shellBack(source)` does nothing during an end delay,
  else closes the pause confirmation or Reset all
  data's confirmation first, then calls `SHELL.back`. Esc (`isBackKey`)
  reaches it through `Input`'s `onKey`; the board choices', placeholder's
  and Settings page's Back buttons through `onBack`, the Records screen's
  `#records-back` through its view's `onBack`; controller back buttons
  through `padMenus` (on a board, `padBoard2D` and `padPlaying` turn them
  into `backGame('pad')`). Pointer-locked Esc:
  [app-shell-3d.md](app-shell-3d.md) § Pointer lock; Esc on the pause card:
  [app-shell-pause.md](app-shell-pause.md). Each Back Esc triggers carries
  its back key hint inside it (`ui-key-hint data-action="back"`, none on
  touch); the 3D results card's hint:
  [app-shell-results-view.md](app-shell-results-view.md) § Look at the board.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  screens, router and Back rules.

## CROSS-REFERENCES

- [app-shell-focus.md](app-shell-focus.md) — default focus, focus
  containment and the focus walk.
- [input-controller.md](input-controller.md) — the navigation layer
  (`focusMove`, `inertSections`, `tabWrap`, `pickInDirection`);
  [input.md](input.md) — `escResumes`.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (router and its
  session-history mirror).

## WHEN TO READ THE SOURCE

- Adding a screen or changing a transition (pause, ready, lockless,
  ctxlost): the router's screen table (`SHELL`) in `js/main.js`, plus
  `LAYER_SCREEN` for controller navigation.
- Changing what the browser's Back does or how the session history mirrors
  the back stack: the head comment of `js/shell/history.js` and
  `historyBack` in `js/main.js`.
