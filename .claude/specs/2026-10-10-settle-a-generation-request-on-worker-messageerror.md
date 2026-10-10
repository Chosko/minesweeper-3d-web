# Settle a generation request on worker messageerror

## Goal
A reply from the generation worker that the page cannot decode fires the
worker's `messageerror` event, and the client ignores it: the pending
`request()` promise waits until `cancel()` is called. The client handles
`messageerror` as the worker failure it is, settling the request in flight
exactly as its worker-`error` path does, and stays ready for the next request.

## Acceptance criteria
- `js/generation/client.js` installs an `onmessageerror` handler on the worker
  it creates; on `messageerror` the request in flight rejects with an `Error`.
- On `messageerror` the worker is dropped as on a worker `error`: its handlers
  are detached and it is terminated.
- After a `messageerror`, the next `request()` creates a fresh worker and
  resolves with its result.
- A `messageerror` with no request in flight throws nothing.
- `tests/generation-client.test.mjs`'s fake worker exposes `onmessageerror`
  and can emit `messageerror`; a new test covers the criteria above.
- The full suite (`node --test`) passes.

## Decisions
- The worker is dropped on `messageerror`, not kept: the prompt asks for the
  same settlement as a worker failure, and the `error` handler drops it.

## Hints
- js/generation/client.js (`ensureWorker`'s `onerror` handler, `dropWorker`, the header comment)
- tests/generation-client.test.mjs (`fakeWorkerFactory`, the "a worker error rejects" test)
- .claude/domain/features/board-generation.md (context)

## Drift
- `.claude/context/generation.md` § PUBLIC API (Client) — settles: "rejects only when the worker itself fails (load error, `error` reply)" now includes an undecodable reply (`messageerror`); the fake worker's listed fields gain `onmessageerror`.
- `.claude/context/testing.md` § `tests/generation-client.test.mjs` — settles: the client cases covered gain the `messageerror` case.
