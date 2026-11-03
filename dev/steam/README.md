# Steam leaderboard probes

Standalone scripts that talk to Steam's leaderboards through the game's own
binding (`openSteamworks` in `desktop/adapter/steam.js`), outside the game.

| Script | What it is for | Writes |
| ------ | -------------- | ------ |
| `create-boards.mjs` | Creates every catalogue leaderboard from the client, ascending, time in milliseconds | Boards, no scores |
| `read-board.mjs` | Prints the top entries of the named boards | Nothing |
| `probe-upload.mjs` | Uploads one score, with or without details, to an existing board and reads it back | One entry, with `--yes` |
| `probe-control.mjs` | The same upload to a throwaway board the client creates (`PROBE_CONTROL`), to tell a refusing board from a broken upload path | A board and an entry, with `--yes` |
| `probe-steam.mjs` | The session the others share: app id, binding, callback pump, shutdown | — |

## Running

- `npm install` in `desktop/` and `desktop/redist/steam_api64.dll` in place;
  the binding's packages resolve from `desktop/node_modules`, so a probe runs
  from any directory: `node dev/steam/read-board.mjs classic-2d-beginner-no-guess`.
- The app id comes from `desktop/steampipe/config.json`, else
  `desktop/steam_appid.txt`, else the `SteamAppId` environment variable.
- Steam running and logged on, the game closed.
- Each script's head comment gives its arguments. An entry or board a probe
  writes is real: reset or delete it in Steamworks afterwards.

## Creating the leaderboards

The game's leaderboards are created from the client with `create-boards.mjs`,
never on the Steamworks site. A board made on the site with *Writes Trusted*
refuses every client upload — `LeaderboardScoreUploaded_t` comes back with
`m_bSuccess` 0 — and keeps refusing after *Trusted* is cleared; deleting it
and re-creating it with `create-boards.mjs` makes it accept uploads.
`probe-control.mjs` against `probe-upload.mjs` tells such a board apart from a
broken upload path.
