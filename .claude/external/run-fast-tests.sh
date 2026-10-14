#!/usr/bin/env bash
# Run the fast tier: every test except those named "in a browser". Extra arguments pass to node --test.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node --test --test-skip-pattern="in a browser" "tests/**/*.test.mjs" "$@"
