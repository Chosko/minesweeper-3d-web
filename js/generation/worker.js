// Generation worker: runs generate() off the main thread (module worker, no DOM).
//
// Protocol — plain structured-clone messages, one reply per request:
//   page → worker  { id, request }   request as generate() takes it (js/generation/generate.js)
//   worker → page  { id, result }    generate()'s result: { ok: true, ... } or the no-guess
//                                    budget failure { ok: false, reason, ... }; a malformed or
//                                    impossible request (generate throws RangeError) answers
//                                    { ok: false, rejected: true, reason, generatorVersion }
//                  { id, error }     any other exception — a bug, not a request problem
// The worker holds no state between requests: each reply is a function of its message alone.

import { generate } from './generate.js';
import { GENERATOR_VERSION } from './placer.js';

// handleMessage({ id, request }) → the reply message for one request.
export function handleMessage({ id, request } = {}) {
  try {
    return { id, result: generate(request) };
  } catch (err) {
    if (err instanceof RangeError) {
      return { id, result: { ok: false, rejected: true, reason: err.message, generatorVersion: GENERATOR_VERSION } };
    }
    return { id, error: String(err?.message ?? err) };
  }
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = (event) => globalThis.postMessage(handleMessage(event.data));
}
