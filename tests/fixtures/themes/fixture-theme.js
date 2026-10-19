// The fixture theme's registry entry (test-only, never shipped): a test registers it with
// registerTheme from js/themes/registry.js to exercise a run-time switch. Paths are relative to the
// site root, as a shipped entry's are; it declares no fonts.
export const FIXTURE_THEME = Object.freeze({
  id: 'fixture-dusk',
  name: 'Fixture dusk',
  stylesheet: 'tests/fixtures/themes/fixture-dusk/theme.css',
  boardModule: 'tests/fixtures/themes/fixture-dusk/board.js',
  fonts: Object.freeze([]),
  order: 99,
  demo: false,
});
