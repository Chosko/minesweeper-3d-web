// Measures a flood reveal on a 100 × 100 board through the cell motion player: the measurement
// behind MOTION_CAP (js/cell-motion.js).
//
// Usage: node dev/measure-cell-motion.mjs   (needs Playwright's Chromium; runs headless on SwiftShader)
//
// For each candidate count N, N cells start Joyful tiles' reveal at once and the page plays it frame
// by frame at 60 Hz over its whole duration, timing each frame's work in two set-ups:
//   2D  the player's valuesAt plus the 2D motion layer's drawing: per animating cell, its cached
//       tile image (MIN_TILE_SIZE, the 100 × 100 board's tile) drawn transformed — offset, scale,
//       rotation, opacity — with a lighter second draw for a brightness above 1, on a 1920 × 1080
//       layer cleared each frame;
//   3D  the player's valuesAt plus the 3D motion mesh's per-instance work: N instance matrices
//       composed from offset, rotation and scale, instance colours from brightness and opacity,
//       the buffers flagged for upload and the mesh drawn on its own (the board's 10,000 cubes are
//       drawn either way, so only the extra mesh is counted).
// Each row prints the median frame in ms for each set-up. The cap is the largest power of two
// whose heavier set-up stays within 2 ms a frame, an eighth of a 60 Hz frame.
import { loadPlaywright, serveRoot, SWIFTSHADER_ARGS } from '../tests/helpers/browser.mjs';

const COUNTS = [32, 64, 128, 256, 512, 1024, 2048, 10000];
const BUDGET_MS = 2;

const PAGE = `<!doctype html><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/vendor/three/three.module.min.js" } }</script>
<canvas id="layer" width="1920" height="1080"></canvas><canvas id="gl" width="1280" height="720"></canvas>
<script type="module">
import * as THREE from 'three';
import { createCellMotion } from '/js/cell-motion.js';
import { BOARD } from '/themes/joyful-tiles/board.js';
import { MIN_TILE_SIZE } from '/js/classic2d/tile-skin.js';

const reveal = BOARD.motion.reveal;
const FRAME = 1000 / 60;
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

const tile = new OffscreenCanvas(MIN_TILE_SIZE, MIN_TILE_SIZE);
const tctx = tile.getContext('2d');
tctx.fillStyle = '#78aaf8'; tctx.fillRect(0, 0, MIN_TILE_SIZE, MIN_TILE_SIZE);
const tileImage = tile.transferToImageBitmap();
const layer = document.getElementById('layer').getContext('2d');

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl') });
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
camera.position.set(50, 50, 120);
const scene = new THREE.Scene();

function play(n, frameWork) {
  let clock = 0;
  const player = createCellMotion({ now: () => clock, cap: Infinity });
  for (let c = 0; c < n; c++) player.start(c, 'reveal', 'closed', 'revealed', reveal);
  const times = [];
  for (; clock < reveal.duration; clock += FRAME) {
    const t0 = performance.now();
    frameWork(player.valuesAt(clock));
    times.push(performance.now() - t0);
  }
  return median(times);
}

function draw2d(values) {
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.clearRect(0, 0, 1920, 1080);
  const s = MIN_TILE_SIZE, perRow = Math.floor(1920 / s);
  for (const [cell, v] of values) {
    const cx = (cell % perRow) * s + s / 2 + v.offset.x * s, cy = Math.floor(cell / perRow) % 41 * s + s / 2 + v.offset.y * s;
    const a = (v.rotation.angle * Math.PI) / 180;
    layer.setTransform(v.scale * Math.cos(a), v.scale * Math.sin(a), -v.scale * Math.sin(a), v.scale * Math.cos(a), cx, cy);
    layer.globalAlpha = v.opacity;
    layer.drawImage(tileImage, -s / 2, -s / 2);
    if (v.brightness > 1) {
      layer.globalCompositeOperation = 'lighter';
      layer.globalAlpha = v.opacity * (v.brightness - 1);
      layer.drawImage(tileImage, -s / 2, -s / 2);
      layer.globalCompositeOperation = 'source-over';
    }
  }
  layer.globalAlpha = 1;
}

function mesh3d(n) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true }), n);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  scene.clear(); scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), ax = new THREE.Vector3(), col = new THREE.Color();
  return (values) => {
    let i = 0;
    for (const [cell, v] of values) {
      ax.set(...v.rotation.axis).normalize();
      q.setFromAxisAngle(ax, (v.rotation.angle * Math.PI) / 180);
      p.set(cell % 100 + v.offset.x, Math.floor(cell / 100) + v.offset.y, v.offset.z);
      sc.setScalar(v.scale);
      mesh.setMatrixAt(i, m.compose(p, q, sc));
      mesh.setColorAt(i, col.setScalar(Math.min(1, 0.5 * v.brightness * v.opacity)));
      i++;
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    renderer.render(scene, camera);
    renderer.getContext().finish();
  };
}

window.measure = (counts) => counts.map((n) => {
  play(n, draw2d); // warm-up
  const twoD = play(n, draw2d);
  const update = mesh3d(n);
  play(n, update);
  const threeD = play(n, update);
  return { n, twoD, threeD };
});
window.ready = true;
</script>`;

const playwright = await loadPlaywright();
if (!playwright) {
  console.error('Playwright is not installed.');
  process.exit(1);
}
const server = await serveRoot({ pages: { '/measure.html': PAGE } });
const browser = await playwright.chromium.launch({ args: SWIFTSHADER_ARGS });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  await page.goto(`http://127.0.0.1:${server.address().port}/measure.html`);
  await page.waitForFunction(() => window.ready === true);
  const rows = await page.evaluate((c) => window.measure(c), COUNTS);
  console.log('cells   2D ms/frame   3D ms/frame');
  for (const r of rows) console.log(`${String(r.n).padStart(5)}   ${r.twoD.toFixed(2).padStart(11)}   ${r.threeD.toFixed(2).padStart(11)}`);
  const fits = rows.filter((r) => Math.max(r.twoD, r.threeD) <= BUDGET_MS && Number.isInteger(Math.log2(r.n)));
  console.log(`cap: ${fits.length ? fits[fits.length - 1].n : 'none within budget'} (heavier set-up within ${BUDGET_MS} ms a frame)`);
} finally {
  await browser.close();
  server.close();
}
