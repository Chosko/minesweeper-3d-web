#!/usr/bin/env bash
# Run the slow tier: only the browser tests tagged [slow] in their names. Extra arguments pass to node --test.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node --test --test-concurrency=2 --test-timeout=180000 --test-name-pattern="\[slow\]" "tests/**/*.test.mjs" "$@"
