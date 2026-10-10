// The replay recorder and sealer: one recorder per game session, created when the board opens and
// discarded with the session (no DOM).
//
// startRecording(fields, options) takes the header fields known at board open —
//   { mode, graph, board, profile }   (js/replay/format.js names each)
// and returns the recorder:
//   boardArrived({ mines, seed, generatorVersion })  the rest of the header, when the board arrives
//   action(kind, cell, time)   every action the session hands to the engine while the game accepts
//                              actions, including those that change nothing; the session passes 0
//                              for actions before its timer starts, and they keep their order
//   sample(values, time)       one movement sample of SAMPLE_ARITY[graph kind] quantised integers;
//                              stored only when it differs from the previous sample
//   cursor(cell, time)         the 2D keyboard and controller cursor's cell, when it moves
//   view(mode, time)           the 3D view mode, when it changes
//   seal(summary, final)       → { blob, listing } or null
//   stats()                    { actions, movement, movementBytes }
//   failed                     true once the recorder has failed
// Times are ms on the game clock — the game timer's elapsed time, so paused time is absent —
// floored to integers and held at the previous time of their stream if they run backwards.
//
// Events live in typed buffers that double when full, so recording allocates nothing per event;
// a sample's values are copied, so a sampler may reuse one array. The movement stream counts the
// bytes its events will encode to and stops growing at options.movementCap (MOVEMENT_CAP_BYTES by
// default): the first event that does not fit sets the header's movementEndedAt to its time, and
// the rest of the game is recorded as actions only. Actions are never dropped.
//
// seal(summary, final) closes the streams. summary is the game's summary record
// (js/records/summary.js) — null for a game left before its first click, which seals to nothing —
// and final is the engine game at its end (or its state arrays). The check values are the
// summary's outcome, elapsed time, 3BV, 3BV solved and clicks, and cellStateDigest of the final
// state; the header takes the summary's id and end date. It returns the encoded blob and its
// listing fields
//   { id, boardKey, mode, outcome, elapsedMs, bbbvPerSecond, efficiency, endedAt, size }
// with size the blob's length in bytes. Sealing again returns the same object.
//
// A recorder never interrupts play: any error — bad header fields, a bad feed, a replay that
// cannot be encoded — drops the replay, is reported once through options.onFailure (a console
// warning by default), and turns every later call into a no-op; seal then returns null.

import { ACTION_KINDS, SAMPLE_ARITY, encodeReplay, cellStateDigest } from './format.js';
import { createBoardIdentity, boardKey } from '../records/board.js';

export const MOVEMENT_CAP_BYTES = 2 * 1024 * 1024;

const T_SAMPLE = 0, T_CURSOR = 1, T_VIEW = 2;
const TYPE_NAMES = ['sample', 'cursor', 'view'];
const INT32_MIN = -(2 ** 31), INT32_MAX = 2 ** 31 - 1;

// The bytes an unsigned and a zigzag-signed LEB128 varint take (js/replay/format.js's encoding).
function uintLen(v) {
  let n = 1;
  while (v >= 0x80) { v = Math.floor(v / 0x80); n++; }
  return n;
}
const sintLen = (v) => uintLen(v >= 0 ? v * 2 : -v * 2 - 1);

function grow(buf, size) {
  const next = new buf.constructor(size);
  next.set(buf);
  return next;
}

const defaultReport = (err) => { console.warn('replay recording failed; this game has no replay', err); };

function checkTime(t) {
  if (typeof t !== 'number' || !(t >= 0) || t > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`replay time must be a non-negative number of ms, got ${t}`);
  }
  return Math.floor(t);
}

function checkCell(name, c, cells) {
  if (!Number.isInteger(c) || c < 0 || c >= cells) throw new RangeError(`${name} must be a cell index below ${cells}, got ${c}`);
  return c;
}

export function startRecording(fields, { onFailure = defaultReport, movementCap = MOVEMENT_CAP_BYTES } = {}) {
  let failed = false;
  let sealed; // undefined until sealed; then the sealed result or null
  let header = null, cells = 0, arity = 0;
  let arrived = null;

  let aLen = 0, aTime = new Float64Array(64), aKind = new Uint8Array(64), aCell = new Int32Array(64);
  let mLen = 0, mTime = new Float64Array(64), mType = new Uint8Array(64), mVal = null;
  let mBytes = 0, movementEndedAt = null;
  let lastActionTime = 0, lastMoveTime = 0;
  let lastSample = null, haveSample = false, lastCursor = -1, lastView = -1;
  let encCursor = 0; // the previous cursor cell, as the encoder deltas it

  function fail(err) {
    if (failed) return;
    failed = true;
    aTime = aKind = aCell = mTime = mType = mVal = lastSample = null;
    try { onFailure(err); } catch { /* a reporter's error is not play's either */ }
  }

  // Runs fn unless the recorder is closed; any error fails the recorder instead of reaching play.
  const guard = (fn) => (a, b, c) => {
    if (failed || sealed !== undefined) return undefined;
    try { return fn(a, b, c); } catch (err) { fail(err); return undefined; }
  };

  try {
    if (!fields || typeof fields !== 'object') throw new RangeError('recording needs the header fields');
    const board = createBoardIdentity(fields.board);
    const kind = fields.graph?.kind;
    if (!Object.hasOwn(SAMPLE_ARITY, kind)) throw new RangeError(`replay graph kind must be square or box, got ${JSON.stringify(kind)}`);
    if (!fields.profile || typeof fields.profile !== 'object') throw new RangeError('recording needs the rule profile');
    header = { mode: fields.mode, graph: { ...fields.graph }, board, profile: { id: fields.profile.id, version: fields.profile.version } };
    cells = board.width * board.height * (board.depth ?? 1);
    arity = SAMPLE_ARITY[kind];
    mVal = new Int32Array(64 * arity);
    lastSample = new Int32Array(arity);
  } catch (err) {
    fail(err);
  }

  // Appends one movement event if it fits under the cap; the first that does not closes the stream.
  function pushMovement(type, time, bytes) {
    if (movementEndedAt !== null) return false;
    if (mBytes + bytes > movementCap) { movementEndedAt = time; return false; }
    if (mLen === mTime.length) {
      mTime = grow(mTime, mLen * 2);
      mType = grow(mType, mLen * 2);
      mVal = grow(mVal, mLen * 2 * arity);
    }
    mTime[mLen] = time;
    mType[mLen] = type;
    mBytes += bytes;
    lastMoveTime = time;
    return true;
  }

  const moveTime = (time) => Math.max(checkTime(time), lastMoveTime);

  const recorder = {
    boardArrived: guard(({ mines, seed, generatorVersion } = {}) => {
      arrived = { mines: Array.from(mines ?? []), seed, generatorVersion };
    }),

    action: guard((kind, cell, time) => {
      const k = ACTION_KINDS.indexOf(kind);
      if (k < 0) throw new RangeError(`replay action kind must be one of ${ACTION_KINDS.join(', ')}, got ${kind}`);
      checkCell('action cell', cell, cells);
      const t = Math.max(checkTime(time), lastActionTime);
      if (aLen === aTime.length) {
        aTime = grow(aTime, aLen * 2);
        aKind = grow(aKind, aLen * 2);
        aCell = grow(aCell, aLen * 2);
      }
      aTime[aLen] = t; aKind[aLen] = k; aCell[aLen] = cell;
      aLen++;
      lastActionTime = t;
    }),

    sample: guard((values, time) => {
      if (!values || values.length !== arity) throw new RangeError(`a ${header.graph.kind} sample holds ${arity} values`);
      let same = haveSample, bytes = 0;
      for (let i = 0; i < arity; i++) {
        const v = values[i];
        if (!Number.isInteger(v) || v < INT32_MIN || v > INT32_MAX) throw new RangeError(`a sample value must be a 32-bit integer, got ${v}`);
        if (v !== lastSample[i]) same = false;
        bytes += sintLen(v - lastSample[i]);
      }
      if (same) return;
      const t = moveTime(time);
      if (!pushMovement(T_SAMPLE, t, uintLen(t - lastMoveTime) + 1 + bytes)) return;
      for (let i = 0; i < arity; i++) { mVal[mLen * arity + i] = values[i]; lastSample[i] = values[i]; }
      haveSample = true;
      mLen++;
    }),

    cursor: guard((cell, time) => {
      if (header.graph.kind !== 'square') throw new RangeError('a cursor event belongs to a 2D recording');
      checkCell('cursor cell', cell, cells);
      if (cell === lastCursor) return;
      const t = moveTime(time);
      if (!pushMovement(T_CURSOR, t, uintLen(t - lastMoveTime) + 1 + sintLen(cell - encCursor))) return;
      mVal[mLen * arity] = cell;
      lastCursor = encCursor = cell;
      mLen++;
    }),

    view: guard((mode, time) => {
      if (header.graph.kind !== 'box') throw new RangeError('a view-mode event belongs to a 3D recording');
      if (!Number.isInteger(mode) || mode < 0 || mode > 255) throw new RangeError(`a view mode must be an integer 0 .. 255, got ${mode}`);
      if (mode === lastView) return;
      const t = moveTime(time);
      if (!pushMovement(T_VIEW, t, uintLen(t - lastMoveTime) + 2)) return;
      mVal[mLen * arity] = mode;
      lastView = mode;
      mLen++;
    }),

    seal(summary, final) {
      if (sealed !== undefined) return sealed;
      if (failed) return null;
      try {
        sealed = summary == null ? null : sealNow(summary, final);
      } catch (err) {
        sealed = null;
        fail(err);
      }
      aTime = aKind = aCell = mTime = mType = mVal = null;
      return sealed;
    },

    stats() {
      return { actions: aLen, movement: mLen, movementBytes: mBytes };
    },

    get failed() { return failed; },
  };

  function sealNow(summary, final) {
    if (!arrived) throw new RangeError('the board never arrived: the replay has no mines');
    if (boardKey(summary.board) !== boardKey(header.board)) {
      throw new RangeError(`the summary is for board ${boardKey(summary.board)}, the recording ${boardKey(header.board)}`);
    }
    const state = final?.state ?? final;
    if (!state?.revealed || state.revealed.length !== cells) throw new RangeError('sealing needs the engine final state of this board');

    const actions = new Array(aLen);
    for (let i = 0; i < aLen; i++) actions[i] = { time: aTime[i], kind: ACTION_KINDS[aKind[i]], cell: aCell[i] };
    const movement = new Array(mLen);
    for (let i = 0; i < mLen; i++) {
      const type = TYPE_NAMES[mType[i]], at = i * arity;
      if (type === 'sample') movement[i] = { time: mTime[i], type, values: Array.from(mVal.subarray(at, at + arity)) };
      else if (type === 'cursor') movement[i] = { time: mTime[i], type, cell: mVal[at] };
      else movement[i] = { time: mTime[i], type, mode: mVal[at] };
    }

    const replay = {
      header: {
        id: summary.id,
        ...header,
        mines: arrived.mines,
        seed: arrived.seed,
        generatorVersion: arrived.generatorVersion,
        endedAt: summary.endedAt,
        movementEndedAt,
      },
      actions,
      movement,
      check: {
        outcome: summary.outcome,
        elapsedMs: summary.elapsedMs,
        bbbv: summary.bbbv,
        bbbvSolved: summary.bbbvSolved,
        clicks: summary.clicks,
        digest: cellStateDigest(state),
      },
    };
    const blob = encodeReplay(replay);
    return Object.freeze({
      blob,
      listing: Object.freeze({
        id: summary.id,
        boardKey: boardKey(header.board),
        mode: header.board.mode,
        outcome: summary.outcome,
        elapsedMs: summary.elapsedMs,
        bbbvPerSecond: summary.bbbvPerSecond,
        efficiency: summary.efficiency,
        endedAt: summary.endedAt,
        size: blob.length,
      }),
    });
  }

  return Object.freeze(recorder);
}
