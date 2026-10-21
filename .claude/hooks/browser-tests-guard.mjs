// PreToolUse hook on Bash and PowerShell: browser tests run only through the shared-Chromium runner,
// and every browser file only at milestone close. It denies
//   - a `node --test` that may reach a browser test: one naming no file, a glob or directory, or a
//     file holding a test named "in a browser" — unless it skips them (--test-skip-pattern="in a browser");
//   - run-browser-tests.sh, run-slow-tests.sh or run-tests.mjs browser|slow without MS3D_ALL_BROWSER=1.
// Anything else passes untouched. The rules are .claude/context/testing.md's.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const BROWSER_TEST = /\b(?:test|it|describe)\(\s*(['"`])[^'"`\n]*in a browser/;
const HINT = 'Run tests through .claude/external/: run-affected-tests.sh [changed paths or test files] for a change '
  + '(browser tests on one shared Chromium, one file at a time), run-full-tests.sh for a task\'s full suite, '
  + 'run-fast-tests.sh for the fast tier.';

const unquote = (s) => s.replace(/^['"]|['"]$/g, '');
const isBrowserFile = (file) => {
  try {
    return BROWSER_TEST.test(readFileSync(file, 'utf8'));
  } catch {
    return true;
  }
};

/** Why `command` must not run, or null. */
export function verdict(command, cwd = ROOT) {
  if (!/--test|run-(?:browser|slow)-tests|run-tests\.mjs/.test(command)) return null;
  const optedIn = /MS3D_ALL_BROWSER\s*=\s*['"]?1/.test(command);
  if (!optedIn && /run-(?:browser|slow)-tests\.sh|run-tests\.mjs['"]?\s+(?:browser|slow)\b/.test(command)) {
    return 'Every browser file runs only at milestone close, with MS3D_ALL_BROWSER=1 set. ' + HINT;
  }
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = segment.trim().split(/\s+/).map(unquote);
    while (tokens.length && (/^(?:exec|time|env|&)$/.test(tokens[0]) || /^\w+=/.test(tokens[0]))) tokens.shift();
    if (!tokens.length || !/(?:^|[\\/])node(?:\.exe)?$/i.test(tokens[0]) || !tokens.includes('--test')) continue;
    if (/--test-skip-pattern[=\s]+['"]?in a browser/.test(segment)) continue;
    const paths = tokens.slice(1).filter((t) => !t.startsWith('-') && (/[\\/*]/.test(t) || /\.[cm]?js$/.test(t)));
    const reachesBrowser = !paths.length || paths.some((p) => {
      if (p.includes('*')) return true;
      const file = isAbsolute(p) ? p : join(cwd, p);
      return !existsSync(file) || statSync(file).isDirectory() || isBrowserFile(file);
    });
    if (reachesBrowser) return 'This node --test may reach browser tests, which run only on the runner\'s shared Chromium. ' + HINT;
  }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', () => {
    try {
      const { tool_input: toolInput, cwd } = JSON.parse(input);
      const reason = verdict(String(toolInput?.command ?? ''), cwd || ROOT);
      if (reason) {
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
      }
    } catch {
      // never block on a hook failure
    }
    process.exit(0);
  });
}
