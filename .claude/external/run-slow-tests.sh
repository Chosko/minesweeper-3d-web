#!/usr/bin/env bash
# Run every browser test tagged [slow], one file at a time on one shared Chromium. Milestone close only:
# refused unless MS3D_ALL_BROWSER=1. Extra --flags pass to node --test.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node .claude/external/run-tests.mjs slow "$@"
