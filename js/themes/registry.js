// The theme registry: the one place a theme is registered. The settings choice, the applier, the
// gallery, the conformance tests and the theme skill all read it; the pre-paint script js/theme.js
// mirrors each entry's id and stylesheet. DOM-free.
//
// An entry: id (stable, kebab-case, never reused), display name, stylesheet, board module, font
// files grouped by family with each family's licence file, catalogue order, and the demo field
// (whether the demo offers the theme). Paths are relative to the site root.

const font = (family, licence, folder, stem, weights) => Object.freeze({
  family,
  licence: `${folder}/${licence}`,
  files: Object.freeze(weights.map((weight) => Object.freeze({
    weight,
    style: 'normal',
    path: `${folder}/${stem}-latin-${weight}-normal.woff2`,
  }))),
});

const JOYFUL_FONTS = 'themes/joyful-tiles/fonts';

export const THEMES = Object.freeze([
  Object.freeze({
    id: 'joyful-tiles',
    name: 'Joyful tiles',
    stylesheet: 'themes/joyful-tiles/theme.css',
    boardModule: 'themes/joyful-tiles/board.js',
    fonts: Object.freeze([
      font('Rubik', 'OFL-Rubik.txt', JOYFUL_FONTS, 'rubik', [500, 600, 700, 800, 900]),
      font('JetBrains Mono', 'OFL-JetBrainsMono.txt', JOYFUL_FONTS, 'jetbrains-mono', [500, 700]),
    ]),
    order: 1,
    demo: true,
  }),
].sort((a, b) => a.order - b.order));

export const DEFAULT_THEME_ID = 'joyful-tiles';

const DEFAULT_THEME = THEMES.find((t) => t.id === DEFAULT_THEME_ID);

// Entries registered at run time: only a test's fixture theme, never a shipped one. They are found
// by the lookup and stay out of THEMES, which every listing and conformance test reads.
const registered = [];

export function registerTheme(entry) {
  if (THEMES.some((t) => t.id === entry.id) || registered.some((t) => t.id === entry.id)) return;
  registered.push(Object.freeze({ ...entry }));
}

// The entry for `id`; the default entry for an unknown or absent id, never a failure.
export function themeById(id) {
  return THEMES.find((t) => t.id === id) ?? registered.find((t) => t.id === id) ?? DEFAULT_THEME;
}
