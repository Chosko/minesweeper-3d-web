// Screen router: the one owner of which shell screen is showing and of the back stack.
// DOM-free: each screen's show/hide and the focus hand-off are injected by the shell.

/** The screens of the game shell (game-shell feature). A shell registers the ones it has. */
export const SHELL_SCREENS = Object.freeze(['menu', 'board-choice', 'playing', 'paused', 'results', 'records', 'settings']);

/**
 * screens: { [name]: { show(data, from), hide?(to), defaultFocus?: string | null | (() => string | null),
 *                      back?({ router, source }) } }
 * focus(target, name): hands focus to the screen's default target (null when it declares none).
 * onChange({ from, to }): after every change, the screen already shown and focused.
 */
export function createRouter({ screens, focus = () => {}, onChange = () => {} } = {}) {
  let current = null;
  let stack = [];

  const decl = (name) => {
    const s = Object.hasOwn(screens, name) ? screens[name] : null;
    if (!s) throw new Error(`unknown screen "${name}"`);
    return s;
  };
  const defaultFocus = (name = current) => {
    if (name === null) return null;
    const f = decl(name).defaultFocus;
    return (typeof f === 'function' ? f() : f) ?? null;
  };

  const router = {
    get current() { return current; },
    get stack() { return stack.slice(); },
    has: (name) => Object.hasOwn(screens, name),
    defaultFocus,
    /**
     * Show `name`. A screen already on the stack unwinds the stack to it (going back there);
     * otherwise the current screen is stacked, unless `replace`.
     */
    go(name, { data, replace = false } = {}) {
      const next = decl(name);
      const from = current;
      if (name !== from) {
        const at = stack.indexOf(name);
        if (at >= 0) stack = stack.slice(0, at);
        else if (from !== null && !replace) stack.push(from);
        if (from !== null) decl(from).hide?.(name);
      }
      current = name;
      next.show?.(data, from);
      focus(defaultFocus(name), name);
      onChange({ from, to: name });
      return router;
    },
    /** Resolve Back: the screen's own back, else the screen it came from. False when there is nowhere to go. */
    back(source = 'key') {
      if (current === null) return false;
      const own = decl(current).back;
      if (own) { own({ router, source }); return true; }
      if (!stack.length) return false;
      router.go(stack[stack.length - 1]);
      return true;
    },
    /** Focus the current screen's default target again. */
    refocus() { if (current !== null) focus(defaultFocus(current), current); },
  };
  return router;
}
