// Board renderer: all cubes are drawn by two instanced meshes sharing one cube geometry.
//  - opaque pass: every drawable cell, shader keeps only the ones whose alpha is 1
//  - transparent pass: cells that may be faded (Shift / Space), sorted back-to-front,
//    shader keeps only the ones whose alpha is < 1
// Per-cell state lives in a small RGBA8 data texture (layer, kind) fetched by cell index, so
// selection / Shift / Space changes only touch uniforms (no per-frame O(n) JS work).
import * as THREE from 'three';
import { createTileTexture, L_CLOSED, L_FLAG, L_MINE, L_MINE_EXPLODED, L_NUM0 } from './textures.js';

// kinds (stored in the state texture's G channel)
export const K_CLOSED = 0, K_FLAG = 1, K_NUMBER = 2, K_MINE = 3, K_HIDDEN = 4;

const STATE_W = 1024;

// Cube geometry exactly as Cube.cs (corners of [-3,1]^3, shifted by +1 so the cube is centred).
function createCubeGeometry() {
  const C = {
    TLF: [-3, 1, -3], BLF: [-3, -3, -3], TRF: [1, 1, -3], BRF: [1, -3, -3],
    TLB: [-3, 1, 1], TRB: [1, 1, 1], BLB: [-3, -3, 1], BRB: [1, -3, 1],
  };
  const T = { tTL: [1, 0], tTR: [0, 0], tBL: [1, 1], tBR: [0, 1] };
  const faces = [
    // Front z=-3
    ['TLF', 'tTL', 'BLF', 'tBL', 'TRF', 'tTR'], ['BLF', 'tBL', 'BRF', 'tBR', 'TRF', 'tTR'],
    // Back z=1
    ['TLB', 'tTR', 'TRB', 'tTL', 'BLB', 'tBR'], ['BLB', 'tBR', 'TRB', 'tTL', 'BRB', 'tBL'],
    // Top y=1
    ['TLF', 'tBL', 'TRB', 'tTR', 'TLB', 'tTL'], ['TLF', 'tBL', 'TRF', 'tBR', 'TRB', 'tTR'],
    // Bottom y=-3
    ['BLF', 'tTL', 'BLB', 'tBL', 'BRB', 'tBR'], ['BLF', 'tTL', 'BRB', 'tBR', 'BRF', 'tTR'],
    // Left x=-3
    ['TLF', 'tTR', 'BLB', 'tBL', 'BLF', 'tBR'], ['TLB', 'tTL', 'BLB', 'tBL', 'TLF', 'tTR'],
    // Right x=1
    ['TRF', 'tTL', 'BRF', 'tBL', 'BRB', 'tBR'], ['TRB', 'tTR', 'TRF', 'tTL', 'BRB', 'tBR'],
  ];
  const pos = [], uv = [];
  for (const f of faces) {
    // XNA culled counter-clockwise faces (front faces are clockwise); three.js front faces are
    // counter-clockwise, so emit each triangle as (v0, v2, v1).
    for (const t of [0, 2, 1]) {
      const p = C[f[t * 2]], q = T[f[t * 2 + 1]];
      pos.push(p[0] + 1, p[1] + 1, p[2] + 1);
      uv.push(q[0], q[1]); // v = 0 is the top of the image (texture rows are top-first)
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const VERT = /* glsl */ `
precision highp float;
precision highp int;
in float aIdx;
uniform sampler2D uState;
uniform vec3 uDims;
uniform float uPitch;
uniform vec3 uSel;
uniform float uHasSel;
uniform float uShift;
uniform float uSpace;
uniform float uCtrl;
uniform float uPass;
out vec2 vUv;
flat out float vLayer;
out float vAlpha;
out float vTint;
void main() {
  int idx = int(aIdx + 0.5);
  int X = int(uDims.x + 0.5), Y = int(uDims.y + 0.5);
  int i = idx % X; int r = idx / X; int j = r % Y; int k = r / Y;
  vec4 st = texelFetch(uState, ivec2(idx % ${STATE_W}, idx / ${STATE_W}), 0);
  int layer = int(st.r * 255.0 + 0.5);
  int kind = int(st.g * 255.0 + 0.5);
  vec3 c = vec3(float(i), float(j), float(k));
  vec3 d = abs(c - uSel);
  bool sel = uHasSel > 0.5 && max(d.x, max(d.y, d.z)) < 0.5;
  bool near = uHasSel > 0.5 && max(d.x, max(d.y, d.z)) < 1.5; // includes selected
  float a = 1.0;
  bool vis = true;
  if (kind <= 1) { if (uShift > 0.5 && !near) a = 0.2; }
  else if (kind == 2) { if (uSpace > 0.5) a = 0.2; else if (uShift > 0.5 && !sel) a = 0.2; }
  else if (kind == 4) { vis = uCtrl > 0.5; }
  bool want = uPass < 0.5 ? a > 0.99 : a < 0.99;
  if (!vis || !want) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 centre = (c - (uDims - 1.0) * 0.5) * uPitch;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + centre, 1.0);
  vUv = uv;
  vLayer = float(layer);
  vAlpha = a;
  vTint = sel ? 1.0 : 0.0;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray uTiles;
in vec2 vUv;
flat in float vLayer;
in float vAlpha;
in float vTint;
out vec4 outColor;
void main() {
  vec4 col = texture(uTiles, vec3(vUv, vLayer));
  vec3 rgb = col.rgb * mix(vec3(1.0), vec3(1.0, 0.8, 0.8), vTint);
  outColor = vec4(rgb, vAlpha);
}`;

// Back-to-front order for transparent cubes.
// For equal cubes on a regular lattice, a cube A can overlap B on screen only if some ray from the
// camera passes through A's lattice cell before B's; lattice cells crossed by such a ray have
// coordinates between the camera's and B's on every axis, so A has a strictly smaller L1 distance
// (in lattice units) to the camera. Sorting by L1 distance, descending, is therefore an exact
// painter's order, and with quantized integer keys it is a single O(n) counting sort.
const SORT_BUCKETS = 1 << 16;

export class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0); // CSS gradient shows through (base RGB 200,225,255)
    this.renderer.sortObjects = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    this.camera.rotation.order = 'YXZ';

    this.tiles = createTileTexture();
    this.uniforms = {
      uState: { value: null },
      uTiles: { value: this.tiles },
      uDims: { value: new THREE.Vector3(1, 1, 1) },
      uPitch: { value: 4.4 },
      uSel: { value: new THREE.Vector3(-10, -10, -10) },
      uHasSel: { value: 0 },
      uShift: { value: 0 },
      uSpace: { value: 0 },
      uCtrl: { value: 0 },
    };
    const mk = (pass) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...this.uniforms, uPass: { value: pass } },
      transparent: pass === 1,
      depthWrite: pass === 0,
      depthTest: true,
      side: THREE.FrontSide,
    });
    this.matOpaque = mk(0);
    this.matTrans = mk(1);
    this.baseGeo = createCubeGeometry();
    this.meshOpaque = null;
    this.meshTrans = null;
    this.game = null;
    this.spacing = 1.1;
    this.toggles = { shift: false, space: false, ctrl: false };
    this.selected = -1;
    this._seenVersion = -1;
    this._sortPos = new THREE.Vector3(Infinity, 0, 0);
    this._transDirty = true;
    this.stats = { opaque: 0, trans: 0, sortMs: 0 };
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  setGame(game) {
    this.disposeGame();
    this.game = game;
    const n = game.n;
    this.n = n;
    const H = Math.ceil(n / STATE_W);
    this.stateData = new Uint8Array(STATE_W * H * 4);
    this.stateTex = new THREE.DataTexture(this.stateData, STATE_W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.stateTex.minFilter = THREE.NearestFilter;
    this.stateTex.magFilter = THREE.NearestFilter;
    this.stateTex.generateMipmaps = false;
    this.stateTex.colorSpace = THREE.NoColorSpace;
    this.uniforms.uState.value = this.stateTex;
    this.uniforms.uDims.value.set(game.X, game.Y, game.Z);
    this.kind = new Uint8Array(n);
    this.selected = -1;
    this.uniforms.uHasSel.value = 0;

    this.listOpaque = new Float32Array(n);
    this.listTrans = new Float32Array(n);
    this.attrOpaque = new THREE.InstancedBufferAttribute(this.listOpaque, 1).setUsage(THREE.DynamicDrawUsage);
    this.attrTrans = new THREE.InstancedBufferAttribute(this.listTrans, 1).setUsage(THREE.DynamicDrawUsage);
    const gO = this.baseGeo.clone(); gO.setAttribute('aIdx', this.attrOpaque); gO.instanceCount = 0;
    const gT = this.baseGeo.clone(); gT.setAttribute('aIdx', this.attrTrans); gT.instanceCount = 0;
    this.meshOpaque = new THREE.Mesh(gO, this.matOpaque);
    this.meshTrans = new THREE.Mesh(gT, this.matTrans);
    for (const m of [this.meshOpaque, this.meshTrans]) { m.frustumCulled = false; this.scene.add(m); }
    this.meshOpaque.renderOrder = 0;
    this.meshTrans.renderOrder = 1;

    // sort scratch
    this._candidates = new Uint32Array(n);
    this._keys = new Uint32Array(n);
    this._counts = new Uint32Array(SORT_BUCKETS + 8);
    this._qx = new Uint32Array(game.X); this._qy = new Uint32Array(game.Y); this._qz = new Uint32Array(game.Z);
    this._base = new Uint32Array(n); this._baseLen = 0;

    for (let i = 0; i < n; i++) this._writeCell(i);
    game.consumeDirty();
    this._seenVersion = game.version;
    this.stateTex.needsUpdate = true;
    this._rebuildOpaque();
    this._transDirty = true;
    this.setSelected(-1);
  }

  disposeGame() {
    if (this.meshOpaque) {
      this.scene.remove(this.meshOpaque); this.scene.remove(this.meshTrans);
      this.meshOpaque.geometry.dispose(); this.meshTrans.geometry.dispose();
      this.stateTex.dispose();
      this.meshOpaque = this.meshTrans = null;
    }
    this.game = null;
  }

  _writeCell(i) {
    const g = this.game;
    let kind, layer;
    if (g.flagged[i]) { kind = K_FLAG; layer = L_FLAG; }
    else if (!g.pressed[i]) { kind = K_CLOSED; layer = L_CLOSED; }
    else {
      const num = g.number[i];
      if (num < 0) { kind = K_MINE; layer = i === g.explodedIdx ? L_MINE_EXPLODED : L_MINE; }
      else if (num === 0 || g.unlinked[i]) { kind = K_HIDDEN; layer = L_NUM0 + num; }
      else { kind = K_NUMBER; layer = L_NUM0 + num; }
    }
    this.kind[i] = kind;
    const o = i * 4;
    this.stateData[o] = layer;
    this.stateData[o + 1] = kind;
  }

  /** Pull changes from the game (call once per frame; cheap when nothing changed). */
  sync() {
    const g = this.game;
    if (!g || g.version === this._seenVersion) return false;
    this._seenVersion = g.version;
    const dirty = g.consumeDirty();
    for (let t = 0; t < dirty.length; t++) this._writeCell(dirty[t]);
    if (g.explodedIdx >= 0) this._writeCell(g.explodedIdx);
    this.stateTex.needsUpdate = true;
    this._rebuildOpaque();
    this._transDirty = true;
    return true;
  }

  /**
   * Opaque instance list. The shader decides per instance whether it is opaque, so the list may
   * over-include; it is kept small when Shift/Space make most cells transparent.
   */
  _rebuildOpaque() {
    const K = this.kind, L = this.listOpaque, n = this.n;
    const { shift, space, ctrl } = this.toggles;
    if (shift) {
      // Opaque under Shift: mines, hidden cells (Ctrl) + the aimed cell's neighbourhood.
      const B = this._base;
      let c = 0;
      for (let i = 0; i < n; i++) { const kd = K[i]; if (kd === K_MINE || (kd === K_HIDDEN && ctrl)) B[c++] = i; }
      this._baseLen = c;
      this._applyShiftOpaque();
      return;
    }
    let c = 0;
    for (let i = 0; i < n; i++) {
      const kd = K[i];
      if ((kd === K_HIDDEN && !ctrl) || (kd === K_NUMBER && space)) continue;
      L[c++] = i;
    }
    this._commit(this.attrOpaque, this.meshOpaque, c);
    this.stats.opaque = c;
  }

  _applyShiftOpaque() {
    const L = this.listOpaque, B = this._base, K = this.kind, g = this.game;
    let c = this._baseLen;
    L.set(B.subarray(0, c));
    if (this.selected >= 0) {
      const [si, sj, sk] = g.coords(this.selected);
      for (let k = Math.max(0, sk - 1); k <= Math.min(g.Z - 1, sk + 1); k++)
        for (let j = Math.max(0, sj - 1); j <= Math.min(g.Y - 1, sj + 1); j++)
          for (let i = Math.max(0, si - 1); i <= Math.min(g.X - 1, si + 1); i++) {
            const idx = i + g.X * (j + g.Y * k);
            if (K[idx] <= K_NUMBER) L[c++] = idx;
          }
    }
    this._commit(this.attrOpaque, this.meshOpaque, c);
    this.stats.opaque = c;
  }

  _commit(attr, mesh, count) {
    attr.clearUpdateRanges();
    if (count > 0) attr.addUpdateRange(0, count);
    attr.needsUpdate = true;
    mesh.geometry.instanceCount = count;
    mesh.visible = count > 0;
  }

  setToggles(shift, space, ctrl) {
    const t = this.toggles;
    const changed = t.ctrl !== ctrl || t.shift !== shift || t.space !== space;
    if (t.shift !== shift || t.space !== space) this._transDirty = true;
    t.shift = shift; t.space = space; t.ctrl = ctrl;
    this.uniforms.uShift.value = shift ? 1 : 0;
    this.uniforms.uSpace.value = space ? 1 : 0;
    this.uniforms.uCtrl.value = ctrl ? 1 : 0;
    if (changed && this.game) this._rebuildOpaque();
  }

  setSpacing(s) {
    if (s !== this.spacing) { this.spacing = s; this._transDirty = true; }
    this.uniforms.uPitch.value = 4 * s;
  }

  setSelected(idx) {
    const changed = idx !== this.selected;
    this.selected = idx;
    if (idx < 0 || !this.game) this.uniforms.uHasSel.value = 0;
    else {
      const [i, j, k] = this.game.coords(idx);
      this.uniforms.uSel.value.set(i, j, k);
      this.uniforms.uHasSel.value = 1;
    }
    if (changed && this.game && this.toggles.shift) this._applyShiftOpaque();
  }

  /** Board half-extent (radius of bounding sphere) for the current spacing. */
  boardRadius() {
    const g = this.game; if (!g) return 10;
    const p = 4 * this.spacing;
    const hx = ((g.X - 1) * p) / 2 + 2, hy = ((g.Y - 1) * p) / 2 + 2, hz = ((g.Z - 1) * p) / 2 + 2;
    return Math.hypot(hx, hy, hz);
  }

  _updateTransparent() {
    const { shift, space } = this.toggles;
    const meshT = this.meshTrans;
    if (!shift && !space) {
      if (meshT.geometry.instanceCount !== 0) this._commit(this.attrTrans, meshT, 0);
      this.stats.trans = 0;
      this._transDirty = false;
      return;
    }
    const camPos = this.camera.position;
    if (!this._transDirty && camPos.distanceToSquared(this._sortPos) < 1e-6) return;
    const t0 = performance.now();
    this._sortPos.copy(camPos);
    this._transDirty = false;
    const g = this.game, K = this.kind;
    const X = g.X, Y = g.Y, Z = g.Z, p = 4 * this.spacing;
    // camera position in lattice units (cell centre = integer index)
    const cx = camPos.x / p + (X - 1) / 2, cy = camPos.y / p + (Y - 1) / 2, cz = camPos.z / p + (Z - 1) / 2;
    const axis = (N, cc) => {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < N; i++) { const d = Math.abs(i - cc); if (d < mn) mn = d; if (d > mx) mx = d; }
      return [mn, mx];
    };
    const [mnx, mxx] = axis(X, cx), [mny, mxy] = axis(Y, cy), [mnz, mxz] = axis(Z, cz);
    const range = (mxx - mnx) + (mxy - mny) + (mxz - mnz);
    const scale = range > 0 ? (SORT_BUCKETS - 8) / range : 0;
    const qx = this._qx, qy = this._qy, qz = this._qz;
    for (let i = 0; i < X; i++) qx[i] = Math.floor((Math.abs(i - cx) - mnx) * scale);
    for (let j = 0; j < Y; j++) qy[j] = Math.floor((Math.abs(j - cy) - mny) * scale);
    for (let k = 0; k < Z; k++) qz[k] = Math.floor((Math.abs(k - cz) - mnz) * scale);
    const counts = this._counts, keys = this._keys, cand = this._candidates;
    counts.fill(0);
    let c = 0, idx = 0;
    const maxKind = shift ? K_NUMBER : -1;
    for (let k = 0; k < Z; k++) {
      const kz = qz[k];
      for (let j = 0; j < Y; j++) {
        const kyz = kz + qy[j];
        for (let i = 0; i < X; i++, idx++) {
          const kd = K[idx];
          if (shift ? kd > maxKind : kd !== K_NUMBER) continue;
          const key = kyz + qx[i];
          keys[c] = key; cand[c++] = idx; counts[key]++;
        }
      }
    }
    // descending prefix sums -> farthest first
    let sum = 0;
    for (let b = counts.length - 1; b >= 0; b--) { const v = counts[b]; counts[b] = sum; sum += v; }
    const L = this.listTrans;
    for (let t = 0; t < c; t++) L[counts[keys[t]]++] = cand[t];
    this._commit(this.attrTrans, meshT, c);
    this.stats.trans = c;
    this.stats.sortMs = performance.now() - t0;
  }

  render() {
    const cam = this.camera;
    // far plane large enough for the whole board (original clipped at 300)
    const dist = cam.position.length();
    const far = Math.max(500, dist + this.boardRadius() * 1.05 + 50);
    if (Math.abs(far - cam.far) > 1) { cam.far = far; cam.updateProjectionMatrix(); }
    if (this.game) this._updateTransparent();
    this.renderer.render(this.scene, cam);
  }
}
