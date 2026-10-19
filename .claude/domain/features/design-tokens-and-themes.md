# Design tokens and themes

The game's shared visual vocabulary — colours, type, spacing, radii,
elevation and motion — named once as design tokens, read alike by every
screen and the Classic 2D board.

There is no light or dark theme. The tokens' values, the themes that
declare them, how a theme is registered, applied and switched, which tokens
it must declare, its fonts and the theme setting are
[theme-system](./theme-system.md)'s; the 3D cubes and numbers
follow the theme through
[themed-board-art-and-motion](./themed-board-art-and-motion.md). The
token categories, the contrast contract and the token reader below hold only
where those documents cite them.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
asks for one visual language across every mode and screen, in the theme
the player picks on the Settings page ([theme-system](./theme-system.md)),
held to the bar the current 3D look sets. This feature is that language's
foundation: the token names everything else draws with. The Canvas 2D
board and the DOM screens read the same tokens, so a Classic 2D board and
the menu around it never drift apart.

## Scope and non-goals

In scope (m1-classic-2d):

- The token set: palette (surfaces, ink, accent, state colours for success,
  danger and warning), typography (families, the size scale, weights,
  tabular figures for timers and counters), spacing scale, radii, elevation
  (shadows), motion (durations and easings) and the z-layer order of
  overlays.
- The full token structure and names. Every token's value is a theme's,
  declared in that theme's stylesheet — [theme-system](./theme-system.md).
- Theme application — the default theme, the fallback, and the root
  attribute set before first paint — is [theme-system](./theme-system.md)'s.
- A read API for Canvas renderers, which cannot read stylesheet values
  directly, and a change notification so a board redraws when the theme
  changes.

Non-goals:

- High-fidelity visual dressing — a later pass from the approved designs.
  The designs under iteration are not an input to this feature's tasks.
- The 3D scene's cubes and numbers — they follow the theme through
  [themed-board-art-and-motion](./themed-board-art-and-motion.md).
- A "Match system" theme option or reading the operating system's colour
  preference — each theme is one fixed look ([theme-system](./theme-system.md)).
- The Settings page and its theme list — the settings feature stores the
  theme id; the list is [theme-system](./theme-system.md)'s.
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

- **Token values.** Each theme's stylesheet declares the token values as
  CSS custom properties under its own root attribute —
  [theme-system](./theme-system.md) § Architecture, *Theme stylesheet*.
- **Theme applier** — [theme-system](./theme-system.md) § Architecture,
  *Theme applier*.
- **Token reader.** A module for non-DOM consumers — the Classic 2D Canvas
  renderer, and the shell reading the 3D scene's sky — that returns the resolved value of a named token for the
  active theme and lets a consumer subscribe to theme changes. It reads the
  active theme's computed values rather than holding a second copy of them.
- **Scene palette handed in.** The 3D renderer
  ([rendering.md](../../context/rendering.md)) reads no token and never
  subscribes to theme changes. The shell reads the sky tokens through the
  token reader at start-up and on every theme change and hands the renderer
  the active theme's sky, which it draws as the sky gradient, the fog colour
  and the clear colour; its tiles and numbers are not tokenised.

## Data and state

- The theme preference and the active theme are
  [theme-system](./theme-system.md)'s (§ Data and state).
- Token values are static, held in each theme's stylesheet; nothing about
  them is persisted.

## Interfaces and contracts

- **Root attribute** — the active theme's id
  ([theme-system](./theme-system.md)); every themed style keys off it. No
  other mechanism (classes, per-screen switches) applies themes.
- **Token names** — stable, semantic names (surface, surface-raised, ink,
  ink-muted, accent, accent-ink, danger, success, focus ring, …), never
  named after a hue. Renaming a token is a breaking change for every
  consumer.
- **Theme applier** — [theme-system](./theme-system.md) § Interfaces and
  contracts, *Applier*.
- **Token reader** — `token(name)` returns the active value; an unknown name
  returns a visible fallback and logs once in development, so a missing
  token shows on screen instead of failing silently. `onThemeChange(listener)`
  fires after a theme switch is applied.
- **Contrast contract** — in each theme, body text against its surface meets
  WCAG AA (4.5:1); large text and essential UI glyphs meet 3:1.

## Dependencies

- `settings` stores the theme id and drives the theme applier of
  [theme-system](./theme-system.md).
- [theme-system](./theme-system.md) — the token values, the themes and the
  applier.
- No external libraries.

## Typeface

Each theme ships its own fonts as its typography tokens' values —
[theme-system](./theme-system.md) § Architecture, *Theme fonts*.
