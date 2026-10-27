// The desktop host's build path. `npm run package` lays out the unpacked Windows x64 build from the
// installed Electron distribution: the executable under the game's name, the host under
// resources/app with its runtime dependencies (the binding's slot), the game files under
// resources/game and, when supplied, the Steam API library beside the executable.
// `npm run steampipe` renders the SteamPipe app and depot build scripts from the local Steam
// config; `npm run appid` writes the app id file a development run reads. The ids live only in
// the git-ignored config file, and the app id file never reaches the build.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { GAME_ENTRIES } from '../protocol.js';

const DESKTOP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The executable's name in the build; any name not starting with "electron" makes the build packaged. */
export const EXE_NAME = 'Minesweeper3D.exe';

/** The Steam API library: supplied under desktop/redist/, shipped beside the executable. */
export const STEAM_API_LIBRARY = 'steam_api64.dll';

/** The app id file a development run reads from the working directory; never shipped. */
export const DEV_APP_ID_FILE = 'steam_appid.txt';

/** The host's directories that ship with it, beside its top-level scripts and package file. */
export const APP_DIRS = Object.freeze(['adapter']);

/** The fields of the local Steam config, desktop/steampipe/config.json. */
export const STEAM_CONFIG_KEYS = Object.freeze(['appId', 'depotId', 'branch', 'description']);

const ELECTRON_EXE = 'electron.exe';
const DEFAULT_APP = 'default_app.asar';

/** The host files the app ships, relative to the desktop directory. */
export function appEntries(desktopDir) {
  const entries = ['package.json'];
  for (const entry of readdirSync(desktopDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) entries.push(entry.name);
  }
  for (const dir of APP_DIRS) if (existsSync(path.join(desktopDir, dir))) entries.push(dir);
  return entries.sort();
}

/** Every file named `name` under `dir`. */
function findFiles(dir, name) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === name)
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Lays out the unpacked Windows x64 build in `outDir`, replacing any earlier one. */
export function buildWindows({
  desktopDir = DESKTOP_DIR,
  repoRoot = path.join(desktopDir, '..'),
  outDir = path.join(desktopDir, 'out', 'win-x64'),
  electronDist = path.join(desktopDir, 'node_modules', 'electron', 'dist'),
  steamApiLibrary = path.join(desktopDir, 'redist', STEAM_API_LIBRARY),
  installElectron = null,
} = {}) {
  if (!existsSync(path.join(electronDist, ELECTRON_EXE)) && installElectron) installElectron();
  if (!existsSync(path.join(electronDist, ELECTRON_EXE))) {
    throw new Error(`No ${ELECTRON_EXE} in ${electronDist}: run npm install in desktop/ on Windows x64 first.`);
  }
  const pkg = JSON.parse(readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
  const dependencies = Object.keys(pkg.dependencies ?? {});
  for (const name of dependencies) {
    if (!existsSync(path.join(desktopDir, 'node_modules', name))) {
      throw new Error(`The runtime dependency ${name} is not installed: run npm install in desktop/ first.`);
    }
  }

  rmSync(outDir, { recursive: true, force: true });
  cpSync(electronDist, outDir, { recursive: true });
  const exe = path.join(outDir, EXE_NAME);
  renameSync(path.join(outDir, ELECTRON_EXE), exe);
  const resources = path.join(outDir, 'resources');
  rmSync(path.join(resources, DEFAULT_APP), { force: true });

  const appDir = path.join(resources, 'app');
  for (const entry of appEntries(desktopDir)) {
    cpSync(path.join(desktopDir, entry), path.join(appDir, entry), { recursive: true });
  }
  for (const name of dependencies) {
    cpSync(path.join(desktopDir, 'node_modules', name), path.join(appDir, 'node_modules', name), { recursive: true });
  }

  const gameDir = path.join(resources, 'game');
  for (const entry of GAME_ENTRIES) {
    cpSync(path.join(repoRoot, entry), path.join(gameDir, entry), { recursive: true });
  }

  const steamApi = existsSync(steamApiLibrary);
  if (steamApi) cpSync(steamApiLibrary, path.join(outDir, STEAM_API_LIBRARY));

  for (const file of findFiles(outDir, DEV_APP_ID_FILE)) rmSync(file);
  return { outDir, exe, steamApi };
}

const ID = /^[1-9]\d*$/;
const VDF_SAFE = /^[^"\\\r\n{}]*$/;

/** The local Steam config from its JSON text; throws naming the first field it got wrong. */
export function parseSteamConfig(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('The Steam config is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('The Steam config must be a JSON object.');
  const config = {};
  for (const key of ['appId', 'depotId']) {
    const value = String(raw[key] ?? '');
    if (!ID.test(value)) throw new Error(`The Steam config's ${key} must be a positive whole number, not "${value}".`);
    config[key] = value;
  }
  const branch = typeof raw.branch === 'string' ? raw.branch.trim() : '';
  if (branch.toLowerCase() === 'default' || !VDF_SAFE.test(branch)) {
    throw new Error('The Steam config\'s branch must name a private branch, or be empty to upload without setting the build live.');
  }
  config.branch = branch;
  const description = raw.description == null ? '' : String(raw.description);
  if (!VDF_SAFE.test(description)) throw new Error('The Steam config\'s description may not hold quotes, backslashes, braces or line breaks.');
  config.description = description;
  return config;
}

/** Fills each `{{name}}` in `text` from `values`; throws on a placeholder with no value. */
export function renderTemplate(text, values) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`No value for the placeholder {{${name}}}.`);
    return String(values[name]);
  });
}

/** Renders the SteamPipe app and depot build scripts into `outDir` for the build at `contentRoot`. */
export function writeSteamPipeScripts({
  desktopDir = DESKTOP_DIR,
  config,
  contentRoot = path.join(desktopDir, 'out', 'win-x64'),
  outDir = path.join(desktopDir, 'out', 'steampipe'),
}) {
  const templates = path.join(desktopDir, 'steampipe');
  mkdirSync(outDir, { recursive: true });
  const appBuild = path.join(outDir, 'app_build.vdf');
  const depotBuild = path.join(outDir, 'depot_build.vdf');
  const values = {
    ...config,
    contentRoot: path.resolve(contentRoot),
    buildOutput: path.resolve(outDir, 'log'),
    depotScript: depotBuild,
  };
  writeFileSync(depotBuild, renderTemplate(readFileSync(path.join(templates, 'depot_build.vdf'), 'utf8'), values));
  writeFileSync(appBuild, renderTemplate(readFileSync(path.join(templates, 'app_build.vdf'), 'utf8'), values));
  return { appBuild, depotBuild };
}

/** Writes the app id file a development run (`npm start`) reads, beside the host. */
export function writeDevAppId(desktopDir, config) {
  const file = path.join(desktopDir, DEV_APP_ID_FILE);
  writeFileSync(file, config.appId);
  return file;
}

/** Runs the Electron package's own installer, which downloads its binary on first use. */
function fetchElectronBinary() {
  const installer = path.join(DESKTOP_DIR, 'node_modules', 'electron', 'install.js');
  if (!existsSync(installer)) return;
  spawnSync(process.execPath, [installer], { stdio: 'inherit' });
}

function readLocalConfig() {
  const file = path.join(DESKTOP_DIR, 'steampipe', 'config.json');
  if (!existsSync(file)) {
    throw new Error(`No Steam config at ${file}: copy config.example.json beside it and fill in the ids.`);
  }
  return parseSteamConfig(readFileSync(file, 'utf8'));
}

function main(command = 'package') {
  if (command === 'package') {
    const { outDir, exe, steamApi } = buildWindows({ installElectron: fetchElectronBinary });
    console.log(`Built ${outDir}`);
    console.log(`  run ${exe}`);
    if (!steamApi) console.log(`  no ${STEAM_API_LIBRARY} in desktop/redist/ — its slot beside the executable is empty`);
  } else if (command === 'steampipe') {
    if (!existsSync(path.join(DESKTOP_DIR, 'out', 'win-x64', EXE_NAME))) throw new Error('No build to upload: run npm run package first.');
    const config = readLocalConfig();
    const { appBuild } = writeSteamPipeScripts({ config });
    console.log(`Wrote ${appBuild}`);
    console.log(config.branch ? `  sets the build live on the branch ${config.branch}` : '  uploads only: the build is set live on no branch');
    console.log(`  upload: steamcmd +login <builder account> +run_app_build "${appBuild}" +quit`);
  } else if (command === 'appid') {
    console.log(`Wrote ${writeDevAppId(DESKTOP_DIR, readLocalConfig())}`);
  } else {
    throw new Error(`Unknown command "${command}": package, steampipe or appid.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
