# App shell — shell stylesheet, card motion, pointer sizes

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the shell stylesheet `css/style.css` — where each screen sits in its
frame and what it gives way at each window size — the cards' motion and the
pointer sizes. The screens' markup and the ids the shell wires are
[app-shell-markup.md](app-shell-markup.md); the component kit is
[app-shell-kit.md](app-shell-kit.md); tokens and themes are
[app-shell-themes.md](app-shell-themes.md).

| File | Responsibility |
| ---- | -------------- |
| `css/style.css` | shell styling: fixed layers, each screen's placement in its frame (the main menu's window and its per-size button sizes, the board choices' and Daily's window, centred and widened by the board choice panel, Records', Settings', the placeholder's and the replay viewer's window, the results frame's head, tiles and action bar, the ready card's columns) and what each gives way at the smaller window sizes and on a phone, the scene panel's canvas (`body.scene-off`, `body.scene-front`), the Classic 2D game window (its title bar contained so it never sets the window's width, the board column centred when the window widens to Pause and the window buttons, its board area and panel, the figures panel beside or under the board or hidden, the phone layouts), the replay layer (the viewer's window, body, strip, seek bar, tools row and key line by window size; the layer over a 3D replay's scene; the recorded pointer and its trail, press rings, Show 3BV's 2D canvas; the controller's buttons in the key line only under `body.pad-connected`; `body.replaying` hides the view chips, tools strip, hint strip and toast), the controller's hints (`[data-pad-hint]`, visible only under `body.pad-nav`, their room kept; `[data-pad-hinted]` rows), the menu-screen and translucent backdrops, the HUD and the game window's chrome hidden behind the ready card, the pause card, the results and the 3D status card, the board status cards' placement (windowed at the desktop host, the Classic 2D card no wider than the game window's room) and parts, the look's hint (`.look-hint`), the ready card's placement (`.ready-body`), the Learn 3D step (`.hint-step`), the help/controls/ctx-lost overlays, the toast's place (windowed at the desktop host, on the window: centred, above its bottom edge, fitted to its width) and the message pages' (`.fatal`, `.noscript`, `.not-found`: the card's width and its margin from the window's edges; windowed at the desktop host, the fatal card's backdrop filling the window), the 3D touch stick and toolbar, the 3D overlay's placement (the counter strip, the figures panel, the phone layouts) and the HUD's; declares no custom property |

## PUBLIC API

None: styles. The rules select the ids and classes
[app-shell-markup.md](app-shell-markup.md) lists.

## INTERNAL PATTERNS

- **Card motion**, the theme's: the cards over the scene, the placeholder's
  window, the fatal card and the confirm boxes pop in over
  `--duration-slow`; the cards' layers and the pause card's and
  Settings' confirm boxes, given `.hidden`, fade out over it, still
  displayed and letting clicks through until it ends (`display`
  transitioned `allow-discrete`), while Records' row confirm box, moved
  back into its markup as it closes, goes at once; none under reduced
  motion. How a browser check waits for it:
  [testing-browser.md](testing-browser.md).
- **Pointer sizes.** The text minimums hold on every pointer, in the
  top-level rules: `ui-stat__label` one step above `--font-size-xs`, which
  keeps its own size, and `kbd` with a pixel floor under its `em` size. Only
  the hit areas, at the 44 px touch-target minimum, depend on the pointer:
  each stylesheet ends with one `@media (pointer: coarse)` block — the kit's
  gives `ui-toggle__input` and `ui-checkbox__input` a minimum hit square
  (`::after`) and `ui-slider__input` the minimum height; the shell's shows
  `#hud-tap` in Classic 2D at a larger height, gives `#hud-pause` a minimum
  square and `#hud-restart` and `#c2d-restart` a minimum band (`::after`),
  `#touch-modes` buttons wider than the minimum and at least its height, and
  hides `#hud-swap` (every main menu entry meets the minimum on any pointer,
  [app-shell-menu.md](app-shell-menu.md)). Every
  fine-pointer hit area stays as above (`tests/components.test.mjs` pins
  both).

## DOMAIN DEPENDENCIES

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — each screen's placement and its arrangement by window size.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the hit areas and text minimums.

## CROSS-REFERENCES

- [app-shell-markup.md](app-shell-markup.md) — the markup these rules place.
- [app-shell-kit.md](app-shell-kit.md) — the kit's own stylesheet
  `css/components.css`; [app-shell-themes.md](app-shell-themes.md) — the
  tokens `css/style.css` reads.
- [testing-browser.md](testing-browser.md) — waiting for a card's motion.
- [testing.md](testing.md) — `tests/components.test.mjs` (the pointer
  sizes).

## WHEN TO READ THE SOURCE

- Changing where a screen sits or what it gives way on a small window: its
  block of `css/style.css`.
- Changing a hit area or a text minimum: the `@media (pointer: coarse)`
  block at the end of each stylesheet.
