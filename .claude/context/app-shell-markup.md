# App shell — screens' markup and the ids the shell wires

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the kit-built screens' static markup in `index.html` and the ids the
shell wires: the screen frame, the menu screens, the board choices, Daily,
the placeholder, Records and Settings. The game's screens, cards and
messages — pause, results, the replay viewer, the status cards, the cards
over the 3D scene, the Classic 2D game window and the 3D overlay — are
[app-shell-markup-game.md](app-shell-markup-game.md). `css/style.css`, card
motion and pointer sizes are
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
  (`#<screen>-frame`: the title bar `ui-frame__head` — Back in
  `ui-frame__start` as its arrow alone, the logo `ui-frame__logo`, the
  window buttons `[data-window]` in `ui-frame__window` —, the heading
  `ui-frame__heading` with the title and its action `ui-frame__action`, a
  scrolling `ui-frame__body`, a foot); the main menu sits in its frame
  `#menu-frame` too, its title bar with no Back and no heading.
  - main menu `#menu`: `#menu-title` (the logo), `#menu-entries` (a
    `ui-mode-list`: its tiles, a `ui-play-tile` per mode and Daily, then
    its places, a `ui-small-entry` each for Records and Settings — each
    `#menu-entry-<id>`, `data-entry`; the Classic 2D, Hexagon and Triangle tiles' board
    views in `#menu-preview-<id>`), `#menu-foot` with `#touch-note` and the
    build label `#menu-build` ([app-shell-menu.md](app-shell-menu.md));
  - board choices `#c2d-choice` ([classic2d-board-choice.md](classic2d-board-choice.md)), its copies
    `#hex-choice` and `#tri-choice` — the same markup under the `hex` and
    `tri` prefixes, the heading the mode's name and the options its
    standard boards, held equal to `#c2d-choice` by a test; every
    `css/style.css` and *Joyful tiles* rule naming a `#c2d-choice` id names
    its `hex` and `tri` twins too —, and `#board-choice`
    ([mode3d.md](mode3d.md)), one markup: the frame
    `#…-frame`, `#…-back`, the panel toggle (`#c2d-panel-toggle`,
    `#bc-panel-toggle`) in the heading's action, the options `#…-options`
    (`ui-option`s, `data-size` / `data-preset`; `#bc-learn` on the 3D one),
    the board choice panel, a `ui-drawer` (`#c2d-choice-panel`,
    `#bc-choice-panel`) with its bar (`#c2d-drawer-bar`, `#bc-drawer-bar`)
    and its body `#…-detail` (settings, the custom form with Random
    `#c2d-random` / `#c-random`, the bests `#c2d-bests` / `#bc-bests` of
    `ui-stat--tile`s with *All records* `#c2d-records` / `#bc-records`
    under them, the code panel), and the foot's Play (`#c2d-play`,
    `#bc-play`); the binders read their `data-*` hooks, not the ids;
  - Daily `#daily` (the board choices' markup, `#daily-modes` of
    `#daily-entry-<mode>`, `#daily-preview`, `#daily-code`, `#daily-watch`,
    `#daily-play`; [app-shell-daily.md](app-shell-daily.md));
  - placeholder `#coming-soon` (`#coming-soon-menu` in the title bar, its
    arrow alone, `#coming-soon-title`, the lock badge
    `#coming-soon-badge`, `#coming-soon-back`, both Backs with the
    arrow-left icon); Records `#records` (the view
    and its ids: [records-screen-view.md](records-screen-view.md); the switch
    `#records-mode` in the frame's heading and `#records-mode-touch` the
    phone's bar opening the body, the heading's switch and the picker each in
    a `data-pad-hinted` row between `data-pad-glyph` hints); Settings
    `#settings` (Back `#settings-back`, its arrow alone, in the title bar's start `#settings-actions`, the
    body `#settings-body` from `settingsPageHtml({ desktopHost })`,
    [settings-page.md](settings-page.md));
  - the pause card, results, the replay viewer, the status cards, the
    cards over the 3D scene, the messages, `#c2d` and `#hud`:
    [app-shell-markup-game.md](app-shell-markup-game.md) § Screens.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit-built screens, the controller contract.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the shared layout every screen is composed in.

## CROSS-REFERENCES

- [app-shell-markup-game.md](app-shell-markup-game.md) — the game's
  screens, cards and messages.
- [app-shell-kit.md](app-shell-kit.md) — the catalogue every screen follows;
  [app-shell-kit-layout.md](app-shell-kit-layout.md) — their composition.
- [app-shell-ui.md](app-shell-ui.md) — `UI.el`, which binds these ids.
- [app-shell-stylesheet.md](app-shell-stylesheet.md) — the rules that place them.
- [testing-files.md](testing-files.md) — `tests/components.test.mjs` (screens).

## WHEN TO READ THE SOURCE

- Adding a screen or an overlay: its markup in `index.html` (as the
  catalogue at the head of `css/components.css` describes it), `UI.el`, a
  `--z-*` layer.
