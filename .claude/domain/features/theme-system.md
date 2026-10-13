# Theme system

The catalogue of themes the player picks from on the Settings page, and the
contract every theme fulfils: a registry entry, a stylesheet that restyles
the kit's named components and their parts, a board module that styles every
board, and the theme's own font files shipped with the game. It also carries
the switch from the light and dark looks to *Joyful tiles* and the
conformance tests that hold every registered theme to the contract.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
makes the game's look a catalogue of themes over one shared layout, each
theme one fixed look that changes borders, bevels, shadows, radii, fonts,
window chrome and counter readouts as well as colour, and each shipping its
fonts so it works offline. A theme of that reach cannot be a set of token
values: the Claude Design artboards already vary a bevelled Win98 window with
a title bar and LED counters, a chunky raised card, and a dark glass box,
with different font pairs. This feature is the mechanism that lets such
themes join one at a time, out of schedule, without touching the layout or
the code that draws it — and the tests that make "a theme is done" a
mechanical fact rather than a judgement.

## Scope and non-goals

In scope (m2b-themes):

- **The theme registry** — the catalogue's single list: each theme's id,
  display name, files, fonts, catalogue order and the field a demo lock will
  read.
- **The theme contract** — what every theme must define: the required
  tokens, a style for every part and state of every catalogued kit
  component, the optional decoration slots it may fill, the board module's
  palette, drawing-style choice and motion (its shape is
  `themed-board-art-and-motion`'s), and its font files.
- **The kit catalogue as data** — the named components, their parts, their
  states and the decoration slots, declared once in a machine-readable form
  that the conformance tests, the gallery and the theme skill read. The kit
  itself stays `screen-components`'; `shared-screen-layout` adds to it.
- **Base and theme stylesheets** — the shared stylesheet carries structure
  only; each theme's stylesheet carries every visual value, scoped to its
  id.
- **Theme application** — the chosen theme applied before first paint, a
  run-time switch with no unstyled frame, and the change notification board
  renderers and canvases subscribe to.
- **Self-hosted fonts** — each theme's font files in the game's own files,
  loaded only when that theme is chosen, with their licences.
- **Settings** — the theme setting becomes a choice among the registry's
  themes, shown as a list; a stored `light` or `dark` value carries over to
  *Joyful tiles*.
- **The first theme's DOM look** — *Joyful tiles*' registry entry, fonts
  (Rubik and JetBrains Mono) and its stylesheet for the kit components that
  exist when this feature lands. `shared-screen-layout` styles the
  components it adds, and `themed-board-art-and-motion` writes the board
  module.
- **Removing the light and dark looks** — their token values, the dark
  overrides, the light/dark switch in the gallery and the tests that pinned
  them.
- **Conformance tests** — every registered theme passes them; a theme that
  fails is not a theme.
- **The component gallery per theme** — the development gallery renders
  every component in every state under any registered theme.

Non-goals:

- Theme locks. Every theme is unlocked; the demo's 3-theme limit is the Demo
  edition's, deferred to `m5-core-complete`. The registry only carries the
  field that lock will read.
- A light and a dark variant per theme, and a "Match system" option — each
  theme is one fixed look.
- Reduced motion — `m7-after-launch`: the in-game setting, its first value
  from the operating system's preference, governing all motion. Until then
  the base stylesheet's shipped `prefers-reduced-motion` rule is the game's
  one reduced-motion behaviour, and nothing else reads the preference.
- Migrating the light or dark look into the catalogue as a theme — both are
  removed.
- A second theme — added later by the theme skill, never by a task
  (`theme-implement-skill`).
- Board styling, number colours, the 3D sky and cell motion —
  `themed-board-art-and-motion`.
- The redesigned arrangement of the screens — `shared-screen-layout` and
  `in-game-layout`. This feature styles whatever kit components exist; it
  does not move them.
- Hexagonal, triangle and Surface styling, and the colour-blind-safe number
  set — deferred to `m6-launch`.
- Loading fonts from a font service at run time — the Steam build is
  offline; every font file is the game's own.

## Architecture

Built within the recorded technical direction — plain ES modules and plain
DOM with no bundler or build step, Canvas 2D for the flat board and three.js
for the 3D scene (see [technical-direction.md](../technical-direction.md)).
Two things this feature adds are recorded nowhere in that document yet: each
theme ships self-hosted font files, and both renderers draw per theme. Both
fit the direction; they belong in it on the next `/product-design` pass.

It replaces the theme parts of `design-tokens-and-themes`, `screen-components`
and `settings` as built in m1 (the token sheet, the theme applier and token
reader, and the kit stylesheet: [app-shell-kit.md](../../context/app-shell-kit.md),
[settings.md](../../context/settings.md)).

- **Theme registry.** One module listing every theme, in catalogue order.
  It is the only place a theme is registered: the settings choice, the
  applier, the gallery, the conformance tests and the theme skill all read
  it. It also names the default theme, *Joyful tiles*.
- **Kit catalogue.** One declaration of the kit: each named component, its
  parts, the states each interactive part has (default, hover, pressed,
  focused, disabled, selected where it applies), and the decoration slots.
  A part is a named element of a component's markup pattern — a menu
  entry's icon, label and detail line; a counter's digits and its icon; a
  window's title bar. A **decoration slot** is an element present in the
  markup but hidden unless a theme styles it into view — a title bar's
  decorative buttons, a backdrop ornament. A part marked optional may be
  hidden by a theme — Restart as a text label in one theme and a face icon in
  another. Adding a component, part or slot to the catalogue is a change to
  the contract: every registered theme must style it in the same change.
- **Base stylesheet.** The kit's structure: layout, display, the sizes the
  layout depends on, the hidden default of every decoration slot, and the
  focus-ring presence rule. It carries no colour, font, border, radius,
  shadow or motion value of any theme. Its shipped
  `@media (prefers-reduced-motion: reduce)` rule, which stops every DOM
  animation and transition, stays in it unchanged.
- **Theme stylesheet.** One per theme. Every rule is scoped to the theme's
  id on the document root, so two theme stylesheets can be loaded at once
  during a switch without either affecting the other. It declares the
  theme's tokens (the contract's required set plus any of its own), styles
  every part and state of every catalogued component, fills the decoration
  slots it uses, declares its fonts by their self-hosted files, and carries
  its DOM component animation as plain CSS.
- **Theme board module.** One ES module per theme carrying everything a
  canvas or WebGL renderer needs, which cannot be read from a stylesheet
  cheaply or at all: tile and cube palette, number colours 1–26, sky and
  fog, the tile drawing style and its parameters, the number font, and the
  cell motion descriptions. Its shape and its consumers are
  `themed-board-art-and-motion`'s; this feature loads it and hands it on.
- **Theme fonts.** Each theme's font files sit in the theme's own folder
  with their licence. The theme stylesheet declares them; because a browser
  fetches a declared font only when a loaded stylesheet uses it, a theme's
  fonts load only once the theme is chosen. Canvas drawing waits for the
  number font before building a tile cache or atlas (the font-ready step of
  the applier below).
- **Theme applier.** Replaces the light/dark applier. Before first paint, a
  classic script reads the stored theme id, maps it (unknown or absent →
  default; `light` or `dark` → *Joyful tiles*), inserts that theme's
  stylesheet as a render-blocking stylesheet and sets the root attribute, so
  no screen paints unstyled or in another theme. At run time, switching
  loads the new stylesheet, its board module and its fonts, and only when
  all three are ready flips the root attribute, removes the old stylesheet
  and notifies listeners — the screen never shows a half-applied theme.
- **Token reader.** Kept for DOM-free consumers that draw from tokens (the
  Records history chart): it reads the active theme's computed tokens and
  notifies on theme change. Board renderers read the board module instead.
- **Settings theme list.** The Settings page's Theme section becomes a list
  of the registry's themes in catalogue order, each with its name and a
  small swatch drawn from its tokens, the active one selected. Picking one
  applies it at once. The list reads the registry, so a theme added by the
  skill appears with no change to the page.
- **Conformance tests.** Run for every registered theme, in the ordinary
  test suite; a theme that fails any of them fails the suite:
  - every file the registry names exists, and every font file the
    stylesheet declares is one of the theme's own files (no remote URL in
    any theme file);
  - every rule of the theme stylesheet is scoped to its id, and none
    overrides the base stylesheet's `prefers-reduced-motion` rule;
  - every required token is declared;
  - every part and state of every catalogued component has a rule, and
    every interactive part has a visible focus style;
  - every decoration slot the theme fills is a catalogued slot;
  - the board module passes the board conformance checks of
    `themed-board-art-and-motion`, its contrast checks included;
  - the DOM contrast checks: body text on each surface token at least
    4.5:1, large text and essential glyphs at least 3:1;
  - in a browser: the gallery renders under the theme with no missing
    font, no failed file and no console error.
- **Component gallery.** The development gallery takes a theme from the
  registry (a picker and a query parameter), renders every component in
  every state and every decoration slot under it, and is what the theme
  skill screenshots for comparison with the artboards.

## Data and state

- **The theme preference** — a theme id in the settings document, owned by
  the settings store; default *Joyful tiles*. The settings document's
  format step maps a stored `light` or `dark` to *Joyful tiles*, and the
  pre-paint script applies the same mapping so the first paint after the
  update is already right. A stored id the registry does not know (a theme
  removed, or a document from a newer build) applies the default and is
  kept as stored until the player picks.
- **The active theme** — the root attribute, derived at start-up and
  changed only by the applier.
- **Registry entry** — id (stable, kebab-case, never reused), display name,
  stylesheet, board module, font files with their licence file, catalogue
  order, and the demo field (whether the demo offers the theme), unused
  until `m5-core-complete`.
- **Theme files** — static files in the theme's folder; nothing about a
  theme is persisted.

## Interfaces and contracts

- **Registry** — the list of entries, the default id, and a lookup by id
  that returns the default for an unknown id rather than failing.
- **Applier** — the active id; `set theme(id)` resolving once the theme is
  fully applied, or rejecting with the previous theme still active when a
  file fails to load; `on theme change(listener)` called after the switch
  with the new id and its board module.
- **Board module hand-off** — the applier hands the active board module to
  its subscribers; no renderer imports a theme directly.
- **Kit catalogue** — the component, part, state and slot names are the
  contract between the layout and every theme; renaming one is a breaking
  change to every theme and every screen.
- **Theme stylesheet contract** — rules scoped to the theme id only; tokens
  and parts per the catalogue; fonts only from the theme's own files;
  component animation in CSS only, never overriding the base stylesheet's
  `prefers-reduced-motion` rule — no `prefers-reduced-motion` rule and no
  `!important` animation or transition in a theme stylesheet.
- **Failure contract** — a theme whose files fail to load at start-up falls
  back to the default theme and tells the player once; a failed switch
  keeps the current theme and tells the player once; the default theme
  failing to load is a fatal start-up error shown on the existing fatal
  card, since no screen can be drawn.

## Dependencies

- `screen-components` — the kit whose components the catalogue declares.
- `settings` — the store, schema, Settings page and document format step
  that the theme list and the carry-over extend.
- `platform-storage` — the settings document's versioning.
- `themed-board-art-and-motion` — the board module's shape and the board
  conformance checks this feature's tests run.
- Font files for *Joyful tiles*: Rubik and JetBrains Mono, both under the
  SIL Open Font License, which permits shipping them with the game; the
  licence ships beside the files.
- No new libraries.

