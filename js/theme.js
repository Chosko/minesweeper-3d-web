/* Pre-paint theme script. A classic (non-module) script in the page head, after the base
   stylesheets and ahead of the module graph: it reads the stored theme id, maps it (unknown or
   absent -> the default; light or dark -> Joyful tiles), inserts that theme's stylesheet as a
   render-blocking <link> after the base stylesheets and sets the root data-theme attribute, so no
   screen paints unstyled or in another theme. On the desktop host the stored id is the one the
   host's preload hands over (HOST_GLOBAL: { theme }, read by the main process from the settings
   document's file; null for none) and browser storage is never read; on the web it is the settings
   document in localStorage.

   A classic script cannot import the ES registry (js/themes/registry.js) without delaying first
   paint, so STYLESHEETS mirrors its id -> stylesheet mapping; tests/theme.test.mjs keeps the two in
   step. A non-default theme whose stylesheet fails falls back to the default here.

   Exposes globalThis.msThemeBoot, the start-up state the run-time applier (js/themes/applier.js)
   takes over: { id, fellBackFrom, link, ready } — `ready` resolves once the active stylesheet has
   loaded and rejects when the default's fails. globalThis.msThemePrePaint carries the pieces, for
   tests: { STYLESHEETS, DEFAULT_THEME, HOST_GLOBAL, themeIdOf, readStoredTheme, readHostTheme, boot }.
   The theme preference is the settings feature's; this script reads it and never writes it. */
(function (global) {
  'use strict';

  var STYLESHEETS = {
    'joyful-tiles': 'themes/joyful-tiles/theme.css',
  };
  var DEFAULT_THEME = 'joyful-tiles';
  var RETIRED = { light: 'joyful-tiles', dark: 'joyful-tiles' };

  // The settings document (js/settings/store.js), read straight from the web build's storage —
  // its key and format are js/platform/browser-backend.js's. The store's version is read, and so is
  // version 1, whose light or dark the mapping below carries over as the store's format step does
  // once settings load. Anything unusable reads as no theme.
  var SETTINGS_KEY = 'ms3d:doc:settings';
  var SETTINGS_VERSIONS = [1, 2];

  function readStoredTheme(storage) {
    var text = storage ? storage.getItem(SETTINGS_KEY) : null;
    if (!text) return null;
    var doc = JSON.parse(text);
    if (!doc || SETTINGS_VERSIONS.indexOf(doc.version) < 0 || !doc.data) return null;
    return doc.data.theme;
  }

  // The desktop host's hand-over (desktop/bridge.js PRE_PAINT_GLOBAL, exposed by its preload):
  // undefined when there is none (the web build), else its theme id or null.
  var HOST_GLOBAL = 'ms3dPrePaint';

  function readHostTheme(scope) {
    var handed = scope ? scope[HOST_GLOBAL] : undefined;
    if (!handed || typeof handed !== 'object') return undefined;
    return typeof handed.theme === 'string' ? handed.theme : null;
  }

  function own(table, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
  }

  function themeIdOf(stored, stylesheets) {
    var table = stylesheets || STYLESHEETS;
    if (own(RETIRED, stored)) return RETIRED[stored];
    return own(table, stored) ? stored : DEFAULT_THEME;
  }

  function insertSheet(doc, href, id) {
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('blocking', 'render');
    link.setAttribute('data-theme-sheet', id);
    link.href = href;
    doc.head.appendChild(link);
    return link;
  }

  function whenLoaded(link) {
    return new Promise(function (resolve, reject) {
      link.addEventListener('load', function () { resolve(link); });
      link.addEventListener('error', function () { reject(new Error('Theme stylesheet failed to load: ' + link.href)); });
    });
  }

  // opts: { doc, storage, hostTheme?, base?, stylesheets? } — hostTheme, when not undefined, is the
  // desktop host's hand-over and storage is not read; base is the site root the stylesheet paths
  // are relative to.
  function boot(opts) {
    var doc = opts.doc;
    var table = opts.stylesheets || STYLESHEETS;
    var base = opts.base || '';
    var stored = null;
    if (opts.hostTheme !== undefined) stored = opts.hostTheme;
    else {
      try { stored = readStoredTheme(opts.storage); } catch (e) { stored = null; }
    }
    var id = themeIdOf(stored, table);
    var state = { id: id, fellBackFrom: null, link: null, ready: null };

    function apply(theme) {
      state.id = theme;
      state.link = insertSheet(doc, base + table[theme], theme);
      doc.documentElement.setAttribute('data-theme', theme);
      return whenLoaded(state.link);
    }

    state.ready = apply(id).then(function () { return state; }, function (err) {
      if (id === DEFAULT_THEME) throw err;
      if (state.link.parentNode) state.link.parentNode.removeChild(state.link);
      state.fellBackFrom = id;
      return apply(DEFAULT_THEME).then(function () { return state; });
    });
    state.ready.catch(function () {}); // the applier reports it; not an unhandled rejection here
    return state;
  }

  var doc = global.document;
  var script = doc.currentScript;
  var base = script && script.src ? new URL('..', script.src).href : '';
  var hostTheme = readHostTheme(global);
  var storage = null;
  if (hostTheme === undefined) {
    try { storage = global.localStorage; } catch (e) { storage = null; }
  }

  global.msThemePrePaint = {
    STYLESHEETS: STYLESHEETS,
    DEFAULT_THEME: DEFAULT_THEME,
    HOST_GLOBAL: HOST_GLOBAL,
    themeIdOf: themeIdOf,
    readStoredTheme: readStoredTheme,
    readHostTheme: readHostTheme,
    boot: boot,
  };
  global.msThemeBoot = boot({ doc: doc, storage: storage, hostTheme: hostTheme, base: base });
})(globalThis);
