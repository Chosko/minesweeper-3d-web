// Settings appliers: each setting's effect, applied by its owner subscribing to the settings store
// (js/settings/store.js). The store knows none of them; each applier is handed the store and its
// owner, and returns its unsubscribe. Every subscription fires once with the loaded value, so no
// applier reads the store separately at start-up. DOM-free: the browser is reached only through the
// owners handed in.
//
// pixelRatioFor(resolution, devicePixelRatio, cells) → the 3D renderer's pixel ratio:
//   auto   the adaptive cap — at most 2, 1.5 above 20³ cells, 1 above 50³;
//   sharp  the full device pixel ratio;
//   fast   1.
// applyTheme(store, theme)          theme.setTheme(value) — the theme applier (globalThis.msTheme).
// applyAudio(store, sfx)            sfx.setVolume(v), sfx.setMuted(m) — the sound module.
// applyLook(store, camera)          camera.sensitivity, camera.invertY — the 3D camera.
// applyResolution(store, apply)     apply(resolution) — the 3D renderer's owner re-derives its ratio.
// applyFullscreen(store, { doc, enter, exit })
//   Setting fullscreen calls enter() or exit() at once, inside the gesture that set it, when the
//   browser is not already in that state. The store follows the browser: on doc's
//   `fullscreenchange`, and when enter() or exit() throws or rejects, it is set to whether
//   doc.fullscreenElement is set.
// applySettings(store, { theme?, sfx?, camera?, resolution?, fullscreen? }) — every owner given;
//   returns one unsubscribe for all of them.

export function pixelRatioFor(resolution, devicePixelRatio, cells) {
  const dpr = devicePixelRatio || 1;
  if (resolution === 'sharp') return dpr;
  if (resolution === 'fast') return 1;
  const cap = cells > 50 ** 3 ? 1 : cells > 20 ** 3 ? 1.5 : 2;
  return Math.min(dpr, cap);
}

const all = (offs) => () => { for (const off of offs) off(); };

export function applyTheme(store, theme) {
  return store.onChange('theme', (value) => theme.setTheme(value));
}

export function applyAudio(store, sfx) {
  return all([
    store.onChange('volume', (v) => sfx.setVolume(v)),
    store.onChange('muted', (m) => sfx.setMuted(m)),
  ]);
}

export function applyLook(store, camera) {
  return all([
    store.onChange('lookSensitivity', (v) => { camera.sensitivity = v; }),
    store.onChange('invertY', (v) => { camera.invertY = v; }),
  ]);
}

export function applyResolution(store, apply) {
  return store.onChange('renderResolution', (r) => apply(r));
}

export function applyFullscreen(store, { doc, enter, exit }) {
  const follow = () => { store.set('fullscreen', !!doc.fullscreenElement); };
  const off = store.onChange('fullscreen', (on) => {
    if (on === !!doc.fullscreenElement) return;
    let result;
    try { result = on ? enter() : exit(); } catch (e) { result = Promise.reject(e); }
    Promise.resolve(result).catch(follow);
  });
  doc.addEventListener('fullscreenchange', follow);
  return all([off, () => doc.removeEventListener('fullscreenchange', follow)]);
}

export function applySettings(store, { theme, sfx, camera, resolution, fullscreen } = {}) {
  const offs = [];
  if (theme) offs.push(applyTheme(store, theme));
  if (sfx) offs.push(applyAudio(store, sfx));
  if (camera) offs.push(applyLook(store, camera));
  if (resolution) offs.push(applyResolution(store, resolution));
  if (fullscreen) offs.push(applyFullscreen(store, fullscreen));
  return all(offs);
}
