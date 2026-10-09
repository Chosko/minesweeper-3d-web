// Seeded pseudo-random source owned by board generation (no DOM, no platform randomness).
//
// The algorithm is fixed — mulberry32 over a 32-bit state, integer arithmetic only — so the
// same seed yields the same stream in every browser, in the worker and under Node. Every board
// is a function of (request, seed, generator version): changing this algorithm, its seeding or
// how int(n) maps outputs to a range changes every seeded board and requires bumping
// GENERATOR_VERSION in js/generation/placer.js.

const TWO_32 = 0x100000000;

// createSeededSource(seed) → { next(), int(n) }. seed: an integer 0 .. 2^32 - 1.
//   next()  — the next 32-bit output, an integer 0 .. 2^32 - 1.
//   int(n)  — an unbiased integer 0 .. n - 1 (1 <= n <= 2^32), by rejection sampling.
export function createSeededSource(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed >= TWO_32) {
    throw new RangeError('seed must be an integer 0 .. 2^32 - 1');
  }
  let state = seed | 0;

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };

  const int = (n) => {
    if (!Number.isInteger(n) || n < 1 || n > TWO_32) throw new RangeError('int(n) needs an integer 1 .. 2^32');
    const limit = TWO_32 - (TWO_32 % n); // largest multiple of n not above 2^32
    let x;
    do x = next(); while (x >= limit);
    return x % n;
  };

  return Object.freeze({ next, int });
}
