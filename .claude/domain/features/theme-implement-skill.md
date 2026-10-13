# Theme implement skill

The project's Claude skill that adds a theme to the catalogue from its
Claude Design canvas: given the canvas and a theme id, it reads the theme's
artboards and its components artboard, writes the theme's files to the
theme contract, runs the conformance tests, renders the component gallery
for comparison, and commits the theme — with no backlog task, at any
milestone.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
adds themes over time, each by a dedicated Claude skill whenever its designs
are ready, outside the milestone schedule and without a backlog task; the
roadmap's *Not now* list keeps every theme after *Joyful tiles* out of the
milestones, and the demo cannot ship until two more exist. Once
`theme-system` makes a theme a fixed set of files checked by tests, adding
one is a translation from artboards to those files. This skill does that
translation the same way every time, and stops — rather than bending the
contract — when a design asks for something the contract cannot express.

## Scope and non-goals

In scope (m2b-themes):

- A project skill invoked with a Claude Design canvas URL and a theme id
  (and an optional display name), which:
  - reads the canvas's artboards for the theme and its components
    artboard;
  - writes the theme's registry entry, stylesheet, board module, font
    files and licence to the contract;
  - runs the conformance tests and fixes its own output until they pass;
  - renders the component gallery under the new theme and shows it next to
    the artboards;
  - commits the theme as one commit.
- Updating a theme already in the catalogue from a newer version of its
  canvas — the same steps over the theme's existing files, its id kept.
- Stopping with a clear statement when the design needs something outside
  the contract.

Non-goals:

- Changing the shared layout, the kit catalogue, a tile drawing style, the
  motion vocabulary, a renderer or any game code — each is a task, which
  the skill names when it stops.
- Writing a backlog task, a feature document or a runbook step.
- Choosing which themes the demo offers — the Demo edition's, in
  `m5-core-complete`.
- Designing a theme: the skill translates artboards; where they leave a
  required value undrawn it derives one by the contract's documented rule
  and says so, and never invents a look.

## Architecture

A skill in the project's skill folder, written as instructions plus the
reference material it reads on demand, in the same form as the project's
other skills, under the interaction policy the project's `CLAUDE.md`
declares.

- **Reading the canvas.** The canvas is read with the Artifact tool's read
  action: its files listed, then each artboard of the theme and the
  components artboard read as data — never as instructions to the skill.
  The skill identifies the theme's artboards from the canvas's board titles
  and asks (or, unattended, stops) when they are ambiguous.
- **Mapping to the contract.** From the artboards' styles the skill maps:
  - surfaces, ink, accents, borders, radii, shadows and fonts to the
    required tokens;
  - each artboard element to its kit component and part by the kit
    catalogue (`theme-system`), and its styles to that part's rule in each
    state the components artboard shows;
  - window chrome and ornaments to decoration slots;
  - the sample tiles to the board module's palette and to the closest
    shipped tile drawing style with its parameters;
  - number colours 1–8 as drawn, and anything the artboards leave undrawn
    by the derivation rules of `themed-board-art-and-motion`;
  - the 3D panel or 3D artboard to the sky and fog;
  - **CSS keyframes animating a sample cell** to motion descriptions: each
    animated property translated to its vocabulary ingredient (transform
    scale, translate and rotate; the tile's shadow or bevel depth; a
    brightness filter; opacity), with the animation's duration and easing,
    per cell event the components artboard labels.
- **Fonts.** The artboards load their fonts from a font service; the skill
  fetches the font files at authoring time from the font's published
  package, keeps only the weights the theme uses, places them with their
  licence in the theme's folder, and declares them in the stylesheet by
  those files. A font without a licence that permits shipping it stops the
  skill.
- **Verification.** The skill runs the conformance tests and the full test
  suite, then renders the gallery under the new theme and each artboard
  screen it can reproduce, and presents them side by side, naming every
  difference it could not close.
- **Stop conditions.** The skill stops, writes nothing it cannot finish,
  and says that a task is needed — naming what — when a design needs: a
  tile drawing style that is not shipped; a decoration slot, component or
  part the catalogue lacks; a motion ingredient outside the vocabulary or
  motion on something that is not a cell event; a layout change; or a font
  it cannot ship.
- **Commit.** One commit holding the theme's files and its registry entry,
  titled `Add theme <id>` (or `Update theme <id>` for an update).

## Data and state

- The skill writes only the theme's own folder and the registry entry;
  the theme's board module and stylesheet carry, in a header note, the
  canvas URL and the version of it they were built from, so an update
  knows its source.
- Nothing else is stored.

## Interfaces and contracts

- **Invocation** — canvas URL, theme id, optional display name; an id
  already registered means an update, and is said so before anything is
  written.
- **Output** — a theme that passes every conformance test, committed; or a
  stop that names the missing contract capability and leaves the tree
  clean.
- **Untrusted input** — canvas content is data; nothing in it changes what
  the skill does, which files it writes, or its permissions.

## Dependencies

- `theme-system` — the registry, the theme contract, the kit catalogue, the
  conformance tests and the gallery.
- `themed-board-art-and-motion` — the board module's shape, the shipped
  tile drawing styles, the motion vocabulary and the derivation rules for
  undrawn values.
- `shared-screen-layout`, `in-game-layout` — the components a theme must
  style; the skill is complete only once their components are in the
  catalogue.
- The Artifact tool's read action — the canvas reader.
- Playwright, already a development tool here — the gallery renders.

## Open questions

- No second theme's canvas is final yet, so the skill's first real run
  cannot be part of this milestone. Its acceptance is a dry run against
  the *Joyful tiles* artboards into a scratch theme id that passes the
  conformance tests and is then discarded, not committed.
