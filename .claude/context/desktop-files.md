# Desktop host — file service, saves and packaging

## OVERVIEW

The desktop host's file service keeps the game's saves as files under the
user-data directory — the save directory, which Steam Auto-Cloud syncs, and
the machine prefs directory beside it, which stays on the machine — and
hands the page the stored theme id before first paint. Beside it, the
Windows packaging, the app id files, the SteamPipe scripts and
`deploy-steam.sh`. The main process is [desktop.md](desktop.md)'s, the
adapter and the bridge [desktop-steam.md](desktop-steam.md)'s; the Steam
storage and blob store over the bridge are [platform.md](platform.md)'s and
[platform-blobs.md](platform-blobs.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `desktop/file-service.js` | The file service (`createFileService`, `registerFileService`): the save directory `SAVE_DIR` and the machine prefs directory `PREFS_DIR` under the user-data directory, the machine-local documents `MACHINE_DOCUMENTS`, names checked against `NAME_PATTERN`; safe writes, reads, set-aside, document delete and list, blob put, get, delete and list; `storedTheme()`, the settings document's (`SETTINGS_DOCUMENT`, at `SETTINGS_VERSIONS`) theme id for the first paint. |
| `desktop/build/package.mjs` | The build path behind `npm run package`, `npm run steampipe` and `npm run appid`. |
| `desktop/steampipe/` | The SteamPipe app and depot build script templates, `config.example.json` beside the git-ignored `config.json`. |
| `deploy-steam.sh` | Package, render and upload in one go (repository root). |

## PUBLIC API

File service (`desktop/file-service.js`) — `createFileService({ root, fs?,
readFileSync?, now? })`, `root` the user-data directory, → `{ dir,
prefsDir, read, write, setAside, deleteDocument, listDocuments,
storedTheme, put, get, delete, list }`:
- documents by name: `read(name)` → the text or null; `write(name, text)`;
  `setAside(name)` → the kept-aside file name or null; `deleteDocument(name)`
  removes the file and every kept-aside copy in both directories;
  `listDocuments()` → every name with a file or a kept-aside copy in
  either, sorted;
- blobs by store and key: `put(store, key, bytes)`, `get` → the bytes or
  null, `delete`, `list(store)` → the sorted keys;
- `storedTheme()` → the theme id or null, synchronous, never throws;
- every other call rejects with a `HostError`: `invalid` for a bad name or
  argument, `failed` for a disk that refuses.
`registerFileService(bridge, files)` fills every slot request with it.

Build (`desktop/build/package.mjs`, run from `desktop/`):
- `npm run package` (`buildWindows`) → `desktop/out/win-x64/`: Electron's
  distribution with the executable renamed `EXE_NAME`, the host under
  `resources/app` with its runtime packages and theirs (optional ones only
  for win32 x64), the game's `GAME_ENTRIES` under `resources/game`, the app
  id as `resources/app/steam-app.json` when the local Steam config is
  present, `steam_api64.dll` beside the executable when
  `desktop/redist/` holds it; any development app id file removed.
- `npm run steampipe` (`writeSteamPipeScripts`) → the app and depot build
  scripts under `desktop/out/steampipe/`, refused when there is no build or
  its app id is not the config's (`builtAppIdProblem`); prints the SteamCMD
  upload command.
- `npm run appid` (`writeDevAppId`) → `desktop/steam_appid.txt` for a
  development run.
- The local Steam config `desktop/steampipe/config.json`
  (`STEAM_CONFIG_KEYS`: `appId`, `depotId`, `branch`, `description`;
  `parseSteamConfig`), git-ignored: an empty branch uploads without setting
  the build live, `default` is refused.
- `./deploy-steam.sh [--dry-run]` packages, renders and uploads with
  SteamCMD, whose path and builder account come from the git-ignored
  `desktop/steampipe/deploy.env` (`STEAMCMD`, `STEAM_LOGIN`) or the
  environment; the dry run prints the upload command instead.

## INTERNAL PATTERNS

- **Saves.** The file service owns two directories under the user-data
  directory. The save directory (`saves/`) holds one `<name>.json` per
  document and a `<store>.blobs/` directory per blob store — the replay
  library's `replays` and the leaderboard outbox's among them — with one
  file per blob, nothing else. It is the Steam Auto-Cloud root, set in the
  Steamworks app settings (OS "All OSes", every file beneath it,
  recursively), so all of it syncs at launch and exit; how to make an
  unreleased app sync is `dev/steam/README.md` § Testing Steam Cloud before
  release. The machine prefs directory (`prefs/`) beside it holds the
  `MACHINE_DOCUMENTS` — the machine settings document — in the same format
  and never syncs, like the window state file and the crash log. A
  document's directory is chosen by its name alone. Every name is checked
  against `NAME_PATTERN` and the Windows device names before a path is
  built, so no request reaches outside the two directories.
- **Safe writes.** A write goes to a `~`-marked temporary file in the same
  directory, flushed and renamed over the old file; writes and deletes of
  one file run in call order; a crash mid-write leaves the old file whole,
  and its temporary file is swept the first time the directory is used.
  Set-aside renames a document with a dated `.aside-` suffix, never
  overwriting an earlier copy, so its name reads as missing.
- **Pre-paint theme.** Every time the page loads, the preload's synchronous
  spec request makes the main process read the settings document's file
  (`storedTheme`) and hand its theme id over as `ms3dPrePaint`, before any
  page script runs; an absent, unreadable or newer file hands over null.
  `js/theme.js` takes it instead of browser storage
  ([app-shell-theme-runtime.md](app-shell-theme-runtime.md)).
- **What the build carries.** The host's top-level `.js` files, `adapter/`
  (`APP_DIRS`) and `package.json`; the game files the protocol serves; the
  app id and Steam API library only when present locally. The depot script
  excludes the development app id file and debug symbols. The ids live only
  in the git-ignored config and the build made from it.

## DOMAIN DEPENDENCIES

- [../domain/features/steam-cloud-saves.md](../domain/features/steam-cloud-saves.md)
  — the file service, the save and machine prefs directories, the pre-paint
  theme, the Auto-Cloud configuration and quota.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — packaging and SteamPipe.

## CROSS-REFERENCES

- [desktop.md](desktop.md) — the main process that builds the file service
  over the user-data directory and the protocol whose `GAME_ENTRIES` the
  build copies; [desktop-steam.md](desktop-steam.md) — the bridge whose slot
  requests the file service fills and `bridgeSpec`, which carries the
  pre-paint theme.
- [platform.md](platform.md) and [platform-blobs.md](platform-blobs.md) —
  the Steam storage and blob store over the bridge.
- [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the pre-paint
  script that takes the handed-over theme id.
- [testing-files.md](testing-files.md) — the `desktop-` tests.

## WHEN TO READ THE SOURCE

- A save in the wrong directory, or a name refused: `MACHINE_DOCUMENTS`,
  `NAME_PATTERN` and `documentOf` in `file-service.js` (`MACHINE_DOCUMENTS`
  is kept in step with `js/settings/store.js`'s `MACHINE_SETTINGS_DOC` by
  `tests/desktop-file-service.test.mjs`).
- The first paint in the wrong theme on the desktop host: `storedTheme` and
  `SETTINGS_VERSIONS` in `file-service.js`, `bridgeSpec` and `attach` in
  `bridge.js`.
- A packaged build missing a file: `buildWindows` and `runtimePackages` in
  `build/package.mjs`.
