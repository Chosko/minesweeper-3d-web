// Session-history mirror of the router's back stack: the browser's Back (and a mouse's back button,
// which the browser turns into a history back) steps back inside the game. DOM-free: the shell hands
// in the router, a history object (window.history) and the Back to run.
//
// Every entry of this page carries { ms3d: <page load>, depth } and the same URL: state only, so no
// deep link to an inner screen exists, the deploy's 404 redirect is untouched and a reload opens the
// main menu. The main menu's entry is the base, depth 0; each stacked screen above it is one entry,
// so the history depth above the menu equals the router's stack depth after every change.
//
// - A change that stacks a screen pushes an entry; a replace (or a new screen at the same depth)
//   replaces the current one; an in-app Back or an unwind consumes the matching entries with
//   history.go(-n). While such a traversal is in flight, nothing is pushed until it lands.
// - A popstate onto a lower entry of this page load is the browser's Back: onBack() runs once, as Esc
//   would, then the entries are re-synced to the stack, which restores the consumed entry when that
//   Back kept the screen where it is (the board pausing pushes one more).
// - A popstate onto a higher entry is a browser Forward: it is undone, and shows nothing.
// - A load onto an entry of this page (a reload, or a return through the history after the page was
//   dropped) opens the main menu there as the new base, and that earlier load is superseded: its
//   entries are walked past — the page goes back past all of them, to the page before it — whether
//   they come back as a popstate or as a page load onto one of them.
// - From the base (the main menu, stack empty) the browser's Back leaves the page.

export const HISTORY_KEY = 'ms3d';

const newSession = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** An in-memory set of superseded page loads, for a tab that keeps none. */
function memorySet() {
  const ids = new Set();
  return { has: (id) => ids.has(id), add: (id) => { ids.add(id); } };
}

/**
 * A set of page loads kept in a tab's session storage (`getStorage()` → sessionStorage), the newest
 * `limit` only; unusable storage reads as empty and writes nothing.
 */
export function storedSet(getStorage, key, limit = 50) {
  const read = () => {
    try {
      const v = JSON.parse(getStorage().getItem(key) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch { return []; }
  };
  return {
    has: (id) => read().includes(id),
    add(id) {
      try { getStorage().setItem(key, JSON.stringify([...read().filter((x) => x !== id), id].slice(-limit))); } catch { /* kept nowhere */ }
    },
  };
}

/**
 * router: { current, stack } (js/shell/router.js); history: { state, pushState, replaceState, go };
 * onBack(): the shell's Back for the browser's Back input; superseded: { has(id), add(id) }, the
 * tab's superseded page loads (storedSet over sessionStorage in the shell).
 * → { start(navigationType), sync(), popstate(state), depth, pending }
 */
export function createHistorySync({ router, history, onBack, session = newSession(), superseded = memorySet() }) {
  let started = false;
  let leaving = false;
  let depth = 0; // the current entry's depth, as this page stamped it
  let pending = null; // the depth a history.go of ours lands on
  let shown = null; // the screen the current entry stands for

  const stamp = (d) => ({ [HISTORY_KEY]: session, depth: d });
  const stamped = (s) => !!s && typeof s === 'object' && typeof s[HISTORY_KEY] === 'string' && Number.isInteger(s.depth) && s.depth >= 0;
  const ours = (s) => stamped(s) && s[HISTORY_KEY] === session;

  /** Traverse from the entry at depth `from` to the one at depth `to`; the popstate it brings is ours. */
  const travel = (from, to) => {
    pending = to;
    depth = to;
    history.go(to - from);
  };
  /** Leave past a superseded load's entry at depth d: its entries below it, then the page before them. */
  const walkOut = (d) => {
    leaving = true;
    history.go(-(d + 1));
  };

  const sync = {
    get depth() { return depth; },
    get pending() { return pending; },
    /**
     * Stamp the current entry as the base, superseding the load it belonged to; a history load onto
     * an entry of a superseded load walks out instead (false). `navigationType` is the page load's
     * ('navigate', 'reload', 'back_forward').
     */
    start(navigationType) {
      started = true;
      const s = history.state;
      if (stamped(s)) {
        if (navigationType === 'back_forward' && superseded.has(s[HISTORY_KEY])) { walkOut(s.depth); return false; }
        superseded.add(s[HISTORY_KEY]);
      }
      history.replaceState(stamp(0), '');
      depth = 0;
      return true;
    },
    /** Bring the entries in step with the router's stack; called on every router change. */
    sync() {
      if (!started || leaving || pending !== null) return;
      const want = router.stack.length;
      if (want > depth) {
        while (depth < want) history.pushState(stamp(++depth), '');
      } else if (want < depth) {
        travel(depth, want);
        return;
      } else if (router.current !== shown) {
        history.replaceState(stamp(depth), '');
      }
      shown = router.current;
    },
    /** The window's popstate, with the entry's state. */
    popstate(state) {
      if (!started || leaving) return;
      if (pending !== null) {
        const landed = ours(state) && state.depth === pending;
        pending = null;
        if (landed) { sync.sync(); return; }
      }
      if (!ours(state)) {
        if (stamped(state)) walkOut(state.depth);
        return;
      }
      if (state.depth > depth) { travel(state.depth, depth); return; } // Forward: undone
      if (state.depth === depth) return;
      depth = state.depth;
      onBack();
      sync.sync();
    },
  };
  return sync;
}
