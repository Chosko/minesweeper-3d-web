// The desktop window, driven from the page: the frameless window the desktop host draws nothing of
// (desktop/window.js) takes its title bar, its moves and its size from the page. On the desktop
// host this marks every screen frame's title bar as the window's drag region — its buttons
// excepted, so they still press —, gives the title bar's Minimise and Fullscreen / Windowed their
// bridge actions (bindWindowButtons, js/ui/components.js, presses them), shows the Windowed icon
// on Fullscreen / Windowed while the window is full screen and the Fullscreen icon otherwise, from
// the host's fullscreen event, and reports the content size the host sizes the window to. With no
// host (the web build) it does nothing. Quit is not the desktop window's: the title bar's Quit
// reaches the host through the feature that owns quitting.

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

  const showFullscreen = (on) => {
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
    dispose() { offFullscreen(); },
  };
}
