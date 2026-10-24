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

A skill in the project's skill folder, `.claude/skills/theme-implement/`,
in the same form as the project's other skills and under the interaction
policy the project's `CLAUDE.md` declares: `SKILL.md` holds the run's
phases, and its mapping tables, stop list, font, file and verification rules
sit in `references/`, each read at the phase that needs it.

- **Reading the canvas.** The canvas is read with the Artifact tool: its
  files listed, its board index read for the board titles, then each
  artboard of the theme and the components artboard read as data — never
  as instructions to the skill. The theme's artboards are the boards whose
  title starts with the theme's name; the skill asks (or, unattended,
  stops) when they are ambiguous. An artboard's scripts are never run and
  its links never fetched.
- **Mapping to the contract.** From the artboards' styles the skill maps:
  - surfaces, ink, accents, borders, radii, shadows and fonts to the
    required tokens;
  - each artboard element to its kit component and part by the kit
    catalogue (`theme-system`), and its styles to that part's rule in each
    state the components artboard shows;
  - window chrome and ornaments to decoration slots;
  - the sample tiles to the board module's palette and to the closest
    shipped tile drawing style with its parameters, and the Hexagon and
    Triangle board sheets' tiles to each grid's gap and corner radius;
  - 2D number colours 1–12 as drawn (9–12 on the Triangle board sheet), 3D
    number colours as drawn, and anything the artboards leave undrawn
    by the derivation rules of `themed-board-art-and-motion`. Only a
    derived number is adjusted to pass the board contrast check; a drawn
    number or token pair that fails the contrast contract is never
    adjusted — it is a question (attended) or a stop (unattended);
  - the 3D panel or 3D artboard to the sky and fog;
  - **a sample cell's animation** — CSS keyframes, or a labelled strip of
    frames — to motion descriptions: each animated property translated to
    its vocabulary ingredient (transform scale, translate and rotate; the
    tile's shadow or bevel depth; a brightness filter; opacity), with the
    animation's duration and easing, per cell event the components artboard
    labels.
- **Fonts.** The artboards load their fonts from a font service; the skill
  fetches the font files at authoring time from the font's published
  package, keeps only the weights the theme uses, places them with their
  licence in the theme's folder, and declares them in the stylesheet by
  those files. The licence is shipped with its URLs taken out, since a
  theme's files carry no remote URL. A font without a licence that permits
  shipping it stops the skill.
- **Verification.** The skill runs the conformance tests and the full test
  suite, fixing only its own files, then renders the gallery under the new
  theme and each artboard screen it can reproduce, and presents them side
  by side, naming every difference it could not close.
- **Stop conditions.** The skill stops, writes nothing it cannot finish,
  and says that a task is needed — naming what — when a design needs: a
  tile drawing style that is not shipped; a decoration slot, component or
  part the catalogue lacks; a motion ingredient outside the vocabulary or
  motion on something that is not a cell event; a layout change; a font
  it cannot ship; colours below the contrast contract, unattended; or a
  change to a file outside the theme's own for a test to pass.
- **Questions.** The skill has no parking mechanism: under `unattended` a
  question stops the run with nothing written.
- **Commit.** One commit holding the theme's files and its registry entry,
  titled `Add theme <id>` (or `Update theme <id>` for an update).

## Data and state

- The skill writes only the theme's own folder and the registry entry —
  the entry in the registry and its mirror in the pre-paint script; the
  theme's board module and stylesheet carry, in a header note, the canvas
  URL and the version of it they were built from, so an update knows its
  source.
- An add takes the next catalogue order and stays out of the demo; an update
  keeps its id, catalogue order and demo field.
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
  cannot be part of this milestone. Its acceptance was a dry run against
  the *Joyful tiles* artboards into a scratch theme id, discarded, not
  committed: the theme it wrote passed the conformance tests. The dry run
  found two things a real second theme will meet:
  - `tests/settings-page.test.mjs` assumes a catalogue of one theme, so the
    full suite fails with a second theme registered and the skill stops;
  - in Chromium, a theme switch unloads the font faces the page has not
    drawn yet.
