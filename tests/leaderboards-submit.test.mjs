// Leaderboard submission (steam-leaderboards): submit(summary, replay) and its answer, the verifier
// gate over recorded fixture replays and tampered ones, the outbox document and its blob store —
// one pending game per leaderboard, a better one replacing a worse, persistence across a restart —,
// the flush through a fake submitter, the submission state and its change notification, and the
// results flow's end-of-game hand-off calling submit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeReplay, encodeReplay } from '../js/replay/format.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { leaderboardFor } from '../js/leaderboards/catalogue.js';
import { decodeDetails, detailsFor } from '../js/leaderboards/details.js';
import { OUTBOX_DOC, OUTBOX_VERSION, createOutbox } from '../js/leaderboards/outbox.js';
import { SUBMISSION, createSubmissionState } from '../js/leaderboards/state.js';
import { createLeaderboardSubmission } from '../js/leaderboards/submit.js';
import { createResultsFlow } from '../js/results/flow.js';

const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const fixture = (file) => decodeReplay(new Uint8Array(readFileSync(new URL(file, FIXTURES))));
const WON = fixture('2d-beginner-won.msrp');
const LOST = fixture('2d-intermediate-lost.msrp');

// A game from a recorded replay: its summary and sealed { blob, listing }. A later elapsed time
// still reproduces, so one recording gives games of several times on the same board.
function game(id, { from = WON, elapsedMs = from.check.elapsedMs, noGuess = false, tamper, summary: over = {} } = {}) {
  const r = structuredClone(from);
  r.header.id = id;
  r.header.board = { ...r.header.board, noGuess };
  r.check.elapsedMs = elapsedMs;
  if (tamper) tamper(r);
  const { bbbv, bbbvSolved, clicks } = from.check;
  const summary = {
    id, outcome: 'won', elapsedMs, board: { ...from.header.board, noGuess }, bbbv, bbbvSolved, clicks, ...over,
  };
  return { summary, replay: { blob: encodeReplay(r), listing: { id } } };
}

const BEGINNER = leaderboardFor(WON.header.board);

function platform() {
  const backend = createMemoryBackend();
  const impls = new Map();
  const opened = [];
  const openBlobStore = (name) => {
    opened.push(name);
    if (!impls.has(name)) impls.set(name, createMemoryBlobStore());
    return createBlobStore({ open: () => impls.get(name), fallback: () => createMemoryBlobStore() });
  };
  // A fresh session over the same stored documents and blobs.
  const session = () => ({ storage: createStorage({ backend }), openBlobStore });
  return { backend, impls, opened, session };
}

function fakeSubmitter(answer = () => ({ result: 'submitted', rankBefore: null, rankAfter: 1 })) {
  const calls = [];
  return { calls, async submit(entry) { calls.push(entry); return answer(entry); } };
}

function loggedOn() {
  const listeners = new Set();
  return {
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    fire: () => { for (const fn of listeners) fn(); },
    get count() { return listeners.size; },
  };
}

function open(p, options = {}) {
  return createLeaderboardSubmission({ ...p.session(), ...options });
}

const storedOutbox = (p) => JSON.parse(p.backend.documents.get(OUTBOX_DOC));

// ---------------------------------------------------------------- submit's answer

test('submit answers at once: true for an eligible win, false otherwise, with the state set', async () => {
  const p = platform();
  const lb = open(p);
  await lb.start();
  const { summary, replay } = game('g1');
  assert.equal(lb.submit(summary, replay), true);
  assert.equal(lb.state('g1').status, SUBMISSION.PENDING);
  const lost = game('g2', { summary: { outcome: 'lost' } });
  assert.equal(lb.submit(lost.summary, lost.replay), false);
  assert.equal(lb.state('g2').status, SUBMISSION.NOT_ELIGIBLE);
  assert.equal(lb.submit(game('g3').summary, null), false, 'no replay');
  assert.equal(lb.state('g3').status, SUBMISSION.NOT_ELIGIBLE);
  assert.equal(lb.submit(null, null), false);
  assert.equal(lb.state('nobody'), null);
  await lb.settled();
});

test('a win that does not beat the known best is not eligible', async () => {
  const p = platform();
  const asked = [];
  const lb = open(p, { knownBest: (name) => { asked.push(name); return 5000; } });
  await lb.start();
  const { summary, replay } = game('g1');
  assert.equal(lb.submit(summary, replay), false);
  assert.deepEqual(asked, [BEGINNER]);
  assert.equal(lb.state('g1').status, SUBMISSION.NOT_ELIGIBLE);
});

test('a second submit of the same summary id is a no-op', async () => {
  const p = platform();
  const submitter = fakeSubmitter();
  const lb = open(p, { submitter });
  await lb.start();
  const { summary, replay } = game('g1');
  const changes = [];
  lb.onChange((id, state) => changes.push([id, state.status]));
  assert.equal(lb.submit(summary, replay), true);
  assert.equal(lb.submit(summary, replay), true, 'the same answer');
  await lb.settled();
  assert.equal(lb.submit(summary, replay), true);
  await lb.settled();
  assert.equal(submitter.calls.length, 1);
  assert.deepEqual(changes, [['g1', 'pending'], ['g1', 'submitted']]);
});

// ---------------------------------------------------------------- the verifier gate

test('a recorded win that reproduces is queued with its score, details and replay', async () => {
  const p = platform();
  const lb = open(p);
  await lb.start();
  const { summary, replay } = game('g1');
  lb.submit(summary, replay);
  await lb.settled();
  assert.equal(lb.state('g1').status, SUBMISSION.PENDING, 'no submitter: the entry waits');
  const doc = storedOutbox(p);
  assert.equal(doc.version, OUTBOX_VERSION);
  const entry = doc.data.entries[BEGINNER];
  assert.equal(entry.id, 'g1');
  assert.equal(entry.score, summary.elapsedMs);
  assert.deepEqual(entry.details, detailsFor(summary, { rulesVersion: WON.header.profile.version }));
  assert.equal(decodeDetails(entry.details).rulesVersion, WON.header.profile.version);
  const blobs = p.impls.get(OUTBOX_DOC).blobs;
  assert.deepEqual([...blobs.keys()], [entry.replay]);
  assert.deepEqual([...blobs.get(entry.replay)], [...replay.blob]);
});

const TAMPERED = [
  ['an action moved to another cell', { tamper: (r) => { r.actions[0].cell = (r.actions[0].cell + 1) % 81; } }, 'differs'],
  ['a wrong final digest', { tamper: (r) => { r.check.digest = (r.check.digest + 1) >>> 0; } }, 'differs'],
  ['a summary time other than the replay\'s', { summary: { elapsedMs: 9000 } }, 'time'],
  ['a summary on another leaderboard\'s board', { summary: { board: { ...WON.header.board, noGuess: true } } }, 'board'],
  ['a lost replay claimed as a win', { from: LOST, summary: { outcome: 'won' } }, 'outcome'],
];

for (const [name, options, reason] of TAMPERED) {
  test(`verification rejects ${name}`, async () => {
    const p = platform();
    const submitter = fakeSubmitter();
    const lb = open(p, { submitter });
    await lb.start();
    const { summary, replay } = game('t1', options);
    assert.equal(lb.submit(summary, replay), true, 'eligible on its face');
    await lb.settled();
    const state = lb.state('t1');
    assert.equal(state.status, SUBMISSION.REJECTED);
    assert.equal(state.reason, reason);
    assert.equal(submitter.calls.length, 0);
    assert.equal(p.backend.documents.has(OUTBOX_DOC), false, 'nothing queued');
  });
}

test('verification rejects a replay that cannot be read', async () => {
  const p = platform();
  const lb = open(p);
  await lb.start();
  const { summary } = game('t1');
  assert.equal(lb.submit(summary, { blob: new Uint8Array([1, 2, 3, 4]), listing: { id: 't1' } }), true);
  await lb.settled();
  assert.equal(lb.state('t1').status, SUBMISSION.REJECTED);
  assert.equal(lb.state('t1').reason, 'refused');
});

// ---------------------------------------------------------------- the outbox

test('the outbox is its own document and opens its blob store under its own name', async () => {
  const p = platform();
  const { storage, openBlobStore } = p.session();
  const outbox = createOutbox({ storage, openBlobStore });
  await outbox.load();
  assert.deepEqual(p.opened, [OUTBOX_DOC]);
  assert.equal(OUTBOX_DOC, 'leaderboards.outbox');
  assert.throws(() => storage.register(OUTBOX_DOC, OUTBOX_VERSION), /already registered/);
});

test('a better pending game replaces a worse one, and a worse one never replaces a better', async () => {
  const p = platform();
  const lb = open(p);
  await lb.start();
  const slow = game('slow', { elapsedMs: 15000 });
  const fast = game('fast', { elapsedMs: 12000 });
  const middle = game('middle', { elapsedMs: 13000 });
  lb.submit(slow.summary, slow.replay);
  await lb.settled();
  lb.submit(fast.summary, fast.replay);
  await lb.settled();
  assert.equal(storedOutbox(p).data.entries[BEGINNER].id, 'fast');
  assert.equal(lb.state('slow').status, SUBMISSION.NOT_ELIGIBLE);
  assert.equal(lb.state('slow').reason, 'replaced');
  lb.submit(middle.summary, middle.replay);
  await lb.settled();
  assert.equal(storedOutbox(p).data.entries[BEGINNER].id, 'fast');
  assert.equal(lb.state('middle').status, SUBMISSION.NOT_ELIGIBLE);
  assert.equal(lb.state('middle').reason, 'beaten');
  assert.deepEqual([...p.impls.get(OUTBOX_DOC).blobs.keys()], ['fast'], 'only the pending game\'s replay is kept');
});

test('the outbox holds one pending game per leaderboard', async () => {
  const p = platform();
  const lb = open(p);
  await lb.start();
  const guess = game('a', { elapsedMs: 15000 });
  const noGuess = game('b', { elapsedMs: 15000, noGuess: true });
  lb.submit(guess.summary, guess.replay);
  lb.submit(noGuess.summary, noGuess.replay);
  await lb.settled();
  const entries = storedOutbox(p).data.entries;
  assert.deepEqual(Object.keys(entries).sort(), [BEGINNER, leaderboardFor({ ...WON.header.board, noGuess: true })].sort());
});

test('pending games survive a restart and are flushed at start-up', async () => {
  const p = platform();
  const first = open(p);
  await first.start();
  const { summary, replay } = game('g1');
  first.submit(summary, replay);
  await first.settled();
  assert.equal(first.state('g1').status, SUBMISSION.PENDING);

  const submitter = fakeSubmitter(() => ({ result: 'submitted', rankBefore: 40, rankAfter: 12 }));
  const second = open(p, { submitter });
  await second.start();
  await second.settled();
  assert.equal(submitter.calls.length, 1);
  const call = submitter.calls[0];
  assert.equal(call.leaderboard, BEGINNER);
  assert.equal(call.id, 'g1');
  assert.equal(call.score, summary.elapsedMs);
  assert.deepEqual([...call.replay], [...replay.blob]);
  assert.deepEqual(second.state('g1'), { status: SUBMISSION.SUBMITTED, rankBefore: 40, rankAfter: 12 });
  assert.deepEqual(storedOutbox(p).data.entries, {});
  assert.equal(p.impls.get(OUTBOX_DOC).blobs.size, 0, 'the submitted replay is deleted');
  assert.equal(second.submit(summary, replay), true, 'a game already pending at start-up is a duplicate');
  await second.settled();
  assert.equal(submitter.calls.length, 1);
});

test('a duplicate submit after a restart, while the game still waits, is a no-op', async () => {
  const p = platform();
  const first = open(p);
  await first.start();
  const { summary, replay } = game('g1');
  first.submit(summary, replay);
  await first.settled();
  const second = open(p);
  const changes = [];
  second.onChange((id, s) => changes.push([id, s.status]));
  await second.start();
  second.submit(summary, replay);
  await second.settled();
  assert.deepEqual(changes, [['g1', 'pending']]);
  assert.equal(p.impls.get(OUTBOX_DOC).blobs.size, 1);
});

test('an orphan blob in the outbox store is deleted at start-up', async () => {
  const p = platform();
  const first = open(p);
  await first.start();
  p.impls.get(OUTBOX_DOC).blobs.set('orphan', new Uint8Array([1]));
  const second = open(p);
  await second.start();
  await second.settled();
  assert.equal(p.impls.get(OUTBOX_DOC).blobs.has('orphan'), false);
});

test('a stored outbox this build refuses leaves every pending replay in place', async () => {
  const p = platform();
  p.backend.documents.set(OUTBOX_DOC, JSON.stringify({ version: OUTBOX_VERSION + 1, data: { entries: {} } }));
  const first = open(p);
  await first.start();
  p.impls.get(OUTBOX_DOC).blobs.set('kept', new Uint8Array([1]));
  const second = open(p);
  await second.start();
  await second.settled();
  assert.equal(p.impls.get(OUTBOX_DOC).blobs.has('kept'), true);
});

// ---------------------------------------------------------------- flushing

test('with no submitter entries wait; a flush on a logged-on event sends them', async () => {
  const p = platform();
  const events = loggedOn();
  const answers = [{ result: 'retry', reason: 'offline' }, { result: 'submitted', rankBefore: null, rankAfter: 3 }];
  const submitter = fakeSubmitter(() => answers.shift());
  const lb = open(p, { submitter, onLoggedOn: events.subscribe });
  await lb.start();
  assert.equal(events.count, 1);
  const { summary, replay } = game('g1');
  lb.submit(summary, replay);
  await lb.settled();
  assert.equal(submitter.calls.length, 1);
  assert.equal(lb.state('g1').status, SUBMISSION.PENDING, 'offline: kept for the next flush');
  assert.equal(storedOutbox(p).data.entries[BEGINNER].id, 'g1');
  events.fire();
  await lb.settled();
  assert.equal(submitter.calls.length, 2);
  assert.deepEqual(lb.state('g1'), { status: SUBMISSION.SUBMITTED, rankBefore: null, rankAfter: 3 });
  assert.deepEqual(storedOutbox(p).data.entries, {});
});

test('a submitter that throws or rejects leaves the entry for the next flush', async () => {
  const p = platform();
  const lb = open(p, { submitter: { submit: async () => { throw new Error('bridge gone'); } } });
  await lb.start();
  const { summary, replay } = game('g1');
  lb.submit(summary, replay);
  await lb.settled();
  assert.equal(lb.state('g1').status, SUBMISSION.PENDING);
  assert.equal(p.impls.get(OUTBOX_DOC).blobs.size, 1);
});

test('a dropped entry leaves the outbox and its replay is deleted', async () => {
  const p = platform();
  const lb = open(p, { submitter: fakeSubmitter(() => ({ result: 'dropped', reason: 'not-found' })) });
  await lb.start();
  const { summary, replay } = game('g1');
  lb.submit(summary, replay);
  await lb.settled();
  assert.equal(lb.state('g1').status, SUBMISSION.NOT_ELIGIBLE);
  assert.equal(lb.state('g1').reason, 'not-found');
  assert.deepEqual(storedOutbox(p).data.entries, {});
  assert.equal(p.impls.get(OUTBOX_DOC).blobs.size, 0);
});

// ---------------------------------------------------------------- submission state

test('the submission state keeps one frozen state per summary id and notifies each change', () => {
  const state = createSubmissionState();
  const seen = [];
  const off = state.onChange((id, s) => seen.push([id, s]));
  state.onChange(() => { throw new Error('a listener failing never stops the others'); });
  const errors = console.error;
  console.error = () => {};
  try {
    state.set('g1', { status: SUBMISSION.PENDING });
    state.set('g1', { status: SUBMISSION.SUBMITTED, rankBefore: 5, rankAfter: 2 });
  } finally {
    console.error = errors;
  }
  assert.deepEqual(state.get('g1'), { status: 'submitted', rankBefore: 5, rankAfter: 2 });
  assert.ok(Object.isFrozen(state.get('g1')));
  assert.equal(state.get('g2'), null);
  assert.deepEqual(seen.map(([id, s]) => [id, s.status]), [['g1', 'pending'], ['g1', 'submitted']]);
  off();
  console.error = () => {};
  try { state.set('g2', { status: SUBMISSION.REJECTED, reason: 'differs' }); } finally { console.error = errors; }
  assert.equal(seen.length, 2);
  assert.deepEqual(Object.values(SUBMISSION).sort(), ['not-eligible', 'pending', 'rejected', 'submitted']);
});

// ---------------------------------------------------------------- the end-of-game hand-off

const fakeRecords = (log) => ({
  record: (s) => { log.push(['record', s.id]); return null; },
  available: () => true, counters: () => null, history: () => [], winRate: () => null, completedWinRate: () => null,
});
const fakeRouter = () => ({ has: () => true, go() {} });
const tick = () => new Promise((r) => setTimeout(r, 0));

test('a finished game is submitted after it is recorded and its replay added to the library', async () => {
  const log = [];
  const replays = {
    load: async () => {}, has: () => false,
    add: async (blob, listing) => { await tick(); log.push(['add', listing.id]); },
  };
  const leaderboards = { submit: (summary, replay) => { log.push(['submit', summary.id, replay.listing.id]); return true; } };
  const flow = createResultsFlow({ records: fakeRecords(log), replays, leaderboards, router: fakeRouter(), restart() {}, goMenu() {} });
  const { summary, replay } = game('g1');
  flow.finished(summary, 'classic-2d', replay);
  await tick(); await tick(); await tick();
  assert.deepEqual(log, [['record', 'g1'], ['add', 'g1'], ['submit', 'g1', 'g1']]);
});

test('the hand-off submits without a library, after a failed add, and never for an abandoned game', async () => {
  const errors = console.error;
  console.error = () => {};
  try {
    const submitted = [];
    const leaderboards = { submit: (s, r) => { submitted.push([s.id, r]); return false; } };
    const bare = createResultsFlow({ records: fakeRecords([]), leaderboards, router: fakeRouter(), restart() {}, goMenu() {} });
    bare.finished(game('a').summary, 'classic-2d', null);
    const failing = { load: async () => {}, has: () => false, add: async () => { throw new Error('full'); } };
    const flow = createResultsFlow({ records: fakeRecords([]), replays: failing, leaderboards, router: fakeRouter(), restart() {}, goMenu() {} });
    const b = game('b');
    flow.finished(b.summary, 'classic-2d', b.replay);
    flow.abandoned(game('c').summary, 'classic-2d', game('c').replay);
    await tick(); await tick(); await tick();
    assert.deepEqual(submitted.map(([id]) => id), ['a', 'b']);
    assert.equal(submitted[0][1], null);
  } finally {
    console.error = errors;
  }
});

test('a throwing submit never interrupts the results flow', async () => {
  const errors = console.error;
  const logged = [];
  console.error = (e) => logged.push(e);
  try {
    const leaderboards = { submit: () => { throw new Error('boom'); } };
    const flow = createResultsFlow({ records: fakeRecords([]), leaderboards, router: fakeRouter(), restart() {}, goMenu() {} });
    const { summary, replay } = game('g1');
    assert.equal(flow.finished(summary, 'classic-2d', replay).summary.id, 'g1');
    await tick(); await tick();
    assert.deepEqual(logged.map((e) => e?.message), ['boom']);
  } finally {
    console.error = errors;
  }
});
