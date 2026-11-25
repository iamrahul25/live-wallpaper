/*
 * water.js — everything on the lake: ripples, splash droplets, the fishing float, jumping fish, rain.
 *
 * The lake's own shimmer (rows sliding sideways, the sparkling moon path) is in the shader (gl.js).
 * Here are the things that come and go. Ripples are flattened ellipses (the lake is seen at a low
 * angle) that break into dots as they spread, and they only light up water cells, so a ring that
 * reaches a rock disappears behind it.
 *
 * The float painted in the art is erased by the shader; bob draws a live one that bobs, nibbles and
 * gets pulled under when a fish bites.
 *
 * Defines: ripples, ripple(), splash(), bob, bobBite(), fishJump(), fishJumpSomewhere(), waterTouch(),
 *          rainAmt, waterStep(dt), waterDraw()
 * Uses:    world.js helpers, fx.js drawing, time, wind
 */
"use strict";

const ripples = [], drops = [], fishes = [], rainDrops = [];
let rippleId = 0, rainAmt = 0;
const RIPPLE_COL = [128, 166, 238], DROP_COL = [205, 226, 255], RAIN_COL = [126, 146, 205];

function ripple(x, y, str, max, speed) {
  if (ripples.length > 70) ripples.shift();
  ripples.push({ x, y, r: 0.6, str, max: max || 8, sp: speed || 6, id: rippleId++ });
}

function splash(x, y, n, power) {
  for (let i = 0; i < n; i++) {
    drops.push({ x: x + rand(-0.6, 0.6), y: y - 0.5, y0: y, vx: rand(-1, 1) * power * 7, vy: -rand(0.45, 1) * power * 16, a: rand(0.6, 1) });
  }
}

function nearestWater(x, y) {
  for (let r = 0; r < 12; r++) {
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.5;
      if (isWater(px, py)) return [Math.round(px), Math.round(py)];
    }
  }
  return null;
}

function waterTouch(x, y) {
  ripple(x, y, 1, 16, 9);
  ripple(x, y, 0.55, 9, 5);
  splash(x, y, 9, 1);
  if (chance(0.3)) after(rand(0.5, 1.2), () => fishJump(x + rand(-10, 10), y + rand(-2, 3)));
}

/* ---- fishing float ------------------------------------------------------------------------------ */

const BOB_SPRITE = ["0100", "0230", "4567", "89ab"];
const BOB_PAL = {
  1: [168, 150, 172], 2: [192, 42, 52], 3: [150, 36, 46], 4: [196, 22, 26], 5: [224, 30, 28], 6: [216, 56, 38],
  7: [150, 46, 36], 8: [210, 24, 26], 9: [216, 50, 40], a: [255, 208, 180], b: [212, 72, 66],
};
const LINE_COL = [118, 108, 140];
const bob = { st: 0, t: 0, dy: 0, next: 0, rip: 1, nib: -1, done: 0 };

function bobStart(st) { bob.st = st; bob.t = 0; bob.nib = -1; bob.done = 0; }
function bobBite() { if (bob.st !== 2) bobStart(2); }

function bobStep(dt) {
  const B = POS.bobber;
  bob.t += dt;
  if (bob.st === 0) {
    bob.dy = Math.sin(time * 1.6) > 0.55 ? 1 : 0;
    if ((bob.rip -= dt) <= 0) { ripple(B.cx, B.line, 0.45, 10, 4.5); bob.rip = rand(3.5, 6.5); }
    if ((bob.next -= dt) <= 0) bobStart(1);
  } else if (bob.st === 1) {                 // nibble: three quick dips
    const k = Math.floor(bob.t / 0.42);
    bob.dy = bob.t % 0.42 < 0.13 ? 2 : 0;
    if (k !== bob.nib && k < 3) { bob.nib = k; ripple(B.cx, B.line, 0.55, 7, 7); }
    if (bob.t > 1.3) {
      if (chance(0.45)) bobStart(2);
      else { bob.st = 0; bob.next = rand(25, 70); }
    }
  } else {                                   // bite: pulled under, then pops back up
    if (!bob.done) { bob.done = 1; ripple(B.cx, B.line, 1, 17, 9); ripple(B.cx, B.line, 0.6, 9, 5); splash(B.cx, B.line, 8, 0.8); }
    if (bob.t < 0.95) bob.dy = Math.min(6, Math.round(bob.t * 20));
    else if (bob.done === 1) {
      bob.done = 2; bob.dy = 0;
      ripple(B.cx, B.line, 0.7, 11, 6);
      if (chance(0.6)) fishJump(B.cx + rand(-9, 9), B.line + rand(1, 4), true);
    }
    if (bob.t > 1.7) { bob.st = 0; bob.next = rand(30, 80); }
  }
}

function bobDraw() {
  const B = POS.bobber, x = B.x, y = B.y + bob.dy, wl = B.line;
  line(POS.lineTop.x, POS.lineTop.y, x + 1, y - 1,(px, py) => { if (py < wl) put(px, py, LINE_COL, 0.6); });
  for (let r = 0; r < 4; r++) {
    const py = y + r, row = BOB_SPRITE[r];
    for (let i = 0; i < 4; i++) {
      const c = BOB_PAL[row[i]];
      if (!c) continue;
      if (py < wl) {
        put(x + i, py, c, 1);
        // its reflection, mirrored under the waterline, wobbling
        const ry = wl + (wl - 1 - py), fade = 0.42 - (ry - wl) * 0.12;
        if (fade > 0) put(x + i + Math.round(Math.sin(time * 3 + ry) * 0.6), ry, [c[0] * 0.6, c[1] * 0.5, c[2] * 0.7], fade);
      } else if (py < wl + 3) put(x + i, py, [70, 18, 36], 0.3);   // just under the surface
    }
  }
}

/* ---- jumping fish ------------------------------------------------------------------------------- */

const FISH_BODY = [178, 190, 214], FISH_HEAD = [222, 230, 244], FISH_BACK = [86, 100, 132];

function fishJump(x, y, big) {
  const w = nearestWater(x, y);
  if (!w) return;
  [x, y] = w;
  fishes.push({ x, y, y0: y, vx: (chance(0.5) ? -1 : 1) * rand(4.5, 8), vy: -rand(15, 20) * (big ? 1.12 : 1), len: big ? 6 : 5 });
  splash(x, y, 6, 0.7);
  ripple(x, y, 0.75, 12, 8);
}

function fishJumpSomewhere() {
  const L = POS.lake;
  for (let n = 0; n < 20; n++) {
    const x = randi(L[0], L[2]), y = randi(L[1], L[3]);
    if (isWater(x, y)) { fishJump(x, y, false); return; }
  }
}

function fishDraw(f) {
  const sp = Math.hypot(f.vx, f.vy) || 1, dx = f.vx / sp, dy = f.vy / sp;
  // "up" side of the fish, so the darker back is always on top
  let ux = dy, uy = -dx;
  if (uy > 0) { ux = -ux; uy = -uy; }
  for (let i = 0; i < f.len; i++) {
    const px = f.x - dx * i, py = f.y - dy * i;
    if (py >= f.y0 - 0.2) continue;              // still under the surface
    if (i === f.len - 1) {                       // tail fin
      put(px + ux, py + uy, FISH_BACK, 1); put(px - ux, py - uy, FISH_BACK, 1);
    } else {
      put(px, py, i === 0 ? FISH_HEAD : FISH_BODY, 1);
      if (i > 0 && i < f.len - 2) put(px + ux, py + uy, FISH_BACK, 1);
    }
  }
  glow(f.x - dx + ux, f.y - dy + uy, [200, 220, 255], 0.5);   // moonlight on its back
}

/* ---- rain --------------------------------------------------------------------------------------- */

function newDrop(anywhere) {
  return { x: rand(-30, W + 30), y: anywhere ? rand(-10, H) : rand(-14, -2), vy: rand(115, 155), ty: rand(25, H + 4), len: chance(0.5) ? 2 : 3 };
}

/* ---- step / draw -------------------------------------------------------------------------------- */

function waterStep(dt) {
  rainAmt = lerp(rainAmt, S.weather / 2, Math.min(1, dt * 0.5));
  for (let i = ripples.length - 1; i >= 0; i--) {
    const q = ripples[i];
    q.r += q.sp * dt * (1 - 0.45 * q.r / q.max);
    if (q.r >= q.max * 0.98) ripples.splice(i, 1);
  }
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vy += 50 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
    if (d.vy > 0 && d.y >= d.y0) { if (chance(0.35) && isWater(d.x, d.y0)) ripple(d.x, d.y0, 0.3, 3, 5); drops.splice(i, 1); }
  }
  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i];
    f.vy += 44 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.vy > 0 && f.y >= f.y0 + 1) { splash(f.x, f.y0, 9, 0.9); ripple(f.x, f.y0, 0.9, 14, 8); ripple(f.x, f.y0, 0.5, 7, 4); fishes.splice(i, 1); }
  }
  const want = [0, 110, 280][S.weather];
  while (rainDrops.length < want) rainDrops.push(newDrop(true));
  if (rainDrops.length > want) rainDrops.length = want;
  const vx = -16 + wind * 26;
  for (let i = 0; i < rainDrops.length; i++) {
    const d = rainDrops[i];
    d.x += vx * dt; d.y += d.vy * dt;
    if (d.y >= d.ty) {
      if (isWater(d.x, d.ty) && chance(0.4)) ripple(d.x, d.ty, 0.3, 3, 6);
      rainDrops[i] = newDrop(false);
    }
  }
  bobStep(dt);
}

function ring(q, r, a) {
  const rx = r, ry = Math.max(0.6, r * 0.3), n = Math.max(8, Math.round(rx * 4.4));
  let lx = -999, ly = -999;
  for (let k = 0; k < n; k++) {
    const t = k / n * TAU, x = Math.round(q.x + Math.cos(t) * rx), y = Math.round(q.y + Math.sin(t) * ry);
    if (x === lx && y === ly) continue;
    lx = x; ly = y;
    if (hash1(k * 7.31 + q.id * 13.7) < (r / q.max) * 0.55) continue;   // the ring breaks into dots as it spreads
    if (!isWater(x, y)) continue;
    glow(x, y, RIPPLE_COL, a * (y < q.y ? 0.65 : 1));
  }
}

function waterDraw() {
  for (const q of ripples) {
    const f = 1 - q.r / q.max, a = q.str * f * (0.65 + 0.5 * f);
    ring(q, q.r, a);
    if (q.str > 0.5 && q.r > 3) ring(q, q.r * 0.55, a * 0.6);
  }
  bobDraw();
  for (const f of fishes) fishDraw(f);
  for (const d of drops) glow(d.x, d.y, DROP_COL, 0.7 * d.a);
  if (rainDrops.length) {
    const vx = -16 + wind * 26;
    for (const d of rainDrops) {
      for (let k = 0; k < d.len; k++) put(d.x - vx / d.vy * k * 1.2, d.y - k, RAIN_COL, 0.34 - k * 0.08);
    }
  }
}
