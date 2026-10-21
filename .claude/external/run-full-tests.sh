#!/usr/bin/env bash
# Run a task's full test suite: the whole fast tier, then the browser tests of the files the changes
# reach (git's changes against HEAD when no path is given), one file at a time on one shared Chromium.
# Extra --flags pass to node --test. The runner is run-tests.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node .claude/external/run-tests.mjs full "$@"
