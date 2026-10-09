# Design tokens and themes

The game's shared visual vocabulary — colours, type, spacing, radii,
elevation and motion — named once as design tokens, with a light and a dark
value for every colour, and the mechanism that applies the player's chosen
theme to every screen and to the Classic 2D board.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
asks for one visual language across every mode and screen, with a light and
a dark theme the player picks on the Settings page, held to the bar the
current 3D look sets. This feature is that language's foundation: the
values everything else draws with, and the one switch that moves all of
them between themes. The Canvas 2D board and the DOM screens read the same
tokens, so a Classic 2D board and the menu around it never drift apart.

## Scope and non-goals

In scope (m1-classic-2d):

- The token set: palette (surfaces, ink, accent, state colours for success,
  danger and warning), typography (families, the size scale, weights,
  tabular figures for timers and counters), spacing scale, radii, elevation
  (shadows), motion (durations and easings) and the z-layer order of
  overlays.
- A light and a dark value for every colour token. Light is derived from the
  current look — the pale sky-blue, deep-blue accent and dark navy ink of
  the existing menus — so the light theme reads as the game players already
  know.
- Low-fidelity values: the full token structure and names, with plain,
  functional values. Where a value is a visual-design judgement — the dark
  palette, elevation shadows, motion durations and easings — it is a simple
  placeholder that still meets the contrast contract in its theme.
- Theme application: Light is the default and the fallback; the active
  theme is set by one attribute on the document root, applied before first
  paint so no screen flashes the wrong theme.
- A read API for Canvas renderers, which cannot read stylesheet values
  directly, and a change notification so a board redraws when the theme
  changes.

Non-goals:

- High-fidelity visual dressing — a later pass from the approved designs.
  The designs under iteration are not an input to this feature's tasks.
- The 3D scene. It keeps its one current look — sky gradient, fog, cube
  tiles and number colours — under both themes. Only the menus, the in-game
  overlay and the results screen around it follow the theme. This is a
  decision, not a deferral.
- A "Match system" theme option or reading the operating system's colour
  preference. The first-launch theme is Light; the player's choice is Light
  or Dark.
- The Settings page and its theme control — the Main menu and game shell
  settings feature (m1-classic-2d) stores the value and shows the control.
- Tile and number styling — `square-tile-skin`. Component styling —
  `screen-components`.
- Hexagonal and triangle tiles and Surface styling — deferred to
  `m6-launch`.
- A colour-blind-safe number set, unless it falls out of the base palette —
  deferred to `m6-launch`.

## Architecture

Built within the recorded technical direction — plain ES modules, no
bundler, Canvas 2D for Classic 2D and DOM screens in the game shell (see
[technical-direction.md](../technical-direction.md)).

- **Token sheet.** One stylesheet declaring every token as a CSS custom
  property: the light values on the root, the dark values under the dark
  theme attribute. It is the single source of truth for token values; the
  existing variables in the shell stylesheet (`--sky`, `--ink`, `--blue`,
  `--card`, …, see [app-shell.md](../../context/app-shell.md)) are folded
  into it under the token names, so the existing screens keep their look
  in the light theme.
- **Theme applier.** A small script that runs before first paint: reads the
  stored theme, falls back to Light when it is absent or not a known value,
  and sets the root attribute. After start-up it exposes a call to switch
  theme at run time, which sets the attribute and notifies listeners.
- **Token reader.** A module for non-DOM consumers — chiefly the Classic 2D
  Canvas renderer — that returns the resolved value of a named token for the
  active theme and lets a consumer subscribe to theme changes. It reads the
  token sheet's computed values rather than holding a second copy of them.
- **Theme-independent scene.** The 3D renderer's palette (sky, fog, tiles,
  numbers; [rendering.md](../../context/rendering.md)) is not tokenised and
  never subscribes to theme changes.

## Data and state

- The theme preference is a single value, `light` or `dark`, owned and
  persisted by the settings feature through the platform layer (browser
  storage on the web build, the user-data directory on Steam). This feature
  reads it; it never writes it.
- The active theme lives only as the root attribute; it is derived at
  start-up from the stored value and changed at run time by the settings
  feature through the theme applier.
- Token values are static, held in the token sheet; nothing about them is
  persisted.

## Interfaces and contracts

- **Root attribute** — the theme is `light` or `dark`; every themed style
  keys off it. No other mechanism (classes, per-screen switches) applies
  themes.
- **Token names** — stable, semantic names (surface, surface-raised, ink,
  ink-muted, accent, accent-ink, danger, success, focus ring, …), never
  named after a hue. Renaming a token is a breaking change for every
  consumer.
- **Theme applier** — `apply at start-up`; `set theme(light | dark)`. An
  unknown value is treated as Light, never thrown.
- **Token reader** — `token(name)` returns the active value; an unknown name
  returns a visible fallback and logs once in development, so a missing
  token shows on screen instead of failing silently. `onThemeChange(listener)`
  fires after the attribute changes.
- **Contrast contract** — in each theme, body text against its surface meets
  WCAG AA (4.5:1); large text and essential UI glyphs meet 3:1.

## Dependencies

- Main menu and game shell — the settings feature (m1-classic-2d) stores
  the `light` / `dark` value and calls the theme applier when the player
  changes it.
- No external libraries.

## Open questions

- Typeface: keep the current system font stack, or ship a bundled typeface
  for a more distinctive look (licence and file-size cost on the web
  build). Blocks only the typography token values, not the structure.
