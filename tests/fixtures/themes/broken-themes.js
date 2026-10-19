// Deliberately broken themes (test-only, never registered or shipped): tests/theme-conformance.test.mjs
// runs the conformance checks against each and asserts its defect is caught. Each entry is a registry
// entry plus `expect`, the problems the checks must report, and `clean`, the problems they must not —
// something the fixture does right, so a check that flags everything does not pass for one that bites.
const BOARD = 'tests/fixtures/themes/fixture-dusk/board.js';
const DIR = 'tests/fixtures/themes/broken';

const broken = (id, file, expect, clean, extra = {}) => Object.freeze({
  id,
  name: id,
  stylesheet: `${DIR}/${file}`,
  boardModule: BOARD,
  fonts: Object.freeze([]),
  order: 100,
  demo: false,
  ...extra,
  expect: Object.freeze([expect].flat()),
  clean: Object.freeze([clean].flat()),
});

export const BROKEN_THEMES = Object.freeze([
  broken('broken-unscoped', 'unscoped.css',
    { check: 'scope', subject: '.ui-card' },
    { check: 'scope', subject: ':root[data-theme="broken-unscoped"] .ui-card' }),
  broken('broken-missing-token', 'missing-token.css',
    { check: 'token', subject: '--color-ink' },
    { check: 'token', subject: '--color-surface' }),
  broken('broken-missing-state', 'missing-state.css',
    { check: 'state', subject: 'ui-toggle input disabled' },
    { check: 'state', subject: 'ui-toggle input checked' }),
  broken('broken-remote-font', 'remote-font.css',
    [{ check: 'font', subject: 'https://example.com/fonts/remote.woff2' }, { check: 'remote', subject: `${DIR}/remote-font.css` }],
    [{ check: 'scope', subject: ':root[data-theme="broken-remote-font"] body' }, { check: 'remote', subject: `${DIR}/commented-board.js` }],
    { boardModule: `${DIR}/commented-board.js` }),
  broken('broken-uncatalogued-slot', 'uncatalogued-slot.css',
    { check: 'slot', subject: 'ornament' },
    { check: 'scope', subject: ':root[data-theme="broken-uncatalogued-slot"] .ui-card [data-slot="ornament"]' }),
  broken('broken-important-animation', 'important-animation.css',
    { check: 'motion', subject: ':root[data-theme="broken-important-animation"] .ui-spinner { animation }' },
    { check: 'scope', subject: '@keyframes broken-important-animation-turn' }),
  broken('broken-reduced-motion', 'reduced-motion.css',
    { check: 'motion', subject: '@media (prefers-reduced-motion: reduce)' },
    { check: 'scope', subject: ':root[data-theme="broken-reduced-motion"] .ui-spinner' }),
  broken('broken-unscoped-keyframes', 'unscoped-keyframes.css',
    { check: 'scope', subject: '@keyframes turn' },
    { check: 'scope', subject: ':root[data-theme="broken-unscoped-keyframes"] .ui-spinner' }),
  broken('broken-missing-file', 'unscoped.css',
    { check: 'files', subject: `${DIR}/no-such-board.js` },
    { check: 'files', subject: `${DIR}/unscoped.css` },
    { boardModule: `${DIR}/no-such-board.js` }),
]);
