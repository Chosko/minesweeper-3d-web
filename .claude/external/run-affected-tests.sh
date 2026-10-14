#!/usr/bin/env bash
# Run the tests covering the changed files. A test file argument (tests/*.test.mjs) runs as given; any
# other path argument is a changed file, mapped to the test files whose import closure (static imports
# and literal-path import() calls) reaches it (js/main.js, index.html, css/ and js/render.js also select every browser test). With no
# arguments, the changed files are those git reports against HEAD. The mapping is affected-tests.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
mapfile -t files < <(node .claude/external/affected-tests.mjs "$@")
if [ "${#files[@]}" -eq 0 ]; then
  echo "no affected tests"
  exit 0
fi
exec node --test --test-concurrency=2 "${files[@]}"
