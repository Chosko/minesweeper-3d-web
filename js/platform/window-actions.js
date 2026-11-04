// The desktop window, driven from the page: the frameless window the desktop host draws nothing of
// (desktop/window.js) takes its title bar, its moves and its size from the page. On the desktop
// host this marks every screen frame's title bar as the window's drag region — its buttons
// excepted, so they still press —, gives the title bar's Minimise and Fullscreen / Windowed their
// bridge actions (bindWindowButtons, js/ui/components.js, presses them), shows the Windowed icon
// on Fullscreen / Windowed while the window is full screen and the Fullscreen icon otherwise, from
// the host's fullscreen event, sizes the page's root area to the available area of the display the
// window is on — its work area while windowed, the whole screen in fullscreen (bindAvailableArea) —,
// settles the stylesheets' window-size media queries — the touch step's — against that area, so the
// desktop host never takes the phone layout (bindAreaMedia), and — windowed — makes the window the
// shown screen's frame, or a popup's alone while one shows over it: the frames laid out in the available area as everywhere, the page shifted so
// their box sits at the window's edges — the frame filling it taking the window's 8 px corners and
// its drop edge inside the window (WINDOW_EDGE) — and that box's size reported to the host on every screen change,
// every change of a frame's size and every theme switch, the whole available area during 3D play (bindScreenSize). With no host (the web build) it does nothing: the root area is the browser
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

const NONE = Object.freeze({ actions: Object.freeze({}), reportSize() {}, screenChanged() {}, dispose() {} });

/** The screens' frames: every screen's ui-frame and every card shown as a screen of its own. */
export const SCREEN_FRAMES = '.ui-frame, .ui-screen';

/** A layer shown over a screen (a popup): while a frame in it shows, that frame alone is the window. */
export const WINDOW_OVER = '[data-window-over]';

/** A card laid out inside the window it shows over: never measured, so it never sizes the window. */
export const WINDOW_INSIDE = '[data-window-inside]';

/** The mark on the frame that is the windowed window: the box the window is cut to is its own. */
export const WINDOW_EDGE = 'data-window-edge';

/**
 * Windowed, the frame that is the window takes the corners Windows 11 rounds the frameless window
 * to (8 px), over any theme's radius, so the frame's corners meet the window's.
 */
export const WINDOW_EDGE_CSS = `:root[data-window-state="windowed"] [${WINDOW_EDGE}] { border-radius: 8px !important; }\n`;

/**
 * The drop edge a computed `box-shadow` draws under its box, in CSS pixels: the longest outer shadow
 * that is hard (no blur) and straight down (no side offset), its offset plus its spread; 0 for none.
 * A blurred elevation is not the frame's and stays outside the window.
 */
export function dropEdgeOf(boxShadow) {
  let drop = 0;
  for (const shadow of String(boxShadow ?? '').split(/,(?![^(]*\))/)) {
    if (/\binset\b/.test(shadow)) continue;
    const [x = 0, y = 0, blur = 0, spread = 0] = shadow.replace(/\w+\([^)]*\)/g, '')
      .match(/-?\d*\.?\d+(?=px)/g)?.map(Number) ?? [];
    if (x === 0 && blur === 0 && y + spread > drop) drop = y + spread;
  }
  return drop;
}

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
 * The windowed window's size, from the screens of `document` laid out in the available area `area()`
 * ({ width, height }): while `fullArea()` holds (3D play) the whole area, else the box around the
 * shown screen frames (SCREEN_FRAMES) — only those in a layer over the screen (WINDOW_OVER) while one
 * shows, so a popup is the window alone, never the popup and the screen under it; a card inside the
 * window (WINDOW_INSIDE) is never measured. The root element is
 * shifted by that box's corner (`--window-x`, `--window-y`, which the stylesheet applies while
 * windowed), so the box sits at the window's edges, and `report(width, height)` gets its size. The
 * frame filling the box is marked as the window's edge (WINDOW_EDGE, its corners the window's) and
 * its drop edge (dropEdgeOf) is added under the box, so the window shows it; in 3D play no frame is
 * marked. Every frame is watched for a change of its size, and the root's `data-theme` for a theme
 * switch, which can change the drop edge alone. Nothing is measured before the first `screenChanged()`,
 * nor while `paused()` (fullscreen). Returns { measure(), screenChanged(), dispose() }.
 */
export function bindScreenSize(doc, { area, report, fullArea = () => false, paused = () => false }) {
  const root = doc.documentElement;
  const win = doc.defaultView;
  const Observer = win?.ResizeObserver;
  const observer = Observer && new Observer(() => measure());
  // A theme switch ends with the root's data-theme flipped: its frames' drop edge may change with no
  // change of their size.
  const Mutations = win?.MutationObserver;
  const themes = Mutations && new Mutations(() => measure());
  themes?.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const watched = new Set();
  let started = false;
  let shift = { x: 0, y: 0 };
  const setShift = (x, y) => {
    shift = { x, y };
    root.style.setProperty('--window-x', `${x}px`);
    root.style.setProperty('--window-y', `${y}px`);
  };
  function measure() {
    if (!started || paused()) return;
    const frames = [...doc.querySelectorAll(SCREEN_FRAMES)];
    if (fullArea()) {
      const { width, height } = area();
      for (const frame of frames) frame.toggleAttribute?.(WINDOW_EDGE, false);
      setShift(0, 0);
      report(width, height);
      return;
    }
    const shown = frames.filter((frame) => frame.getClientRects().length && !frame.closest?.(WINDOW_INSIDE));
    const over = shown.filter((frame) => frame.closest?.(WINDOW_OVER));
    const measured = (over.length ? over : shown).map((frame) => {
      const r = frame.getBoundingClientRect();
      const left = r.left + shift.x;
      const top = r.top + shift.y;
      return { frame, left, top, right: left + r.width, bottom: top + r.height };
    });
    if (!measured.length) return;
    const box = {
      left: Math.min(...measured.map((m) => m.left)), top: Math.min(...measured.map((m) => m.top)),
      right: Math.max(...measured.map((m) => m.right)), bottom: Math.max(...measured.map((m) => m.bottom)),
    };
    // The frame filling the box is the window's edge: its corners the window's, its drop edge inside it.
    const fills = (m) => ['left', 'top', 'right', 'bottom'].every((side) => Math.abs(m[side] - box[side]) < 1);
    let drop = 0;
    for (const frame of frames) {
      const edge = measured.some((m) => m.frame === frame && fills(m));
      frame.toggleAttribute?.(WINDOW_EDGE, edge);
      if (edge) drop = Math.max(drop, dropEdgeOf(win?.getComputedStyle?.(frame).boxShadow));
    }
    setShift(Math.round(box.left), Math.round(box.top));
    report(box.right - box.left, box.bottom - box.top + drop);
  }
  return {
    measure,
    screenChanged() {
      for (const frame of doc.querySelectorAll(SCREEN_FRAMES)) {
        if (watched.has(frame)) continue;
        watched.add(frame);
        observer?.observe(frame);
      }
      started = true;
      measure();
    },
    dispose() { observer?.disconnect(); themes?.disconnect(); watched.clear(); },
  };
}

/**
 * Binds the desktop window over the bridge `client` (null on the web) in `document`; `setIcon(button,
 * name)` redraws a button's icon (setButtonIcon, js/ui/components.js). `fullscreen` is the state
 * at start-up, read from the window's size when left out; `fullArea()` holds during 3D play, when the
 * window takes the whole available area. Returns { actions, reportSize(width, height),
 * screenChanged(), dispose() }: `actions` for bindWindowButtons, `reportSize` sending the content
 * size in whole pixels, rounded up, when it changed, `screenChanged` — after every screen change —
 * reporting the windowed window's size (bindScreenSize).
 */
export function bindWindowActions({ client, document: doc, setIcon, fullscreen = fillsScreen(doc?.defaultView), fullArea = () => false }) {
  if (!client) return NONE;

  doc.documentElement.dataset.host = 'desktop';
  const style = doc.createElement('style');
  style.textContent = DRAG_REGION_CSS + WINDOW_EDGE_CSS;
  doc.head.append(style);
  let full = fullscreen;
  let reported = null;
  let current = null;
  const reportSize = (width, height) => {
    const size = [Math.ceil(width), Math.ceil(height)];
    if (!size.every((side) => Number.isFinite(side) && side >= 1)) return;
    if (reported && reported[0] === size[0] && reported[1] === size[1]) return;
    reported = size;
    client.setContentSize(...size).catch(() => {});
  };
  const media = bindAreaMedia(doc);
  const frames = bindScreenSize(doc, { area: () => current, report: reportSize, fullArea, paused: () => full });
  const area = bindAvailableArea(doc, {
    fullscreen: () => full,
    onChange: (size) => { current = size; media.settle(size); frames.measure(); },
  });

  const showFullscreen = (on) => {
    full = on;
    doc.documentElement.dataset.windowState = on ? 'fullscreen' : 'windowed';
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

  return {
    actions: Object.freeze({ minimise: quiet(client.minimise), fullscreen: quiet(client.toggleFullscreen) }),
    reportSize,
    screenChanged: frames.screenChanged,
    dispose() { offFullscreen(); area.dispose(); media.dispose(); frames.dispose(); },
  };
}
