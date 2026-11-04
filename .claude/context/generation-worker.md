# Generation — the worker, the page-side client and pre-generation

## OVERVIEW

How the page gets a no-guess board without blocking: the module worker that
runs `generate()`, and the page-side client each mode keeps — one request in
flight, cancellation, warm-up, progress and `pregenerate`. The generator
itself, the solver and the no-guess loop are
[generation.md](generation.md)'s. The client is DOM-free apart from its
`new Worker`.

| File | Responsibility |
| --- | --- |
| `js/generation/worker.js` | the module worker and its message handler |
| `js/generation/client.js` | the page-side client: one request in flight, cancellation, warm-up, progress, `pregenerate` |

## PUBLIC API

- Worker protocol (structured-clone, one reply per request): page → worker
  `{ id, request }` or `{ id, warm: true }`; worker → page `{ id, progress }`
  (no-guess, before the result), `{ id, result }` (a rejected request answers
  `{ ok: false, rejected: true, reason, generatorVersion }`), `{ id, error }`
  (a bug, not a request problem). `handleMessage(message, post?, { now? })`
  is importable in Node; `onmessage` is installed only in a
  `WorkerGlobalScope`.
- `createGenerationClient({ createWorker? })` → `{ request, cancel, warm }`,
  one per mode; tests pass a fake worker. `request(req, { onProgress? })`
  resolves with the worker's result, success or failure alike, and rejects
  only when the worker itself fails. `cancel()` resolves the request in
  flight `{ ok: false, cancelled: true, reason: 'cancelled' }`. `warm()` →
  true once the worker answered its warm-up.
- `pregenerate(client, request)` → `{ cell, seed, request, promise,
  settled, result, listen(fn), discard() }`: the board a session takes over
  on its marked start cell; a worker failure resolves `{ ok: false, reason
  }`.

## INTERNAL PATTERNS

- **Worker is stateless.** Each reply is a function of its message alone; a
  rejected request is a result message, never a throw.
- **Client imports no generation code.** Replies are matched by `id`; a late
  reply or progress for a superseded or cancelled id is dropped. A new
  request cancels the one in flight. Cancellation terminates the worker
  rather than interrupting the synchronous `generate()`, and a worker
  `error` or `messageerror` detaches it too, so the next request or warm-up
  starts a fresh one.

## DOMAIN DEPENDENCIES

- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — timing, failure and cancel contracts.

## CROSS-REFERENCES

- [generation.md](generation.md) — the request the worker runs, the result
  it answers, the marked start cell `pregenerate` uses.
- [classic2d-session.md](classic2d-session.md), [mode3d-session.md](mode3d-session.md) — the sessions'
  board requests, generating state and failure offer.
- [app-shell-daily.md](app-shell-daily.md) — today's daily boards
  pre-generated through each mode's client.
- [testing-files.md](testing-files.md) — `tests/generation-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Wiring the client into a game: `client.js` for the in-flight and cancel
  semantics beyond the API above.
