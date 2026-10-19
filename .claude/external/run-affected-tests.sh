#!/usr/bin/env bash
# Run the tests covering the changed files. A test file argument (tests/*.test.mjs) runs as given; any
# other path argument is a changed file, mapped to the test files whose import closure (static imports
# and literal-path import() calls) reaches it — those run whole, [slow] tests included. A change to the
# page shell (js/main.js, index.html, css/) also selects the smoke set, and one to js/render.js every
# browser test; those run with [slow] skipped. With no arguments, the changed files are those git
# reports against HEAD. The mapping is affected-tests.mjs.
set -euo pipefail
cd "$(dirname "$0")/../.."
mapfile -t full < <(node .claude/external/affected-tests.mjs --full "$@")
mapfile -t smoke < <(node .claude/external/affected-tests.mjs --smoke "$@")
if [ "${#full[@]}" -eq 0 ] && [ "${#smoke[@]}" -eq 0 ]; then
  echo "no affected tests"
  exit 0
fi
status=0
if [ "${#full[@]}" -gt 0 ]; then
  node --test --test-concurrency=2 "${full[@]}" || status=$?
fi
if [ "${#smoke[@]}" -gt 0 ]; then
  node --test --test-concurrency=2 --test-skip-pattern="\[slow\]" "${smoke[@]}" || status=$?
fi
exit "$status"
