#!/usr/bin/env bash
# Run the browser tier: only the tests named "in a browser", less those tagged [slow]. Extra arguments
# pass to node --test.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node --test --test-concurrency=2 --test-name-pattern="in a browser" --test-skip-pattern="\[slow\]" "tests/**/*.test.mjs" "$@"
