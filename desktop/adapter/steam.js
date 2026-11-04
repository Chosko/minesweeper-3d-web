// The Steam adapter: the capability adapter (./interface.js) over steamworks-ffi-node. Two layers:
// `openSteamworks` is the only code that touches the binding — it wraps it as the flat binding
// object below, declaring on the binding's own library handle the Steam API calls it lacks and
// reading a downloaded entry's details itself, since the binding decodes them wrongly — and
// `createSteamAdapter` turns any such binding object into the adapter: the callback pump on a timer,
// logged-on changes, typed errors, and `offline` for every call that needs the Steam network while
// Steam is not logged on. `startSteam` is the start-up: a packaged build started outside Steam asks
// it to relaunch the game; when Steam cannot initialise, the unavailable adapter is chosen.
//
// The binding object (a fake in the Node tests): restartAppIfNecessary(appId), init(appId) → boolean,
// runCallbacks(), shutdown(), and per capability —
//   identity      steamId(), personaName(), personaNameOf(steamId)
//   presence      loggedOn() → boolean
//   achievements  setAchievement(name) → boolean, achievement(name) → boolean, storeStats() → boolean
//   leaderboards  findLeaderboard(name) → handle or null; uploadScore(handle, score, details) →
//                 { changed, rankBefore, rankAfter }; downloadEntries(handle, scope, start, end) and
//                 downloadEntriesForUsers(handle, steamIds) → { total, entries }
//   sharedFiles   writeAndShare(name, bytes) → file handle; downloadShared(fileHandle) → bytes;
//                 attach(handle, fileHandle)
//   overlay       onOverlayActivated(listener(active)) → unsubscribe
// The asynchronous ones settle as promises and reject with a plain Error when Steam fails the call.
// A binding without every method of a capability leaves that capability unavailable.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { CAPABILITIES, HostError } from './interface.js';
import { createUnavailableAdapter } from './unavailable.js';

/** How often the pump runs Steam's callbacks and reads the logged-on state. */
export const PUMP_INTERVAL_MS = 1000 / 30;

/** The Chromium switches under which Steam draws its overlay over the game, without flicker. */
export const OVERLAY_SWITCHES = Object.freeze(['in-process-gpu', 'disable-direct-composition', 'ui-disable-partial-swap']);

/** The app id file the packaged build carries under resources/app, written by the build. */
export const STEAM_APP_FILE = 'steam-app.json';

/** The app id file a development run reads beside the host. */
export const DEV_APP_ID_FILE = 'steam_appid.txt';

/** The Steam API library's file name. */
export const STEAM_API_LIBRARY = 'steam_api64.dll';

/** The binding methods each capability needs. */
export const BINDING_METHODS = Object.freeze({
  identity: Object.freeze(['steamId', 'personaName', 'personaNameOf']),
  presence: Object.freeze(['loggedOn']),
  achievements: Object.freeze(['setAchievement', 'achievement', 'storeStats']),
  leaderboards: Object.freeze(['findLeaderboard', 'uploadScore', 'downloadEntries', 'downloadEntriesForUsers']),
  sharedFiles: Object.freeze(['writeAndShare', 'downloadShared', 'attach']),
  overlay: Object.freeze(['onOverlayActivated']),
});

const SCOPES = Object.freeze({ global: 0, around: 1, friends: 2 });

const isId = (v) => /^[1-9]\d*$/.test(String(v ?? '').trim());

/**
 * The app id: the packaged build's from the file the build wrote, a development run's from the local
 * app id file; either falls back to Steam's own `SteamAppId`. Null when none is a positive integer.
 */
export function resolveAppId({ packaged, appDir, env = process.env }) {
  let text = null;
  try {
    text = packaged
      ? JSON.parse(readFileSync(path.join(appDir, STEAM_APP_FILE), 'utf8'))?.appId
      : readFileSync(path.join(appDir, DEV_APP_ID_FILE), 'utf8');
  } catch {
    text = null;
  }
  const value = isId(text) ? text : env.SteamAppId;
  return isId(value) ? Number(String(value).trim()) : null;
}

/** The Steam API library: beside the packaged executable, under desktop/redist/ in development. */
export function steamLibraryPath({ packaged, exeDir, appDir }) {
  return packaged ? path.join(exeDir, STEAM_API_LIBRARY) : path.join(appDir, 'redist', STEAM_API_LIBRARY);
}

/**
 * Starts Steam over `binding`: `{ relaunch: true }` when a packaged build was started outside Steam
 * and Steam relaunches it, else `{ relaunch: false, adapter }` — the Steam adapter, or the
 * unavailable one when there is no binding or app id, or Steam does not initialise.
 */
export function startSteam({ binding, appId, packaged, onError = () => {}, timers }) {
  const unavailable = () => ({ relaunch: false, adapter: createUnavailableAdapter() });
  if (!binding || !appId) return unavailable();
  try {
    if (packaged && binding.restartAppIfNecessary(appId)) return { relaunch: true, adapter: createUnavailableAdapter() };
    if (!binding.init(appId)) return unavailable();
  } catch (error) {
    onError(error);
    return unavailable();
  }
  return { relaunch: false, adapter: createSteamAdapter({ binding, onError, timers }) };
}

/** The Steam adapter over an initialised binding object; see the module comment. */
export function createSteamAdapter({ binding, onError = () => {}, timers = globalThis }) {
  const capabilities = Object.freeze(Object.fromEntries(CAPABILITIES.map((capability) => [
    capability, BINDING_METHODS[capability].every((method) => typeof binding[method] === 'function'),
  ])));
  const presenceListeners = new Set();
  const overlayListeners = new Set();
  let running = true;

  const readLoggedOn = () => {
    if (!capabilities.presence) return true;
    try {
      return binding.loggedOn() === true;
    } catch {
      return false;
    }
  };
  let loggedOn = readLoggedOn();

  const notify = (listeners, value) => {
    for (const listener of [...listeners]) {
      try {
        listener(value);
      } catch (error) {
        onError(error);
      }
    }
  };

  const pump = timers.setInterval(() => {
    if (!running) return;
    try {
      binding.runCallbacks();
    } catch (error) {
      onError(error);
    }
    const now = readLoggedOn();
    if (now !== loggedOn) {
      loggedOn = now;
      notify(presenceListeners, now);
    }
  }, PUMP_INTERVAL_MS);

  const offOverlay = capabilities.overlay
    ? binding.onOverlayActivated((active) => { if (running) notify(overlayListeners, Boolean(active)); })
    : null;

  const ready = (capability) => {
    if (!running || !capabilities[capability]) throw new HostError('unavailable');
  };

  /** A call on the Steam client alone: unavailable without the capability, failed when Steam fails it. */
  const local = (capability, fn) => async (...args) => {
    ready(capability);
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HostError) throw error;
      onError(error);
      throw new HostError('failed');
    }
  };

  /** A call that needs the Steam network: `offline` while Steam is not logged on, before or after. */
  const network = (capability, fn) => async (...args) => {
    ready(capability);
    if (!readLoggedOn()) throw new HostError('offline');
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HostError) throw error;
      if (!readLoggedOn()) throw new HostError('offline');
      onError(error);
      throw new HostError('failed');
    }
  };

  const subscribe = (capability, listeners) => (listener) => {
    if (!capabilities[capability] || typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const entriesOf = (result) => ({
    total: Number(result?.total ?? 0),
    entries: (result?.entries ?? []).map((e) => ({
      steamId: String(e.steamId),
      rank: e.rank,
      score: e.score,
      details: [...e.details],
      fileHandle: e.fileHandle == null ? null : String(e.fileHandle),
    })),
  });

  return Object.freeze({
    kind: 'steam',
    capabilities,

    player: local('identity', () => ({ steamId: String(binding.steamId()), name: String(binding.personaName() ?? '') })),
    personaNames: local('identity', (steamIds) => Object.fromEntries(steamIds.map((id) => [id, String(binding.personaNameOf(id) ?? '')]))),

    loggedOn: local('presence', () => readLoggedOn()),
    onPresenceChange: subscribe('presence', presenceListeners),

    setAchievement: local('achievements', (name) => {
      if (!binding.setAchievement(name)) throw new HostError('not-found');
    }),
    storeStats: local('achievements', () => {
      if (!binding.storeStats()) throw new HostError('failed');
    }),
    achievementsSet: local('achievements', (names) => names.filter((name) => binding.achievement(name) === true)),

    findLeaderboard: network('leaderboards', async (name) => {
      const handle = await binding.findLeaderboard(name);
      if (handle == null) throw new HostError('not-found');
      return String(handle);
    }),
    uploadScore: network('leaderboards', async (handle, score, details) => {
      const r = await binding.uploadScore(handle, score, details);
      return { changed: Boolean(r.changed), rankBefore: r.rankBefore || null, rankAfter: r.rankAfter || null };
    }),
    downloadScores: network('leaderboards', async (handle, { scope, start, end }) => {
      if (!Object.hasOwn(SCOPES, scope)) throw new HostError('invalid');
      return entriesOf(await binding.downloadEntries(handle, scope, start, end));
    }),
    downloadScoresForPlayers: network('leaderboards', async (handle, steamIds) => entriesOf(await binding.downloadEntriesForUsers(handle, steamIds))),

    writeAndShare: network('sharedFiles', async (name, bytes) => String(await binding.writeAndShare(name, bytes))),
    downloadShared: network('sharedFiles', async (fileHandle) => new Uint8Array(await binding.downloadShared(fileHandle))),
    attachToLeaderboard: network('sharedFiles', async (handle, fileHandle) => { await binding.attach(handle, fileHandle); }),

    onOverlayActivated: subscribe('overlay', overlayListeners),

    async shutdown() {
      if (!running) return;
      running = false;
      timers.clearInterval(pump);
      presenceListeners.clear();
      overlayListeners.clear();
      try {
        offOverlay?.();
      } finally {
        binding.shutdown();
      }
    },
  });
}

// --- steamworks-ffi-node ----------------------------------------------------------------------

const K_GAME_OVERLAY_ACTIVATED = 331;
const K_LEADERBOARD_FIND_RESULT = 1104;
const K_LEADERBOARD_SCORES_DOWNLOADED = 1105;
const K_FILE_SHARE_RESULT = 1307;
const K_DOWNLOAD_UGC_RESULT = 1317;
const K_RESULT_OK = 1;
const UPLOAD_KEEP_BEST = 1;
const UGC_READ_CLOSE = 2;
const UGC_HANDLE_INVALID = 0xFFFFFFFFFFFFFFFFn;
const DETAILS_MAX = 64;
const ENTRY_BYTES = 32; // LeaderboardEntry_t: steam id, rank, score, details count, padding, file handle
const SHARED_FILE_POLLS = 150;

/**
 * One downloaded leaderboard entry from the LeaderboardEntry_t bytes and the details integers Steam
 * wrote: steam id at 0, rank at 8, score at 12, details count at 16, file handle at 24.
 */
export function decodeLeaderboardEntry(entry, details) {
  const count = Math.max(0, Math.min(entry.readInt32LE(16), DETAILS_MAX, Math.floor(details.length / 4)));
  const file = entry.readBigUInt64LE(24);
  return {
    steamId: entry.readBigUInt64LE(0).toString(),
    rank: entry.readInt32LE(8),
    score: entry.readInt32LE(12),
    details: Array.from({ length: count }, (_, j) => details.readInt32LE(j * 4)),
    fileHandle: file === 0n || file === UGC_HANDLE_INVALID ? null : file.toString(),
  };
}

/**
 * The binding object over steamworks-ffi-node, its Steam API library at `libraryPath`; null when the
 * library or the binding is missing or does not load. Nothing loads until this is called.
 */
export function openSteamworks({ libraryPath, require = createRequire(import.meta.url), onError = () => {} }) {
  if (!libraryPath || !existsSync(libraryPath)) return null;
  try {
    return bindSteamworks({
      libraryPath,
      koffi: require('koffi'),
      SteamworksSDK: require('steamworks-ffi-node').SteamworksSDK,
      loader: require('steamworks-ffi-node/dist/internal/SteamLibraryLoader.js'),
      onError,
    });
  } catch (error) {
    onError(error);
    return null;
  }
}

function bindSteamworks({ libraryPath, koffi, SteamworksSDK, loader, onError }) {
  const steam = SteamworksSDK.getInstance();
  // The binding searches only an SDK folder layout; the host's library sits where the build puts it.
  steam.libraryLoader.getSteamLibraryPath = () => libraryPath;
  const api = steam.libraryLoader;
  const core = steam.apiCore;
  const poller = steam.leaderboards.callbackPoller;
  const u64 = [process.platform === 'win32' ? 8 : 4, 'uint64'];

  const FindResult = koffi.struct('Ms3dLeaderboardFindResult', { m_hSteamLeaderboard: u64, m_bLeaderboardFound: 'uint8' });
  const ScoresDownloaded = koffi.struct('Ms3dLeaderboardScoresDownloaded', {
    m_hSteamLeaderboard: u64, m_hSteamLeaderboardEntries: u64, m_cEntryCount: 'int',
  });
  const FileShareResult = koffi.struct('Ms3dRemoteStorageFileShareResult', {
    m_eResult: 'int32', m_hFile: 'uint64', m_rgchFilename: koffi.array('char', 260),
  });
  const DownloadUGCResult = koffi.struct('Ms3dRemoteStorageDownloadUGCResult', {
    m_eResult: 'int32', m_hFile: 'uint64', m_nAppID: 'uint32', m_nSizeInBytes: 'int32',
    m_pchFileName: koffi.array('char', 260), m_ulSteamIDOwner: 'uint64',
  });
  const GameOverlayActivated = koffi.struct('Ms3dGameOverlayActivated', {
    m_bActive: 'uint8', m_bUserInitiated: 'bool', m_nAppID: 'uint32', m_dwOverlayPID: 'uint32',
  });

  let calls = null; // the Steam API calls the binding lacks, declared on its library handle after init
  const overlayListeners = new Set();
  let overlay = null;

  const stats = () => core.getUserStatsInterface();
  const storage = () => core.getRemoteStorageInterface();
  const must = (value, message) => {
    if (!value) throw new Error(message);
    return value;
  };

  function declare() {
    const lib = api.getLibrary();
    calls = {
      fileShare: lib.func('SteamAPI_ISteamRemoteStorage_FileShare', 'uint64', ['void*', 'str']),
      ugcDownload: lib.func('SteamAPI_ISteamRemoteStorage_UGCDownload', 'uint64', ['void*', 'uint64', 'uint32']),
      ugcRead: lib.func('SteamAPI_ISteamRemoteStorage_UGCRead', 'int32', ['void*', 'uint64', 'void*', 'int32', 'uint32', 'int']),
      requestUserInformation: lib.func('SteamAPI_ISteamFriends_RequestUserInformation', 'bool', ['void*', 'uint64', 'bool']),
      downloadForUsers: lib.func('SteamAPI_ISteamUserStats_DownloadLeaderboardEntriesForUsers', 'uint64', ['void*', 'uint64', 'void*', 'int']),
      downloadedEntry: lib.func('SteamAPI_ISteamUserStats_GetDownloadedLeaderboardEntry', 'bool', ['void*', 'uint64', 'int', 'void*', 'void*', 'int']),
    };
  }

  // GameOverlayActivated_t is a push callback, registered as the binding registers its own.
  function registerOverlay() {
    const run = (_self, param) => {
      const event = koffi.decode(param, GameOverlayActivated);
      for (const listener of [...overlayListeners]) listener(event.m_bActive !== 0);
    };
    const fns = [
      koffi.register(run, loader.FnCallbackRunPtr),
      koffi.register((self, param) => run(self, param), loader.FnCallbackRunResultPtr),
      koffi.register(() => koffi.sizeof(GameOverlayActivated), loader.FnGetCallbackSizeBytesPtr),
    ];
    const vtable = koffi.alloc('void*', 3);
    koffi.encode(vtable, koffi.array('void*', 3), fns);
    const object = koffi.alloc(loader.CCallbackBase, 1);
    koffi.encode(object, loader.CCallbackBase, { vfptr: vtable, m_nCallbackFlags: 0, _pad: [0, 0, 0], m_iCallback: K_GAME_OVERLAY_ACTIVATED });
    api.SteamAPI_RegisterCallback(object, K_GAME_OVERLAY_ACTIVATED);
    overlay = { fns, vtable, object };
  }

  function unregisterOverlay() {
    if (!overlay) return;
    api.SteamAPI_UnregisterCallback(overlay.object);
    for (const fn of overlay.fns) koffi.unregister(fn);
    overlay = null;
  }

  async function readEntries(handle, call) {
    must(call !== 0n, 'the download returned no call');
    const result = must(await poller.poll(call, ScoresDownloaded, K_LEADERBOARD_SCORES_DOWNLOADED), 'the download gave no result');
    const entry = Buffer.alloc(ENTRY_BYTES);
    const details = Buffer.alloc(DETAILS_MAX * 4);
    const entries = [];
    for (let i = 0; i < result.m_cEntryCount; i += 1) {
      if (calls.downloadedEntry(stats(), BigInt(result.m_hSteamLeaderboardEntries), i, entry, details, DETAILS_MAX)) {
        entries.push(decodeLeaderboardEntry(entry, details));
      }
    }
    const total = api.SteamAPI_ISteamUserStats_GetLeaderboardEntryCount(stats(), BigInt(handle));
    return { total, entries };
  }

  const binding = {
    restartAppIfNecessary: (appId) => steam.restartAppIfNecessary(appId),
    init(appId) {
      if (!steam.init({ appId })) return false;
      declare();
      try {
        registerOverlay();
      } catch (error) {
        // Without the callback there is no overlay event: the overlay capability is unavailable.
        onError(error);
        overlay = null;
        delete binding.onOverlayActivated;
      }
      return true;
    },
    runCallbacks: () => steam.runCallbacks(),
    shutdown() {
      try {
        unregisterOverlay();
      } finally {
        steam.shutdown();
      }
    },

    steamId: () => steam.getStatus().steamId,
    personaName: () => steam.friends.getPersonaName(),
    personaNameOf(steamId) {
      calls.requestUserInformation(core.getFriendsInterface(), BigInt(steamId), true);
      return steam.friends.getFriendPersonaName(steamId);
    },

    loggedOn: () => steam.user.isLoggedOn() === true,

    setAchievement: (name) => api.SteamAPI_ISteamUserStats_SetAchievement(stats(), name),
    achievement(name) {
      const set = koffi.alloc('bool', 1);
      return api.SteamAPI_ISteamUserStats_GetAchievement(stats(), name, set) ? koffi.decode(set, 'bool') : false;
    },
    storeStats: () => api.SteamAPI_ISteamUserStats_StoreStats(stats()),

    async findLeaderboard(name) {
      const call = api.SteamAPI_ISteamUserStats_FindLeaderboard(stats(), name);
      must(call !== 0n, 'the find returned no call');
      const result = must(await poller.poll(call, FindResult, K_LEADERBOARD_FIND_RESULT), 'the find gave no result');
      return result.m_bLeaderboardFound ? BigInt(result.m_hSteamLeaderboard).toString() : null;
    },
    async uploadScore(handle, score, details) {
      const r = must(await steam.leaderboards.uploadScore(BigInt(handle), score, UPLOAD_KEEP_BEST, details), 'the upload failed');
      return { changed: r.scoreChanged, rankBefore: r.globalRankPrevious, rankAfter: r.globalRankNew };
    },
    downloadEntries: (handle, scope, start, end) => readEntries(handle,
      api.SteamAPI_ISteamUserStats_DownloadLeaderboardEntries(stats(), BigInt(handle), SCOPES[scope], start, end)),
    downloadEntriesForUsers(handle, steamIds) {
      const ids = Buffer.alloc(steamIds.length * 8);
      steamIds.forEach((id, i) => ids.writeBigUInt64LE(BigInt(id), i * 8));
      return readEntries(handle, calls.downloadForUsers(stats(), BigInt(handle), ids, steamIds.length));
    },

    async writeAndShare(name, bytes) {
      must(steam.cloud.fileWrite(name, Buffer.from(bytes)), `writing ${name} to Steam remote storage failed`);
      const call = calls.fileShare(storage(), name);
      must(call !== 0n, 'the share returned no call');
      const result = must(await poller.poll(call, FileShareResult, K_FILE_SHARE_RESULT, SHARED_FILE_POLLS), 'the share gave no result');
      must(result.m_eResult === K_RESULT_OK, `the share failed with result ${result.m_eResult}`);
      return BigInt(result.m_hFile).toString();
    },
    async downloadShared(raw) {
      const handle = BigInt(raw);
      const call = calls.ugcDownload(storage(), handle, 0);
      must(call !== 0n, 'the shared file download returned no call');
      const result = must(await poller.poll(call, DownloadUGCResult, K_DOWNLOAD_UGC_RESULT, SHARED_FILE_POLLS), 'the shared file download gave no result');
      must(result.m_eResult === K_RESULT_OK, `the shared file download failed with result ${result.m_eResult}`);
      const buffer = Buffer.alloc(result.m_nSizeInBytes);
      const read = calls.ugcRead(storage(), handle, buffer, buffer.length, 0, UGC_READ_CLOSE);
      return new Uint8Array(buffer.subarray(0, Math.max(read, 0)));
    },
    async attach(handle, file) {
      must(await steam.leaderboards.attachLeaderboardUGC(BigInt(handle), BigInt(file)), 'attaching the shared file failed');
    },

    onOverlayActivated(listener) {
      if (!overlay) return () => {};
      overlayListeners.add(listener);
      return () => overlayListeners.delete(listener);
    },
  };
  return binding;
}
