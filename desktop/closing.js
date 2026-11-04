// The closing sequence every quit path shares — closing the window, and the page's quit request:
// ask for a flush (the flush hook, bounded by a timeout), shut down (the shutdown hook), exit.
// The page bridge fills the hooks — the page's flush hand-shake and the Steam adapter's shutdown;
// with none it simply exits. It runs once, however often it is asked.

export const FLUSH_TIMEOUT_MS = 3000;

export function createClosing({ exit, timeoutMs = FLUSH_TIMEOUT_MS, onError = () => {} }) {
  let flushHook = null;
  let shutdownHook = null;
  let sequence = null;

  async function flush() {
    if (!flushHook) return;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(resolve, timeoutMs); });
    try {
      await Promise.race([Promise.resolve().then(flushHook), timeout]);
    } catch (error) {
      onError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  async function shutdown() {
    if (!shutdownHook) return;
    try {
      await shutdownHook();
    } catch (error) {
      onError(error);
    }
  }

  return {
    setFlushHook(hook) { flushHook = hook; },
    setShutdownHook(hook) { shutdownHook = hook; },
    get running() { return sequence !== null; },
    run() {
      sequence ??= (async () => {
        await flush();
        await shutdown();
        exit();
      })();
      return sequence;
    },
  };
}
