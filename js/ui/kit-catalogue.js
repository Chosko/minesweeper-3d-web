// The kit catalogue as data: every component and composition documented in the head comment of
// css/components.css, its class, its variants, its named parts and the states of each interactive
// part, and its decoration slots. The conformance tests, the gallery and the theme skill read it;
// each part and state names the selector a theme stylesheet styles. The names are the contract
// between the layout and every theme: renaming one breaks every theme and every screen. DOM-free.
//
// A component: { name, kind ('component' | 'composition'), className, selector (the class's own
// selector), base (a class it shares with other components, or null), variants (modifier classes),
// parts, slots }. A part: { name, selector, optional (a theme may hide it), interactive, states
// (interactive parts only: state name → selector list), as (the component whose rules draw it, when
// its markup carries that component's class) }. A slot: { name, selector }, an element present in
// the markup, marked data-slot="<name>", and hidden unless a theme styles it into view.
//
// States. On buttons, menu entries, mode entries and board options hover and focus are one
// `selected` state (screen-components § Scope and non-goals), so those parts carry default,
// selected, pressed and disabled, and a board option also `chosen`, the board it holds, apart from
// selected. Every other control carries default, hover, pressed, focused and disabled, plus
// `checked` where it holds a chosen value (a switch, a checkbox, a segmented option, a tab).

export const STATES = Object.freeze(['default', 'hover', 'pressed', 'focused', 'selected', 'checked', 'chosen', 'disabled']);

const focus = (sel) => `${sel}:focus-visible, body.pad-nav ${sel}:focus`;

// A button, menu entry, mode entry or board option: hover and focus are its selected state; `extra`
// adds `chosen`.
const selectable = (name, sel, extra = {}) => Object.freeze({
  name, selector: sel, optional: false, interactive: true,
  states: Object.freeze({ default: sel, selected: focus(sel), pressed: `${sel}:active`, disabled: `${sel}:disabled`, ...extra }),
});

// Any other control: its own hover and focus states; `extra` adds `checked` or overrides one.
const control = (name, sel, extra = {}) => Object.freeze({
  name, selector: sel, optional: false, interactive: true,
  states: Object.freeze({ default: sel, hover: `${sel}:hover`, pressed: `${sel}:active`, focused: focus(sel), disabled: `${sel}:disabled`, ...extra }),
});

const part = (name, selector, { optional = false, as = null } = {}) => Object.freeze({ name, selector, optional, interactive: false, as });

const entry = (kind, className, { base = null, variants = [], parts = [], slots = [] } = {}) => Object.freeze({
  name: className,
  kind,
  className,
  selector: `.${className}`,
  base,
  variants: Object.freeze(variants),
  parts: Object.freeze(parts),
  slots: Object.freeze(slots),
});

const slot = (name, selector) => Object.freeze({ name, selector: `${selector}[data-slot="${name}"]` });

const component = (className, options) => entry('component', className, options);
const composition = (className, options) => entry('composition', className, options);

export const KIT_CATALOGUE = Object.freeze([
  component('ui-button--primary', {
    base: 'ui-button',
    variants: ['ui-button--sm', 'ui-button--lg'],
    parts: [selectable('button', '.ui-button--primary')],
  }),
  component('ui-button--secondary', {
    base: 'ui-button',
    variants: ['ui-button--sm', 'ui-button--lg'],
    parts: [selectable('button', '.ui-button--secondary')],
  }),
  component('ui-menu', {
    parts: [
      selectable('item', '.ui-menu__item'),
      part('label', '.ui-menu__label'),
      part('detail', '.ui-menu__detail', { optional: true }),
    ],
  }),
  component('ui-card', { parts: [part('title', '.ui-card__title')] }),
  component('ui-panel', { variants: ['ui-panel--muted'] }),
  component('ui-banner'),
  component('ui-toggle', {
    parts: [
      control('input', '.ui-toggle__input', { checked: '.ui-toggle__input:checked' }),
      part('label', '.ui-toggle__label'),
    ],
  }),
  component('ui-slider', {
    parts: [
      part('label', '.ui-slider__label'),
      part('value', '.ui-slider__value'),
      control('input', '.ui-slider__input'),
    ],
  }),
  component('ui-segmented', {
    variants: ['ui-segmented--list'],
    parts: [
      control('option', '.ui-segmented__option', { checked: '.ui-segmented__option[aria-checked="true"]' }),
      part('swatch', '.ui-segmented__swatch', { optional: true }),
    ],
  }),
  component('ui-stat', {
    parts: [
      part('label', '.ui-stat__label'),
      part('value', '.ui-stat__value'),
      part('detail', '.ui-stat__detail', { optional: true }),
    ],
  }),
  component('ui-stat--tile', {
    parts: [
      part('label', '.ui-stat--tile .ui-stat__label'),
      part('value', '.ui-stat--tile .ui-stat__value'),
      part('detail', '.ui-stat--tile .ui-stat__detail', { optional: true }),
      part('badge', '.ui-stat--tile .ui-chip', { optional: true, as: 'ui-chip' }),
    ],
  }),
  component('ui-code', {
    variants: ['ui-code--compact'],
    parts: [
      part('label', '.ui-code__label', { optional: true }),
      part('value', '.ui-code__value'),
    ],
  }),
  // The pager's buttons are secondary buttons and take that component's states.
  component('ui-pager', {
    parts: [
      part('button', '.ui-pager__button', { as: 'ui-button--secondary' }),
      part('current', '.ui-pager__button[aria-current="page"]'),
    ],
  }),
  component('ui-field', {
    parts: [
      part('label', '.ui-field__label'),
      control('input', '.ui-field__input'),
    ],
  }),
  component('ui-link', {
    parts: [control('link', '.ui-link', { disabled: '.ui-link[aria-disabled="true"]' })],
  }),
  component('ui-spinner'),
  // The bar's stats are ui-stat readouts; its pause is a secondary button and takes its states.
  component('ui-overlay-bar', { parts: [part('pause', '.ui-overlay-bar__pause', { as: 'ui-button--secondary' })] }),

  // The shared layout's components (shared-screen-layout).
  component('ui-button--danger', {
    base: 'ui-button',
    parts: [selectable('button', '.ui-button--danger')],
  }),
  // The game's title: three words on one line, each in its own accent.
  component('ui-wordmark', { parts: [part('word', '.ui-wordmark__word')] }),
  component('ui-backdrop'),
  component('ui-frame', {
    parts: [
      part('head', '.ui-frame__head'),
      part('back', '.ui-frame__start .ui-button', { optional: true, as: 'ui-button--secondary' }),
      part('title', '.ui-frame__title'),
      part('action', '.ui-frame__end .ui-button', { optional: true, as: 'ui-button--primary' }),
      part('body', '.ui-frame__body'),
      part('foot', '.ui-frame__foot', { optional: true }),
      part('status', '.ui-frame__status', { optional: true }),
      part('summary', '.ui-frame__summary', { optional: true }),
    ],
    slots: [slot('window-chrome', '.ui-frame__chrome')],
  }),
  // Each entry's accent follows its data-entry; the selected entry is taller, with a bigger icon and label.
  // A disabled entry is aria-disabled, so it can still be selected and show its preview.
  component('ui-mode-entry', {
    parts: [
      selectable('entry', '.ui-mode-entry', { disabled: '.ui-mode-entry[aria-disabled="true"]' }),
      part('icon', '.ui-mode-entry__icon'),
      part('label', '.ui-mode-entry__label'),
      part('reason', '.ui-mode-entry__reason', { optional: true }),
      part('last', '.ui-mode-entry .ui-chip', { optional: true, as: 'ui-chip' }),
      part('lock', '.ui-mode-entry__lock', { optional: true }),
    ],
  }),
  component('ui-option', {
    variants: ['ui-option--learn'],
    parts: [
      selectable('option', '.ui-option', { chosen: '.ui-option[aria-pressed="true"]' }),
      part('badge', '.ui-option__badge', { optional: true }),
      part('name', '.ui-option__name'),
      part('last', '.ui-option .ui-chip', { optional: true, as: 'ui-chip' }),
      part('meta', '.ui-option__meta', { optional: true }),
      part('size', '.ui-option__size', { optional: true }),
      part('density', '.ui-option__density', { optional: true }),
      part('check', '.ui-option__check'),
    ],
  }),
  component('ui-section-label', {
    parts: [part('text', '.ui-section-label__text'), part('aside', '.ui-section-label__aside', { optional: true })],
  }),
  component('ui-key-hint', {
    variants: ['ui-key-hint--pad'],
    parts: [part('key', '.ui-key-hint__key'), part('label', '.ui-key-hint__label', { optional: true })],
  }),
  component('ui-chip', { variants: ['ui-chip--won', 'ui-chip--lost', 'ui-chip--muted', 'ui-chip--best'] }),
  component('ui-list-row', {
    parts: [
      part('date', '.ui-list-row__date'),
      part('board', '.ui-list-row__board', { optional: true }),
      part('figure', '.ui-list-row__figure'),
      part('outcome', '.ui-list-row .ui-chip', { as: 'ui-chip' }),
    ],
  }),
  // --live while the 3D renderer draws through it; a preview with no board is a card in the stage,
  // its badge in the accent its data-entry names.
  component('ui-scene-panel', {
    variants: ['ui-scene-panel--live'],
    parts: [
      part('stage', '.ui-scene-panel__stage'),
      part('tag', '.ui-scene-panel__tag', { optional: true }),
      part('card', '.ui-scene-panel__card', { optional: true }),
      part('badge', '.ui-scene-panel__badge', { optional: true }),
      part('name', '.ui-scene-panel__name', { optional: true }),
      part('note', '.ui-scene-panel__note', { optional: true }),
    ],
  }),
  component('ui-divider', { variants: ['ui-divider--vertical'] }),
  component('ui-tabs', {
    parts: [control('tab', '.ui-tabs__tab', { checked: '.ui-tabs__tab[aria-selected="true"]' })],
  }),
  component('ui-checkbox', {
    parts: [
      control('input', '.ui-checkbox__input', { checked: '.ui-checkbox__input:checked' }),
      part('label', '.ui-checkbox__label'),
    ],
  }),
  component('ui-table', {
    parts: [part('heading', '.ui-table th'), part('cell', '.ui-table td'), part('figure', '.ui-table__figure', { optional: true })],
  }),

  composition('ui-screen', { variants: ['ui-screen--wide', 'ui-screen--columns'] }),
  composition('ui-row'),
  composition('ui-grid'),
  composition('ui-heading'),
  composition('ui-text', { variants: ['ui-text--muted', 'ui-text--warning'] }),
  composition('ui-actions', { variants: ['ui-actions--row'] }),
  composition('ui-stat-row', { variants: ['ui-stat-row--tiles'] }),
  composition('ui-columns', {
    variants: ['ui-columns--two', 'ui-columns--pair'],
    parts: [part('column', '.ui-column'), part('span', '.ui-columns__span')],
  }),
  composition('ui-mode-list'),
  composition('ui-options'),
  composition('ui-key-hints'),
  composition('ui-list'),
]);

// The contrast contract's token roles: body text on each surface token at least 4.5:1, large text
// and essential glyphs at least 3:1. The conformance tests measure every theme against them.
export const CONTRAST_ROLES = Object.freeze({
  surfaces: Object.freeze(['--color-surface', '--color-surface-raised', '--color-surface-sunk', '--color-ground']),
  bodyText: Object.freeze(['--color-ink', '--color-ink-muted']),
  largeText: Object.freeze(['--color-accent', '--color-figure', '--color-success', '--color-danger', '--color-warning', '--color-focus-ring']),
});

// The required token set: every token a theme stylesheet must declare, because something outside
// the theme reads it — the base stylesheets (css/components.css, css/style.css), the screens'
// scripts that draw from tokens (the Records chart, the 2D board view, tile skin and end effect, the
// replay viewer, the scene palette) — plus the contrast roles above. The conformance tests and the
// theme skill read this one list; tests/theme-conformance.test.mjs keeps it equal to those reads.
export const REQUIRED_TOKENS = Object.freeze([
  // type, read by the base stylesheets and the Records chart
  '--font-family-sans',
  '--font-size-xs', '--font-size-sm', '--font-size-md', '--font-size-lg', '--font-size-xl', '--font-size-2xl',
  '--font-weight-regular', '--font-weight-bold', '--font-weight-heavy',
  // surfaces, ink and status: the contrast roles and the Records chart
  ...new Set([...CONTRAST_ROLES.surfaces, ...CONTRAST_ROLES.bodyText, ...CONTRAST_ROLES.largeText, '--color-border']),
  // the 2D board view and its end effect
  '--color-board-frame', '--color-board-shadow', '--color-board-scrollbar', '--color-tile-cursor',
  // the 2D tile skin
  '--color-tile-rim', '--color-tile-bevel-light', '--color-tile-bevel-dark', '--color-tile-closed', '--color-tile-flagged',
  '--color-tile-face-shade', '--color-tile-gloss', '--color-tile-gloss-fade', '--color-tile-pressed',
  '--color-tile-revealed-rim', '--color-tile-revealed-edge', '--color-tile-revealed', '--color-tile-revealed-shade',
  '--color-tile-mine', '--color-tile-wrong-flag', '--color-tile-exploded', '--color-tile-exploded-edge',
  '--color-tile-exploded-shade', '--color-tile-number-shadow', '--color-tile-mine-glyph', '--color-tile-mine-highlight',
  '--color-tile-flag', '--color-tile-flag-shade', '--color-tile-flag-shadow', '--color-tile-wrong-flag-mark',
  '--color-tile-wrong-flag-outline',
  '--color-number-1', '--color-number-2', '--color-number-3', '--color-number-4',
  '--color-number-5', '--color-number-6', '--color-number-7', '--color-number-8',
  // the replay viewer's Show 3BV tints
  '--color-replay-bbbv-1', '--color-replay-bbbv-2', '--color-replay-bbbv-3', '--color-replay-bbbv-4',
  '--color-replay-bbbv-5', '--color-replay-bbbv-6', '--color-replay-bbbv-isolated',
  // the 3D scene's sky
  '--color-scene-zenith', '--color-scene-horizon', '--color-scene-nadir',
  // the Settings theme list's swatch (js/settings/page.js SWATCH_TOKENS) beyond the contrast roles
  '--color-accent-fill',
]);
