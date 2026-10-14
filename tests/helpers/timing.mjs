// Slack for timing assertions and waits, so a test measures what it means to measure on a loaded
// machine (software-rendered browser tests pinning cores beside it). MS_TIME_SLACK sets the factor
// (default 2, never below 1). A budget is multiplied by it and the work gets up to three attempts,
// the fastest counting; a wait for a state polls with a timeout of patience(ms). Lower bounds are
// never slackened.

/** The slack factor from a string: a number of at least 1, default 2. */
export function timeSlack(value) {
  const n = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(n)) return 2;
  return Math.max(1, n);
}

export const TIME_SLACK = timeSlack(process.env.MS_TIME_SLACK);

/**
 * Runs `fn` until one run finishes within `budgetMs` × TIME_SLACK, at most `attempts` times.
 * Returns the fastest run's time, the limit, whether it was met and the last run's value.
 */
export function timed(budgetMs, fn, { attempts = 3 } = {}) {
  const limit = budgetMs * TIME_SLACK;
  let best = Infinity, value;
  for (let i = 0; i < attempts; i++) {
    const t0 = performance.now();
    value = fn();
    const ms = performance.now() - t0;
    best = Math.min(best, ms);
    if (ms < limit) break;
  }
  return { ms: best, limit, ok: best < limit, value };
}

/** A timeout for a wait that polls for a state: generous, since a passing wait returns at once. */
export function patience(ms) {
  return ms * 4 * TIME_SLACK;
}
