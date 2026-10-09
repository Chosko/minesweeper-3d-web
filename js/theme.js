/* Theme applier. A classic (non-module) script loaded from index.html ahead of
   the stylesheets and the module graph, so the root data-theme attribute is
   set before first paint. Exposes globalThis.msTheme:
     current() -> 'light' | 'dark'
     setTheme(theme)  — unknown values are Light, never thrown
     onChange(listener) -> unsubscribe; fires after the attribute changes
     createThemeApplier(opts) — the factory, for tests
   This feature reads the theme preference and never writes it. */
(function (global) {
  'use strict';

  var THEMES = ['light', 'dark'];
  var FALLBACK = 'light';

  function normalize(value) {
    return THEMES.indexOf(value) >= 0 ? value : FALLBACK;
  }

  // The stored-theme getter. It reads nothing until the settings feature
  // wires its stored value in here, so start-up applies Light.
  function readStoredTheme() {
    return null;
  }

  function createThemeApplier(opts) {
    var root = opts.root;
    var readStored = opts.readStored || readStoredTheme;
    var onError = opts.onError || function (e) { if (global.console) global.console.error(e); };
    var listeners = [];

    function current() {
      return normalize(root.getAttribute('data-theme'));
    }

    function write(theme) {
      root.setAttribute('data-theme', theme);
    }

    function apply() {
      var stored = null;
      try { stored = readStored(); } catch (e) { stored = null; }
      write(normalize(stored));
    }

    function setTheme(theme) {
      var next = normalize(theme);
      if (root.getAttribute('data-theme') === next) return;
      write(next);
      listeners.slice().forEach(function (listener) {
        try { listener(next); } catch (e) { onError(e); }
      });
    }

    function onChange(listener) {
      listeners.push(listener);
      return function () {
        var i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    return { apply: apply, current: current, setTheme: setTheme, onChange: onChange };
  }

  var applier = createThemeApplier({ root: global.document.documentElement });
  applier.apply();

  global.msTheme = {
    current: applier.current,
    setTheme: applier.setTheme,
    onChange: applier.onChange,
    createThemeApplier: createThemeApplier,
  };
})(globalThis);
