# Fonts

Read at step 4. The game ships every font file it uses: an artboard's font
service link names the families and weights, and the files come from the
font's published package at authoring time, never from the link at run time
(`.claude/domain/features/theme-system.md`, self-hosted fonts).

## Which files

- The families are those the theme's tokens name (`--font-family-*`) and the
  board module's number font.
- The weights are only those the theme's rules and the number font use, in
  the normal style unless an artboard draws an italic.
- The subset is Latin, as the default theme ships it.

## Fetching

1. Find the family's package on npm: `@fontsource/<family in kebab-case>`
   (`registry.npmjs.org/@fontsource/<family>/latest` gives its current
   version). Pin that version for every file of the family.
2. Fetch each file from the package's `files/` folder,
   `cdn.jsdelivr.net/npm/@fontsource/<family>@<version>/files/<family>-latin-<weight>-<style>.woff2`,
   and the package's `LICENSE`, into the scratchpad — never into the
   repository until step 5.
3. A family with no such package, or a weight the package does not carry,
   is a font the skill cannot ship: a stop (`./stops.md`).

## The licence

Read each fetched `LICENSE` in full. A licence that permits redistributing
the font with the game — the SIL Open Font License 1.1, or Apache 2.0 — lets
the family ship; record which it is for the report. Any other licence, or
a missing one, is a stop.

## Placing

At step 5 the files go into `themes/<id>/fonts/` under the default theme's
naming — `<family>-latin-<weight>-<style>.woff2` and the licence as
`<LICENCE KIND>-<FamilyName>.txt` (for example `OFL-Rubik.txt`) — and the
theme declares them (`./files.md`). The licence is the package's text with
every URL taken out — a link in a copyright line goes with its parentheses,
a line pointing to the licence's FAQ goes whole — since the conformance
tests reject a remote URL in any of a theme's text files; the default
theme's licences are the model. An update replaces files whose family or
weights changed and removes those the theme no longer uses.
