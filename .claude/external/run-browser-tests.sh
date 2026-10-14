#!/usr/bin/env bash
# Run the browser tier: only the tests named "in a browser". Extra arguments pass to node --test.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node --test --test-concurrency=2 --test-name-pattern="in a browser" "tests/**/*.test.mjs" "$@"
