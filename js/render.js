// Board renderer: all cubes are drawn by two instanced meshes sharing one cube geometry.
//  - opaque pass: every drawable cell, shader keeps only the ones whose alpha is 1
//  - transparent pass: cells that may be faded (Shift / Space), sorted back-to-front,
//    shader keeps only the ones whose alpha is < 1
// Per-cell state lives in a small RGBA8 data texture (layer, kind) fetched by cell index, so
// selection / Shift / Space changes only touch uniforms (no per-frame O(n) JS work).
// Visual extras (all shader-side, driven by a few uniforms): per-face shading, distance fog toward
// the sky colour, crisp tile borders, a pulsing outline on the selected cube, and end-of-game
// ripples (win: pulse wave + unflagged mines shown as flags + confetti; loss: reveal wave from the
// exploded cell + wrong-flag tiles + camera shake). The state texture's A channel stores the cell's
// previous layer + 1 for cells whose tile changes in an end-of-game wave (0 = none).
import * as THREE from 'three';
import { createTileTexture, L_CLOSED, L_FLAG, L_MINE, L_MINE_EXPLODED, L_NUM0, L_WRONG_FLAG } from './textures.js';

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
  // Per-face shade (multiplies the tile colour): front/back, top/bottom, left/right. The front face
  // (toward -Z, the start view) stays almost full brightness so 2D boards remain crisp.
  const FACE_SHADE = [0.96, 0.9, 1.0, 0.74, 0.84, 0.84];
  const pos = [], uv = [], shadeAttr = [];
  for (let fi = 0; fi < faces.length; fi++) {
    const f = faces[fi];
    // XNA culled counter-clockwise faces (front faces are clockwise); three.js front faces are
    // counter-clockwise, so emit each triangle as (v0, v2, v1).
    for (const t of [0, 2, 1]) {
      const p = C[f[t * 2]], q = T[f[t * 2 + 1]];
      pos.push(p[0] + 1, p[1] + 1, p[2] + 1);
      uv.push(q[0], q[1]); // v = 0 is the top of the image (texture rows are top-first)
      shadeAttr.push(FACE_SHADE[fi >> 1]);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aShade', new THREE.Float32BufferAttribute(shadeAttr, 1));
  return g;
}

// Sky: vertical gradient around the specified background RGB(200,225,255) (dominant near the horizon,
// a little deeper toward the zenith, a little paler below). Also used as the fog colour.
const SKY_GLSL = /* glsl */ `
vec3 skyColor(float y) {
  vec3 hor = vec3(200.0, 225.0, 255.0) / 255.0;
  vec3 zen = vec3(158.0, 194.0, 243.0) / 255.0;
  vec3 low = vec3(222.0, 236.0, 255.0) / 255.0;
  return y > 0.0 ? mix(hor, zen, smoothstep(0.0, 1.0, y)) : mix(hor, low, smoothstep(0.0, 0.8, -y));
}`;

const VERT = /* glsl */ `
precision highp float;
precision highp int;
in float aIdx;
in float aShade;
uniform sampler2D uState;
uniform vec3 uDims;
uniform float uPitch;
uniform vec3 uSel;
uniform float uHasSel;
uniform float uShift;
uniform float uSpace;
uniform float uCtrl;
uniform float uPass;
uniform float uEff;       // 0 none, 1 win wave, 2 loss wave
uniform float uEffT;      // seconds since the wave started
uniform vec3 uEffOrigin;  // lattice coords of the wave origin
uniform float uEffDelay;  // seconds per cell of distance
out vec2 vUv;
flat out float vLayer;
out float vAlpha;
out float vTint;
out float vShade;
out float vFlash;
out float vDist;
out float vDirY;
void main() {
  int idx = int(aIdx + 0.5);
  int X = int(uDims.x + 0.5), Y = int(uDims.y + 0.5);
  int i = idx % X; int r = idx / X; int j = r % Y; int k = r / Y;
  vec4 st = texelFetch(uState, ivec2(idx % ${STATE_W}, idx / ${STATE_W}), 0);
  int layer = int(st.r * 255.0 + 0.5);
  int kind = int(st.g * 255.0 + 0.5);
  vec3 c = vec3(float(i), float(j), float(k));
  float scale = 1.0, flash = 0.0;
  bool shrinking = false;
  if (uEff > 0.5) {
    int oldL = int(st.a * 255.0 + 0.5) - 1;
    float local = uEffT - length(c - uEffOrigin) * uEffDelay;
    if (oldL >= 0 && local < 0.0) {
      // wave has not reached this cell yet: keep showing its previous (closed / flag) tile
      layer = oldL; kind = oldL == ${L_FLAG} ? 1 : 0;
    } else if (uEff > 1.5) {
      if (oldL >= 0) {
        float p = clamp(local / 0.3, 0.0, 1.0);
        if (kind == 4 && uCtrl < 0.5) { scale = 1.0 - p * p; shrinking = p < 1.0; }
        else { float q = p - 1.0; scale = 1.0 + 2.2 * q * q * q + 1.2 * q * q; scale = mix(0.55, 1.0, scale); }
        flash = 0.55 * (1.0 - p);
      } else {
        float b = exp(-pow((local - 0.1) / 0.08, 2.0));
        scale = 1.0 + 0.06 * b;
      }
    } else {
      float b = exp(-pow((local - 0.14) / 0.1, 2.0));
      scale = 1.0 + 0.2 * b;
      flash = 0.4 * b;
    }
  }
  vec3 d = abs(c - uSel);
  bool sel = uHasSel > 0.5 && max(d.x, max(d.y, d.z)) < 0.5;
  bool near = uHasSel > 0.5 && max(d.x, max(d.y, d.z)) < 1.5; // includes selected
  float a = 1.0;
  bool vis = true;
  if (kind <= 1) { if (uShift > 0.5 && !near) a = 0.2; }
  else if (kind == 2) { if (uSpace > 0.5) a = 0.2; else if (uShift > 0.5 && !sel) a = 0.2; }
  else if (kind == 4) { vis = uCtrl > 0.5 || shrinking; }
  bool want = uPass < 0.5 ? a > 0.99 : a < 0.99;
  if (!vis || !want || scale <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 centre = (c - (uDims - 1.0) * 0.5) * uPitch;
  vec4 mv = modelViewMatrix * vec4(position * scale + centre, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vLayer = float(layer);
  vAlpha = a;
  vTint = (sel && kind != 4) ? 1.0 : 0.0; // hidden cells shown with Ctrl are never tinted
  vShade = aShade;
  vFlash = flash;
  vDist = length(mv.xyz);
  vec3 world = (modelMatrix * vec4(position * scale + centre, 1.0)).xyz;
  vDirY = normalize(world - cameraPosition).y;
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2DArray;
uniform sampler2DArray uTiles;
uniform float uSelGlow;
uniform vec3 uFog; // near, far, max amount
in vec2 vUv;
flat in float vLayer;
in float vAlpha;
in float vTint;
in float vShade;
in float vFlash;
in float vDist;
in float vDirY;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec4 col = texture(uTiles, vec3(vUv, vLayer));
  vec3 rgb = col.rgb * mix(vec3(1.0), vec3(1.0, 0.8, 0.8), vTint);
  // distance to the face border (uv units) and its screen-space rate
  float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float fw = max(length(fwidth(vUv)), 1e-5);
  // crisp ~1.5px dark border at any distance (separates adjacent cubes) + soft inner falloff
  // (faded out when a tile is only a few pixels wide, so distant boards don't turn into a dark mesh)
  float line = 1.0 - smoothstep(0.0, 1.5 * fw, e);
  rgb *= 1.0 - 0.38 * line * (1.0 - smoothstep(0.04, 0.14, fw));
  rgb *= 1.0 - 0.06 * (1.0 - smoothstep(0.0, 0.06, e));
  rgb *= mix(vShade, 1.0, 0.5 * vTint);
  // selected cube: glowing outline (at least ~3px wide on screen) + faint emissive
  if (vTint > 0.5) {
    float w = max(0.06, 3.0 * fw);
    float o = 1.0 - smoothstep(w, w + 1.5 * fw, e);
    rgb = mix(rgb, vec3(1.0, 0.27, 0.42), o * (0.55 + 0.45 * uSelGlow));
    rgb += vec3(0.16, 0.06, 0.07) * uSelGlow * (1.0 - o);
  }
  rgb = mix(rgb, vec3(1.0), vFlash);
  float f = uFog.z * smoothstep(uFog.x, uFog.y, vDist) * (1.0 - 0.85 * vTint);
  rgb = mix(rgb, skyColor(vDirY), f);
  outColor = vec4(min(rgb, vec3(1.0)), vAlpha);
}`;

const SKY_VERT = /* glsl */ `
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
out vec3 vDir;
void main() {
  vec2 p = position.xy; // fullscreen triangle in NDC
  vec4 v = uInvProj * vec4(p, 1.0, 1.0);
  vDir = (uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz;
  gl_Position = vec4(p, 0.9999, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
precision highp float;
in vec3 vDir;
out vec4 outColor;
${SKY_GLSL}
void main() {
  // tiny ordered-noise dither hides 8-bit banding in the smooth gradient
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  outColor = vec4(skyColor(normalize(vDir).y) + n / 255.0, 1.0);
}`;

// Confetti: one Points draw call, motion fully in the vertex shader (ballistic + drag + flutter).
const CONF_N = 600;
const CONF_VERT = /* glsl */ `
in vec4 aSeed;
in vec3 aColor;
uniform float uT;
uniform vec3 uOrigin;
uniform float uScale;   // world size of the burst
uniform float uPx;      // pixels per world unit at distance 1
out vec3 vCol;
out float vFade;
out float vSpin;
void main() {
  float t = max(uT - aSeed.w * 0.25, 0.0);
  float th = aSeed.x * 6.2831853, ph = acos(mix(-0.2, 1.0, aSeed.y));
  vec3 dir = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
  float spd = uScale * (0.9 + 1.3 * aSeed.z);
  float k = 1.6; // drag
  float m = (1.0 - exp(-k * t)) / k;
  vec3 p = uOrigin + dir * spd * m;
  p.y -= uScale * 0.55 * t * t;
  p.x += sin(t * 5.0 + aSeed.x * 40.0) * uScale * 0.05 * t;
  p.z += cos(t * 4.0 + aSeed.y * 40.0) * uScale * 0.05 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uScale * 0.035 * uPx / max(-mv.z, 0.1), 2.0, 28.0);
  vCol = aColor;
  vFade = 1.0 - smoothstep(2.2, 3.2, uT);
  vSpin = abs(sin(t * (6.0 + 8.0 * aSeed.z) + aSeed.x * 20.0));
  if (uT < aSeed.w * 0.25) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const CONF_FRAG = /* glsl */ `
precision highp float;
in vec3 vCol;
in float vFade;
in float vSpin;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (abs(q.y) > 0.5 * max(vSpin, 0.18) || abs(q.x) > 0.32) discard; // flat ribbon flipping in the air
  outColor = vec4(vCol * (0.75 + 0.25 * vSpin), vFade);
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
    this.renderer.setClearColor(0xc8e1ff, 1); // RGB(200,225,255); the sky gradient is drawn on top
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
      uEff: { value: 0 },
      uEffT: { value: 0 },
      uEffOrigin: { value: new THREE.Vector3() },
      uEffDelay: { value: 0.05 },
      uSelGlow: { value: 0.6 },
      uFog: { value: new THREE.Vector3(1e6, 2e6, 0) },
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
    this._lastState = null;
    this._eff = null;        // { type: 'win' | 'loss', t0, dur }
    this._conf = null;       // { t0 }
    this._shake = null;      // { t0, dur, amp }
    this._selT0 = 0;
    this._selAnim = false;
    this._snap = null;       // { flagged, pressed } copied right before a reveal action
    this._wrong = null;      // Uint8Array mask of wrong flags (loss only)
    this._tmpQ = new THREE.Quaternion();
    this._tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
    this._buildSky();
    this._buildConfetti();
    this.resize();
  }

  _buildSky() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.skyUniforms = { uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } };
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      uniforms: this.skyUniforms, depthTest: false, depthWrite: false,
    });
    this.sky = new THREE.Mesh(g, m);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _buildConfetti() {
    const seed = new Float32Array(CONF_N * 4), col = new Float32Array(CONF_N * 3), pos = new Float32Array(CONF_N * 3);
    const pal = [[1, 0.25, 0.3], [1, 0.78, 0.15], [0.2, 0.75, 0.35], [0.25, 0.55, 1], [0.75, 0.35, 0.95], [1, 0.5, 0.15], [0.1, 0.8, 0.85]];
    for (let p = 0; p < CONF_N; p++) {
      for (let q = 0; q < 4; q++) seed[p * 4 + q] = Math.random();
      const c = pal[p % pal.length];
      col.set(c, p * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.confUniforms = { uT: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uScale: { value: 20 }, uPx: { value: 500 } };
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CONF_VERT, fragmentShader: CONF_FRAG,
      uniforms: this.confUniforms, transparent: true, depthWrite: false, depthTest: true,
    });
    this.confetti = new THREE.Points(g, m);
    this.confetti.frustumCulled = false;
    this.confetti.renderOrder = 5;
    this.confetti.visible = false;
    this.scene.add(this.confetti);
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
    this._lastState = game.state;
    this._eff = null; this._conf = null; this._shake = null; this._snap = null; this._wrong = null; this._effHidden = false;
    this.uniforms.uEff.value = 0;
    this.confetti.visible = false;
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
    else if (!g.pressed[i]) {
      kind = K_CLOSED;
      // visual-only: after a win, mines left unflagged are drawn with the flag tile
      layer = g.state === 'won' && g.number[i] < 0 ? L_FLAG : L_CLOSED;
    } else {
      const num = g.number[i];
      if (num < 0) { kind = K_MINE; layer = i === g.explodedIdx ? L_MINE_EXPLODED : L_MINE; }
      else if (num === 0 || g.unlinked[i]) { kind = K_HIDDEN; layer = L_NUM0 + num; }
      else { kind = K_NUMBER; layer = L_NUM0 + num; }
      // visual-only: after a loss, cells that were flagged but are not mines show a crossed flag
      if (num >= 0 && this._wrong && this._wrong[i] && g.state === 'lost') layer = L_WRONG_FLAG;
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
    const prev = this._lastState;
    this._lastState = g.state;
    if (prev === 'playing' && g.state === 'lost') this._beginLoss(dirty);
    else if (prev === 'playing' && g.state === 'won') this._beginWin();
    this._snap = null;
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
      for (let i = 0; i < n; i++) { const kd = K[i]; if (kd === K_MINE || (kd === K_HIDDEN && (ctrl || this._effHidden))) B[c++] = i; }
      this._baseLen = c;
      this._applyShiftOpaque();
      return;
    }
    let c = 0;
    for (let i = 0; i < n; i++) {
      const kd = K[i];
      if ((kd === K_HIDDEN && !ctrl && !this._effHidden) || (kd === K_NUMBER && space)) continue;
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

  /**
   * Call right before applying a reveal action (left click / chord): remembers which cells were
   * flagged / closed so a loss can show wrong flags and animate the reveal exactly. O(n) copy.
   */
  snapshotBeforeAction() {
    const g = this.game; if (!g || g.state !== 'playing') return;
    if (!this._snapBuf || this._snapBuf.flagged.length !== g.n) this._snapBuf = { flagged: new Uint8Array(g.n), pressed: new Uint8Array(g.n) };
    this._snapBuf.flagged.set(g.flagged); this._snapBuf.pressed.set(g.pressed);
    this._snap = this._snapBuf;
  }

  /** Explicitly mark wrong flags (cell indices) to draw after a loss. */
  setWrongFlags(indices) {
    const g = this.game; if (!g) return;
    if (!this._wrong) this._wrong = new Uint8Array(g.n);
    for (const i of indices) { this._wrong[i] = 1; if (g.state === 'lost') this._writeCell(i); }
    this.stateTex.needsUpdate = true;
  }

  _waveSetup(type, origin, extra = 0.6) {
    const g = this.game;
    const [oi, oj, ok] = origin;
    const maxD = Math.hypot(Math.max(oi, g.X - 1 - oi), Math.max(oj, g.Y - 1 - oj), Math.max(ok, g.Z - 1 - ok));
    const delay = Math.min(0.06, 1.1 / Math.max(1, maxD));
    this.uniforms.uEffOrigin.value.set(oi, oj, ok);
    this.uniforms.uEffDelay.value = delay;
    this.uniforms.uEffT.value = 0;
    this.uniforms.uEff.value = type === 'win' ? 1 : 2;
    this._eff = { type, t0: performance.now() / 1000, dur: maxD * delay + extra };
  }

  _clearOldLayers() { const D = this.stateData; for (let o = 3; o < D.length; o += 4) D[o] = 0; }

  _beginLoss(dirty) {
    const g = this.game, D = this.stateData, K = this.kind, N = g.number, n = this.n;
    this._clearOldLayers();
    const snap = this._snap;
    this._wrong = new Uint8Array(n);
    for (let t = 0; t < dirty.length; t++) {
      const i = dirty[t];
      let wasFlag, wasClosed;
      if (snap) { wasFlag = snap.flagged[i] === 1; wasClosed = !snap.pressed[i]; }
      else { wasFlag = K[i] === K_FLAG; wasClosed = K[i] === K_CLOSED; }
      if (wasFlag && N[i] >= 0) this._wrong[i] = 1;
      if (wasFlag || wasClosed) D[i * 4 + 3] = (wasFlag ? L_FLAG : L_CLOSED) + 1;
    }
    const ex = g.explodedIdx >= 0 ? g.explodedIdx : Math.max(0, this.selected);
    this._waveSetup('loss', g.coords(ex), 0.45);
    this._shake = { t0: performance.now() / 1000, dur: 0.5 };
    this._effHidden = true; // hidden cells shrink away during the wave -> keep them in the opaque list
  }

  _beginWin() {
    const g = this.game, D = this.stateData, n = this.n, N = g.number, P = g.pressed, F = g.flagged;
    this._clearOldLayers();
    for (let i = 0; i < n; i++) {
      if (N[i] < 0 && !P[i] && !F[i]) { D[i * 4 + 3] = L_CLOSED + 1; this._writeCell(i); }
    }
    const o = this.selected >= 0 ? g.coords(this.selected) : [(g.X - 1) / 2, (g.Y - 1) / 2, (g.Z - 1) / 2];
    this._waveSetup('win', o, 0.5);
    const p = 4 * this.spacing;
    this.confUniforms.uOrigin.value.set((o[0] - (g.X - 1) / 2) * p, (o[1] - (g.Y - 1) / 2) * p, (o[2] - (g.Z - 1) / 2) * p);
    this.confUniforms.uScale.value = Math.max(14, Math.min(this.boardRadius(), 120) * 0.9);
    this._conf = { t0: performance.now() / 1000 };
    this.confetti.visible = true;
  }

  /** True while a time-based effect (selection pulse, end-of-game wave, confetti, shake) needs frames. */
  isAnimating() {
    return this._selAnim || this._eff !== null || this._conf !== null || this._shake !== null;
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
    if (changed && idx >= 0) { this._selT0 = performance.now() / 1000; this._selAnim = true; }
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

  /** Advances time-based effects (O(1) per frame; one O(n) list rebuild when a loss wave ends). */
  _tickEffects(now) {
    // selection: a gentle pulse that settles to a steady glow a few seconds after the target changes
    const st = now - this._selT0;
    if (this._selAnim && st > 4) this._selAnim = false;
    this.uniforms.uSelGlow.value = this._selAnim ? 0.5 + 0.5 * Math.exp(-st * 0.8) * (0.5 + 0.5 * Math.cos(st * 6.5)) + 0.0 : 0.5;
    const e = this._eff;
    if (e) {
      const t = now - e.t0;
      if (t >= e.dur) {
        this._eff = null;
        this.uniforms.uEff.value = 0;
        if (this._effHidden) { this._effHidden = false; if (this.game) this._rebuildOpaque(); }
      } else this.uniforms.uEffT.value = t;
    }
    if (this._conf) {
      const t = now - this._conf.t0;
      if (t > 3.3) { this._conf = null; this.confetti.visible = false; }
      else this.confUniforms.uT.value = t;
    }
  }

  render() {
    const cam = this.camera;
    const now = performance.now() / 1000;
    this._tickEffects(now);
    // far plane large enough for the whole board (original clipped at 300)
    const dist = cam.position.length();
    const R = this.boardRadius();
    const far = Math.max(500, dist + R * 1.05 + 50);
    if (Math.abs(far - cam.far) > 1) { cam.far = far; cam.updateProjectionMatrix(); }
    // fog scaled to the board: nearest cells clear, the far side at most ~40% toward the sky colour
    this.uniforms.uFog.value.set(Math.max(0, dist - 0.25 * R) + 4, dist + R, 0.4);
    this.confUniforms.uPx.value = this.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    if (this.game) this._updateTransparent();
    // camera shake on loss: a small decaying rotation applied for this render only
    let shaken = false;
    if (this._shake) {
      const t = now - this._shake.t0;
      if (t >= this._shake.dur) this._shake = null;
      else {
        const a = 0.014 * Math.pow(1 - t / this._shake.dur, 2);
        this._tmpQ.copy(cam.quaternion);
        this._tmpE.set(Math.sin(t * 61) * a, Math.sin(t * 47 + 1.3) * a, Math.sin(t * 37 + 2.1) * a * 0.5, 'YXZ');
        cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(this._tmpE));
        cam.updateMatrixWorld(true);
        shaken = true;
      }
    }
    this.skyUniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    this.skyUniforms.uCamWorld.value.copy(cam.matrixWorld);
    this.renderer.render(this.scene, cam);
    if (shaken) { cam.quaternion.copy(this._tmpQ); cam.updateMatrixWorld(true); }
  }
}
