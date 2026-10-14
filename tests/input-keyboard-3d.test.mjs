// Keyboard-only 3D (js/input.js): keyboard look on the arrows through FlyCamera.look with its
// ramped rate (KeyLook), the reveal and flag keys Enter and ' on the mouse's own MouseActions
// (KeyActions), the Input listeners' gating and preventDefault, and the mouse and controller paths
// pinned unchanged. The wiring in js/main.js is checked in a browser through `__ms`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FlyCamera, MouseActions, Input, KeyLook, KeyActions, keyLookDeg,
  KEY_LOOK_START_DEG_PER_S, KEY_LOOK_MAX_DEG_PER_S, KEY_LOOK_RAMP_S, LOOK_DEG_PER_PX,
} from '../js/input.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const suite = browserSuite();
const DEG = Math.PI / 180;
const close = (a, b, what = '', eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} != ${b}`);

/** Hold the arrows (x: -1 left / +1 right, y: -1 up / +1 down) for `seconds` in 60 Hz frames. */
function hold(look, cam, seconds, x, y, step = 1 / 60) {
  let left = seconds;
  while (left > 1e-12) {
    const dt = Math.min(step, left);
    look.update(cam, dt, x, y);
    left -= dt;
  }
}
const camAt = (sensitivity = 1, invertY = false) => {
  const cam = new FlyCamera();
  cam.sensitivity = sensitivity;
  cam.invertY = invertY;
  return cam;
};

// ---------------------------------------------------------------- keyboard look

test('the keyboard look rate starts at 30°/s and ramps linearly to 120°/s over 0.5 s', () => {
  assert.equal(KEY_LOOK_START_DEG_PER_S, 30);
  assert.equal(KEY_LOOK_MAX_DEG_PER_S, 120);
  assert.equal(KEY_LOOK_RAMP_S, 0.5);
  close(keyLookDeg(0), 0, 'nothing at 0 s');
  close(keyLookDeg(1e-6) / 1e-6, 30, 'the rate at the press', 1e-3);
  close((keyLookDeg(0.5) - keyLookDeg(0.5 - 1e-6)) / 1e-6, 120, 'the rate at the end of the ramp', 1e-3);
  close(keyLookDeg(0.7) - keyLookDeg(0.6), 12, 'capped at 120°/s after the ramp');
  close(keyLookDeg(5) - keyLookDeg(4), 120, 'still capped');
});

test('holding an arrow turns 3.9° after 0.1 s, 37.5° after 0.5 s and 97.5° after 1 s at sensitivity 1, twice that at 2', () => {
  for (const [s, deg] of [[0.1, 3.9], [0.5, 37.5], [1, 97.5]]) {
    for (const sens of [1, 2]) {
      const cam = camAt(sens), look = new KeyLook();
      const yaw0 = cam.yaw;
      hold(look, cam, s, 1, 0);
      close((cam.yaw - yaw0) / DEG, deg * sens, `ArrowRight ${s} s at ${sens}`, 1e-6);
      close(cam.pitch, 0, 'no vertical turn');
    }
  }
});

test('the turn does not depend on the frame rate', () => {
  for (const step of [1 / 30, 1 / 60, 1 / 144, 0.1]) {
    const cam = camAt(), look = new KeyLook();
    hold(look, cam, 1, -1, 0, step);
    close((Math.PI - cam.yaw) / DEG, 97.5, `ArrowLeft in ${step} s frames`, 1e-6);
  }
});

test('ArrowLeft / ArrowRight turn left / right and ArrowUp / ArrowDown look up / down, as the mouse does', () => {
  const mouse = camAt(), keys = camAt(), look = new KeyLook();
  mouse.look(10, 0);
  hold(look, keys, 0.1, 1, 0);
  assert.equal(Math.sign(keys.yaw - Math.PI), Math.sign(mouse.yaw - Math.PI), 'right as a mouse moved right');
  const m2 = camAt(), k2 = camAt(), l2 = new KeyLook();
  m2.look(0, -10);
  hold(l2, k2, 0.1, 0, -1);
  assert.ok(k2.pitch < 0, 'ArrowUp looks up (pitch + is down)');
  assert.equal(Math.sign(k2.pitch), Math.sign(m2.pitch), 'up as a mouse moved up');
});

test('Invert Y flips the vertical arrows only', () => {
  const plain = camAt(1, false), inv = camAt(1, true);
  const a = new KeyLook(), b = new KeyLook();
  hold(a, plain, 0.3, 1, 1);
  hold(b, inv, 0.3, 1, 1);
  close(inv.pitch, -plain.pitch, 'pitch flipped');
  close(inv.yaw, plain.yaw, 'yaw unchanged');
});

test('the pitch clamp holds', () => {
  const cam = camAt(3), look = new KeyLook();
  hold(look, cam, 5, 0, -1);
  assert.equal(cam.pitch, -Math.PI / 2);
  hold(look, cam, 5, 0, 1);
  assert.equal(cam.pitch, Math.PI / 2);
});

test('two arrows on both axes look diagonally, each axis on its own ramp; opposite arrows cancel', () => {
  const cam = camAt(), look = new KeyLook();
  hold(look, cam, 0.5, 1, 1);
  close((cam.yaw - Math.PI) / DEG, 37.5, 'yaw', 1e-6);
  close(cam.pitch / DEG, 37.5, 'pitch', 1e-6);
  // the horizontal arrow held on while the vertical one starts again: its ramp starts from the press
  hold(look, cam, 0.1, 1, 0);
  const yaw1 = cam.yaw, pitch1 = cam.pitch;
  hold(look, cam, 0.1, 1, -1);
  close((cam.yaw - yaw1) / DEG, 12, 'the held axis stays at the full rate', 1e-6);
  close((pitch1 - cam.pitch) / DEG, 3.9, 'the new axis starts at the slow rate', 1e-6);
  const before = { yaw: cam.yaw, pitch: cam.pitch };
  hold(look, cam, 0.5, 0, 0);
  assert.deepEqual({ yaw: cam.yaw, pitch: cam.pitch }, before, 'no arrow held: no change');
});

test('a released arrow starts the ramp again at the next press; reset() forgets the hold', () => {
  const cam = camAt(), look = new KeyLook();
  hold(look, cam, 1, 1, 0);
  look.update(cam, 1 / 60, 0, 0);
  const y0 = cam.yaw;
  hold(look, cam, 0.1, 1, 0);
  close((cam.yaw - y0) / DEG, 3.9, 'slow again after a release', 1e-6);
  hold(look, cam, 0.5, 1, 0);
  look.reset();
  const y1 = cam.yaw;
  hold(look, cam, 0.1, 1, 0);
  close((cam.yaw - y1) / DEG, 3.9, 'slow again after reset()', 1e-6);
});

test('keyboard look goes through FlyCamera.look in mouse pixels', () => {
  const calls = [];
  const cam = camAt();
  const orig = cam.look.bind(cam);
  cam.look = (dx, dy) => { calls.push([dx, dy]); orig(dx, dy); };
  const look = new KeyLook();
  look.update(cam, 0.1, -1, 1);
  assert.equal(calls.length, 1);
  close(calls[0][0], -3.9 / LOOK_DEG_PER_PX, 'dx');
  close(calls[0][1], 3.9 / LOOK_DEG_PER_PX, 'dy');
  look.update(cam, 0.1, 0, 0);
  assert.equal(calls.length, 1, 'nothing held: look is not called');
});

// ---------------------------------------------------------------- the reveal and flag keys

/** KeyActions over a real MouseActions, the fired actions recorded. */
function keysSetup(selection = true) {
  const actions = [];
  const mouse = new MouseActions((t) => actions.push(t), () => selection);
  return { mouse, keys: new KeyActions(mouse), actions };
}

test('Enter reveals and \' flags on release', () => {
  const { keys, actions } = keysSetup();
  assert.equal(keys.down('Enter'), true);
  assert.deepEqual(actions, [], 'nothing on the press');
  keys.up('Enter');
  assert.deepEqual(actions, ['left']);
  keys.down('Quote');
  assert.deepEqual(actions, ['left']);
  keys.up('Quote');
  assert.deepEqual(actions, ['left', 'right']);
});

test('Enter + \' chord on the first release, in both release orders, the second release only clears the toggle', () => {
  for (const [first, second] of [['Enter', 'Quote'], ['Quote', 'Enter']]) {
    const { keys, actions } = keysSetup();
    keys.down('Enter');
    keys.down('Quote');
    keys.up(first);
    assert.deepEqual(actions, ['chord'], `${first} released first`);
    keys.up(second);
    assert.deepEqual(actions, ['chord'], 'the second release fires nothing');
  }
});

test('a key release with no press and an auto-repeat do nothing; other keys are not action keys', () => {
  const { keys, actions } = keysSetup();
  keys.up('Enter');
  keys.up('Quote');
  assert.deepEqual(actions, []);
  keys.down('Enter');
  keys.down('Enter', true);
  keys.down('Enter', true);
  keys.up('Enter');
  keys.up('Enter');
  assert.deepEqual(actions, ['left'], 'one press, one action');
  assert.equal(keys.down('KeyF'), false);
  assert.equal(keys.up('KeyD'), false);
  assert.equal(keys.down('NumpadEnter'), false);
});

test('a key mixed with a mouse button chords as two mouse buttons do', () => {
  {
    const { mouse, keys, actions } = keysSetup();
    keys.down('Enter');
    mouse.down(2);
    mouse.up(2);
    keys.up('Enter');
    assert.deepEqual(actions, ['chord'], 'Enter + right button');
  }
  {
    const { mouse, keys, actions } = keysSetup();
    mouse.down(0);
    keys.down('Quote');
    mouse.up(0);
    keys.up('Quote');
    assert.deepEqual(actions, ['chord'], 'left button + \'');
  }
});

test('no selection: the keys fire nothing, as the mouse buttons do', () => {
  const { keys, actions } = keysSetup(false);
  keys.down('Enter'); keys.up('Enter');
  keys.down('Quote'); keys.up('Quote');
  assert.deepEqual(actions, []);
});

// ---------------------------------------------------------------- the Input listeners

function fakeTarget(extra = {}) {
  const l = {};
  return { ...extra, addEventListener(t, f) { (l[t] ??= []).push(f); }, fire(t, e) { for (const f of l[t] ?? []) f(e); } };
}
/** An Input over fake window and document, the actions recorded; state.active / act / look gate it. */
function inputSetup() {
  const saved = { window: globalThis.window, document: globalThis.document };
  const win = fakeTarget();
  const doc = fakeTarget({ hidden: false, pointerLockElement: null });
  globalThis.window = win;
  globalThis.document = doc;
  const actions = [];
  const keysSeen = [];
  const state = { active: true, act: true, look: true };
  const mouse = new MouseActions((t) => actions.push(t), () => true);
  let input;
  try {
    input = new Input({
      canvas: {}, mouse, isActive: () => state.active, canAct: () => state.act, canLook: () => state.look,
      onLook() {}, onWheel() {}, onKey: (code) => keysSeen.push(code),
    });
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
  }
  const fire = (type, code, repeat = false) => {
    const e = { code, repeat, ctrlKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    win.fire(type, e);
    return e;
  };
  return {
    input, mouse, actions, state, keysSeen, win, doc,
    down: (code, repeat) => fire('keydown', code, repeat),
    up: (code) => fire('keyup', code),
  };
}

test('Input: Enter and \' act on release through the shared MouseActions while the keys may act', () => {
  const s = inputSetup();
  const d = s.down('Enter');
  assert.equal(d.defaultPrevented, true, 'Enter does not activate a focused button in play');
  s.down('Enter', true);
  const u = s.up('Enter');
  assert.equal(u.defaultPrevented, true);
  assert.deepEqual(s.actions, ['left']);
  assert.equal(s.down('Quote').defaultPrevented, true, 'no quick find');
  s.down('Enter');
  s.up('Enter');
  s.up('Quote');
  assert.deepEqual(s.actions, ['left', 'chord']);
});

test('Input: where the keys may not act, Enter and \' keep their default and act on nothing, and a press there released in play does nothing', () => {
  const s = inputSetup();
  s.state.act = false;
  assert.equal(s.down('Enter').defaultPrevented, false, 'Enter activates the focused control (the ready card)');
  assert.equal(s.down('Quote').defaultPrevented, false);
  s.state.act = true; // play begins with both keys still held
  s.up('Enter');
  s.up('Quote');
  assert.deepEqual(s.actions, [], 'the ready card\'s Enter does not also reveal');
});

test('Input: releaseAll drops a held key without firing (blur, tab hide, lock loss)', () => {
  for (const drop of [
    (s) => s.input.releaseAll(),
    (s) => s.win.fire('blur', {}),
    (s) => { s.doc.hidden = true; s.doc.fire('visibilitychange', {}); },
  ]) {
    const s = inputSetup();
    s.down('Enter');
    s.down('ArrowLeft');
    drop(s);
    s.up('Enter');
    assert.deepEqual(s.actions, []);
    assert.deepEqual(s.input.lookKeys, { x: 0, y: 0 }, 'the arrows are dropped too');
  }
});

test('Input: the arrows are tracked as look axes, their default prevented only where keyboard look works, and they still reach onKey', () => {
  const s = inputSetup();
  assert.deepEqual(s.input.lookKeys, { x: 0, y: 0 });
  assert.equal(s.down('ArrowRight').defaultPrevented, true, 'no page scroll in play');
  assert.deepEqual(s.input.lookKeys, { x: 1, y: 0 });
  s.down('ArrowUp');
  assert.deepEqual(s.input.lookKeys, { x: 1, y: -1 });
  s.down('ArrowLeft');
  assert.deepEqual(s.input.lookKeys, { x: 0, y: -1 }, 'opposite arrows cancel');
  s.down('ArrowDown');
  assert.deepEqual(s.input.lookKeys, { x: 0, y: 0 });
  s.up('ArrowLeft'); s.up('ArrowUp');
  assert.deepEqual(s.input.lookKeys, { x: 1, y: 1 });
  s.up('ArrowRight'); s.up('ArrowDown');
  s.state.look = false;
  assert.equal(s.down('ArrowDown').defaultPrevented, false, 'menus and cards keep their focus moves');
  assert.ok(s.keysSeen.includes('ArrowDown'));
});

test('Input: no 3D key changes meaning — the game keys, Home / R, X, F2, H, M, F and Esc are not action or look keys', () => {
  const s = inputSetup();
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'Space', 'ControlLeft',
    'KeyH', 'KeyM', 'KeyF', 'Escape', 'KeyR', 'Home', 'KeyX', 'F2']) {
    s.down(code);
    s.up(code);
  }
  assert.deepEqual(s.actions, []);
  assert.deepEqual(s.input.lookKeys, { x: 0, y: 0 });
});

// ---------------------------------------------------------------- mouse and controller unchanged

// The action streams below were written before keyboard play was added.
const MOUSE_SEQUENCES = [
  ['left click', [['d', 0], ['u', 0]], ['left']],
  ['right click', [['d', 2], ['u', 2]], ['right']],
  ['Left + Right, left released first', [['d', 0], ['d', 2], ['u', 0], ['u', 2]], ['chord']],
  ['Left + Right, right released first', [['d', 2], ['d', 0], ['u', 2], ['u', 0]], ['chord']],
  ['a release without a press', [['u', 0], ['u', 2]], []],
  ['a reset mid-hold', [['d', 0], ['r'], ['u', 0]], []],
  ['a reset mid-chord', [['d', 0], ['d', 2], ['r'], ['u', 2], ['u', 0]], []],
  ['middle button ignored', [['d', 1], ['u', 1]], []],
  ['chord, then a fresh left click', [['d', 0], ['d', 2], ['u', 0], ['u', 2], ['d', 0], ['u', 0]], ['chord', 'left']],
  ['the released button re-pressed during a chord: the other release clears the toggle', [['d', 0], ['d', 2], ['u', 2], ['d', 2], ['u', 0], ['u', 2]], ['chord', 'right']],
];
// The controller: RT = button 0, LT = button 2.
const TRIGGER_SEQUENCES = [
  ['RT', [['d', 0], ['u', 0]], ['left']],
  ['LT', [['d', 2], ['u', 2]], ['right']],
  ['LT + RT, RT released first', [['d', 2], ['d', 0], ['u', 0], ['u', 2]], ['chord']],
  ['LT + RT, LT released first', [['d', 0], ['d', 2], ['u', 2], ['u', 0]], ['chord']],
];

test('the mouse buttons and the triggers give exactly the action streams they gave before', () => {
  for (const [name, seq, expected] of [...MOUSE_SEQUENCES, ...TRIGGER_SEQUENCES]) {
    const out = [];
    const m = new MouseActions((t) => out.push(t), () => true);
    for (const [op, b] of seq) {
      if (op === 'd') m.down(b); else if (op === 'u') m.up(b); else m.reset();
    }
    assert.deepEqual(out, expected, name);
  }
});

test('FlyCamera.look and lookAxes give the same pose for the same inputs as before', () => {
  const cam = new FlyCamera();
  cam.look(10, 5);
  close(cam.yaw, Math.PI + 2 * DEG, 'yaw: 0.2°/px');
  close(cam.pitch, 1 * DEG, 'pitch: 0.2°/px, + is down');
  cam.sensitivity = 2;
  cam.invertY = true;
  cam.look(-5, 10);
  close(cam.yaw, Math.PI, 'yaw back');
  close(cam.pitch, -3 * DEG, 'invert Y');
  const pad = new FlyCamera();
  pad.lookAxes(0.5, 1, 0);
  close(pad.yaw, Math.PI + 90 * DEG, '180°/s for half a second');
  pad.lookAxes(1, 0, 1);
  assert.equal(pad.pitch, Math.PI / 2, 'clamped');
  pad.lookAxes(1, 0, 0);
  assert.equal(pad.pitch, Math.PI / 2, 'no input: no change');
});

test('MouseActions is shared, not copied: one state machine for the mouse, the triggers and the keys', () => {
  const src = read('js/input.js');
  assert.equal(src.match(/class MouseActions\b/g).length, 1);
  assert.match(read('js/main.js'), /new Input\(\{[\s\S]*?\bmouse,/, 'the input carries the one MouseActions');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, a 3D board plays with the keyboard alone: arrows look, Enter reveals, \' flags, both chord', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const frames = (n = 2) => ms((k) => new Promise((r) => { const f = () => (k-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);

    await ms(() => {
      globalThis.__ms.start(5, 1, 1, 2, [0, 2]); // revealing 4 opens 4 and 3; 0, 1 and 2 stay closed
      // record what reaches the session, so a key's action is seen whatever it does to the board
      const play = globalThis.__ms.state.play;
      globalThis.__calls = [];
      for (const name of ['reveal', 'toggleFlag', 'chord']) {
        const orig = play[name].bind(play);
        play[name] = (...a) => { globalThis.__calls.push(name); return orig(...a); };
      }
      globalThis.__prevented = [];
      window.addEventListener('keydown', (e) => globalThis.__prevented.push([e.code, e.defaultPrevented]));
    });
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'ready');
    const readyKeys = await ms(() => document.querySelector('#ready .ready-keys').textContent.replace(/\s+/g, ' '));
    assert.match(readyKeys, /Arrows look · Enter reveal · ' flag · Enter\+' chord/, 'the ready card lists the keyboard keys');

    // Enter on the ready card asks for pointer lock as a click does; held into play, its release reveals nothing
    await ms(() => document.getElementById('ready-btn').focus());
    await page.keyboard.down('Enter');
    await ms(() => globalThis.__ms.forcePlay());
    await frames();
    const safe = 4;
    assert.equal(await ms((c) => globalThis.__ms.aimAt(c), safe), safe, 'a safe cube in view');
    await page.keyboard.up('Enter');
    assert.deepEqual(await ms(() => globalThis.__calls), [], 'the ready card\'s Enter does not also reveal');

    // arrows look: right turns right, up looks up; their default is prevented in play
    const pose = () => ms(() => ({ yaw: globalThis.__ms.camera.yaw, pitch: globalThis.__ms.camera.pitch }));
    const p0 = await pose();
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('ArrowUp');
    await frames(10);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    const p1 = await pose();
    assert.ok(p1.yaw > p0.yaw, 'ArrowRight turned right');
    assert.ok(p1.pitch < p0.pitch, 'ArrowUp looked up');
    await frames(3);
    assert.deepEqual(await pose(), p1, 'released: the camera stops');
    const prevented = Object.fromEntries(await ms(() => globalThis.__prevented));
    assert.equal(prevented.ArrowRight, true, 'no page scroll');

    // Enter reveals, ' flags, both together chord — on the aimed cube
    await ms((c) => globalThis.__ms.aimAt(c), safe);
    await page.keyboard.down('Enter');
    assert.deepEqual(await ms(() => globalThis.__calls), [], 'nothing on the press');
    await page.keyboard.up('Enter');
    assert.deepEqual(await ms(() => globalThis.__calls), ['reveal']);
    assert.equal(await ms((c) => globalThis.__ms.game.pressed[c], safe), 1, 'the aimed cube is revealed');
    const closed = 1;
    assert.equal(await ms((c) => globalThis.__ms.aimAt(c), closed), closed, 'a closed cube in view');
    await page.keyboard.press('Quote');
    assert.deepEqual(await ms(() => globalThis.__calls), ['reveal', 'toggleFlag']);
    assert.equal(await ms((c) => globalThis.__ms.game.flagged[c], closed), 1, 'flagged');
    await page.keyboard.down('Quote');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await page.keyboard.up('Quote');
    assert.deepEqual(await ms(() => globalThis.__calls), ['reveal', 'toggleFlag', 'chord'], 'one chord, the second release only clears it');

    // the mouse still acts through the same state machine
    await ms(() => { globalThis.__ms.mouseDown(2); globalThis.__ms.mouseUp(2); });
    assert.deepEqual(await ms(() => globalThis.__calls), ['reveal', 'toggleFlag', 'chord', 'toggleFlag']);
    assert.equal(await ms((c) => globalThis.__ms.game.flagged[c], closed), 0, 'a right click unflags it');

    // paused: neither the arrows nor the keys act
    await ms(() => globalThis.__ms.pause());
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    const p2 = await pose();
    await page.keyboard.down('ArrowLeft');
    await frames(5);
    await page.keyboard.up('ArrowLeft');
    assert.deepEqual(await pose(), p2, 'no keyboard look on the pause card');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
