// The replay format: one versioned binary blob per finished game, its encoder, and the decoder
// replay-playback shares (no DOM).
//
// A replay is the plain object
//   { header, actions, movement, check }
//   header   { id, mode, graph, board, mines, profile, seed, generatorVersion, endedAt,
//              movementEndedAt }
//            id is the summary's id; mode is the board identity's mode; graph is
//            { kind: 'square', width, height } or { kind: 'box', x, y, z } and matches the board
//            (js/records/board.js), a square graph for a 2D square-grid board, a box for a 3D
//            one; mines are the mine cells as indices, ascending, as many as the board has;
//            profile is { id, version }, the rule profile and its rules version
//            (js/engine/profiles.js); seed (0 .. 2^32 - 1) and generatorVersion are for reference
//            only; endedAt is an ISO 8601 string, not before 1970; movementEndedAt is the game-clock time where a
//            capped movement stream stopped, or null when it was not capped.
//   actions  [{ time, kind, cell }] — time in ms on the game clock, never decreasing; kind one of
//            ACTION_KINDS (reveal, toggle flag, chord); cell an index into the graph.
//   movement [{ time, type: 'sample', values } | { time, type: 'cursor', cell }
//            | { time, type: 'view', mode }] — time never decreasing; a sample holds
//            SAMPLE_ARITY[graph kind] integers, already quantised by the mode's sampler (2D: the
//            pointer in board coordinates; 3D: camera position, yaw and pitch); 'cursor' is the
//            2D keyboard and controller cursor's cell, 'view' the 3D view mode (0 .. 255).
//   check    { outcome, elapsedMs, bbbv, bbbvSolved, clicks, digest } — outcome won, lost or
//            abandoned; clicks { reveal, flag, chord } each { effective, wasted }; digest is
//            cellStateDigest of the final state.
//
// Blob layout (all integers unsigned LEB128 varints unless noted; signed ones zigzag-encoded):
//   envelope  'MSRP' · format version · body · CRC-32 of everything before it (4 bytes, LE)
//   body v1   header: id, mode (length-prefixed UTF-8) · graph kind (byte) and its dimensions ·
//             noGuess (byte) · mine count, then mine gaps · profile id (string), version · seed ·
//             generator version · end date (ms since the epoch) · movementEndedAt + 1 (0 = none)
//             actions: count, then per action time delta, kind (byte), cell delta (signed)
//             movement: count, then per event time delta, type (byte) and, for a sample, each
//             value's delta from the previous sample (signed); for a cursor, the cell delta
//             from the previous cursor cell (signed); for a view mode, the mode (byte)
//             check: outcome (byte), elapsed, 3BV, 3BV solved, six click counts, digest (4 bytes)
// Format version 1 is not compressed: the platform's compression stream saves about 20 to 40 % on
// measured replays (dev/measure-replays.mjs) of a few to a few tens of kilobytes, and would make
// encoding and decoding asynchronous. A compressed body would be a new format version.
// The envelope is the same for every format version, so a newer blob's checksum is verified and
// its version recognised as newer before its body is read; a damaged blob is never taken for a
// newer one.
//
// Decoding goes through one decoder per format version, kept by every later release, and then
// the upgrade steps from that version to the current one in order. A blob of a newer version
// than this build's throws ReplayNewerVersionError; anything that is not a well-formed blob of a
// known version throws ReplayUnreadableError. The encoder throws a RangeError on a replay it
// cannot write.

import { CLICK_KINDS } from '../engine/metrics.js';
import { createBoardIdentity, MODE_3D } from '../records/board.js';
import { OUTCOMES } from '../records/summary.js';

export const REPLAY_FORMAT_VERSION = 1;
export const ACTION_KINDS = CLICK_KINDS;
export const MOVEMENT_TYPES = Object.freeze(['sample', 'cursor', 'view']);
export const SAMPLE_ARITY = Object.freeze({ square: 2, box: 5 });

const GRAPH_KINDS = ['square', 'box'];
const MAGIC = [0x4d, 0x53, 0x52, 0x50]; // 'MSRP'
const TWO_32 = 2 ** 32;

export class ReplayNewerVersionError extends Error {
  constructor(storedVersion, currentVersion) {
    super(`replay format version ${storedVersion} is newer than this build's ${currentVersion}`);
    this.name = 'ReplayNewerVersionError';
    this.storedVersion = storedVersion;
    this.currentVersion = currentVersion;
  }
}

export class ReplayUnreadableError extends Error {
  constructor(reason, options) {
    super(`unreadable replay: ${reason}`, options);
    this.name = 'ReplayUnreadableError';
  }
}

// ---------- the final-state digest ----------

// FNV-1a over one byte per cell — revealed, flagged and hidden as bits 0, 1 and 2 — of the
// engine's state arrays; a missing hidden array (a profile without auto-hide) reads as all shown.
export function cellStateDigest({ revealed, flagged, hidden }) {
  let h = 0x811c9dc5;
  for (let i = 0; i < revealed.length; i++) {
    const b = (revealed[i] ? 1 : 0) | (flagged[i] ? 2 : 0) | (hidden && hidden[i] ? 4 : 0);
    h = Math.imul(h ^ b, 0x01000193);
  }
  return h >>> 0;
}

// ---------- CRC-32 ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, end) {
  let c = 0xffffffff;
  for (let i = 0; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- writer and reader ----------

function createWriter() {
  let buf = new Uint8Array(256);
  let len = 0;
  const ensure = (n) => {
    if (len + n <= buf.length) return;
    let size = buf.length * 2;
    while (size < len + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(buf.subarray(0, len));
    buf = next;
  };
  const w = {
    byte(v) { ensure(1); buf[len++] = v; },
    uint(v) {
      ensure(8);
      while (v >= 0x80) { buf[len++] = (v % 0x80) | 0x80; v = Math.floor(v / 0x80); }
      buf[len++] = v;
    },
    sint(v) { w.uint(v >= 0 ? v * 2 : -v * 2 - 1); },
    u32(v) { ensure(4); for (let k = 0; k < 4; k++) { buf[len++] = v & 0xff; v >>>= 8; } },
    string(s) {
      const b = new TextEncoder().encode(s);
      w.uint(b.length); ensure(b.length); buf.set(b, len); len += b.length;
    },
    get length() { return len; },
    bytes() { return buf.slice(0, len); },
  };
  return w;
}

const fail = (reason) => { throw new ReplayUnreadableError(reason); };

function createReader(bytes, start, end) {
  let pos = start;
  const r = {
    byte() { if (pos >= end) fail('truncated'); return bytes[pos++]; },
    uint() {
      let v = 0, scale = 1;
      for (;;) {
        const b = r.byte();
        v += (b & 0x7f) * scale;
        if (!Number.isSafeInteger(v)) fail('number out of range');
        if (b < 0x80) return v;
        scale *= 0x80;
      }
    },
    sint() { const z = r.uint(); return z % 2 === 0 ? z / 2 : -(z + 1) / 2; },
    u32() { let v = 0; for (let k = 0; k < 4; k++) v += r.byte() * 2 ** (8 * k); return v; },
    string() {
      const n = r.uint();
      if (pos + n > end) fail('truncated');
      const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(pos, pos + n));
      pos += n;
      return s;
    },
    get done() { return pos === end; },
  };
  return r;
}

// ---------- validation shared by the encoder and the v1 decoder ----------

const int = (name, v, min, max) => {
  if (!Number.isSafeInteger(v) || v < min || v > max) {
    throw new RangeError(`replay ${name} must be an integer from ${min} to ${max}, got ${v}`);
  }
  return v;
};

const nonEmpty = (name, v) => {
  if (typeof v !== 'string' || v.length === 0) throw new RangeError(`replay ${name} must be a non-empty string`);
  return v;
};

function checkGraph(graph, board) {
  if (!graph || typeof graph !== 'object') throw new RangeError('replay graph must be an object');
  if (graph.kind === 'square') {
    if (board.mode === MODE_3D || board.grid !== 'square') throw new RangeError('a square graph needs a 2D square-grid board');
    if (graph.width !== board.width || graph.height !== board.height) {
      throw new RangeError(`the square graph is ${graph.width} × ${graph.height}, the board ${board.width} × ${board.height}`);
    }
    return { kind: 'square', width: graph.width, height: graph.height };
  }
  if (graph.kind === 'box') {
    if (board.mode !== MODE_3D) throw new RangeError('a box graph needs a 3D board');
    if (graph.x !== board.width || graph.y !== board.height || graph.z !== board.depth) {
      throw new RangeError(`the box graph is ${graph.x} × ${graph.y} × ${graph.z}, the board ${board.width} × ${board.height} × ${board.depth}`);
    }
    return { kind: 'box', x: graph.x, y: graph.y, z: graph.z };
  }
  throw new RangeError(`replay graph kind must be square or box, got ${JSON.stringify(graph.kind)}`);
}

const cellsOf = (board) => board.width * board.height * (board.depth ?? 1);

function checkMines(mines, board) {
  const cells = cellsOf(board);
  const sorted = Array.from(mines ?? [], (c) => int('mine cell', c, 0, cells - 1)).sort((a, b) => a - b);
  if (sorted.length !== board.mines) throw new RangeError(`replay has ${sorted.length} mines, the board ${board.mines}`);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new RangeError(`replay mine cell ${sorted[i]} is listed twice`);
  }
  return sorted;
}

function checkHeader(h) {
  if (!h || typeof h !== 'object') throw new RangeError('replay header must be an object');
  const board = createBoardIdentity(h.board);
  if (h.mode !== board.mode) throw new RangeError(`replay mode ${h.mode} is not the board's mode ${board.mode}`);
  const graph = checkGraph(h.graph, board);
  if (!h.profile || typeof h.profile !== 'object') throw new RangeError('replay profile must be an object');
  const end = new Date(h.endedAt);
  if (typeof h.endedAt !== 'string' || Number.isNaN(end.getTime()) || end.getTime() < 0 || end.toISOString() !== h.endedAt) {
    throw new RangeError(`replay endedAt must be an ISO 8601 date, got ${JSON.stringify(h.endedAt)}`);
  }
  const movementEndedAt = h.movementEndedAt === null ? null
    : int('movementEndedAt', h.movementEndedAt, 0, Number.MAX_SAFE_INTEGER - 1);
  return {
    id: nonEmpty('id', h.id),
    mode: board.mode,
    graph,
    board,
    mines: checkMines(h.mines, board),
    profile: { id: nonEmpty('profile id', h.profile.id), version: int('profile version', h.profile.version, 1, Number.MAX_SAFE_INTEGER) },
    seed: int('seed', h.seed, 0, TWO_32 - 1),
    generatorVersion: int('generatorVersion', h.generatorVersion, 1, Number.MAX_SAFE_INTEGER),
    endedAt: h.endedAt,
    movementEndedAt,
  };
}

const time = (prev, t) => int('time', t, prev, Number.MAX_SAFE_INTEGER);

function checkCheck(c) {
  if (!c || typeof c !== 'object') throw new RangeError('replay check values must be an object');
  if (!OUTCOMES.includes(c.outcome)) throw new RangeError(`replay outcome must be one of ${OUTCOMES.join(', ')}, got ${c.outcome}`);
  const max = Number.MAX_SAFE_INTEGER;
  const clicks = {};
  for (const kind of CLICK_KINDS) {
    const k = c.clicks?.[kind];
    if (!k || typeof k !== 'object') throw new RangeError(`replay clicks.${kind} is missing`);
    clicks[kind] = { effective: int(`clicks.${kind}.effective`, k.effective, 0, max), wasted: int(`clicks.${kind}.wasted`, k.wasted, 0, max) };
  }
  return {
    outcome: c.outcome,
    elapsedMs: int('elapsedMs', c.elapsedMs, 0, max),
    bbbv: int('bbbv', c.bbbv, 0, max),
    bbbvSolved: int('bbbvSolved', c.bbbvSolved, 0, max),
    clicks,
    digest: int('digest', c.digest, 0, TWO_32 - 1),
  };
}

// ---------- the encoder ----------

function writeBodyV1(w, replay) {
  if (!replay || typeof replay !== 'object') throw new RangeError('replay must be an object');
  const h = checkHeader(replay.header);
  const cells = cellsOf(h.board);
  w.string(h.id);
  w.string(h.mode);
  w.byte(GRAPH_KINDS.indexOf(h.graph.kind));
  if (h.graph.kind === 'square') { w.uint(h.graph.width); w.uint(h.graph.height); } else { w.uint(h.graph.x); w.uint(h.graph.y); w.uint(h.graph.z); }
  w.byte(h.board.noGuess ? 1 : 0);
  w.uint(h.mines.length);
  let prev = -1;
  for (const m of h.mines) { w.uint(m - prev - 1); prev = m; }
  w.string(h.profile.id);
  w.uint(h.profile.version);
  w.uint(h.seed);
  w.uint(h.generatorVersion);
  w.uint(new Date(h.endedAt).getTime());
  w.uint(h.movementEndedAt === null ? 0 : h.movementEndedAt + 1);

  const actions = replay.actions;
  if (!Array.isArray(actions)) throw new RangeError('replay actions must be an array');
  w.uint(actions.length);
  let t = 0, cell = 0;
  for (const a of actions) {
    const at = time(t, a?.time);
    const k = ACTION_KINDS.indexOf(a.kind);
    if (k < 0) throw new RangeError(`replay action kind must be one of ${ACTION_KINDS.join(', ')}, got ${a.kind}`);
    const c = int('action cell', a.cell, 0, cells - 1);
    w.uint(at - t); w.byte(k); w.sint(c - cell);
    t = at; cell = c;
  }

  const movement = replay.movement;
  if (!Array.isArray(movement)) throw new RangeError('replay movement must be an array');
  const arity = SAMPLE_ARITY[h.graph.kind];
  const last = new Array(arity).fill(0);
  w.uint(movement.length);
  t = 0; cell = 0;
  for (const e of movement) {
    const at = time(t, e?.time);
    const type = MOVEMENT_TYPES.indexOf(e.type);
    w.uint(at - t); w.byte(type);
    if (e.type === 'sample') {
      if (!Array.isArray(e.values) || e.values.length !== arity) throw new RangeError(`a ${h.graph.kind} sample holds ${arity} values`);
      for (let i = 0; i < arity; i++) {
        const v = int('sample value', e.values[i], -(2 ** 31), 2 ** 31 - 1);
        w.sint(v - last[i]); last[i] = v;
      }
    } else if (e.type === 'cursor') {
      if (h.graph.kind !== 'square') throw new RangeError('a cursor event belongs to a 2D replay');
      const c = int('cursor cell', e.cell, 0, cells - 1);
      w.sint(c - cell); cell = c;
    } else if (e.type === 'view') {
      if (h.graph.kind !== 'box') throw new RangeError('a view-mode event belongs to a 3D replay');
      w.byte(int('view mode', e.mode, 0, 255));
    } else {
      throw new RangeError(`replay movement type must be one of ${MOVEMENT_TYPES.join(', ')}, got ${e.type}`);
    }
    t = at;
  }

  const c = checkCheck(replay.check);
  w.byte(OUTCOMES.indexOf(c.outcome));
  w.uint(c.elapsedMs); w.uint(c.bbbv); w.uint(c.bbbvSolved);
  for (const kind of CLICK_KINDS) { w.uint(c.clicks[kind].effective); w.uint(c.clicks[kind].wasted); }
  w.u32(c.digest);
}

// The replay as one blob. `version` stamps another format version on the current body layout,
// for tests of the decoder's version handling only.
export function encodeReplay(replay, { version = REPLAY_FORMAT_VERSION } = {}) {
  const w = createWriter();
  for (const b of MAGIC) w.byte(b);
  w.uint(version);
  writeBodyV1(w, replay);
  const bytes = w.bytes();
  const crc = crc32(bytes, bytes.length);
  const out = new Uint8Array(bytes.length + 4);
  out.set(bytes);
  new DataView(out.buffer).setUint32(bytes.length, crc, true);
  return out;
}

// ---------- the decoders ----------

function readBodyV1(r) {
  const id = r.string();
  const mode = r.string();
  const kind = GRAPH_KINDS[r.byte()];
  let graph, board;
  if (kind === 'square') {
    graph = { kind, width: r.uint(), height: r.uint() };
    board = { mode, grid: 'square', width: graph.width, height: graph.height };
  } else if (kind === 'box') {
    graph = { kind, x: r.uint(), y: r.uint(), z: r.uint() };
    board = { mode, width: graph.x, height: graph.y, depth: graph.z };
  } else {
    fail('unknown graph kind');
  }
  const noGuess = r.byte();
  if (noGuess > 1) fail('bad noGuess flag');
  board.noGuess = noGuess === 1;
  const mineCount = r.uint();
  board.mines = mineCount;
  const mines = [];
  let prev = -1;
  for (let i = 0; i < mineCount; i++) { prev += r.uint() + 1; mines.push(prev); }
  const profile = { id: r.string(), version: r.uint() };
  const seed = r.uint();
  const generatorVersion = r.uint();
  const ended = new Date(r.uint());
  if (Number.isNaN(ended.getTime())) fail('bad end date');
  const capped = r.uint();
  const header = checkHeader({
    id, mode, graph, board, mines, profile, seed, generatorVersion,
    endedAt: ended.toISOString(), movementEndedAt: capped === 0 ? null : capped - 1,
  });
  const cells = cellsOf(header.board);

  const actions = [];
  let t = 0, cell = 0;
  for (let n = r.uint(); n > 0; n--) {
    t += r.uint();
    const k = ACTION_KINDS[r.byte()];
    if (k === undefined) fail('unknown action kind');
    cell += r.sint();
    if (cell < 0 || cell >= cells) fail('action cell out of range');
    actions.push({ time: t, kind: k, cell });
  }

  const arity = SAMPLE_ARITY[graph.kind];
  const last = new Array(arity).fill(0);
  const movement = [];
  t = 0; cell = 0;
  for (let n = r.uint(); n > 0; n--) {
    t += r.uint();
    const type = MOVEMENT_TYPES[r.byte()];
    if (type === 'sample') {
      for (let i = 0; i < arity; i++) last[i] += r.sint();
      movement.push({ time: t, type, values: last.slice() });
    } else if (type === 'cursor' && graph.kind === 'square') {
      cell += r.sint();
      if (cell < 0 || cell >= cells) fail('cursor cell out of range');
      movement.push({ time: t, type, cell });
    } else if (type === 'view' && graph.kind === 'box') {
      movement.push({ time: t, type, mode: r.byte() });
    } else {
      fail('unknown movement event');
    }
  }

  const outcome = OUTCOMES[r.byte()];
  if (outcome === undefined) fail('unknown outcome');
  const elapsedMs = r.uint(), bbbv = r.uint(), bbbvSolved = r.uint();
  const clicks = {};
  for (const k of CLICK_KINDS) clicks[k] = { effective: r.uint(), wasted: r.uint() };
  const digest = r.u32();
  if (!r.done) fail('trailing bytes');
  return { header, actions, movement, check: { outcome, elapsedMs, bbbv, bbbvSolved, clicks, digest } };
}

const DECODERS = Object.freeze({ 1: readBodyV1 });
const UPGRADES = Object.freeze({}); // version v → v + 1, one entry per format version below the current one

const toBytes = (blob) => {
  if (blob instanceof Uint8Array) return blob;
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
  return fail('not a byte array');
};

// A decoder over a set of format versions: decoders[v] reads a version-v body, upgrades[v] turns a
// version-v replay into a version v + 1 one, current is the version it returns.
export function createReplayDecoder({ current, decoders, upgrades }) {
  return function decode(blob) {
    const bytes = toBytes(blob);
    if (bytes.length < MAGIC.length + 1 + 4 || MAGIC.some((b, i) => bytes[i] !== b)) fail('not a replay');
    const end = bytes.length - 4;
    const head = createReader(bytes, MAGIC.length, end);
    let version;
    try {
      version = head.uint();
    } catch (err) {
      throw err instanceof ReplayUnreadableError ? err : new ReplayUnreadableError('bad version', { cause: err });
    }
    const stored = bytes[end] + bytes[end + 1] * 2 ** 8 + bytes[end + 2] * 2 ** 16 + bytes[end + 3] * 2 ** 24;
    if (crc32(bytes, end) !== stored) fail('checksum mismatch');
    if (version > current) throw new ReplayNewerVersionError(version, current);
    const read = decoders[version];
    if (!read) fail(`no decoder for format version ${version}`);
    let replay;
    try {
      replay = read(head);
      for (let v = version; v < current; v++) replay = upgrades[v](replay);
    } catch (err) {
      if (err instanceof ReplayUnreadableError) throw err;
      throw new ReplayUnreadableError(err.message, { cause: err });
    }
    return replay;
  };
}

export const decodeReplay = createReplayDecoder({ current: REPLAY_FORMAT_VERSION, decoders: DECODERS, upgrades: UPGRADES });
