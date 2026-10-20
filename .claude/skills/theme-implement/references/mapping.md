# Mapping the artboards to the contract

Read at step 3. The result is a plan held in memory — every value step 5
writes, each with its source artboard, or with the derivation rule that gave
it. The contract's authorities, read here rather than restated:

| Authority | Holds |
| --------- | ----- |
| `js/ui/kit-catalogue.js` | `KIT_CATALOGUE` (components, parts, states as selectors, decoration slots), `STATES`, `CONTRAST_ROLES`, `REQUIRED_TOKENS` |
| `css/components.css` head comment | what each component and part is, its markup pattern and the screens built from it |
| `js/themes/board-module.js` head comment | the board module's shape, `CELL_EVENTS`, `MOTION_PROPERTIES`, `NAMED_EASINGS`, the board conformance checks |
| `js/tile-art.js` `STYLES` | the shipped tile drawing styles and each one's parameters |
| `.claude/domain/features/themed-board-art-and-motion.md` § *Values a theme's artboards leave undrawn* | the derivation rules |
| `themes/<default>/` | a complete theme: the shape every file takes, and the selectors a theme styles beyond the catalogue |

A value with no place in any of them is a stop (`./stops.md`), never a new
token, part, slot, entry or rule invented to hold it.

## Tokens — from the tokens artboard

- Every name in `REQUIRED_TOKENS` is declared, from the token block: surfaces,
  ink, accents, borders and status colours by name; radii, shadows, type
  sizes and weights, durations and easings likewise. A token the artboard
  declares under the same name keeps its value; one it names differently is
  matched by role (the swatch's label and where the components artboard uses
  it).
- Tokens the theme's own rules read beyond the required set — further
  accents, edges, radii, shadows, durations — are declared too, named as the
  default theme names the same role.
- `--font-family-*` name the theme's own families (`./fonts.md`), with a
  generic fallback.
- The contrast roles (`CONTRAST_ROLES`) must hold: body text 4.5:1 and large
  text 3:1 on every surface. A drawn pair that fails is not adjusted — the
  design is wrong for the contract, which is a question (attended) or a stop
  (unattended), naming the pair.

## Components — from the components artboard

For each catalogue entry, find the element of the components artboard that
is that component — by what it is and does (`css/components.css` head
comment), not by its class name — and for each of its parts:

- its styles at rest become the part's rule, under the part's selector;
- each state the artboard shows (its label: hover, pressed, focused,
  selected, checked, chosen, invalid, disabled) becomes the rule under that state's
  selector list from `KIT_CATALOGUE`, every selector of the list;
- a state the artboard does not show takes the nearest shown state's look
  by the catalogue's rule for that control (buttons, menu entries, mode
  entries and board options: hover and focus are one selected state; every
  other control: its own focus ring from `--color-focus-ring`), and is named
  in the report as derived;
- a part marked `as` is drawn by that component's rules and needs no rule of
  its own unless the artboard draws it differently there;
- an `optional` part the artboard leaves out is hidden by the theme's rule.

Every interactive part must show its focused (or selected) state visibly —
the conformance test checks it.

**Beyond the catalogue.** The default theme's stylesheet also styles the
shell's own screens (the ids and classes of `index.html` and `css/style.css`
that the kit does not cover). Each selector it styles there is a rule the new
theme gives too, from the screen artboards, so no screen falls back to
structure alone.

**Decoration slots.** Window chrome and ornaments map to the catalogued
slots (`slots` in `KIT_CATALOGUE`, marked `data-slot` in the markup), which
the base hides: the theme shows and draws a slot it uses and leaves the
others hidden. Ornament with no catalogued slot is a stop.

**DOM animation.** A component's own animation drawn on the components
artboard (a spinner's turn, a toast's entrance) becomes `@keyframes` named
`<id>-<name>` and the rule that runs it. Nothing overrides the base
stylesheet's `prefers-reduced-motion` rule.

**Layout.** Positions, sizes, spacing, columns and order belong to the base
stylesheets. An artboard whose layout differs from the shared layout — not
only its colours, borders, radii, shadows, type and decoration — is a stop.

## The board module — from the board sheets

Each entry of the board module's shape, from the 2D board sheet and the 3D
sheet:

- **Palettes** — `faces2d` from the 2D tiles in each state (closed, pressed,
  revealed, exploded, the marked start cell); `faces3d` from the 3D cube
  faces. A pressed face the sheet leaves undrawn is the closed face's
  palette, which the style draws at zero depth.
- **Drawing style** — for each mode, the shipped style in `STYLES` whose
  construction the sample tiles show (a sloped bevel, or a flat face with a
  light band and a dark edge), with its parameters measured from the sample
  as fractions of the tile, plus, in 2D, `gap` and `frameRadius`. A bevel
  side the sheet draws in a colour no mix of the face with its light or dark
  bevel gives is that `#rrggbb` colour. A tile no shipped style draws within
  its parameters is a stop.
- **Numbers** — two lists: `numbers2d`, the 2D sheet's numbers 1–8 as
  drawn, and `numbers3d`, the 3D sheet's numbers as drawn. Every 3D number
  past those the sheet draws takes the 3D mode's reference hue
  (`js/textures.js`, the hues the unthemed atlas starts from), adjusted in
  lightness, hue kept, until it passes the board conformance contrast check
  against every point of the 3D revealed face; each is named in the report with its value.
  A drawn number that fails that check is not adjusted: it is a question
  (attended) or a stop (unattended), naming the number, as a failing token
  pair is.
- **Glyphs** — flag, mine, wrong-flag cross and number shadow as drawn; an
  undrawn mine and cross take the theme's ink and danger colours.
- **Font** — the number font: one of the theme's own faces, at the weight the
  sheet's numbers use.
- **Board ground, cursor, selection, start-cell mark, confetti** — as drawn
  on the sheets.
- **Classic 2D end effect** (`end2d`) — the 3D sheet's win and loss waves:
  the light a wave mixes toward, the win wave's peak scale and mix, the loss
  wave's starting scale and flash.
- **Sky** — horizon, zenith and nadir from the 3D sheet's panel; with no 3D
  panel, from the page backdrop. The fog is the horizon unless the sheet
  draws its own.
- **Motion** — see below.

The 2D tile tokens of `REQUIRED_TOKENS` carry the same values as the
`faces2d` entries and glyphs that name the same thing.

## Motion — per labelled cell event

A sample cell's animation is drawn either as CSS `@keyframes` running on the
sample, or as a labelled strip of frames (`Press · 90 ms · easing-out`, each
frame labelled with its time and values). Either way, one motion description
per cell event in `CELL_EVENTS`, identified by its label:

| Animated | Ingredient |
| -------- | ---------- |
| `transform: scale(…)` | `scale` |
| `transform: translate(…)` | `offset`, in cell sizes (the length over the sample tile's size); `z` only for the 3D sheet's toward-camera move |
| `transform: rotate…(…)` | `rotation`, with `axis` from the rotation's axis |
| the cell's face changing mid-animation | `rotation` with `flip: true`, its midpoint at the frame the new face first shows; a face change with no turn keeps its angle at 0 |
| the tile's bevel or shadow depth | `depth`, 1 fully raised, 0 flat |
| `filter: brightness(…)` | `brightness` |
| `opacity` | `opacity` |

- `duration` is the animation's length in ms; each keyframe's `at` is its
  percentage of it.
- `easing` is the animation's timing function: a name from `NAMED_EASINGS`,
  or a `cubic-bezier(…)` as its four numbers. Any other timing function
  (`steps()`, `linear()` with stops) is outside the vocabulary.
- An event the sheets do not animate takes `null`, except `solvedPulse`,
  which takes the reference pulse the 3D mode plays today (the pulse
  constants of `js/render.js`) when undrawn, named in the report as derived.
- An animated property outside the table, or animation of something that is
  not a labelled cell event, is a stop.
