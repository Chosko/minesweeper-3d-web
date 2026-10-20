// The fixture themes' registry entries (test-only, never shipped): a test registers one with
// registerTheme from js/themes/registry.js to exercise a run-time switch. Paths are relative to the
// site root, as a shipped entry's are.

// The second theme every switch test uses; it declares no fonts.
export const FIXTURE_THEME = Object.freeze({
  id: 'fixture-dusk',
  name: 'Fixture dusk',
  stylesheet: 'tests/fixtures/themes/fixture-dusk/theme.css',
  boardModule: 'tests/fixtures/themes/fixture-dusk/board.js',
  fonts: Object.freeze([]),
  order: 99,
  demo: false,
});

// A theme declaring two weights of a font served from its own folder, for the switch's font loading;
// it borrows the fixture dusk board module.
export const FONTS_FIXTURE_THEME = Object.freeze({
  id: 'fixture-fonts',
  name: 'Fixture fonts',
  stylesheet: 'tests/fixtures/themes/fixture-fonts/theme.css',
  boardModule: 'tests/fixtures/themes/fixture-dusk/board.js',
  fonts: Object.freeze([
    Object.freeze({
      family: 'Fixture Sans',
      licence: 'tests/fixtures/themes/fixture-fonts/fonts/OFL-Rubik.txt',
      files: Object.freeze([
        Object.freeze({ weight: 500, style: 'normal', path: 'tests/fixtures/themes/fixture-fonts/fonts/fixture-sans-500-normal.woff2' }),
        Object.freeze({ weight: 800, style: 'normal', path: 'tests/fixtures/themes/fixture-fonts/fonts/fixture-sans-800-normal.woff2' }),
      ]),
    }),
  ]),
  order: 98,
  demo: false,
});
