// The desktop window, driven from the page: the frameless window the desktop host draws nothing of
// (desktop/window.js) takes its title bar, its moves and its size from the page. On the desktop
// host this marks every screen frame's title bar as the window's drag region — its buttons
// excepted, so they still press —, gives the title bar's Minimise and Fullscreen / Windowed their
// bridge actions (bindWindowButtons, js/ui/components.js, presses them), shows the Windowed icon
// on Fullscreen / Windowed while the window is full screen and the Fullscreen icon otherwise, from
// the host's fullscreen event, sizes the page's root area to the available area of the display the
// window is on — its work area while windowed, the whole screen in fullscreen (bindAvailableArea) —,
// settles the stylesheets' window-size media queries — the touch step's — against that area, so the
// desktop host never takes the phone layout (bindAreaMedia), and reports the content size the host
// sizes the window to. With no host (the web build) it does nothing: the root area is the browser
// window and the touch step follows the window. Quit is not the desktop window's: the title bar's
// Quit reaches the host through the feature that owns quitting.

/** The Fullscreen / Windowed button's look in each window state. */
export const WINDOW_STATES = Object.freeze({
  windowed: Object.freeze({ icon: 'fullscreen', label: 'Fullscreen' }),
  fullscreen: Object.freeze({ icon: 'windowed', label: 'Windowed' }),
});

/** The title bar as the window's drag region, every control in it excepted. */
export const DRAG_REGION_CSS = '.ui-frame__head { -webkit-app-region: drag; }\n'
  + '.ui-frame__head :is(button, a, input, select, [tabindex]) { -webkit-app-region: no-drag; }\n';

const NONE = Object.freeze({ actions: Object.freeze({}), reportSize() {}, dispose() {} });

/** Whether the window fills its screen: a window opened full screen, before any fullscreen event. */
const fillsScreen = (win) => Boolean(win?.screen) && win.innerWidth >= win.screen.width && win.innerHeight >= win.screen.height;

/**
 * Sizes the root element of `document` to the available area of the display its window is on —
 * the work area (`screen.availWidth` × `screen.availHeight`) while windowed, the whole screen
 * (`screen.width` × `screen.height`) while `fullscreen()` holds — now and on every change of it
 * (the window moved to another display, the taskbar resized), so the layout reads the available
 * area, never the window's own size; `onChange({ width, height })` follows each sizing. Returns
 * { refresh() — after a change of the fullscreen state, dispose() }.
 */
export function bindAvailableArea(doc, { fullscreen = () => false, onChange = () => {} } = {}) {
  const win = doc.defaultView;
  const screen = win?.screen;
  if (!screen) return { refresh() {}, dispose() {} };
  const root = doc.documentElement;
  const apply = () => {
    const full = fullscreen();
    const size = { width: full ? screen.width : screen.availWidth, height: full ? screen.height : screen.availHeight };
    root.style.width = `${size.width}px`;
    root.style.height = `${size.height}px`;
    onChange(size);
  };
  apply();
  screen.addEventListener?.('change', apply);
  win.addEventListener?.('resize', apply);
  return {
    refresh: apply,
    dispose() {
      screen.removeEventListener?.('change', apply);
      win.removeEventListener?.('resize', apply);
    },
  };
}

const SIZE_FEATURE = /\(\s*(?:(min|max)-(width|height)\s*:\s*(\d+(?:\.\d+)?)px|orientation\s*:\s*(portrait|landscape))\s*\)/g;

/**
 * Whether the media query list `mediaText` holds for an area of `width` × `height` CSS pixels, when
 * every query in it is made only of `(min|max)-(width|height): <n>px` and `(orientation: …)`
 * features joined by `and` — the window-size queries the stylesheets keep, the touch step's; null
 * for any other list (a pointer or motion preference, a media type), which the area does not decide.
 */
export function areaMatches(mediaText, { width, height }) {
  const results = mediaText.split(',').map((query) => {
    const features = [...query.matchAll(SIZE_FEATURE)];
    if (!features.length || query.replace(SIZE_FEATURE, '').replace(/\band\b/g, '').trim()) return null;
    return features.every(([, bound, axis, px, orientation]) => {
      if (orientation) return (orientation === 'portrait') === (height >= width);
      const side = axis === 'width' ? width : height;
      return bound === 'min' ? side >= Number(px) : side <= Number(px);
    });
  });
  return results.includes(null) ? null : results.includes(true);
}

/**
 * Settles every window-size `@media` rule of `document`'s stylesheets (areaMatches) against an
 * area, so the window's own size never reaches them: each rule's query becomes `all` or `not all`,
 * its own text kept to settle again. A stylesheet added later (a theme switch) is settled once it
 * loads. Returns { settle({ width, height }), dispose() }; nothing is settled before the first
 * settle().
 */
export function bindAreaMedia(doc) {
  const queries = new WeakMap();
  let area = null;
  const settleSheet = (sheet) => {
    let rules;
    try { rules = sheet?.cssRules; } catch { return; } // a sheet the page may not read
    for (const rule of rules ?? []) {
      if (!rule.media || typeof rule.conditionText !== 'string') continue;
      const text = queries.get(rule) ?? rule.media.mediaText;
      const holds = areaMatches(text, area);
      if (holds === null) continue;
      queries.set(rule, text);
      rule.media.mediaText = holds ? 'all' : 'not all';
    }
  };
  const settleAll = () => { for (const sheet of doc.styleSheets ?? []) settleSheet(sheet); };
  const Observer = doc.defaultView?.MutationObserver;
  const observer = Observer && new Observer((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.localName === 'style') settleSheet(node.sheet);
        else if (node.localName === 'link') node.addEventListener('load', () => { if (area) settleSheet(node.sheet); }, { once: true });
      }
    }
  });
  observer?.observe(doc.head, { childList: true });
  return {
    settle(size) {
      area = size;
      settleAll();
    },
    dispose() { observer?.disconnect(); },
  };
}

/**
 * Binds the desktop window over the bridge `client` (null on the web) in `document`; `setIcon(button,
 * name)` redraws a button's icon (setButtonIcon, js/ui/components.js). `fullscreen` is the state
 * at start-up, read from the window's size when left out. Returns { actions, reportSize(width,
 * height), dispose() }: `actions` for bindWindowButtons, `reportSize` sending the content size in
 * whole pixels, rounded up, when it changed.
 */
export function bindWindowActions({ client, document: doc, setIcon, fullscreen = fillsScreen(doc?.defaultView) }) {
  if (!client) return NONE;

  doc.documentElement.dataset.host = 'desktop';
  const style = doc.createElement('style');
  style.textContent = DRAG_REGION_CSS;
  doc.head.append(style);
  let full = fullscreen;
  const media = bindAreaMedia(doc);
  const area = bindAvailableArea(doc, { fullscreen: () => full, onChange: media.settle });

  const showFullscreen = (on) => {
    full = on;
    area.refresh();
    const { icon, label } = on ? WINDOW_STATES.fullscreen : WINDOW_STATES.windowed;
    for (const button of doc.querySelectorAll('[data-window="fullscreen"]')) {
      button.setAttribute('data-icon', icon);
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      setIcon(button, icon);
    }
  };
  showFullscreen(fullscreen);
  const offFullscreen = client.on('fullscreenChanged', (on) => showFullscreen(on === true));

  const quiet = (request) => () => { request().catch(() => {}); };
  let reported = null;

  return {
    actions: Object.freeze({ minimise: quiet(client.minimise), fullscreen: quiet(client.toggleFullscreen) }),
    reportSize(width, height) {
      const size = [Math.ceil(width), Math.ceil(height)];
      if (!size.every((side) => Number.isFinite(side) && side >= 1)) return;
      if (reported && reported[0] === size[0] && reported[1] === size[1]) return;
      reported = size;
      client.setContentSize(...size).catch(() => {});
    },
    dispose() { offFullscreen(); area.dispose(); media.dispose(); },
  };
}
