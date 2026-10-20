// The run-time theme applier. It takes over from the pre-paint script js/theme.js (its start-up
// state, globalThis.msThemeBoot), imports the active theme's board module and hands it to its
// subscribers — no renderer imports a theme directly — and switches themes with no unstyled or
// half-applied frame: the new stylesheet, board module and fonts load first, and only then does the
// root attribute flip and the old stylesheet go; the fonts load once more, since removing a
// stylesheet unloads every @font-face face in Chromium, and only then do the subscribers hear of it.
//
// createThemeApplier({ doc, boot, base?, importModule?, lookup?, onError? }) →
//   current()                 the active theme id
//   board()                   the active theme's board module (null until start-up imports it)
//   start({ notice? })        resolves with the active id once its board module and fonts are in;
//                             a non-default theme that fails falls back to the default and tells
//                             the player once through `notice(text)`; rejects when the default
//                             fails (the caller shows the fatal card)
//   setTheme(value)           resolves with the active id once fully applied; light, dark and an
//                             unknown id are the default; rejects with the previous theme still
//                             active when a file fails, and tells the player once
//   onThemeChange(listener)   listener(id, boardModule) after each switch and after start-up;
//                             returns the unsubscribe; a throwing listener does not stop the others
// themeApplier() — the page's one applier, made on first use.
import { DEFAULT_THEME_ID, themeById } from './registry.js';

const RETIRED = { light: DEFAULT_THEME_ID, dark: DEFAULT_THEME_ID };

export const SITE_ROOT = new URL('../../', import.meta.url).href;

export const START_FALLBACK = `The saved theme could not be loaded — showing ${themeById(DEFAULT_THEME_ID).name} instead.`;
export const SWITCH_FAILED = 'That theme could not be loaded — the current theme stays.';

/** The registered theme a stored or requested value applies: light, dark and unknown ids are the default. */
export function themeIdFor(value, lookup = themeById) {
  return lookup(Object.hasOwn(RETIRED, String(value)) ? RETIRED[value] : value).id;
}

function whenLoaded(link) {
  return new Promise((resolve, reject) => {
    link.addEventListener('load', () => resolve(link));
    link.addEventListener('error', () => reject(new Error(`Theme stylesheet failed to load: ${link.href}`)));
  });
}

export function createThemeApplier({
  doc,
  boot = null,
  base = SITE_ROOT,
  importModule = (url) => import(url),
  lookup = themeById,
  onError = (e) => console.error(e),
}) {
  const root = doc.documentElement;
  const listeners = [];
  let active = boot?.id ?? DEFAULT_THEME_ID;
  let activeLink = boot?.link ?? null;
  let board = null;
  let notice = () => {};
  let started = null;
  let queue = Promise.resolve();
  // The theme start-up fell back from: the settings store applies the stored value once at load,
  // and the player has already been told.
  let fellBackFrom = null;

  const url = (path) => new URL(path, base).href;

  function remove(link) {
    if (link?.parentNode) link.parentNode.removeChild(link);
  }

  function emit() {
    for (const listener of listeners.slice()) {
      try { listener(active, board); } catch (e) { onError(e); }
    }
  }

  // Every font file `entry` declares, loaded.
  function loadFonts(entry) {
    const specs = entry.fonts.flatMap((f) => f.files.map((file) => `${file.style} ${file.weight} 1em "${f.family}"`));
    return Promise.all(specs.map((spec) => doc.fonts.load(spec)));
  }

  // The board module and the fonts of `entry`, loaded.
  async function prepare(entry) {
    const mod = await importModule(url(entry.boardModule));
    await loadFonts(entry);
    return mod;
  }

  async function switchTo(entry) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-theme-sheet', entry.id);
    link.href = url(entry.stylesheet);
    doc.head.appendChild(link);
    let mod;
    try {
      await whenLoaded(link);
      mod = await prepare(entry);
    } catch (e) {
      remove(link);
      throw e;
    }
    root.setAttribute('data-theme', entry.id);
    remove(activeLink);
    activeLink = link;
    active = entry.id;
    board = mod;
    // A stylesheet leaving the page makes Chromium rebuild every @font-face face, the new theme's
    // too, unloaded: load them again (from the cache) before anyone hears of the switch. The theme
    // is applied by now, so a failure here is reported, not undone.
    try { await loadFonts(entry); } catch (e) { onError(e); }
    emit();
  }

  function start(opts = {}) {
    if (opts.notice) notice = opts.notice;
    if (started) return started;
    const ready = boot?.ready ?? Promise.resolve({ id: active, link: activeLink, fellBackFrom: null });
    started = (async () => {
      const state = await ready;
      active = state.id;
      activeLink = state.link;
      fellBackFrom = state.fellBackFrom;
      try {
        board = await prepare(lookup(active));
      } catch (e) {
        if (active === DEFAULT_THEME_ID) throw e;
        fellBackFrom = active;
        await switchTo(lookup(DEFAULT_THEME_ID));
        notice(START_FALLBACK);
        return active;
      }
      if (fellBackFrom) notice(START_FALLBACK);
      emit();
      return active;
    })();
    queue = started;
    return started;
  }

  function setTheme(value) {
    const id = themeIdFor(value, lookup);
    const run = queue.catch(() => {}).then(async () => {
      const skip = fellBackFrom;
      fellBackFrom = null;
      if (id === active || id === skip) return active;
      try {
        await switchTo(lookup(id));
      } catch (e) {
        notice(SWITCH_FAILED);
        throw e;
      }
      return active;
    });
    queue = run;
    return run;
  }

  function onThemeChange(listener) {
    listeners.push(listener);
    return () => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return { current: () => active, board: () => board, start, setTheme, onThemeChange };
}

let shared = null;

export function themeApplier() {
  if (!shared) shared = createThemeApplier({ doc: globalThis.document, boot: globalThis.msThemeBoot ?? null });
  return shared;
}
