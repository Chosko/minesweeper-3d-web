# App shell — screens' markup, shell stylesheet, pointer sizes

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the kit-built screens' static markup in `index.html` and the ids the
shell wires, and the shell stylesheet `css/style.css`. The component kit,
tokens, theme and deploy files are [app-shell-kit.md](app-shell-kit.md).

| File | Responsibility |
| ---- | -------------- |
| `index.html` | every overlay as static markup toggled by `.hidden`; importmap `three` → `vendor/three/three.module.min.js` (r186, no build step); a module `onerror` shows `.fatal` |
| `css/style.css` | shell styling: fixed layers, the Classic 2D board area and panel, the replay layer (`replay--scene` transparent over the 3D scene; the recorded pointer and its trail, press rings, Show 3BV's 2D canvas; `body.replaying` hides the view chips, tools strip, hint strip and toast), the controller's hints (`[data-pad-hint]`, visible only under `body.pad-nav`, their room kept; `[data-pad-hinted]` rows), the menu-screen and translucent backdrops, the results scrim over the 3D scene, the look's hint (`.look-hint`), the ready card's placement (`.ready-body`), the Learn 3D step (`.hint-step`), the help/controls/ctx-lost overlays, the toast's place and the message pages' (`.fatal`, `.noscript`, `.not-found`: the card's width and its margin from the window's edges), the 3D touch stick and toolbar, HUD placement; declares no custom property |

`index.html` head order: `css/tokens.css`, `css/components.css`,
`css/style.css`, `js/theme.js` (which appends the theme stylesheet), then
the module graph ([app-shell-kit.md](app-shell-kit.md)).

## PUBLIC API

None: markup and styles. The ids below are what `js/main.js` and the views
bind.

## INTERNAL PATTERNS

- **Screens** — each a `ui-card` (`ui-screen--wide` for the menu, both
  board choices, Records and Settings; Records and Settings add
  `ui-screen--columns` and lay out in `ui-columns`, the kit's one
  breakpoint, 1024 px, in `css/components.css`). Ids the shell wires:
  - main menu `#menu`: title row ending in Play again `#menu-again`, one
    `ui-menu` of `data-entry` items (`data-last`, "Last played" detail),
    session strip `#menu-strip`, footer (Controls, Sound, volume, credit);
  - board choices `#board-choice` ([mode3d.md](mode3d.md)) and
    `#c2d-choice` ([classic2d.md](classic2d.md)): `ui-menu` of `data-preset`
    / `data-size` items with `data-detail` lines, custom `ui-panel` of
    `ui-field`s, no-guess `ui-toggle`, Back;
  - placeholder `#coming-soon`; Records `#records` (the view and its ids:
    [records-screen.md](records-screen.md); the switch and the picker each
    in a `data-pad-hinted` row between `data-pad-glyph` hints); Settings `#settings` (`#settings-body` from
    `settingsPageHtml()`, Bindings `#settings-bindings`, Data
    `#settings-data`, sticky Back row `#settings-actions`,
    [settings-page.md](settings-page.md));
  - pause card `#pause-card` (`ui-screen--columns`, a `ui-columns--two`):
    a `ui-column` of the title, `#pause-board`, the status lines,
    `#pause-actions` (primary first; `#p-home` "Back to start" only for a
    3D game in play) and `#pause-confirm` (`#p-confirm-yes`,
    `#p-confirm-no`), then the panel `#pause-list` of `#pause-controls`, then
    a `ui-column` of the Settings panel (3D look controls, Sound, volume)
    whose shortcuts carry `data-setting`; at 1024 px and wider `#pause-list`
    takes the second column beside both (`css/components.css`'s breakpoint
    block), so the card fits 1024 × 768 unscrolled, and below that it is one
    column in markup order. Settings sits in a `ui-column` of its own so the
    arrow and D-pad walk leaves it upward to the actions
    ([app-shell-navigation.md](app-shell-navigation.md) § Focus walk);
  - results `#results`: banner, `#results-stats` (`rs-*`), `#results-figures`,
    `#results-next`, `#results-bests` (`rb-*`, `ui-panel--muted` on a
    loss), `#results-note`, actions `#r-again`, `#r-watch`, `#r-watch-best`,
    `#r-look`, `#r-records`, `#r-menu`;
  - replay viewer `#replay` (its ids: [replay-playback.md](replay-playback.md)):
    figures bar with the code chip and `#rp-back`, board area
    `#replay-board`, `#replay-message`, `#replay-controls` (seek bar with
    pause marks and action ticks, toggles, Download, Open replay file, the
    key line); the hidden file input `#replay-file`;
  - status cards `#c2d-status` (beside the board) and `#m3d-status`,
    stacked above the pause card: progress line, `ui-spinner`, Cancel and
    Play a standard board (`#…-wait`, `#…-wait-standard`), the offer
    (`#…-offer`);
  - the cards over the 3D scene, each a `ui-card ui-screen`: the ready
    card `#ready` (`.ready-body`; `.ready-main` — `#ready-back` with its
    back key hint, `#ready-board`, `#ready-msg`, `#ready-btn` around
    `.ready-title`, `#ready-blocked` with `#ready-drag`, the `ui-banner`
    `#ready-learn` with `#ready-learn-btn` — and `.ready-aside` — the
    `ui-panel--muted` `#ready-rules`, `.ready-keys`, `.ready-touch`,
    `#ready-pad`, the tip — one column ordered as J-Ready draws it, two
    side by side on a phone held sideways); the context-lost card
    `#ctx-lost` (`#ctx-lost-btn`, `#ctx-lost-menu`); the Learn 3D end card
    `#learn-end` (`#learn-end-title`, `#learn-end-line`,
    `#learn-end-primary` around `#learn-end-primary-label` and its select
    key hint, `#learn-end-back`);
  - the messages: the toast `#toast` (a `ui-toast`, its text in
    `#toast-text`); the fatal card, the template `#fatal-card` (`.fatal`, a
    `ui-backdrop` holding a `role="alert"` message `ui-card`: its badge,
    `#fatal-title`, the line, Reload, which reloads the page); the
    no-JavaScript notice, the one `<noscript>` (the default theme's
    stylesheet, then `.noscript`, the same card titled `#noscript-title`),
    styled without JavaScript through the root's static `data-theme`;
    `404.html`'s `.not-found` is the same card ([app-shell-kit.md](app-shell-kit.md)).
  `#c2d` is the 2D board layer: `#c2d-board` holds the panel `#c2d-panel`
  behind the canvas; `#c2d.c2d--hint` gives the hint strip room below.
- **Pointer sizes.** The text minimums hold on every pointer, in the
  top-level rules: `ui-stat__label` 12 px (one step above `--font-size-xs`,
  which stays 11 px) and `kbd` `max(11px, 0.78em)`. Only the 44 px hit areas
  depend on the pointer: each stylesheet ends with one `@media (pointer:
  coarse)` block — the kit's gives `ui-toggle__input` a 44 px hit square
  (`::after`) and `ui-slider__input` a 44 px height; the shell's shows
  `#hud-tap` in Classic 2D at 44 px, gives `#hud-pause` a 44 px band
  (`::after`) and `#touch-modes` buttons 44 px, and hides `#hud-swap`. Every
  fine-pointer hit area stays as above (`tests/components.test.mjs` pins
  both).


## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit-built screens, the controller contract.

## CROSS-REFERENCES

- [app-shell-kit.md](app-shell-kit.md) — the catalogue every screen follows,
  the tokens `css/style.css` reads.
- [app-shell-ui.md](app-shell-ui.md) — `UI.el`, which binds these ids.
- [testing.md](testing.md) — `tests/components.test.mjs` (screens, the
  pointer sizes).

## WHEN TO READ THE SOURCE

- Adding a screen or an overlay: its markup in `index.html` (as the
  catalogue at the head of `css/components.css` describes it), `UI.el`, a
  `--z-*` layer.
