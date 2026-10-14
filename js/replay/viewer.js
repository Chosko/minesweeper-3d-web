// The replay viewer screen (replay-playback): opens a replay, verifies it, and plays it on its board
// view under the playback clock — a tool to study a game with: play and pause, speeds from 0.25× to
// 4×, a seek bar ticked at every action, step to the previous or next action and frame by frame, a
// press ring on every click, Show 3BV, sound behind a toggle, a free camera in 3D, and download and
// import of replay files. A shell screen, not a mode: it plays no game of its own, reports nothing to
// records, keeps nothing in the library and is never paused into hiding the board. The logic is
// DOM-free; createReplayView binds the #replay markup handed in.
//
// prepareReplay({ replay, replayId, file }, { library }) → Promise of { ok: true, sim, bytes } or
//   { ok: false, reason, message }: the replay — a blob, a replay object, or the results hand-off's
//   { blob } —, the replay id fetched from the replay library (js/replay/library.js bytes), or a
//   picked replay file (a File: refused unread over MAX_REPLAY_FILE_BYTES), verified
//   (js/replay/verify.js) and opened in a simulator (js/replay/simulator.js); bytes the replay's
//   blob as stored or handed over (a replay object's encoding). Refused with `reason`:
//     'newer'           a newer format or rules version — FAILURES.newer
//     'unreproducible'  verification found a check value that differs — FAILURES.unreproducible
//     'unreadable'      anything else, a missing or unreadable stored replay, a file over the cap
//                       or one that cannot be read too — FAILURES.unreadable
//
// The timeline. Playback opens on the start position — the closed board, no action applied — at
// game time -LEAD_IN_MS (js/replay/clock.js): through the lead-in the board stays closed and the
// clock reads 00.000; at game time 0 the time-0 actions (the first click, and a 3D game's flags
// before it) play as the first action. From then on every seek applies every action with time ≤ t.
// No format change: the recording already holds the first click as the time-0 reveal.
//
// clockText(ms) → the replay clock as seconds to the thousandth, truncated, seconds not split into
//   minutes: "13.342", "00.000".
// overlayFigures(frame, ms) → { clock, mines, bbbv, rate }: the clock, mines left in the overlay's
//   counter format, "3BV solved / 3BV" and 3BV/s so far (3BV solved over the replay time, two
//   decimals; DASH at 0), read from a simulator frame at game time ms (≥ 0).
// endLine(check) → { outcome, time, text }: the outcome and the recorded time in the results screen's
//   time format (js/results/view.js formatTime), shown once the replay reaches its end.
// pauseMarks(pauses, duration, leadIn?) → [{ left, width }]: each of the header's paused spans as a
//   mark on the seek bar track, its position and width in percent of the timeline (the duration
//   after a lead-in of leadIn, 0 when not given).
// pausesText(pauses) → the seek bar's text alternative naming them, "Paused 2 times, 4.1 s in all";
//   '' for none. Playback runs through a paused span like any other stretch: the game clock ran
//   through it, so it is a gap in the actions, played at the chosen speed with the board as it was.
// seekTicks(actions, duration, leadIn, px) → [{ left, kind }]: one tick per action ({ time, kind })
//   at its place on the timeline, left in percent; over a bar px pixels wide, a tick less than a
//   pixel from the last kept one of its own kind merges into it, so a different kind beside it
//   always shows.
// actionCue(kind, outcome) → [[method, ...args]]: the sound cue the game plays for an action's
//   outcome (js/replay/simulator.js outcome(i)) — as the 3D game's actionSounds / endGame and
//   Classic 2D's cue map it: a flag click flag(on, count); a click that loses explode(); a reveal or
//   a chord that opens cells reveal(n) / chord(n); one that changes nothing in play noop(); then a
//   win's win().
// replayCode(replay) → the game's board code in its game form (js/records/board-code.js), built from
//   the header's board, seed and generator version and the first reveal in the action stream — no
//   format change; an imported replay shows its code too. Null without a reveal.
// regionTints(partition, graph, cycle) → Int16Array: Show 3BV's paint of the engine's 3BV partition
//   (js/engine/metrics.js bbbvPartition) — each opening one tint 0 .. cycle - 1, coloured greedily
//   so openings sharing a border number differ while the cycle allows, each isolated number the
//   mark `cycle`, a mine -1.
//
// createReplayViewer({ library, router, view, viewers?, sound?, files? }) → viewer
//   view     the screen binder: open(), close(), loading(), failed(message), ready({ duration,
//            leadIn, kind, pauses, actions, code }) → the board area, render(state); pauses are the
//            header's pause spans, actions the replay's [{ time, kind }], code replayCode's.
//   viewers  { [graph kind]: ({ container, sim }) → { draw(frame, { playing }), place?(),
//            setScale?(scale), press?(actions), still?(), showBbbv?(tints), setFree?(on),
//            destroy() } }: draw is told whether playback drew the frame (a seek did not); place()
//            runs on the frames that draw nothing, to follow a board view that refitted; press
//            shows a press ring for each action [{ index, time, kind, cell }]; still() says
//            playback paused; showBbbv hands Show 3BV's tints (regionTints, null to clear);
//            setFree switches a 3D camera between Free and Follow. Classic 2D's square is
//            js/replay/viewer-2d.js; the 3D box is js/replay/viewer-3d.js, which js/main.js mounts on
//            its renderer, and offers only with WebGL 2. A 3D (box) replay with no viewer says
//            FAILURES.webgl2; any other replay with no viewer for its graph says FAILURES.unsupported.
//            A mount that leaves the screen (a lost graphics context) is destroyed and nothing plays.
//   sound    the sound sink (js/audio.js's sfx: reveal, flag, chord, noop, explode, win), so the
//            master volume and mute apply; without one the viewer is silent.
//   files    { save(bytes, name) }, the shell's download.
//   show({ replay?, replayId?, file?, returnTo? }) → Promise once the replay plays or has failed;
//            returnTo the { screen, data } Back goes to (the main menu when none). The replay starts
//            paused at the start position, at 1×, Show 3BV off and the camera on Follow.
//   hide()   drops the replay; one still loading is ignored when it arrives.
//   setScale(scale)  the board scale setting changed: the mounted viewer refits (setScale).
//   tick(ms) once per frame with the frame's wall-clock ms: advances the clock while playing and
//            draws the simulator at the clock's time; while paused, only the viewer's place().
// seekStep(duration) → the seek bar's step in ms: 1% of the replay, at least SEEK_STEP_MIN_MS, so a
//   keyboard arrow or a controller step crosses any replay in a hundred steps.
//   command(name) one of COMMANDS: toggle (play / pause; at the end, play from the start position),
//            prev and next (the action before or after the current time — from the start position
//            next is the time-0 actions applied, and prev from them the start position; both
//            pause), framePrev and frameNext (one movement sampling interval, the replay's
//            sampleIntervalMs, back or on, clamped; both pause), start (the start position), end,
//            slower, faster, bbbv (Show 3BV on / off), camera (a 3D replay's Follow / Free; nothing
//            in 2D), sound (on / off, kept for the session). seek(ms) to a game time (-LEAD_IN_MS ..
//            duration), setSpeed(s) — one of SPEEDS (js/replay/clock.js).
//   Press rings and cues. Each action playback reaches going forward shows its press ring; a seek or
//            a step shows the ring of the actions at the time it lands on, and none for those it
//            crosses. With sound on, each action playback reaches going forward at 2× or slower
//            plays its cue (actionCue), as does a step or a seek forward onto an action; nothing
//            else plays one.
//   download() saves the replay playing (its bytes, under js/records/replay-list.js
//            replayFileName) through files.save → the name, or null when none plays.
//   openFile(file) shows that file, Back going where this replay's Back went.
//   key(code) → whether REPLAY_KEYS took it; pad(pressed) → whether a REPLAY_PAD button was pressed,
//            `pressed(button)` the shell's held-suppressed press test.
//   back()   routes to returnTo. defaultFocus() → the screen's default focus target.
//   state    { status: 'closed' | 'loading' | 'ready' | 'failed', message, kind, time (game time,
//            negative through the lead-in), duration, leadIn, playing, speed, ended, figures, end,
//            bbbv, sound, camera ('follow' | 'free' in 3D, else null) } — what render(state) is
//            handed.
//
// createReplayView({ root, win?, onCommand, onSpeed, onSeek, onBack, onDownload?, onOpen?, onCopy? }) → the
// view above, filling #replay by id: the overlay bar (#rp-clock, #rp-mines, #rp-bbbv, #rp-rate,
// Back #rp-back), the board area #replay-board — the room between the bar and the controls, each
// measured from its real size when the replay shows and again whenever either changes size, with
// 16 px (--space-4) beside each —, the message card #replay-message (loading or failure, its Back
// #replay-message-back), and the controls #replay-controls (#rp-prev, #rp-play, #rp-next, the speed
// choice #rp-speed, the seek bar #rp-seek over the timeline with its pause marks #rp-pauses, their
// text alternative #rp-pauses-text and its action ticks #rp-ticks, the position #rp-position, the
// toggles #rp-show-bbbv, #rp-sound and #rp-camera (3D only), #rp-download, #rp-open, the code chip
// #rp-code (its Copy and Copy link call onCopy; hidden while loading, failed or with no code), the key line
// #rp-keys (REPLAY_KEY_LINE, 3D only: a 2D board keeps its room) and the end line #replay-end). While a replay loads or has failed,
// nothing of one shown earlier stays: the figures read DASH and the position, the seek bar, its
// marks and ticks and the end line are cleared. A 3D replay marks #replay replay--scene, which lets
// the 3D scene behind it show. While it shows, REPLAY_KEYS typed anywhere but in a field reach
// onCommand; Space and Enter on a button keep their own click.

import { createSimulator, REFUSAL } from './simulator.js';
import { verify } from './verify.js';
import { encodeReplay } from './format.js';
import { createPlaybackClock, SPEEDS, LEAD_IN_MS } from './clock.js';
import { mountViewer2D } from './viewer-2d.js';
import { formatMineCount, bindSegmented, bindCodeChip } from '../ui/components.js';
import { codeOf } from '../records/board-code.js';
import { formatTime, formatRate, DASH } from '../results/view.js';
import { BTN } from '../gamepad.js';
import { REPLAY_SCREEN, replayFileName } from '../records/replay-list.js';
import { boardKey } from '../records/board.js';
import { bbbvPartition } from '../engine/metrics.js';

export { LEAD_IN_MS };

/** What the viewer says when a replay cannot be played. */
export const FAILURES = Object.freeze({
  newer: 'This replay was made by a newer version of the game.',
  unreproducible: 'This replay can no longer be reproduced on this version of the game.',
  unreadable: 'This replay cannot be read.',
  unsupported: 'This replay cannot be played here yet.',
  webgl2: 'This 3D replay needs WebGL 2, which is not available in this browser.',
});

export const COMMANDS = Object.freeze(['toggle', 'prev', 'next', 'framePrev', 'frameNext', 'start', 'end', 'slower', 'faster', 'bbbv', 'camera', 'sound']);

/** Keyboard shortcuts while the viewer shows: key code → command. */
export const REPLAY_KEYS = Object.freeze({
  Space: 'toggle', KeyK: 'toggle', ArrowLeft: 'prev', ArrowRight: 'next', Comma: 'framePrev', Period: 'frameNext',
  Home: 'start', End: 'end', Minus: 'slower', Equal: 'faster', KeyB: 'bbbv', KeyC: 'camera',
});

/** Controller buttons while the viewer shows: [button, command]; the rest navigates the screen as a menu. */
export const REPLAY_PAD = Object.freeze([
  [BTN.START, 'toggle'], [BTN.Y, 'toggle'], [BTN.LB, 'prev'], [BTN.RB, 'next'], [BTN.LT, 'slower'], [BTN.RT, 'faster'],
].map((e) => Object.freeze(e)));

/** The viewer's key line: the replay keys, their controller buttons where they have one; `only` a graph kind. */
export const REPLAY_KEY_LINE = Object.freeze([
  { keys: 'Space / K', pad: 'Start / Y', label: 'Play' },
  { keys: '← / →', pad: 'LB / RB', label: 'Action' },
  { keys: ', / .', pad: null, label: 'Frame' },
  { keys: 'Home / End', pad: null, label: 'Start / End' },
  { keys: '− / =', pad: 'LT / RT', label: 'Speed' },
  { keys: 'B', pad: null, label: 'Show 3BV' },
  { keys: 'C', pad: null, label: 'Free camera', only: 'box' },
].map((e) => Object.freeze(e)));

/** The largest replay file Open replay file reads. */
export const MAX_REPLAY_FILE_BYTES = 16 * 1024 * 1024;
/** Show 3BV's opening tints (--color-replay-bbbv-1 .. 6); the isolated numbers' mark comes after them. */
export const BBBV_TINTS = 6;

const OUTCOMES = Object.freeze({ won: 'Won', lost: 'Lost', abandoned: 'Abandoned' });

/** The smallest seek bar step. */
export const SEEK_STEP_MIN_MS = 100;

export function seekStep(duration) { return Math.max(SEEK_STEP_MIN_MS, Math.round(duration / 100)); }

export function clockText(ms) {
  const whole = Math.max(0, Math.floor(ms));
  return `${String(Math.floor(whole / 1000)).padStart(2, '0')}.${String(whole % 1000).padStart(3, '0')}`;
}

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

export function pauseMarks(pauses, duration, leadIn = 0) {
  const total = duration + leadIn;
  const pct = (ms) => (total > 0 ? (100 * ms) / total : 0);
  return pauses.map((p) => ({ left: pct(p.start + leadIn), width: pct(p.end - p.start) }));
}

export function pausesText(pauses) {
  if (pauses.length === 0) return '';
  const total = pauses.reduce((sum, p) => sum + (p.end - p.start), 0);
  return `Paused ${pauses.length === 1 ? 'once' : `${pauses.length} times`}, ${(total / 1000).toFixed(1)} s in all`;
}

export function seekTicks(actions, duration, leadIn, px) {
  const total = duration + leadIn;
  if (total <= 0) return [];
  const last = new Map();
  const ticks = [];
  for (const a of actions) {
    const x = ((a.time + leadIn) / total) * px;
    const before = last.get(a.kind);
    if (before !== undefined && x - before < 1) continue;
    last.set(a.kind, x);
    ticks.push({ left: (100 * (a.time + leadIn)) / total, kind: a.kind });
  }
  return ticks;
}

export function actionCue(kind, { changed, count, before, after }) {
  const cues = [];
  if (changed === 0) {
    if (before === 'playing' && after === 'playing') cues.push(['noop']);
    return cues;
  }
  if (kind === 'flag') cues.push(['flag', count >= changed - count, changed]);
  else if (after === 'lost') cues.push(['explode']);
  else if (count > 0) cues.push([kind === 'chord' ? 'chord' : 'reveal', count]);
  if (after === 'won' && before !== 'won') cues.push(['win']);
  return cues;
}

export function regionTints({ label, openings }, graph, cycle = BBBV_TINTS) {
  const n = graph.count;
  const tints = new Int16Array(n).fill(-1);
  // Openings that share a border number are neighbours.
  const near = Array.from({ length: openings }, () => new Set());
  const around = new Set();
  for (let c = 0; c < n; c++) {
    if (label[c] < 0 || label[c] >= openings) continue;
    around.clear();
    graph.forEachNeighbour(c, (nb) => { const l = label[nb]; if (l >= 0 && l < openings && l !== label[c]) around.add(l); });
    for (const l of around) { near[label[c]].add(l); near[l].add(label[c]); }
  }
  const colour = new Int16Array(openings).fill(-1);
  for (let id = 0; id < openings; id++) {
    const used = new Set();
    for (const o of near[id]) if (colour[o] >= 0) used.add(colour[o]);
    let k = 0;
    while (k < cycle && used.has(k)) k++;
    colour[id] = k < cycle ? k : id % cycle;
  }
  for (let c = 0; c < n; c++) {
    const l = label[c];
    if (l >= 0) tints[c] = l < openings ? colour[l] : cycle;
  }
  return tints;
}

const failure = (reason) => ({ ok: false, reason, message: FAILURES[reason] });
const isBytes = (x) => x instanceof Uint8Array || x instanceof ArrayBuffer;

async function readFile(file) {
  if (!file || typeof file.size !== 'number' || file.size > MAX_REPLAY_FILE_BYTES) return null;
  try {
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

export async function prepareReplay({ replay, replayId, file } = {}, { library } = {}) {
  let input = replay && !isBytes(replay) && replay.blob ? replay.blob : replay;
  if (file !== undefined && file !== null) {
    input = await readFile(file);
    if (!input) return failure('unreadable');
  }
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
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : isBytes(input) ? input : encodeReplay(input);
  return { ok: true, sim: createSimulator(input), bytes };
}

const CLOSED = Object.freeze({
  status: 'closed', message: null, kind: null, time: 0, duration: 0, leadIn: LEAD_IN_MS, playing: false, speed: 1, ended: false,
  figures: null, end: null, bbbv: false, camera: null,
});

export function createReplayViewer({ library, router, view, viewers = { square: mountViewer2D }, sound = null, files = null }) {
  let opening = 0; // which show() is current; a stale load is dropped
  let status = 'closed';
  let message = null;
  let returnTo = null;
  let sim = null;
  let bytes = null;
  let clock = null; // over the timeline: game time is clock.time - LEAD_IN_MS
  let board = null;
  let frame = null;
  let frameAt = null; // the clock time the frame was drawn at
  let wasPlaying = false;
  let bbbv = false;
  let tints = null;
  let free = false;
  let soundOn = false; // kept for the session

  const refocus = () => { if (router.current === REPLAY_SCREEN) router.refocus(); };
  const kind = () => sim?.replay.header.graph.kind ?? null;
  const gameTime = () => clock.time - LEAD_IN_MS;
  const seekGame = (g) => clock.seek(g + LEAD_IN_MS);

  function state() {
    if (status !== 'ready') return { ...CLOSED, status, message, sound: soundOn };
    const g = gameTime();
    return {
      status, message: null, kind: kind(), time: g, duration: sim.duration, leadIn: LEAD_IN_MS, playing: clock.playing,
      speed: clock.speed, ended: clock.ended, figures: overlayFigures(frame, Math.max(0, g)),
      end: clock.ended ? endLine(sim.replay.check) : null, bbbv, sound: soundOn, camera: kind() === 'box' ? (free ? 'free' : 'follow') : null,
    };
  }

  // The actions a move from `before` to `after` actions applied reaches: every one playback passes,
  // or the ones at the time a seek or a step lands on.
  function reached(before, after, g, playing) {
    const { actions } = sim.replay;
    const list = [];
    if (playing) {
      for (let i = before; i < after; i++) list.push(i);
    } else if (g >= 0) {
      for (let i = after - 1; i >= 0 && actions[i].time === g; i--) list.unshift(i);
    }
    if (list.length === 0) return;
    board.press?.(list.map((i) => ({ index: i, ...actions[i] })));
    if (!soundOn || !sound) return;
    if (playing ? clock.speed > 2 : after <= before) return;
    for (const i of list) {
      if (i < before) continue;
      const outcome = sim.outcome(i);
      if (outcome) for (const [method, ...args] of actionCue(actions[i].kind, outcome)) sound[method]?.(...args);
    }
  }

  // Draws the simulator at the clock's time when it moved, then shows the state.
  function render(playing = false) {
    if (status !== 'ready') return;
    if (frameAt !== clock.time) {
      const before = frame ? frame.index : 0;
      const g = gameTime();
      frame = g < 0 ? sim.seekIndex(0) : sim.seek(g);
      frameAt = clock.time;
      board.draw(frame, { playing });
      reached(before, frame.index, g, playing);
    }
    if (wasPlaying && !clock.playing) board.still?.();
    wasPlaying = clock.playing;
    view.render(state());
  }

  function release() {
    board?.destroy();
    board = null;
    sim = null;
    bytes = null;
    clock = null;
    frame = null;
    frameAt = null;
    wasPlaying = false;
    bbbv = false;
    tints = null;
    free = false;
  }

  function step(dir) {
    clock.pause();
    const { actions } = sim.replay;
    const g = gameTime();
    if (dir > 0) {
      if (g < 0) { seekGame(sim.length ? actions[0].time : sim.duration); return; }
      const applied = sim.indexAt(g);
      seekGame(applied < sim.length ? actions[applied].time : sim.duration);
      return;
    }
    if (g < 0) return;
    const applied = sim.indexAt(g);
    if (applied === 0) { seekGame(-LEAD_IN_MS); return; }
    const before = sim.indexAt(actions[applied - 1].time - 1);
    seekGame(before > 0 ? actions[before - 1].time : -LEAD_IN_MS);
  }

  function frameStep(dir) {
    clock.pause();
    clock.seek(clock.time + dir * sim.replay.sampleIntervalMs);
  }

  function toggleBbbv() {
    bbbv = !bbbv;
    if (bbbv && !tints) {
      const { graph } = sim.grid;
      const { mine, number } = sim.game.state;
      tints = regionTints(bbbvPartition(graph, mine, number), graph);
    }
    board.showBbbv?.(bbbv ? tints : null);
  }

  function toggleCamera() {
    if (kind() !== 'box') return;
    free = !free;
    board.setFree?.(free);
  }

  const viewer = {
    get state() { return state(); },
    async show({ replay, replayId, file, returnTo: to } = {}) {
      release();
      const mine = ++opening;
      returnTo = to ?? null;
      status = 'loading';
      message = null;
      view.open();
      view.loading();
      const prepared = await prepareReplay({ replay, replayId, file }, { library });
      if (mine !== opening) return;
      const graphKind = prepared.ok ? prepared.sim.replay.header.graph.kind : null;
      const mount = prepared.ok ? viewers[graphKind] : null;
      if (!prepared.ok || !mount) {
        status = 'failed';
        message = !prepared.ok ? prepared.message : graphKind === 'box' ? FAILURES.webgl2 : FAILURES.unsupported;
        view.failed(message);
        refocus();
        return;
      }
      sim = prepared.sim;
      bytes = prepared.bytes;
      clock = createPlaybackClock({ duration: sim.duration + LEAD_IN_MS });
      const { graph, pauses } = sim.replay.header;
      const actions = sim.replay.actions.map(({ time, kind: k }) => ({ time, kind: k }));
      const container = view.ready({ duration: sim.duration, leadIn: LEAD_IN_MS, kind: graph.kind, pauses, actions, code: replayCode(sim.replay) });
      status = 'ready';
      const mounted = mount({ container, sim });
      if (mine !== opening) { mounted.destroy(); return; } // mounting left the screen (a lost graphics context)
      board = mounted;
      render();
      refocus();
    },
    setScale(scale) {
      board?.setScale?.(scale);
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
      render(true);
    },
    command(name) {
      if (name === 'sound') { soundOn = !soundOn; if (status === 'ready') render(); else view.render?.(state()); return; }
      if (status !== 'ready') return;
      if (name === 'toggle') clock.toggle();
      else if (name === 'prev') step(-1);
      else if (name === 'next') step(1);
      else if (name === 'framePrev') frameStep(-1);
      else if (name === 'frameNext') frameStep(1);
      else if (name === 'start') clock.seek(0);
      else if (name === 'end') clock.seek(clock.duration);
      else if (name === 'slower') clock.slower();
      else if (name === 'faster') clock.faster();
      else if (name === 'bbbv') toggleBbbv();
      else if (name === 'camera') toggleCamera();
      else throw new RangeError(`unknown replay command ${name}`);
      render();
    },
    seek(ms) {
      if (status !== 'ready') return;
      seekGame(ms);
      render();
    },
    setSpeed(s) {
      if (status !== 'ready') return;
      clock.setSpeed(s);
      render();
    },
    download() {
      if (status !== 'ready' || !bytes) return null;
      const { header } = sim.replay;
      const name = replayFileName(boardKey(header.board), header.endedAt);
      files?.save(bytes, name);
      return name;
    },
    openFile(file) {
      return viewer.show({ file, returnTo });
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

export function replayCode(replay) {
  const header = replay?.header;
  const first = replay?.actions?.find((a) => a.kind === 'reveal');
  if (!header || !first) return null;
  return codeOf({ board: header.board, seed: header.seed, generatorVersion: header.generatorVersion, startCell: first.cell });
}

const IN_FIELD = 'input, select, textarea';
/** The room between the board area and the overlay bar or the controls (--space-4). */
const BOARD_GAP = 16;

export function createReplayView({
  root, win = globalThis, onCommand, onSpeed, onSeek, onBack, onDownload = () => {}, onOpen = () => {}, onCopy = () => {},
}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const el = {
    clock: $('rp-clock'), mines: $('rp-mines'), bbbv: $('rp-bbbv'), rate: $('rp-rate'),
    board: $('replay-board'), message: $('replay-message'), messageTitle: $('replay-message-title'), messageText: $('replay-message-text'),
    controls: $('replay-controls'), play: $('rp-play'), prev: $('rp-prev'), next: $('rp-next'), speed: $('rp-speed'),
    seek: $('rp-seek'), position: $('rp-position'), end: $('replay-end'), pauses: $('rp-pauses'), pausesText: $('rp-pauses-text'),
    ticks: $('rp-ticks'), keys: $('rp-keys'), showBbbv: $('rp-show-bbbv'), sound: $('rp-sound'), camera: $('rp-camera'),
    download: $('rp-download'), open: $('rp-open'),
  };
  const code = $('rp-code') ? bindCodeChip($('rp-code'), { onCopy: (c) => onCopy(c) }) : null;
  const options = [...el.speed.querySelectorAll('.ui-segmented__option')];
  const doc = root.ownerDocument;
  const shown = {};
  const set = (key, node, text) => { if (shown[key] !== text) { node.textContent = text; shown[key] = text; } };
  let seeking = false;
  let timeline = null; // { duration, leadIn, actions } of the replay shown

  const click = (node, fn) => { node.addEventListener('click', fn); return () => node.removeEventListener('click', fn); };
  const unbind = [
    click($('rp-back'), () => onBack()),
    click($('replay-message-back'), () => onBack()),
    click(el.play, () => onCommand('toggle')),
    click(el.prev, () => onCommand('prev')),
    click(el.next, () => onCommand('next')),
    click(el.showBbbv, () => onCommand('bbbv')),
    click(el.sound, () => onCommand('sound')),
    click(el.camera, () => onCommand('camera')),
    click(el.download, () => onDownload()),
    click(el.open, () => onOpen()),
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

  // The ticks: one per action over the seek bar's track, merged under a pixel at its width now.
  const drawTicks = () => {
    if (!timeline) { el.ticks.replaceChildren(); return; }
    const px = el.ticks.getBoundingClientRect?.().width || el.seek.getBoundingClientRect?.().width || 0;
    el.ticks.replaceChildren(...seekTicks(timeline.actions, timeline.duration, timeline.leadIn, px).map(({ left, kind }) => {
      const tick = doc.createElement('span');
      tick.className = `replay-tick replay-tick--${kind}`;
      tick.style.left = `${left}%`;
      return tick;
    }));
  };

  // The board area: below the overlay bar and above the controls, as measured now.
  const bar = root.querySelector('.replay-bar');
  let tickWidth = -1;
  const fitBoard = () => {
    if (el.controls.classList.contains('hidden')) return;
    const box = root.getBoundingClientRect();
    const top = bar ? bar.getBoundingClientRect().bottom - box.top : 0;
    const bottom = box.bottom - el.controls.getBoundingClientRect().top;
    el.board.style.top = `${Math.round(top) + BOARD_GAP}px`;
    el.board.style.bottom = `${Math.round(bottom) + BOARD_GAP}px`;
    const w = el.ticks.getBoundingClientRect().width;
    if (w !== tickWidth) { tickWidth = w; drawTicks(); }
  };
  const sizes = win.ResizeObserver ? new win.ResizeObserver(fitBoard) : null;

  // Nothing of a replay shown earlier: the figures read DASH, the bar is empty.
  const clear = () => {
    timeline = null;
    tickWidth = -1;
    for (const [key, node] of [['clock', el.clock], ['mines', el.mines], ['bbbv', el.bbbv], ['rate', el.rate]]) set(key, node, DASH);
    set('position', el.position, '');
    set('end', el.end, '');
    el.end.classList.add('hidden');
    el.seek.min = '0';
    el.seek.max = '0';
    el.seek.value = '0';
    el.seek.removeAttribute('aria-valuetext');
    el.pauses.replaceChildren();
    el.pausesText.textContent = '';
    el.pausesText.hidden = true;
    el.ticks.replaceChildren();
  };

  const card = (title, text) => {
    root.classList.remove('replay--scene');
    clear();
    el.messageTitle.textContent = title;
    el.messageText.textContent = text;
    el.messageText.classList.toggle('hidden', !text);
    el.message.classList.remove('hidden');
    el.controls.classList.add('hidden');
  };

  // The key line shows over a 3D replay, in place of the game's chips; a 2D board keeps the room.
  const keyLine = (kind) => {
    el.keys.classList.toggle('hidden', kind !== 'box');
    el.keys.replaceChildren(...REPLAY_KEY_LINE.filter((k) => !k.only || k.only === kind).map((k) => {
      const item = doc.createElement('span');
      item.className = 'replay-key';
      const keys = doc.createElement('kbd');
      keys.textContent = k.keys;
      item.append(keys);
      if (k.pad) {
        const pad = doc.createElement('kbd');
        pad.className = 'replay-key__pad';
        pad.textContent = k.pad;
        item.append(' ', pad);
      }
      item.append(` ${k.label}`);
      return item;
    }));
  };

  const pressed = (node, on) => node.setAttribute('aria-pressed', String(on));

  return {
    open() {
      root.classList.remove('hidden');
      win.addEventListener('keydown', onKey);
      sizes?.observe(el.controls);
      if (bar) sizes?.observe(bar);
    },
    close() {
      win.removeEventListener('keydown', onKey);
      sizes?.disconnect();
      root.classList.add('hidden');
      root.classList.remove('replay--scene');
      el.message.classList.add('hidden');
      for (const k of Object.keys(shown)) delete shown[k];
      timeline = null;
    },
    loading() { code?.show(null); card('Opening the replay…', ''); },
    failed(message) { code?.show(null); card('This replay cannot be played', message); },
    ready({ duration, leadIn = 0, kind, pauses = [], actions = [], code: boardCode = null }) {
      code?.show(boardCode);
      root.classList.toggle('replay--scene', kind === 'box');
      el.message.classList.add('hidden');
      el.controls.classList.remove('hidden');
      el.camera.classList.toggle('hidden', kind !== 'box');
      const step = seekStep(duration);
      el.seek.step = String(step);
      el.seek.min = String(-leadIn);
      el.seek.max = String(Math.ceil((duration + leadIn) / step) * step - leadIn); // the clock clamps past the end
      el.pauses.replaceChildren(...pauseMarks(pauses, duration, leadIn).map(({ left, width }) => {
        const mark = doc.createElement('span');
        mark.className = 'replay-pause';
        mark.style.left = `${left}%`;
        mark.style.width = `${width}%`;
        return mark;
      }));
      el.pausesText.textContent = pausesText(pauses);
      el.pausesText.hidden = pauses.length === 0;
      timeline = { duration, leadIn, actions };
      keyLine(kind);
      fitBoard();
      drawTicks();
      return el.board;
    },
    render(state) {
      pressed(el.sound, state.sound === true);
      const f = state.figures;
      if (!f) return;
      set('clock', el.clock, f.clock);
      set('mines', el.mines, f.mines);
      set('bbbv', el.bbbv, f.bbbv);
      set('rate', el.rate, f.rate);
      set('play', el.play, state.playing ? 'Pause' : 'Play');
      set('position', el.position, `${f.clock} / ${clockText(state.duration)}`);
      if (!seeking && Number(el.seek.value) !== Math.round(state.time)) el.seek.value = String(Math.round(state.time));
      const at = Math.max(0, state.time);
      el.seek.setAttribute('aria-valuetext', `${formatTime(at)} of ${formatTime(state.duration)}`);
      const speed = SPEEDS.indexOf(state.speed);
      options.forEach((o, i) => { o.setAttribute('aria-checked', String(i === speed)); o.tabIndex = i === speed ? 0 : -1; });
      pressed(el.showBbbv, state.bbbv === true);
      pressed(el.camera, state.camera === 'free');
      set('end', el.end, state.end ? state.end.text : '');
      el.end.classList.toggle('hidden', !state.end);
    },
    destroy() {
      win.removeEventListener('keydown', onKey);
      sizes?.disconnect();
      for (const u of unbind) u();
    },
  };
}
