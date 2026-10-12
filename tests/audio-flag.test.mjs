// The flag sound grows with the count (P-21): Sfx.flag(on, count) draws its voice from the pure
// flagVoice(on, count) — stacked steps and their level, non-decreasing in the count and capped at the
// 26 neighbours of a cube; counts 1, 2, 4, 8 and 16 distinct; count 1 today's single flag sound; an
// unflag (a number's undo) the falling mirror of the mass flag. The voices are checked on the
// shared instance with its primitives recorded, so no AudioContext is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sfx, flagVoice, FLAG_COUNT_CAP, FLAG_STEP_RATIOS } from '../js/audio.js';

test('flagVoice: count 1 is the single flag sound, with no step', () => {
  for (const on of [true, false]) {
    assert.deepEqual({ ...flagVoice(on, 1) }, { on, count: 1, steps: 0, level: 0 });
    assert.ok(Object.isFrozen(flagVoice(on, 1)));
  }
  assert.deepEqual(flagVoice(true, 0), flagVoice(true, 1), 'no count is one cell');
  assert.deepEqual(flagVoice(true, undefined), flagVoice(true, 1));
});

test('flagVoice: steps and level never fall as the count grows, and stop at the 26-neighbour cap', () => {
  assert.equal(FLAG_COUNT_CAP, 26);
  for (const on of [true, false]) {
    let prev = flagVoice(on, 1);
    for (let n = 2; n <= 40; n++) {
      const v = flagVoice(on, n);
      assert.ok(v.steps >= prev.steps && v.level >= prev.level, `${on ? 'flag' : 'unflag'} ${n}`);
      assert.ok(v.steps <= FLAG_STEP_RATIOS.length && v.level <= 1);
      prev = v;
    }
    assert.deepEqual(flagVoice(on, 100), flagVoice(on, FLAG_COUNT_CAP), 'capped');
    assert.equal(flagVoice(on, FLAG_COUNT_CAP).level, 1);
  }
});

test('flagVoice: counts 1, 2, 4, 8 and 16 each sound distinct', () => {
  const voices = [1, 2, 4, 8, 16].map((n) => flagVoice(true, n));
  const steps = voices.map((v) => v.steps);
  assert.deepEqual(steps, [...new Set(steps)], `steps ${steps}`);
  for (let k = 1; k < voices.length; k++) assert.ok(voices[k].level > voices[k - 1].level);
});

test('flagVoice: an unflag is the mirror of the flag with the same count', () => {
  for (let n = 1; n <= 30; n++) {
    const up = flagVoice(true, n), down = flagVoice(false, n);
    assert.equal(down.on, false);
    assert.equal(down.steps, up.steps);
    assert.equal(down.level, up.level);
  }
});

// Sfx.flag with its context gate, throttle and primitives recorded.
function record(fn) {
  const calls = [];
  const saved = { _ok: sfx._ok, _throttle: sfx._throttle, _tone: sfx._tone, _noise: sfx._noise, random: Math.random };
  sfx._ok = () => true;
  sfx._throttle = () => true;
  sfx._tone = (freq, dur, o = {}) => calls.push({ v: 'tone', freq, dur, ...o });
  sfx._noise = (dur, o = {}) => calls.push({ v: 'noise', dur, ...o });
  Math.random = () => 0.5; // no jitter
  try { fn(); } finally { Object.assign(sfx, { _ok: saved._ok, _throttle: saved._throttle, _tone: saved._tone, _noise: saved._noise }); Math.random = saved.random; }
  return calls;
}

test('Sfx.flag: count 1 plays today\'s single flag sound, placed and removed', () => {
  assert.deepEqual(record(() => sfx.flag(true, 1)), [
    { v: 'noise', dur: 0.025, gain: 0.252, freq: 3200, q: 2, type: 'bandpass' },
    { v: 'tone', freq: 740, dur: 0.06, type: 'square', gain: 0.063 },
    { v: 'tone', freq: 1110, dur: 0.09, type: 'triangle', gain: 0.162, delay: 0.045 },
  ]);
  assert.deepEqual(record(() => sfx.flag(false, 1)), [
    { v: 'noise', dur: 0.03, gain: 0.144, freq: 1400, q: 1.2, type: 'bandpass' },
    { v: 'tone', freq: 620, dur: 0.11, type: 'triangle', gain: 0.22, slideTo: 360 },
  ]);
});

test('Sfx.flag: a mass flag stacks rising steps, the undo the same number falling', () => {
  for (const n of [2, 4, 8, 16, 26]) {
    const { steps } = flagVoice(true, n);
    const up = record(() => sfx.flag(true, n)).slice(3);
    const rising = up.slice(0, steps).map((c) => c.freq);
    assert.equal(rising.length, steps);
    for (let k = 1; k < rising.length; k++) assert.ok(rising[k] > rising[k - 1], `flag ${n}: rising`);
    assert.ok(rising[0] > 1110, 'above the plant');
    const down = record(() => sfx.flag(false, n)).slice(2);
    assert.equal(down.length, steps, `undo ${n}: one falling step per rising one`);
    for (let k = 1; k < down.length; k++) assert.ok(down[k].freq < down[k - 1].freq, `undo ${n}: falling`);
    assert.ok(down[0].freq < 620, 'below the pluck');
    for (let k = 0; k < steps; k++) assert.ok(Math.abs(rising[k] / 1110 - 620 / down[k].freq) < 1e-9, 'the same ratios, mirrored');
  }
  const gains = [2, 4, 8, 16].map((n) => record(() => sfx.flag(true, n))[3].gain);
  for (let k = 1; k < gains.length; k++) assert.ok(gains[k] > gains[k - 1], 'louder the more cells');
});
