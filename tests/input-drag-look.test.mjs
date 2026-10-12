import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DragLook, DRAG_LOOK_THRESHOLD_PX, MouseActions, FlyCamera } from '../js/input.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

/** A drag-to-look gesture over real MouseActions, the look deltas and the fired actions recorded. */
function setup({ selection = true, threshold } = {}) {
  const actions = [];
  const looks = [];
  const mouse = new MouseActions((type) => actions.push(type), () => selection);
  const drag = new DragLook({ mouse, onLook: (dx, dy) => looks.push([dx, dy]), ...(threshold ? { threshold } : {}) });
  return { drag, mouse, actions, looks };
}

test('the drag threshold is a few pixels', () => {
  assert.ok(DRAG_LOOK_THRESHOLD_PX >= 3 && DRAG_LOOK_THRESHOLD_PX <= 10, `${DRAG_LOOK_THRESHOLD_PX} px`);
});

test('a press released before the threshold acts as a locked press and release does', () => {
  const { drag, actions, looks } = setup();
  drag.down(0);
  drag.move(2, 1);
  drag.up(0);
  assert.deepEqual(actions, ['left']);
  drag.down(2);
  drag.up(2);
  assert.deepEqual(actions, ['left', 'right']);
  assert.deepEqual(looks, [], 'movement under the threshold turns nothing');
});

test('both buttons chord on release, as in locked play', () => {
  const { drag, actions } = setup();
  drag.down(0);
  drag.down(2);
  drag.up(0);
  drag.up(2);
  assert.deepEqual(actions, ['chord']);
});

test('moving with a button held past the threshold turns the camera, and the release acts on nothing', () => {
  const { drag, actions, looks } = setup({ threshold: 5 });
  drag.down(0);
  drag.move(3, 0);
  assert.deepEqual(looks, [], 'still under the threshold');
  drag.move(3, 0);
  assert.deepEqual(looks, [[6, 0]], 'the movement made so far turns the camera once past the threshold');
  drag.move(-4, 7);
  assert.deepEqual(looks.at(-1), [-4, 7], 'then every movement turns it');
  drag.up(0);
  assert.deepEqual(actions, [], 'drag-to-cancel: the release reveals nothing');
});

test('a drag cancels a chord, and a button pressed during the drag acts on nothing either', () => {
  const { drag, actions } = setup({ threshold: 5 });
  drag.down(0);
  drag.down(2);
  drag.move(0, 10);
  drag.up(2);
  drag.up(0);
  assert.deepEqual(actions, [], 'the chord is cancelled');
  drag.down(0);
  drag.move(10, 0);
  drag.down(2);
  drag.up(2);
  drag.up(0);
  assert.deepEqual(actions, [], 'a press made while dragging is part of the drag');
  drag.down(0);
  drag.up(0);
  assert.deepEqual(actions, ['left'], 'the next gesture starts clean');
});

test('movement with no button held turns nothing', () => {
  const { drag, looks } = setup();
  drag.move(50, 50);
  assert.deepEqual(looks, []);
});

test('reset drops a gesture in progress without acting', () => {
  const { drag, actions, looks } = setup({ threshold: 5 });
  drag.down(0);
  drag.reset();
  drag.up(0);
  assert.deepEqual(actions, [], 'reset forgets the held button');
  drag.down(0);
  drag.move(10, 0);
  drag.reset();
  drag.down(0);
  drag.up(0);
  assert.deepEqual(actions, ['left'], 'a reset ends the drag');
  assert.equal(looks.length, 1);
});

test('drag-to-look turns the camera with the look sensitivity and invert Y', () => {
  const plain = new FlyCamera();
  const inverted = new FlyCamera();
  inverted.sensitivity = 2;
  inverted.invertY = true;
  for (const cam of [plain, inverted]) {
    const mouse = new MouseActions(() => {}, () => false);
    const drag = new DragLook({ mouse, onLook: (dx, dy) => cam.look(dx, dy) });
    drag.down(0);
    drag.move(20, 10);
    drag.up(0);
  }
  assert.ok(plain.pitch > 0 && inverted.pitch < 0, 'invert Y flips the pitch');
  assert.ok(Math.abs(Math.abs(inverted.yaw - Math.PI) - 2 * Math.abs(plain.yaw - Math.PI)) < 1e-9, 'sensitivity scales the turn');
});

test('a lock request reports its failure once, whichever of its two signals comes first', () => {
  const src = read('js/input.js');
  assert.match(src, /addEventListener\('pointerlockerror', \(\) => this\._lockFailed\(\)\)/);
  assert.match(src, /r\.catch\(\(\) => this\._lockFailed\(\)\)/);
  assert.match(src, /_lockFailed\(\) \{\s*if \(!this\._lockPending\) return;\s*this\._lockPending = false;\s*this\.o\.onLockError\?\.\(\);/);
});

test('the input handlers use the gesture while drag-to-look is on and the pointer is not locked', () => {
  const src = read('js/input.js');
  assert.match(src, /this\.drag = new DragLook\(/, 'Input owns a drag-to-look gesture');
  assert.match(src, /isDragLook/, 'the shell says when drag-to-look play is on');
  assert.match(src, /this\.drag\.down\(/);
  assert.match(src, /this\.drag\.move\(/);
  assert.match(src, /this\.drag\.up\(/);
});
