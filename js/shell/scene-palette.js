// The 3D scene's themed palette: the sky gradient's three stops, which are also the fog colour and
// the clear colour. The shell reads them through the token reader and hands them to the renderer,
// which never reads tokens or subscribes to theme changes itself. The cube tiles, number colours,
// selection outline and end-of-game effects are not themed.

export const SCENE_TOKENS = {
  horizon: '--color-scene-horizon',
  zenith: '--color-scene-zenith',
  nadir: '--color-scene-nadir',
};

// The token reader's visible fallback colour, so an unreadable stop is noticed instead of blending in.
const UNREADABLE = [255, 0, 255];

/** A token value (`#rgb`, `#rrggbb`, `rgb()` or `rgba()`) as [r, g, b] channels 0–255; alpha is dropped. */
export function parseRgb(value) {
  const v = String(value).trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return [...UNREADABLE];
}

/** The active theme's scene palette, { horizon, zenith, nadir }, read through `token(name)`. */
export function scenePalette(token) {
  const out = {};
  for (const [stop, name] of Object.entries(SCENE_TOKENS)) out[stop] = parseRgb(token(name));
  return out;
}

/**
 * Hand the renderer the active theme's palette now and on every theme change; `onApplied` runs after
 * each hand-off (the shell requests a redraw there). Returns the unsubscribe.
 */
export function bindScenePalette({ token, onThemeChange, renderer, onApplied = () => {} }) {
  const apply = () => {
    renderer.setScenePalette(scenePalette(token));
    onApplied();
  };
  apply();
  return onThemeChange(apply);
}
