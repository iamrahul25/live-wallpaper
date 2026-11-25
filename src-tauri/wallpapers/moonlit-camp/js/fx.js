/*
 * fx.js — the two pixel layers every effect draws into, one art cell per pixel.
 *
 *   FX    normal layer (straight alpha). put() blends a colour over what is already there.
 *         Used for solid things: leaves, the float, fish, bats, cloud wisps, smoke, rain.
 *   GLOW  additive light layer. glow() adds light. Used for fireflies, embers, ripples, stars.
 *
 * Both are uploaded as textures each frame. The shader puts FX over the painting, then adds GLOW.
 * Positions are rounded to whole cells, so everything stays on the painting's pixel grid.
 *
 * Defines: FX, GLOW, bayer(x, y), fxClear(), put(), glow(), glowDot(), line(), sprite()
 * Uses:    W, H (world.js)
 */
"use strict";

const FX = new Uint8ClampedArray(W * H * 4);
const GLOW = new Uint8ClampedArray(W * H * 4);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

function fxClear() { FX.fill(0); GLOW.fill(0); }

function put(x, y, c, a) {
  x = Math.round(x); y = Math.round(y);
  if (a <= 0.004 || x < 0 || y < 0 || x >= W || y >= H) return;
  if (a > 1) a = 1;
  const i = (y * W + x) * 4, da = FX[i + 3] / 255, oa = a + da * (1 - a), k = a / oa, j = 1 - k;
  FX[i] = c[0] * k + FX[i] * j;
  FX[i + 1] = c[1] * k + FX[i + 1] * j;
  FX[i + 2] = c[2] * k + FX[i + 2] * j;
  FX[i + 3] = oa * 255;
}

function glow(x, y, c, k) {
  x = Math.round(x); y = Math.round(y);
  if (k <= 0.004 || x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  GLOW[i] += c[0] * k; GLOW[i + 1] += c[1] * k; GLOW[i + 2] += c[2] * k;
}

// A bright cell with a soft plus-shaped halo (and corners when very bright).
function glowDot(x, y, core, halo, k) {
  x = Math.round(x); y = Math.round(y);
  glow(x, y, core, k);
  const h = k * 0.32;
  glow(x - 1, y, halo, h); glow(x + 1, y, halo, h); glow(x, y - 1, halo, h); glow(x, y + 1, halo, h);
  if (k > 0.7) { const d = k * 0.1; glow(x - 1, y - 1, halo, d); glow(x + 1, y - 1, halo, d); glow(x - 1, y + 1, halo, d); glow(x + 1, y + 1, halo, d); }
}

function line(x0, y0, x1, y1, fn) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for (let n = 0; n < 512; n++) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 >= dy) { e += dy; x0 += sx; }
    if (e2 <= dx) { e += dx; y0 += sy; }
  }
}

// rows: strings where "1".."9" index into pal and anything else is empty.
function sprite(rows, pal, x, y, a, flip) {
  x = Math.round(x); y = Math.round(y);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r], n = row.length;
    for (let i = 0; i < n; i++) {
      const d = row.charCodeAt(flip ? n - 1 - i : i) - 48;
      if (d >= 1 && d <= 9 && pal[d]) put(x + i, y + r, pal[d], a);
    }
  }
}
