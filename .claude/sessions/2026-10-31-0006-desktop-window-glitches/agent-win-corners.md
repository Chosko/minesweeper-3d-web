# Area handoff: win-corners (desktop window corners)

Owner report: "Desktop window glitch: the top and bottom corners are wrong"
(Electron build on the Steam client, windowed). Investigation only; nothing edited.

## Code regions

- `desktop/window.js` `windowOptions` (lines 10-35): `frame: false`,
  `transparent: false`, `backgroundColor: '#000000'`, `hasShadow: false`,
  `resizable: Boolean(state.fullscreen)`. No `roundedCorners` / `thickFrame`
  set, so Electron's defaults apply: `roundedCorners` defaults to true and on
  Windows 11 (build >= 22000) a frameless window gets the system's rounded
  corners (electron 44.9.3, `desktop/node_modules/electron/electron.d.ts`
  `roundedCorners?`).
- `desktop/window.js` `windowActions` toggles `setResizable(true/false)` around
  fullscreen (lines 79-99): the window style flips, which may change whether
  the system rounds it (guess, unverified).
- `js/platform/window-actions.js` `bindScreenSize.measure` (lines 151-172):
  the window is the union of the shown `SCREEN_FRAMES` (`.ui-frame, .ui-screen`)
  `getBoundingClientRect()` boxes — border boxes, so box-shadows are outside
  the window. Shift `Math.round(box.left/top)`, size `Math.ceil` in
  `reportSize` (line 208).
- `css/style.css` lines 5-11: windowed desktop rules — root shifted by
  `--window-x/-y`, `:is(body, .ui-backdrop) { background: none; }`, so the
  page paints nothing outside a frame and the window's `#000` shows. Comment
  on line 6 still says "over the transparent window" (stale: window is opaque).
- `themes/joyful-tiles/theme.css`:
  - `.ui-frame` (943-948): `border-radius: var(--radius-2xl)` (26px, line 209),
    `box-shadow: inset 0 -2px 0 line, 0 10px 0 var(--color-head-edge) (#c9930c),
    var(--elevation-2)`.
  - `.ui-card` (637-642): radius 22px, `0 8px 0 head-edge` drop edge.
  - `#results-frame` (1005-1008): radius 22px, 8px drop edge (id specificity).
  - `#help` (1625-1628), `.ui-scene-panel` (1302-1306) same pattern.
  - Phone-step rules in `css/style.css` (95, 207, 271, 507, 605, 873, 899, 911)
    already square full-bleed frames with `border-radius: 0; box-shadow: none;`.

## Root cause (code-supported)

The frame's rounded corners and its drop edge are drawn by the page, but the
window is cut to the frame's border box over an opaque black window:
1. Top corners: outside the 26px curve the page paints nothing -> black wedges.
2. Bottom corners: the `0 10px 0 head-edge` drop edge is a copy of the rounded
   frame 10px lower; inside the border box it paints an amber crescent in each
   bottom corner beside the black wedge, and the 10px slab under the frame is
   cut off by the window edge. So top and bottom corners differ.
3. On Windows 11 the system additionally rounds the frameless window (~8px)
   showing the desktop, so each corner is a double curve: system curve, black
   wedge, frame curve (likely; needs owner eyes / screenshot).
Domain `steam-desktop-host.md` line 79-82 says "the window's rounded corners
show black" — black top corners are as documented; the bottom amber crescent
and cut drop edge contradict even that.

## Plausible readings of "wrong"

- (a) black wedges at all corners (documented, but may look wrong) — code-supported.
- (b) top vs bottom mismatch (black vs amber crescent, missing bottom edge) — code-supported.
- (c) double rounding with Win11 system corners — likely, Electron default; owner's eyes.
- (d) 1px seam at an edge from `Math.round` shift vs `Math.ceil` size when the
  frame's left/top is fractional — possible, minor, not corner-specific.

## Proposed fix (owner picks; A needs a domain edit)

A (recommended): windowed at the desktop host, the frame touching the window
edges is square with no outer shadow; the system rounds the window.
  - `css/style.css` after line 11: `:root[data-host="desktop"][data-window-state="windowed"]
    :is(.ui-frame, .ui-screen, #results-frame, #help)[data-window-edge] { border-radius: 0;
    box-shadow: inset 0 -2px 0 var(--color-line); }` (or `box-shadow: none`; a
    colour token in style.css may trip tests/components.test.mjs:134 — `none` is safe).
  - `js/platform/window-actions.js` `bindScreenSize.measure`: tag each shown
    frame whose rect matches the box (within 1px) with `data-window-edge`,
    untag the rest — so a card floating over the 2D game window keeps its
    rounded look. A plain `.ui-frame` CSS rule without the tag would also
    square the results card over the board.
  - Keep `roundedCorners` default (true) in `desktop/window.js`.
  - Domain: `steam-desktop-host.md` § Architecture "The desktop window"
    sentence "the window's rounded corners show black" -> square frame,
    system-rounded window; also `platform.md` § The windowed window and
    `app-shell-kit-layout.md` § The screen frame; fix style.css:6 comment.
B (no domain change): keep radius, drop only the outer shadows on the edge
  frame -> four identical black wedges (inside the system rounding).
C: B plus `roundedCorners: false` in `windowOptions` -> square window, black
  wedges, matches the domain sentence literally.
Optional (d): shift by `Math.floor(box.left/top)` and size
  `ceil(right) - floor(left)`.

## Tests

- `tests/platform-selection.test.mjs` (fast, fake document): `measure` tags
  `data-window-edge` on the frame matching the box and not on a smaller card;
  static match of the new style.css rule beside the test at line 499-506.
- If C: `tests/desktop-main.test.mjs` line ~153 assert `roundedCorners`.
- A browser check (components/shell file) only if wanted; the owner's
  visual check on the Steam client is the real verification.

## Overlap

Fix A/B touch `bindScreenSize.measure` in `js/platform/window-actions.js` —
the same function a popup/results-widening window fix is likely to touch.
They do not touch `desktop/window.js` `windowActions.fit()`; only C touches
`desktop/window.js`, in `windowOptions`.

## Owner rules / rejected

- Window stays opaque. Width-vs-height frame steps kept for later.
- Never run deploy-steam.sh or SteamCMD. No Electron/browser runs from agents.

## Verification recipe

Fast: `node --test tests/platform-selection.test.mjs tests/desktop-main.test.mjs`.
Visual: owner runs the desktop build windowed on Win11, checks all four
corners on the menu, a board choice, the 2D game and results over the board,
then after a fullscreen round-trip (resizable flip may change system rounding).
