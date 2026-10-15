# App shell — screens' markup, shell stylesheet, pointer sizes

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the kit-built screens' static markup in `index.html` and the ids the
shell wires, and the shell stylesheet `css/style.css`. The component kit,
tokens, theme and deploy files are [app-shell-kit.md](app-shell-kit.md).

| File | Responsibility |
| ---- | -------------- |
| `index.html` | every overlay as static markup toggled by `.hidden`; importmap `three` → `vendor/three/three.module.min.js` (r186, no build step); a module `onerror` shows `.fatal` |
| `css/style.css` | shell styling: fixed layers, the Classic 2D board area and panel, the replay layer (`replay--scene` transparent over the 3D scene; the recorded pointer and its trail, press rings, Show 3BV's 2D canvas; `body.replaying` hides the view chips, tools strip, hint strip and toast), Back rows (`.esc-row`, `[data-esc-hint]`), the controller's hints (`[data-pad-hint]`, visible only under `body.pad-nav`, their room kept; `[data-pad-hinted]` rows), the menu-screen and translucent backdrops, the results scrim over the 3D scene, the look's hint (`.look-hint`), the ready/help/controls/ctx-lost overlays, the 3D touch stick and toolbar, HUD placement; declares no custom property |

`index.html` head order: `js/theme.js`, `css/tokens.css`,
`css/components.css`, `css/style.css`, then the module graph.

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
  - pause card `#pause-card`: status lines, `#pause-actions` (primary
    first; `#p-home` "Back to start" only for a 3D game in play),
    `#pause-confirm` (`#p-confirm-yes`, `#p-confirm-no`), `#pause-board`,
    `#pause-controls`, a Settings panel (3D look controls, Sound, volume)
    whose shortcuts carry `data-setting`;
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
    (`#…-offer`).
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
