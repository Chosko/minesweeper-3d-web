// Board renderer: all cubes are drawn by instanced meshes sharing one cube geometry.
//  - back pass (Shift with a cell aimed): the faded cubes outside the aimed neighbourhood, drawn before
//    the opaque pass so the neighbourhood always draws over them
//  - opaque pass: every drawable cell, shader keeps only the ones whose alpha is 1
//  - transparent pass: cells that may be faded (Shift / Space), shown as ghosts (hidden cells under
//    Ctrl, at GHOST_ALPHA) or turned to glass near the camera (FLY_THROUGH_ALPHA), sorted back-to-front,
//    shader keeps only the ones whose alpha is < 1
//  - pulse pass: the few numbers just hidden, playing their "solved" pulse (pulseEnvelope) over the rest
//  - flash pass: the cubes a flag click on a number just flagged or unflagged (flashEnvelope), drawn
//    with no depth test so a cube behind others shows through them
// Per-cell state lives in a small RGBA8 data texture (layer, kind) fetched by cell index, so
// selection / Shift / Space changes only touch uniforms (no per-frame O(n) JS work).
// A replay's Show 3BV tints each cube from a second RGBA8 data texture (setRegionTint), mixed over its
// tile by the texel's alpha; off by default.
// Visual extras (all shader-side, driven by a few uniforms): per-face shading, distance fog toward
// the sky colour, crisp tile borders, a pulsing outline on the selected cube, and end-of-game
// ripples (win: pulse wave + unflagged mines shown as flags + confetti; loss: reveal wave from the
// exploded cell + wrong-flag tiles + camera shake). The state texture's A channel stores the cell's
// previous layer + 1 for cells whose tile changes in an end-of-game wave (0 = none).
import * as THREE from 'three';
import { boxDepth, SPACE_NEAR_ALPHA, SPACE_FLOOR_ALPHA, SPACE_FALLOFF } from './readability.js';
import { createTileTexture, L_CLOSED, L_FLAG, L_MINE, L_MINE_EXPLODED, L_NUM0, L_WRONG_FLAG } from './textures.js';
import { FLY_THROUGH_DIST } from './picking.js';
import { SPACING_START } from './input.js';
import { SCHEMA } from './settings/schema.js';
import { waveStepS, WAVE_CELL_S } from './shell/mode-3d.js';

// kinds (stored in the state texture's G channel)
export const K_CLOSED = 0, K_FLAG = 1, K_NUMBER = 2, K_MINE = 3, K_HIDDEN = 4;

const STATE_W = 1024;

// Ctrl shows hidden cells (revealed zeros, hidden numbers) as ghosts at this alpha, in the transparent pass.
export const GHOST_ALPHA = 0.25;
// A GLSL float literal of a JS constant, so the shader and its tests share one source.
const glslFloat = (v) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

// Fly through glass: every cube whose centre lies within FLY_THROUGH_DIST of the camera (js/picking.js,
// where it is also unpickable) is drawn at FLY_THROUGH_ALPHA, whatever its kind and view mode (the
// lower alpha wins); past it the alpha ramps back to 1 over FLY_THROUGH_BAND, so a cube fades in.
export const FLY_THROUGH_ALPHA = 0.25;
export const FLY_THROUGH_BAND = 0.5 * 4 * SPACING_START;
/** The fly-through alpha of a cube whose centre is `dist` from the camera (the shader's flyAlpha). */
export function flyThroughAlpha(dist) {
  const f = Math.min(1, Math.max(0, (dist - FLY_THROUGH_DIST) / FLY_THROUGH_BAND));
  return FLY_THROUGH_ALPHA + (1 - FLY_THROUGH_ALPHA) * f;
}

// The "solved" pulse a number plays once the engine has hidden it: the cube brightens and grows for
// PULSE_GLOW_S (peaking at PULSE_BRIGHT toward white and PULSE_SCALE halfway), then fades out over
// PULSE_FADE_S and is gone. Visual only: the cell is hidden and unpickable from the action on.
export const PULSE_GLOW_S = 0.25;
export const PULSE_FADE_S = 0.2;
export const PULSE_SCALE = 1.15;
export const PULSE_BRIGHT = 0.45;

// The flash of the cubes a flag click on a revealed number flagged or unflagged: for FLASH_S the cube
// glows toward white up to FLASH_BRIGHT and FLASH_ALPHA halfway, over every cube in front of it, then
// it is gone. Live play only.
/** The marked start cell's pulse: how long it lasts and how many times its tint swells. */
export const MARK_PULSE_S = 0.9;
export const MARK_PULSE_COUNT = 3;
export const FLASH_S = 0.4;
export const FLASH_BRIGHT = 0.8;
export const FLASH_ALPHA = 0.85;
export const FLASH_SCALE = 1.1;

/** The flash at `t` seconds since it started: the cube's scale, brightness (0..1 toward white), alpha, and whether it is over. */
export function flashEnvelope(t) {
  const s = Math.max(0, t);
  if (s >= FLASH_S) return { scale: 1, bright: 0, alpha: 0, done: true };
  const k = Math.sin((Math.PI * s) / FLASH_S);
  return { scale: 1 + (FLASH_SCALE - 1) * k, bright: FLASH_BRIGHT * k, alpha: FLASH_ALPHA * k, done: false };
}

/** The pulse at `t` seconds since it started: the cube's scale, brightness (0..1 toward white), alpha, and whether it is over. */
export function pulseEnvelope(t) {
  const s = Math.max(0, t);
  if (s < PULSE_GLOW_S) {
    const k = Math.sin((Math.PI * s) / PULSE_GLOW_S);
    return { scale: 1 + (PULSE_SCALE - 1) * k, bright: PULSE_BRIGHT * k, alpha: 1, done: false };
  }
  const f = (s - PULSE_GLOW_S) / PULSE_FADE_S;
  if (f >= 1) return { scale: 1, bright: 0, alpha: 0, done: true };
  return { scale: 1, bright: 0, alpha: (1 - f) * (1 - f), done: false };
}

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

// Sky: vertical gradient from the horizon stop (dominant near the horizon) toward the zenith stop above
// and the nadir stop below. Also used as the fog colour. The stops are the scene palette the shell hands
// in (setScenePalette); the renderer holds no colour of its own for them.
const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uSkyNadir;
vec3 skyColor(float y) {
  return y > 0.0 ? mix(uSkyHorizon, uSkyZenith, smoothstep(0.0, 1.0, y)) : mix(uSkyHorizon, uSkyNadir, smoothstep(0.0, 0.8, -y));
}`;

const VERT = /* glsl */ `
precision highp float;
precision highp int;
in float aIdx;
in float aShade;
#if defined(PULSE) || defined(FLASH)
in vec3 aPulse; // the effect's scale, brightness and alpha (pulseEnvelope, flashEnvelope)
#endif
uniform sampler2D uState;
uniform sampler2D uRegion; // Show 3BV's per-cell tint (rgb, mix in a), while uRegionOn
uniform float uRegionOn;
uniform vec3 uDims;
uniform float uPitch;
uniform vec3 uSel;
uniform float uHasSel;
uniform vec3 uMark;      // lattice coords of the marked start cell
uniform float uHasMark;
uniform float uShift;
uniform float uSpace;
uniform float uCtrl;
uniform float uPass;
uniform float uBoxDepth;  // the camera's distance from the box's nearest face, in lattice units (boxDepth)
uniform float uPlaying;   // 1 while the game is in play: the Shift emphasis is off during the end effects
// Fly through glass (flyThroughAlpha): a cube near the camera fades
float flyAlpha(vec3 centre) {
  float f = clamp((length(centre - cameraPosition) - ${glslFloat(FLY_THROUGH_DIST)}) / ${glslFloat(FLY_THROUGH_BAND)}, 0.0, 1.0);
  return mix(${glslFloat(FLY_THROUGH_ALPHA)}, 1.0, f);
}
// Space's depth dimming (js/readability.js spaceAlpha)
float spaceAlpha(float d) {
  return ${glslFloat(SPACE_FLOOR_ALPHA)} + (${glslFloat(SPACE_NEAR_ALPHA)} - ${glslFloat(SPACE_FLOOR_ALPHA)}) * exp(-max(0.0, d) / ${glslFloat(SPACE_FALLOFF)});
}
uniform float uEff;       // 0 none, 1 win wave, 2 loss wave
uniform float uEffT;      // seconds since the wave started
uniform vec3 uEffOrigin;  // lattice coords of the wave origin
uniform float uEffDelay;  // seconds per cell of distance
out vec2 vUv;
flat out float vLayer;
out float vAlpha;
out float vTint;
out float vMark;
out float vShade;
out float vFlash;
out float vDist;
out float vDirY;
flat out vec4 vRegion;
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
#if defined(PULSE)
  kind = 2; // a hidden number playing its pulse: drawn as the number it was, under the same view modes
#elif defined(FLASH)
  // a flashing cube: drawn as its tile now, under every view mode (below)
#else
  if (uEff > 0.5) {
    int oldL = int(st.a * 255.0 + 0.5) - 1;
    float local = uEffT - length(c - uEffOrigin) * uEffDelay;
    if (oldL >= 0 && local < 0.0) {
      // wave has not reached this cell yet: keep showing its previous (closed / flag) tile
      layer = oldL; kind = oldL == ${L_FLAG} ? 1 : 0;
    } else if (uEff > 1.5) {
      if (oldL >= 0) {
        float p = clamp(local / ${glslFloat(WAVE_CELL_S)}, 0.0, 1.0);
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
#endif
  vec3 centre = (c - (uDims - 1.0) * 0.5) * uPitch;
  float depth = max(0.0, length(centre - cameraPosition) / uPitch - uBoxDepth); // lattice layers behind the box's nearest face
  vec3 d = abs(c - uSel);
  bool sel = uHasSel > 0.5 && max(d.x, max(d.y, d.z)) < 0.5;
  bool near = uHasSel > 0.5 && max(d.x, max(d.y, d.z)) < 1.5; // includes selected
  float a = 1.0;
  bool vis = true;
  if (kind <= 1) { if (uShift > 0.5 && !near) a = 0.2; }
  else if (kind == 2) { if (uSpace > 0.5) a = spaceAlpha(depth); else if (uShift > 0.5 && !sel) a = 0.2; }
  else if (kind == 4) { vis = uCtrl > 0.5 || shrinking; if (uCtrl > 0.5) a = ${GHOST_ALPHA}; }
  a = min(a, flyAlpha(centre));
#if defined(PULSE)
  scale = aPulse.x; flash = aPulse.y; a *= aPulse.z; sel = false;
  bool want = a > 0.0;
#elif defined(FLASH)
  scale = aPulse.x; flash = aPulse.y; a = aPulse.z; vis = true; sel = false;
  bool want = a > 0.0;
#else
  // Shift with a cell aimed: its neighbourhood is emphasized. The faded cubes outside it draw in a pass
  // before the opaque one (uPass 2), the neighbourhood's own transparent cubes after it (uPass 1), so
  // faded cubes in front of the neighbourhood never cover it.
  bool emphOn = uShift > 0.5 && uHasSel > 0.5 && uPlaying > 0.5;
  bool want = uPass < 0.5 ? a > 0.99 : (a < 0.99 && (uPass < 1.5 ? (!emphOn || near) : (emphOn && !near)));
#endif
  if (!vis || !want || scale <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 mv = modelViewMatrix * vec4(position * scale + centre, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vLayer = float(layer);
  vAlpha = a;
  vTint = (sel && kind != 4) ? 1.0 : 0.0; // hidden cells shown with Ctrl are never tinted
  vec3 dm = abs(c - uMark);
  vMark = (uHasMark > 0.5 && max(dm.x, max(dm.y, dm.z)) < 0.5 && kind <= 2) ? 1.0 : 0.0; // a closed or flagged cube, or Learn 3D's revealed number
  vShade = aShade;
  vRegion = uRegionOn > 0.5 ? texelFetch(uRegion, ivec2(idx % ${STATE_W}, idx / ${STATE_W}), 0) : vec4(0.0);
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
uniform float uMarkPulse; // 0..1: the mark's pulse, a first reveal off a forced start cell
uniform vec3 uFog; // near, far, max amount
in vec2 vUv;
flat in float vLayer;
in float vAlpha;
in float vTint;
in float vMark;
in float vShade;
in float vFlash;
in float vDist;
in float vDirY;
flat in vec4 vRegion;
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
  // the marked start cell a pre-generated board waits for: tinted green, its border too
  rgb = mix(rgb, vec3(0.18, 0.72, 0.36), (0.5 + 0.4 * uMarkPulse) * vMark);
  rgb = mix(rgb, vRegion.rgb, vRegion.a); // a replay's Show 3BV
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
// The ground grid, drawn with the sky so it lies behind every cube, writes no depth and is never
// picked: faint lines on a horizontal plane below the box, fading toward the sky with distance, so its
// far edge reads as a horizon line. Its ink comes from the scene palette's horizon stop (darker on a
// light sky, lighter on a dark one).
const SKY_FRAG = /* glsl */ `
precision highp float;
in vec3 vDir;
out vec4 outColor;
uniform vec4 uGround; // plane height, line step, fade distance, on (1) / off (0)
uniform vec3 uEye;
${SKY_GLSL}
vec3 groundGrid(vec3 sky, vec3 dir) {
  float dy = abs(dir.y) < 1e-6 ? -1e-6 : dir.y;
  float t = (uGround.x - uEye.y) / dy;
  float far = uGround.z;
  vec2 c = (uEye.xz + dir.xz * clamp(t, 0.0, far)) / uGround.y;
  vec2 w = fwidth(c);
  vec2 g = abs(fract(c - 0.5) - 0.5) / max(w, vec2(1e-4));
  // lines about a pixel wide, faded out where they would crowd into moire
  float line = (1.0 - min(min(g.x, g.y), 1.0)) * (1.0 - smoothstep(0.25, 0.6, max(w.x, w.y)));
  float fade = step(0.0, t) * (1.0 - smoothstep(0.55 * far, far, t)) * uGround.w;
  float lum = dot(uSkyHorizon, vec3(0.2126, 0.7152, 0.0722));
  vec3 ink = lum > 0.5 ? uSkyHorizon * 0.55 : mix(uSkyHorizon, vec3(1.0), 0.3);
  return mix(sky, ink, fade * (0.08 + 0.32 * line));
}
void main() {
  // tiny ordered-noise dither hides 8-bit banding in the smooth gradient
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  vec3 dir = normalize(vDir);
  outColor = vec4(groundGrid(skyColor(dir.y), dir) + n / 255.0, 1.0);
}`;
// The ground grid's plane lies this far (world units) below the box's bottom, at the current spacing.
const GROUND_GAP = 12;
// Its fade distance from the camera: at least this, and further out for a far camera or a big box.
const GROUND_FADE_MIN = 400;

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
    this.renderer.sortObjects = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(SCHEMA.fieldOfView.default, 1, 1, 1000); // the field of view setting's applier owns fov
    this.camera.rotation.order = 'YXZ';

    this.tiles = createTileTexture();
    this._noRegion = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    this._noRegion.needsUpdate = true;
    this.regionTex = null;
    // The sky stops, shared by the cube shader (fog) and the sky shader; black until the shell hands in a palette.
    this.skyPalette = {
      uSkyHorizon: { value: new THREE.Vector3() },
      uSkyZenith: { value: new THREE.Vector3() },
      uSkyNadir: { value: new THREE.Vector3() },
    };
    this.scenePalette = null;
    this.uniforms = {
      ...this.skyPalette,
      uState: { value: null },
      uRegion: { value: this._noRegion },
      uRegionOn: { value: 0 },
      uTiles: { value: this.tiles },
      uDims: { value: new THREE.Vector3(1, 1, 1) },
      uPitch: { value: 4.4 },
      uSel: { value: new THREE.Vector3(-10, -10, -10) },
      uHasSel: { value: 0 },
      uMark: { value: new THREE.Vector3(-10, -10, -10) },
      uHasMark: { value: 0 },
      uMarkPulse: { value: 0 },
      uShift: { value: 0 },
      uSpace: { value: 0 },
      uCtrl: { value: 0 },
      uEff: { value: 0 },
      uEffT: { value: 0 },
      uEffOrigin: { value: new THREE.Vector3() },
      uEffDelay: { value: 0.05 },
      uSelGlow: { value: 0.6 },
      uFog: { value: new THREE.Vector3(1e6, 2e6, 0) },
      uBoxDepth: { value: 0 },
      uPlaying: { value: 1 },
    };
    const mk = (pass) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { ...this.uniforms, uPass: { value: pass } },
      transparent: pass !== 0,
      depthWrite: pass === 0,
      depthTest: true,
      side: THREE.FrontSide,
    });
    this.matOpaque = mk(0);
    this.matTrans = mk(1);
    // The faded cubes outside an emphasized neighbourhood, drawn first. three.js draws every transparent
    // material after every opaque one, so this one is not marked transparent and blends by hand; the
    // canvas's own alpha stays opaque, as NormalBlending keeps it (blended like the colour, the canvas
    // would turn see-through and the page behind it would wash the scene out white).
    this.matTransBack = mk(2);
    this.matTransBack.transparent = false;
    this.matTransBack.blending = THREE.CustomBlending;
    this.matTransBack.blendSrc = THREE.SrcAlphaFactor;
    this.matTransBack.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.matTransBack.blendSrcAlpha = THREE.OneFactor;
    this.matTransBack.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    this.matPulse = mk(1);
    this.matPulse.defines = { PULSE: '' };
    this.matFlash = mk(1);
    this.matFlash.defines = { FLASH: '' };
    this.matFlash.depthTest = false; // seen through the cubes in front of it
    this.baseGeo = createCubeGeometry();
    this.meshOpaque = null;
    this.meshTrans = null;
    this.meshTransBack = null;
    // The effect meshes drawn after the board, each with its instance list and per-cube envelope.
    this._pulseFx = { mat: this.matPulse, order: 2, cap: 0, mesh: null };
    this._flashFx = { mat: this.matFlash, order: 3, cap: 0, mesh: null };
    this._pulses = new Map(); // cell index -> start (s) of its "solved" pulse
    this._flashes = new Map(); // cell index -> start (s) of its flash
    this.game = null;
    this.spacing = 1.1;
    this.toggles = { shift: false, space: false, ctrl: false };
    this.selected = -1;
    this.mark = -1;
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
    this._markPulse = null; // { t0 } while the mark pulses
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
    this.skyUniforms = {
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, ...this.skyPalette,
      uGround: { value: new THREE.Vector4(0, 1, GROUND_FADE_MIN, 0) }, uEye: { value: new THREE.Vector3() },
    };
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

  /**
   * Set the scene palette, each stop [r, g, b] 0–255: the sky gradient, the fog colour it fades toward and
   * the clear colour (the horizon). The caller requests the redraw.
   */
  setScenePalette({ horizon, zenith, nadir }) {
    this.scenePalette = { horizon: [...horizon], zenith: [...zenith], nadir: [...nadir] };
    const put = (u, [r, g, b]) => u.value.set(r / 255, g / 255, b / 255);
    put(this.skyPalette.uSkyHorizon, horizon);
    put(this.skyPalette.uSkyZenith, zenith);
    put(this.skyPalette.uSkyNadir, nadir);
    const [r, g, b] = horizon.map((v) => Math.max(0, Math.min(255, Math.round(v))));
    this.renderer.setClearColor((r << 16) | (g << 8) | b, 1);
  }

  /** Set the drawing buffer's pixel ratio and resize to it; false when it already had that ratio. */
  setPixelRatio(pr) {
    if (this.renderer.getPixelRatio() === pr) return false;
    this.renderer.setPixelRatio(pr);
    this.resize();
    return true;
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
    this.setRegionTint(null);
    this.uniforms.uDims.value.set(game.X, game.Y, game.Z);
    this.kind = new Uint8Array(n);
    this.selected = -1;
    this._lastState = game.state;
    this.uniforms.uPlaying.value = game.state === 'playing' ? 1 : 0;
    this._eff = null; this._conf = null; this._shake = null; this._snap = null; this._wrong = null; this._effHidden = false;
    this._pulses.clear();
    this._flashes.clear();
    this.uniforms.uEff.value = 0;
    this.confetti.visible = false;
    this.uniforms.uHasSel.value = 0;
    this.mark = -1;
    this.uniforms.uHasMark.value = 0;

    this.listOpaque = new Float32Array(n);
    this.listTrans = new Float32Array(n);
    this.attrOpaque = new THREE.InstancedBufferAttribute(this.listOpaque, 1).setUsage(THREE.DynamicDrawUsage);
    this.attrTrans = new THREE.InstancedBufferAttribute(this.listTrans, 1).setUsage(THREE.DynamicDrawUsage);
    const gO = this.baseGeo.clone(); gO.setAttribute('aIdx', this.attrOpaque); gO.instanceCount = 0;
    const gT = this.baseGeo.clone(); gT.setAttribute('aIdx', this.attrTrans); gT.instanceCount = 0;
    this.meshOpaque = new THREE.Mesh(gO, this.matOpaque);
    this.meshTrans = new THREE.Mesh(gT, this.matTrans);
    this.meshTransBack = new THREE.Mesh(gT, this.matTransBack); // the same sorted list; the shader picks each pass's cubes
    for (const m of [this.meshOpaque, this.meshTrans, this.meshTransBack]) { m.frustumCulled = false; this.scene.add(m); }
    this.meshTransBack.renderOrder = -1;
    this.meshOpaque.renderOrder = 0;
    this.meshTrans.renderOrder = 1;
    this._buildFx(this._pulseFx, 32);
    this._buildFx(this._flashFx, 32);

    // sort scratch
    this._candidates = new Uint32Array(n);
    this._keys = new Uint32Array(n);
    this._counts = new Uint32Array(SORT_BUCKETS + 8);
    this._qx = new Uint32Array(game.X); this._qy = new Uint32Array(game.Y); this._qz = new Uint32Array(game.Z);
    this._ex = new Float64Array(game.X); this._ey = new Float64Array(game.Y); this._ez = new Float64Array(game.Z);
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
    this.setRegionTint(null);
    if (this.meshOpaque) {
      this.scene.remove(this.meshOpaque); this.scene.remove(this.meshTrans); this.scene.remove(this.meshTransBack);
      this.meshOpaque.geometry.dispose(); this.meshTrans.geometry.dispose();
      this.stateTex.dispose();
      this.meshOpaque = this.meshTrans = this.meshTransBack = null;
    }
    for (const fx of [this._pulseFx, this._flashFx]) {
      if (fx.mesh) { this.scene.remove(fx.mesh); fx.mesh.geometry.dispose(); fx.mesh = null; fx.cap = 0; }
    }
    this._pulses.clear();
    this._flashes.clear();
    this.game = null;
  }

  /** The "solved" pulse's mesh (null without a board). */
  get meshPulse() { return this._pulseFx.mesh; }

  /** An effect mesh, drawn after the transparent pass in its order, with room for `cap` cubes. */
  _buildFx(fx, cap) {
    if (fx.mesh) { this.scene.remove(fx.mesh); fx.mesh.geometry.dispose(); }
    fx.cap = cap;
    fx.list = new Float32Array(cap);
    fx.data = new Float32Array(cap * 3);
    fx.attrIdx = new THREE.InstancedBufferAttribute(fx.list, 1).setUsage(THREE.DynamicDrawUsage);
    fx.attr = new THREE.InstancedBufferAttribute(fx.data, 3).setUsage(THREE.DynamicDrawUsage);
    const g = this.baseGeo.clone();
    g.setAttribute('aIdx', fx.attrIdx);
    g.setAttribute('aPulse', fx.attr);
    g.instanceCount = 0;
    fx.mesh = new THREE.Mesh(g, fx.mat);
    fx.mesh.frustumCulled = false;
    fx.mesh.renderOrder = fx.order;
    fx.mesh.visible = false;
    this.scene.add(fx.mesh);
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

  /**
   * Pull changes from the game (call once per frame; cheap when nothing changed). With `seek`, the changes
   * come from a replay's seek, not from play: every running pulse is dropped and none starts.
   */
  sync({ seek = false } = {}) {
    const g = this.game;
    if (!g) return false;
    if (seek) this._dropPulses();
    if (g.version === this._seenVersion) return false;
    this._seenVersion = g.version;
    const dirty = g.consumeDirty();
    const prev = this._lastState;
    this._lastState = g.state;
    this.uniforms.uPlaying.value = g.state === 'playing' ? 1 : 0;
    if (prev === 'playing' && g.state !== 'playing') this._dropFlashes(); // the end of the game
    if (prev === 'playing' && g.state === 'lost') { this._dropPulses(); this._beginLoss(dirty); }
    else if (prev === 'playing' && g.state === 'won') this._beginWin();
    else if (prev !== 'playing' && g.state === 'playing') this._endEffects(); // a replay seeking back before its end
    this._snap = null;
    // A number the player could see that this action hid starts its pulse; a cell shown again drops its own.
    const pulse = !seek && prev === 'playing' && g.state !== 'lost';
    const K = this.kind, now = performance.now() / 1000;
    for (let t = 0; t < dirty.length; t++) {
      const i = dirty[t], was = K[i];
      this._writeCell(i);
      if (K[i] !== K_HIDDEN) this._pulses.delete(i);
      else if (pulse && was === K_NUMBER) this._pulses.set(i, now);
    }
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
      // Opaque under Shift: mines, hidden cells shrinking in a loss wave + the aimed cell's neighbourhood.
      const B = this._base;
      let c = 0;
      // During an end-of-game wave, cells with an old layer may still be drawn as their old tile:
      // over-include them (the shader decides opacity per pass).
      const O = this._eff ? this.stateData : null;
      for (let i = 0; i < n; i++) {
        const kd = K[i];
        if (kd === K_MINE || (kd === K_HIDDEN && !ctrl && this._effHidden) || (O && O[i * 4 + 3] > 0 && kd > K_NUMBER)) B[c++] = i;
      }
      this._baseLen = c;
      this._applyShiftOpaque();
      return;
    }
    let c = 0;
    const O = this._eff ? this.stateData : null; // see above: old (closed / flag) tiles during a wave
    for (let i = 0; i < n; i++) {
      const kd = K[i];
      // hidden cells are opaque only while they shrink in a loss wave; under Ctrl they are ghosts (transparent pass)
      if (((kd === K_HIDDEN && !(this._effHidden && !ctrl)) || (kd === K_NUMBER && space)) && !(O && O[i * 4 + 3] > 0)) continue;
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

  /** The wrong flags a loss marked (cell indices), for setWrongFlags after the game is set again; empty without a loss. */
  wrongFlags() {
    const w = this._wrong;
    if (!w) return [];
    const out = [];
    for (let i = 0; i < w.length; i++) if (w[i]) out.push(i);
    return out;
  }

  /** Explicitly mark wrong flags (cell indices) to draw after a loss. */
  setWrongFlags(indices) {
    const g = this.game; if (!g) return;
    if (!this._wrong) this._wrong = new Uint8Array(g.n);
    for (const i of indices) { this._wrong[i] = 1; if (g.state === 'lost') this._writeCell(i); }
    this.stateTex.needsUpdate = true;
  }

  /** Starts the win or loss wave from `origin`, paced by the board's end delay (js/shell/mode-3d.js waveStepS). */
  _waveSetup(type, origin, extra = 0.6) {
    const g = this.game;
    const [oi, oj, ok] = origin;
    const maxD = Math.hypot(Math.max(oi, g.X - 1 - oi), Math.max(oj, g.Y - 1 - oj), Math.max(ok, g.Z - 1 - ok));
    const delay = waveStepS(g);
    this.uniforms.uEffOrigin.value.set(oi, oj, ok);
    this.uniforms.uEffDelay.value = delay;
    this.uniforms.uEffT.value = 0;
    this.uniforms.uEff.value = type === 'win' ? 1 : 2;
    this._eff = { type, t0: performance.now() / 1000, dur: maxD * delay + extra };
  }

  _clearOldLayers() { const D = this.stateData; for (let o = 3; o < D.length; o += 4) D[o] = 0; }

  /** Drops every running "solved" pulse at once. */
  _dropPulses() {
    this._pulses.clear();
    if (this._pulseFx.mesh) this._commitFx(this._pulseFx, 0);
  }

  /** Drops every running flash at once. */
  _dropFlashes() {
    this._flashes.clear();
    if (this._flashFx.mesh) this._commitFx(this._flashFx, 0);
  }

  _commitFx(fx, count) {
    for (const attr of [fx.attrIdx, fx.attr]) {
      attr.clearUpdateRanges();
      if (count > 0) attr.addUpdateRange(0, count * attr.itemSize);
      attr.needsUpdate = true;
    }
    fx.mesh.geometry.instanceCount = count;
    fx.mesh.visible = count > 0;
  }

  /** The squared distance from the camera to cell i's centre. */
  _camDist2(i) {
    const g = this.game, cam = this.camera.position, p = 4 * this.spacing;
    const [ci, cj, ck] = g.coords(i);
    const dx = (ci - (g.X - 1) / 2) * p - cam.x, dy = (cj - (g.Y - 1) / 2) * p - cam.y, dz = (ck - (g.Z - 1) / 2) * p - cam.z;
    return dx * dx + dy * dy + dz * dz;
  }

  /** Draws `live` ({ i, e: envelope, d: distance }) into the effect mesh back-to-front, growing it by powers of two. */
  _drawFx(fx, live) {
    if (live.length > fx.cap) this._buildFx(fx, 2 ** Math.ceil(Math.log2(live.length)));
    live.sort((a, b) => b.d - a.d); // farthest first
    const L = fx.list, D = fx.data;
    for (let c = 0; c < live.length; c++) {
      const { i, e } = live[c];
      L[c] = i; D[c * 3] = e.scale; D[c * 3 + 1] = e.bright; D[c * 3 + 2] = e.alpha;
    }
    this._commitFx(fx, live.length);
  }

  /**
   * Advances the pulses: each cube's envelope from its start, the finished ones dropped, the rest drawn
   * back-to-front. Visits the pulsing cells only.
   */
  _tickPulses(now) {
    if (this._pulses.size === 0) { if (this._pulseFx.mesh.visible) this._commitFx(this._pulseFx, 0); return; }
    const live = [];
    for (const [i, t0] of this._pulses) {
      const e = pulseEnvelope(now - t0);
      if (e.done) { this._pulses.delete(i); continue; }
      live.push({ i, e, d: this._camDist2(i) });
    }
    this._drawFx(this._pulseFx, live);
  }

  /**
   * Flashes the cubes `cells` — the ones a flag click on a revealed number just flagged or unflagged —
   * for FLASH_S, drawn over every cube in front of them. Only while the game is played; setGame and the
   * end of the game drop running flashes.
   */
  flash(cells) {
    const g = this.game;
    if (!g || g.state !== 'playing') return;
    const now = performance.now() / 1000;
    for (const i of cells) this._flashes.set(i, now);
  }

  /** Advances the flashes as _tickPulses the pulses. Visits the flashing cells only. */
  _tickFlashes(now) {
    if (this._flashes.size === 0) { if (this._flashFx.mesh.visible) this._commitFx(this._flashFx, 0); return; }
    const live = [];
    for (const [i, t0] of this._flashes) {
      const e = flashEnvelope(now - t0);
      if (e.done) { this._flashes.delete(i); continue; }
      live.push({ i, e, d: this._camDist2(i) });
    }
    this._drawFx(this._flashFx, live);
  }

  /** Drops the end-of-game wave, confetti, shake, wrong flags and any flash at once. */
  _endEffects() {
    this._dropFlashes();
    this._clearOldLayers();
    this._eff = null; this._conf = null; this._shake = null; this._wrong = null; this._effHidden = false;
    this.uniforms.uEff.value = 0;
    this.confetti.visible = false;
  }

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

  /** The marked start cell pulses: its tint swells MARK_PULSE_COUNT times over MARK_PULSE_S (a first reveal off a forced start cell). */
  pulseMark() {
    if (this.mark < 0) return false;
    this._markPulse = { t0: performance.now() / 1000 };
    return true;
  }

  /** True while a time-based effect (mark pulse, selection pulse, "solved" pulse, flash, end-of-game wave, confetti, shake) needs frames. */
  isAnimating() {
    return this._selAnim || this._markPulse !== null || this._eff !== null || this._conf !== null || this._shake !== null || this._pulses.size > 0 || this._flashes.size > 0;
  }

  setToggles(shift, space, ctrl) {
    const t = this.toggles;
    const changed = t.ctrl !== ctrl || t.shift !== shift || t.space !== space;
    if (changed) this._transDirty = true;
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

  /**
   * A replay's Show 3BV: `rgba` holds 4 bytes a cell (the tint, then how much of it covers the tile),
   * null to clear. The caller requests the redraw.
   */
  setRegionTint(rgba) {
    if (this.regionTex) { this.regionTex.dispose(); this.regionTex = null; }
    if (!rgba || !this.game) {
      this.uniforms.uRegion.value = this._noRegion;
      this.uniforms.uRegionOn.value = 0;
      return;
    }
    const H = Math.ceil(this.n / STATE_W);
    const data = new Uint8Array(STATE_W * H * 4);
    data.set(rgba.subarray(0, Math.min(rgba.length, data.length)));
    this.regionTex = new THREE.DataTexture(data, STATE_W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.regionTex.minFilter = THREE.NearestFilter;
    this.regionTex.magFilter = THREE.NearestFilter;
    this.regionTex.generateMipmaps = false;
    this.regionTex.colorSpace = THREE.NoColorSpace;
    this.regionTex.needsUpdate = true;
    this.uniforms.uRegion.value = this.regionTex;
    this.uniforms.uRegionOn.value = 1;
  }

  /** Where cell `idx`'s centre falls on the canvas, in CSS pixels, through the camera as it is; null behind it. */
  cellScreen(idx) {
    if (!this.game || !(idx >= 0 && idx < this.n)) return null;
    const [i, j, k] = this.game.coords(idx);
    const p = this.uniforms.uPitch.value, g = this.game;
    this.camera.updateMatrixWorld(true);
    const v = new THREE.Vector3((i - (g.X - 1) / 2) * p, (j - (g.Y - 1) / 2) * p, (k - (g.Z - 1) / 2) * p).project(this.camera);
    if (v.z < -1 || v.z > 1) return null;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
  }

  /**
   * Tints the cube of the marked start cell a pre-generated or forced board waits for
   * (js/mode3d/session.js markedCell), or the cell a Learn 3D prompt points at (js/mode3d/learn.js
   * `tinted`, a revealed number or a closed cube); -1 for none. Returns whether it changed, so the
   * caller draws a frame.
   */
  setMark(idx) {
    const next = this.game && Number.isInteger(idx) && idx >= 0 && idx < this.n ? idx : -1;
    if (next === this.mark) return false;
    this.mark = next;
    if (next < 0) this.uniforms.uHasMark.value = 0;
    else {
      const [i, j, k] = this.game.coords(next);
      this.uniforms.uMark.value.set(i, j, k);
      this.uniforms.uHasMark.value = 1;
    }
    return true;
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

  /**
   * The ground grid under the board: its plane GROUND_GAP below the box's bottom at the current spacing,
   * a line step of a power-of-two count of lattice pitches that grows with the box, faded out from the
   * camera at a distance that keeps the box and its surroundings on it. Off without a board.
   */
  _placeGround(dist, R) {
    const g = this.game, u = this.skyUniforms;
    u.uEye.value.copy(this.camera.position);
    if (!g) { u.uGround.value.w = 0; return; }
    const p = 4 * this.spacing;
    const bottom = ((g.Y - 1) * p) / 2 + 2;
    const cells = 2 ** Math.max(1, Math.round(Math.log2(Math.max(g.X, g.Z) / 3)));
    u.uGround.value.set(-bottom - GROUND_GAP, cells * p, Math.max(GROUND_FADE_MIN, 4 * (dist + R)), 1);
  }

  /** Board half-extent (radius of bounding sphere) for the current spacing. */
  boardRadius() {
    const g = this.game; if (!g) return 10;
    const p = 4 * this.spacing;
    const hx = ((g.X - 1) * p) / 2 + 2, hy = ((g.Y - 1) * p) / 2 + 2, hz = ((g.Z - 1) * p) / 2 + 2;
    return Math.hypot(hx, hy, hz);
  }

  /**
   * The fly-through glass on its own: the cells whose centre lies within FLY_THROUGH_DIST +
   * FLY_THROUGH_BAND of the camera, found from the lattice cells around it (never a pass over the
   * board), written to `L` back-to-front by their L1 lattice distance (the sort's painter's order).
   * Returns their count.
   */
  _nearCells(L) {
    const g = this.game, K = this.kind, X = g.X, Y = g.Y, Z = g.Z, p = 4 * this.spacing;
    const cam = this.camera.position, R = FLY_THROUGH_DIST + FLY_THROUGH_BAND, R2 = R * R, r = R / p;
    const cx = cam.x / p + (X - 1) / 2, cy = cam.y / p + (Y - 1) / 2, cz = cam.z / p + (Z - 1) / 2;
    const hidden = this.toggles.ctrl || this._effHidden; // hidden cells are drawn only then
    const near = [];
    for (let k = Math.max(0, Math.ceil(cz - r)); k <= Math.min(Z - 1, Math.floor(cz + r)); k++) {
      for (let j = Math.max(0, Math.ceil(cy - r)); j <= Math.min(Y - 1, Math.floor(cy + r)); j++) {
        for (let i = Math.max(0, Math.ceil(cx - r)); i <= Math.min(X - 1, Math.floor(cx + r)); i++) {
          if (((i - cx) ** 2 + (j - cy) ** 2 + (k - cz) ** 2) * p * p >= R2) continue;
          const idx = i + X * (j + Y * k);
          if (K[idx] === K_HIDDEN && !hidden) continue;
          near.push({ idx, d: Math.abs(i - cx) + Math.abs(j - cy) + Math.abs(k - cz) });
        }
      }
    }
    near.sort((a, b) => b.d - a.d); // farthest first
    for (let t = 0; t < near.length; t++) L[t] = near[t].idx;
    return near.length;
  }

  _updateTransparent() {
    const { shift, space, ctrl } = this.toggles;
    const meshT = this.meshTrans;
    const camPos = this.camera.position;
    if (!this._transDirty && camPos.distanceToSquared(this._sortPos) < 1e-6) return;
    const t0 = performance.now();
    this._sortPos.copy(camPos);
    this._transDirty = false;
    if (!shift && !space && !ctrl) {
      // no view mode held: only the fly-through glass around the camera is transparent
      const c = this._nearCells(this.listTrans);
      this._commit(this.attrTrans, meshT, c);
      this.stats.trans = c;
      this.stats.sortMs = performance.now() - t0;
      return;
    }
    const g = this.game, K = this.kind;
    const X = g.X, Y = g.Y, Z = g.Z, p = 4 * this.spacing;
    // camera position in lattice units (cell centre = integer index)
    const cx = camPos.x / p + (X - 1) / 2, cy = camPos.y / p + (Y - 1) / 2, cz = camPos.z / p + (Z - 1) / 2;
    // the fly-through glass: squared world distance from the camera per axis, in the sort's own pass
    const R = FLY_THROUGH_DIST + FLY_THROUGH_BAND, R2 = R * R;
    const ex = this._ex, ey = this._ey, ez = this._ez;
    for (let i = 0; i < X; i++) ex[i] = ((i - cx) * p) ** 2;
    for (let j = 0; j < Y; j++) ey[j] = ((j - cy) * p) ** 2;
    for (let k = 0; k < Z; k++) ez[k] = ((k - cz) * p) ** 2;
    const hidden = ctrl || this._effHidden;
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
    // during a wave, cells not yet reached are drawn with their old closed / flag tile (transparent under Shift)
    const O = shift && this._eff ? this.stateData : null;
    for (let k = 0; k < Z; k++) {
      const kz = qz[k], e2 = ez[k];
      for (let j = 0; j < Y; j++) {
        const kyz = kz + qy[j], e12 = e2 + ey[j];
        for (let i = 0; i < X; i++, idx++) {
          const kd = K[idx];
          // Shift: closed, flag and number cubes; Space: numbers; Ctrl: hidden cells (ghosts); any drawn cube near the camera
          if (!((shift ? kd <= K_NUMBER : space && kd === K_NUMBER) || (ctrl && kd === K_HIDDEN) || (O && O[idx * 4 + 3] > 0)
            || (e12 + ex[i] < R2 && (kd !== K_HIDDEN || hidden)))) continue;
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
    if (this._markPulse) {
      const mt = now - this._markPulse.t0;
      if (mt >= MARK_PULSE_S || this.mark < 0) this._markPulse = null;
      this.uniforms.uMarkPulse.value = this._markPulse ? Math.abs(Math.sin((mt / MARK_PULSE_S) * Math.PI * MARK_PULSE_COUNT)) : 0;
    }
    const e = this._eff;
    if (e) {
      const t = now - e.t0;
      if (t >= e.dur) {
        this._eff = null;
        this.uniforms.uEff.value = 0;
        this._effHidden = false;
        if (this.game) { this._rebuildOpaque(); this._transDirty = true; }
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
    if (this.game) { this._tickPulses(now); this._tickFlashes(now); }
    // far plane large enough for the whole board (original clipped at 300)
    const dist = cam.position.length();
    const R = this.boardRadius();
    const far = Math.max(500, dist + R * 1.05 + 50);
    if (Math.abs(far - cam.far) > 1) { cam.far = far; cam.updateProjectionMatrix(); }
    // fog scaled to the board: nearest cells clear, the far side at most ~40% toward the sky colour
    this.uniforms.uFog.value.set(Math.max(0, dist - 0.25 * R) + 4, dist + R, 0.4);
    this.confUniforms.uPx.value = this.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    if (this.game) {
      // Space's depth dimming counts from the box's nearest face (js/readability.js boxDepth)
      const g = this.game, p = 4 * this.spacing;
      this.uniforms.uBoxDepth.value = boxDepth([cam.position.x / p, cam.position.y / p, cam.position.z / p], g);
      this._updateTransparent();
    }
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
    this._placeGround(dist, R);
    this.skyUniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
    this.skyUniforms.uCamWorld.value.copy(cam.matrixWorld);
    this.renderer.render(this.scene, cam);
    if (shaken) { cam.quaternion.copy(this._tmpQ); cam.updateMatrixWorld(true); }
  }
}
