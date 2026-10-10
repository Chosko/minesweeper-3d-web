# Controller-only browser test for the 3D board choice and the placeholder

## Goal
Cover controller navigation of two shell screens in a real browser: the 3D
board choice (`#board-choice`) and the coming-soon placeholder
(`#coming-soon`). A Playwright test drives the shell only through a fake
gamepad, with `navigator.getGamepads` stubbed in the page, and the shell's
per-frame controller poll reads it. The test changes no production code.

## Acceptance criteria
- A Playwright test in `tests/shell-menu.test.mjs` installs a fake standard
  gamepad before the page loads (`page.addInitScript` stubbing
  `navigator.getGamepads`). It presses and releases buttons only on that pad:
  no mouse, no keyboard and no `__ms` action drives navigation.
- From the menu, the D-pad reaches the 3D entry and A opens `board-choice`.
  A preset has the focus.
- The D-pad moves the focus between presets, and the test checks each
  focused preset by its `data-preset`.
- A confirms the focused preset: the screen becomes `ready`, and the 3D
  board settings match that preset's size and mine count.
- The Back button on `ready` returns to `board-choice`, and the Back button
  there returns to `menu`.
- With the Records entry's screen made unregistered (see Decisions), the
  D-pad and A on that entry open `coming-soon` titled "Records". B leaves it
  and returns to `menu`.
- Each press is released before the next one, so held-button suppression on
  screen changes is respected.
- No page errors occur, the test skips when Playwright or chromium is
  unavailable, and the full suite passes.

## Decisions
- The placeholder is reached through the menu's fallback (`entryRoute`). The
  router itself refuses an unknown screen. The test intercepts
  `js/shell/menu.js` with `page.route` and serves it with the Records entry
  naming a screen the router does not have, so the real fallback runs and no
  production code changes.
- The Back button is used on the board choice and B on the placeholder.
  Together they cover both of the inputs `backButtons` gives menus.

## Hints
- .claude/domain/features/game-shell.md (navigation contract)
- js/shell/navigation.js (`backButtons`, `createHeldSuppressor`)
- js/main.js (`padMenus`, `padNav`, `padActivate`, the screen table)
- js/shell/menu.js (`entryRoute`, `PLACEHOLDER_SCREEN`)
- js/gamepad.js (`BTN`, `GamepadReader.poll`)
- tests/shell-menu.test.mjs (`serve`, `loadPlaywright`, the existing browser test)

## Drift
- `.claude/context/testing.md` § OVERVIEW (`tests/shell-menu.test.mjs` entry) — settles: lists one Playwright test, so it needs the controller test added
- `.claude/context/app-shell.md` § Main menu — settles: "No current entry reaches the placeholder; it stays the route for an entry whose screen is not registered" — the test exercises that route
- `.claude/domain/features/game-shell.md` § Interfaces and contracts (Navigation contract) — settles: controller operability of the board choice and placeholder is now tested in a browser
