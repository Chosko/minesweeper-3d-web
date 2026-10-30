# Area handoff: win-fatal (desktop window, the fatal card in the frame-sized window)

Done: committed 3f70df8 "Fill the window with the windowed desktop fatal card" (not pushed), via /quick-implement.

## Finding
- The fatal card (`index.html` `#fatal-card` template) shows when main.js fails to load (no desktop binding
  runs then: no `data-host`, root = the window, fine) or when `THEME.start` rejects (`js/main.js` showFatal).
- In the second case, windowed, `.fatal` (fixed, inset 0) filled the root area (the work area), not the window.
  Measured: backdrop at (-470,-44)..(1450,996) in a 980 x 952 window. Its card centred in the work area: on
  the window only when the measured frame is itself centred there; before the first screen change (window
  at its start-up size, shift 0) it sat off-centre and could cross the window's edge on a large display.
- The card is not a screen frame and is not measured into the window size; it need not be: its width
  `min(560px, 100%)` fits any window the page reports.

## The change
- `css/style.css`, own block after the `.fatal, .noscript, .not-found` rules:
  `:root[data-host="desktop"][data-window-state="windowed"] .fatal { inset: var(--window-y, 0px) auto auto
  var(--window-x, 0px); width: 100vw; height: 100vh; }` (same approach as the windowed `.toast`).
- `tests/components.test.mjs` viewport-unit allow-list admits the selector (third, file order); title says so.
- New browser test in `tests/components-game-area.test.mjs` "on the desktop host windowed, the fatal card
  fills the window and its card sits centred inside it…": failed before (layer box), passes after.
- Docs: `css/components.css` Fatal card entry; context `platform.md` § The windowed window,
  `app-shell-kit-layout.md` § The root area, `testing.md` components row.
- Spec: `.claude/specs/2026-10-30-windowed-fatal-card-on-the-window.md`.
- Partial-file staging (style.css, platform.md, app-shell-kit-layout.md held other agents' hunks) done by
  writing HEAD + own edits as index blobs; no foreign hunk committed.

## Tests
run-full-tests.sh: fast 2649/2649, browser 24/24 and 9/9.

## Open
- `.claude/context/app-shell-stylesheet.md` style.css row not edited (its one line carried another agent's
  uncommitted change): its message-pages entry could name the windowed fatal card. Catch-up:
  `/pipeline-revise --catch-up .claude/specs/2026-10-30-windowed-fatal-card-on-the-window.md`.
- Not observed in Electron (no agent launch).

## Owner verification
Hard to trigger by hand: the fatal card needs the default theme's board module or fonts to fail at start-up.
In the desktop build, windowed, block or rename the default theme's board module file and start the game:
the card should fill the window, centred. Restore the file after.

## Off limits (kept)
`js/platform/window-actions.js`, `desktop/window.js`, `index.html`, `.ui-frame` rules,
`tests/platform-selection.test.mjs`. Never deploy-steam.sh / SteamCMD.
