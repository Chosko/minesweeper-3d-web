// Page-side generation client: sends a request to the generation worker (js/generation/worker.js)
// and hands back its reply. It imports no generation code: the worker runs generate() for the
// no-guess boards the page asks it for, and the game sessions place standard boards themselves, on
// the main thread, with the same generate() (js/classic2d/session.js, js/mode3d/session.js).
//
// createGenerationClient({ createWorker }) → { request, cancel, warm }; one per mode, kept for the
// page and shared by its games.
//   request(req, { onProgress }?) → Promise of the worker's result: generate()'s result, or a
//                  failure { ok: false, reason, ... } (see worker.js). Rejects only when the worker
//                  itself fails (load error, unexpected exception, a reply the page cannot decode); a
//                  worker failure other than an error reply also drops the worker, so the next
//                  request starts a fresh one. One request is in flight at a time:
//                  a new request cancels the one in flight. onProgress({ candidates }) hears the
//                  worker's progress messages for this request only; progress for a superseded or
//                  cancelled id is dropped like a late reply.
//   cancel()     → the request in flight, if any, resolves { ok: false, cancelled: true,
//                  reason: 'cancelled' } and never delivers its result. The worker is terminated,
//                  so its work stops too; the next request or warm-up starts a fresh one.
//   warm()       → Promise of true once the worker is spawned, its module loaded and a no-op
//                  warm-up message answered (false when the worker failed); a worker already warm
//                  or warming is not asked again. The warm-up is not a board request and never
//                  delivers a board.
// createWorker defaults to createModuleWorker; tests pass a fake with postMessage, terminate,
// onmessage, onerror and onmessageerror.

export function createModuleWorker() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

export function createGenerationClient({ createWorker = createModuleWorker } = {}) {
  let worker = null;
  let nextId = 1;
  let inFlight = null; // { id, resolve, reject, onProgress }
  let warming = null; // { id, promise, resolve } for the current worker

  function dropWorker() {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
    const w = warming;
    warming = null;
    w?.resolve(false);
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
      const { id, result, error, progress, warm } = event.data ?? {};
      if (warm) {
        if (warming && id === warming.id) warming.resolve(true);
        return;
      }
      if (!inFlight || id !== inFlight.id) return;
      if (progress !== undefined) {
        try { inFlight.onProgress?.(progress); } catch (err) { console.error(err); }
        return;
      }
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

  function request(req, { onProgress } = {}) {
    if (inFlight) cancel();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      inFlight = { id, resolve, reject, onProgress };
      ensureWorker().postMessage({ id, request: req });
    });
  }

  function warm() {
    if (warming) return warming.promise;
    const w = ensureWorker();
    const id = nextId++;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    warming = { id, promise, resolve };
    w.postMessage({ id, warm: true });
    return promise;
  }

  return { request, cancel, warm };
}

// pregenerate(client, request) → a board asked for ahead of its first click (the mode's background
// generation for a marked start cell, js/generation/start-cell.js), for a game session to take over:
//   cell, seed, request   the request's first-click cell and seed, and the request itself
//   promise               Promise of the worker's result; a worker failure resolves as a failure
//                         { ok: false, reason }, never a rejection
//   settled, result       whether it has arrived, and what (undefined before)
//   listen(fn)            fn({ candidates }) hears the request's progress from now on
//   discard()             let it go: a request still in flight is cancelled through the client
// It is the client's one request in flight: a later request on the same client supersedes it.
export function pregenerate(client, request) {
  let listener = null;
  let settled = false;
  let result;
  let discarded = false;
  const promise = client.request(request, { onProgress: (p) => listener?.(p) })
    .catch((error) => ({ ok: false, reason: error?.message || String(error) }))
    .then((r) => { settled = true; result = r; return r; });
  return {
    cell: request.firstClick,
    seed: request.seed,
    request,
    promise,
    get settled() { return settled; },
    get result() { return result; },
    listen(fn) { listener = fn; },
    discard() {
      if (discarded) return;
      discarded = true;
      listener = null;
      if (!settled) client.cancel();
    },
  };
}
