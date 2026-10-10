// Page-side generation client: sends a request to the generation worker (js/generation/worker.js)
// and hands back its reply. Imports no generation code, so generation never runs on the main thread.
//
// createGenerationClient({ createWorker }) → { request, cancel }; one client per game.
//   request(req) → Promise of the worker's result: generate()'s result, or a failure
//                  { ok: false, reason, ... } (see worker.js). Rejects only when the worker itself
//                  fails (load error, unexpected exception, a reply the page cannot decode); a
//                  worker failure other than an error reply also drops the worker, so the next
//                  request starts a fresh one. One request is in flight at a time:
//                  a new request cancels the one in flight.
//   cancel()     → the request in flight, if any, resolves { ok: false, cancelled: true,
//                  reason: 'cancelled' } and never delivers its result. The worker is terminated,
//                  so its work stops too; the next request starts a fresh one.
// createWorker defaults to createModuleWorker; tests pass a fake with postMessage, terminate,
// onmessage, onerror and onmessageerror.

export function createModuleWorker() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

export function createGenerationClient({ createWorker = createModuleWorker } = {}) {
  let worker = null;
  let nextId = 1;
  let inFlight = null; // { id, resolve, reject }

  function dropWorker() {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  }

  function settle() {
    const pending = inFlight;
    inFlight = null;
    return pending;
  }

  function fail(message) {
    const pending = settle();
    dropWorker();
    pending?.reject(new Error(message));
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = createWorker();
    worker.onmessage = (event) => {
      const { id, result, error } = event.data ?? {};
      if (!inFlight || id !== inFlight.id) return;
      const pending = settle();
      if (error !== undefined) pending.reject(new Error(error));
      else pending.resolve(result);
    };
    worker.onerror = (event) => {
      event?.preventDefault?.();
      fail(event?.message || 'generation worker failed');
    };
    worker.onmessageerror = () => fail('generation worker reply could not be decoded');
    return worker;
  }

  function cancel() {
    const pending = settle();
    dropWorker();
    pending?.resolve({ ok: false, cancelled: true, reason: 'cancelled' });
  }

  function request(req) {
    if (inFlight) cancel();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      inFlight = { id, resolve, reject };
      ensureWorker().postMessage({ id, request: req });
    });
  }

  return { request, cancel };
}
