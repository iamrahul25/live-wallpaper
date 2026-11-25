/*
 * world.js — JS-side math helpers and the pond shape (mirrors the GLSL in shaders/common.js).
 *
 * Defines: ss (smoothstep), mulberry32 (seeded RNG), h1/noise1 (1D noise), wob,
 *          A           aspect ratio = world width; reassigned by setup.js resize()
 *          shoreBand() > 0 inside the rocky margin (same formula as the GLSL one)
 *          WL, KD      waterline height and depth scale (same as the GLSL #defines)
 *          floorDepth() water depth at a point
 *          rnd         the seeded RNG used by koi, food and ambient life (keeps runs reproducible)
 */
"use strict";

const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (h1(i) * (1 - u) + h1(i + 1) * u) * 2 - 1; }
const wob = (t, s) => Math.sin(t * 1.7 + s) * .5 + Math.sin(t * 4.3 + s * 2.1) * .3 + Math.sin(t * 9.1 + s * 3.7) * .2;
let A = 16 / 9;   // world: x in [0, A], y in [0, 1] (down), 1 unit = screen height
function shoreBand(x, y) {
  const r = x - (A - (.105 + .035 * wob(y * 3, 1) + .06 * ss(.35, 0, y) + .07 * ss(.62, 1, y)));
  const rt = ss(A * .5, A * .78, x), rb = ss(A * .42, A * .72, x);
  const t = (.055 + .03 * wob(x * 2.5, 4)) * rt - y - .1 * (1 - rt);
  const b = y - (1 - (.06 + .03 * wob(x * 2.2, 7)) * rb) - .1 * (1 - rb);
  return Math.max(r, t, b);
}
const WL = .56, KD = .55;
const floorDepth = (x, y) => Math.max(.02, (WL - (.10 + .33 * ss(-.32, .03, shoreBand(x, y)) - .05 * ss(.55 * A, 0, x))) * KD);
const rnd = mulberry32(0xC0FFEE);
