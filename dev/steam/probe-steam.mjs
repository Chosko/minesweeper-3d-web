// The Steam session the leaderboard probes in dev/steam/ share: opens the game's own binding
// (desktop/adapter/steam.js's openSteamworks) on desktop/redist/steam_api64.dll, initialises it for
// the game's app id, pumps Steam's callbacks, and shuts it down when the probe's work settles.
//
// The app id: desktop/steampipe/config.json's appId, else desktop/steam_appid.txt, else the
// SteamAppId environment variable. The binding's packages resolve from desktop/node_modules, beside
// steam.js, so a probe runs from any directory once `npm install` has run in desktop/.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESKTOP = path.join(REPO, 'desktop');
const STEAM_JS = path.join(DESKTOP, 'adapter', 'steam.js');

const isId = (v) => /^[1-9]\d*$/.test(String(v ?? '').trim());

function appId() {
  const read = (file, pick) => {
    try {
      return pick(readFileSync(path.join(DESKTOP, file), 'utf8'));
    } catch {
      return null;
    }
  };
  const id = [
    read(path.join('steampipe', 'config.json'), (text) => JSON.parse(text)?.appId),
    read('steam_appid.txt', (text) => text),
    process.env.SteamAppId,
  ].find(isId);
  if (!id) throw new Error('no app id: set appId in desktop/steampipe/config.json, write desktop/steam_appid.txt or set SteamAppId');
  return Number(String(id).trim());
}

/** JSON with Steam's 64-bit ids and handles as decimal strings. */
export const json = (value) => JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? v.toString() : v));

/**
 * Runs `work({ binding, sdk })` inside an initialised Steam session and shuts it down after:
 * `binding` is openSteamworks' flat binding object, `sdk` the steamworks-ffi-node instance behind it
 * (for the calls the binding object does not carry). Exits 1 when the binding does not load or
 * Steam does not initialise.
 */
export async function withSteam(work) {
  const id = appId();
  process.env.SteamAppId = String(id);
  process.env.SteamGameId = String(id);
  const { openSteamworks, STEAM_API_LIBRARY } = await import(pathToFileURL(STEAM_JS).href);
  const binding = openSteamworks({
    libraryPath: path.join(DESKTOP, 'redist', STEAM_API_LIBRARY),
    onError: (error) => console.log('onError', error),
  });
  if (!binding) {
    console.log('binding did not load: is desktop/redist/steam_api64.dll there and npm install run in desktop/?');
    process.exit(1);
  }
  if (!binding.init(id)) {
    console.log(`init failed for app ${id}: is Steam running, logged on, and the game closed?`);
    process.exit(1);
  }
  const sdk = createRequire(STEAM_JS)('steamworks-ffi-node').SteamworksSDK.getInstance();
  const pump = setInterval(() => binding.runCallbacks(), 50);
  try {
    return await work({ binding, sdk, appId: id });
  } finally {
    clearInterval(pump);
    binding.shutdown();
  }
}
