# The files a theme writes

Read at step 5. The run writes the theme's own folder and its registry entry,
and nothing else; the registry entry is the entry in `js/themes/registry.js`
together with its pre-paint mirror in `js/theme.js` (§ *The registry entry*).
The default theme's folder is the model for every file's shape.

## `themes/<id>/theme.css`

- A header comment: the theme's name; that it is the theme stylesheet,
  every rule scoped to `:root[data-theme="<id>"]`; the canvas URL and the
  version it was built from (from the step 2 listing); the artboards it was
  built from; and whether the theme draws any decoration slot.
- One `@font-face` per font file, its `src` the file's path relative to the
  stylesheet (`fonts/…`), `font-display: swap`.
- The tokens, then every catalogued part and state, then the shell's screens,
  then the DOM animation — each rule's selectors starting with
  `:root[data-theme="<id>"]`.
- `@keyframes` named `<id>-<name>`.
- A value that changes with the size step is written as the default theme's
  are, against the root area (`.claude/domain/features/theme-system.md`
  § Interfaces and contracts, **Theme stylesheet contract**).
- No `@media (prefers-reduced-motion …)`, no `!important` on an animation or
  transition, no `@import`, and no remote URL anywhere but inside a comment —
  the canvas URL in the header is a comment.

## `themes/<id>/board.js`

- A header comment: the theme's name, that it is the board module in the
  shape `js/themes/board-module.js` documents, the canvas URL and version, and
  the artboards it was built from.
- `export const BOARD`, deep-frozen, every entry of the shape present, each
  value followed by a short comment naming its artboard and specimen — or the
  derivation rule, for a derived value.
- It imports nothing.

## `themes/<id>/fonts/`

The font files and their licences, per `./fonts.md`.

## The registry entry

- In `js/themes/registry.js` `THEMES`: `id`, `name`, `stylesheet`,
  `boardModule`, `fonts` (one group per family, through the file's `font`
  helper, naming the licence file and the weights), `order` and `demo`. An
  add takes the next `order` after the last entry and `demo: false` — which
  themes the demo offers is the Demo edition's decision; an update keeps both.
- In `js/theme.js` `STYLESHEETS`, the pre-paint script's mirror of the
  registry, the id and its stylesheet path (`tests/theme.test.mjs` keeps the
  two equal).

## An update

Rewrite the theme's existing files in place from the new plan, header notes
included, keeping the id; delete a font file or licence the theme no longer
uses. The registry entry changes only where the plan does — its name and
fonts — and the mirror only if the stylesheet path changed.

## Leaving the tree clean

A stop at step 6 undoes step 5 exactly, from the list of paths step 5
recorded:

- a file the run created is deleted, and so is a folder it created;
- a file the run changed that was clean at step 1 is restored with
  `git restore -- <path>`;
- a file the run changed that was dirty at step 1 is put back by undoing the
  run's own edits to it, never restored from git.

Nothing outside that list is touched.
