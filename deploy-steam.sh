#!/usr/bin/env bash
# Deploys the desktop build to Steam: packages it (npm run package), renders the SteamPipe scripts
# (npm run steampipe) and uploads with SteamCMD, which sets the build live on the private branch
# desktop/steampipe/config.json names. SteamCMD's path and builder account come from the git-ignored
# desktop/steampipe/deploy.env (STEAMCMD=..., STEAM_LOGIN=...) or the environment. SteamCMD asks for
# the password and Steam Guard code itself when its cached login has expired.
# Usage: ./deploy-steam.sh             package, render and upload
#        ./deploy-steam.sh --dry-run   package and render, then print the upload command instead
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$ROOT/desktop"
DEPLOY_ENV="$DESKTOP/steampipe/deploy.env"

dry_run=0
case "${1:-}" in
  '') ;;
  --dry-run) dry_run=1 ;;
  *) echo "Unknown argument \"$1\": the only option is --dry-run." >&2; exit 2 ;;
esac

if [[ -f "$DEPLOY_ENV" ]]; then
  # shellcheck source=/dev/null
  source "$DEPLOY_ENV"
fi
if [[ -z "${STEAMCMD:-}" || -z "${STEAM_LOGIN:-}" ]]; then
  echo "Set STEAMCMD and STEAM_LOGIN, in $DEPLOY_ENV or the environment, for example:" >&2
  echo '  STEAMCMD="C:/steamworks_sdk/sdk/tools/ContentBuilder/builder/steamcmd.exe"' >&2
  echo '  STEAM_LOGIN="<builder account>"' >&2
  exit 1
fi
if [[ ! -f "$STEAMCMD" ]]; then
  echo "No SteamCMD at $STEAMCMD." >&2
  exit 1
fi

changes="$(git -C "$ROOT" status --porcelain)"
if [[ -n "$changes" ]]; then
  echo "The working tree has uncommitted changes; they ship with this build:"
  echo "$changes" | sed 's/^/  /'
  echo
fi

(cd "$DESKTOP" && npm run --silent package && npm run --silent steampipe)

app_build="$DESKTOP/out/steampipe/app_build.vdf"
if command -v cygpath >/dev/null 2>&1; then app_build="$(cygpath -w "$app_build")"; fi

if (( dry_run )); then
  echo
  echo "Dry run, nothing uploaded. Upload with:"
  echo "  \"$STEAMCMD\" +login $STEAM_LOGIN +run_app_build \"$app_build\" +quit"
  exit 0
fi

"$STEAMCMD" +login "$STEAM_LOGIN" +run_app_build "$app_build" +quit
