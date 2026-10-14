// The replay viewer's playback clock: replay time advancing at the chosen speed while playing (no DOM).
//
// createPlaybackClock({ duration, speed? }) → clock
//   duration   the replay's length in ms (js/replay/simulator.js `duration`); time runs 0 .. duration.
//   time       the replay time in ms; playing, speed, ended (time has reached the duration)
//   advance(ms) the frame's wall-clock milliseconds: while playing, time moves on by ms × speed and
//               stops at the duration, where playing ends; returns the time
//   play()     plays; a clock at its end starts again from the beginning
//   pause(), toggle()
//   setSpeed(s) one of SPEEDS, else a RangeError; faster() / slower() the next speed up or down,
//               held at the ends of SPEEDS
//   seek(t)    moves to t, clamped to 0 .. duration; playing stops at the end
// The viewer drives the simulator and the movement interpolation from `time` once per frame.
//
// The timeline a viewer plays opens with LEAD_IN_MS of replay time before the game's time 0: the
// viewer's clock runs over the replay's duration plus the lead-in, game time being the clock's time
// less LEAD_IN_MS, so the closed board shows before the time-0 actions play as the first action.

/** The playback speeds, slowest first. */
export const SPEEDS = Object.freeze([0.25, 0.5, 1, 2, 4]);
/** The replay time before the game's time 0 at the start of a viewer's timeline. */
export const LEAD_IN_MS = 500;
export const DEFAULT_SPEED = 1;

const number = (x, what) => {
  if (typeof x !== 'number' || Number.isNaN(x)) throw new RangeError(`${what} must be a number, got ${x}`);
  return x;
};

export function createPlaybackClock({ duration, speed = DEFAULT_SPEED } = {}) {
  const end = Math.max(0, number(duration, 'duration'));
  if (!SPEEDS.includes(speed)) throw new RangeError(`speed must be one of ${SPEEDS.join(', ')}, got ${speed}`);
  let time = 0;
  let rate = speed;
  let playing = false;

  const clock = {
    get duration() { return end; },
    get time() { return time; },
    get speed() { return rate; },
    get playing() { return playing; },
    get ended() { return time >= end; },
    advance(ms) {
      if (playing && ms > 0) {
        time = Math.min(end, time + ms * rate);
        if (time >= end) playing = false;
      }
      return time;
    },
    play() {
      if (time >= end) time = 0;
      playing = end > 0;
    },
    pause() { playing = false; },
    toggle() { if (playing) clock.pause(); else clock.play(); },
    setSpeed(s) {
      if (!SPEEDS.includes(s)) throw new RangeError(`speed must be one of ${SPEEDS.join(', ')}, got ${s}`);
      rate = s;
    },
    faster() { rate = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(rate) + 1)]; },
    slower() { rate = SPEEDS[Math.max(0, SPEEDS.indexOf(rate) - 1)]; },
    seek(t) {
      time = Math.min(end, Math.max(0, number(t, 'replay time')));
      if (time >= end) playing = false;
    },
  };
  return clock;
}
