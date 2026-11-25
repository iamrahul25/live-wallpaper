/*
 * fire.js — the campfire's light, embers and smoke, and the tent's glow.
 *
 * The flame itself is drawn by the shader (gl.js) from fire.flame; its warm light on the boy, the
 * grass, the rocks and the water flickers with fire.light. Both are sampled at 14 Hz, so the
 * flicker steps like hand-drawn animation frames instead of sliding smoothly.
 *
 * Defines: fire, tent, fireStep(dt), fireDraw(), fireFlare(), tentPulse()
 * Uses:    time, wind, rainAmt, rnd helpers (world.js), put/glow/bayer (fx.js)
 */
"use strict";

const fire = { light: 1, flame: 1, flash: 0, hold: 0, emberAcc: 0, smokeAcc: 0, embers: [], smoke: [] };
const tent = { light: 1, flash: 0 };
const EMBER_COLS = [[255, 236, 150], [255, 168, 60], [236, 84, 30], [130, 34, 20]];
const SMOKE_COL = [66, 68, 88];

function spawnEmber(burst) {
  fire.embers.push(burst
    ? { x: POS.fire.x + rand(-3, 3), y: POS.fire.y + rand(-3, 1), vx: rand(-10, 10), vy: -rand(16, 34),
        age: 0, life: rand(1, 2.6), id: rnd() * 1000, big: chance(0.35) }
    : { x: POS.fire.x + rand(-2.5, 2.5), y: POS.fire.y + rand(-2, 2), vx: rand(-1.6, 1.6), vy: -rand(7, 14),
        age: 0, life: rand(0.8, 2.3), id: rnd() * 1000, big: false });
}

function spawnSmoke(big) {
  fire.smoke.push({ x: POS.fire.x + rand(-1, 1), y: POS.fire.y - 6, vx: rand(-0.3, 0.3), vy: -rand(2.6, 3.6),
    r: big ? 1.8 : 1, age: 0, life: rand(4.5, 7), a: big ? 0.3 : 0.2 });
}

function fireStep(dt) {
  fire.flash = Math.max(0, fire.flash - dt * 0.8);
  tent.flash = Math.max(0, tent.flash - dt * 0.9);
  fire.hold -= dt;
  if (fire.hold <= 0) {
    fire.hold = 1 / 14;
    const n = (vnoise(time * 2.1) - 0.5) * 0.22 + (vnoise(time * 6.7 + 17) - 0.5) * 0.12;
    fire.light = 1 + n + fire.flash * 0.6 - rainAmt * 0.08;
    fire.flame = 1 + (vnoise(time * 1.7 + 5) - 0.5) * 0.3 + fire.flash * 0.55 - rainAmt * 0.12;
    tent.light = 1 + (vnoise(time * 0.9 + 40) - 0.5) * 0.16 + (vnoise(time * 4.3 + 9) - 0.5) * 0.05 + tent.flash * 0.55;
  }

  fire.emberAcc += dt * (4.5 + fire.flash * 10) * (1 - rainAmt * 0.5);
  while (fire.emberAcc >= 1) { fire.emberAcc--; spawnEmber(false); }
  for (let i = fire.embers.length - 1; i >= 0; i--) {
    const e = fire.embers[i];
    e.age += dt;
    if (e.age >= e.life) { fire.embers.splice(i, 1); continue; }
    e.vy *= 1 - 0.9 * dt;
    e.vx += ((vnoise(time * 3 + e.id) - 0.5) * 18 + wind * 7) * dt;
    e.vx *= 1 - 0.8 * dt;
    e.x += e.vx * dt; e.y += e.vy * dt;
  }

  fire.smokeAcc += dt * 2.2;
  while (fire.smokeAcc >= 1) { fire.smokeAcc--; spawnSmoke(false); }
  for (let i = fire.smoke.length - 1; i >= 0; i--) {
    const s = fire.smoke[i];
    s.age += dt;
    if (s.age >= s.life) { fire.smoke.splice(i, 1); continue; }
    s.vx += (wind * 3.2 - s.vx) * dt * 0.6;
    s.vy *= 1 - 0.12 * dt;
    s.x += (s.vx + Math.sin(time * 0.7 + s.life * 9) * 0.6) * dt;
    s.y += s.vy * dt;
    s.r += dt * 0.75;
  }
}

function fireDraw() {
  for (const s of fire.smoke) {
    const f = s.age / s.life, a = s.a * Math.min(1, s.age * 2) * (1 - f);
    const r = s.r, x0 = Math.floor(s.x - r), x1 = Math.ceil(s.x + r), y0 = Math.floor(s.y - r), y1 = Math.ceil(s.y + r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - s.x, (y - s.y) * 1.2) / r;
        if (d > 1) continue;
        // dithered puff: denser in the middle, broken up at the edge
        if (bayer(x + (time * 2 | 0), y) > (1 - d) * 1.4) continue;
        put(x, y, SMOKE_COL, a);
      }
    }
  }
  for (const e of fire.embers) {
    const f = e.age / e.life;
    const c = EMBER_COLS[Math.min(3, Math.floor(f * 4))];
    const tw = 0.55 + 0.45 * hash1(e.id + Math.floor(time * 18));
    if (e.big && f < 0.45) glowDot(e.x, e.y, c, EMBER_COLS[1], tw);
    else glow(e.x, e.y, c, (1 - f * 0.6) * tw);
  }
}

function fireFlare() {
  fire.flash = 1;
  for (let i = 0; i < 38; i++) spawnEmber(true);
  spawnSmoke(true); spawnSmoke(true);
}

function tentPulse() {
  tent.flash = 1;
  for (const f of flies) if (inBox([300, 80, 418, 170], f.x, f.y)) f.kick = 1;
}
