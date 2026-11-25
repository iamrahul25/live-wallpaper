/*
 * koi-mesh.js — turns each koi into a triangle strip for the GPU.
 *
 * buildFish(f, off): samples the koi's own swum path by arc length (so the body follows its turns),
 * adds the swimming wave, applies depth perspective, and writes 2 vertices per spine sample into
 * fishData at float offset `off` (6 floats each: pos.xy, uv, lateral.xy). Also stores the projected
 * spine in f.sx/f.sy (used for ripple sources) and the centre/scaled length f.cx, f.cy, f.Ls.
 *
 * Defines: buildFish(), TMPX, TMPY
 * Uses:    NS, UA, HW, WAVEK, PERSP, TR, fishData (koi.js), A (world.js)
 */
"use strict";

// spine: sample the swum path by arc length (so the body follows its own turns), then add the stroke wave
function buildFish(f, off) {
  const L = f.L, sx = f.sx, sy = f.sy, ch = Math.cos(f.h), sh = Math.sin(f.h);
  let ax = f.x, ay = f.y, acc = 0, j = 0, dirx = -ch, diry = -sh;
  for (let k = 0; k < NS; k++) {
    const d = UA[k] * L;
    if (d <= 0) { sx[k] = f.x - ch * d; sy[k] = f.y - sh * d; continue; }
    for (;;) {
      if (j >= f.trN) { sx[k] = ax + dirx * (d - acc); sy[k] = ay + diry * (d - acc); break; }
      const idx = (f.trHead - j + TR) % TR, bx = f.trX[idx], by = f.trY[idx];
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg > 1e-7 && acc + seg >= d) { const q = (d - acc) / seg; sx[k] = ax + (bx - ax) * q; sy[k] = ay + (by - ay) * q; break; }
      if (seg > 1e-7) { acc += seg; dirx = (bx - ax) / seg; diry = (by - ay) / seg; }
      ax = bx; ay = by; j++;
    }
  }
  for (let k = 0; k < NS; k++) {
    const a = Math.max(0, k - 1), b = Math.min(NS - 1, k + 1);
    let fx = sx[a] - sx[b], fy = sy[a] - sy[b];
    const n = Math.hypot(fx, fy) || 1; fx /= n; fy /= n;
    const u = UA[k], env = .10 + .9 * u * u;
    const o = f.amp * env * Math.sin(f.phase - WAVEK * u) * L;
    TMPX[k] = sx[k] - fy * o; TMPY[k] = sy[k] + fx * o;
  }
  const sd = PERSP / (PERSP + f.z), cx = A * .5, cy = .5;
  let p = off;
  for (let k = 0; k < NS; k++) {
    const a = Math.max(0, k - 1), b = Math.min(NS - 1, k + 1);
    let fx = TMPX[a] - TMPX[b], fy = TMPY[a] - TMPY[b];
    const n = Math.hypot(fx, fy) || 1; fx /= n; fy /= n;
    const lx = -fy, ly = fx, hw = HW[k] * L * sd;
    const px = cx + (TMPX[k] - cx) * sd, py = cy + (TMPY[k] - cy) * sd;
    sx[k] = px; sy[k] = py;
    fishData[p++] = px - lx * hw; fishData[p++] = py - ly * hw; fishData[p++] = UA[k]; fishData[p++] = -HW[k]; fishData[p++] = lx; fishData[p++] = ly;
    fishData[p++] = px + lx * hw; fishData[p++] = py + ly * hw; fishData[p++] = UA[k]; fishData[p++] = HW[k]; fishData[p++] = lx; fishData[p++] = ly;
  }
  f.cx = sx[NS >> 1]; f.cy = sy[NS >> 1]; f.Ls = L * sd;
}
const TMPX = new Float32Array(NS), TMPY = new Float32Array(NS);
