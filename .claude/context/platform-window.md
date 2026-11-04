# Platform — the desktop window driven from the page

## OVERVIEW

The page's side of the desktop host's window: the drag region, Minimise and
Fullscreen / Windowed, the page's root area sized to the display's
available area, the window-size media queries settled against it, and the
windowed window sized to the shown screen's frame. The platform module
exports it as `bindDesktopWindow` ([platform-host.md](platform-host.md));
the host's side — the frameless window, its fullscreen and its size cap —
is [desktop.md](desktop.md)'s. It runs only at the desktop host, where it
marks the document, adds the drag region's style, sizes the root area,
settles the touch step's media queries and, windowed, shifts the page to
the shown screen's frame.

| File | Responsibility |
| ---- | -------------- |
| `js/platform/window-actions.js` | The desktop window driven from the page: drag region, Minimise and Fullscreen / Windowed with its icon, the root area sized to the available area (`bindAvailableArea`), the window-size media queries settled against it (`areaMatches`, `bindAreaMedia`), the windowed window's size from the shown screen frames (`SCREEN_FRAMES`, `bindScreenSize`), `reportSize`. |

## PUBLIC API

- `bindDesktopWindow({ document, setIcon, fullArea })` (platform module) →
  `{ actions, reportSize, screenChanged, dispose }`; the actions are what
  `bindWindowButtons` ([app-shell-kit-helpers.md](app-shell-kit-helpers.md))
  presses; `screenChanged()`, which the shell's router calls on every
  screen change, reports the windowed window's size; `fullArea()` — a 3D
  game outside the replay viewer — makes it the whole work area.
- The web build has no host: no window action ever happens.

## INTERNAL PATTERNS

- **The available area.** At the desktop host `bindDesktopWindow` sizes the
  page's root element — the size container every size step reads
  ([app-shell-kit-layout.md](app-shell-kit-layout.md) § The root area) —
  to the available area of the display the window is on: its work area
  (`screen.availWidth` × `screen.availHeight`) while windowed, the whole
  screen in fullscreen, again on every display change, window resize and
  fullscreen event (`bindAvailableArea`), so the layout never reads the
  window's own size. It then settles every window-size `@media` rule of the
  page's stylesheets — a query list made only of width, height and
  orientation features, the touch step's — against that area, rewriting
  each to `all` or `not all` and keeping its text to settle again, a
  stylesheet added later (a theme switch) once it loads (`areaMatches`,
  `bindAreaMedia`): a desktop work area is never phone-sized, so the
  desktop host never takes the phone layout. Any other media query (a
  pointer, a motion preference) is left to the browser. On the web none
  of this runs: the root area is the browser window and the touch step
  follows it.
- **The windowed window.** Windowed at the desktop host the window is the
  shown screen's frame (`bindScreenSize`): the screens lay out in the
  available area as everywhere, the box around the shown `SCREEN_FRAMES`
  elements is measured — only those inside a layer over the screen
  (`WINDOW_OVER`, `data-window-over` on `index.html`'s pause, results,
  context-lost, ready and Learn 3D end layers) while one shows, so a popup
  is the window alone and the game window's size comes back when it hides;
  a card inside the window (`WINDOW_INSIDE`, `data-window-inside`: the
  Classic 2D status card, which the shell fits inside the game window, or
  inside the pause card while that is the window) is never measured —, the root
  element shifted by its corner (`--window-x`, `--window-y`, which
  `css/style.css` applies while the root carries `data-window-state="windowed"`,
  the 3D scene's canvas shifted back onto the window, the toast placed on
  it — centred, above its bottom edge, fitted to its width — and the fatal
  card filling it, no backdrop drawn)
  and its size sent through `reportSize`, deduplicated, on every screen
  change, every change of a frame's size (a `ResizeObserver`), every
  theme switch (the root's `data-theme`, a `MutationObserver`: a theme can
  change the drop edge alone) and every change of the available area. The frame filling the box is marked
  `data-window-edge` (`WINDOW_EDGE`): the host stylesheet the page adds
  (`WINDOW_EDGE_CSS`) gives it, windowed, the 8 px corners Windows 11
  rounds the frameless window to (Electron's `roundedCorners` default), and
  its drop edge — the hard outer shadow under it, read from its computed
  `box-shadow` (`dropEdgeOf`) — is added to the reported height, so the
  window shows it; a card inside the window keeps its own corners. During
  3D play the size is the whole available area and no frame is marked.
  Nothing is measured before the first screen change nor in
  fullscreen, where the frame sits on the backdrop; leaving fullscreen
  measures again. The host (`desktop/window.js`) caps the size at the work
  area of the display the window is on and moves the window inside it,
  again whenever the window is moved.

## DOMAIN DEPENDENCIES

- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the desktop window's actions, its size and the available area.

## CROSS-REFERENCES

- [platform-host.md](platform-host.md) — the platform module that exports
  `bindDesktopWindow`, the `desktopHost` flag the window buttons read.
- [desktop.md](desktop.md) — the host's window: frameless and opaque, its
  fullscreen, the size cap at the work area.
- [app-shell-kit-layout.md](app-shell-kit-layout.md) — the root area, the
  screen frames and the touch step the window sizes and settles.
- [testing.md](testing.md) — `tests/platform-selection.test.mjs` (the
  desktop window, its available area and its size reports).

## WHEN TO READ THE SOURCE

- The windowed window the wrong size, or a popup measured with the game
  window: `bindScreenSize`, `WINDOW_OVER` and `WINDOW_INSIDE` in
  `window-actions.js`.
- The phone layout showing at the desktop host, or a media query not
  settled: `areaMatches` and `bindAreaMedia`.
