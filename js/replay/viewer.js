// The replay viewer screen (replay-playback): opens a replay, verifies it, and plays it on its board
// view under the playback clock, with play and pause, speed, a seek bar, step to the previous or next
// action, and an overlay of the replay's figures. A shell screen, not a mode: it plays no game of its
// own, reports nothing to records, plays no sound and is never paused into hiding the board. The
// logic is DOM-free; createReplayView binds the #replay markup handed in.
//
// prepareReplay({ replay, replayId }, { library }) → Promise of { ok: true, sim } or { ok: false,
//   reason, message }: the replay — a blob, a replay object, or the results hand-off's { blob } — or
//   the replay id fetched from the replay library (js/replay/library.js bytes), verified
//   (js/replay/verify.js) and opened in a simulator (js/replay/simulator.js). Refused with `reason`:
//     'newer'           a newer format or rules version — FAILURES.newer
//     'unreproducible'  verification found a check value that differs — FAILURES.unreproducible
//     'unreadable'      anything else, a missing or unreadable stored replay too — FAILURES.unreadable
//
// clockText(ms) → the replay clock in the in-game overlay's timer format (js/ui/components.js
//   formatOverlayTime: whole seconds, three digits, stopping at 999).
// overlayFigures(frame, ms) → { clock, mines, bbbv, rate }: the clock, mines left in the overlay's
//   counter format, "3BV solved / 3BV" and 3BV/s so far (3BV solved over the replay time, two
//   decimals; DASH at 0), read from a simulator frame.
// endLine(check) → { outcome, time, text }: the outcome and the recorded time in the results screen's
//   time format (js/results/view.js formatTime), shown once the replay reaches its end.
//
// createReplayViewer({ library, router, view, viewers? }) → viewer
//   view     the screen binder: open(), close(), loading(), failed(message), ready({ duration, kind })
//            → the board area, render(state).
//   viewers  { [graph kind]: ({ container, sim }) → { draw(frame), place?(), destroy() } }; place()
//            runs on the frames that draw nothing, to follow a board view that refitted. Classic 2D's
//            square is js/replay/viewer-2d.js. A replay with no viewer for its graph says
//            FAILURES.unsupported.
//   show({ replay?, replayId?, returnTo? }) → Promise once the replay plays or has failed; returnTo
//            the { screen, data } Back goes to (the main menu when none). The replay starts paused at
//            its beginning, at 1×.
//   hide()   drops the replay; one still loading is ignored when it arrives.
//   tick(ms) once per frame with the frame's wall-clock ms: advances the clock while playing and
//            draws the simulator at the clock's time; while paused, only the viewer's place().
// seekStep(duration) → the seek bar's step in ms: 1% of the replay, at least SEEK_STEP_MIN_MS, so a
//   keyboard arrow or a controller step crosses any replay in a hundred steps.
//   command(name) one of COMMANDS: toggle (play / pause; at the end, play from the beginning), prev
//            and next (the action before or after the current time; both pause), start, end,
//            slower, faster. seek(ms), setSpeed(s) — one of SPEEDS (js/replay/clock.js).
//   key(code) → whether REPLAY_KEYS took it; pad(pressed) → whether a REPLAY_PAD button was pressed,
//            `pressed(button)` the shell's held-suppressed press test.
//   back()   routes to returnTo. defaultFocus() → the screen's default focus target.
//   state    { status: 'closed' | 'loading' | 'ready' | 'failed', message, time, duration, playing,
//            speed, ended, figures, end } — what render(state) is handed.
//
// createReplayView({ root, win?, onCommand, onSpeed, onSeek, onBack }) → the view above, filling
// #replay by id: the overlay bar (#rp-clock, #rp-mines, #rp-bbbv, #rp-rate, Back #rp-back), the board
// area #replay-board, the message card #replay-message (loading or failure, its Back
// #replay-message-back), and the controls #replay-controls (#rp-prev, #rp-play, #rp-next, the speed
// choice #rp-speed, the seek bar #rp-seek, the end line #replay-end). While it shows, REPLAY_KEYS
// typed anywhere but in a field reach onCommand; Space and Enter on a button keep their own click.

import { createSimulator, REFUSAL } from './simulator.js';
import { verify } from './verify.js';
import { createPlaybackClock, SPEEDS } from './clock.js';
import { mountViewer2D } from './viewer-2d.js';
import { formatOverlayTime, formatMineCount, bindSegmented } from '../ui/components.js';
import { formatTime, formatRate, DASH } from '../results/view.js';
import { BTN } from '../gamepad.js';
import { REPLAY_SCREEN } from '../records/replay-list.js';

/** What the viewer says when a replay cannot be played. */
export const FAILURES = Object.freeze({
  newer: 'This replay was made by a newer version of the game.',
  unreproducible: 'This replay can no longer be reproduced on this version of the game.',
  unreadable: 'This replay cannot be read.',
  unsupported: 'This replay cannot be played here yet.',
});

export const COMMANDS = Object.freeze(['toggle', 'prev', 'next', 'start', 'end', 'slower', 'faster']);

/** Keyboard shortcuts while the viewer shows: key code → command. */
export const REPLAY_KEYS = Object.freeze({
  Space: 'toggle', KeyK: 'toggle', ArrowLeft: 'prev', ArrowRight: 'next', Home: 'start', End: 'end', Minus: 'slower', Equal: 'faster',
});

/** Controller buttons while the viewer shows: [button, command]; the rest navigates the screen as a menu. */
export const REPLAY_PAD = Object.freeze([
  [BTN.START, 'toggle'], [BTN.Y, 'toggle'], [BTN.LB, 'prev'], [BTN.RB, 'next'], [BTN.LT, 'slower'], [BTN.RT, 'faster'],
].map((e) => Object.freeze(e)));

const OUTCOMES = Object.freeze({ won: 'Won', lost: 'Lost', abandoned: 'Abandoned' });

/** The smallest seek bar step. */
export const SEEK_STEP_MIN_MS = 100;

export function seekStep(duration) { return Math.max(SEEK_STEP_MIN_MS, Math.round(duration / 100)); }

export function clockText(ms) { return formatOverlayTime(ms / 1000); }

export function overlayFigures(frame, ms) {
  return {
    clock: clockText(ms),
    mines: formatMineCount(frame.minesLeft),
    bbbv: `${frame.bbbvSolved} / ${frame.bbbv}`,
    rate: ms > 0 ? formatRate(frame.bbbvSolved / (ms / 1000)) : DASH,
  };
}

export function endLine(check) {
  const outcome = OUTCOMES[check.outcome] ?? check.outcome;
  const time = formatTime(check.elapsedMs);
  return { outcome, time, text: `${outcome} · ${time}` };
}

const failure = (reason) => ({ ok: false, reason, message: FAILURES[reason] });

export async function prepareReplay({ replay, replayId } = {}, { library } = {}) {
  let input = replay && !(replay instanceof Uint8Array) && !(replay instanceof ArrayBuffer) && replay.blob ? replay.blob : replay;
  if (input === undefined || input === null) {
    if (replayId === undefined || replayId === null || !library) return failure('unreadable');
    try {
      await library.load?.();
      input = await library.bytes(replayId);
    } catch {
      return failure('unreadable');
    }
    if (!input) return failure('unreadable');
  }
  let checked;
  try {
    checked = verify(input);
  } catch {
    return failure('unreadable');
  }
  if (checked.result === 'refused') return failure(checked.reason === REFUSAL.NEWER ? 'newer' : 'unreadable');
  if (!checked.ok) return failure('unreproducible');
  return { ok: true, sim: createSimulator(input) };
}

const CLOSED = Object.freeze({ status: 'closed', message: null, time: 0, duration: 0, playing: false, speed: 1, ended: false, figures: null, end: null });

export function createReplayViewer({ library, router, view, viewers = { square: mountViewer2D } }) {
  let opening = 0; // which show() is current; a stale load is dropped
  let status = 'closed';
  let message = null;
  let returnTo = null;
  let sim = null;
  let clock = null;
  let board = null;
  let frame = null;

  const refocus = () => { if (router.current === REPLAY_SCREEN) router.refocus(); };

  function state() {
    if (status !== 'ready') return { ...CLOSED, status, message };
    const t = clock.time;
    return {
      status, message: null, time: t, duration: clock.duration, playing: clock.playing, speed: clock.speed, ended: clock.ended,
      figures: overlayFigures(frame, t), end: clock.ended ? endLine(sim.replay.check) : null,
    };
  }

  // Draws the simulator at the clock's time when it moved, then shows the state.
  function render() {
    if (status !== 'ready') return;
    if (!frame || frame.time !== clock.time) {
      frame = sim.seek(clock.time);
      board.draw(frame);
    }
    view.render(state());
  }

  function release() {
    board?.destroy();
    board = null;
    sim = null;
    clock = null;
    frame = null;
  }

  function step(dir) {
    clock.pause();
    const { actions } = sim.replay;
    const t = clock.time;
    const applied = sim.indexAt(t);
    if (dir > 0) clock.seek(applied < sim.length ? actions[applied].time : clock.duration);
    else if (applied > 0) {
      const before = sim.indexAt(actions[applied - 1].time - 1);
      clock.seek(before > 0 ? actions[before - 1].time : 0);
    }
  }

  const viewer = {
    get state() { return state(); },
    async show({ replay, replayId, returnTo: to } = {}) {
      release();
      const mine = ++opening;
      returnTo = to ?? null;
      status = 'loading';
      message = null;
      view.open();
      view.loading();
      const prepared = await prepareReplay({ replay, replayId }, { library });
      if (mine !== opening) return;
      const mount = prepared.ok ? viewers[prepared.sim.replay.header.graph.kind] : null;
      if (!prepared.ok || !mount) {
        status = 'failed';
        message = prepared.ok ? FAILURES.unsupported : prepared.message;
        view.failed(message);
        refocus();
        return;
      }
      sim = prepared.sim;
      clock = createPlaybackClock({ duration: sim.duration });
      const container = view.ready({ duration: sim.duration, kind: sim.replay.header.graph.kind });
      status = 'ready';
      board = mount({ container, sim });
      render();
      refocus();
    },
    hide() {
      opening++;
      release();
      status = 'closed';
      message = null;
      view.close();
    },
    tick(ms) {
      if (status !== 'ready') return;
      if (!clock.playing) { board.place?.(); return; }
      clock.advance(ms);
      render();
    },
    command(name) {
      if (status !== 'ready') return;
      if (name === 'toggle') clock.toggle();
      else if (name === 'prev') step(-1);
      else if (name === 'next') step(1);
      else if (name === 'start') clock.seek(0);
      else if (name === 'end') clock.seek(clock.duration);
      else if (name === 'slower') clock.slower();
      else if (name === 'faster') clock.faster();
      else throw new RangeError(`unknown replay command ${name}`);
      render();
    },
    seek(ms) {
      if (status !== 'ready') return;
      clock.seek(ms);
      render();
    },
    setSpeed(s) {
      if (status !== 'ready') return;
      clock.setSpeed(s);
      render();
    },
    key(code) {
      const name = Object.hasOwn(REPLAY_KEYS, code) ? REPLAY_KEYS[code] : null;
      if (!name) return false;
      viewer.command(name);
      return true;
    },
    pad(pressed) {
      let taken = false;
      for (const [button, name] of REPLAY_PAD) {
        if (pressed(button)) { viewer.command(name); taken = true; }
      }
      return taken;
    },
    back() {
      router.go(returnTo?.screen ?? 'menu', { data: returnTo?.data });
    },
    defaultFocus() {
      return status === 'ready' ? '#rp-play' : '#replay-message-back';
    },
  };
  return viewer;
}

const IN_FIELD = 'input, select, textarea';

export function createReplayView({ root, win = globalThis, onCommand, onSpeed, onSeek, onBack }) {
  const $ = (id) => root.querySelector(`#${id}`);
  const el = {
    clock: $('rp-clock'), mines: $('rp-mines'), bbbv: $('rp-bbbv'), rate: $('rp-rate'),
    board: $('replay-board'), message: $('replay-message'), messageTitle: $('replay-message-title'), messageText: $('replay-message-text'),
    controls: $('replay-controls'), play: $('rp-play'), prev: $('rp-prev'), next: $('rp-next'), speed: $('rp-speed'),
    seek: $('rp-seek'), position: $('rp-position'), end: $('replay-end'),
  };
  const options = [...el.speed.querySelectorAll('.ui-segmented__option')];
  const shown = {};
  const set = (key, node, text) => { if (shown[key] !== text) { node.textContent = text; shown[key] = text; } };
  let seeking = false;

  const click = (node, fn) => { node.addEventListener('click', fn); return () => node.removeEventListener('click', fn); };
  const unbind = [
    click($('rp-back'), () => onBack()),
    click($('replay-message-back'), () => onBack()),
    click(el.play, () => onCommand('toggle')),
    click(el.prev, () => onCommand('prev')),
    click(el.next, () => onCommand('next')),
    bindSegmented(el.speed, { onChange: (value) => onSpeed(Number(value)) }),
  ];
  const onInput = () => { seeking = true; onSeek(Number(el.seek.value)); seeking = false; };
  el.seek.addEventListener('input', onInput);
  unbind.push(() => el.seek.removeEventListener('input', onInput));

  const onKey = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!Object.hasOwn(REPLAY_KEYS, e.code)) return;
    const target = e.target;
    if (target?.closest?.(IN_FIELD)) return;
    if ((e.code === 'Space') && target?.closest?.('button')) return;
    e.preventDefault();
    onCommand(REPLAY_KEYS[e.code]);
  };

  const card = (title, text) => {
    el.messageTitle.textContent = title;
    el.messageText.textContent = text;
    el.messageText.classList.toggle('hidden', !text);
    el.message.classList.remove('hidden');
    el.controls.classList.add('hidden');
  };

  return {
    open() {
      root.classList.remove('hidden');
      win.addEventListener('keydown', onKey);
    },
    close() {
      win.removeEventListener('keydown', onKey);
      root.classList.add('hidden');
      el.message.classList.add('hidden');
      for (const k of Object.keys(shown)) delete shown[k];
    },
    loading() { card('Opening the replay…', ''); },
    failed(message) { card('This replay cannot be played', message); },
    ready({ duration }) {
      el.message.classList.add('hidden');
      el.controls.classList.remove('hidden');
      const step = seekStep(duration);
      el.seek.step = String(step);
      el.seek.max = String(Math.ceil(duration / step) * step); // the clock clamps past the end
      return el.board;
    },
    render(state) {
      const f = state.figures;
      set('clock', el.clock, f.clock);
      set('mines', el.mines, f.mines);
      set('bbbv', el.bbbv, f.bbbv);
      set('rate', el.rate, f.rate);
      set('play', el.play, state.playing ? 'Pause' : 'Play');
      set('position', el.position, `${f.clock} / ${clockText(state.duration)}`);
      if (!seeking && Number(el.seek.value) !== Math.round(state.time)) el.seek.value = String(Math.round(state.time));
      el.seek.setAttribute('aria-valuetext', `${formatTime(state.time)} of ${formatTime(state.duration)}`);
      const speed = SPEEDS.indexOf(state.speed);
      options.forEach((o, i) => { o.setAttribute('aria-checked', String(i === speed)); o.tabIndex = i === speed ? 0 : -1; });
      set('end', el.end, state.end ? state.end.text : '');
      el.end.classList.toggle('hidden', !state.end);
    },
    destroy() {
      win.removeEventListener('keydown', onKey);
      for (const u of unbind) u();
    },
  };
}
