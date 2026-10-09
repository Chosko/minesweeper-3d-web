import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate } from '../js/generation/generate.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { handleMessage } from '../js/generation/worker.js';
import { createGenerationClient, createModuleWorker } from '../js/generation/client.js';

const square = (width, height) => ({ kind: 'square', width, height });
const plain = (r) => ({ ...r, mines: r.mines ? [...r.mines] : r.mines });

// A fake Web Worker: records posted messages, answers through handleMessage after a macrotask
// (structuredClone stands in for the message channel), and can be held back to test ordering.
function fakeWorkerFactory({ hold = false } = {}) {
  const workers = [];
  const create = () => {
    const w = {
      posted: [],
      terminated: false,
      onmessage: null,
      onerror: null,
      pending: [],
      postMessage(data) {
        const msg = structuredClone(data);
        w.posted.push(msg);
        if (hold) w.pending.push(msg);
        else setTimeout(() => w.answer(msg), 0);
      },
      answer(msg) {
        if (w.terminated) return;
        w.onmessage?.({ data: structuredClone(handleMessage(msg)) });
      },
      flush() {
        for (const msg of w.pending.splice(0)) w.answer(msg);
      },
      fail(message) {
        w.onerror?.({ message, preventDefault() {} });
      },
      terminate() { w.terminated = true; },
    };
    workers.push(w);
    return w;
  };
  return { create, workers };
}


// ---------- the worker's message handler ----------

test('worker: a request message answers with generate\'s result for the same id', () => {
  const request = { graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: true, seed: 2026 };
  const reply = handleMessage({ id: 7, request });
  assert.equal(reply.id, 7);
  assert.deepEqual(plain(reply.result), plain(generate(request)));
});

test('worker: determinism — handler and Node generate agree over many requests', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const request = { graph: square(16, 16), mineCount: 40, firstClick: seed % 256, noGuess: seed % 2 === 0, seed };
    assert.deepEqual(plain(handleMessage({ id: seed, request }).result), plain(generate(request)));
  }
});

test('worker: messages are structured-clone plain data both ways', () => {
  const request = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 5 };
  const msg = { id: 1, request };
  assert.deepEqual(structuredClone(msg), msg);
  const reply = handleMessage(structuredClone(msg));
  const cloned = structuredClone(reply);
  assert.ok(cloned.result.mines instanceof Int32Array);
  assert.deepEqual(plain(cloned.result), plain(reply.result));
});

test('worker: a malformed or impossible request is a failure message with a reason, never a throw', () => {
  const cases = [
    { graph: square(3, 3), mineCount: 9, firstClick: 0, noGuess: false, seed: 1 },
    { graph: { kind: 'box', x: 2, y: 2, z: 2 }, mineCount: 1, firstClick: 0, noGuess: false, seed: 1 },
    { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: 'yes', seed: 1 },
    undefined,
  ];
  for (const request of cases) {
    const reply = handleMessage({ id: 3, request });
    assert.equal(reply.id, 3);
    assert.equal(reply.result.ok, false);
    assert.equal(reply.result.rejected, true);
    assert.equal(typeof reply.result.reason, 'string');
    assert.ok(reply.result.reason.length > 0);
    assert.equal(reply.result.generatorVersion, GENERATOR_VERSION);
    assert.deepEqual(structuredClone(reply), reply);
  }
});

test('worker: an exhausted no-guess budget passes through as generate\'s failure', () => {
  // 3 x 3 with 7 mines: the first click's 1 safe neighbour can never be told apart by logic.
  const request = { graph: square(3, 3), mineCount: 7, firstClick: 4, noGuess: true, seed: 9 };
  const reply = handleMessage({ id: 2, request });
  assert.equal(reply.result.ok, false);
  assert.equal(reply.result.rejected, undefined);
  assert.deepEqual(plain(reply.result), plain(generate(request)));
});

test('worker: holds no state between requests — the same request answers the same after others', () => {
  const a = { graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: true, seed: 11 };
  const first = plain(handleMessage({ id: 1, request: a }).result);
  handleMessage({ id: 2, request: { ...a, seed: 12 } });
  handleMessage({ id: 3, request: { ...a, mineCount: 99 } });
  assert.deepEqual(plain(handleMessage({ id: 4, request: a }).result), first);
});

test('worker: the module keeps no mutable top-level state and only listens inside a worker', () => {
  const src = readFileSync(new URL('../js/generation/worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*(let|var)\s/m, 'no top-level let/var');
  assert.match(src, /WorkerGlobalScope/, 'the listener is installed only in a worker global scope');
  assert.match(src, /from '\.\/generate\.js'/);
});

// ---------- the page-side client ----------

test('client: request resolves with the worker\'s result, same as generate in Node', async () => {
  const fake = fakeWorkerFactory();
  const client = createGenerationClient({ createWorker: fake.create });
  const request = { graph: square(30, 16), mineCount: 99, firstClick: 200, noGuess: true, seed: 77 };
  const result = await client.request(request);
  assert.deepEqual(plain(result), plain(generate(request)));
  assert.equal(fake.workers.length, 1);
  assert.deepEqual(fake.workers[0].posted[0].request, request);
});

test('client: a rejected request resolves with the failure, it does not reject', async () => {
  const fake = fakeWorkerFactory();
  const client = createGenerationClient({ createWorker: fake.create });
  const result = await client.request({ graph: square(3, 3), mineCount: 9, firstClick: 0, noGuess: false, seed: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.rejected, true);
  assert.equal(typeof result.reason, 'string');
});

test('client: the worker is created lazily and reused for later requests', async () => {
  const fake = fakeWorkerFactory();
  const client = createGenerationClient({ createWorker: fake.create });
  assert.equal(fake.workers.length, 0);
  const req = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 };
  await client.request(req);
  await client.request({ ...req, seed: 2 });
  assert.equal(fake.workers.length, 1);
  assert.equal(fake.workers[0].posted.length, 2);
  assert.notEqual(fake.workers[0].posted[0].id, fake.workers[0].posted[1].id);
});

test('client: cancel — a cancelled request never delivers a result', async () => {
  const fake = fakeWorkerFactory({ hold: true });
  const client = createGenerationClient({ createWorker: fake.create });
  const req = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 };
  const p = client.request(req);
  const w = fake.workers[0];
  client.cancel();
  w.flush();
  const result = await p;
  assert.deepEqual(result, { ok: false, cancelled: true, reason: 'cancelled' });
  assert.equal(w.terminated, true, 'cancel stops the worker so the work itself stops');
});

test('client: cancel while idle is harmless, and the next request uses a fresh worker', async () => {
  const fake = fakeWorkerFactory();
  const client = createGenerationClient({ createWorker: fake.create });
  client.cancel();
  const req = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 };
  const p = client.request(req);
  client.cancel();
  assert.equal((await p).cancelled, true);
  const r = await client.request(req);
  assert.equal(r.ok, true);
  assert.equal(fake.workers.length, 2);
});

test('client: one request in flight — a new request supersedes the one in flight', async () => {
  const fake = fakeWorkerFactory({ hold: true });
  const client = createGenerationClient({ createWorker: fake.create });
  const req = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 };
  const first = client.request(req);
  const second = client.request({ ...req, seed: 2 });
  assert.equal((await first).cancelled, true);
  assert.equal(fake.workers[0].terminated, true);
  assert.equal(fake.workers.length, 2);
  fake.workers[1].flush();
  fake.workers[0].flush();
  const r = await second;
  assert.deepEqual(plain(r), plain(generate({ ...req, seed: 2 })));
});

test('client: a late reply for a stale id is ignored', async () => {
  const fake = fakeWorkerFactory({ hold: true });
  const client = createGenerationClient({ createWorker: fake.create });
  const req = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 };
  const p = client.request(req);
  const w = fake.workers[0];
  // A reply carrying an id the client never sent changes nothing.
  w.onmessage({ data: { id: -5, result: { ok: true, mines: new Int32Array(0) } } });
  w.flush();
  assert.deepEqual(plain(await p), plain(generate(req)));
});

test('client: a worker error rejects the request in flight and drops the worker', async () => {
  const fake = fakeWorkerFactory({ hold: true });
  const client = createGenerationClient({ createWorker: fake.create });
  const req = { graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 };
  const p = client.request(req);
  fake.workers[0].fail('module failed to load');
  await assert.rejects(p, /module failed to load/);
  assert.equal(fake.workers[0].terminated, true);
  const next = client.request(req);
  assert.equal(fake.workers.length, 2, 'the next request starts a fresh worker');
  fake.workers[1].flush();
  assert.equal((await next).ok, true);
});

test('client: an unexpected worker error reply rejects the request', async () => {
  const fake = fakeWorkerFactory({ hold: true });
  const client = createGenerationClient({ createWorker: fake.create });
  const p = client.request({ graph: square(9, 9), mineCount: 10, firstClick: 0, noGuess: false, seed: 1 });
  const { id } = fake.workers[0].posted[0];
  fake.workers[0].onmessage({ data: { id, error: 'boom' } });
  await assert.rejects(p, /boom/);
});

test('client: the default worker is a module worker on worker.js', () => {
  const calls = [];
  globalThis.Worker = class { constructor(url, opts) { calls.push([String(url), opts]); } };
  try {
    createModuleWorker();
  } finally {
    delete globalThis.Worker;
  }
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /\/js\/generation\/worker\.js$/);
  assert.deepEqual(calls[0][1], { type: 'module' });
});

test('client: no generation code runs on the main thread — the client imports none of it', () => {
  const src = readFileSync(new URL('../js/generation/client.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /^\s*import\s/m, 'client.js imports nothing');
  assert.doesNotMatch(src, /import\(/, 'client.js loads nothing dynamically');
});
