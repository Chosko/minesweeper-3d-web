// Crosshair picking: ray from the screen centre, nearest cube hit.
// Cell (i,j,k) cube = centre ± 2 (edge 4), centre = (i - (X-1)/2) * 4s (grid re-centred on the
// origin; identical to the original [P-3, P+1] boxes up to a constant translation).
// Uses a 3D-DDA through the lattice (pitch 4s); each lattice cell contains exactly one cube, and
// lattice cells are visited in increasing ray distance, so the first cube hit is the nearest one.

function rayBox(ox, oy, oz, idx_, idy, idz, minx, miny, minz, maxx, maxy, maxz) {
  // slab test with precomputed inverse direction; returns entry t (>= 0) or -1
  let t1 = (minx - ox) * idx_, t2 = (maxx - ox) * idx_;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (miny - oy) * idy; t2 = (maxy - oy) * idy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (minz - oz) * idz; t2 = (maxz - oz) * idz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < 0 || tmin > tmax) return -1;
  return tmin < 0 ? 0 : tmin;
}

/**
 * @param game logic Game
 * @param spacing grid spacing s
 * @param o ray origin {x,y,z}
 * @param d normalized ray direction {x,y,z}
 * @param spaceHeld exclude pressed cells
 * @returns cell index or -1
 */
export function pickCell(game, spacing, o, d, spaceHeld) {
  const X = game.X, Y = game.Y, Z = game.Z;
  const p = 4 * spacing;
  const ox = o.x, oy = o.y, oz = o.z;
  // avoid infinities for axis-aligned rays
  const dx = d.x || 1e-12, dy = d.y || 1e-12, dz = d.z || 1e-12;
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const loX = -X * p / 2, loY = -Y * p / 2, loZ = -Z * p / 2;
  const tStart = rayBox(ox, oy, oz, ix, iy, iz, loX, loY, loZ, -loX, -loY, -loZ);
  if (tStart < 0) return -1;
  const px = ox + dx * tStart, py = oy + dy * tStart, pz = oz + dz * tStart;
  let i = Math.min(X - 1, Math.max(0, Math.floor((px - loX) / p)));
  let j = Math.min(Y - 1, Math.max(0, Math.floor((py - loY) / p)));
  let k = Math.min(Z - 1, Math.max(0, Math.floor((pz - loZ) / p)));
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  let tMaxX = ((loX + (i + (sx > 0 ? 1 : 0)) * p) - ox) * ix;
  let tMaxY = ((loY + (j + (sy > 0 ? 1 : 0)) * p) - oy) * iy;
  let tMaxZ = ((loZ + (k + (sz > 0 ? 1 : 0)) * p) - oz) * iz;
  const tdX = Math.abs(p * ix), tdY = Math.abs(p * iy), tdZ = Math.abs(p * iz);
  const cx0 = -(X - 1) / 2 * p, cy0 = -(Y - 1) / 2 * p, cz0 = -(Z - 1) / 2 * p;
  const U = game.unlinked, P = game.pressed;
  const maxSteps = X + Y + Z + 3;
  for (let s = 0; s < maxSteps; s++) {
    const idx = i + X * (j + Y * k);
    if (!U[idx] && !(spaceHeld && P[idx])) {
      const cx = cx0 + i * p, cy = cy0 + j * p, cz = cz0 + k * p;
      if (rayBox(ox, oy, oz, ix, iy, iz, cx - 2, cy - 2, cz - 2, cx + 2, cy + 2, cz + 2) >= 0) return idx;
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) { i += sx; if (i < 0 || i >= X) break; tMaxX += tdX; }
    else if (tMaxY < tMaxZ) { j += sy; if (j < 0 || j >= Y) break; tMaxY += tdY; }
    else { k += sz; if (k < 0 || k >= Z) break; tMaxZ += tdZ; }
  }
  return -1;
}

/** Reference brute-force picker (used by the debug hook to cross-check the DDA). */
export function pickCellBrute(game, spacing, o, d, spaceHeld) {
  const p = 4 * spacing, X = game.X, Y = game.Y, Z = game.Z;
  const ix = 1 / (d.x || 1e-12), iy = 1 / (d.y || 1e-12), iz = 1 / (d.z || 1e-12);
  let best = -1, bestT = Infinity;
  for (let idx = 0; idx < game.n; idx++) {
    if (game.unlinked[idx] || (spaceHeld && game.pressed[idx])) continue;
    const i = idx % X, r = (idx - i) / X, j = r % Y, k = (r - j) / Y;
    const cx = (i - (X - 1) / 2) * p, cy = (j - (Y - 1) / 2) * p, cz = (k - (Z - 1) / 2) * p;
    const t = rayBox(o.x, o.y, o.z, ix, iy, iz, cx - 2, cy - 2, cz - 2, cx + 2, cy + 2, cz + 2);
    if (t >= 0 && t < bestT) { bestT = t; best = idx; }
  }
  return best;
}
