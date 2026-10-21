#!/usr/bin/env bash
# Run the tests covering the changed files (git's changes against HEAD when no path is given): the
# files affected-tests.mjs maps them to, browser tests one file at a time on one shared Chromium.
# Extra --flags pass to node --test. The runner is run-tests.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node .claude/external/run-tests.mjs affected "$@"
