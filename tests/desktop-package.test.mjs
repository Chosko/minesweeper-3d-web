// The desktop host's build path (desktop/build/package.mjs, desktop/steampipe/): the unpacked
// Windows x64 build laid out from a stand-in Electron distribution, the Steam config file, the
// SteamPipe build scripts rendered from it, and the development-only app id file. Neither Electron
// nor SteamCMD is ever run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_DIRS, DEV_APP_ID_FILE, EXE_NAME, STEAM_API_LIBRARY, STEAM_APP_FILE, STEAM_CONFIG_KEYS,
  appEntries, buildWindows, builtAppIdProblem, runtimePackages, parseSteamConfig, renderTemplate, writeDevAppId, writeSteamPipeScripts,
} from '../desktop/build/package.mjs';
import { GAME_ENTRIES } from '../desktop/protocol.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DESKTOP = path.join(ROOT, 'desktop');
const tempDir = () => mkdtempSync(path.join(tmpdir(), 'ms3d-package-'));

const put = (file, text = '') => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

/** Every file under `dir`, as paths relative to it with forward slashes. */
const listFiles = (dir) => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  .sort();

/** A stand-in desktop directory, repository root and Electron distribution. */
function fixture({ dependencies, steamApi = false } = {}) {
  const base = tempDir();
  const repoRoot = path.join(base, 'repo');
  const desktopDir = path.join(repoRoot, 'desktop');
  const pkg = { name: 'host', type: 'module', main: 'main.js', devDependencies: { electron: '1.0.0' } };
  if (dependencies) pkg.dependencies = dependencies;
  put(path.join(desktopDir, 'package.json'), JSON.stringify(pkg));
  put(path.join(desktopDir, 'main.js'), '// main');
  put(path.join(desktopDir, 'preload.js'), '// preload');
  put(path.join(desktopDir, 'adapter', 'unavailable.js'), '// adapter');
  put(path.join(desktopDir, 'build', 'package.mjs'), '// build');
  put(path.join(desktopDir, 'steampipe', 'app_build.vdf'), '');
  put(path.join(desktopDir, 'steampipe', 'config.json'), '{}');
  put(path.join(desktopDir, DEV_APP_ID_FILE), '480');
  put(path.join(desktopDir, 'node_modules', 'electron', 'index.js'), '');
  for (const name of Object.keys(dependencies ?? {})) {
    put(path.join(desktopDir, 'node_modules', name, 'index.js'), `// ${name}`);
  }
  const electronDist = path.join(desktopDir, 'node_modules', 'electron', 'dist');
  put(path.join(electronDist, 'electron.exe'), 'exe');
  put(path.join(electronDist, 'ffmpeg.dll'), 'dll');
  put(path.join(electronDist, 'resources', 'default_app.asar'), 'asar');
  put(path.join(electronDist, 'locales', 'en-US.pak'), 'pak');
  put(path.join(repoRoot, 'index.html'), '<!doctype html>');
  for (const dir of GAME_ENTRIES.filter((entry) => entry !== 'index.html')) put(path.join(repoRoot, dir, 'a.txt'), dir);
  put(path.join(repoRoot, 'tests', 'x.test.mjs'), '');
  put(path.join(repoRoot, 'docs', 'spec.md'), '');
  put(path.join(repoRoot, 'README.md'), '');
  const steamApiLibrary = path.join(desktopDir, 'redist', STEAM_API_LIBRARY);
  if (steamApi) put(steamApiLibrary, 'steam api');
  const outDir = path.join(desktopDir, 'out', 'win-x64');
  return { base, repoRoot, desktopDir, electronDist, steamApiLibrary, outDir };
}

const VALID_CONFIG = Object.freeze({ appId: '480', depotId: '481', branch: 'private-test', description: 'Test build' });

// --- desktop/package.json and .gitignore --------------------------------------------------------

test('the host package runs the build path from one script each', () => {
  const pkg = JSON.parse(readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts?.package, 'node build/package.mjs');
  assert.equal(pkg.scripts?.steampipe, 'node build/package.mjs steampipe');
  assert.equal(pkg.scripts?.appid, 'node build/package.mjs appid');
});

test('the host\'s one runtime dependency is the chosen Steamworks binding, at an exact version', () => {
  const pkg = JSON.parse(readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ['steamworks-ffi-node']);
  assert.match(pkg.dependencies['steamworks-ffi-node'], /^\d+\.\d+\.\d+$/);
});

test('the repository ignores the host\'s installs, builds, local Steam config and app id file', () => {
  const lines = readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((line) => line.trim());
  for (const entry of ['/node_modules/', '/desktop/node_modules/', '/desktop/out/', '/desktop/redist/',
    `/desktop/${DEV_APP_ID_FILE}`, '/desktop/steampipe/config.json']) {
    assert.ok(lines.includes(entry), `.gitignore lists ${entry}`);
  }
});

// --- the app's files ------------------------------------------------------------------------------

test('the app ships the host\'s package file, its top-level scripts and its own directories only', () => {
  const entries = appEntries(DESKTOP);
  for (const entry of ['package.json', 'main.js', 'preload.js', 'protocol.js', 'bridge.js', ...APP_DIRS]) {
    assert.ok(entries.includes(entry), `the app ships ${entry}`);
  }
  for (const entry of ['build', 'steampipe', 'node_modules', 'out', 'redist', DEV_APP_ID_FILE]) {
    assert.ok(!entries.includes(entry), `the app leaves out ${entry}`);
  }
});

// --- the Windows build ----------------------------------------------------------------------------

test('the build is the Electron distribution under the game\'s own executable name, its default app removed', () => {
  const f = fixture();
  try {
    const result = buildWindows(f);
    assert.equal(result.exe, path.join(f.outDir, EXE_NAME));
    const files = listFiles(f.outDir);
    assert.ok(files.includes(EXE_NAME));
    assert.ok(!files.includes('electron.exe'), 'the executable is renamed, so Electron reads the build as packaged');
    assert.ok(files.includes('ffmpeg.dll') && files.includes('locales/en-US.pak'));
    assert.ok(!files.includes('resources/default_app.asar'));
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the build carries the app under resources/app and the game files under resources/game', () => {
  const f = fixture();
  try {
    buildWindows(f);
    const files = listFiles(f.outDir);
    for (const file of ['package.json', 'main.js', 'preload.js', 'adapter/unavailable.js']) {
      assert.ok(files.includes(`resources/app/${file}`), `resources/app/${file}`);
    }
    assert.ok(!files.some((file) => /^resources\/app\/(build|steampipe|node_modules|out)\//.test(file)));
    assert.ok(files.includes('resources/game/index.html'));
    for (const dir of GAME_ENTRIES.filter((entry) => entry !== 'index.html')) {
      assert.ok(files.includes(`resources/game/${dir}/a.txt`), `resources/game/${dir}`);
    }
    assert.ok(!files.some((file) => /^resources\/game\/(tests|docs|README\.md|desktop)/.test(file)));
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the development app id file never reaches the build', () => {
  const f = fixture();
  try {
    buildWindows(f);
    assert.ok(!listFiles(f.outDir).some((file) => path.posix.basename(file) === DEV_APP_ID_FILE));
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the build replaces an earlier one rather than adding to it', () => {
  const f = fixture();
  try {
    put(path.join(f.outDir, 'stale.txt'), 'old');
    buildWindows(f);
    assert.ok(!existsSync(path.join(f.outDir, 'stale.txt')));
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the binding\'s slot: the host\'s runtime dependencies ship under resources/app/node_modules', () => {
  const f = fixture({ dependencies: { 'steam-binding': '1.0.0' } });
  try {
    buildWindows(f);
    const files = listFiles(f.outDir);
    assert.ok(files.includes('resources/app/node_modules/steam-binding/index.js'));
    assert.ok(!files.some((file) => file.startsWith('resources/app/node_modules/electron/')), 'dev dependencies stay out');
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the Steam API library\'s slot: beside the executable when supplied, left empty otherwise', () => {
  const withLibrary = fixture({ steamApi: true });
  const without = fixture();
  try {
    assert.equal(buildWindows(withLibrary).steamApi, true);
    assert.equal(readFileSync(path.join(withLibrary.outDir, STEAM_API_LIBRARY), 'utf8'), 'steam api');
    assert.equal(buildWindows(without).steamApi, false);
    assert.ok(!existsSync(path.join(without.outDir, STEAM_API_LIBRARY)));
  } finally {
    rmSync(withLibrary.base, { recursive: true, force: true });
    rmSync(without.base, { recursive: true, force: true });
  }
});

test('the build refuses without an installed Windows Electron', () => {
  const f = fixture();
  try {
    rmSync(path.join(f.electronDist, 'electron.exe'));
    assert.throws(() => buildWindows(f), /electron\.exe/);
    assert.ok(!existsSync(f.outDir));
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the build first fetches Electron\'s binary when the package is installed without it', () => {
  const f = fixture();
  try {
    const exe = path.join(f.electronDist, 'electron.exe');
    rmSync(exe);
    let fetched = 0;
    buildWindows({ ...f, installElectron: () => { fetched += 1; put(exe, 'exe'); } });
    assert.equal(fetched, 1);
    assert.ok(existsSync(path.join(f.outDir, EXE_NAME)));
    buildWindows({ ...f, installElectron: () => { fetched += 1; } });
    assert.equal(fetched, 1, 'nothing is fetched when the binary is there');
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('a runtime dependency that is not installed stops the build', () => {
  const f = fixture({ dependencies: { 'steam-binding': '1.0.0' } });
  try {
    rmSync(path.join(f.desktopDir, 'node_modules', 'steam-binding'), { recursive: true });
    assert.throws(() => buildWindows(f), /steam-binding/);
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the binding\'s own dependencies ship with it, and of its optional ones only this platform\'s package', () => {
  const f = fixture({ dependencies: { 'steam-binding': '1.0.0' } });
  try {
    const modules = path.join(f.desktopDir, 'node_modules');
    put(path.join(modules, 'steam-binding', 'package.json'), JSON.stringify({ dependencies: { ffi: '3' }, optionalDependencies: { 'build-tool': '1' } }));
    put(path.join(modules, 'ffi', 'package.json'), JSON.stringify({ optionalDependencies: { '@ffi/win32-x64': '3', '@ffi/linux-x64': '3', '@ffi/win32-arm64': '3' } }));
    put(path.join(modules, 'ffi', 'index.js'), '');
    put(path.join(modules, '@ffi', 'win32-x64', 'package.json'), JSON.stringify({ os: ['win32'], cpu: ['x64'] }));
    put(path.join(modules, '@ffi', 'win32-arm64', 'package.json'), JSON.stringify({ os: ['win32'], cpu: ['arm64'] }));
    put(path.join(modules, 'build-tool', 'package.json'), JSON.stringify({}));
    assert.deepEqual(runtimePackages(f.desktopDir, ['steam-binding']), ['@ffi/win32-x64', 'ffi', 'steam-binding']);
    buildWindows(f);
    const files = listFiles(f.outDir);
    for (const name of ['steam-binding', 'ffi', '@ffi/win32-x64']) {
      assert.ok(files.includes(`resources/app/node_modules/${name}/package.json`), name);
    }
    assert.ok(!files.some((file) => /node_modules\/(build-tool|@ffi\/win32-arm64)\//.test(file)), 'other optional packages stay out');
    rmSync(path.join(modules, 'ffi'), { recursive: true });
    assert.throws(() => buildWindows(f), /ffi/, 'a missing required dependency stops the build');
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('the build carries the app id it hands Steam only when given one', () => {
  const f = fixture();
  try {
    buildWindows(f);
    assert.ok(!existsSync(path.join(f.outDir, 'resources', 'app', STEAM_APP_FILE)));
    buildWindows({ ...f, appId: '480' });
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.outDir, 'resources', 'app', STEAM_APP_FILE), 'utf8')), { appId: '480' });
    assert.ok(!listFiles(f.outDir).some((file) => path.posix.basename(file) === DEV_APP_ID_FILE));
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

test('a build is uploaded only when it carries the config\'s app id', () => {
  const f = fixture();
  try {
    buildWindows(f);
    assert.match(builtAppIdProblem(f.outDir, VALID_CONFIG), /no app id/);
    buildWindows({ ...f, appId: '999' });
    assert.match(builtAppIdProblem(f.outDir, VALID_CONFIG), /999/);
    buildWindows({ ...f, appId: VALID_CONFIG.appId });
    assert.equal(builtAppIdProblem(f.outDir, VALID_CONFIG), null);
  } finally {
    rmSync(f.base, { recursive: true, force: true });
  }
});

// --- the Steam config -----------------------------------------------------------------------------

test('the Steam config holds the app id, the Windows depot id, the private branch and a description', () => {
  assert.deepEqual(parseSteamConfig(JSON.stringify(VALID_CONFIG)), VALID_CONFIG);
  assert.deepEqual(parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, appId: 480, depotId: 481 })), VALID_CONFIG);
  const { description, ...noDescription } = VALID_CONFIG;
  assert.equal(parseSteamConfig(JSON.stringify(noDescription)).description, '');
});

test('an empty or missing branch uploads the build without setting it live anywhere', () => {
  assert.equal(parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, branch: '' })).branch, '');
  const { branch, ...noBranch } = VALID_CONFIG;
  assert.equal(parseSteamConfig(JSON.stringify(noBranch)).branch, '');
  const out = tempDir();
  try {
    const { appBuild } = writeSteamPipeScripts({
      desktopDir: DESKTOP, config: { ...VALID_CONFIG, branch: '' }, contentRoot: out, outDir: path.join(out, 'steampipe'),
    });
    assert.match(readFileSync(appBuild, 'utf8'), /"SetLive"\s+""/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('a malformed Steam config is refused with the field it got wrong', () => {
  assert.throws(() => parseSteamConfig('not json'), /config/i);
  assert.throws(() => parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, appId: '<app id>' })), /appId/);
  assert.throws(() => parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, depotId: '0' })), /depotId/);
  assert.throws(() => parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, branch: 'default' })), /branch/);
  assert.throws(() => parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, branch: 'Default' })), /branch/);
  assert.throws(() => parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, branch: 'has "quote' })), /branch/);
  assert.throws(() => parseSteamConfig(JSON.stringify({ ...VALID_CONFIG, description: 'a "quote' })), /description/);
});

test('the example config lists exactly the config\'s fields and holds no real id', () => {
  const example = JSON.parse(readFileSync(path.join(DESKTOP, 'steampipe', 'config.example.json'), 'utf8'));
  assert.deepEqual(Object.keys(example).sort(), [...STEAM_CONFIG_KEYS].sort());
  assert.throws(() => parseSteamConfig(JSON.stringify(example)), /appId/, 'the example must be filled in before use');
});

// --- the SteamPipe build scripts ------------------------------------------------------------------

test('a template is filled from its values, and a placeholder with no value is refused', () => {
  assert.equal(renderTemplate('"AppID" "{{appId}}" "{{appId}}"', { appId: '7' }), '"AppID" "7" "7"');
  assert.throws(() => renderTemplate('"DepotID" "{{depotId}}"', { appId: '7' }), /depotId/);
});

test('the SteamPipe scripts hard-code no id and set the build live on the configured branch', () => {
  const app = readFileSync(path.join(DESKTOP, 'steampipe', 'app_build.vdf'), 'utf8');
  const depot = readFileSync(path.join(DESKTOP, 'steampipe', 'depot_build.vdf'), 'utf8');
  for (const text of [app, depot]) assert.doesNotMatch(text.replace(/\/\/.*$/gm, ''), /\d\d/, 'no id outside a comment');
  assert.match(app, /"AppID"\s+"\{\{appId\}\}"/);
  assert.match(app, /"SetLive"\s+"\{\{branch\}\}"/);
  assert.match(app, /"ContentRoot"\s+"\{\{contentRoot\}\}"/);
  assert.match(app, /"\{\{depotId\}\}"\s+"\{\{depotScript\}\}"/);
  assert.match(depot, /"DepotID"\s+"\{\{depotId\}\}"/);
  assert.match(depot, new RegExp(`"FileExclusion"\\s+"${DEV_APP_ID_FILE.replace('.', '\\.')}"`));
});

test('the rendered scripts upload the build directory to the depot and set it live on the branch', () => {
  const out = tempDir();
  try {
    const contentRoot = path.join(out, 'win-x64');
    const { appBuild, depotBuild } = writeSteamPipeScripts({
      desktopDir: DESKTOP, config: VALID_CONFIG, contentRoot, outDir: path.join(out, 'steampipe'),
    });
    const app = readFileSync(appBuild, 'utf8');
    const depot = readFileSync(depotBuild, 'utf8');
    assert.doesNotMatch(app + depot, /\{\{/);
    assert.match(app, /"AppID"\s+"480"/);
    assert.match(app, /"SetLive"\s+"private-test"/);
    assert.match(app, /"Desc"\s+"Test build"/);
    assert.ok(app.includes(`"ContentRoot" "${contentRoot}"`) || app.includes(contentRoot));
    assert.ok(app.includes(depotBuild), 'the app script names the rendered depot script');
    assert.match(depot, /"DepotID"\s+"481"/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

// --- the development app id file ------------------------------------------------------------------

test('a development run\'s app id file is written beside the host from the config', () => {
  const dir = tempDir();
  try {
    const file = writeDevAppId(dir, VALID_CONFIG);
    assert.equal(file, path.join(dir, DEV_APP_ID_FILE));
    assert.equal(readFileSync(file, 'utf8'), '480');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
