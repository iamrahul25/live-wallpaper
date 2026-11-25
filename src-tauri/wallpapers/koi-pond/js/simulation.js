/*
 * simulation.js — one time step of the world, and the ripple simulation pass.
 *
 * step(dt): advances time and sun flicker, food, every koi, ambient drips and bubbles, then runs the
 * ripple simulation at a fixed rate (simRate() steps per second, at most 6 per frame) with koi wakes,
 * tail strokes and queued `events` as wave sources.
 *
 * Defines: events (pending ripple sources {x, y, r, w, n frames}), bubbles, SRC/nSrc, addSrc(),
 *          spawnBubbles(x, y, n, z0), BUB (bubble vertex data), dropT, bubbleT,
 *          time (seconds; start from ?t=), simAcc, simRate(), step(dt), simPass()
 * Uses:    almost everything above: MAX_SRC (shaders/water.js), fish, updateFish, buildFish, stepFood,
 *          shoreBand, rnd, gl, P, T, ...
 *
 * Source budget per step: events go in first and are never lost (they wait if a step is full);
 * koi wakes fill whatever is left.
 */
"use strict";

/* ---------- ripple sources, bubbles ---------- */
let events = [], bubbles = [];
const SRC = new Float32Array(MAX_SRC * 4);   // MAX_SRC: shaders/water.js
let nSrc = 0;
// Queues one ripple source for the next simPass(). Returns false when this step is already full.
function addSrc(x, y, r, w) { if (nSrc >= MAX_SRC) return false; SRC.set([x, y, r, w], nSrc * 4); nSrc++; return true; }
function spawnBubbles(x, y, n, z0) {
  for (let i = 0; i < n && bubbles.length < 40; i++)
    bubbles.push({ x: x + (rnd() - .5) * .01, y: y + (rnd() - .5) * .01, z: z0 + i * .12, vz: .12 + .06 * rnd(), ph: rnd() * 6, s: .7 + .5 * rnd() });
}
const BUB = new Float32Array(40 * 4);

let dropT = 3, bubbleT = 5;

let time = +params.get("t") || 0, simAcc = 0;
function simRate() { return 60 * simH / 340; }

function step(dt) {
  time += dt;
  sunI = .95 + .03 * Math.sin(time * .031 + 1) + .025 * Math.sin(time * .017 + 4);
  stepFood(dt);
  for (const f of fish) updateFish(f, dt);
  // ambient life: a drip or an insect touching the water, a few bubbles from the floor
  if ((dropT -= dt) <= 0) {
    dropT = 4 + rnd() * 7;
    for (let k = 0; k < 10; k++) {
      const x = A * (.42 + .5 * rnd()), y = .08 + .84 * rnd();
      if (shoreBand(x, y) < -.03) { events.push({ x, y, r: .0045, w: -.035, n: 2 }); break; }
    }
  }
  if ((bubbleT -= dt) <= 0) {
    bubbleT = 7 + rnd() * 9;
    const x = A * (.45 + .45 * rnd()), y = .1 + .8 * rnd();
    if (shoreBand(x, y) < -.04) spawnBubbles(x, y, 3 + (rnd() * 3 | 0), 1);
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.z -= b.vz * dt;
    b.x += Math.sin(time * 3 + b.ph) * .002 * dt;
    if (b.z <= 0) { events.push({ x: b.x, y: b.y, r: .0035, w: -.02 * b.s, n: 2 }); bubbles.splice(i, 1); }
  }
  // ripple simulation at a fixed rate
  simAcc += dt * simRate();
  let n = Math.min(6, Math.floor(simAcc));
  simAcc -= Math.floor(simAcc);
  for (const f of fish) buildFish(f, 0);   // updates spine points for the sources below
  const perStep = 60 / simRate();
  for (let s = 0; s < n; s++) {
    nSrc = 0;
    // One-off events first (food splashes and landings, koi eating or sipping, drips, bubbles): they are
    // what the user clicks for. An event that doesn't fit stays queued for the next step instead of
    // being used up. (Before, koi wakes went first and with 11+ koi at the surface around the food they
    // filled every slot, so the food made no ripples and the lily pads didn't move.)
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (addSrc(e.x, e.y, e.r, e.w) && --e.n <= 0) events.splice(i, 1);
    }
    // Koi wakes and tail strokes repeat every step, so skipping one when the step is full is invisible.
    for (const f of fish) {
      if (f.z > .075) continue;
      const k = 1 - f.z / .075, k2 = k * k;
      addSrc(f.sx[5], f.sy[5], .010 + f.L * .07, -.0010 * k2 * (.35 + f.speed / f.L) * perStep);
      const tk = NS - 5;
      addSrc(f.sx[tk], f.sy[tk], .010 + f.L * .06, .00045 * k2 * Math.sin(f.phase) * (f.amp / .07) * perStep);
    }
    simPass();
  }
}

function simPass() {
  const p = P.sim;
  gl.bindFramebuffer(gl.FRAMEBUFFER, T["simF" + (1 - simI)]);
  gl.viewport(0, 0, simW, simH);
  use(p, simW, simH);
  tex(p, "uPrev", 0, T["sim" + simI]);
  tex(p, "uBed", 1, T.bedA);
  gl.uniform4fv(p.u.uSrc, SRC);
  I1(p, "uNSrc", nSrc);
  F1(p, "uDamp", Math.pow(.5, 1 / (simRate() * .9)));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  simI = 1 - simI;
}
