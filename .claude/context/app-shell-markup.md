# App shell — screens' markup and the ids the shell wires

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the kit-built screens' static markup in `index.html` and the ids the
shell wires. `css/style.css`, card motion and pointer sizes are
[app-shell-stylesheet.md](app-shell-stylesheet.md); the kit is
[app-shell-kit.md](app-shell-kit.md); themes and deploy files are
[app-shell-themes.md](app-shell-themes.md).

| File | Responsibility |
| ---- | -------------- |
| `index.html` | every overlay as static markup toggled by `.hidden`; importmap `three` → `vendor/three/three.module.min.js` (r186, no build step); a module `onerror` shows `.fatal` |

`index.html` head order: `css/tokens.css`, `css/components.css`,
`css/style.css`, `js/theme.js` (which appends the theme stylesheet), then
the module graph ([app-shell-themes.md](app-shell-themes.md)).

## PUBLIC API

None: markup and styles. The ids below are what `js/main.js` and the views
bind.

## INTERNAL PATTERNS

- **Screens.** Every screen's composition — which kit components, in what
  order, at which window sizes, its default focus — is the head comment of
  `css/components.css`; this list names the ids the shell wires. The
  non-game screens sit on a `ui-backdrop`, each in a `ui-frame`
  (`#<screen>-frame`: Back in `ui-frame__start` with its back key hint, the
  title, an optional action, a scrolling `ui-frame__body`, a foot); the
  main menu sits in its frame `#menu-frame` too, its title bar with no
  Back.
  - main menu `#menu`: `#menu-title` (the logo), `#menu-entries` (a
    `ui-mode-list`: its tiles, a `ui-play-tile` per mode and Daily, then
    its places, a `ui-small-entry` each for Records and Settings — each
    `#menu-entry-<id>`, `data-entry`; the Classic 2D tile's board view in
    `#menu-preview-classic-2d`), `#menu-foot` with `#touch-note` and the
    build label `#menu-build` ([app-shell-menu.md](app-shell-menu.md));
  - board choices `#c2d-choice` ([classic2d.md](classic2d.md)) and
    `#board-choice` ([mode3d.md](mode3d.md)), one markup: `#…-top` holding
    the wordmark and the frame, `#…-back`, the options `#…-options`
    (`ui-option`s, `data-size` / `data-preset`; `#bc-learn` on the 3D one),
    the detail column `#…-detail` (settings, the custom form with Random
    `#c2d-random` / `#c-random`, the bests `#c2d-bests` / `#bc-bests` of
    `ui-stat--tile`s, the code panel), and the foot's summary
    (`#c2d-summary`, `#bc-summary`), Records (`#c2d-records`,
    `#bc-records`) and Play (`#c2d-play`, `#bc-play`); the binders read
    their `data-*` hooks, not the ids;
  - Daily `#daily` (the board choices' markup, `#daily-modes` of
    `#daily-entry-<mode>`, `#daily-preview`, `#daily-code`, `#daily-watch`,
    `#daily-play`; [app-shell-daily.md](app-shell-daily.md));
  - placeholder `#coming-soon` (`#coming-soon-menu` in the head, reading
    Back on a phone, `#coming-soon-title`, the lock badge
    `#coming-soon-badge`, `#coming-soon-back`, both Backs with the
    arrow-left icon); Records `#records` (the view
    and its ids: [records-screen-view.md](records-screen-view.md); the switch
    `#records-mode` in the frame's head and `#records-mode-touch` the
    phone's bar opening the body, the head's switch and the picker each in
    a `data-pad-hinted` row between `data-pad-glyph` hints); Settings
    `#settings` (Back `#settings-back` in the head `#settings-actions`, the
    body `#settings-body` from `settingsPageHtml()`,
    [settings-page.md](settings-page.md));
  - pause card `#pause-card` (`ui-screen--wide`, a `ui-columns--two`):
    a `ui-column` of the title block `#pause-head` (`#pause-title`,
    `#pause-board`, `#pause-sub`), `#pause-actions` (the green primary first, each
    with its `data-icon`; `#p-home` "Back to start" only for a 3D game in
    play) and `#pause-confirm` (`#p-confirm-yes` a `ui-button--danger`,
    `#p-confirm-no`), then the Settings panel (Sound and invert Y as
    `ui-switchrow`, volume, look sensitivity) whose shortcuts carry
    `data-setting`, then the panel `#pause-list` of `#pause-controls`; at
    the kit's breakpoint `#pause-list` takes the second of two equal
    columns alone, and below it everything is one column in markup order
    ([app-shell-pause.md](app-shell-pause.md));
  - results `#results`: the frame `#results-frame`, its head
    (`#results-trophy`, `#results-title`, `#results-board`, the rank
    `#results-rank`, `#r-look`), the tiles `#results-tiles` (`rs-*`, the
    3BV solved bar `#rs-progress`), the details table `#results-details`
    (`rd-*`), the code group `#results-code-group` (its section label
    `#results-code-label` over the chip `#results-code`), `#results-note`,
    and the foot `#results-actions`:
    `#r-menu` at the start, `#r-watch`, `#r-watch-best`, `#r-records`,
    `#r-again` at the end ([app-shell-results-view.md](app-shell-results-view.md));
  - replay viewer `#replay` (its ids: [replay-viewer-view.md](replay-viewer-view.md)):
    the frame `#replay-frame` with `#rp-back` and `#replay-title`, the
    strip `.replay-bar` with the code chip,
    `#replay-main` — the board area `#replay-stage` holding
    `#replay-board` and the card `#replay-message`, beside the figures
    panel `#rp-figures` —, `#replay-controls` (seek bar with action ticks
    and pause marks; the tools row: transport, speed, toggles, the end line
    `#replay-end`, Download, Open replay file; the key line); the hidden
    file input `#replay-file`; after it the layer over a 3D replay's scene
    `#replay-scene-over` with the free-camera notice `#rp-free-note`;
  - status cards `#c2d-status` (centred on the board column by `UI`) and
    `#m3d-status`, stacked above the pause card: progress line,
    `ui-spinner`, Cancel and Play a standard board (`#…-wait`,
    `#…-wait-standard`), the failure line `#…-status-text`, the offer
    (`#…-offer`: `#…-retry` with the refresh icon, `#…-standard`,
    `#…-offer-menu`);
  - the cards over the 3D scene, each a `ui-card ui-screen`: the ready
    card `#ready` (`.ready-body`; `.ready-main` — the phone-landscape
    title `#ready-heading`, `#ready-back` with its back key hint,
    `#ready-board`, `#ready-msg`, `#ready-btn` around `.ready-title`,
    `#ready-blocked` with `#ready-drag` and its `.ready-pad-note`, the
    plain `#ready-learn` line with `#ready-learn-btn` — and `.ready-aside`
    — the `ui-panel--muted` `#ready-rules`, the controls list
    `#ready-keys`, `#ready-pad`, the tip — one column ordered as J-Ready
    draws it, two side by side on a phone held sideways); the context-lost card
    `#ctx-lost` (`#ctx-lost-btn` with the refresh icon, `#ctx-lost-menu`); the Learn 3D end card
    `#learn-end` (`#learn-end-title`, `#learn-end-line`,
    `#learn-end-primary` around `#learn-end-primary-label`, its icon and its
    confirm key hint, `#learn-end-back` with the arrow-left icon);
  - the messages: the toast `#toast` (a `ui-toast`, its text in
    `#toast-text`); the fatal card, the template `#fatal-card` (`.fatal`, a
    `ui-backdrop` holding a `role="alert"` message `ui-card`: its badge,
    `#fatal-title`, the line, Reload, which reloads the page and which
    the code appending the card focuses — the module's `onerror` and
    `showFatal` in `js/main.js`); the
    no-JavaScript notice, the one `<noscript>` (the default theme's
    stylesheet, then `.noscript`, the same card titled `#noscript-title`),
    styled without JavaScript through the root's static `data-theme`;
    `404.html`'s `.not-found` is the same card ([app-shell-themes.md](app-shell-themes.md)).
  `#c2d` is the Classic 2D game window (its ids:
  [app-shell-hud.md](app-shell-hud.md) § Classic 2D window): `#c2d-board`
  holds the panel `#c2d-panel` behind the canvas, and the hint strip lies
  over the board in `#c2d-stage`; `#c2d.c2d--measure` lays the window out at its
  largest for `UI.sizeBoard2D` to measure the board's room. `#hud` holds the 3D overlay `#hud-overlay`
  (§ 3D overlay there), hidden under `hud--2d`.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit-built screens, the controller contract.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the shared layout every screen is composed in.

## CROSS-REFERENCES

- [app-shell-kit.md](app-shell-kit.md) — the catalogue every screen follows;
  [app-shell-kit-layout.md](app-shell-kit-layout.md) — their composition.
- [app-shell-ui.md](app-shell-ui.md) — `UI.el`, which binds these ids.
- [app-shell-stylesheet.md](app-shell-stylesheet.md) — the rules that place them.
- [testing.md](testing.md) — `tests/components.test.mjs` (screens).

## WHEN TO READ THE SOURCE

- Adding a screen or an overlay: its markup in `index.html` (as the
  catalogue at the head of `css/components.css` describes it), `UI.el`, a
  `--z-*` layer.
