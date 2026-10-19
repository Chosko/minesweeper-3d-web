/* Theme applier. A classic (non-module) script loaded from index.html ahead of
   the stylesheets and the module graph, so the root data-theme attribute is
   set before first paint. The game has one look, Joyful tiles
   (themes/joyful-tiles/theme.css, linked by the page): the root carries its id
   whatever theme the settings document holds. Exposes globalThis.msTheme:
     current() -> 'joyful-tiles'
     setTheme(theme) — changes nothing, never throws
     onChange(listener) -> unsubscribe
     createThemeApplier(opts) — the factory, for tests */
(function (global) {
  'use strict';

  var THEME = 'joyful-tiles';

  function createThemeApplier(opts) {
    var root = opts.root;
    var listeners = [];

    function apply() {
      root.setAttribute('data-theme', THEME);
    }

    function current() {
      return THEME;
    }

    function setTheme() {}

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
