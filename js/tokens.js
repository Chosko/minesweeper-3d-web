// Token reader for consumers that cannot read stylesheet values directly —
// chiefly Canvas renderers. Values come from the token sheet's computed
// values on the document root (css/tokens.css); this module holds no copy of
// them. Theme changes come from the theme applier (js/theme.js, msTheme).
// The 3D renderer never reads tokens or subscribes to theme changes.

// Visible on screen, so a missing token is noticed instead of failing silently.
export const FALLBACK_COLOR = '#ff00ff';

export function createTokenReader({ root, getStyle, theme, dev = false, log = console.warn }) {
  const warned = new Set();

  function token(name) {
    const key = String(name);
    const prop = key.startsWith('--') ? key : `--${key}`;
    const value = getStyle(root).getPropertyValue(prop).trim();
    if (value) return value;
    if (dev && !warned.has(prop)) {
      warned.add(prop);
      log(`[tokens] unknown token "${prop}", using ${FALLBACK_COLOR}`);
    }
    return FALLBACK_COLOR;
  }

  // listener(theme) runs after the root attribute changes; returns an unsubscribe.
  function onThemeChange(listener) {
    return theme.onChange(listener);
  }

  return { token, onThemeChange };
}

let browserReader = null;

function reader() {
  if (!browserReader) {
    const host = globalThis.location ? globalThis.location.hostname : '';
    browserReader = createTokenReader({
      root: document.documentElement,
      getStyle: (el) => getComputedStyle(el),
      theme: globalThis.msTheme,
      dev: /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(host),
    });
  }
  return browserReader;
}

export const token = (name) => reader().token(name);
export const onThemeChange = (listener) => reader().onThemeChange(listener);
