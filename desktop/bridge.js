// The page bridge's main-process side: the fixed list of requests the page may make and events it
// may receive, every request validated here — operation name, argument types and sizes — before it
// reaches the adapter, the window or a file service. Each request answers `{ ok: true, value }` or
// `{ ok: false, error: { code, message } }`, a typed error, and never throws into the page; the
// preload (desktop/preload.js) turns that into a promise. The bridge carries no general file or
// process access: storage and blob requests reach only the handler registered in their slot.
import { HostError, toTypedError } from './adapter/interface.js';

/** The page's global the preload exposes, and the IPC channels between the preload and here. */
export const BRIDGE_GLOBAL = 'ms3dHost';
export const SPEC_CHANNEL = 'ms3d:bridge-spec';
export const REQUEST_CHANNEL = 'ms3d:request';
export const EVENT_CHANNEL = 'ms3d:event';

const INT32_MIN = -(2 ** 31);
const INT32_MAX = 2 ** 31 - 1;

/** The size bounds a request's arguments are validated against. */
export const LIMITS = Object.freeze({
  name: 256, // an achievement, leaderboard, file, document, blob store or blob key name, in characters
  names: 256, // achievement names read at once
  details: 64, // a score's details integers — Steamworks' k_cLeaderboardDetailsMax
  entries: 100, // leaderboard entries one range download covers
  players: 100, // players one download names — Steamworks' DownloadLeaderboardEntriesForUsers bound
  sharedFileBytes: 4 * 1024 * 1024,
  documentChars: 8 * 1024 * 1024,
  blobBytes: 16 * 1024 * 1024,
  contentSize: 16384, // a window content side, in pixels
});

const invalid = () => { throw new HostError('invalid'); };
const text = (max, min = 1) => (v) => (typeof v === 'string' && v.length >= min && v.length <= max ? v : invalid());
const integer = (min, max) => (v) => (Number.isInteger(v) && v >= min && v <= max ? v : invalid());
const bytes = (max) => (v) => (v instanceof Uint8Array && v.byteLength <= max ? v : invalid());
const list = (item, max, min = 0) => (v) => (Array.isArray(v) && v.length >= min && v.length <= max ? Array.from(v, item) : invalid());
/** A Steam id, leaderboard handle or file handle: a 64-bit unsigned integer in decimal. */
const id = (v) => (typeof v === 'string' && /^\d{1,20}$/.test(v) ? v : invalid());
const name = text(LIMITS.name);

const RANGE_SCOPES = Object.freeze(['global', 'friends', 'around']);

/** A leaderboard download: a rank range in a scope, or the entries of named players. */
function scoreQuery(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) invalid();
  const keys = Object.keys(v).sort().join();
  if (v.scope === 'players') {
    if (keys !== 'players,scope') invalid();
    return { scope: 'players', players: list(id, LIMITS.players, 1)(v.players) };
  }
  if (!RANGE_SCOPES.includes(v.scope) || keys !== 'end,scope,start') invalid();
  const rank = v.scope === 'around' ? integer(-LIMITS.entries, LIMITS.entries) : integer(1, INT32_MAX);
  const start = rank(v.start);
  const end = rank(v.end);
  if (end < start || end - start + 1 > LIMITS.entries) invalid();
  return { scope: v.scope, start, end };
}

const request = (args, run, capability = null) => Object.freeze({ args: Object.freeze(args), run, capability });
const slot = (args) => request(args, null);

/**
 * Every request: its argument validators, the capability it needs, and what it runs. A slot's run
 * is the handler registered for it (`bridge.register`) — the file services of `steam-cloud-saves`.
 */
export const BRIDGE_REQUESTS = Object.freeze({
  'steam.state': request([], (h) => h.steamState()),
  'achievements.set': request([name], (h, n) => h.adapter.setAchievement(n), 'achievements'),
  'achievements.store': request([], (h) => h.adapter.storeStats(), 'achievements'),
  'achievements.read': request([list(name, LIMITS.names)], (h, names) => h.adapter.achievementsSet(names), 'achievements'),
  'leaderboards.find': request([name], (h, n) => h.adapter.findLeaderboard(n), 'leaderboards'),
  'leaderboards.upload': request([id, integer(INT32_MIN, INT32_MAX), list(integer(INT32_MIN, INT32_MAX), LIMITS.details)],
    (h, board, score, details) => h.adapter.uploadScore(board, score, details), 'leaderboards'),
  'leaderboards.download': request([id, scoreQuery], (h, board, query) => (query.scope === 'players'
    ? h.adapter.downloadScoresForPlayers(board, query.players)
    : h.adapter.downloadScores(board, query)), 'leaderboards'),
  'leaderboards.attach': request([id, id], (h, board, file) => h.adapter.attachToLeaderboard(board, file), 'sharedFiles'),
  'sharedFiles.writeAndShare': request([name, bytes(LIMITS.sharedFileBytes)], (h, n, data) => h.adapter.writeAndShare(n, data), 'sharedFiles'),
  'sharedFiles.download': request([id], (h, file) => h.adapter.downloadShared(file), 'sharedFiles'),
  'storage.read': slot([name]),
  'storage.write': slot([name, text(LIMITS.documentChars, 0)]),
  'storage.setAside': slot([name]),
  'blobs.put': slot([name, name, bytes(LIMITS.blobBytes)]),
  'blobs.get': slot([name, name]),
  'blobs.delete': slot([name, name]),
  'blobs.list': slot([name]),
  'quit.handshake': request([], (h) => h.handshake()),
  'quit.request': request([], (h) => { Promise.resolve(h.closing.run()).catch(() => {}); }),
  'window.minimise': request([], (h) => h.window.minimise()),
  'window.toggleFullscreen': request([], (h) => h.window.toggleFullscreen()),
  'window.setContentSize': request([integer(1, LIMITS.contentSize), integer(1, LIMITS.contentSize)],
    (h, width, height) => h.window.setContentSize(width, height)),
});

/** The requests whose handler a file service registers. */
export const SLOT_REQUESTS = Object.freeze(Object.keys(BRIDGE_REQUESTS).filter((op) => BRIDGE_REQUESTS[op].run === null));

/** The events the page may receive. */
export const BRIDGE_EVENTS = Object.freeze(['steamStateChanged', 'overlayActivated', 'flushRequested', 'fullscreenChanged']);

/** What the preload builds the page's object from. */
export function bridgeSpec() {
  return {
    global: BRIDGE_GLOBAL,
    channels: { request: REQUEST_CHANNEL, event: EVENT_CHANNEL },
    requests: Object.keys(BRIDGE_REQUESTS),
    events: [...BRIDGE_EVENTS],
  };
}

/** The request's arguments, validated; throws HostError('invalid') for anything outside the list. */
export function validateRequest(operation, args) {
  if (typeof operation !== 'string' || !Object.hasOwn(BRIDGE_REQUESTS, operation)) invalid();
  const validators = BRIDGE_REQUESTS[operation].args;
  if (!Array.isArray(args) || args.length !== validators.length) invalid();
  return validators.map((validate, i) => validate(args[i]));
}

async function settle(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/**
 * The bridge over `adapter`, the game window's actions (`window`, desktop/window.js) and the
 * closing sequence (`closing`, desktop/closing.js). `attach` joins it to the page.
 */
export function createBridge({ adapter, window, closing }) {
  const slots = new Map();
  let contents = null;
  let flush = null;
  let detachers = [];

  async function steamState() {
    const capabilities = Object.fromEntries(Object.entries(adapter.capabilities).map(([k, v]) => [k, v === true]));
    const loggedOn = capabilities.presence ? (await settle(() => adapter.loggedOn(), false)) === true : false;
    const player = capabilities.identity ? await settle(() => adapter.player(), null) : null;
    return { adapter: adapter.kind, loggedOn, player: player && typeof player === 'object' ? player : null, capabilities };
  }

  function emit(event, payload = null) {
    if (!BRIDGE_EVENTS.includes(event)) throw new Error(`${event} is not a bridge event`);
    if (!contents || contents.isDestroyed()) return;
    contents.send(EVENT_CHANNEL, event, payload);
  }

  /** Asks the page to flush; settles on its hand-shake, or at once with no page to ask. */
  function requestFlush() {
    if (!contents || contents.isDestroyed()) return Promise.resolve();
    if (!flush) {
      let resolve;
      const done = new Promise((r) => { resolve = r; });
      flush = { done, resolve };
      emit('flushRequested');
    }
    return flush.done;
  }

  function handshake() {
    flush?.resolve();
    flush = null;
  }

  const host = {
    adapter,
    window,
    closing,
    steamState,
    handshake,
    slot: (operation) => slots.get(operation) ?? (() => { throw new HostError('unavailable'); }),
  };

  async function handle(operation, args) {
    try {
      const valid = validateRequest(operation, args);
      const entry = BRIDGE_REQUESTS[operation];
      if (entry.capability && adapter.capabilities[entry.capability] !== true) throw new HostError('unavailable');
      const run = entry.run ?? ((h, ...rest) => h.slot(operation)(...rest));
      const value = await run(host, ...valid);
      return { ok: true, value: value ?? null };
    } catch (error) {
      return { ok: false, error: toTypedError(error) };
    }
  }

  function register(operation, handler) {
    if (!SLOT_REQUESTS.includes(operation)) throw new Error(`${operation} is not a storage or blob slot`);
    if (typeof handler !== 'function') throw new TypeError('a slot handler must be a function');
    slots.set(operation, handler);
  }

  function detach() {
    for (const off of detachers) off();
    detachers = [];
    contents = null;
    handshake();
  }

  /** Answers the game window's requests over `ipcMain` and sends it the events; never another sender. */
  function attach({ ipcMain, webContents }) {
    detach();
    contents = webContents;
    const trusted = (event) => event?.sender === webContents;
    const onSpec = (event) => { event.returnValue = trusted(event) ? bridgeSpec() : null; };
    ipcMain.on(SPEC_CHANNEL, onSpec);
    ipcMain.handle(REQUEST_CHANNEL, (event, operation, args) => (trusted(event)
      ? handle(operation, args)
      : { ok: false, error: toTypedError(new HostError('invalid')) }));
    detachers = [
      () => ipcMain.removeListener(SPEC_CHANNEL, onSpec),
      () => ipcMain.removeHandler(REQUEST_CHANNEL),
      window.onFullscreenChange((on) => emit('fullscreenChanged', Boolean(on))),
      adapter.onOverlayActivated((active) => emit('overlayActivated', Boolean(active))),
      adapter.onPresenceChange(() => { steamState().then((state) => emit('steamStateChanged', state)); }),
    ];
    closing.setFlushHook(requestFlush);
    closing.setShutdownHook(() => adapter.shutdown());
  }

  return { handle, register, steamState, emit, requestFlush, attach, detach };
}
